# Survey Tool & Platform Restructuring Plan

**Date:** February 11, 2026
**Branch:** `unified-tool-platform`
**Status:** Planning

---

## Context

Ladd Marshall (UC&D) currently distributes annual ranking surveys to three groups
(Architects, GCs, Engineers) as fillable PDFs via email. Recipients fill them out and
email them back. The results are manually compiled into ranked tables published in
the magazine.

This process takes ~10 hours per survey (30 hrs/year). The client wants a web form
that replaces the PDF-and-email workflow. We start with the **Architects survey** as
the template, then replicate for GCs and Engineers.

### What the Architect Survey Collects

From the attached PDF (`0.Top.Architect.Survey_2025_v0520.pdf`):

**General Company Information**
- Firm name, location
- Year founded
- Top executive name/title, years at firm
- Address, city, ZIP
- Phone, marketing/BD manager email
- Website, other Utah office locations
- Number of employees (all Utah offices)
- Number of licensed architects
- Number of LEED APs

**Revenues**
- 2024, 2023, 2022 revenues (Utah offices)

**Projects**
- Largest project completed in prior year (with location)
- Largest project to break ground in current year (with location)

**Market Segments** (percentage of revenue from each)
- K-12, Higher Education, Civic/Institutional, Healthcare, Office
- Resort/Hospitality, Multi-Family, Commercial/Retail, Sports/Rec
- Industrial, Other

### How Results Are Published

The screenshots show a ranked table in the magazine spread:
- Firms ranked by revenue (highest to lowest)
- Firms declining to disclose revenue (DND) listed after by employee count
- Columns: Firm Name, Phone, Year Est., Top Executive/Title, Largest Projects,
  # Employees, Annual Revenues (3 years), Top Markets

---

## Part 1: Project & Frontend Restructuring

The project is currently organized around a single tool (awards submissions).
To support multiple tools, we need to restructure both the directory layout and
the frontend routing.

### 1.1 Current Frontend Route Structure

```
/                          -> Awards submission form (home page)
/admin                     -> Redirects to /admin/dashboard
/admin/dashboard           -> Awards stats dashboard
/admin/submissions         -> Awards submissions list
/admin/submissions/[id]    -> Awards submission detail
/api/download-form         -> Awards PDF download
/api/get-upload-url        -> Awards signed upload URL
/api/admin/stats           -> Awards admin stats API
/api/admin/submissions     -> Awards admin submissions API
/api/admin/submissions/[id] -> Awards admin submission detail API
```

Everything lives at the root level and is awards-specific. The root layout
metadata says "Most Outstanding Projects Competition" and the admin header
says "UC&D Awards Admin."

### 1.2 Proposed Frontend Route Structure

```
/                              -> Platform landing page (tool selector)
/awards                        -> Awards submission form (moved from /)
/surveys/[token]               -> Public survey response form (unique per-firm link)
/surveys/[token]/confirmation  -> Survey submission confirmation

/admin                         -> Admin home (redirects to /admin/dashboard)
/admin/dashboard               -> Platform-wide dashboard (combined stats)
/admin/awards/                 -> Awards submissions list (moved from /admin/submissions)
/admin/awards/[id]             -> Awards submission detail
/admin/surveys/                -> Surveys list (all surveys)
/admin/surveys/new             -> Create new survey (from template or scratch)
/admin/surveys/[id]            -> Survey detail: responses, stats, send/remind
/admin/surveys/[id]/results    -> Results view: ranked table, export

/api/awards/download-form      -> Awards PDF download (moved)
/api/awards/get-upload-url     -> Awards signed upload URL (moved)
/api/awards/admin/...          -> Awards admin APIs (moved)
/api/surveys/                  -> Survey CRUD (list, create)
/api/surveys/[id]              -> Survey detail/update
/api/surveys/[id]/responses    -> Submit/list responses
/api/surveys/[id]/send         -> Send invitations
/api/surveys/[id]/remind       -> Send reminders
/api/surveys/[id]/export       -> Export results
```

### 1.3 Proposed Component Organization

