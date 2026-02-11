# UC&D Platform - Data Architecture Analysis

**Question:** Should we use a database or continue with Google Sheets?  
**Context:** Cost management is critical - these are annual/seasonal activities

---

## Current Awards System Architecture

### Data Storage Today:
```
┌─────────────────────────────────────────────┐
│ Frontend (Next.js)                          │
│ - Receives submission                       │
│ - Uploads to Cloud Storage                  │
└──────────────┬──────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────────┐
│ Cloud Storage (GCS)                         │
│ - Staging area for uploads                  │
│ - PDFs and photos                           │
└──────────────┬──────────────────────────────┘
               │
               ↓ (Cloud Function trigger)
┌─────────────────────────────────────────────┐
│ PDF Processor (Python)                      │
│ - Extracts PDF fields                       │
│ - Calls Google Sheets API                   │
│ - Calls Google Drive API                    │
└──────────────┬──────────────────────────────┘
               │
               ├──────────────────┐
               ↓                  ↓
┌──────────────────┐   ┌──────────────────────┐
│ Google Sheets    │   │ Google Drive         │
│ (Data Store)     │   │ (File Storage)       │
│                  │   │                      │
│ - All fields     │   │ - Organized folders  │
│ - Searchable     │   │ - PDFs + photos      │
│ - Exportable     │   │ - Shareable          │
└──────────────────┘   └──────────────────────┘
```

### Current Data Flow:
1. **Write Path:** Frontend → GCS → Function → Sheets API → Sheets
2. **Read Path:** Admin views Sheets directly in Google Sheets
3. **No database involved**

---

## Data Access Patterns

### Awards Module:
```
WRITES:
- New submission: ~50/year (Nov-Dec)
- Update winner status: ~15/year (judges decision)
- Frequency: Heavy 1 month/year, zero rest of year

READS:
- Admin viewing submissions: 20-30 times during Nov-Dec
- Generating reports: 5-10 times during awards cycle
- Frequency: Seasonal
```

### Survey Module (Proposed):
```
WRITES:
- Survey responses: ~150/year (50 firms × 3 surveys)
- Spread over 3 periods: Spring, Summer, Fall
- Each survey: 2-3 weeks of activity

READS:
- Real-time response tracking: Daily during survey period
- Checking who hasn't responded: 5-10 times per survey
- Exporting results: Once per survey
- Frequency: Seasonal, 3 periods/year
```

### Contact Management (Future):
```
WRITES:
- Update firm info: 10-20 times/year (as needed)
- New firms added: 5-10/year
- Frequency: Occasional

READS:
- Generating recipient lists: 3-5 times/year
- Looking up firm info: 20-30 times/year
- Frequency: Low, sporadic
```

### Total Activity:
- **Heavy usage:** 3-4 months per year
- **Light usage:** Rest of year
- **Peak concurrent users:** 1 admin + 10-20 submitters
- **Data volume:** Small (few hundred rows/year)

---

## Option 1: Continue with Google Sheets (Current Approach)

### Architecture:
```
┌──────────────────────────────────────────────────────────┐
│ UNIFIED PLATFORM (Next.js)                               │
│                                                          │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│ │ Awards   │  │ Surveys  │  │ Contacts │               │
│ │ Module   │  │ Module   │  │ Module   │               │
│ └─────┬────┘  └─────┬────┘  └─────┬────┘               │
│       │             │             │                     │
└───────┼─────────────┼─────────────┼─────────────────────┘
        │             │             │
        └─────────────┴─────────────┘
                      │
                      ↓
        ┌─────────────────────────────┐
        │ Google Sheets API           │
        │ (via Service Account)       │
        └─────────────┬───────────────┘
                      │
        ┌─────────────┴────────────────┐
        │                              │
        ↓                              ↓
┌───────────────┐            ┌────────────────┐
│ Awards Sheet  │            │ Surveys Sheet  │
│               │            │                │
│ - Submissions │            │ - Responses    │
│ - Winners     │            │ - Recipients   │
│               │            │ - Rankings     │
└───────────────┘            └────────────────┘
```

