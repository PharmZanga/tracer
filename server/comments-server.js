import express from "express";
import pg from "pg";

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 10000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const validStatuses = new Set(["Open", "In progress", "Completed"]);

function isAllowedOrigin(origin) {
  return !origin
    || origin === "https://pharmzanga.github.io"
    || origin === "https://tracer-dashboard.onrender.com"
    || origin === "https://tracer-secure-dashboard.onrender.com"
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

app.use((request, response, next) => {
  const origin = request.headers.origin;
  if (isAllowedOrigin(origin)) response.setHeader("Access-Control-Allow-Origin", origin || "*");
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") return response.sendStatus(204);
  return next();
});
app.use(express.json({ limit: "16kb" }));

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS action_states (
      action_key TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'Open',
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS action_comments (
      id BIGSERIAL PRIMARY KEY,
      action_key TEXT NOT NULL,
      author TEXT NOT NULL,
      author_email TEXT,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE action_comments ADD COLUMN IF NOT EXISTS author_email TEXT;
    UPDATE action_comments SET author_email = author WHERE author_email IS NULL;
    CREATE TABLE IF NOT EXISTS action_comment_votes (
      comment_id BIGINT NOT NULL REFERENCES action_comments(id) ON DELETE CASCADE,
      voter_email TEXT NOT NULL,
      vote SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (comment_id, voter_email)
    );
    CREATE INDEX IF NOT EXISTS action_comments_action_key_idx ON action_comments (action_key, created_at);
  `);
}

async function commentWithVotes(commentId) {
  const result = await pool.query(`
    SELECT c.id, c.action_key, COALESCE(c.author_email, c.author) AS author, c.body, c.created_at,
      COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0)::int AS upvotes,
      COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0)::int AS downvotes
    FROM action_comments c
    LEFT JOIN action_comment_votes v ON v.comment_id = c.id
    WHERE c.id = $1
    GROUP BY c.id
  `, [commentId]);
  const row = result.rows[0];
  return row ? { id: row.id, actionKey: row.action_key, author: row.author, body: row.body, createdAt: row.created_at, upvotes: row.upvotes, downvotes: row.downvotes } : null;
}

app.get("/healthz", (_request, response) => response.json({ ok: true }));

app.get("/api/action-updates", async (_request, response, next) => {
  try {
    const [stateResult, commentResult] = await Promise.all([
      pool.query("SELECT action_key, status, updated_by, updated_at FROM action_states"),
      pool.query(`
        SELECT c.id, c.action_key, COALESCE(c.author_email, c.author) AS author, c.body, c.created_at,
          COALESCE(SUM(CASE WHEN v.vote = 1 THEN 1 ELSE 0 END), 0)::int AS upvotes,
          COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0)::int AS downvotes
        FROM action_comments c
        LEFT JOIN action_comment_votes v ON v.comment_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at ASC
      `),
    ]);
    const updates = Object.fromEntries(stateResult.rows.map((row) => [row.action_key, {
      status: row.status,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    }]));
    const comments = commentResult.rows.reduce((all, row) => {
      const entry = { id: row.id, author: row.author, body: row.body, createdAt: row.created_at, upvotes: row.upvotes, downvotes: row.downvotes };
      all[row.action_key] = [...(all[row.action_key] || []), entry];
      return all;
    }, {});
    response.json({ updates, comments });
  } catch (error) {
    next(error);
  }
});

app.post("/api/action-updates/:actionKey", async (request, response, next) => {
  const actionKey = cleanText(request.params.actionKey, 800);
  const status = cleanText(request.body?.status, 32);
  const author = cleanText(request.body?.author, 80) || "Unidentified user";
  if (!actionKey || !validStatuses.has(status)) return response.status(400).json({ error: "A valid action and status are required." });
  try {
    const result = await pool.query(`
      INSERT INTO action_states (action_key, status, updated_by, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (action_key) DO UPDATE SET status = EXCLUDED.status, updated_by = EXCLUDED.updated_by, updated_at = NOW()
      RETURNING status, updated_by, updated_at
    `, [actionKey, status, author]);
    const row = result.rows[0];
    response.json({ status: row.status, updatedBy: row.updated_by, updatedAt: row.updated_at });
  } catch (error) {
    next(error);
  }
});

app.post("/api/action-comments/:actionKey", async (request, response, next) => {
  const actionKey = cleanText(request.params.actionKey, 800);
  const author = cleanText(request.body?.actorEmail, 254) || cleanText(request.body?.author, 254) || "Dashboard user";
  const body = cleanText(request.body?.body, 1600);
  if (!actionKey || !body) return response.status(400).json({ error: "Action and comment are required." });
  try {
    const result = await pool.query(`
      INSERT INTO action_comments (action_key, author, author_email, body)
      VALUES ($1, $2, $2, $3)
      RETURNING id
    `, [actionKey, author, body]);
    response.status(201).json(await commentWithVotes(result.rows[0].id));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/action-comments/:commentId", async (request, response, next) => {
  const commentId = Number(request.params.commentId);
  const actorEmail = cleanText(request.body?.actorEmail, 254);
  if (!Number.isInteger(commentId) || !actorEmail) return response.status(400).json({ error: "A signed-in comment author is required." });
  try {
    const result = await pool.query("DELETE FROM action_comments WHERE id = $1 AND COALESCE(author_email, author) = $2 RETURNING id", [commentId, actorEmail]);
    if (!result.rowCount) return response.status(403).json({ error: "Only the person who wrote this comment can delete it." });
    response.json({ ok: true, id: commentId });
  } catch (error) {
    next(error);
  }
});

app.post("/api/action-comments/:commentId/vote", async (request, response, next) => {
  const commentId = Number(request.params.commentId);
  const actorEmail = cleanText(request.body?.actorEmail, 254);
  const vote = Number(request.body?.vote);
  if (!Number.isInteger(commentId) || !actorEmail || ![-1, 1].includes(vote)) return response.status(400).json({ error: "A signed-in user and a valid vote are required." });
  try {
    const exists = await pool.query("SELECT id FROM action_comments WHERE id = $1", [commentId]);
    if (!exists.rowCount) return response.status(404).json({ error: "Comment not found." });
    await pool.query(`
      INSERT INTO action_comment_votes (comment_id, voter_email, vote, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (comment_id, voter_email) DO UPDATE SET vote = EXCLUDED.vote, updated_at = NOW()
    `, [commentId, actorEmail, vote]);
    response.json(await commentWithVotes(commentId));
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "Unable to save shared action data." });
});

initializeDatabase()
  .then(() => app.listen(port, "0.0.0.0", () => console.log(`Action comments API listening on ${port}`)))
  .catch((error) => {
    console.error("Unable to initialize database", error);
    process.exit(1);
  });
