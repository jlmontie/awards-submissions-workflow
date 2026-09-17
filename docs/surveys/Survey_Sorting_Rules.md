# Overview
Survey results are sorted and exported into a tab-delimited text file so the graphic designer can easily drop the results into their document design software. 

# Export Format Example File
See docs/surveys/0.0_2025ArchRankingsTXT copy 3.rtf

# Architect Survey Rules
## Sorting Rules
- Firms are sorted by total revenue of the most recent year reported. 
- Firms that do not report revenue are exported in a separate file. These are sorted by the number of employees.
- Firms that do not have headquarters in Utah are exported in a separate file.

## Included Columns
1. Name and address
    - Column title format: "Firm Name"\n"Address"
    - Data format: `firm_name`\n`address`\n`city`, [2-letter state code] `zip`
    - State field added to form as a text input with "UT" placeholder. Defaults to "UT" if blank.
    - A suite designator prints as a bare `#`: `STE 400`, `Suite 400`, `Ste. #400` and `# 400` all set as `#400`, and a lettered suite keeps its case (`STE B` -> `#B`). This is how the lists have always run in print. Only the suite words fold; `Unit` / `Apt` / `Bldg` are left as typed.
2. Phone and website
    - Column title format: "Phone"\n"Website" 
    - Data format: `phone`\n`website`
    - Websites print as the bare domain: the scheme, a leading `www.`, the path and any trailing slash are stripped and the host is lowercased (`https://www.Okland.com/` -> `okland.com`). Applied at export time only — the sheet keeps what the firm typed, because the value is prefilled back into a `type="url"` input when a response is edited.
    - The path used to be kept, on the theory that a deep link should still resolve. One then arrived — Terracon submitted `terracon.com/offices/salt-lake-city` — and editorial cut it back to the domain. The column points the reader at the firm, not at a page.
3. Year Established
    - Column title format: "Year Est."
    - Data format: `year_founded`
4. Top executive, title, years at firm
    - Column title format: "Top Executive"\n"Title"\n"Years at Firm"
    - Data format: `top_executive`\n`top_executive_title`\n`years_at_firm`
    - **Credentials are stripped from both the name and the title.** `Brent Crowther, PE, PTOE, RSP1` sets as `Brent Crowther`; `P.E., COO` sets as `COO`. These lists run on licensed professionals, so a licence distinguishes nobody, and editorial has cut them by hand every year. Recognised: PE, SE, PLS, PTOE, RSP*n*, RA, AIA, LEED AP, SECB, ASCE. Only a part that is *entirely* a credential is dropped, so a job title typed into the name box survives to be seen and fixed. A title that is nothing but a credential is kept rather than blanked.
    - Titles take the page's house style:

      | Input | Output |
      |---|---|
      | `President & CEO`, `President and CEO`, `President - CEO` | `President/CEO` |
      | `Senior Vice President` | `Sr. Vice President` |
      | `Regional Chief Executive` | `Reg. Chief Executive` |
      | `Local Business Leader` | `Local Bus. Leader` |
      | `Principal in Charge` | `Principal-in-Charge` |
      | `PRESIDENT` | `President` |

      Only a **spaced** hyphen joins two titles, so `Principal-in-Charge` and other hyphenated words survive. `Senior` shortens only in `Senior Vice President` — `Senior Principal` runs in full on both the 2025 and 2026 pages, because it already fits the column.
    - Shouted entries fold to title case with acronyms intact (`PRESIDENT/CEO` -> `President/CEO`, never `President/Ceo`). The same fold applies to `city`, so `SANDY` sets as `Sandy`. It is **not** applied to `firm_name`: `AECOM` and `BHB` are meant to shout.

    Three things editorial changed by hand are deliberately *not* rules, because each is a judgement or a data error rather than a transform: picking one of two real titles (`Senior Principal, President` -> `President`), the one-off `Director of Regional Operations` -> `Director, Reg. Operations`, and a misspelled job title typed into the name box (`JARED FORD, PE, PRINIPAL`).
5. Largest projects
    - Column title format: "Largest Project to Finish in [previous year]"\n"Largest Project to Start in [current year]"
    - Data format: `largest_project_completed`\n`largest_project_upcoming`
    - A trailing Utah state token is dropped from the location (`Lehi, UT` -> `Lehi`, a bare `UT` -> nothing). These are Utah lists, so the state is noise; a non-Utah state is kept, because there it is information.
6. Employee count
    - Column title format: "# Employees"\n"# Lic. Archs"\n"# LEED AP"
    - Data format: `num_employees`\n`num_licensed_architects`\n`num_leed_ap`
    - Headcounts take the same thousands separator as revenue (`1500` -> `1,500`).

7. Annual revenues (3 columns)
This consists of three columns. The supertitle for all thre columns is on a line above the titles for all other columns. The indent rule for this is not clear, but it makes sense to align the supertitle with left-most revenue column. Revenue is reported in millions, a float with 1 decimal point, with a thousands separator above 999 (`$1,000.0`). 
    - Supertitle format: "Annual Revenues (millions)

    - Most recent revenue title format: [previous year]
    - Data format: $`revenue_current`

    - Most recent revenue title format: [prior year 1]
    - Data format: $`revenue_prior_1`

    - Most recent revenue title format: [prior year 2]
    - Data format: $`revenue_prior_2`