```
frontend/src/
├── app/
│   ├── layout.tsx                          # Root layout (platform-level branding)
│   ├── page.tsx                            # Landing page (tool cards/links)
│   │
│   ├── awards/
│   │   └── page.tsx                        # Awards form (current / page content)
│   │
│   ├── surveys/
│   │   └── [token]/
│   │       ├── page.tsx                    # Public survey form
│   │       └── confirmation/
│   │           └── page.tsx                # Thank you / confirmation
│   │
│   ├── admin/
│   │   ├── layout.tsx                      # Admin layout (platform nav with tool tabs)
│   │   ├── page.tsx                        # Redirect to /admin/dashboard
│   │   ├── dashboard/
│   │   │   └── page.tsx                    # Combined platform stats
│   │   ├── awards/
│   │   │   ├── page.tsx                    # Submissions list (moved)
│   │   │   └── [id]/
│   │   │       └── page.tsx                # Submission detail (moved)
│   │   └── surveys/
│   │       ├── page.tsx                    # Surveys list
│   │       ├── new/
│   │       │   └── page.tsx                # Create survey (with template selector)
│   │       └── [id]/
│   │           ├── page.tsx                # Survey overview + response tracker
│   │           └── results/
│   │               └── page.tsx            # Ranked results + export
│   │
│   ├── api/
│   │   ├── awards/
│   │   │   ├── download-form/route.ts      # Moved from /api/download-form
│   │   │   ├── get-upload-url/route.ts     # Moved from /api/get-upload-url
│   │   │   └── admin/
│   │   │       ├── stats/route.ts          # Moved
│   │   │       └── submissions/
│   │   │           ├── route.ts            # Moved
│   │   │           └── [id]/route.ts       # Moved
│   │   └── surveys/
│   │       ├── route.ts                    # List/create surveys
│   │       └── [id]/
│   │           ├── route.ts                # Get/update survey
│   │           ├── responses/route.ts      # Submit/list responses
│   │           ├── send/route.ts           # Send invitation emails
│   │           ├── remind/route.ts         # Send reminder emails
│   │           └── export/route.ts         # Export results (CSV/JSON)
│   │
│   └── globals.css
│
├── components/
│   ├── shared/                             # Cross-tool components
│   │   ├── PlatformHeader.tsx              # UC&D branding header
│   │   ├── AdminNav.tsx                    # Admin sidebar/top nav with tool links
│   │   └── RecaptchaLoader.tsx             # Existing, shared
│   │
│   ├── awards/                             # Awards-specific components
│   │   ├── FileUpload.tsx                  # Existing
│   │   └── SubmissionForm.tsx              # Existing
│   │
│   └── surveys/                            # Survey-specific components
│       ├── SurveyForm.tsx                  # Public form renderer
│       ├── SurveyField.tsx                 # Individual field (text, number, select, percent)
│       ├── MarketSegments.tsx              # Market segment percentage group
│       ├── SurveyProgress.tsx              # Progress indicator
│       ├── ResponseTracker.tsx             # Admin: response status table
│       ├── RankingsTable.tsx               # Admin: ranked results table
│       └── SurveyTemplateSelector.tsx      # Admin: pick template for new survey
│
├── lib/
│   ├── surveys/
│   │   ├── templates.ts                    # Survey templates (architects, GCs, engineers)
│   │   ├── validation.ts                   # Survey field validation rules
│   │   └── rankings.ts                     # Ranking calculation logic
│   └── shared/
│       └── google-sheets.ts                # Shared Sheets API utilities
│
└── config/
    └── env.ts                              # Existing, add survey-related env vars
```

### 1.4 Root Layout & Landing Page Changes

**Root layout** (`layout.tsx`): Change metadata from "Most Outstanding Projects
Competition" to a generic platform title (e.g., "UC&D Tools" or
"Utah Construction & Design"). Keep fonts and globals.

**Landing page** (`page.tsx`): Replace the awards submission form with a simple
tool selector page. Two cards:
- **Awards Submissions** - "Submit your project for awards consideration" -> `/awards`
- **Firm Rankings Survey** - "Complete your annual firm rankings survey" -> displays
  instructions (surveys are accessed via unique per-firm link, not this page)

### 1.5 Admin Layout Changes

Update `admin/layout.tsx`:
- Change header from "UC&D Awards Admin" to "UC&D Admin"
- Add tool navigation: **Dashboard** | **Awards** | **Surveys** | (future tools)
- Keep "Public Site" link

---

## Part 2: Survey Tool - Data Model & Storage

### 2.1 Google Sheets Structure

Following the existing pattern (awards use Google Sheets as the data store), surveys
will also use Google Sheets. This keeps the stack consistent and gives the client
direct access to data in a familiar format.

**Sheet 1: "Surveys"** (survey definitions)

| Column | Description |
|--------|-------------|
| survey_id | Unique ID (e.g., ARCH-2026) |
| name | "2026 Top Utah Architects Survey" |
| category | architects / gc / engineers |
| year | 2026 |
| deadline | 2026-05-29 |
| status | draft / active / closed |
| created_at | Timestamp |
| template_version | Reference to template used |

