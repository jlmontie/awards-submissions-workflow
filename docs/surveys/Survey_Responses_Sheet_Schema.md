# Survey Responses — per-template sheets

The survey subsystem stores responses in one Google Sheet tab **per survey template**. Each template owns its own column schema; there is no shared response sheet.

Tab names are defined once in [frontend/src/lib/surveys/sheets.ts](../../frontend/src/lib/surveys/sheets.ts) (`RESPONSE_TABS`). The responses route picks the destination tab from the survey's `template_id`; the export route reads from the same map.

## `Survey Responses - Architects`

Architect survey responses. The response writer ([responses/route.ts](../../frontend/src/app/api/surveys/responses/route.ts) `architectResponseRow`) emits these 43 columns in this exact order. The first row of the sheet should mirror the headers below; if the header row is shorter than expected, the parser falls back to positional names from this list (defined as `ARCHITECT_RESPONSE_COLUMNS` in [export/architects.ts](../../frontend/src/lib/surveys/export/architects.ts)).

| Pos | Col | Header | Notes |
|----:|-----|--------|-------|
| 0 | A | `response_id` | |
| 1 | B | `survey_id` | |
| 2 | C | `recipient_id` | |
| 3 | D | `token` | |
| 4 | E | `submitted_at` | ISO timestamp |
| 5 | F | `firm_name` | |
| 6 | G | `location` | |
| 7 | H | `year_founded` | |
| 8 | I | `top_executive` | |
| 9 | J | `top_executive_title` | |
| 10 | K | `years_at_firm` | |
| 11 | L | `address` | |
| 12 | M | `city` | |
| 13 | N | `state` | |
| 14 | O | `zip` | |
| 15 | P | `phone` | |
| 16 | Q | `marketing_email` | |
| 17 | R | `website` | |
| 18 | S | `other_locations` | |
| 19 | T | `num_employees` | |
| 20 | U | `num_licensed_architects` | |
| 21 | V | `num_leed_ap` | |
| 22 | W | `revenue_current` | |
| 23 | X | `revenue_prior_1` | |
| 24 | Y | `revenue_prior_2` | |
| 25 | Z | `revenue_dnd` | `TRUE` / `FALSE` |
| 26 | AA | `largest_project_completed` | |
| 27 | AB | `largest_project_completed_location` | |
| 28 | AC | `largest_project_upcoming` | |
| 29 | AD | `largest_project_upcoming_location` | |
| 30 | AE | `pct_k12` | |
| 31 | AF | `pct_higher_ed` | |
| 32 | AG | `pct_civic` | |
| 33 | AH | `pct_healthcare` | |
| 34 | AI | `pct_office` | |
| 35 | AJ | `pct_resort_hospitality` | |
| 36 | AK | `pct_multi_family` | |
| 37 | AL | `pct_commercial_retail` | |
| 38 | AM | `pct_sports_rec` | |
| 39 | AN | `pct_industrial` | |
| 40 | AO | `pct_other` | |
| 41 | AP | `other_segment_name` | User-supplied label for the `pct_other` segment |

## `Survey Responses - Contractors`

Contractor survey responses. The response writer ([responses/route.ts](../../frontend/src/app/api/surveys/responses/route.ts) `contractorResponseRow`) emits these 53 columns in this exact order. Fallback list defined as `CONTRACTOR_RESPONSE_COLUMNS` in [export/contractors.ts](../../frontend/src/lib/surveys/export/contractors.ts).

| Pos | Col | Header | Notes |
|----:|-----|--------|-------|
| 0 | A | `response_id` | |
| 1 | B | `survey_id` | |
| 2 | C | `recipient_id` | |
| 3 | D | `token` | |
| 4 | E | `submitted_at` | ISO timestamp |
| 5 | F | `firm_name` | |
| 6 | G | `year_founded` | |
| 7 | H | `top_executive` | |
| 8 | I | `top_executive_title` | |
| 9 | J | `years_at_firm` | |
| 10 | K | `address` | HQ address |
| 11 | L | `city` | |
| 12 | M | `state` | Drives HQ in/outside Utah for export filtering |
| 13 | N | `zip` | |
| 14 | O | `phone` | |
| 15 | P | `marketing_email` | |
| 16 | Q | `website` | |
| 17 | R | `other_locations` | |
| 18 | S | `num_employees_ut` | |
| 19 | T | `num_employees_all` | |
| 20 | U | `discipline_general_building` | `TRUE` / `FALSE` — drives membership in the General Builders ranking |
| 21 | V | `discipline_heavy_highway` | `TRUE` / `FALSE` — drives Heavy/Highway & Muni/Utility ranking |
| 22 | W | `discipline_municipal_utility` | `TRUE` / `FALSE` — drives Heavy/Highway & Muni/Utility ranking |
| 23 | X | `revenue_dnd` | `TRUE` / `FALSE` — hides all 6 revenue cells, ranks by employees |
| 24 | Y | `revenue_ut_current` | Utah office revenue, current year |
| 25 | Z | `revenue_ut_prior_1` | |
| 26 | AA | `revenue_ut_prior_2` | |
| 27 | AB | `revenue_all_current` | All U.S. office revenue. Blank if firm only has Utah offices. |
| 28 | AC | `revenue_all_prior_1` | |
| 29 | AD | `revenue_all_prior_2` | |
| 30 | AE | `largest_project_completed` | Largest Utah project completed in prior year |
| 31 | AF | `largest_project_completed_location` | City only |
| 32 | AG | `largest_project_upcoming` | Largest Utah project started in current year |
| 33 | AH | `largest_project_upcoming_location` | City only |
| 34 | AI | `pct_k12` | |
| 35 | AJ | `pct_higher_ed` | |
| 36 | AK | `pct_civic` | |
| 37 | AL | `pct_healthcare` | |
| 38 | AM | `pct_multi_family` | |
| 39 | AN | `pct_commercial_retail` | |
| 40 | AO | `pct_industrial` | |
| 41 | AP | `pct_resort_hospitality` | |
| 42 | AQ | `pct_sports_rec` | |
| 43 | AR | `pct_religious` | |
| 44 | AS | `pct_underground` | |
| 45 | AT | `pct_telecomm` | |
| 46 | AU | `pct_wastewater` | |
| 47 | AV | `pct_heavy_civil` | |
| 48 | AW | `pct_water` | |
| 49 | AX | `pct_highway` | |
| 50 | AY | `pct_oil_gas` | |
| 51 | AZ | `pct_power` | |
| 52 | BA | `pct_other` | |
| 53 | BB | `other_segment_name` | User-supplied label for the `pct_other` segment |

## `Survey Contacts`

No schema change. To start receiving contractor responses, add rows with `category` set to `contractors` and `active` set to `TRUE`. The recipient-import flow filters by survey category.

## Adding a new template

1. Add the template to [frontend/src/lib/surveys/templates.ts](../../frontend/src/lib/surveys/templates.ts).
2. Add a new entry to `RESPONSE_TABS` in [frontend/src/lib/surveys/sheets.ts](../../frontend/src/lib/surveys/sheets.ts).
3. Add a row builder in [responses/route.ts](../../frontend/src/app/api/surveys/responses/route.ts) and an export module under [frontend/src/lib/surveys/export/](../../frontend/src/lib/surveys/export/).
4. Create the matching response tab in the master Google Sheet with the header row from the export module's `*_RESPONSE_COLUMNS` constant.
