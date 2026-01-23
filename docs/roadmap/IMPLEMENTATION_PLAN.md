# UC&D Unified Platform - Implementation Plan

**Project:** UC&D Business Tools Platform  
**Timeline:** 12 weeks (January - March 2026)  
**Developer:** Jesse Montgomery  
**Client:** Ladd Marshall - Utah Construction & Design

---

## 📋 Project Overview

### Goal
Build a unified web platform that automates:
1. Awards submission ID tracking and winner management
2. Survey distribution, response tracking, and compilation
3. Shared firm/contact management across both systems

### Success Criteria
- ✅ Awards submissions get unique IDs automatically
- ✅ Winners can be marked and tracked in admin dashboard
- ✅ Surveys can be created, distributed, and tracked online
- ✅ 80% reduction in manual survey work (30 hrs → 6 hrs)
- ✅ Real-time response tracking during survey periods
- ✅ One unified admin login for all tools
- ✅ Ready for April 2026 survey season

### Technology Stack
- **Frontend:** Next.js 14 (already in use)
  - Public submitter interface (existing)
  - Admin interface (new - what we're building)
- **Backend:** Cloud Functions (already in use)
- **Primary Data:** Google Sheets (awards)
- **Real-time Data:** Firestore (surveys, firms)
- **Storage:** Google Cloud Storage + Drive (already in use)
- **Email:** SendGrid
- **Auth:** Firebase Auth (admin login only)
- **Hosting:** Google Cloud Run (already in use)
- **Infrastructure:** Terraform (all resources managed as code)

---

## 📅 Timeline Overview

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  PHASE 1: Awards ID System        [2 weeks]  Dec 2025     │
│  PHASE 2: Portal Foundation       [3 weeks]  Jan 2026     │
│  PHASE 3: Survey Module MVP       [4 weeks]  Feb 2026     │
│  PHASE 4: Survey Complete         [3 weeks]  Mar 2026     │
│                                                             │
│  TOTAL: 12 weeks                                           │
│  READY: April 1, 2026                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Phase 1: Awards ID System Enhancement
**Duration:** 2 weeks  
**Start:** Week of December 16, 2025  
**Goal:** Add unique IDs and winner tracking to existing awards system

### Week 1: ID Generation & Schema Updates

#### Task 1.1: Update Database Schema (4 hours)
**Goal:** Add ID column and winner tracking to Google Sheet

**Steps:**
1. Open Awards master sheet
2. Insert new columns:
   - Column A: `Submission_ID` (format: AW-YYYY-NNN)
   - Column after Category: `Status` (pending/winner/not_selected)
   - Column after Status: `Winner_Category` (if winner, what award)
   - Column: `Winner_Notes` (optional notes)
3. Add data validation for Status column (dropdown)
4. Protect columns that shouldn't be edited manually
5. Create view filters:
   - "All Submissions"
   - "Winners Only"
   - "Pending Review"
6. Document new schema in Sheet description

**Deliverable:** Updated Google Sheet template

#### Task 1.2: Implement ID Generation (6 hours)
**Goal:** Auto-generate submission IDs when form is processed

**File:** `backend/pdf-processor/main.py`

**Changes:**
```python
# Add ID generation function
def generate_submission_id():
    """
    Generate unique submission ID: AW-YYYY-NNN
    Format: AW-2025-001, AW-2025-002, etc.
    """
    year = datetime.now().year
    
    # Query sheet for highest number this year
    # Pattern: AW-{year}-*
    existing_ids = get_submission_ids_for_year(year)
    
    if not existing_ids:
        next_num = 1
    else:
        # Extract numbers, find max, add 1
        numbers = [int(id.split('-')[2]) for id in existing_ids]
        next_num = max(numbers) + 1
    
    return f"AW-{year}-{next_num:03d}"

# Update main processing function
def process_submission(pdf_path, photos_paths):
    # Generate ID first
    submission_id = generate_submission_id()
    
    # Extract PDF data (existing code)
    data = extract_pdf_fields(pdf_path)
    
    # Add ID to data
    data['submission_id'] = submission_id
    data['status'] = 'pending'
    data['submitted_at'] = datetime.now().isoformat()
    
    # Rest of existing processing...
    # (Drive upload, Sheet append)
```

**Testing:**
- Test with 3 sample submissions
- Verify IDs increment correctly
- Verify no duplicate IDs possible
- Test year rollover logic

**Deliverable:** Updated `pdf-processor/main.py` with ID generation

#### Task 1.3: Update Confirmation Email (2 hours)
**Goal:** Include submission ID in confirmation email

**File:** `backend/pdf-processor/main.py` (email section)

**Changes:**
```python
def send_confirmation_email(email, submission_id, project_name):
    """Send confirmation with submission ID"""
    subject = f"Award Submission Received - #{submission_id}"
    
    body = f"""
    Dear Submitter,
    
    Thank you for submitting {project_name} to the 2025 Utah Construction 
    & Design Excellence Awards!
    
    Your submission has been received and assigned:
    
    Submission ID: {submission_id}
    
    Please save this ID for your records. You can reference it if you 
    need to contact us about your submission.
    
    Submission Details:
    - Project: {project_name}
    - Submitted: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}
    
    Next Steps:
    - Our panel of judges will review all submissions
    - Winners will be announced at the awards ceremony in February
    - You will be notified via email by [date]
    
    Questions? Reply to this email.
    
    Best regards,
    Ladd Marshall
    Utah Construction & Design
    """
    
    # Send via existing email service
    send_email(to=email, subject=subject, body=body)
```

**Testing:**
- Send test confirmation
- Verify ID appears correctly
- Check formatting on mobile/desktop

**Deliverable:** Updated email template

### Week 2: Winner Management & Testing

#### Task 1.4: Create Admin View Script (6 hours)
**Goal:** Simple script to mark winners in Google Sheet

**New File:** `scripts/mark-winner.py`

**Purpose:** Until we have full admin dashboard, provide CLI tool

**Note on Judging Workflow:**  
The client hasn't decided yet whether:
- **Option A:** Judges review offline, admin marks winners later (what we're building)
- **Option B:** Judges use online portal to score in real-time (future enhancement)

This task builds Option A. The data model supports both, so we can add judge portal later if desired (Phase 5, ~2 weeks additional work).

```python
#!/usr/bin/env python3
"""
Simple script to mark submission as winner
Usage: python mark-winner.py AW-2025-042 "Best Concrete Project"
"""

import sys
from google.oauth2 import service_account
from googleapiclient.discovery import build

SHEET_ID = 'your-sheet-id'
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

def mark_winner(submission_id, award_category):
    """Mark a submission as winner"""
    # Authenticate
    creds = service_account.Credentials.from_service_account_file(
        'credentials.json', scopes=SCOPES
    )
    service = build('sheets', 'v4', credentials=creds)
    
    # Find row with submission_id
    result = service.spreadsheets().values().get(
        spreadsheetId=SHEET_ID,
        range='Submissions!A:Z'
    ).execute()
    
    rows = result.get('values', [])
    
    # Find matching row
    for i, row in enumerate(rows):
        if row[0] == submission_id:  # Column A is submission_id
            # Update status and category
            service.spreadsheets().values().update(
                spreadsheetId=SHEET_ID,
                range=f'Submissions!{get_column_letter(status_col)}{i+1}',
                valueInputOption='USER_ENTERED',
                body={'values': [['winner']]}
            ).execute()
            
            service.spreadsheets().values().update(
                spreadsheetId=SHEET_ID,
                range=f'Submissions!{get_column_letter(category_col)}{i+1}',
                valueInputOption='USER_ENTERED',
                body={'values': [[award_category]]}
            ).execute()
            
            print(f"✅ Marked {submission_id} as winner: {award_category}")
            return
    
    print(f"❌ Submission {submission_id} not found")

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python mark-winner.py SUBMISSION_ID 'Award Category'")
        sys.exit(1)
    
    submission_id = sys.argv[1]
    category = sys.argv[2]
    
    mark_winner(submission_id, category)
```

**Testing:**
- Mark 3 test submissions as winners
- Verify Sheet updates correctly
- Test error handling (invalid ID, etc.)

**Deliverable:** Working winner marking script

#### Task 1.5: Project Team Extraction (8 hours)
**Goal:** Extract team member data from PDFs for winner sheets

**File:** `backend/pdf-processor/main.py`

**New Function:**
```python
def extract_team_members(pdf_path):
    """
    Extract all team member fields from PDF
    Returns structured data for each team role
    """
    reader = PdfReader(pdf_path)
    fields = reader.get_fields()
    
    team_data = {
        'owner': fields.get('Owner', ''),
        'architect': fields.get('Architect', ''),
        'general_contractor': fields.get('General Contractor', ''),
        'structural_engineer': fields.get('Structural Engineer', ''),
        'civil_engineer': fields.get('Civil Engineer', ''),
        'mep_engineer': fields.get('MEP Engineer', ''),
        # ... all other team roles from form
    }
    
    return team_data

def generate_team_sheet_row(submission_id):
    """
    Generate formatted row for project team sheet
    Used for awards ceremony materials
    """
    # Get submission data from Sheet
    submission = get_submission_by_id(submission_id)
    
    # Get team data from original PDF
    team = extract_team_members(submission['pdf_path'])
    
    # Format for team sheet
    return {
        'Project Name': submission['project_name'],
        'Owner': team['owner'],
        'Architect': team['architect'],
        'General Contractor': team['general_contractor'],
        # ... all team members
    }
```

**New Script:** `scripts/export-winners-team-sheet.py`
```python
"""
Export winner project team information to new Sheet
"""

def export_winners_teams():
    # Get all winners from main sheet
    winners = get_all_winners()
    
    # For each winner, extract team data
    team_data = []
    for winner in winners:
        team_row = generate_team_sheet_row(winner['submission_id'])
        team_data.append(team_row)
    
    # Create new Sheet or update existing
    write_to_sheet('Project Team Sheet 2025', team_data)
    
    print(f"✅ Exported {len(team_data)} project teams")
```

**Testing:**
- Test with 5 sample PDFs
- Verify all team fields extracted correctly
- Export to test Sheet, verify formatting

**Deliverable:** Team extraction and export functionality

#### Task 1.6: Testing & Documentation (4 hours)
**Goal:** End-to-end testing and documentation

**Testing Checklist:**
- [ ] Submit new award → receives ID
- [ ] IDs increment correctly
- [ ] No duplicate IDs possible
- [ ] Confirmation email includes ID
- [ ] Mark winner script works
- [ ] Team extraction works
- [ ] Export winners to team sheet works
- [ ] All existing features still work

**Documentation:**
- Update README with new features
- Document ID format and logic
- Document winner marking process
- Create admin guide for winner selection

**Deliverable:** Tested system + documentation

### Phase 1 Deliverables
✅ Unique submission IDs generated automatically  
✅ Winner tracking in Google Sheet  
✅ Confirmation emails with IDs  
✅ CLI tools for winner management  
✅ Project team extraction from PDFs  
✅ Updated documentation

---

## 🏗️ Phase 2: Portal Foundation
**Duration:** 3 weeks  
**Start:** January 6, 2026  
**Goal:** Create unified admin portal with authentication

**Important:** The existing public submitter interface remains unchanged. We're building a NEW admin interface alongside it in the same Next.js app:
- **Public routes:** `/` (submitter form) - existing, no changes
- **Admin routes:** `/admin/*` (management portal) - new, what we're building

Both interfaces live in the same deployment, managed by Terraform.

### Week 3: Authentication & Dashboard Shell

#### Task 2.1: Firebase Setup (4 hours)
**Goal:** Set up Firebase for authentication

**Steps:**
1. Create Firebase project
2. Enable Firebase Authentication
3. Enable Firestore
4. Create admin user account
5. Configure authorized domains
6. Get Firebase config credentials

**Configuration:**
```javascript
// firebase-config.ts
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};
```

**Deliverable:** Firebase project configured

#### Task 2.2: Admin Authentication (8 hours)
**Goal:** Add login functionality

**New Files:**
- `src/app/admin/login/page.tsx`
- `src/app/admin/layout.tsx`
- `src/lib/auth.ts`
- `src/components/AuthProvider.tsx`

**Implementation:**
```typescript
// src/app/admin/login/page.tsx
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/admin/dashboard');
    } catch (err) {
      setError('Invalid email or password');
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full space-y-8">
        <div>
          <img src="/ucd-logo.png" alt="UC&D" className="mx-auto h-12" />
          <h2 className="mt-6 text-center text-3xl font-bold">
            UC&D Admin Portal
          </h2>
        </div>
        <form onSubmit={handleLogin} className="mt-8 space-y-6">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="..."
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="..."
          />
          {error && <p className="text-red-600">{error}</p>}
          <button type="submit" className="...">
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}

// src/app/admin/layout.tsx
export default function AdminLayout({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) return <LoadingSpinner />;
  
  if (!user) {
    redirect('/admin/login');
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-64 p-8">
        {children}
      </main>
    </div>
  );
}
```

**Testing:**
- Test login with valid credentials
- Test login with invalid credentials
- Test session persistence
- Test logout

**Deliverable:** Working admin authentication

#### Task 2.3: Admin Dashboard Shell (12 hours)
**Goal:** Create main dashboard structure

**New Files:**
- `src/app/admin/dashboard/page.tsx`
- `src/components/Sidebar.tsx`
- `src/components/StatsCard.tsx`

**Dashboard Layout:**
```typescript
// src/app/admin/dashboard/page.tsx
export default function DashboardPage() {
  const stats = useStats(); // Load stats from APIs
  
  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatsCard
          title="Total Submissions"
          value={stats.submissions.total}
          subtitle="This year"
          icon={FileIcon}
        />
        <StatsCard
          title="Winners Selected"
          value={stats.submissions.winners}
          subtitle={`${stats.submissions.pending} pending`}
          icon={TrophyIcon}
        />
        <StatsCard
          title="Survey Responses"
          value={stats.surveys.responses}
          subtitle={`${stats.surveys.responseRate}% response rate`}
          icon={ChartIcon}
        />
      </div>
      
      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <QuickActionCard
          title="Awards Management"
          description="View submissions and mark winners"
          href="/admin/awards"
          icon={AwardIcon}
        />
        <QuickActionCard
          title="Survey Management"
          description="Create and manage surveys"
          href="/admin/surveys"
          icon={ClipboardIcon}
        />
      </div>
      
      {/* Recent Activity */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
        <ActivityFeed items={stats.recentActivity} />
      </div>
    </div>
  );
}

// src/components/Sidebar.tsx
export default function Sidebar() {
  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-white border-r">
      <div className="p-6">
        <img src="/ucd-logo.png" alt="UC&D" className="h-8" />
      </div>
      
      <nav className="px-3">
        <NavLink href="/admin/dashboard" icon={HomeIcon}>
          Dashboard
        </NavLink>
        <NavLink href="/admin/awards" icon={TrophyIcon}>
          Awards
        </NavLink>
        <NavLink href="/admin/surveys" icon={ClipboardIcon}>
          Surveys
        </NavLink>
        <NavLink href="/admin/firms" icon={UsersIcon}>
          Firms
        </NavLink>
        
        <div className="mt-8 pt-8 border-t">
          <NavLink href="/admin/settings" icon={SettingsIcon}>
            Settings
          </NavLink>
          <button onClick={handleLogout} className="...">
            <LogoutIcon /> Logout
          </button>
        </div>
      </nav>
    </div>
  );
}
```

**Testing:**
- Navigation works
- Stats display correctly
- Responsive on mobile
- All links work

**Deliverable:** Functional admin dashboard shell

### Week 4: Awards Admin Module

#### Task 2.4: Awards List View (10 hours)
**Goal:** Display all submissions in admin interface

**New File:** `src/app/admin/awards/page.tsx`

**Implementation:**
```typescript
export default function AwardsPage() {
  const [submissions, setSubmissions] = useState([]);
  const [filter, setFilter] = useState('all'); // all, pending, winner
  const [category, setCategory] = useState('all');
  
  useEffect(() => {
    loadSubmissions();
  }, [filter, category]);
  
  const loadSubmissions = async () => {
    // Fetch from Google Sheets via API
    const data = await fetch('/api/awards/submissions').then(r => r.json());
    setSubmissions(data);
  };
  
  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Awards Submissions</h1>
        <button className="btn-primary" onClick={exportWinners}>
          Export Winners
        </button>
      </div>
      
      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="winner">Winners</option>
          <option value="not_selected">Not Selected</option>
        </select>
        
        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="all">All Categories</option>
          <option value="concrete">Concrete</option>
          <option value="steel">Steel</option>
          {/* ... all categories */}
        </select>
        
        <input
          type="search"
          placeholder="Search projects..."
          className="..."
        />
      </div>
      
      {/* Submissions Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th>ID</th>
              <th>Project Name</th>
              <th>Firm</th>
              <th>Category</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map(submission => (
              <tr key={submission.id}>
                <td>{submission.submissionId}</td>
                <td>{submission.projectName}</td>
                <td>{submission.firm}</td>
                <td>{submission.category}</td>
                <td>
                  <StatusBadge status={submission.status} />
                </td>
                <td>{formatDate(submission.submittedAt)}</td>
                <td>
                  <button onClick={() => viewDetails(submission.id)}>
                    View
                  </button>
                  <button onClick={() => markWinner(submission.id)}>
                    Mark Winner
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**API Route:** `src/app/api/awards/submissions/route.ts`
```typescript
export async function GET(request: Request) {
  // Authenticate
  const session = await getServerSession();
  if (!session) return new Response('Unauthorized', { status: 401 });
  
  // Fetch from Google Sheets
  const sheets = getGoogleSheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.AWARDS_SHEET_ID,
    range: 'Submissions!A:Z'
  });
  
  // Parse and format data
  const submissions = parseSheetData(result.values);
  
  return Response.json(submissions);
}
```

**Testing:**
- Load submissions successfully
- Filters work correctly
- Search works
- Table displays properly
- Pagination works (if >50 submissions)

**Deliverable:** Awards list view with filters

#### Task 2.5: Winner Management (8 hours)
**Goal:** UI to mark submissions as winners

**New File:** `src/app/admin/awards/[id]/page.tsx`

**Implementation:**
```typescript
export default function SubmissionDetailPage({ params }) {
  const [submission, setSubmission] = useState(null);
  const [isWinner, setIsWinner] = useState(false);
  const [awardCategory, setAwardCategory] = useState('');
  
  useEffect(() => {
    loadSubmission(params.id);
  }, [params.id]);
  
  const handleMarkWinner = async () => {
    await fetch(`/api/awards/submissions/${params.id}/winner`, {
      method: 'POST',
      body: JSON.stringify({ isWinner: true, awardCategory })
    });
    
    toast.success('Marked as winner!');
  };
  
  return (
    <div>
      <div className="flex justify-between mb-8">
        <h1>{submission.projectName}</h1>
        <button onClick={() => window.open(submission.pdfUrl)}>
          View PDF
        </button>
      </div>
      
      {/* Submission Details */}
      <div className="grid grid-cols-2 gap-8">
        <div>
          <h2>Project Information</h2>
          <dl>
            <dt>ID</dt>
            <dd>{submission.submissionId}</dd>
            <dt>Project Name</dt>
            <dd>{submission.projectName}</dd>
            <dt>Firm</dt>
            <dd>{submission.firm}</dd>
            {/* ... all fields */}
          </dl>
        </div>
        
        <div>
          <h2>Photos</h2>
          <div className="grid grid-cols-2 gap-4">
            {submission.photos.map(photo => (
              <img src={photo} alt="" className="..." />
            ))}
          </div>
        </div>
      </div>
      
      {/* Winner Management */}
      <div className="mt-8 p-6 bg-white rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Winner Status</h2>
        
        <div className="space-y-4">
          <label>
            <input
              type="checkbox"
              checked={isWinner}
              onChange={e => setIsWinner(e.target.checked)}
            />
            Mark as Winner
          </label>
          
          {isWinner && (
            <div>
              <label>Award Category</label>
              <input
                type="text"
                value={awardCategory}
                onChange={e => setAwardCategory(e.target.value)}
                placeholder="e.g., Best Concrete Project"
                className="..."
              />
            </div>
          )}
          
          <button
            onClick={handleMarkWinner}
            disabled={isWinner && !awardCategory}
            className="btn-primary"
          >
            Save Winner Status
          </button>
        </div>
      </div>
    </div>
  );
}
```

**API:** `src/app/api/awards/submissions/[id]/winner/route.ts`
```typescript
export async function POST(request: Request, { params }) {
  const { isWinner, awardCategory } = await request.json();
  
  // Update Google Sheet
  const sheets = getGoogleSheetsClient();
  
  // Find row with submission ID
  // Update status and award category columns
  
  return Response.json({ success: true });
}
```

**Testing:**
- View submission details
- Mark as winner
- Verify Sheet updates
- Test unmark winner
- Test validation

**Deliverable:** Winner management UI

### Week 5: Integration & Polish

#### Task 2.6: Data Service Layer (8 hours)
**Goal:** Unified data access layer for all modules

**New File:** `src/lib/data-service.ts`

```typescript
import { GoogleSheets } from './sheets-service';
import { Firestore } from './firestore-service';