**Sheet 2: "Survey Recipients"** (who gets invited)

| Column | Description |
|--------|-------------|
| recipient_id | Auto-generated |
| survey_id | FK to Surveys |
| firm_name | "VCBO Architecture" |
| contact_name | "John Doe" |
| contact_email | "john@vcbo.com" |
| token | Unique URL token (e.g., abc123xyz) |
| status | pending / sent / opened / started / completed |
| sent_at | When invitation email was sent |
| completed_at | When response was submitted |
| reminder_count | Number of reminders sent |

**Sheet 3: "Survey Responses"** (submitted data)

| Column | Description |
|--------|-------------|
| response_id | Auto-generated (SR-YYYY-NNN) |
| survey_id | FK to Surveys |
| recipient_id | FK to Recipients |
| token | The unique token used |
| submitted_at | Timestamp |
| firm_name | Response data... |
| location | ... |
| year_founded | ... |
| top_executive | ... |
| top_executive_title | ... |
| years_at_firm | ... |
| address | ... |
| city | ... |
| zip | ... |
| phone | ... |
| marketing_email | ... |
| website | ... |
| other_locations | ... |
| num_employees | ... |
| num_licensed_architects | ... |
| num_leed_ap | ... |
| revenue_current | ... |
| revenue_prior_1 | ... |
| revenue_prior_2 | ... |
| revenue_dnd | true/false (decline to disclose) |
| largest_project_completed | ... |
| largest_project_upcoming | ... |
| pct_k12 | ... |
| pct_higher_ed | ... |
| pct_civic | ... |
| pct_healthcare | ... |
| pct_office | ... |
| pct_resort_hospitality | ... |
| pct_multi_family | ... |
| pct_commercial_retail | ... |
| pct_sports_rec | ... |
| pct_industrial | ... |
| pct_other | ... |

### 2.2 Survey Templates

Rather than a freeform survey builder, we use **predefined templates** that match
the existing PDF surveys. The client sends the same survey structure every year --
only the year/dates change. Templates are defined in code.

**Architect Survey Template** fields (derived from the PDF):
- General Company Info section (text fields)
- Revenue section (currency fields + DND checkbox)
- Projects section (text fields)
- Market Segments section (percentage fields that should sum to 100%)

GC and Engineer templates will be added later (similar structure with
category-specific field variations).

---

## Part 3: Survey Tool - Feature Breakdown

### 3.1 Public Survey Form (`/surveys/[token]`)

**The core user-facing feature.** A firm receives an email with a unique link like
`tools.utahcdmag.com/surveys/abc123xyz`. Clicking it opens a clean web form
pre-populated with their firm name (from the recipient list).

**Form behavior:**
- UC&D branding header with survey title and deadline
- Sectioned form matching the PDF layout (General Info, Revenues, Projects, Markets)
- Client-side validation (required fields, percentage sum = 100%, valid numbers)
- "Decline to disclose" checkbox for revenue (hides revenue fields)
- Submit button with reCAPTCHA
- On submit: write row to Survey Responses sheet, update recipient status
- Confirmation page with response ID

**No save-progress for MVP.** The survey is short enough (~2 minutes) that
save/resume adds unnecessary complexity. Can be added later if needed.

### 3.2 Admin: Surveys List (`/admin/surveys`)

Table of all surveys with:
- Name, category, year, deadline, status
- Response rate (e.g., "29/45 - 64%")
- Actions: View, Edit, Send, Close

### 3.3 Admin: Create Survey (`/admin/surveys/new`)

- Select template (Architects / GC / Engineers)
- Set year, deadline, survey name
- Upload recipient list (CSV: firm_name, contact_name, contact_email)
- Or manually add recipients
- Preview the public form
- Save as draft

### 3.4 Admin: Survey Detail (`/admin/surveys/[id]`)

- Survey info (name, deadline, status)
- Response tracker table:
  - Firm name, contact, status (sent/opened/completed), date
  - Actions per recipient: Resend, Remind
- Bulk actions: Send All, Remind Non-Responders
- Stats: total sent, completed, response rate, days until deadline

### 3.5 Admin: Results (`/admin/surveys/[id]/results`)

- Ranked table matching magazine layout:
  - Firms ranked by revenue (highest to lowest)
  - DND firms listed after, ranked by employee count
  - Columns match the published table format
- Export options:
  - CSV download (for InDesign/publishing workflow)
  - Copy table (for quick paste)

### 3.6 Email Sending

For MVP, use the existing GCP infrastructure. Two approaches (decide during
implementation):