### How Sheets Work:
```javascript
// All modules use the same Google Sheets API client

// Awards writes to "Awards 2025" sheet
await sheets.spreadsheets.values.append({
  spreadsheetId: AWARDS_SHEET_ID,
  range: 'Submissions!A:Z',
  valueInputOption: 'USER_ENTERED',
  resource: { values: [submissionData] }
});

// Surveys writes to "Surveys 2026" sheet  
await sheets.spreadsheets.values.append({
  spreadsheetId: SURVEYS_SHEET_ID,
  range: 'Responses!A:Z',
  valueInputOption: 'USER_ENTERED',
  resource: { values: [surveyResponse] }
});

// Admin dashboard reads from both
const awardsData = await sheets.spreadsheets.values.get({
  spreadsheetId: AWARDS_SHEET_ID,
  range: 'Submissions!A:Z'
});

const surveyData = await sheets.spreadsheets.values.get({
  spreadsheetId: SURVEYS_SHEET_ID,
  range: 'Responses!A:Z'
});
```

### Pros:
- ✅ **Zero additional cost** (free Google Sheets)
- ✅ **Already working** for awards
- ✅ **Familiar to you** - you already use Sheets
- ✅ **Easy export** to Excel/CSV
- ✅ **Direct access** - you can view/edit in Google Sheets
- ✅ **Built-in collaboration** - share with others
- ✅ **No maintenance** - Google manages it
- ✅ **Formulas available** - can do calculations in Sheets
- ✅ **Perfect for annual data** - no wasted database costs

### Cons:
- ⚠️ **API rate limits** - 60 requests/min per user (plenty for your use)
- ⚠️ **Not true relational** - no foreign keys, joins, etc.
- ⚠️ **Manual schema** - you manage column structure
- ⚠️ **Slower queries** - full table scans (but tiny data, so fast enough)
- ⚠️ **Less structure** - no enforced data types

### Cost:
```
Google Sheets: $0/month
API calls: FREE (within quota)
───────────────────────
Total: $0/month
```

---

## Option 2: Lightweight Database (Cloud SQL PostgreSQL)

### Architecture:
```
┌──────────────────────────────────────────────────────────┐
│ UNIFIED PLATFORM (Next.js)                               │
│                                                          │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│ │ Awards   │  │ Surveys  │  │ Contacts │               │
│ │ Module   │  │ Module   │  │ Module   │               │
│ └─────┬────┘  └─────┬────┘  └─────┬────┘               │
│       │             │             │                     │
└───────┼─────────────┼─────────────┼─────────────────────┘
        │             │             │
        └─────────────┴─────────────┘
                      │
                      ↓
        ┌─────────────────────────────┐
        │ Prisma ORM / Knex.js        │
        │ (Database abstraction)      │
        └─────────────┬───────────────┘
                      │
                      ↓
        ┌─────────────────────────────┐
        │ Cloud SQL (PostgreSQL)      │
        │                             │
        │ Tables:                     │
        │ - submissions               │
        │ - survey_responses          │
        │ - firms                     │
        │ - surveys                   │
        │ - recipients                │
        └─────────────────────────────┘
```

### Database Schema:
```sql
-- Awards
CREATE TABLE submissions (
    id SERIAL PRIMARY KEY,
    submission_id VARCHAR(20) UNIQUE, -- AW-2025-001
    project_name VARCHAR(255),
    firm_id INTEGER REFERENCES firms(id),
    category VARCHAR(100),
    status VARCHAR(50), -- pending, winner, not_selected
    pdf_url TEXT,
    submitted_at TIMESTAMP,
    -- ... all other fields
);

-- Surveys
CREATE TABLE surveys (
    id SERIAL PRIMARY KEY,
    survey_name VARCHAR(255),
    survey_type VARCHAR(50), -- architects, gc, engineers
    deadline DATE,
    created_at TIMESTAMP
);

CREATE TABLE survey_responses (
    id SERIAL PRIMARY KEY,
    survey_id INTEGER REFERENCES surveys(id),
    firm_id INTEGER REFERENCES firms(id),
    response_data JSONB, -- flexible for different survey structures
    submitted_at TIMESTAMP,
    response_token VARCHAR(100) UNIQUE
);

-- Shared
CREATE TABLE firms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    contact_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    firm_type VARCHAR(50), -- architect, gc, engineer
    created_at TIMESTAMP
);

-- Cross-references
CREATE INDEX idx_submissions_firm ON submissions(firm_id);
CREATE INDEX idx_responses_survey ON survey_responses(survey_id);
CREATE INDEX idx_responses_firm ON survey_responses(firm_id);
```

