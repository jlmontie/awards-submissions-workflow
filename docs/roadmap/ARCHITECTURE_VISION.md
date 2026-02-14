# UC+D Business Tools Platform - Architecture Vision

## Current State (Awards Only)

```
┌─────────────────────────────────────────────┐
│                                             │
│     Awards Submission Web Form              │
│     (awards-production-frontend...)         │
│                                             │
│     [Download Form] [Upload PDF + Photos]   │
│                                             │
└──────────────────┬──────────────────────────┘
                   │
                   ↓
         ┌─────────────────────┐
         │                     │
         │  Google Cloud       │
         │  Storage            │
         │                     │
         │  - PDFs             │
         │  - Photos           │
         │                     │
         └──────────┬──────────┘
                    │
         (Cloud Function triggers)
                    │
                    ↓
         ┌──────────────────────┐
         │                      │
         │  PDF Processor       │
         │  (Python)            │
         │                      │
         │  - Extract fields    │
         │  - Create folders    │
         │  - Update sheet      │
         │                      │
         └──────────┬───────────┘
                    │
                    ↓
         ┌──────────────────────┐
         │                      │
         │  Google Drive        │
         │                      │
         │  Awards/             │
         │    2025/             │
         │      Project1/       │
         │        form.pdf      │
         │        photos/       │
         │                      │
         └──────────┬───────────┘
                    │
                    ↓
         ┌──────────────────────┐
         │                      │
         │  Google Sheet        │
         │                      │
         │  Master Submissions  │
         │  - All fields        │
         │  - File links        │
         │                      │
         └──────────────────────┘
```

### Issues:
- ❌ No submission ID
- ❌ No winner tracking
- ❌ No survey capability
- ❌ No admin dashboard

---

## Future State: Unified Platform

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│         UC+D BUSINESS TOOLS PLATFORM                           │
│         (tools.utahcdmag.com)                                  │
│                                                                │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │                 │  │                  │  │              │ │
│  │  PUBLIC SIDE    │  │   ADMIN SIDE     │  │   API/JOBS   │ │
│  │                 │  │                  │  │              │ │
│  └─────────────────┘  └──────────────────┘  └──────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
         │                       │                      │
         ↓                       ↓                      ↓

┌────────────────┐    ┌──────────────────────┐    ┌──────────────┐
│                │    │                      │    │              │
│ PUBLIC PAGES   │    │  ADMIN DASHBOARD     │    │ BACKGROUND   │
│                │    │  (Login Required)    │    │ PROCESSING   │
│                │    │                      │    │              │
│ • Awards Form  │    │ 📊 AWARDS MODULE     │    │ • PDF Parser │
│ • Survey Form  │    │  - All Submissions   │    │ • Email Send │
│ • Thank You    │    │  - Mark Winners      │    │ • File Org   │
│ • Status Check │    │  - Export Data       │    │ • Reminders  │
│                │    │  - Gen Team Sheets   │    │              │
│                │    │                      │    │              │
│                │    │ 📋 SURVEY MODULE     │    │              │
│                │    │  - Create Survey     │    │              │
│                │    │  - Manage Lists      │    │              │
│                │    │  - Send Invites      │    │              │
│                │    │  - Track Responses   │    │              │
│                │    │  - View Results      │    │              │
│                │    │  - Export Rankings   │    │              │
│                │    │                      │    │              │
│                │    │ 👥 CONTACTS (v2)     │    │              │
│                │    │  - Firm Database     │    │              │
│                │    │  - History           │    │              │
│                │    │  - Lists             │    │              │
│                │    │                      │    │              │
└────────────────┘    └──────────────────────┘    └──────────────┘
         │                       │                       │
         └───────────────────────┴───────────────────────┘
                                 │
                                 ↓
                    ┌─────────────────────────┐
                    │                         │
                    │   SHARED SERVICES       │
                    │                         │
                    │  • Authentication       │
                    │  • File Upload          │
                    │  • Email Sending        │
                    │  • PDF Processing       │
                    │  • Image Processing     │
                    │  • Logging              │
                    │  • Error Tracking       │
                    │                         │
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              ┌─────▼──────┐          ┌──────▼──────┐
              │            │          │             │
              │  Storage   │          │   Data      │
              │            │          │             │
              │ • GCS      │          │ • Drive     │
              │ • Drive    │          │ • Sheets    │
              │            │          │ • DB (?)    │
              │            │          │             │
              └────────────┘          └─────────────┘
