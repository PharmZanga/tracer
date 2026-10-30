# SOH-Based Tracer Availability

## Restored Calculation

The dashboard uses its original SOH-based availability rollups. Availability counts positive-stock tracer records over the corresponding tracer records; combined rollups use record-count weights. HC/HP templates contain 70 lines. Other care levels retain their own templates, not a universal denominator of 70.

For Kafue Health Posts on 25 October 2026, 65 positive stock records out of 70 give 92.9%. The manually entered 78% footer does not override this calculation. Missing footer evidence no longer suppresses available stock-based rollups.

## Filtering And Interpretation

Programme scopes retain province, district, care level and reporting-unit identities. Filtering Kafue must not retain the Lusaka provincial percentage. HC/HP scopes retain the full template, including its ART lines; ART also remains available as a separately filtered subset.

District HC/HP stock may be aggregated across facilities. Positive stock in that aggregate does not establish that every individual facility has the commodity. Reporting coverage remains a separate measure. SOH, AMC, MOS, stock bands, source workbooks and the fixed reporting register are unchanged.

The footer-extraction tool and its source evidence are retained for audit only. They are not used to replace dashboard availability.

## Verification

Run `node --test tests/submitted-availability.test.js` and `npm run audit:data`. Tests cover Kafue's 92.9%, district filtering, record-count weights, programme subsets and unchanged stock/reporting evidence.