### How Database Works:
```javascript
// Prisma ORM example

// Awards writes
const submission = await prisma.submission.create({
  data: {
    submissionId: 'AW-2025-042',
    projectName: 'Example Project',
    firm: {
      connectOrCreate: {
        where: { name: 'ABC Construction' },
        create: { name: 'ABC Construction', ... }
      }
    },
    category: 'Concrete',
    status: 'pending'
  }
});

// Surveys writes
const response = await prisma.surveyResponse.create({
  data: {
    survey: { connect: { id: surveyId } },
    firm: { connect: { id: firmId } },
    responseData: surveyAnswers, // JSONB
  }
});

// Complex queries (this is where DB shines)
const firmHistory = await prisma.firm.findUnique({
  where: { id: firmId },
  include: {
    submissions: true,
    surveyResponses: {
      include: { survey: true }
    }
  }
});
// Returns: Firm + all their submissions + all survey responses
```

### Pros:
- ✅ **True relational model** - proper joins, foreign keys
- ✅ **Data integrity** - enforced constraints
- ✅ **Complex queries** - efficient joins, aggregations
- ✅ **Transactional** - ACID guarantees
- ✅ **Better for linking** - firms to submissions to surveys
- ✅ **Type safety** - enforced data types
- ✅ **Scalable** - if you grow significantly
- ✅ **Standard tooling** - tons of tools, ORMs, etc.

### Cons:
- ❌ **Monthly cost** even when idle
- ❌ **More complex** - need migrations, ORM, backups
- ❌ **Less accessible** - you can't just open it like Sheets
- ❌ **Export friction** - need scripts to export data
- ❌ **Maintenance** - updates, monitoring, backups
- ❌ **Overkill** for annual/seasonal use

### Cost:
```
Cloud SQL (smallest instance):
  db-f1-micro: 0.6 vCPU, 0.6GB RAM
  Cost: ~$25/month (ALWAYS ON, even when not used)
  
For seasonal use (3-4 months/year):
  Annual cost: $300
  Wasted cost: ~$200 (8 months idle)
  
Alternative: Serverless SQL (not yet available in GCP)
───────────────────────────────────────────────────
Total: $25-30/month = $300-360/year
```

---

## Option 3: Firestore (NoSQL, Serverless)

### Architecture:
```
┌──────────────────────────────────────────────────────────┐
│ UNIFIED PLATFORM (Next.js)                               │
│                                                          │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│ │ Awards   │  │ Surveys  │  │ Contacts │               │
│ │ Module   │  │ Module   │  │ Module   │               │
│ └─────┬────┘  └─────┬────┘  └─────┬────┘               │
│       │             │             │                     │
└───────┼─────────────┼─────────────┼─────────────────────┘
        │             │             │
        └─────────────┴─────────────┘
                      │
                      ↓
        ┌─────────────────────────────┐
        │ Firebase SDK                │
        └─────────────┬───────────────┘
                      │
                      ↓
        ┌─────────────────────────────┐
        │ Firestore (NoSQL)           │
        │                             │
        │ Collections:                │
        │ - /submissions/{id}         │
        │ - /survey-responses/{id}    │
        │ - /firms/{id}               │
        │ - /surveys/{id}             │
        └─────────────────────────────┘
```

