# Admin Portal Demo Guide

**Created:** Dec 30, 2025  
**For:** Client Review (Ladd Marshall)  
**Status:** Phase 2 Prototype

---

## What to Show Ladd

### 1. Public Submission Form (Existing)
**URL:** `https://[your-domain].com/`

- This is the existing awards submission interface
- No changes made here
- Still works as before

### 2. Admin Portal (NEW!)
**URL:** `https://[your-domain].com/admin`

#### Dashboard
- Overview stats: Total submissions, pending, winners
- Quick action buttons to jump to submissions

#### Submissions List
**URL:** `https://[your-domain].com/admin/submissions`

**Features:**
- View all submissions in a table
- Filter by status (All, Pending, Winner, Not Selected)
- Search by Awards ID, project name, or firm name
- See Awards ID, project name, firm, category, status, submission date
- Click any submission to view details

**Try showing:**
- Filter to see only "pending" submissions
- Search for a specific firm or project
- Show how the table adapts to screen width

#### Submission Detail Page
**URL:** `https://[your-domain].com/admin/submissions/[id]`

**Features:**
- All project information displayed
- Photos visible (if available)
- Current winner status shown
- "Mark as Winner" button (UI only - not functional yet)

**Note:** The winner marking is just a prototype UI. We'll make it functional after you confirm:
1. The authentication approach (Google account vs. username/password)
2. Whether you want real-time judging or offline marking

---

## Questions to Ask Ladd

### About Authentication
1. **Who needs admin access?**
   - Just you (Ladd)?
   - Multiple people?
   - Do you want to manage who has access?

2. **Login preference:**
   - Sign in with Google account? (easier, more secure)
   - Username/password specific to this site?

### About Winner Workflow
1. **Current prototype shows:**
   - A button to mark as winner
   - Field to enter award category
   - Field for notes

2. **Questions:**
   - Is this workflow what you imagined?
   - Would you want to mark multiple winners at once?
   - Need to unmark winners if you change your mind?

### About Judging (Optional - Future Phase 5)
1. **Current approach:** Judges review offline, you mark winners in admin portal
2. **Alternative:** Build a judge portal where they score in real-time
   - Would require ~2 weeks additional work
   - Can decide after you see this prototype

---

## What Happens Next

**After your feedback, we can:**

1. **Add authentication** (1 week)
   - Based on your preference
   - Lock down admin portal

2. **Make winner marking functional** (2-3 days)
   - Actually update the Google Sheet
   - Add confirmation dialogs
   - Add bulk actions if needed

3. **Move to Phase 3: Survey Module** (4 weeks)
   - Build survey creation tools
   - Send invitations
   - Track responses
   - Generate rankings

---

## Local Testing Instructions

**For Jesse's testing:**

1. Set environment variables in `frontend/.env.local`:
```bash
SHEET_ID=your-sheet-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

2. Authenticate with Google:
```bash
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/spreadsheets.readonly
```

3. Run development server:
```bash
cd frontend
npm run dev
```

4. Access admin portal:
   - Public: http://localhost:3000/
   - Admin: http://localhost:3000/admin

---

## Known Limitations (Prototype Phase)

1. **No authentication yet** - Anyone can access `/admin` currently
2. **Winner marking is UI only** - Buttons don't actually update data yet
3. **Stats are live** - Pull from actual Google Sheet
4. **Photos may not load** - Depends on Drive permissions

---

## Technical Notes

**What's been built:**
- Next.js 14 admin routes at `/admin/*`
- Server-side API routes at `/api/admin/*`
- Google Sheets integration for reading data
- Responsive design (desktop-optimized, not mobile)

**What uses what:**
- Dashboard: Reads from Google Sheets via API
- Submissions list: Reads from Google Sheets via API
- Detail page: Reads from Google Sheets via API
- Public form: Existing Cloud Run setup (unchanged)

**Infrastructure:**
- All managed by Terraform
- Data persists in Google Sheets (Phase 1) and Cloud Storage
- Admin portal is part of same Next.js app as public form
- No new hosting costs beyond existing setup