export class DataService {
  private sheets: GoogleSheets;
  private firestore: Firestore;
  
  constructor() {
    this.sheets = new GoogleSheets();
    this.firestore = new Firestore();
  }
  
  // ===== FIRMS (shared) =====
  
  async ensureFirm(name: string, email: string) {
    // Check Firestore registry
    let firm = await this.firestore
      .collection('firms')
      .where('name', '==', name)
      .limit(1)
      .get();
    
    if (firm.empty) {
      // Create new firm
      const firmRef = await this.firestore.collection('firms').add({
        name,
        email,
        createdAt: new Date(),
        submissionIds: [],
        surveyResponseIds: []
      });
      
      return { id: firmRef.id, name, email };
    }
    
    return { id: firm.docs[0].id, ...firm.docs[0].data() };
  }
  
  // ===== AWARDS =====
  
  async getSubmissions(filters = {}) {
    const data = await this.sheets.getValues(
      process.env.AWARDS_SHEET_ID,
      'Submissions!A:Z'
    );
    
    return this.parseSubmissions(data, filters);
  }
  
  async updateWinnerStatus(submissionId: string, data: any) {
    await this.sheets.updateRow(
      process.env.AWARDS_SHEET_ID,
      'Submissions',
      { submissionId },
      data
    );
  }
  