### How Firestore Works:
```javascript
// Firestore example

// Awards writes
const submissionRef = await db.collection('submissions').add({
  submissionId: 'AW-2025-042',
  projectName: 'Example Project',
  firmId: 'firm_abc123',
  category: 'Concrete',
  status: 'pending',
  submittedAt: firebase.firestore.FieldValue.serverTimestamp()
});

// Surveys writes
await db.collection('survey-responses').add({
  surveyId: 'survey_arch_2026',
  firmId: 'firm_abc123',
  responseData: { /* answers */ },
  submittedAt: firebase.firestore.FieldValue.serverTimestamp()
});

// Queries
const submissions = await db.collection('submissions')
  .where('status', '==', 'winner')
  .where('category', '==', 'Concrete')
  .get();

// Real-time listener (live updates)
db.collection('survey-responses')
  .where('surveyId', '==', currentSurveyId)
  .onSnapshot(snapshot => {
    // Admin dashboard updates in real-time as responses come in
    updateDashboard(snapshot.docs);
  });
```

### Pros:
- ✅ **Serverless** - pay per use, $0 when idle
- ✅ **Free tier** - 50K reads + 20K writes per day FREE
- ✅ **Real-time** - live updates to admin dashboard
- ✅ **Simple** - easy to use, less complex than SQL
- ✅ **Scales automatically** - from 0 to infinity
- ✅ **Built-in auth** - Firebase Auth integration
- ✅ **Offline support** - can work offline
- ✅ **Good documentation** - well-supported

### Cons:
- ⚠️ **NoSQL limitations** - no complex joins
- ⚠️ **Query restrictions** - limited query capabilities
- ⚠️ **Vendor lock-in** - specific to Google Firebase
- ⚠️ **Export less friendly** - not as easy as Sheets
- ⚠️ **Can't view directly** - need Firebase console
- ⚠️ **Learning curve** - different from SQL/Sheets

### Cost:
```
Firestore Pricing:

Your estimated usage:
- Submissions: 50 writes/year
- Survey responses: 150 writes/year
- Admin reads: 500 reads/year
- Total: 700 operations/year

FREE TIER:
- 50K reads/day = 18M/year
- 20K writes/day = 7M/year
- Your usage: 0.004% of free tier

Realistic cost: $0/month
With generous buffer: $0-1/month

───────────────────────────────
Total: ~$0/month
```

---

## Option 4: Hybrid Approach (Sheets + Firestore)

### Architecture:
```
┌──────────────────────────────────────────────────────────┐
│ UNIFIED PLATFORM                                         │
│                                                          │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│ │ Awards   │  │ Surveys  │  │ Contacts │               │
│ │ Module   │  │ Module   │  │ Module   │               │
│ └─────┬────┘  └─────┬────┘  └─────┬────┘               │
└───────┼─────────────┼─────────────┼─────────────────────┘
        │             │             │
        │             │             └──────────┐
        │             │                        │
        ↓             ↓                        ↓
   ┌─────────┐  ┌──────────┐         ┌────────────┐
   │ Sheets  │  │ Firestore│         │ Firestore  │
   │ API     │  │          │         │            │
   └────┬────┘  └─────┬────┘         └─────┬──────┘
        │             │                     │
        ↓             ↓                     ↓
   ┌─────────┐  ┌──────────┐         ┌────────────┐
   │ Awards  │  │ Surveys  │         │ Firms      │
   │ Sheet   │  │ (live)   │         │ (shared)   │
   │ (export)│  │          │         │            │
   └─────────┘  └──────────┘         └────────────┘
```

### Strategy:
- **Awards:** Continue using Sheets (working, you like it)
- **Surveys:** Use Firestore (real-time, seasonal)
- **Firms:** Use Firestore (shared reference data)
- **Export:** Sync Firestore → Sheets when needed

### Benefits:
- ✅ Awards unchanged (no risk)
- ✅ Surveys get real-time benefits
- ✅ Minimal cost (Firestore likely free tier)
- ✅ Shared firm data
- ✅ Can still export to Sheets

---

## Recommendation: Sheets + Light Firestore

**For your specific use case, I recommend a **hybrid approach**:**

### Data Storage Strategy:

