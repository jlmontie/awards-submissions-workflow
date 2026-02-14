# Utah Construction & Design (UC+D) - Complete Project Scope Analysis

**Date:** December 18, 2025  
**Prepared for:** Ladd Marshall - UC+D  
**Prepared by:** Jesse Montgomery

---

## Executive Summary

UC+D currently has **three separate workflows** that need automation and integration:

1. **Awards Submission Processing** (✅ Complete - Current System)
2. **Awards Winner Tracking** (⚠️ Partial - Missing ID linkage)
3. **Industry Survey System** (❌ Not Started - Manual Process)

This document analyzes each component and proposes options for a unified platform.

---

## 1. Current System: Awards Submission Processing

### Status: ✅ **COMPLETE & OPERATIONAL**

### What It Does:
- Web interface for construction firms to submit award applications
- Accepts PDF submission forms + unlimited project photos
- Automatically extracts data from PDF fields
- Organizes submissions into Google Drive folders (`Awards/YYYY/ProjectName/`)
- Maintains master spreadsheet of all submissions
- Deployed on Google Cloud Platform (serverless)

### Components:
- **Frontend:** Next.js web application (Cloud Run)
- **Backend:** Python Cloud Functions (PDF processing, photo handling)
- **Storage:** Google Cloud Storage → Google Drive
- **Data:** Google Sheets (master submissions list)

### Workflow:
```
Submitter → Web Form → Upload PDF + Photos → 
Cloud Storage → Auto-process → Drive Folder + Sheet Row
```

---

## 2. Current Gap: Awards Winner ID Linkage

### Status: ⚠️ **MISSING FUNCTIONALITY**

### The Problem:
From your emails with Jesse about the "New project":
- The submission processing creates a spreadsheet of **all submissions**
- After judges review, you create a **separate spreadsheet of winners**
- **No unique ID** connects these two sheets
- This makes it hard to:
  - Match winner information back to original submission data
  - Generate project team sheets for the awards event
  - Track which submissions became winners
  - Pull detailed submission data for winners

### What's Needed:
1. **Unique Submission ID** - Generated when submission is received
2. **Winner Tracking Field** - Mark submissions as "winner" in master sheet
3. **Winner Details Sheet** - Automatically populated from master sheet
4. **Project Team Extraction** - Pull team member details from PDFs for winners

### Example ID System:
```
Submission ID Format: AW-2025-001, AW-2025-002, etc.

Master Submissions Sheet:
- Submission_ID | Project_Name | Firm | Status | Category | Submission_Date

Winners Sheet (filtered view or separate):
- Submission_ID | Project_Name | Award_Category | Team_Members | ...
```

---

## 3. Separate Need: Industry Survey Automation

### Status: ❌ **COMPLETELY MANUAL - NEEDS AUTOMATION**

### What UC+D Does Manually:
Based on the "survey project tool" email from Nov 21, 2025:

1. **Three Annual Surveys:**
   - Top Utah Architectural Firms Rankings
   - General Contractors Rankings
   - Engineers Rankings

2. **Current Manual Process:**
   - Create PDF survey forms
   - Manually email surveys to firms (from lists)
   - Firms complete PDFs and email back
   - Manually extract data from returned PDFs
   - Manually compile results into spreadsheet
   - Use results for magazine publication (rankings issue)

3. **Pain Points:**
   - Time-consuming manual data entry
   - Email management overhead
   - Tracking who has/hasn't responded
   - Chasing late responses
   - Data entry errors
   - No easy way to send reminders

### Survey Details:
- **Frequency:** Annual (typically sent in early spring)
- **Recipients:** Architects, GCs, Engineers (separate lists)
- **Deadline:** Tight (example: May 29th EOB)
- **Purpose:** Published rankings in magazine (e.g., May/June issue)
- **Current Storage:** Google Drive folders with PDF responses and txt files

---

## 4. Integration Opportunities

### Shared Infrastructure:
All three workflows use similar technology:
- ✅ Google Drive for file storage
- ✅ Google Sheets for data management
- ✅ PDF processing
- ✅ Email communications
- ✅ Web-based interfaces

### Common Data Elements:
- Company/Firm information
- Contact details
- Project information
- Team members
- Historical records

---

## 5. Proposed Solution Options

### **Option 1: Unified UC+D Business Tools Platform** ⭐ RECOMMENDED

Create a central web portal with three integrated modules:

#### **Portal Structure:**
```
UC+D Business Tools Platform (utahcdtools.com or tools.utahcdmag.com)
│
├── 📊 Awards Module
│   ├── Public Submission Form
│   ├── Admin: View All Submissions
│   ├── Admin: Mark Winners
│   ├── Admin: Generate Project Team Sheets
│   └── Admin: Export for Judges
│
├── 📋 Survey Module
│   ├── Admin: Create Survey
│   ├── Admin: Manage Recipient Lists
│   ├── Admin: Send Invitations
│   ├── Public: Survey Response Form
│   ├── Admin: Track Responses
│   └── Admin: View Results/Export
│
└── 👥 Contact Management Module (optional)
    ├── Maintain company/firm database
    ├── Track historical participation
    └── Generate mailing lists
```

#### **Benefits:**
- ✅ Single login for Ladd to manage everything
- ✅ Shared infrastructure = lower costs
- ✅ Consistent branding and UX
- ✅ Easy to add new tools in the future
- ✅ Historical data in one place
- ✅ Can track companies across years/events

#### **Implementation:**
1. **Phase 1 (Now):** Fix awards ID linkage
2. **Phase 2 (Q1 2026):** Add survey module before spring survey season
3. **Phase 3 (Future):** Add contact management and additional tools

#### **Cost:**
- Development: Incremental (build on existing system)
- Hosting: Minimal increase (~$5-10/month added)
- Maintenance: Centralized codebase

---

### **Option 2: Separate Systems with Manual Integration**

Keep awards and surveys as completely separate systems:

#### **Awards System:**
- Fix ID linkage issue
- Continue as-is with improvements

#### **Survey System:**
- Build standalone survey portal
- Separate from awards system
- No shared data or infrastructure

#### **Drawbacks:**
- ❌ Two separate logins
- ❌ Duplicate infrastructure costs
- ❌ No data sharing between systems
- ❌ More maintenance overhead
- ❌ Harder to add future tools

---

### **Option 3: Google Forms + Apps Script (Lightweight)**

For surveys only, use Google's native tools:

#### **How It Works:**
- Create Google Forms for each survey
- Use Apps Script for:
  - Sending invitations with unique links
  - Tracking responses
  - Automated reminders
  - Data compilation

#### **Benefits:**
- ✅ Fast setup
- ✅ Free (no hosting costs)
- ✅ Familiar Google ecosystem

#### **Drawbacks:**
- ❌ Limited customization
- ❌ Doesn't integrate with awards system
- ❌ Less professional appearance
- ❌ Limited to Google's functionality
- ❌ Harder to maintain recipient lists

---

## 6. Recommended Approach: Unified Platform

### **Why This Makes Sense:**

1. **You're Already 80% There**
   - Awards system is fully built and deployed
   - Infrastructure is scalable
   - Can reuse components (auth, file upload, PDF processing)

2. **Operational Efficiency**
   - One platform to manage
   - One login for Ladd
   - Consistent user experience for firms
   - Easier to train staff

3. **Future-Proofing**
   - Easy to add new tools:
     - Member directory
     - Event registration
     - Content submission for magazine
     - Advertising portal
   - Builds your brand as a tech-forward organization

4. **Cost Effective**
   - Marginal cost to add modules
   - Shared infrastructure
   - No duplicate systems

### **Proposed Portal Name:**
- **UC+D Business Tools** or **UC+D Connect**
- URL: `tools.utahcdmag.com` or `connect.utahcdmag.com`

---

## 7. Detailed Feature Requirements

### **7.1 Awards Module Enhancements**

#### **Add Submission ID System:**
```
Auto-generated on submission:
- Format: AW-YYYY-NNN (e.g., AW-2025-042)
- Displayed to submitter after upload
- Sent in confirmation email
- Stored in master sheet
- Used for all tracking
```

#### **Winner Management:**
```
Admin Interface:
- View all submissions by category
- Mark as: Pending | Winner | Not Selected
- Add award details (category, placement)
- Generate winner announcements
```

#### **Project Team Extraction:**
```
Enhanced PDF Processing:
- Extract all team member fields
- Parse company names, roles, names
- Create structured data export
- Generate formatted team sheets for event
```

#### **Export Options:**
```
- Export for judges (anonymized if needed)
- Export winners with full details
- Export project team sheets
- Export submission statistics
```

---

### **7.2 Survey Module Features**

