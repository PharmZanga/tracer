import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 10000);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const PgSession = connectPgSimple(session);
const adminEmails = new Set((process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const commentsApiUrl = process.env.COMMENTS_API_URL || "";
const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false, limit: "16kb" }));
app.use(express.json({ limit: "16kb" }));
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || "replace-this-before-deploying",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: true, maxAge: 1000 * 60 * 60 * 8 },
}));

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function layout(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>
    :root{font-family:Inter,system-ui,sans-serif;color:#15281d;background:#edf4ef}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(rgba(5,47,37,.94),rgba(5,47,37,.9)),url('https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=1800&q=80') center/cover}.card{width:min(620px,100%);padding:28px;border-top:5px solid #1d9c58;background:#fff;box-shadow:0 22px 55px rgba(0,0,0,.25)}h1{margin:0 0 8px;font-size:28px}h2{margin:0 0 14px}p{color:#5b6c62;line-height:1.5}label{display:grid;gap:6px;margin:14px 0;color:#3f5548;font-size:13px;font-weight:700}input,select,textarea{width:100%;min-height:42px;padding:9px 10px;border:1px solid #c4d5ca;font:inherit}button,a.button{display:inline-flex;justify-content:center;align-items:center;min-height:42px;padding:9px 14px;border:0;background:#087e45;color:#fff;cursor:pointer;font:inherit;font-weight:800;text-decoration:none}.muted{font-size:12px;color:#68786f}.error{padding:10px;background:#fff0ed;color:#b42318}.success{padding:10px;background:#e7f5ed;color:#087e45}.grid{display:grid;gap:12px}.header{margin-bottom:20px}.header span{color:#087e45;font-size:12px;font-weight:800;text-transform:uppercase}.admin{width:min(1100px,100%)}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:10px;text-align:left;border-bottom:1px solid #e0e9e3}th{background:#f4f8f5;color:#4a5f51;font-size:11px;text-transform:uppercase}.row-actions{display:flex;gap:6px}.row-actions button{min-height:32px;padding:6px 9px}.reject{background:#b42318}.nav{display:flex;justify-content:space-between;gap:12px;margin-bottom:16px}.nav a{color:#087e45;font-weight:800}.qr svg{max-width:210px;height:auto}.hidden{display:none}@media(max-width:640px){body{padding:12px}.card{padding:20px}.admin{overflow-x:auto}.row-actions{flex-direction:column}}
  </style></head><body>${body}</body></html>`;
}

function loginPage(message = "") {
  const configured = Boolean(supabaseUrl && supabaseAnonKey && supabaseAdmin);
  const notice = message ? `<p class="${message.startsWith("Error") ? "error" : "success"}">${escapeHtml(message.replace(/^Error:\s*/, ""))}</p>` : "";
  const content = configured ? `<main class="card"><div class="header"><span>National Tracer Drug Availability</span><h1>Secure dashboard sign in</h1><p>Use your approved work email. You will verify your email and complete authenticator-app verification before access is granted.</p></div>${notice}<label>Work email<input id="email" type="email" autocomplete="email" required></label><button id="sign-in" type="button">Send sign-in link</button><p id="status" class="muted"></p><p class="muted">Do not have access? <a href="/request-access">Request dashboard access</a></p></main><script type="module">import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';const supabase=createClient(${JSON.stringify(supabaseUrl)},${JSON.stringify(supabaseAnonKey)});const email=document.querySelector('#email'),status=document.querySelector('#status');document.querySelector('#sign-in').addEventListener('click',async()=>{status.textContent='Sending secure sign-in link...';const {error}=await supabase.auth.signInWithOtp({email:email.value.trim(),options:{emailRedirectTo:window.location.origin+'/auth/callback'}});status.textContent=error?error.message:'Check your email for the sign-in link.'});</script>` : `<main class="card"><div class="header"><span>National Tracer Drug Availability</span><h1>Secure dashboard setup required</h1><p>The Render service is running, but Supabase authentication credentials have not been configured yet.</p></div><p class="muted">Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET, and ADMIN_EMAILS in Render before enabling this service.</p></main>`;
  return layout("Secure dashboard sign in", content);
}

function callbackPage() {
  return layout("Verify access", `<main class="card"><div class="header"><span>National Tracer Drug Availability</span><h1>Verify secure access</h1><p id="status">Completing sign in...</p></div><div id="mfa" class="hidden"><h2>Set up authenticator verification</h2><p id="mfa-help">Use Microsoft Authenticator, Google Authenticator, or another authenticator app to scan the code, then enter the six-digit code.</p><div id="qr" class="qr"></div><label>Authenticator code<input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label><button id="verify" type="button">Verify and continue</button></div></main><script type="module">import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';const supabase=createClient(${JSON.stringify(supabaseUrl)},${JSON.stringify(supabaseAnonKey)});const status=document.querySelector('#status'),mfa=document.querySelector('#mfa'),qr=document.querySelector('#qr'),help=document.querySelector('#mfa-help'),code=document.querySelector('#code');let factorId;async function finish(){const {data:{session}}=await supabase.auth.getSession();if(!session){status.textContent='The sign-in link has expired. Request another link.';return}const response=await fetch('/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessToken:session.access_token})});const body=await response.json();if(response.ok){window.location.href='/';return}status.textContent=body.error||'Unable to complete sign in.'}async function prepareMfa(){const {data}=await supabase.auth.mfa.listFactors();const existing=(data?.totp||[])[0];if(existing){factorId=existing.id;help.textContent=existing.status==='verified'?'Enter the current code from your authenticator app.':'Use the authenticator app where you scanned the QR code, then enter its current six-digit code to complete setup.';qr.classList.add('hidden');mfa.classList.remove('hidden');return}const enrolled=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'Tracer Dashboard'});if(enrolled.error){status.textContent=enrolled.error.message;return}factorId=enrolled.data.id;qr.innerHTML='<img alt="Authenticator setup QR code" src="'+enrolled.data.totp.qr_code+'">';mfa.classList.remove('hidden')}document.querySelector('#verify').addEventListener('click',async()=>{const challenged=await supabase.auth.mfa.challenge({factorId});if(challenged.error){status.textContent=challenged.error.message;return}const verified=await supabase.auth.mfa.verify({factorId,challengeId:challenged.data.id,code:code.value.trim()});if(verified.error){status.textContent=verified.error.message;return}await finish()});(async()=>{const url=new URL(window.location.href);if(url.searchParams.get('code'))await supabase.auth.exchangeCodeForSession(url.searchParams.get('code'));const {data:{session}}=await supabase.auth.getSession();if(!session){status.textContent='The sign-in link has expired. Request another link.';return}const level=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();if(level.data.currentLevel==='aal2'){await finish()}else{status.textContent='Set up or verify your authenticator app.';await prepareMfa()}})();</script>`);
}

function requestPage(message = "") {
  const notice = message ? `<p class="success">${escapeHtml(message)}</p>` : "";
  return layout("Request dashboard access", `<main class="card"><div class="header"><span>National Tracer Drug Availability</span><h1>Request dashboard access</h1><p>Your request will be reviewed by the National Supply Chain Control Tower administrator.</p></div>${notice}<form method="post" action="/request-access"><label>Work email<input name="email" type="email" required></label><label>Full name<input name="name" required maxlength="120"></label><label>Province / organisation<input name="province" maxlength="120"></label><button type="submit">Submit access request</button></form><p class="muted"><a href="/login">Return to sign in</a></p></main>`);
}

function requireSession(request, response, next) {
  if (request.session?.user) return next();
  return response.redirect("/login");
}

function requireAdmin(request, response, next) {
  if (["super_admin", "admin"].includes(request.session?.user?.role)) return next();
  return response.status(403).send(layout("Access denied", `<main class="card"><h1>Access denied</h1><p>You do not have administrator permission for user approvals.</p><a class="button" href="/">Return to dashboard</a></main>`));
}

function tokenAal(accessToken) {
  try { return JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")).aal; } catch { return ""; }
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_users (
      email TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      province TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'viewer',
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      approved_by TEXT
    );
    CREATE TABLE IF NOT EXISTS dashboard_access_audit (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      event TEXT NOT NULL,
      actor TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function audit(email, event, actor = null) {
  await pool.query("INSERT INTO dashboard_access_audit (email, event, actor) VALUES ($1, $2, $3)", [email, event, actor]);
}

app.get("/healthz", (_request, response) => response.json({ ok: true, authConfigured: Boolean(supabaseAdmin) }));
app.get("/login", (request, response) => response.send(loginPage(request.query.message || "")));
app.get("/auth/callback", (_request, response) => response.send(callbackPage()));
app.get("/request-access", (request, response) => response.send(requestPage(request.query.message || "")));

app.post("/request-access", async (request, response, next) => {
  const email = String(request.body.email || "").trim().toLowerCase();
  const name = String(request.body.name || "").trim().slice(0, 120);
  const province = String(request.body.province || "").trim().slice(0, 120);
  if (!/^\S+@\S+\.\S+$/.test(email) || !name) return response.status(400).send(requestPage("Enter a valid email address and full name."));
  try {
    await pool.query(`INSERT INTO dashboard_users (email, name, province, role, status) VALUES ($1, $2, $3, 'viewer', 'pending') ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, province = EXCLUDED.province, requested_at = NOW() WHERE dashboard_users.status <> 'approved'`, [email, name, province]);
    await audit(email, "access_requested");
    response.redirect("/request-access?message=Request submitted for administrator approval.");
  } catch (error) { next(error); }
});

app.post("/auth/session", async (request, response, next) => {
  if (!supabaseAdmin) return response.status(503).json({ error: "Authentication has not been configured." });
  const accessToken = String(request.body?.accessToken || "");
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !data.user?.email) return response.status(401).json({ error: "Email verification failed." });
    if (tokenAal(accessToken) !== "aal2") return response.status(401).json({ error: "Authenticator verification is required." });
    const email = data.user.email.toLowerCase();
    if (adminEmails.has(email)) {
      await pool.query(`INSERT INTO dashboard_users (email, name, role, status, approved_at, approved_by) VALUES ($1, $2, 'super_admin', 'approved', NOW(), $1) ON CONFLICT (email) DO UPDATE SET role = 'super_admin', status = 'approved', approved_at = COALESCE(dashboard_users.approved_at, NOW()), approved_by = $1`, [email, data.user.user_metadata?.full_name || "System administrator"]);
    }
    const userResult = await pool.query("SELECT email, name, province, role, status FROM dashboard_users WHERE email = $1", [email]);
    const user = userResult.rows[0];
    if (!user || user.status !== "approved") return response.status(403).json({ error: user ? "Your access request is awaiting approval." : "Submit an access request before signing in." });
    request.session.user = user;
    await audit(email, "signed_in", email);
    response.json({ ok: true, role: user.role });
  } catch (error) { next(error); }
});

app.post("/logout", requireSession, (request, response) => request.session.destroy(() => response.redirect("/login?message=Signed out.")));

app.get("/admin", requireSession, requireAdmin, async (request, response, next) => {
  try {
    const users = (await pool.query("SELECT email, name, province, role, status, requested_at, approved_at, approved_by FROM dashboard_users ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, requested_at DESC")).rows;
    const rows = users.map((user) => `<tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.email)}</td><td>${escapeHtml(user.province)}</td><td>${escapeHtml(user.role)}</td><td>${escapeHtml(user.status)}</td><td>${new Date(user.requested_at).toLocaleString()}</td><td>${user.status === "pending" ? `<form class="row-actions" method="post" action="/admin/users/${encodeURIComponent(user.email)}/approve"><button type="submit">Approve</button></form><form class="row-actions" method="post" action="/admin/users/${encodeURIComponent(user.email)}/reject"><button class="reject" type="submit">Reject</button></form>` : escapeHtml(user.approved_by || "-")}</td></tr>`).join("");
    response.send(layout("Dashboard access approvals", `<main class="card admin"><div class="nav"><a href="/">Dashboard</a><form method="post" action="/logout"><button type="submit">Sign out</button></form></div><div class="header"><span>Administration</span><h1>Dashboard access approvals</h1><p>Approve a request only after confirming the user is authorised to access national tracer data.</p></div><table><thead><tr><th>Name</th><th>Email</th><th>Province / organisation</th><th>Role</th><th>Status</th><th>Requested</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No access requests.</td></tr>'}</tbody></table></main>`));
  } catch (error) { next(error); }
});

app.post("/admin/users/:email/:decision", requireSession, requireAdmin, async (request, response, next) => {
  const email = String(request.params.email || "").toLowerCase();
  const decision = request.params.decision;
  if (!/^\S+@\S+\.\S+$/.test(email) || !["approve", "reject"].includes(decision)) return response.status(400).send("Invalid request.");
  try {
    const approved = decision === "approve";
    await pool.query("UPDATE dashboard_users SET status = $2, approved_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE NULL END, approved_by = $3 WHERE email = $1", [email, approved ? "approved" : "rejected", request.session.user.email]);
    await audit(email, approved ? "access_approved" : "access_rejected", request.session.user.email);
    response.redirect("/admin");
  } catch (error) { next(error); }
});

app.use("/api", requireSession, async (request, response, next) => {
  if (!commentsApiUrl) return response.status(503).json({ error: "Action service is not configured." });
  try {
    const upstream = await fetch(`${commentsApiUrl}${request.originalUrl}`, {
      method: request.method,
      headers: request.method === "GET" ? {} : { "Content-Type": "application/json" },
      body: request.method === "GET" ? undefined : JSON.stringify(request.body || {}),
    });
    const body = await upstream.text();
    response.status(upstream.status).type(upstream.headers.get("content-type") || "application/json").send(body);
  } catch (error) { next(error); }
});

app.use(requireSession, express.static(distDir, { index: false, fallthrough: true }));
app.get("/", requireSession, async (_request, response, next) => {
  try {
    const dashboard = await readFile(path.join(distDir, "index.html"), "utf8");
    response.type("html").send(dashboard.replace("<head>", "<head><script>window.__TRACER_SECURE_DASHBOARD__=true;</script>"));
  } catch (error) { next(error); }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).send(layout("Service error", "<main class=\"card\"><h1>Service unavailable</h1><p>Please try again or contact the dashboard administrator.</p></main>"));
});

initializeDatabase()
  .then(() => app.listen(port, "0.0.0.0", () => console.log(`Secure dashboard listening on ${port}`)))
  .catch((error) => { console.error("Unable to initialise secure dashboard", error); process.exit(1); });