```
┌───────────────────────────────────────────────────────────┐
│                                                           │
│  PRIMARY DATA STORES                                      │
│                                                           │
│  1. Google Sheets (Awards historical data)               │
│     - All submissions with full details                  │
│     - You can view/filter/export directly                │
│     - Works exactly like now                             │
│     Cost: $0                                             │
│                                                           │
│  2. Firestore (Survey operational data)                  │
│     - Active survey responses                            │
│     - Real-time response tracking                        │
│     - Recipient lists and status                         │
│     Cost: $0 (under free tier)                           │
│                                                           │
│  3. Firestore (Shared reference data)                    │
│     - Firms/companies database                           │
│     - Shared between awards and surveys                  │
│     - Links everything together                          │
│     Cost: $0 (under free tier)                           │
│                                                           │
│  AT END OF SURVEY → Export Firestore to Sheets           │
│  (Keep historical record in Sheets)                      │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### Why This Works:

1. **Awards Module:**
   ```
   Submission → GCS → Process → Sheets (just like now)
   + Write firm info to Firestore firms collection
   
   Cost: $0
   Benefit: Nothing breaks, works like now
   ```

2. **Survey Module:**
   ```
   Survey created → Stored in Firestore
   Responses come in → Written to Firestore (real-time)
   Admin dashboard → Reads from Firestore (live updates)
   Survey complete → Export to Sheets (historical record)
   
   Cost: $0 (under free tier)
   Benefit: Real-time tracking during survey
   ```

3. **Linking Data:**
   ```
   Firestore "firms" collection acts as central registry
   
   firms/{firmId}
     ├─ name: "ABC Construction"
     ├─ email: "contact@abc.com"
     ├─ submissionIds: ['AW-2025-001', 'AW-2024-015']
     └─ surveyResponseIds: ['SR-2026-042']
   
   Easy to see: "Has this firm submitted before?"
   Easy to see: "Did they respond to past surveys?"
   ```

### Implementation:

```javascript
// Shared Firestore service
class DataService {
  // Firms (shared)
  async getFirm(firmId) {
    return await db.collection('firms').doc(firmId).get();
  }
  
  async findOrCreateFirm(firmName, email) {
    // Check if exists, create if not
    // Returns firmId
  }
  
  // Awards (write to both)
  async saveSubmission(data) {
    // 1. Write to Sheets (like now)
    await sheetsAPI.append(...);
    
    // 2. Also track firm in Firestore
    const firmId = await this.findOrCreateFirm(data.firm);
    await db.collection('firms').doc(firmId).update({
      submissionIds: firebase.firestore.FieldValue.arrayUnion(data.submissionId)
    });
  }
  