**Option A: Direct via Gmail API** (simpler, uses existing OAuth)
- Send from lmarshall@utahcdmag.com (or a configured sender)
- Suitable for the volume (~50-150 emails per survey run)

**Option B: Cloud Function + SendGrid** (as outlined in architecture vision)
- More scalable, better deliverability tracking
- Adds a dependency

**Recommendation:** Start with Option A for MVP. The volume is low (~45 architects,
similar for GC/engineers). Upgrade to SendGrid later if deliverability becomes
an issue.

**Email templates needed:**
1. Survey invitation (with unique link)
2. Survey reminder (with unique link, days remaining)

---

## Part 4: Execution Steps

### Step 1: Frontend Restructuring (no new features)

Move existing code into the new route structure. Nothing should break --
the awards tool just lives at `/awards` instead of `/`.

1. Create `/awards/page.tsx` with content from current `/page.tsx`
2. Create new `/page.tsx` as platform landing page
3. Move `/admin/dashboard` to `/admin/dashboard` (stays, but update nav)
4. Move `/admin/submissions` to `/admin/awards`
5. Move `/api/download-form` to `/api/awards/download-form`
6. Move `/api/get-upload-url` to `/api/awards/get-upload-url`
7. Move `/api/admin/*` to `/api/awards/admin/*`
8. Update `layout.tsx` metadata to platform-level
9. Update `admin/layout.tsx` nav to include tool tabs
10. Move components into `components/awards/` and `components/shared/`
11. Update all internal links and imports
12. Verify awards tool still works at new routes

### Step 2: Survey Form (public-facing)

Build the survey response form that firms will use.

1. Define architect survey template in `lib/surveys/templates.ts`
2. Define validation rules in `lib/surveys/validation.ts`
3. Build `SurveyForm.tsx` component (renders template fields)
4. Build `SurveyField.tsx` (handles text, number, currency, percent, checkbox)
5. Build `MarketSegments.tsx` (percentage group with sum validation)
6. Build `SurveyProgress.tsx` (section progress indicator)
7. Create `/surveys/[token]/page.tsx` (fetches survey + recipient by token, renders form)
8. Create `/surveys/[token]/confirmation/page.tsx`
9. Create `/api/surveys/[id]/responses/route.ts` (POST: validate + write to Sheet)
10. Create Google Sheet with survey response columns
11. Test end-to-end: token URL -> form -> submit -> data in Sheet

### Step 3: Admin - Survey Management

Build the admin interface for creating surveys and tracking responses.

1. Create `/admin/surveys/page.tsx` (survey list)
2. Create `/admin/surveys/new/page.tsx` (create from template + upload CSV)
3. Create `/admin/surveys/[id]/page.tsx` (detail view + response tracker)
4. Create `/api/surveys/route.ts` (list/create surveys)
5. Create `/api/surveys/[id]/route.ts` (get/update survey)
6. Create Surveys and Recipients sheets in Google Sheets
7. Build `ResponseTracker.tsx` component
8. Build CSV upload + parsing for recipient lists
9. Token generation for each recipient

### Step 4: Email Integration

Connect survey sending to email.

1. Create `/api/surveys/[id]/send/route.ts` (send invitations)
2. Create `/api/surveys/[id]/remind/route.ts` (send reminders)
3. Build email templates (invitation + reminder)
4. Update recipient status on send
5. Test: create survey -> add recipients -> send -> receive email -> click link -> form

### Step 5: Results & Export

Build the results view and export.

1. Create `/admin/surveys/[id]/results/page.tsx`
2. Build `RankingsTable.tsx` (ranked display matching magazine format)
3. Implement ranking logic in `lib/surveys/rankings.ts`:
   - Sort by revenue descending
   - DND firms sorted by employee count, listed after
4. Create `/api/surveys/[id]/export/route.ts` (CSV export)
5. Test with real data format

---

## Part 5: Survey Field Definitions (Architect Template)

Reference for implementation. Each field maps to a column in the response sheet.

