# Render 8 GiB build failure — investigation (not a fix)

The failed service is `tracer-secure-dashboard`. Its Render build is `npm install && npm run build`, with Vite as the build script. `src/tracerFacilityData.js` statically imports five large 2026 datasets and concatenates/sorts them during module initialization. This is a plausible source of build memory pressure, but the actual failing step cannot be established without Render logs.

## Safety and validation gates

- Obtain last 100–200 lines of the failed Render build log; isolate install, transformation, bundling, or minification failure.
- Inventory all synchronous references to `tracerReportingPeriods`, `tracerFacilityData`, and year datasets before changing the loading contract.
- Preserve all date ordering and numerical indicators; verify comparisons to the original implementation.
- Evaluate whether any data are access restricted before putting them in `public/`; static assets are generally publicly accessible.
- Run `npm ci`, `npm test`, `npm run audit:data`, `npm run build` and memory measurement in a working repository checkout before requesting review.
- Do not merge or deploy until verified.

This document does not alter application behavior and does not claim that the failed build is resolved.