  // Surveys (Firestore during, Sheets after)
  async saveSurveyResponse(surveyId, firmId, data) {
    // Write to Firestore for real-time tracking
    const responseId = await db.collection('survey-responses').add({
      surveyId,
      firmId,
      data,
      submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Update firm record
    await db.collection('firms').doc(firmId).update({
      surveyResponseIds: firebase.firestore.FieldValue.arrayUnion(responseId)
    });
  }
  
  async exportSurveyToSheets(surveyId) {
    // Get all responses from Firestore
    const responses = await db.collection('survey-responses')
      .where('surveyId', '==', surveyId)
      .get();
    
    // Convert to rows
    const rows = responses.docs.map(doc => [...]);
    
    // Write to Sheets (historical record)
    await sheetsAPI.append(rows);
  }
}
```

### Cost Breakdown:

```
Google Sheets API: $0
Firestore: $0 (under free tier)
Additional hosting: $0
───────────────────────────────
Total additional cost: $0/month
```

### Why Not a Full Database?

**For your use case, a database is overkill because:**

1. **Seasonal usage** - DB charges even when idle (8+ months)
2. **Small data volume** - hundreds of records, not millions
3. **Simple queries** - mostly "get all for this year"
4. **Already works** - Sheets proven for awards
5. **Export needs** - you need Sheets anyway for records

**Database makes sense when:**
- ❌ High concurrent users (you: 1 admin + few submitters)
- ❌ Complex queries daily (you: occasional, seasonal)
- ❌ Large data volume (you: small)
- ❌ 24/7 operations (you: seasonal)
- ❌ Millisecond performance critical (you: seconds is fine)

---

## Comparison Table

| Factor | Sheets Only | Hybrid (Sheets + Firestore) | PostgreSQL | Firestore Only |
|--------|-------------|----------------------------|------------|----------------|
| **Cost** | $0 | $0 | $300/year | $0-12/year |
| **Setup complexity** | Simple | Medium | Complex | Medium |
| **Real-time tracking** | No | Yes (surveys) | Yes | Yes |
| **Direct access** | Yes | Yes (Sheets) | No | No (console) |
| **Export ease** | Native | Easy | Scripted | Scripted |
| **Data linking** | Manual | Good | Excellent | Limited |
| **Idle cost** | $0 | $0 | $300/year | $0 |
| **Maintenance** | None | Low | High | Low |
| **Your workflow** | Unchanged | Slightly better | Changed | Changed |
| **Best for** | Status quo | ⭐ Your use case | Enterprise | App-first |

---

## Final Recommendation

### Go with: **Hybrid (Sheets + Firestore)**

**Rationale:**
1. **Zero additional cost** - Firestore stays in free tier
2. **Best of both worlds** - Sheets for awards, real-time for surveys
3. **No breaking changes** - Awards keep working
4. **Future-proof** - Can add features without DB cost
5. **Your workflow** - Still have Sheets access
6. **Real-time value** - See survey responses live

### Implementation Plan:

**Phase 1 (Awards ID fix):**
- Keep 100% Sheets
- Add firm ID concept in Sheets
- No Firestore yet (low risk)

**Phase 2-3 (Survey module):**
- Add Firestore for surveys
- Add Firestore for firms registry
- Keep awards in Sheets
- Link via firm IDs

**Benefits:**
- Start simple (just Sheets)
- Add Firestore only when needed (surveys)
- Prove value before committing
- Can always add full DB later if needed

**Migration path if you grow:**
```
Year 1-3: Sheets + Firestore ($0)
↓ (if needed)
Year 4+: Migrate to PostgreSQL if:
  - 1000+ submissions/year
  - 10+ concurrent admins
  - Complex reporting needs
  - 24/7 operations
```

---

## Data Access Code Example

### How all three modules share data:

```typescript
// services/data.service.ts

import { GoogleSheets } from './sheets.service';
import { Firestore } from './firestore.service';

export class DataService {
  private sheets: GoogleSheets;
  private firestore: Firestore;
  
  constructor() {
    this.sheets = new GoogleSheets();
    this.firestore = new Firestore();
  }
  
  // ===== FIRMS (shared across modules) =====
  
  async getFirmByName(name: string) {
    // Check Firestore registry
    const firm = await this.firestore.collection('firms')
      .where('name', '==', name)
      .limit(1)
      .get();
    
    return firm.docs[0]?.data();
  }
  
  async ensureFirm(name: string, email: string) {
    // Get or create firm
    let firm = await this.getFirmByName(name);
    
    if (!firm) {
      const firmRef = await this.firestore.collection('firms').add({
        name,
        email,
        createdAt: new Date(),
        submissionIds: [],
        surveyResponseIds: []
      });
      firm = { id: firmRef.id, name, email };
    }
    
    return firm;
  }
  
  // ===== AWARDS =====
  
  async saveAwardSubmission(data: SubmissionData) {
    // 1. Ensure firm exists
    const firm = await this.ensureFirm(data.firmName, data.email);
    
    // 2. Generate submission ID
    const submissionId = await this.generateSubmissionId();
    
    // 3. Write to Sheets (primary storage)
    await this.sheets.appendRow('Awards 2025', 'Submissions', {
      submissionId,
      firmId: firm.id,
      projectName: data.projectName,
      category: data.category,
      status: 'pending',
      // ... all other fields
      pdfUrl: data.pdfUrl,
      submittedAt: new Date()
    });
    
    // 4. Update firm's submission history
    await this.firestore.collection('firms').doc(firm.id).update({
      submissionIds: firebase.firestore.FieldValue.arrayUnion(submissionId),
      lastSubmission: new Date()
    });
    
    return { submissionId, firmId: firm.id };
  }
  
  async updateWinnerStatus(submissionId: string, isWinner: boolean, category?: string) {
    // Update in Sheets
    await this.sheets.updateRow('Awards 2025', 'Submissions', {
      where: { submissionId },
      set: {
        status: isWinner ? 'winner' : 'not_selected',
        winnerCategory: category
      }
    });
  }
  
  // ===== SURVEYS =====
  
  async createSurvey(data: SurveyData) {
    // Store survey config in Firestore
    const surveyRef = await this.firestore.collection('surveys').add({
      name: data.name,
      type: data.type, // architects, gc, engineers
      questions: data.questions,
      deadline: data.deadline,
      createdAt: new Date(),
      status: 'active'
    });
    
    return surveyRef.id;
  }
  
  async saveSurveyResponse(surveyId: string, firmName: string, email: string, responses: any) {
    // 1. Ensure firm exists
    const firm = await this.ensureFirm(firmName, email);
    
    // 2. Save response in Firestore (for real-time tracking)
    const responseRef = await this.firestore.collection('survey-responses').add({
      surveyId,
      firmId: firm.id,
      firmName,
      responses,
      submittedAt: new Date()
    });
    
    // 3. Update firm's survey history
    await this.firestore.collection('firms').doc(firm.id).update({
      surveyResponseIds: firebase.firestore.FieldValue.arrayUnion(responseRef.id),
      lastSurveyResponse: new Date()
    });
    
    return responseRef.id;
  }
  
  async getSurveyResponses(surveyId: string) {
    // Get real-time from Firestore
    const responses = await this.firestore.collection('survey-responses')
      .where('surveyId', '==', surveyId)
      .orderBy('submittedAt', 'desc')
      .get();
    
    return responses.docs.map(doc => doc.data());
  }
  
  async exportSurveyToSheets(surveyId: string) {
    // Get survey data
    const survey = await this.firestore.collection('surveys').doc(surveyId).get();
    const responses = await this.getSurveyResponses(surveyId);
    
    // Convert to rows
    const rows = responses.map(r => {
      return [
        r.firmName,
        r.submittedAt,
        ...r.responses // flatten response data
      ];
    });
    
    // Write to Sheets (historical record)
    await this.sheets.appendRows(
      `Surveys ${new Date().getFullYear()}`,
      survey.data().name,
      rows
    );
  }
  
  // ===== CROSS-MODULE QUERIES =====
  
  async getFirmHistory(firmId: string) {
    // Get firm
    const firm = await this.firestore.collection('firms').doc(firmId).get();
    const firmData = firm.data();
    
    // Get submissions (from Sheets)
    const submissions = await this.sheets.findRows('Awards 2025', 'Submissions', {
      where: { firmId }
    });
    
    // Get survey responses (from Firestore)
    const responses = await this.firestore.collection('survey-responses')
      .where('firmId', '==', firmId)
      .get();
    
    return {
      firm: firmData,
      submissions: submissions,
      surveyResponses: responses.docs.map(d => d.data()),
      totalSubmissions: firmData.submissionIds.length,
      totalSurveys: firmData.surveyResponseIds.length
    };
  }
}
```

---

## Summary

**Your question:** Should we use a database?

**My answer:** Use a hybrid approach (Sheets + Firestore), not a traditional database.

**Why:**
- **Cost:** $0 vs $300/year for database
- **Simplicity:** Builds on what works (Sheets)
- **Real-time:** Adds Firestore for live survey tracking
- **Your workflow:** You still have Sheets access
- **Seasonal use:** No wasted idle costs

**When to reconsider:**
- If you go from 50 → 5000 submissions/year
- If you need 24/7 complex reporting
- If you have 10+ concurrent admins
- None of these apply to your use case

**Next step:** Start with Sheets-only for Phase 1 (Awards ID fix), add Firestore in Phase 2-3 (Survey module) only if you proceed with that.

---

*Questions about this architecture? Let's discuss!*