  // ===== SURVEYS (will implement in Phase 3) =====
  
  // ... survey methods
}

export const dataService = new DataService();
```

**Testing:**
- Test firm creation
- Test submission queries
- Test winner updates
- Test error handling

**Deliverable:** Unified data service

#### Task 2.7: Testing & Deployment (8 hours)
**Goal:** Deploy portal to production

**Testing:**
- End-to-end admin workflow
- Login/logout
- View submissions
- Mark winners
- Export data
- Mobile responsive
- Performance testing

**Deployment via Terraform:**
```bash
# Update Terraform configuration
cd terraform

# Add Firebase config to variables
terraform apply \
  -var="firebase_config=..." \
  -var="sendgrid_api_key=..."

# Terraform handles:
# - Cloud Run deployment (frontend with admin routes)
# - Cloud Functions (PDF/photo processors)
# - Cloud Storage buckets (persistent)
# - Firestore database
# - IAM permissions
# - Monitoring/alerts

# Everything remains Infrastructure as Code!
```

**Important:**
- ✅ All resources managed by Terraform
- ✅ Storage/Firestore have `prevent_destroy = true`
- ✅ Can run `terraform apply` anytime to update
- ✅ No manual `gcloud` commands needed

**Deliverable:** Live admin portal (Terraform-managed)

### Phase 2 Deliverables

**Completed (Dec 30, 2025) - Prototype for Client Review:**
✅ Admin portal structure (`/admin/*` routes)  
✅ Dashboard with overview stats (Task 2.3)  
✅ Awards list view with filters and search (Task 2.4)  
✅ Submission detail page with all data  
✅ Winner management UI (prototype - not functional yet)  
✅ Google Sheets integration for reading data  

**Pending Client Input:**
⏸️ Firebase authentication (Task 2.1, 2.2) - waiting on auth preference  
⏸️ Functional winner marking (Task 2.5) - UI ready, needs implementation  
⏸️ Data service layer (Task 2.6) - can add if needed  
⏸️ Production deployment (Task 2.7) - ready to deploy after auth decision

**Status:** Ready for client demo and feedback before completing Phase 2

---

## 📋 Phase 3: Survey Module MVP
**Duration:** 4 weeks  
**Start:** February 3, 2026  
**Goal:** Core survey functionality (create, send, track)

### Week 6: Survey Creation

#### Task 3.1: Firestore Schema Setup (4 hours)
**Goal:** Define survey data structure

**Collections:**
```typescript
// surveys/{surveyId}
{
  id: string,
  name: string, // "2026 Top Architects"
  type: 'architects' | 'gc' | 'engineers',
  questions: Question[],
  deadline: Timestamp,
  createdAt: Timestamp,
  status: 'draft' | 'active' | 'closed',
  createdBy: string // admin user id
}

// survey-questions (sub-collection)
{
  id: string,
  surveyId: string,
  questionText: string,
  questionType: 'text' | 'number' | 'choice' | 'scale',
  options?: string[], // for choice questions
  required: boolean,
  order: number
}

// survey-recipients/{recipientId}
{
  id: string,
  surveyId: string,
  firmId: string,
  firmName: string,
  contactName: string,
  email: string,
  responseToken: string, // unique link token
  status: 'sent' | 'opened' | 'started' | 'completed',
  sentAt: Timestamp,
  openedAt?: Timestamp,
  completedAt?: Timestamp
}

// survey-responses/{responseId}
{
  id: string,
  surveyId: string,
  recipientId: string,
  firmId: string,
  answers: { [questionId: string]: any },
  submittedAt: Timestamp,
  partialSaveAt?: Timestamp
}

// firms/{firmId}
{
  id: string,
  name: string,
  email: string,
  firmType: string, // architect, gc, engineer
  submissionIds: string[],
  surveyResponseIds: string[]
}
```

**Firestore Rules:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public can read/write their own survey responses
    match /survey-responses/{responseId} {
      allow read: if request.auth.token.responseToken == resource.data.responseToken;
      allow create: if request.auth.token.responseToken != null;
      allow update: if request.auth.token.responseToken == resource.data.responseToken;
    }
    
    // Admin only for surveys and recipients
    match /surveys/{surveyId} {
      allow read, write: if request.auth.token.admin == true;
    }
    
    match /survey-recipients/{recipientId} {
      allow read, write: if request.auth.token.admin == true;
    }
    
    match /firms/{firmId} {
      allow read, write: if request.auth.token.admin == true;
    }
  }
}
```

**Deliverable:** Firestore collections and security rules

#### Task 3.2: Survey Builder UI (16 hours)
**Goal:** Interface to create surveys

**New File:** `src/app/admin/surveys/new/page.tsx`

```typescript
export default function NewSurveyPage() {
  const [survey, setSurvey] = useState({
    name: '',
    type: 'architects',
    deadline: '',
    questions: []
  });
  
  const addQuestion = () => {
    setSurvey({
      ...survey,
      questions: [
        ...survey.questions,
        {
          id: generateId(),
          text: '',
          type: 'text',
          required: true,
          order: survey.questions.length
        }
      ]
    });
  };
  
  const updateQuestion = (id, updates) => {
    setSurvey({
      ...survey,
      questions: survey.questions.map(q =>
        q.id === id ? { ...q, ...updates } : q
      )
    });
  };
  
  const handleSave = async () => {
    await fetch('/api/surveys', {
      method: 'POST',
      body: JSON.stringify(survey)
    });
    
    router.push('/admin/surveys');
  };
  
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Create New Survey</h1>
      
      {/* Basic Info */}
      <div className="bg-white rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Survey Details</h2>
        
        <div className="space-y-4">
          <div>
            <label>Survey Name</label>
            <input
              type="text"
              value={survey.name}
              onChange={e => setSurvey({ ...survey, name: e.target.value })}
              placeholder="2026 Top Utah Architects"
              className="..."
            />
          </div>
          
          <div>
            <label>Type</label>
            <select
              value={survey.type}
              onChange={e => setSurvey({ ...survey, type: e.target.value })}
            >
              <option value="architects">Architects</option>
              <option value="gc">General Contractors</option>
              <option value="engineers">Engineers</option>
            </select>
          </div>
          
          <div>
            <label>Deadline</label>
            <input
              type="date"
              value={survey.deadline}
              onChange={e => setSurvey({ ...survey, deadline: e.target.value })}
              className="..."
            />
          </div>
        </div>
      </div>
      
      {/* Questions */}
      <div className="bg-white rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Questions</h2>
          <button onClick={addQuestion} className="btn-primary">
            Add Question
          </button>
        </div>
        
        <div className="space-y-4">
          {survey.questions.map((question, index) => (
            <QuestionEditor
              key={question.id}
              question={question}
              index={index}
              onUpdate={updates => updateQuestion(question.id, updates)}
              onDelete={() => deleteQuestion(question.id)}
            />
          ))}
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex gap-4">
        <button onClick={handleSave} className="btn-primary">
          Create Survey
        </button>
        <button onClick={() => router.back()} className="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
}