8. Top Markets (2 columns)
These are the top 3 markets for respondent. The first column is the name of the market. The second column is the percentage of the market.

    - Top market title format: "Top Markets"
    - Data format: Names of the top three markets with a line separator between
    
    - Top market percent title format: "%"
    - Data format: Percentages of the top three markets with a line separator between


# Engineering Survey Rules
The engineering rankings use the **GC page layout, not the architect one** — a 5-line per-firm block, 10 columns — and split into discipline lists. The reference is the printed page in the September 2025 issue, pages 70–76 (pages 36–39 of the PDF spread). The formatting rules above (thousands separators, bare-domain websites, dash-formatted phone numbers, Utah-stripped project locations) apply unchanged.

## One File, Four Tables
The export is a **single document** — the editor forwards one asset to the designer, so the tables must not be split across a zip. It holds the four tables in the order they run in print, each repeating the column heads and numbering its own firms from 1:

| # | Table | Contents |
|---|---|---|
| 1 | Top Overall Engineering Firms (Ranked by Total Office Revenues; All Disciplines) | every firm |
| 2 | Top Civil Engineering Firms | `discipline_civil` |
| 3 | Top MEP (Mechanical + Electrical) Engineering Firms | `discipline_mep` |
| 4 | Top Structural Engineering Firms | `discipline_structural` |

The title and intro run once, above the first table. A firm appears in the overall table and again in each discipline it selected — that is what the form's Discipline checkboxes are for, and the only thing they are for. A discipline nobody selected is skipped rather than set as an empty table under a heading.

## Sorting Rules
- Within each table, revenue-disclosing firms sort by the most recent year's revenue, descending, and are **numbered 1..n**. Each discipline table is numbered from 1 in its own right; it does not carry the overall position.
- Firms that do not report revenue follow in an unnumbered DND block within the same table, sorted by number of employees, under the heading "Firms that Did Not Disclose Revenues (listed by # of employees)". Each table gets its own DND block.
- **Firms headquartered outside Utah rank inline with everyone else**, on their Utah office revenues — as they do in print, where AECOM, WSP, Kimley-Horn, Michael Baker and Terracon all sit in the main list. There is no separate out-of-state file. The city line still carries the firm's real state, so an out-of-state entry is visible to editorial without being segregated.

## Block Layout
The leftmost column stacks five lines; the rest hang off the first two.

```
1.  Firm Name          Year Est.       Top Executive  Largest Project Completed in [prev]   2025  2024  2023  Market 1  %
    Address (HQ)       # of Employees  Title          Largest Project to break ground in [year]  (Utah offices)  Market 2  %
    City, ST ZIP       Years at Firm                                                                            Market 3  %
    Phone                                                                                                       Market 4  %
    Website
```

## Differences from the Architect List
- Employee count is a single column (`# Employees`). The engineering survey collects no licensed-professional or LEED headcounts, so there is no equivalent of `# Lic. Archs` / `# LEED AP`.
- Top Markets shows the top **4**, not 3 — the block is five lines tall and the markets run down lines 1–4.
- Column heads are worded as they ran in print: "Largest Project Completed in [prev year]" over "Largest Project to break ground in [current year]". Neither says "Utah"; the intro and the "(Utah offices)" note under the revenue columns already scope the list.
- Market segments add five infrastructure categories on top of the architect set: Highway, Underground, TeleComm, Water, and Wastewater.

## Known Gap: One "Other" Slot
The printed page routinely gives a firm two or three market names the form does not offer — Energy, Mining, Transit, Rail/Transit, Transportation, Federal, Aviation, Environmental, Municipal, Survey/GIS, Gas & Electric all appeared in the 2025 list. The form has a single "Other (please specify)" box, so the export can print at most one custom name per firm and the rest have to be keyed by editorial. Closing this means adding segments to the engineering template, which is a form change, not an export change.

# Contractor Survey Rules
The GC list uses its own page layout — a 5-line per-firm block, 9 columns — but the formatting rules above (thousands separators, bare-domain websites, Utah-stripped project locations) apply unchanged.

## Revenue Columns
Contractors report two revenue scopes, Utah offices and all U.S. offices, which print as two lines within one revenue cell. The header stacks accordingly:

```
                                                      Annual Revenues (millions)
Firm Name  Year Est.             Top Executive  Largest ...  2025                 2024  2023  Top Markets  %
Address    # Employees (UT/ALL)  Title          Largest ...  (Utah offices)
                                 Years at Firm               (All U.S. offices)
```

The three years head their own columns on one line; the two office scopes stack underneath the first of them and label the two revenue lines in each firm's block. The year is not repeated inside the scope labels, and the prior years are printed once rather than on both lines.

- Firms with no offices outside Utah routinely re-enter their Utah figures in the All U.S. fields. When all three All U.S. values match all three Utah values, the duplicate second line is dropped and only the Utah line prints.
- That is a display rule only. The stored values are left alone, because the overall GC ranking sorts on `revenue_all_current` and blanking the data would drop those firms out of the list entirely.
- DND firms are exempt: all six cells read `DND` there, and both lines are meant to.

## Section Order
Firms with Utah headquarters rank by overall (all U.S.) revenues. Firms headquartered outside Utah are listed at the end of the overall rankings; their Utah office revenues still count toward the discipline-specific Utah rankings.