```

---

## Module Details

### 📊 Awards Module

#### Public Interface:
```
┌────────────────────────────────┐
│  AWARDS SUBMISSION FORM        │
│                                │
│  1. Download blank form        │
│     ↓                          │
│  2. Fill out PDF offline       │
│     ↓                          │
│  3. Upload completed PDF       │
│     ↓                          │
│  4. Upload project photos      │
│     ↓                          │
│  5. Submit with reCAPTCHA      │
│     ↓                          │
│  6. Receive confirmation       │
│     - Submission ID: AW-2025-042
│     - Email confirmation       │
│                                │
└────────────────────────────────┘
```

#### Admin Interface:
```
┌─────────────────────────────────────────┐
│  AWARDS ADMIN DASHBOARD                 │
│                                         │
│  📋 Submissions List                    │
│  ┌───┬──────────┬─────────┬──────────┐ │
│  │ID │ Project  │ Firm    │ Status   │ │
│  ├───┼──────────┼─────────┼──────────┤ │
│  │001│ Project A│ Firm 1  │ Winner   │ │
│  │002│ Project B│ Firm 2  │ Pending  │ │
│  │003│ Project C│ Firm 3  │ Winner   │ │
│  └───┴──────────┴─────────┴──────────┘ │
│                                         │
│  Actions:                               │
│  [Filter by Category]                   │
│  [Mark as Winner]                       │
│  [Export for Judges]                    │
│  [Generate Team Sheets]                 │
│  [Download All Files]                   │
│                                         │
└─────────────────────────────────────────┘
```

#### Data Flow:
```
Submission → Auto ID → Cloud Storage
     ↓
PDF Extract → Parse Fields → Sheet Row
     ↓
File Org → Create Drive Folder → Upload Files
     ↓
Email Confirm → Send to Submitter (with ID)
     ↓
Admin View → Mark Winner → Update Status
     ↓
