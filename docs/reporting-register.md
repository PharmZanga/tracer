# Fixed 2026 reporting register

Version: `2026-operational-v1`. National denominator: **403 reporting units**,
comprising 232 district Health Centre/Health Post streams (116 districts times
two) and 171 hospital or specialist-service units. These are reporting
obligations, not 403 distinct physical facilities. Specialist streams retain
their own level and are not merged into a hospital's general report.

This is a frozen **operational baseline pending administrative certification**,
not an official national facility census. It reconciles named expectations and
submissions from 11, 18 and 25 October 2026 and applies that same denominator
retrospectively to all 2026 weekly comparisons. It does not establish opening
dates or which services were formally operational in January. Earlier data
outside this register requires administrative review; it does not silently
expand either the reporting numerator or denominator. 2024/2025 summary-only
datasets retain their existing treatment.

## Receipt rule

- A source block must contain at least one positive submitted SOH to qualify.
  An all-zero/template-only block or a roster's stale `reported` flag does not
  establish receipt. Other zero commodity rows inside a qualifying report
  remain valid observations, including stockouts.
- Both HC and HP streams are required for a district to count as reported.
  A combined primary-care submission satisfies both streams, not a third unit.
- Expected units remain in the denominator even when they disappear from a
  weekly workbook. Geographic and level filters select fixed register subsets.
- Scoped aliases reconcile terminal DH / District Hos / District Hosp and
  District Hospital, the Mufumbwe Disttct typo, Levy UTH, trailing report dates,
  primary-care group labels, and reviewed Chitambo/Gwembe/Itezhi-tezhi local
  hospital labels. Province, district and service level remain
  part of the identity. Source stock rows and quantities are not rewritten.
- Reporting Rate and Data Quality expose the register CSV and any unmatched
  submitted names for review. Unmatched stock evidence remains available in
  stock screens; it is excluded from registered-unit reporting rates.

## Controlled changes

The checked-in `src/reportingRoster2026.js` is the source of expected units.
Ordinary data imports and builds never regenerate it. Administrative register
changes require a reviewed, versioned code/data change, including certification
of new units and aliases. `node tools/build_fixed_reporting_roster.mjs` audits
the frozen October baseline; `--write` deliberately regenerates that baseline.
Do not use regeneration as a routine ingestion step or substitute for review.

For each period, reported + missing must equal 403; provincial and district
subsets must sum to national totals. Received counts may change after removing
alias duplicates and excluding all-zero blocks. Stock/MOS observations and the
per-report repeated-SOH denominator are separate and are not changed by this
register.
