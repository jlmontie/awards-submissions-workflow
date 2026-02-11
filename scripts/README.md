# Admin Scripts

Command-line tools for managing the Awards system.

---

## mark-winner.py

Mark submissions as winners until the web admin dashboard is ready.

### Setup

```bash
# Set environment variables
export GCP_PROJECT_ID="your-project-id"
export SHEET_ID="your-sheet-id"

# Or the script will try to get SHEET_ID from Secret Manager
```

### Usage

**Mark a submission as winner:**
```bash
python mark-winner.py AW-2025-042 "Best Concrete Project"
```

**Mark with judge notes:**
```bash
python mark-winner.py AW-2025-042 "Best Concrete Project" --notes "Unanimous decision. Outstanding craftsmanship."
```

**Remove winner status:**
```bash
python mark-winner.py AW-2025-042 --unmark
```

**List all pending submissions:**
```bash
python mark-winner.py --list-pending
```

**List all winners:**
```bash
python mark-winner.py --list-winners
```

**List all submissions:**
```bash
python mark-winner.py --list-all
```

### Requirements

- Python 3.8+
- Google Cloud SDK configured
- Access to the Awards spreadsheet
- Same authentication as Cloud Functions (user OAuth token in Secret Manager)

### Install Dependencies

```bash
pip install google-cloud-secret-manager google-api-python-client google-auth
```

---

## export-winners-teams.py

Export winner project team information to a separate sheet for awards ceremony, yearbook, and marketing materials.

### Usage

**Export all winners from current year:**
```bash
python export-winners-teams.py
```

**Export winners from specific year:**
```bash
python export-winners-teams.py --year 2025
```

**Preview without writing (dry run):**
```bash
python export-winners-teams.py --dry-run
```

**Export to a different spreadsheet:**
```bash
python export-winners-teams.py --output-sheet-id SHEET_ID
```

### Output

Creates a sheet named "Project Team YYYY" with columns for:
- Awards ID
- Project name and details
- Owner and rep
- All design team members (architect, engineers, etc.)
- All construction team members (GC, trades, etc.)
- Contact information

This sheet can be used for:
- Awards ceremony programs
- Yearbook issue
- Video presentations
- Marketing materials

---

## Future Scripts

More scripts will be added as we progress through Phase 1:

- `backfill-awards-ids.py` - Backfill IDs for existing submissions (if needed)
- `generate-yearbook-data.py` - Generate data for yearbook issue
- `send-winner-notifications.py` - Email notifications to winners (Phase 3)

---

## Notes

- These scripts are for **Phase 1** - temporary CLI tools
- In **Phase 2**, we'll build a web admin dashboard
- These scripts will still be useful for automation and batch operations

