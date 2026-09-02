# UC+D Business Tools Platform — Roadmap

**Last updated:** September 2026

---

## Executive Summary

The UC+D platform expands beyond awards to a unified web system for awards submissions and survey automation. Current state:

| System | Status |
|--------|--------|
| **Awards Submissions** | ✅ Working in production |
| **Awards ID & Confirmation Email** | ✅ Working (IDs minted server-side, confirmation email sent via SMTP) |
| **Admin Portal — read-only views** | ✅ Deployed (list, detail) |
| **Admin Portal — winner marking** | ⏸️ On hold pending client decision on whether the portal owns winner management |
| **Admin Portal — authentication** | ⏸️ On hold pending client decision on auth method (portal is currently unauthenticated) |
| **Survey Module** | ✅ Deployed and in active use (creation, distribution, response tracking, export) |

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

- Unique submission IDs (AW-YYYY-NNN) minted server-side
- Winner tracking columns in the master Google Sheet
- Confirmation email templates
- Admin CLI tools for winner management (`scripts/mark-winner.py`, `scripts/export-winners-teams.py`)
- Project team extraction and export

### Phase 2: Admin Portal — Read-only deployed; write flows on hold

- Admin dashboard at `/admin` (unauthenticated — see below)
- Submissions list with filtering and search
- Submission detail view
- **On hold:**
  - Authentication — awaiting client decision on auth method
  - Winner marking through the portal — awaiting client decision on whether the portal (vs. CLI) should own winner management. Detail-view Mark/Unmark buttons are present but not wired to a write endpoint.

### Phase 3: Survey Module — ✅ Deployed

Live surveys with per-firm unique links, response tracking, reminder history, submission-copy emails (with PDF attachment), and RTF export to magazine format. See `docs/surveys/Survey_Sorting_Rules.md` for the export column spec. Ongoing work is client-driven refinements (template additions, formatting tweaks) rather than net-new capability.

### Confirmation email (Awards) — ✅ Sending

The PDF-processor Cloud Function sends a plain-text confirmation email to the submitter's contact address via SMTP (Resend). Failures are logged and never block a submission.

---

## Technical Architecture

**Stack:** Next.js 14, Python Cloud Functions, Google Cloud Run, GCS, Drive, Sheets  
**Data:** Google Sheets (awards), Firestore planned for surveys  
**Auth:** Firebase Auth (admin), reCAPTCHA (public)

### Current Awards Flow

```
Submitter → Web Form → GCS → Cloud Function (PDF extract) → Drive + Sheet
```

### Survey Flow (deployed)

```
Admin Creates Survey → Upload Recipients → System Sends Unique Links
→ Recipients Respond → Real-Time Tracking → RTF Export for Magazine
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

- **Deployment:** [docs/DEPLOYMENT.md](DEPLOYMENT.md)
- **Survey export rules:** [docs/surveys/Survey_Sorting_Rules.md](surveys/Survey_Sorting_Rules.md)