```typescript
// lib/surveys/templates.ts

const architectSurveyTemplate = {
  id: 'architects',
  name: 'Top Utah Architects Survey',
  sections: [
    {
      title: 'General Company Information',
      fields: [
        { key: 'firm_name',            label: 'Name of Firm',              type: 'text',     required: true  },
        { key: 'location',             label: 'Location',                  type: 'text',     required: true  },
        { key: 'year_founded',         label: 'Year Founded',              type: 'number',   required: true  },
        { key: 'top_executive',        label: 'Top Executive',             type: 'text',     required: true  },
        { key: 'top_executive_title',  label: 'Title',                     type: 'text',     required: true  },
        { key: 'years_at_firm',        label: 'Years at Firm',             type: 'number',   required: false },
        { key: 'address',              label: 'Address',                   type: 'text',     required: true  },
        { key: 'city',                 label: 'City',                      type: 'text',     required: true  },
        { key: 'zip',                  label: 'ZIP',                       type: 'text',     required: true  },
        { key: 'phone',                label: 'Phone',                     type: 'tel',      required: true  },
        { key: 'marketing_email',      label: 'Email of Marketing/BD Mgr', type: 'email',   required: false },
        { key: 'website',              label: 'Website',                   type: 'url',      required: false },
        { key: 'other_locations',      label: 'Other Utah Office Locations', type: 'text',   required: false },
        { key: 'num_employees',        label: 'Number of Employees (all Utah offices)', type: 'number', required: true },
        { key: 'num_licensed_architects', label: '# of Licensed Architects', type: 'number', required: false },
        { key: 'num_leed_ap',          label: '# LEED AP',                 type: 'number',   required: false },
      ],
    },
    {
      title: 'Revenues (Generated by offices located in Utah)',
      description: 'Revenue figures are used for ranking. Select "Decline to Disclose" to be listed by employee count instead.',
      fields: [
        { key: 'revenue_dnd',          label: 'Decline to Disclose (DND)', type: 'checkbox', required: false },
        { key: 'revenue_current',      label: '{{prevYear}} Revenues',     type: 'currency', required: false, hideWhen: 'revenue_dnd' },
        { key: 'revenue_prior_1',      label: '{{prevYear-1}} Revenues',   type: 'currency', required: false, hideWhen: 'revenue_dnd' },
        { key: 'revenue_prior_2',      label: '{{prevYear-2}} Revenues',   type: 'currency', required: false, hideWhen: 'revenue_dnd' },
      ],
    },
    {
      title: 'Projects',
      fields: [
        { key: 'largest_project_completed', label: 'Largest Project completed in {{prevYear}} (include location)', type: 'text', required: false },
        { key: 'largest_project_upcoming',  label: 'Largest Project to break ground in {{year}} (include location)', type: 'text', required: false },
      ],
    },
    {
      title: 'Market Segments',
      description: 'Percentage of revenues from each segment. Should total 100%.',
      type: 'percentage_group',
      fields: [
        { key: 'pct_k12',               label: 'K-12',                    type: 'percent' },
        { key: 'pct_higher_ed',          label: 'Higher Education',       type: 'percent' },
        { key: 'pct_civic',              label: 'Civic/Institutional',    type: 'percent' },
        { key: 'pct_healthcare',         label: 'Healthcare',             type: 'percent' },
        { key: 'pct_office',             label: 'Office',                 type: 'percent' },
        { key: 'pct_resort_hospitality', label: 'Resort/Hospitality',    type: 'percent' },
        { key: 'pct_multi_family',       label: 'Multi-Family',          type: 'percent' },
        { key: 'pct_commercial_retail',  label: 'Commercial/Retail',     type: 'percent' },
        { key: 'pct_sports_rec',         label: 'Sports/Rec',            type: 'percent' },
        { key: 'pct_industrial',         label: 'Industrial',            type: 'percent' },
        { key: 'pct_other',             label: 'Other',                  type: 'percent' },
      ],
    },
  ],
};
```

---

## Part 6: Decisions Needed Before Execution

1. **Domain/URL**: Will this be hosted at `tools.utahcdmag.com` or continue on the
   current Cloud Run URL? (Affects email links.)

2. **Email sender**: What email address should survey invitations come from?
   (lmarshall@utahcdmag.com? A noreply address?)

3. **Authentication**: Is the existing admin OAuth setup sufficient, or do we need
   additional admin users?

4. **Recipient list format**: Does the client have contact lists in CSV/Excel already,
   or will they need to be compiled? (The txt files mentioned in the email on Google
   Drive may be the lists.)

5. **Timeline priority**: Should we do the full restructure (Step 1) first, or
   build the survey form standalone and restructure later?

---

## Appendix: What Stays the Same

- **GCP infrastructure**: Cloud Run, Cloud Storage, Cloud Functions -- no changes
- **Tech stack**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Google Sheets as data store**: Consistent with awards tool
- **Google Drive for file storage**: If surveys ever need attachments
- **reCAPTCHA**: Reused for survey form spam protection
- **Terraform**: Infrastructure management unchanged
- **Backend Cloud Functions**: Awards processors untouched; survey doesn't need
  background processing (responses write directly to Sheets via API routes)