#### **Survey Creation:**
```
Admin Interface:
- Create new survey with questions
- Question types: Multiple choice, text, rating scales, yes/no
- Reuse previous year's survey as template
- Preview before sending
```

#### **Recipient Management:**
```
- Upload recipient lists (CSV import)
- Separate lists for: Architects, GCs, Engineers
- Track firm details: Name, contact, email
- Historical participation data
- Categories/tags for filtering
```

#### **Survey Distribution:**
```
- Generate unique survey links per recipient
- Send via email with personalized message
- Track: Sent, Opened, Started, Completed
- Automated reminders for non-responders
- Custom deadline per survey
```

#### **Response Interface:**
```
Public Survey Form:
- Clean, mobile-friendly design
- Progress indicator
- Save progress (with unique link)
- Confirmation on submission
- Optional: Upload supporting documents
```

#### **Results & Analytics:**
```
Admin Dashboard:
- Response rate by firm type
- Completion status
- Real-time results view
- Export to Google Sheets
- Generate rankings automatically
- Visualizations (charts, graphs)
```

---

### **7.3 Optional: Contact Management**

#### **Centralized Database:**
```
- Maintain list of all firms/companies
- Contact information
- Categories (Architect, GC, Engineer, etc.)
- Historical participation
  - Submissions per year
  - Survey responses per year
  - Awards won
```

#### **Benefits:**
```
- Generate mailing lists
- Track engagement over time
- Identify inactive firms (for outreach)
- Prepopulate forms for repeat users
- Award lifetime achievement recognition
```

---

## 8. Technical Architecture

### **Unified Platform Stack:**

```
┌─────────────────────────────────────────────────────┐
│         UC+D Business Tools Web Portal              │
│              (Next.js + React)                       │
└───────────┬─────────────────────────────────────────┘
            │
    ┌───────┴──────────┐
    │                  │
┌───▼──────┐    ┌─────▼─────┐
│ Awards   │    │  Survey   │
│ Module   │    │  Module   │
└───┬──────┘    └─────┬─────┘
    │                 │
    └────────┬────────┘
             │
    ┌────────▼─────────┐
    │  Shared Services │
    │  - Auth          │
    │  - File Upload   │
    │  - PDF Process   │
    │  - Email         │
    │  - Analytics     │
    └────────┬─────────┘
             │
    ┌────────▼─────────┐
    │ Google Cloud     │
    │ - Cloud Run      │
    │ - Cloud Functions│
    │ - Cloud Storage  │
    └────────┬─────────┘
             │
    ┌────────▼─────────┐
    │ Data Layer       │
    │ - Google Drive   │
    │ - Google Sheets  │
    │ - PostgreSQL (?)│
    └──────────────────┘
```

### **Technology Choices:**

#### **Keep (Already Proven):**
- Next.js frontend
- Google Cloud Platform
- Cloud Functions for processing
- Google Drive for file storage
- Google Sheets for data export

#### **Add:**
- **Authentication:** Simple admin login (Firebase Auth or Clerk)
- **Database (optional):** PostgreSQL for relational data (firms, users, history)
  - Or continue with Google Sheets if preferred
- **Email Service:** SendGrid or Google Workspace SMTP
- **Survey Engine:** Custom-built form renderer (flexible)

---

## 9. Implementation Roadmap

### **Phase 1: Awards ID Fix** (2 weeks - December 2025)
- [ ] Add unique ID generation to submission processing
- [ ] Update master sheet with ID column
- [ ] Add ID to confirmation emails
- [ ] Create winner tracking fields

### **Phase 2: Portal Foundation** (3 weeks - January 2026)
- [ ] Create unified portal framework
- [ ] Add authentication (admin login)
- [ ] Migrate awards system into portal
- [ ] Create admin dashboard skeleton

### **Phase 3: Survey Module MVP** (4 weeks - February 2026)
- [ ] Survey creation interface
- [ ] Recipient list management
- [ ] Survey response form
- [ ] Email distribution system
- [ ] Basic results dashboard

### **Phase 4: Survey Module Complete** (3 weeks - March 2026)
- [ ] Advanced reporting
- [ ] Automated reminders
- [ ] Response tracking
- [ ] Export functionality
- [ ] Rankings generation

### **Phase 5: Enhancements** (Ongoing - Q2 2026)
- [ ] Contact management module
- [ ] Historical data migration
- [ ] Advanced analytics
- [ ] Mobile app (if needed)

