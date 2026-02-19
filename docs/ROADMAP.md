# UC+D Business Tools Platform — Roadmap

**Last updated:** February 2026

---

## Executive Summary

The UC+D platform expands beyond awards to a unified web system for awards submissions and survey automation. Current state:

| System | Status |
|--------|--------|
| **Awards Submissions** | ✅ Working |
| **Awards ID & Winner Tracking** | ✅ Phase 1 complete |
| **Admin Portal** | ✅ Phase 2 prototype deployed |
| **Survey Module** | Planned (Phase 3) |

---

## Vision: Unified Platform

```
┌────────────────────────────────────────────────────────────────┐
│         UC+D BUSINESS TOOLS PLATFORM                            │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ PUBLIC SIDE     │  │ ADMIN SIDE       │  │ BACKGROUND   │  │
│  │ • Awards Form   │  │ • Submissions    │  │ • PDF Parser │  │
│  │ • Survey Form   │  │ • Mark Winners   │  │ • Email Send │  │
│  │ • Status Check  │  │ • Survey Mgmt    │  │ • File Org   │  │
│  └─────────────────┘  └──────────────────┘  └──────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## Phase Status

### Phase 1: Awards ID System — ✅ Complete (Dec 2025)

- Unique submission IDs (AW-YYYY-NNN)
- Winner tracking in Google Sheets
- Confirmation email templates
- Admin CLI tools for winner management
- Project team extraction and export

### Phase 2: Admin Portal — ✅ Prototype Deployed (Dec 2025)

- Admin dashboard at `/admin`
- Submissions list with filtering and search
- Submission detail view
- Winner marking UI (functional wiring pending)
- **Pending:** Authentication, winner marking → Sheet updates

### Phase 3: Survey Module — Planned (Q1 2026)

- Survey creation web interface
- Recipient list upload (CSV)
- Unique links per firm, email distribution
- Response tracking and reminders
- Export to magazine format (see `docs/surveys/Survey_Sorting_Rules.md`)

### Phase 4: Polish — Planned (Q1 2026)

- Full testing, UX refinements
- April 2026 survey season launch

---

## Implementation Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1 | 2 weeks | Awards ID system |
| Phase 2 | 3 weeks | Admin portal with auth |
| Phase 3 | 4 weeks | Survey MVP |
| Phase 4 | 3 weeks | Testing and polish |
| **Total** | **12 weeks** | Ready April 2026 |

---

## Technical Architecture

**Stack:** Next.js 14, Python Cloud Functions, Google Cloud Run, GCS, Drive, Sheets  
**Data:** Google Sheets (awards), Firestore planned for surveys  
**Auth:** Firebase Auth (admin), reCAPTCHA (public)

### Current Awards Flow

```
Submitter → Web Form → GCS → Cloud Function (PDF extract) → Drive + Sheet
```

### Future Survey Flow

```
Admin Creates Survey → Upload Recipients → System Sends Unique Links
→ Recipients Respond → Real-Time Tracking → Export Rankings
```

---

## Data & Schema

**Awards Sheet columns (Phase 1):** Awards ID, Status (pending/winner/not_selected), Winner_Category, Winner_Notes, plus existing submission fields.

**Survey export format:** Tab-delimited; firms sorted by revenue; DND/out-of-state in separate files. See `docs/surveys/Survey_Sorting_Rules.md` for column specs.

---

## Cost Summary

| Phase | Dev Cost | Hosting (est.) |
|-------|----------|----------------|
| Phase 1–2 (current) | — | ~$16/month |
| Full platform | ~$10k one-time | ~$35/month |

---

## Related Documentation

- **Deployment:** [docs/deployment/DEPLOYMENT.md](deployment/DEPLOYMENT.md)
- **Survey export rules:** [docs/surveys/Survey_Sorting_Rules.md](surveys/Survey_Sorting_Rules.md)
