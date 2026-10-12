# Data

## ../public/sample-saasquatch-dfw.csv
101 real home-service businesses (HVAC, plumbing, roofing, electrical) in
Dallas–Fort Worth, pulled from OpenStreetMap and laid out in SaaSquatch's
company-export columns (taken from SaaSquatch's public demo videos). It is a
sample in their format, not an actual SaaSquatch export.

- 5 rows are deliberate duplicates (upper-cased name, bare domain, different
  source) to mimic lists merged from several searches.
- `N/A` fields are left as-is, the way SaaSquatch exports show them.
- Regenerate: `npx tsx scripts/build-sample.mts`
- Data © OpenStreetMap contributors, ODbL.

## revenue-benchmarks.json
Revenue per employee by industry, computed as receipts ÷ employees from the
US Census Bureau, Statistics of US Businesses 2022
(`us_state_6digitnaics_2022.txt`, United States, all firm sizes).

## first-names.json
The 3,000 most common US first names (by share of births, 1940–2008), from
Social Security Administration baby-name data as packaged in
[hadley/data-baby-names](https://github.com/hadley/data-baby-names). Used to
tell a staff name ("Hugo Sanchez") from a heading ("Roof Repair") when
counting people on team pages.
