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
2. Phone and website
    - Column title format: "Phone"\n"Website" 
    - Data format: `phone`\n`website`
3. Year Established
    - Column title format: "Year Est."
    - Data format: `year_founded`
4. Top executive, title, years at firm
    - Column title format: "Top Executive"\n"Title"\n"Years at Firm"
    - Data format: `top_executive`\n`top_executive_title`\n`years_at_firm`
5. Largest projects
    - Column title format: "Largest Project to Finish in [previous year]"\n"Largest Project to Start in [current year]"
    - Data format: `largest_project_completed`\n`largest_project_upcoming`
6. Employee count
    - Column title format: "# Employees"\n"# Lic. Archs"\n"# LEED AP"
    - Data format: `num_employees`\n`num_licensed_architects`\n`num_leed_ap`

7. Annual revenues (3 columns)
This consists of three columns. The supertitle for all thre columns is on a line above the titles for all other columns. The indent rule for this is not clear, but it makes sense to align the supertitle with left-most revenue column. Revenue is reported in millions, a float with 1 decimal point. 
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