# Submitted HC/HP Availability

## Calculation Hierarchy

1. A facility calculates tracer availability as `COUNTIF(SOH, ">0") / 70` for its complete HC/HP template.
2. The district submits its already-calculated HC and HP percentages in the provincial workbook. Combined district SOH is a separate stock measure, not the numerator for this percentage.
3. Provincial HC and HP results are arithmetic means of the submitted district percentages, without inventing facility-count weights. Missing reports are not zero availability.
4. Other hospital/service streams retain their own tracer templates. The 70-item denominator must not be imposed on them.

The dashboard preserves full precision for averaging and displays one decimal place. Lusaka HC for 25 October 2026 uses 82%, 73%, 79%, 83% and 75%: the mean is 78.4%, or 78% at whole-percent precision. Kafue HP retains the submitted 78% in `HP!M76`; 65 positive combined stock records out of 70 is a different measure.

## Source And Missing-Data Controls

`tools/extract_submitted_availability.py` reads the source workbooks without modifying them. Each imported percentage retains the workbook filename, SHA-256, sheet and cell. A published workbook hash or an independent comparison of the district/stream positive quantity values establishes the source revision. Re-saved or ambiguous unmatched blocks are withheld.

Percentage-formatted footer cells take precedence where a template label is shifted. MOS values greater than one are never divided by 100 and treated as percentages. Shifted district headers are matched to their quantity columns.

Some historical periods do not have a matching, readable district-percentage source. These are explicitly unavailable, not back-calculated from combined SOH. A complete rollup containing an unavailable submitted percentage is also unavailable. Non-submitted all-zero blocks are excluded from the availability mean and remain reporting gaps under the existing reporting rules.

All-scope totals are unweighted submitted-report averages, not physical-facility-weighted population estimates. A full-template HC/HP percentage cannot be split into an ART-specific or single-commodity facility average from district aggregates alone. Stock quantities, AMC, MOS, stock bands and the fixed reporting register remain unchanged.

## Verification

Run `node --test tests/submitted-availability.test.js` and `npm run build`. The build separately reconciles the unchanged raw stock data and the submitted-percentage projection. The UI's Availability Evidence disclosure lists the district values and source cells in the selected filter.