**Total Timeline:** 12 weeks to full survey system
**Ready for:** Spring 2026 survey season

---

## 10. Cost Estimate

### **Development Costs:**
| Phase | Estimated Hours | Notes |
|-------|----------------|-------|
| Phase 1: Awards ID Fix | 16 hours | Quick enhancement |
| Phase 2: Portal Foundation | 24 hours | Refactor + auth |
| Phase 3: Survey Module MVP | 32 hours | Core functionality |
| Phase 4: Survey Complete | 24 hours | Polish + features |
| Phase 5: Enhancements | TBD | Optional/ongoing |
| **Total (Phases 1-4)** | **96 hours** | ~2.5 months work |

### **Ongoing Costs (Monthly):**
| Service | Current | With Survey Module | Notes |
|---------|---------|-------------------|-------|
| Cloud Run | $8 | $12 | Increased traffic |
| Cloud Functions | $3 | $5 | More processing |
| Cloud Storage | $1 | $2 | More files |
| SendGrid (email) | $0 | $15 | 500-1000 emails/month |
| Domain (if new) | $0 | $1 | Optional subdomain |
| **Total** | **$16/mo** | **$35/mo** | Still very reasonable |

---

## 11. Security & Compliance

### **Considerations:**
- ✅ Data privacy (survey responses)
- ✅ Admin access controls
- ✅ Secure file uploads
- ✅ Email authentication (SPF, DKIM)
- ✅ HTTPS encryption
- ✅ Regular backups
- ✅ Audit logging

---

## 12. Success Metrics

### **Awards Module:**
- Time saved: 6+ hours per awards cycle (already achieved)
- Error reduction: Near zero data entry errors
- Winner tracking: 100% accuracy with IDs

### **Survey Module:**
- Time saved: ~10 hours per survey cycle
- Response rate: Track year-over-year
- Reminder effectiveness: % increase in responses
- Data accuracy: Eliminate manual transcription errors

### **Overall Platform:**
- Single sign-on reduces context switching
- Historical data enables trend analysis
- Professional appearance enhances UC+D brand

---

## 13. Questions for Decision Making

**For Ladd to Consider:**

1. **Timeline Priority:**
   - Do you need survey tool before Spring 2026 survey season? (Y/N)
   - If yes, we should start Phase 2-3 in January

2. **Feature Priority:**
   - Which is more important: Awards ID fix or Survey automation?
   - Can rank: 1=Critical, 2=Important, 3=Nice to have

3. **Budget:**
   - Is ~100 hours development time feasible?
   - Is ~$35/month hosting cost acceptable?

4. **User Access:**
   - Will this just be you, or will others need access?
   - Do firms need login accounts, or just anonymous links?

5. **Data History:**
   - Do you want to migrate historical survey data?
   - How many years back?

6. **Integration:**
   - Any other UC+D workflows that could benefit from automation?
   - Magazine submission portal?
   - Event registration?

---

## 14. Recommendation

**I recommend proceeding with Option 1: Unified Platform**

### **Next Steps:**

1. **Immediate (December 2025):**
   - Fix awards ID linkage (Phase 1)
   - This is quick and solves an immediate problem

2. **Q1 2026 (January-March):**
   - Build survey module (Phases 2-4)
   - Ready for spring survey season

3. **Q2 2026 and Beyond:**
   - Add enhancements based on usage
   - Consider additional modules

### **Why Now:**
- Awards system proves the technical approach works
- Survey season is coming (spring 2026)
- Building on existing infrastructure is efficient
- Creates a scalable platform for future needs

---

## 15. Alternative: Start with Surveys Only

If you want to de-risk:

### **Option: Survey-First Approach**

1. Build survey module as standalone first
2. If it works well, integrate with awards later
3. Keeps initial scope smaller
4. Still much better than manual process

**Pros:**
- Faster to market
- Lower initial cost
- Proves value before full integration

**Cons:**
- Miss efficiency gains of shared platform
- May need refactoring later to integrate
- Two systems to manage (temporarily)

---

## Next Steps

Please review and let me know:

1. Which option appeals to you most?
2. Timeline constraints (especially for survey season)
3. Budget parameters
4. Any questions or concerns

I'm happy to schedule a call to discuss in detail and refine the approach based on your priorities.

---

**Contact:**
Jesse Montgomery  
Email: jlmontie@gmail.com  
Re: UC+D Platform Expansion