Export → Team Sheets → For Awards Event
```

---

### 📋 Survey Module

#### Admin: Create Survey
```
┌─────────────────────────────────────────┐
│  CREATE NEW SURVEY                      │
│                                         │
│  Survey Name: [2026 Top Architects    ] │
│  Deadline:    [May 29, 2026          ] │
│  Category:    [Architects            ▼] │
│                                         │
│  Questions:                             │
│  ┌───────────────────────────────────┐  │
│  │ 1. Firm Name                      │  │
│  │    Type: [Text Input]             │  │
│  │                                   │  │
│  │ 2. Total Employees                │  │
│  │    Type: [Number]                 │  │
│  │                                   │  │
│  │ 3. Revenue Range                  │  │
│  │    Type: [Multiple Choice]        │  │
│  │    Options: Under $1M             │  │
│  │             $1M-$5M               │  │
│  │             $5M-$10M              │  │
│  │             Over $10M             │  │
│  │                                   │  │
│  │ [+ Add Question]                  │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [Save as Template] [Preview] [Send]    │
│                                         │
└─────────────────────────────────────────┘
```

#### Admin: Manage Recipients
```
┌─────────────────────────────────────────┐
│  RECIPIENT LISTS                        │
│                                         │
│  List: [Architects 2026             ▼]  │
│                                         │
│  [Import CSV] [Add Manual] [Export]     │
│                                         │
│  ┌───┬──────────┬──────────┬─────────┐ │
│  │   │ Firm     │ Contact  │ Email   │ │
│  ├───┼──────────┼──────────┼─────────┤ │
│  │ ☑ │ FFKR     │ John D.  │ jd@...  │ │
│  │ ☑ │ VCBO     │ Sarah M. │ sm@...  │ │
│  │ ☑ │ Method   │ Alex K.  │ ak@...  │ │
│  │   │ ...      │ ...      │ ...     │ │
│  └───┴──────────┴──────────┴─────────┘ │
│                                         │
│  Total: 45 firms                        │
│  [Select All] [Send Survey]             │
│                                         │
└─────────────────────────────────────────┘
```

#### Admin: Track Responses
```
┌─────────────────────────────────────────┐
│  SURVEY: 2026 TOP ARCHITECTS            │
│  Deadline: May 29, 2026 (5 days left)   │
│                                         │
│  Response Rate:                         │
│  ████████████░░░░░░░░ 65% (29/45)      │
│                                         │
│  Status Breakdown:                      │
│  ✓ Completed:     29 firms              │
│  ⏳ Started:       7 firms               │
│  ✉ Sent:          45 firms              │
│  📭 Not Opened:    9 firms               │
│                                         │
│  ┌───┬──────────┬──────────┬─────────┐ │
│  │   │ Firm     │ Status   │ Action  │ │
│  ├───┼──────────┼──────────┼─────────┤ │
│  │ ✓ │ FFKR     │ Complete │ [View]  │ │
│  │ ⏳│ VCBO     │ Started  │ [Remind]│ │
│  │ ✉ │ Method   │ Sent     │ [Remind]│ │
│  │ 📭│ Beecher  │ Not Open │ [Resend]│ │
│  └───┴──────────┴──────────┴─────────┘ │
│                                         │
│  [Send Reminder to All Non-Responders]  │
│  [Export Current Results]               │
│  [View Analytics]                       │
│                                         │
└─────────────────────────────────────────┘
```

#### Public: Survey Response Form
```
┌─────────────────────────────────────────┐
│  2026 TOP UTAH ARCHITECTS SURVEY        │
│  Utah Construction & Design             │
│                                         │
│  Progress: ████████░░░░░░░░ 45%        │
│                                         │
│  1. Firm Name *                         │
│     [Your firm name here...           ] │
│                                         │
│  2. Total Employees *                   │
│     [                                 ] │
│                                         │
│  3. Revenue Range *                     │
│     ○ Under $1M                         │
│     ○ $1M-$5M                           │
│     ● $5M-$10M                          │
│     ○ Over $10M                         │
│                                         │
│  ... (more questions)                   │
│                                         │
│  [Save Progress] [Previous] [Next]      │
│                                         │
│  Your unique link:                      │
│  tools.utahcdmag.com/s/abc123          │
│  (Return anytime to continue)           │
│                                         │
└─────────────────────────────────────────┘
```

#### Data Flow:
```
Admin Creates Survey
     ↓
Admin Uploads Recipients List
     ↓
System Generates Unique Links (one per firm)
     ↓
System Sends Emails with Links
     ↓
Recipients Click Link → Fill Survey
     ↓
Responses Auto-Save (can return later)
     ↓
On Submit → Store in Database
     ↓
Admin Views Real-Time Results
     ↓
Auto-Generated Reminders (X days before deadline)
     ↓
Admin Exports Final Results
     ↓
System Calculates Rankings
     ↓
Admin Uses for Magazine Publication
```

---

## Email Templates

### Awards Confirmation:
```
Subject: Award Submission Received - Confirmation #AW-2025-042

Dear [Submitter Name],

Thank you for submitting [Project Name] to the 2025 Utah Construction 
& Design Excellence Awards!

Your submission has been received and assigned ID: AW-2025-042

You can reference this ID if you need to contact us about your submission.

Submission Details:
- Project: [Project Name]
- Category: [Category]
- Submitted: [Date & Time]
- Files Received: 1 PDF, 8 Photos

Next Steps:
- Our panel of judges will review all submissions
- Winners will be announced at the awards ceremony on [Date]
- You will be notified via email by [Date]

Questions? Reply to this email.

Best regards,
Ladd Marshall
Utah Construction & Design
```

### Survey Invitation:
```
Subject: 2026 Top Utah Architects Survey - Your Input Needed

Hi [Contact Name],

It's time for our 13th Annual Top Utah Architectural Firm Rankings!

We'd love to include [Firm Name] in this year's rankings, which will 
be published in our May/June 2026 issue.

Complete the survey here:
https://tools.utahcdmag.com/survey/abc123

This is your unique link - you can save progress and return anytime.

Deadline: May 29, 2026 (EOB)

