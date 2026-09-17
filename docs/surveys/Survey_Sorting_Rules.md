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
    - Websites print as the bare domain: the scheme, a leading `www.`, and any trailing slash are stripped and the host is lowercased (`https://www.Okland.com/` -> `okland.com`). Applied at export time only — the sheet keeps what the firm typed, because the value is prefilled back into a `type="url"` input when a response is edited.
3. Year Established
    - Column title format: "Year Est."
    - Data format: `year_founded`
4. Top executive, title, years at firm
    - Column title format: "Top Executive"\n"Title"\n"Years at Firm"
    - Data format: `top_executive`\n`top_executive_title`\n`years_at_firm`
    - A trailing `PE` / `P.E.` is stripped from the name — on the engineering list nearly every executive holds the licence, so it distinguishes nobody and has never been set in the name column. Credentials that do say something (`SE`, `PLS`) are left alone for editorial to judge. A firm that wants the licence shown puts it in the title, where the list has always carried it.
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

## Sections
One list per table on the printed page. A single submission feeds several of them:

| Section | Contents |
|---|---|
| Top Overall | every Utah firm, all disciplines |
| Top Civil | `discipline_civil` |
| Top MEP (Mechanical + Electrical) | `discipline_mep` |
| Top Structural | `discipline_structural` |

The Discipline section of the form exists to route firms into these lists — it is the only thing those checkboxes are for. A discipline nobody selected is skipped rather than printed empty.

## Sorting Rules
- Within each section, revenue-disclosing firms sort by the most recent year's revenue, descending, and are **numbered 1..n**. Each discipline list is numbered from 1 in its own right; it does not carry the overall position.
- Firms that do not report revenue follow in an unnumbered DND block within the same section, sorted by number of employees, under the heading "Firms that Did Not Disclose Revenues (listed by # of employees)".
- An out-of-state section still exists but has never fired: firms enter the address of the Utah office they are reporting for, so `state` reads `UT` even for a national firm. The printed page ranks the nationals (AECOM, WSP, Kimley-Horn, Michael Baker, Terracon) inline in the main list, which is what the current behaviour produces.

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
