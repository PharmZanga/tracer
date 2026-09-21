# Build investigation

Failure: Render build exceeded 8 GiB. No definitive build-step logs supplied. Five large 2026 modules are statically imported by src/tracerFacilityData.js. Do not deploy before measuring peak memory and running npm test, npm run audit:data, npm run build and indicator regressions. This document is not a fix.