The survey takes about 10 minutes and covers:
- Firm statistics
- Recent projects
- Team information
- Industry insights

Thanks for your participation!

Ladd Marshall
Utah Construction & Design
M: 801-872-3531
```

### Survey Reminder:
```
Subject: Reminder: 2026 Architects Survey - 5 Days Left

Hi [Contact Name],

Just a friendly reminder that we haven't received your response to 
our 2026 Top Utah Architects Survey yet.

Continue your survey here:
https://tools.utahcdmag.com/survey/abc123
(Your progress is saved)

Deadline: May 29, 2026 - Only 5 days left!

If you've already completed this, you can ignore this reminder.

Questions? Just reply to this email.

Thanks!
Ladd Marshall
Utah Construction & Design
```

---

## Data Structure

### Awards - Master Submissions Sheet:
```
| Submission_ID | Timestamp | Project_Name | Firm | Category | Status | Winner_Category | PDF_Link | Photos_Link | ... |
|--------------|-----------|--------------|------|----------|--------|----------------|----------|-------------|-----|
| AW-2025-001  | 11/1/2025 | Project A    | ABC  | Concrete | Winner | Best Concrete  | link...  | link...     | ... |
| AW-2025-002  | 11/2/2025 | Project B    | XYZ  | Steel    | Review |                | link...  | link...     | ... |
```

### Survey - Responses Sheet:
```
| Response_ID | Survey_ID | Firm_Name | Contact | Submitted | Q1_Answer | Q2_Answer | ... |
|-------------|-----------|-----------|---------|-----------|-----------|-----------|-----|
| SR-2026-001 | ARCH-2026 | FFKR      | John D. | 5/15/2026 | Answer... | Answer... | ... |
| SR-2026-002 | ARCH-2026 | VCBO      | Sarah M.| 5/18/2026 | Answer... | Answer... | ... |
```

### Survey - Rankings (Auto-Calculated):
```
| Rank | Firm_Name | Total_Score | Employees | Revenue | Projects | ... |
|------|-----------|-------------|-----------|---------|----------|-----|
| 1    | FFKR      | 98.5        | 125       | $15M    | 48       | ... |
| 2    | VCBO      | 95.2        | 98        | $12M    | 42       | ... |
```

---

## Security & Access

### User Roles:

```
┌─────────────────────────────────────┐
│  ADMIN (Ladd + Staff)               │
│                                     │
│  Can:                               │
│  ✓ View all submissions             │
│  ✓ Mark winners                     │
│  ✓ Export data                      │
│  ✓ Create surveys                   │
│  ✓ Send invitations                 │
│  ✓ View all responses               │
│  ✓ Access admin dashboard           │
│  ✓ Manage recipient lists           │
│                                     │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  PUBLIC (Firms/Respondents)         │
│                                     │
│  Can:                               │
│  ✓ Submit awards                    │
│  ✓ Fill out surveys (with link)    │
│  ✓ Check submission status          │
│                                     │
│  Cannot:                            │
│  ✗ See others' submissions          │
│  ✗ Access admin features            │
│  ✗ View other survey responses      │
│                                     │
└─────────────────────────────────────┘
```

---

## Mobile Experience

All interfaces are mobile-responsive:

```
┌──────────────────┐
│ ☰  UC+D Tools    │  ← Mobile nav
├──────────────────┤
│                  │
│  📊 Awards       │
│  📋 Surveys      │
│  📧 Contact      │
│                  │
│  ──────────────  │
│                  │
│  Submit Award    │
│  [Tap to start]  │
│                  │
│  ──────────────  │
│                  │
│  Active Surveys: │
│  • Architects    │
│    [Take Survey] │
│                  │
└──────────────────┘
```

---

## Infrastructure

### Hosting (Google Cloud):
```
Cloud Run (Frontend)
  ├─ Auto-scaling: 0 to 10 instances
  ├─ Region: us-central1
  └─ Min instances: 1 (for fast response)

Cloud Functions (Backend)
  ├─ pdf-processor (2nd gen)
  ├─ email-sender (2nd gen)
  ├─ survey-reminder (scheduled)
  └─ photo-processor (2nd gen)