// Question Editor Component
function QuestionEditor({ question, index, onUpdate, onDelete }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between mb-4">
        <span className="font-semibold">Question {index + 1}</span>
        <button onClick={onDelete} className="text-red-600">
          Delete
        </button>
      </div>
      
      <div className="space-y-3">
        <div>
          <label>Question Text</label>
          <input
            type="text"
            value={question.text}
            onChange={e => onUpdate({ text: e.target.value })}
            placeholder="Enter your question"
            className="..."
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label>Type</label>
            <select
              value={question.type}
              onChange={e => onUpdate({ type: e.target.value })}
            >
              <option value="text">Text Input</option>
              <option value="number">Number</option>
              <option value="choice">Multiple Choice</option>
              <option value="scale">Rating Scale</option>
            </select>
          </div>
          
          <div>
            <label>
              <input
                type="checkbox"
                checked={question.required}
                onChange={e => onUpdate({ required: e.target.checked })}
              />
              Required
            </label>
          </div>
        </div>
        
        {question.type === 'choice' && (
          <div>
            <label>Options (one per line)</label>
            <textarea
              value={question.options?.join('\n') || ''}
              onChange={e => onUpdate({ options: e.target.value.split('\n') })}
              rows={4}
              className="..."
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

**API:** `src/app/api/surveys/route.ts`
```typescript
export async function POST(request: Request) {
  const data = await request.json();
  
  // Create survey in Firestore
  const surveyRef = await db.collection('surveys').add({
    ...data,
    createdAt: new Date(),
    status: 'draft'
  });
  
  return Response.json({ id: surveyRef.id });
}
```

**Testing:**
- Create survey with 5 questions
- Test different question types
- Test validation
- Save and load survey

**Deliverable:** Survey creation UI

### Week 7: Recipient Management & Email

#### Task 3.3: Recipient List Management (10 hours)
**Goal:** Upload and manage recipient lists

**New File:** `src/app/admin/surveys/[id]/recipients/page.tsx`

```typescript
export default function RecipientsPage({ params }) {
  const [recipients, setRecipients] = useState([]);
  const [survey, setSurvey] = useState(null);
  
  const handleCSVUpload = async (file) => {
    const data = await parseCSV(file);
    
    // Validate CSV format
    // Expected columns: Firm Name, Contact Name, Email
    
    // Create recipients
    const recipientsData = data.map(row => ({
      surveyId: params.id,
      firmName: row['Firm Name'],
      contactName: row['Contact Name'],
      email: row['Email'],
      responseToken: generateToken(),
      status: 'pending'
    }));
    
    // Save to Firestore
    await saveRecipients(recipientsData);
    
    setRecipients(recipientsData);
  };
  
  const handleSendInvites = async () => {
    const confirmed = confirm(
      `Send survey invites to ${recipients.length} recipients?`
    );
    
    if (!confirmed) return;
    
    // Trigger Cloud Function to send emails
    await fetch(`/api/surveys/${params.id}/send-invites`, {
      method: 'POST'
    });
    
    toast.success('Invites are being sent!');
  };
  
  return (
    <div>
      <h1>{survey?.name} - Recipients</h1>
      
      {/* Upload CSV */}
      <div className="bg-white rounded-lg p-6 mb-6">
        <h2>Upload Recipient List</h2>
        <p className="text-gray-600 mb-4">
          CSV file with columns: Firm Name, Contact Name, Email
        </p>
        
        <input
          type="file"
          accept=".csv"
          onChange={e => handleCSVUpload(e.target.files[0])}
        />
        
        <a href="/templates/recipients-template.csv" className="...">
          Download Template
        </a>
      </div>
      
      {/* Recipients Table */}
      <div className="bg-white rounded-lg p-6">
        <div className="flex justify-between mb-4">
          <h2>Recipients ({recipients.length})</h2>
          <button
            onClick={handleSendInvites}
            disabled={recipients.length === 0}
            className="btn-primary"
          >
            Send Invites
          </button>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Firm</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Status</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {recipients.map(recipient => (
              <tr key={recipient.id}>
                <td>{recipient.firmName}</td>
                <td>{recipient.contactName}</td>
                <td>{recipient.email}</td>
                <td><StatusBadge status={recipient.status} /></td>
                <td>
                  <button onClick={() => copyLink(recipient.responseToken)}>
                    Copy Link
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Deliverable:** Recipient management UI

#### Task 3.4: SendGrid Integration (6 hours)
**Goal:** Send survey invitation emails

**New File:** `backend/email-sender/main.py`

```python
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import functions_framework
import os

@functions_framework.http
def send_survey_invite(request):
    """
    Cloud Function to send survey invites
    Triggered by admin action
    """
    data = request.get_json()
    survey_id = data['survey_id']
    
    # Get survey details from Firestore
    survey = get_survey(survey_id)
    
    # Get all recipients
    recipients = get_recipients(survey_id)
    
    # Send email to each recipient
    for recipient in recipients:
        send_email(survey, recipient)
    
    return {'sent': len(recipients)}

def send_email(survey, recipient):
    """Send individual survey invite email"""
    
    survey_link = f"https://tools.utahcdmag.com/survey/{recipient['responseToken']}"
    
    message = Mail(
        from_email='lmarshall@utahcdmag.com',
        to_emails=recipient['email'],
        subject=f"{survey['name']} - Your Input Needed",
        html_content=f"""
        <html>
        <body style="font-family: Arial, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto;">
                <img src="https://www.utahcdmag.com/logo.png" alt="UC&D" style="height: 60px; margin-bottom: 20px;">
                
                <h1>Survey Invitation</h1>
                
                <p>Hi {recipient['contactName']},</p>
                
                <p>It's time for our {survey['name']}!</p>
                
                <p>We'd love to include {recipient['firmName']} in this year's rankings, 
                which will be published in our upcoming issue.</p>
                
                <p style="text-align: center; margin: 30px 0;">
                    <a href="{survey_link}" 
                       style="background: #1a73e8; color: white; padding: 15px 30px; 
                              text-decoration: none; border-radius: 5px; display: inline-block;">
                        Take Survey
                    </a>
                </p>
                
                <p>This is your unique link - you can save progress and return anytime.</p>
                
                <p><strong>Deadline:</strong> {survey['deadline'].strftime('%B %d, %Y')}</p>
                
                <p>The survey takes about 10 minutes.</p>
                
                <p>Thanks for your participation!</p>
                
                <p>
                    Ladd Marshall<br>
                    Utah Construction & Design<br>
                    M: 801-872-3531
                </p>
                
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
                
                <p style="font-size: 12px; color: #666;">
                    Your unique survey link: {survey_link}
                </p>
            </div>
        </body>
        </html>
        """
    )
    
    sg = SendGridAPIClient(os.environ.get('SENDGRID_API_KEY'))
    response = sg.send(message)
    
    # Update recipient status
    update_recipient_status(recipient['id'], 'sent')
    
    return response.status_code
```

**Deploy:**
```bash
cd backend/email-sender
gcloud functions deploy send-survey-invite \
  --runtime python311 \
  --trigger-http \
  --entry-point send_survey_invite \
  --set-env-vars SENDGRID_API_KEY=...
```

**Testing:**
- Send test invite to your email
- Verify link works
- Check email formatting
- Test with multiple recipients

**Deliverable:** Email sending functionality

### Week 8: Survey Response Form

#### Task 3.5: Public Survey Form (14 hours)
**Goal:** Public-facing survey response form

**New File:** `src/app/survey/[token]/page.tsx`

```typescript
export default function SurveyResponsePage({ params }) {
  const [survey, setSurvey] = useState(null);
  const [recipient, setRecipient] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentPage, setCurrentPage] = useState(0);
  const [saving, setSaving] = useState(false);
  
  useEffect(() => {
    loadSurvey(params.token);
  }, [params.token]);
  
  const loadSurvey = async (token) => {
    // Verify token and load survey
    const data = await fetch(`/api/survey/load?token=${token}`).then(r => r.json());
    
    if (data.error) {
      setError(data.error);
      return;
    }
    
    setSurvey(data.survey);
    setRecipient(data.recipient);
    
    // Load any existing partial responses
    if (data.partialResponse) {
      setAnswers(data.partialResponse.answers);
    }
  };
  
  const saveProgress = async () => {
    setSaving(true);
    
    await fetch('/api/survey/save-progress', {
      method: 'POST',
      body: JSON.stringify({
        token: params.token,
        answers
      })
    });
    
    setSaving(false);
    toast.success('Progress saved!');
  };
  
  const submitSurvey = async () => {
    // Validate all required questions answered
    const unanswered = survey.questions
      .filter(q => q.required && !answers[q.id])
      .map(q => q.text);
    
    if (unanswered.length > 0) {
      alert(`Please answer: ${unanswered.join(', ')}`);
      return;
    }
    
    // Submit
    await fetch('/api/survey/submit', {
      method: 'POST',
      body: JSON.stringify({
        token: params.token,
        answers
      })
    });
    
    router.push('/survey/thank-you');
  };
  
  const questionsPerPage = 5;
  const totalPages = Math.ceil(survey?.questions.length / questionsPerPage);
  const currentQuestions = survey?.questions.slice(
    currentPage * questionsPerPage,
    (currentPage + 1) * questionsPerPage
  );
  
  if (!survey) return <LoadingSpinner />;
  
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg p-8 mb-6">
          <img src="/ucd-logo.png" alt="UC&D" className="h-12 mb-4" />
          <h1 className="text-3xl font-bold">{survey.name}</h1>
          <p className="text-gray-600 mt-2">
            Deadline: {formatDate(survey.deadline)}
          </p>
        </div>
        
        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span>Progress</span>
            <span>{Math.round((currentPage + 1) / totalPages * 100)}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full">
            <div
              className="h-2 bg-blue-600 rounded-full transition-all"
              style={{ width: `${(currentPage + 1) / totalPages * 100}%` }}
            />
          </div>
        </div>
        
        {/* Questions */}
        <div className="bg-white rounded-lg p-8">
          {currentQuestions.map((question, index) => (
            <div key={question.id} className="mb-8 last:mb-0">
              <label className="block text-lg font-medium mb-3">
                {currentPage * questionsPerPage + index + 1}. {question.text}
                {question.required && <span className="text-red-600">*</span>}
              </label>
              
              <QuestionInput
                question={question}
                value={answers[question.id]}
                onChange={value => setAnswers({ ...answers, [question.id]: value })}
              />
            </div>
          ))}
        </div>
        
        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <button
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="btn-secondary"
          >
            Previous
          </button>
          
          <button
            onClick={saveProgress}
            disabled={saving}
            className="btn-secondary"
          >
            {saving ? 'Saving...' : 'Save Progress'}
          </button>
          
          {currentPage < totalPages - 1 ? (
            <button
              onClick={() => setCurrentPage(p => p + 1)}
              className="btn-primary"
            >
              Next
            </button>
          ) : (
            <button
              onClick={submitSurvey}
              className="btn-primary"
            >
              Submit Survey
            </button>
          )}
        </div>
        
        {/* Help Text */}
        <p className="text-center text-sm text-gray-600 mt-6">
          Your progress is automatically saved. You can return to this page anytime using your unique link.
        </p>
      </div>
    </div>
  );
}

// Question Input Component
function QuestionInput({ question, value, onChange }) {
  switch (question.type) {
    case 'text':
      return (
        <textarea
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          rows={3}
          className="w-full border rounded-lg p-3"
        />
      );
    
    case 'number':
      return (
        <input
          type="number"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className="w-full border rounded-lg p-3"
        />
      );
    
    case 'choice':
      return (
        <div className="space-y-2">
          {question.options.map(option => (
            <label key={option} className="flex items-center">
              <input
                type="radio"
                name={question.id}
                checked={value === option}
                onChange={() => onChange(option)}
                className="mr-2"
              />
              {option}
            </label>
          ))}
        </div>
      );
    
    case 'scale':
      return (
        <div className="flex justify-between items-center">
          {[1, 2, 3, 4, 5].map(num => (
            <label key={num} className="flex flex-col items-center">
              <input
                type="radio"
                name={question.id}
                checked={value === num}
                onChange={() => onChange(num)}
                className="mb-1"
              />
              <span>{num}</span>
            </label>
          ))}
        </div>
      );
    
    default:
      return null;
  }
}
```

**API Routes:**
- `src/app/api/survey/load/route.ts` - Load survey by token
- `src/app/api/survey/save-progress/route.ts` - Save partial response
- `src/app/api/survey/submit/route.ts` - Submit final response

**Testing:**
- Load survey with valid token
- Answer all questions
- Save progress
- Close and reopen (verify progress saved)
- Submit survey
- Try invalid token

**Deliverable:** Working public survey form

### Week 9: Response Tracking

#### Task 3.6: Response Dashboard (12 hours)
**Goal:** Admin dashboard to track survey responses

**New File:** `src/app/admin/surveys/[id]/responses/page.tsx`

```typescript
export default function SurveyResponsesPage({ params }) {
  const [survey, setSurvey] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [responses, setResponses] = useState([]);
  const [stats, setStats] = useState(null);
  
  useEffect(() => {
    loadData(params.id);
    
    // Set up real-time listener
    const unsubscribe = db.collection('survey-responses')
      .where('surveyId', '==', params.id)
      .onSnapshot(snapshot => {
        // Update responses in real-time
        const newResponses = snapshot.docs.map(d => d.data());
        setResponses(newResponses);
        updateStats(newResponses);
      });
    
    return () => unsubscribe();
  }, [params.id]);
  
  const calculateStats = (responses, recipients) => {
    const completed = responses.filter(r => r.status === 'completed').length;
    const started = responses.filter(r => r.status === 'started').length;
    const total = recipients.length;
    
    return {
      completed,
      started,
      notStarted: total - completed - started,
      responseRate: Math.round((completed / total) * 100),
      daysUntilDeadline: Math.ceil(
        (survey.deadline.toDate() - new Date()) / (1000 * 60 * 60 * 24)
      )
    };
  };
  
  const sendReminders = async (recipientIds) => {
    await fetch(`/api/surveys/${params.id}/send-reminders`, {
      method: 'POST',
      body: JSON.stringify({ recipientIds })
    });
    
    toast.success('Reminders sent!');
  };
  
  return (
    <div>
      <div className="flex justify-between mb-8">
        <h1>{survey?.name} - Responses</h1>
        <button onClick={exportResults} className="btn-primary">
          Export Results
        </button>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Response Rate"
          value={`${stats.responseRate}%`}
          subtitle={`${stats.completed} of ${recipients.length}`}
          color="blue"
        />
        <StatsCard
          title="Completed"
          value={stats.completed}
          subtitle="Fully submitted"
          color="green"
        />
        <StatsCard
          title="In Progress"
          value={stats.started}
          subtitle="Partially completed"
          color="yellow"
        />
        <StatsCard
          title="Not Started"
          value={stats.notStarted}
          subtitle="Haven't opened"
          color="gray"
        />
      </div>
      
      {/* Deadline Alert */}
      {stats.daysUntilDeadline <= 3 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <p className="font-semibold">
            ⚠️ Only {stats.daysUntilDeadline} days until deadline!
          </p>
          <button
            onClick={() => sendReminders(nonRespondersIds)}
            className="mt-2 btn-primary"
          >
            Send Reminders to Non-Responders
          </button>
        </div>
      )}
      
      {/* Recipients Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table>
          <thead>
            <tr>
              <th>
                <input type="checkbox" onChange={selectAll} />
              </th>
              <th>Firm</th>
              <th>Contact</th>
              <th>Status</th>
              <th>Sent</th>
              <th>Completed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {recipients.map(recipient => {
              const response = responses.find(r => r.recipientId === recipient.id);
              
              return (
                <tr key={recipient.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.includes(recipient.id)}
                      onChange={() => toggleSelect(recipient.id)}
                    />
                  </td>
                  <td>{recipient.firmName}</td>
                  <td>{recipient.contactName}</td>
                  <td>
                    <StatusBadge status={response?.status || 'not_started'} />
                  </td>
                  <td>{formatDate(recipient.sentAt)}</td>
                  <td>
                    {response?.completedAt && formatDate(response.completedAt)}
                  </td>
                  <td>
                    <button onClick={() => viewResponse(response?.id)}>
                      View
                    </button>
                    <button onClick={() => sendReminders([recipient.id])}>
                      Remind
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Selected Actions */}
      {selected.length > 0 && (
        <div className="fixed bottom-6 right-6 bg-white shadow-lg rounded-lg p-4">
          <p className="mb-2">{selected.length} selected</p>
          <button onClick={() => sendReminders(selected)} className="btn-primary">
            Send Reminders
          </button>
        </div>
      )}
    </div>
  );
}
```

**Deliverable:** Real-time response tracking dashboard

### Phase 3 Deliverables
✅ Survey creation UI  
✅ Recipient list management  
✅ Email invitations via SendGrid  
✅ Public survey response form  
✅ Real-time response tracking  
✅ Admin dashboard for surveys  
✅ Reminder functionality

---

## 🎨 Phase 4: Survey Module Complete
**Duration:** 3 weeks  
**Start:** March 3, 2026  
**Goal:** Polish, results, and export features

### Week 10: Results & Export

#### Task 4.1: Results Visualization (10 hours)
**Goal:** Display survey results and analytics

**New File:** `src/app/admin/surveys/[id]/results/page.tsx`

```typescript
export default function SurveyResultsPage({ params }) {
  const [survey, setSurvey] = useState(null);
  const [responses, setResponses] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  
  useEffect(() => {
    loadResults(params.id);
  }, [params.id]);
  
  const calculateAnalytics = (responses) => {
    // For each question, calculate stats
    return survey.questions.map(question => {
      const answers = responses.map(r => r.answers[question.id]);
      
      switch (question.type) {
        case 'number':
          return {
            questionId: question.id,
            question: question.text,
            type: 'number',
            average: average(answers),
            median: median(answers),
            min: Math.min(...answers),
            max: Math.max(...answers)
          };
        
        case 'choice':
          const counts = {};
          answers.forEach(answer => {
            counts[answer] = (counts[answer] || 0) + 1;
          });
          return {
            questionId: question.id,
            question: question.text,
            type: 'choice',
            distribution: counts
          };
        
        case 'scale':
          const scaleCounts = {};
          answers.forEach(answer => {
            scaleCounts[answer] = (scaleCounts[answer] || 0) + 1;
          });
          return {
            questionId: question.id,
            question: question.text,
            type: 'scale',
            average: average(answers),
            distribution: scaleCounts
          };
        
        default:
          return {
            questionId: question.id,
            question: question.text,
            type: 'text',
            answers: answers
          };
      }
    });
  };
  
  return (
    <div>
      <h1>{survey?.name} - Results</h1>
      
      <div className="mb-8">
        <button onClick={exportToSheets} className="btn-primary">
          Export to Google Sheets
        </button>
        <button onClick={downloadCSV} className="btn-secondary">
          Download CSV
        </button>
      </div>
      
      {/* Question Results */}
      <div className="space-y-8">
        {analytics?.map(result => (
          <div key={result.questionId} className="bg-white rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">{result.question}</h3>
            
            {result.type === 'number' && (
              <div className="grid grid-cols-4 gap-4">
                <StatBox label="Average" value={result.average.toFixed(1)} />
                <StatBox label="Median" value={result.median} />
                <StatBox label="Min" value={result.min} />
                <StatBox label="Max" value={result.max} />
              </div>
            )}
            
            {result.type === 'choice' && (
              <BarChart data={result.distribution} />
            )}
            
            {result.type === 'scale' && (
              <div>
                <p className="mb-4">Average: {result.average.toFixed(1)}</p>
                <BarChart data={result.distribution} />
              </div>
            )}
            
            {result.type === 'text' && (
              <div className="space-y-2">
                {result.answers.map((answer, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded">
                    {answer}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Deliverable:** Results visualization

#### Task 4.2: Export to Sheets (8 hours)
**Goal:** Export survey results to Google Sheets

**New File:** `src/app/api/surveys/[id]/export/route.ts`

```typescript
export async function POST(request: Request, { params }) {
  const { surveyId } = params;
  
  // Get survey and responses
  const survey = await getSurvey(surveyId);
  const responses = await getSurveyResponses(surveyId);
  
  // Format for Sheet
  const headers = [
    'Firm Name',
    'Contact Name',
    'Email',
    'Submitted At',
    ...survey.questions.map(q => q.text)
  ];
  
  const rows = responses.map(response => [
    response.firmName,
    response.contactName,
    response.email,
    response.submittedAt.toISOString(),
    ...survey.questions.map(q => response.answers[q.id] || '')
  ]);
  
  // Write to new Sheet
  const sheets = getGoogleSheetsClient();
  
  // Create new sheet or update existing
  const sheetName = `${survey.name} - Responses`;
  
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SURVEYS_SHEET_ID,
    range: `${sheetName}!A1:ZZ`,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [headers, ...rows]
    }
  });
  
  return Response.json({ success: true, sheetName });
}
```

**Deliverable:** Export to Sheets functionality

### Week 11: Rankings & Polish

#### Task 4.3: Auto-Calculate Rankings (8 hours)
**Goal:** Generate rankings from survey responses

**New File:** `src/lib/rankings-calculator.ts`

```typescript
export function calculateRankings(responses: SurveyResponse[], criteria: RankingCriteria) {
  // Group responses by firm
  const firmData = groupBy(responses, r => r.firmId);
  
  // For each firm, calculate scores
  const scores = Object.entries(firmData).map(([firmId, firmResponses]) => {
    const response = firmResponses[0]; // One response per firm
    
    let score = 0;
    let weights = 0;
    
    // Calculate weighted score based on criteria
    criteria.forEach(criterion => {
      const answer = response.answers[criterion.questionId];
      const weight = criterion.weight || 1;
      
      score += parseFloat(answer || 0) * weight;
      weights += weight;
    });
    
    return {
      firmId,
      firmName: response.firmName,
      score: score / weights,
      rawScore: score,
      ...extractKeyMetrics(response, criteria)
    };
  });
  
  // Sort by score
  scores.sort((a, b) => b.score - a.score);
  
  // Assign ranks
  return scores.map((item, index) => ({
    ...item,
    rank: index + 1
  }));
}

function extractKeyMetrics(response, criteria) {
  // Pull out key metrics for display
  // e.g., employees, revenue, projects
  return {
    employees: response.answers['employees_question_id'],
    revenue: response.answers['revenue_question_id'],
    projects: response.answers['projects_question_id']
  };
}
```

**UI:** `src/app/admin/surveys/[id]/rankings/page.tsx`

```typescript
export default function SurveyRankingsPage({ params }) {
  const [rankings, setRankings] = useState([]);
  const [criteria, setCriteria] = useState([]);
  
  const calculateRankings = () => {
    // Get responses
    // Apply ranking algorithm
    // Display results
  };
  
  return (
    <div>
      <h1>Survey Rankings</h1>
      
      {/* Ranking Criteria */}
      <div className="bg-white rounded-lg p-6 mb-6">
        <h2>Ranking Criteria</h2>
        {/* Configure which questions and weights to use */}
      </div>
      
      {/* Rankings Table */}
      <div className="bg-white rounded-lg overflow-hidden">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Firm</th>
              <th>Score</th>
              <th>Employees</th>
              <th>Revenue</th>
              <th>Projects</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map(item => (
              <tr key={item.firmId}>
                <td className="text-2xl font-bold">#{item.rank}</td>
                <td>{item.firmName}</td>
                <td>{item.score.toFixed(1)}</td>
                <td>{item.employees}</td>
                <td>{item.revenue}</td>
                <td>{item.projects}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="mt-6">
        <button onClick={exportRankings} className="btn-primary">
          Export Rankings
        </button>
      </div>
    </div>
  );
}
```

**Deliverable:** Rankings calculation and display

#### Task 4.4: UI Polish & Mobile Optimization (12 hours)
**Goal:** Polish all UIs, optimize for mobile

**Tasks:**
- Responsive design for all pages
- Loading states and skeleton screens
- Error handling and user feedback
- Accessibility improvements (a11y)
- Performance optimization
- Browser testing (Chrome, Safari, Firefox)
- Mobile testing (iOS, Android)

**Deliverable:** Polished, mobile-friendly UI

### Week 12: Testing & Documentation

#### Task 4.5: End-to-End Testing (12 hours)
**Goal:** Comprehensive testing of entire system

**Test Plan:**

**Awards Module:**
- [ ] Submit new award → receives ID ✓
- [ ] Confirmation email with ID ✓
- [ ] View in admin dashboard ✓
- [ ] Mark as winner ✓
- [ ] Export winners list ✓
- [ ] Generate team sheets ✓

**Survey Module:**
- [ ] Create new survey ✓
- [ ] Upload recipient list ✓
- [ ] Send invitations ✓
- [ ] Receive and open survey ✓
- [ ] Fill out partially, save progress ✓
- [ ] Return and complete ✓
- [ ] View responses in admin ✓
- [ ] Send reminders ✓
- [ ] Export results ✓
- [ ] Calculate rankings ✓

**Integration:**
- [ ] Login works ✓
- [ ] Navigation between modules ✓
- [ ] Firm data shared correctly ✓
- [ ] Performance acceptable ✓
- [ ] Mobile experience good ✓

**Deliverable:** Tested, production-ready system

#### Task 4.6: Documentation (8 hours)
**Goal:** Complete user and admin documentation

**Documents to Create:**

1. **Admin User Guide**
   - How to log in
   - Managing awards submissions
   - Marking winners
   - Creating surveys
   - Managing recipients
   - Viewing responses
   - Exporting data

2. **Technical Documentation**
   - System architecture
   - Data flow diagrams
   - API documentation
   - Deployment procedures
   - Backup procedures
   - Troubleshooting guide

3. **Quick Start Guide**
   - For Ladd to reference
   - Common tasks
   - FAQs

**Deliverable:** Complete documentation

### Phase 4 Deliverables
✅ Results visualization  
✅ Export to Google Sheets  
✅ Rankings calculation  
✅ Polished, mobile-friendly UI  
✅ Comprehensive testing  
✅ Complete documentation  
✅ Production-ready system

---

## 📦 Final Deployment & Handoff
**Duration:** 1 day  
**Date:** March 31, 2026

### Task 5.1: Production Deployment (4 hours)
**Goal:** Deploy complete system to production

**Checklist:**
- [ ] All environment variables configured
- [ ] Firebase configured
- [ ] SendGrid configured
- [ ] Google Sheets/Drive/Firestore access verified
- [ ] SSL certificates valid
- [ ] Custom domain configured (if applicable)
- [ ] Monitoring and alerts set up
- [ ] Backup procedures in place

**Deployment via Terraform:**
```bash
# Everything deployed through Terraform
cd terraform

# Update terraform.tfvars with final config
terraform plan  # Review changes
terraform apply # Deploy

# Terraform manages:
# - Persistent storage (with lifecycle protection)
# - Compute resources (scale to zero when idle)
# - Networking and security
# - IAM and permissions

# Verify deployment
curl https://tools.utahcdmag.com
curl https://tools.utahcdmag.com/api/health
curl https://tools.utahcdmag.com/admin/login
```

**Terraform Configuration for Persistent Data:**
```hcl
# terraform/storage.tf
resource "google_storage_bucket" "submissions" {
  name     = "${var.project_id}-awards-submissions"
  location = var.region
  
  lifecycle {
    prevent_destroy = true  # Safety: never delete
  }
}

resource "google_firestore_database" "surveys" {
  name     = "(default)"
  location = var.region
  type     = "FIRESTORE_NATIVE"
  
  lifecycle {
    prevent_destroy = true  # Safety: never delete
  }
}

# Compute scales to zero automatically
resource "google_cloud_run_service" "frontend" {
  name     = "frontend"
  location = var.region
  
  template {
    spec {
      containers {
        image = var.frontend_image
      }
    }
    
    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale" = "0"  # Scale to zero
        "autoscaling.knative.dev/maxScale" = "10"
      }
    }
  }
}
```

### Task 5.2: Training Session (2 hours)
**Goal:** Train Ladd on using the system

**Agenda:**
1. System overview (15 min)
2. Awards management walkthrough (20 min)
3. Survey creation walkthrough (30 min)
4. Response tracking and export (20 min)
5. Q&A and practice (35 min)

**Deliverable:** Trained admin user

### Task 5.3: Final Handoff (2 hours)
**Goal:** Transfer ownership and knowledge

**Deliverables:**
- Access credentials
- Documentation
- Source code access
- Support contact information
- Backup of all data
- System monitoring dashboard access

---

## 📊 Project Tracking

### Weekly Status Reports

**Format:**
```
Week X Report
────────────────────────────────────
Completed:
- Task 1 ✓
- Task 2 ✓

In Progress:
- Task 3 (50%)

Blockers:
- None / Issue description

Next Week:
- Task 4
- Task 5

Hours This Week: X of Y estimated
```

### Milestones

| Milestone | Date | Status |
|-----------|------|--------|
| Phase 1 Complete | Dec 30, 2025 | ✅ Complete |
| Phase 2 Prototype | Dec 30, 2025 | ✅ Complete (auth pending client input) |
| Phase 2 Complete | Jan 27, 2026 | 🔲 Pending |
| Phase 3 Complete | Feb 24, 2026 | 🔲 Pending |
| Phase 4 Complete | Mar 24, 2026 | 🔲 Pending |
| Final Launch | Apr 1, 2026 | 🔲 Pending |

---

## 💰 Budget Tracking

### Phase Budgets

| Phase | Estimated Hours | Actual Hours | Notes |
|-------|----------------|--------------|-------|
| Phase 1: Awards ID | 16 | - | |
| Phase 2: Portal | 24 | - | |
| Phase 3: Survey MVP | 32 | - | |
| Phase 4: Polish | 24 | - | |
| **Total** | **96** | **-** | |

### Hosting Costs

**Good News:** Serverless = pay only for actual usage!

| Service | Idle Cost | Active Cost | Notes |
|---------|-----------|-------------|-------|
| Cloud Run | $0 | ~$12/month | Only when receiving requests |
| Cloud Functions | $0 | ~$5/event | Only when processing files |
| Cloud Storage | ~$2/month | ~$5/month | Just storage cost |
| SendGrid | $0 | $15/campaign | Only when sending surveys |
| Firebase/Firestore | $0 | <$1/month | Free tier sufficient |
| **Idle Total** | **~$2-5/month** | **~$35/month active** | **No need to shut down!** |

**Annual Estimate:**
- Idle months (Jul-Nov): 5 × $5 = $25
- Awards season (Dec-Feb): 3 × $20 = $60  
- Survey season (Apr-May): 2 × $35 = $70
- Light usage (Mar, Jun): 2 × $10 = $20
- **Total: ~$175/year** (much less than $273 estimate)

**Infrastructure:**
- ✅ All resources managed by Terraform
- ✅ Data stores (buckets, Firestore, Sheets) persist always
- ✅ Compute scales to zero when unused
- ✅ No manual shutdown needed

---

## 🚀 Success Criteria

### Functional Requirements
✅ Unique submission IDs generated automatically  
✅ Winner tracking and management  
✅ Survey creation and customization  
✅ Email distribution to recipients  
✅ Real-time response tracking  
✅ Data export to Google Sheets  
✅ Rankings calculation  
✅ Mobile-friendly interface  
✅ Single admin login for all modules

### Performance Requirements
✅ Page load time < 2 seconds  
✅ Email delivery < 5 minutes  
✅ Real-time updates < 1 second lag  
✅ Handle 100 concurrent users  
✅ 99.9% uptime

### User Experience Requirements
✅ Intuitive navigation  
✅ Clear error messages  
✅ Save progress functionality  
✅ Mobile responsive  
✅ Accessible (WCAG 2.1 AA)

---

## 📞 Communication Plan

### Regular Check-ins
- **Weekly status call:** Mondays 9am (30 min)
- **Email updates:** Friday EOD (status report)
- **Ad-hoc questions:** Email or text anytime

### Issue Escalation
1. Minor issues: Email, respond within 24 hours
2. Blocking issues: Text/call, respond within 4 hours
3. Critical outage: Call immediately

---

## 🎉 Launch Plan

### Pre-Launch Checklist (March 24-31)
- [ ] All features tested
- [ ] Documentation complete
- [ ] Training session completed
- [ ] Production environment verified
- [ ] Backup procedures tested
- [ ] Support plan in place

### Launch Day (April 1)
- Deploy to production
- Verify all functionality
- Monitor for issues
- Be available for support

### Post-Launch
- Monitor for 1 week closely
- Address any issues promptly
- Collect feedback
- Plan enhancements if needed

---

## 🔮 Future Enhancements (Phase 5+)

After the core platform is live, we can add:

### Judge Portal (2 weeks)
If client wants online judging instead of offline:
- Individual judge logins
- Score submissions during judging session
- Aggregate scores automatically
- Calculate winners in real-time
- **Cost:** ~16 hours development
- **When:** After client experiences admin interface

### Additional Features
- Email notifications for submission confirmations
- Automated reminder emails (X days before deadline)
- Public winner announcement page
- Historical data dashboard
- Integration with website CMS
- Mobile app for surveys

---

## 🤝 Next Steps

**To begin:**
1. Review and approve this plan
2. Confirm timeline works for you
3. Get clarity from client on judging workflow (offline vs. online)
4. Provide necessary access (Google Cloud, Firebase, SendGrid)
5. Schedule weekly check-in calls
6. Begin Phase 1!

**Questions before we start?**
- Any changes to scope?
- Any concerns about timeline?
- Any specific requirements we missed?
- Ready to kick off?

**Important notes:**
- ✅ All infrastructure managed by Terraform
- ✅ Data persists, compute scales to zero when unused
- ✅ ~$5/month idle cost, no need to shut down
- ✅ Public submitter interface stays as-is
- ✅ Admin interface is what we're building
- ✅ Judging workflow flexible - can enhance later

---

**Let's build this! 🚀**

Contact: Jesse Montgomery  
Email: jlmontie@gmail.com  
Ready to start: January 6, 2026 (or sooner for Phase 1)

