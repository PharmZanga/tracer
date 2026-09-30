# National Tracer Drug Availability Dashboard

Interactive national tracer medicines dashboard for Zambia supply chain monitoring.

## Features

- National tracer service availability
- Adequate cover and stockout burden
- Soon-to-finish forecast flags
- Projected stockout dates from months of stock
- Programme and commodity drilldowns
- Weekly EMMS and LAB availability views
- Static dashboard copilot answers from loaded report data

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Stock-out Modelling and Copilot

Build the reproducible, date-grouped stock-out evaluation artifact with:

```bash
node --max-old-space-size=1536 tools/train-stockout-model.mjs
```

The model uses only previously reported SOH, AMC/MOS, prior reported stock-outs, MOS movement, and reporting month. A four-week outcome is known only when the same facility-commodity has a report 21-35 days later. Missing reports are excluded from outcomes, never counted as stock-outs or non-stock-outs. The artifact is written to `public/data/predictions/stockout-model.json` and must report `predictionStatus: "validated"` before individual probabilities may be shown.

The secure Copilot service uses `OPENAI_API_KEY` and optional `OPENAI_MODEL` server-side. It is not enabled until those environment variables, authentication variables, and approved users are configured. Copilot is read-only: it cannot execute transfers and must preserve the existing source reserve of one month and additional-source threshold of two months.

The app uses Vite with relative asset paths so it can be hosted on GitHub Pages.