Cloud Storage
  ├─ submissions-bucket
  ├─ survey-attachments-bucket
  └─ temp-processing-bucket

Cloud Scheduler
  ├─ daily-reminders (8am)
  └─ weekly-summary (Mon 9am)
```

### External Services:
```
Google Drive API
  └─ File organization

Google Sheets API
  └─ Data storage & export

SendGrid (Email)
  ├─ Transactional emails
  ├─ Bulk survey invites
  └─ Automated reminders

reCAPTCHA v3
  └─ Spam protection

Firebase Auth (optional)
  └─ Admin authentication
```

---

## Deployment

### Development → Production:

```
┌──────────────┐
│              │
│   GitHub     │  ← Code repository
│              │
└───────┬──────┘
        │
        │ (push to main)
        ↓
┌──────────────┐
│              │
│ Cloud Build  │  ← Auto build & deploy
│              │
└───────┬──────┘
        │
        ↓
┌──────────────┐
│              │
│ Cloud Run    │  ← Production
│              │
└──────────────┘

Updates deploy in ~5 minutes
Zero downtime
Automatic rollback on failure
```

---

## Monitoring & Alerts

```
Uptime Checks:
  ✓ Frontend responds < 2s
  ✓ Forms load successfully
  ✓ File uploads work

Error Alerts (to Ladd's email):
  ⚠️ Function fails 3+ times
  ⚠️ Survey deadline approaching (3 days)
  ⚠️ Low response rate (<50% at 80% of time)
  ⚠️ Storage approaching limits

Usage Reports (weekly email):
  📊 Submissions this week
  📊 Survey responses
  📊 System health
  💰 Cost summary
```

---

## Cost Breakdown

### Monthly Hosting (Estimated):

```
Cloud Run (Frontend)
  Base: $5
  Traffic: $3
  ───────
  Subtotal: $8

Cloud Functions
  Invocations: $2
  Compute: $3
  ───────
  Subtotal: $5

Cloud Storage
  Storage: $1
  Operations: $1
  ───────
  Subtotal: $2

SendGrid (Email)
  0-1000 emails: $0 (free tier)
  1000-5000 emails: $15
  ───────
  Subtotal: $15 (during survey season)
            $0 (off-season)

Networking
  Egress: $4
  ───────
  Subtotal: $4

───────────────────
TOTAL: $19-34/month
  Awards only: $19
  With surveys: $34 (during sending)
```

### Per-Submission Costs:
```
Awards submission: ~$0.05
Survey response: ~$0.02

Very economical for the value!
```

---

## Success Metrics

### Awards Module:
```
✓ Zero manual data entry
✓ 100% accurate submissions tracking
✓ < 5 min submission time (vs 15+ min manual)
✓ Instant confirmation to submitter
✓ Easy winner selection & tracking
```

### Survey Module:
```
✓ 10+ hours saved per survey
✓ 30% higher response rate (easier to complete)
✓ Real-time response tracking
✓ Automated reminders = fewer late responses
✓ Zero data entry errors
✓ Professional appearance
```

---

## Future Enhancements (Post-Launch)

### Phase 6+ Ideas:

```
🎯 Analytics Dashboard
  - Historical trends
  - Firm participation over time
  - Category popularity
  - Response rate analytics

📱 Mobile App
  - Submit on-the-go
  - Push notifications for deadlines
  - Photo upload from phone

🤝 Firm Profiles
  - Self-service firm directory
  - Update contact info
  - Portfolio showcase

📰 Content Submission
  - Magazine article ideas
  - Project features
  - Industry news

🎟️ Event Management
  - Awards ceremony registration
  - Table assignments
  - Digital programs

💬 Messaging
  - Internal notes on submissions
  - Communication with submitters
  - Team collaboration

🔗 API Access
  - Integrate with UC+D website
  - Partner integrations
  - Third-party tools
```

---

## Questions?

This architecture is designed to:
- ✅ Be scalable
- ✅ Be maintainable
- ✅ Be cost-effective
- ✅ Provide excellent UX
- ✅ Support future growth

Ready to build this? Let's discuss timeline and budget!

– Jesse
jlmontie@gmail.com

