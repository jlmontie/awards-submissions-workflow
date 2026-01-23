# Google Sheet Schema Update Guide

**Phase 1, Task 1.1**  
**Date:** December 19, 2025  
**Purpose:** Add submission ID tracking and winner management to Awards spreadsheet

---

## Overview

This guide documents the changes needed to the Google Sheets schema to support:
1. Unique submission IDs (AW-YYYY-NNN format)
2. Winner tracking
3. Award category tracking
4. Judge notes

---

## Current Schema

The sheet currently has these columns (starting at Column A):

| Col | Field Name | Description |
|-----|------------|-------------|
| A | Submission Timestamp | When submitted |
| B | Submission ID | GCS path-based ID (UUID-like) |
| C | PDF Link | Link to PDF in Drive |
| D | Project Folder | Drive folder link |
| E | Official Name | Project name |
| F | Location | Project location |
| G | Project Category | Award category |
| H | Cost | Project cost |
| ... | (50+ more fields) | Team members, descriptions, etc. |

---

## New Schema (Required Changes)

### Option 1: Insert New Columns at Beginning (Recommended)

Insert 4 new columns at the **beginning** (shifting all existing columns right):

| Col | Field Name | Type | Format | Description |
|-----|------------|------|--------|-------------|
| **A** | **Awards ID** | Text | AW-YYYY-NNN | **NEW** - Unique sequential ID (AW-2025-001) |
| **B** | **Status** | Dropdown | pending / winner / not_selected | **NEW** - Current status |
| **C** | **Winner_Category** | Text | Free text | **NEW** - Award won (if winner) |
| **D** | **Winner_Notes** | Text | Free text | **NEW** - Judge comments |
| E | Submission Timestamp | DateTime | ISO 8601 | Existing - moved from A |
| F | Submission ID (GCS) | Text | UUID | Existing - moved from B |
| G | PDF Link | URL | Drive link | Existing - moved from C |
| ... | (all other fields) | ... | ... | Shifted right by 4 columns |

### Option 2: Append New Columns at End (Easier Migration)

Add 4 new columns at the **end** (after current last column):

| Col | Field Name | Type | Format | Description |
|-----|------------|------|--------|-------------|
| ... | (all existing fields) | ... | ... | No changes |
| XX | **Awards ID** | Text | AW-YYYY-NNN | **NEW** - Unique sequential ID |
| XY | **Status** | Dropdown | pending / winner / not_selected | **NEW** - Current status |
| XZ | **Winner_Category** | Text | Free text | **NEW** - Award won |
| XA | **Winner_Notes** | Text | Free text | **NEW** - Judge comments |

**Recommendation:** Use **Option 2** (append at end) for easier migration and less code changes.

---

## Field Specifications

### Awards ID
- **Format:** `AW-YYYY-NNN`
  - `AW` = Awards prefix
  - `YYYY` = 4-digit year (2025, 2026, etc.)
  - `NNN` = 3-digit sequential number (001, 002, ..., 999)
- **Example:** `AW-2025-001`, `AW-2025-042`, `AW-2026-001`
- **Auto-generated:** Yes, by Cloud Function on submission
- **Unique:** Yes, per year
- **Display:** Shown in confirmation emails and admin interface

### Status
- **Type:** Dropdown/Data Validation
- **Values:**
  - `pending` - Default for new submissions
  - `winner` - Marked as winner by admin
  - `not_selected` - Reviewed but not selected
- **Default:** `pending`
- **Editable:** Admin only (via admin interface or script)

### Winner_Category
- **Type:** Text (free form)
- **Examples:**
  - "Best Concrete Project"
  - "Excellence in Steel Construction"
  - "Innovation Award"
  - "People's Choice"
- **Required:** Only if Status = `winner`
- **Editable:** Admin only

### Winner_Notes
- **Type:** Text (free form, multiline)
- **Purpose:** Judge comments, internal notes
- **Example:** "Unanimous decision. Excellent craftsmanship and innovative design."
- **Optional:** Yes
- **Editable:** Admin only

---

## Manual Setup Steps

### Step 1: Open Google Sheet
Navigate to your Awards master spreadsheet.

### Step 2: Insert Columns (Option 2 - Recommended)
1. Scroll to the last column with data (likely column AZ or similar)
2. Right-click on the next empty column
3. Insert 4 columns

### Step 3: Add Headers
In the newly inserted columns, add headers (row 1):
- Column 1: `Awards ID`
- Column 2: `Status`
- Column 3: `Winner_Category`
- Column 4: `Winner_Notes`

### Step 4: Add Data Validation for Status
1. Select the entire `Status` column (click column header)
2. Data → Data validation
3. Criteria: List from a range
4. Items: `pending, winner, not_selected`
5. On invalid data: Reject input
6. Show dropdown: ✓ Checked
7. Save

### Step 5: Format Awards ID Column
1. Select `Awards ID` column
2. Format → Number → Plain text (to preserve leading zeros)
3. Optional: Add conditional formatting to highlight by year

### Step 6: Protect Columns (Optional but Recommended)
Protect these columns from manual editing:
1. `Awards ID` - should only be set by Cloud Function
2. `Submission Timestamp` - should only be set by Cloud Function
3. `Submission ID (GCS)` - should only be set by Cloud Function

To protect:
1. Select column(s)
2. Data → Protected sheets and ranges
3. Add a description: "Auto-generated - do not edit"
4. Set permissions: Show a warning when editing
5. Save

### Step 7: Create View Filters
Create named filter views for common queries:

**Filter: All Winners**
- Status = `winner`

**Filter: Pending Review**
- Status = `pending`

**Filter: Current Year**
- Awards ID starts with `AW-2025-` (update year annually)

To create:
1. Data → Filter views → Create new filter view
2. Set filter criteria
3. Name the view
4. Save

### Step 8: Update Column References in Code
Update `backend/pdf-processor/main.py` to append to the new columns.

---

## Code Changes Required

### File: `backend/pdf-processor/main.py`

**Current row_data (lines 339-396):**
```python
row_data = [
    datetime.now().isoformat(),  # Submission Timestamp
    submission_id,               # Submission ID
    file_link,                   # PDF Link
    # ... 50+ more fields
]
```

**Updated row_data:**
```python
# Generate unique Awards ID
awards_id = generate_awards_id(sheets_service, sheet_id, year)

row_data = [
    # EXISTING FIELDS (unchanged order)
    datetime.now().isoformat(),  # Submission Timestamp
    submission_id,               # Submission ID (GCS)
    file_link,                   # PDF Link
    f"https://drive.google.com/drive/folders/{project_folder_id}",  # Project Folder
    fields.get('Official Name', ''),  # Official Name
    # ... all other existing fields ...
    
    # NEW FIELDS AT END
    awards_id,                   # Awards ID (NEW)
    'pending',                   # Status (NEW)
    '',                          # Winner_Category (NEW - empty initially)
    '',                          # Winner_Notes (NEW - empty initially)
]
```

---

## ID Generation Logic

### Function: `generate_awards_id()`

```python
def generate_awards_id(sheets_service, sheet_id: str, year: str) -> str:
    """
    Generate unique Awards ID in format: AW-YYYY-NNN
    
    Args:
        sheets_service: Authenticated Sheets service
        sheet_id: Spreadsheet ID
        year: Year (YYYY format)
    
    Returns:
        Unique Awards ID (e.g., "AW-2025-042")
    """
    # Query sheet for all Awards IDs from this year
    # Pattern to search: AW-{year}-*
    
    result = sheets_service.spreadsheets().values().get(
        spreadsheetId=sheet_id,
        range='Sheet1!A:A'  # Assuming Awards ID is in column A (adjust as needed)
    ).execute()
    
    values = result.get('values', [])
    
    # Filter for current year's IDs
    current_year_ids = [
        row[0] for row in values 
        if row and row[0].startswith(f'AW-{year}-')
    ]
    
    if not current_year_ids:
        # First submission of the year
        next_number = 1
    else:
        # Extract numbers and find max
        numbers = []
        for award_id in current_year_ids:
            try:
                # Extract NNN from AW-YYYY-NNN
                num_part = award_id.split('-')[2]
                numbers.append(int(num_part))
            except (IndexError, ValueError):
                continue
        
        next_number = max(numbers) + 1 if numbers else 1
    
    # Format: AW-YYYY-NNN (with leading zeros)
    return f"AW-{year}-{next_number:03d}"
```

---

## Testing Checklist

After implementing changes:

- [ ] First submission of year generates AW-YYYY-001
- [ ] Second submission generates AW-YYYY-002
- [ ] IDs increment correctly (no duplicates)
- [ ] Status defaults to "pending"
- [ ] Winner_Category and Winner_Notes are empty initially
- [ ] Data validation works for Status dropdown
- [ ] Column protection prevents accidental edits
- [ ] Filter views work correctly
- [ ] Old submissions still display correctly
- [ ] Sheet formulas (if any) still work

---

## Rollback Plan

If issues occur:

1. **Before making changes:** Duplicate the entire spreadsheet
2. **Name backup:** "Awards Master - Backup YYYY-MM-DD"
3. **If rollback needed:**
   - Delete new columns
   - Restore from backup
   - Investigate issue before retrying

---

## Migration Notes

### Existing Data
- Existing submissions will have empty Awards ID initially
- Can backfill IDs if needed using script
- Status should default to "pending" for all existing entries

### Backfill Script (Optional)
```python
# scripts/backfill-awards-ids.py
"""
Backfill Awards IDs for existing submissions
Run once after schema update
"""

def backfill_awards_ids(sheet_id):
    sheets = get_sheets_service()
    
    # Get all rows
    result = sheets.spreadsheets().values().get(
        spreadsheetId=sheet_id,
        range='Sheet1!A:AZ'
    ).execute()
    
    rows = result.get('values', [])
    
    # Group by year
    by_year = defaultdict(list)
    for i, row in enumerate(rows[1:], start=2):  # Skip header
        if len(row) < 1:
            continue
        
        timestamp = row[0]  # Submission Timestamp
        year = timestamp[:4]  # Extract year
        
        if not row[-4]:  # If Awards ID is empty
            by_year[year].append(i)
    
    # Assign IDs
    updates = []
    for year, row_indices in by_year.items():
        for idx, row_num in enumerate(row_indices, start=1):
            awards_id = f"AW-{year}-{idx:03d}"
            updates.append({
                'range': f'Sheet1!XX{row_num}',  # Adjust column
                'values': [[awards_id]]
            })
    
    # Batch update
    body = {'data': updates, 'valueInputOption': 'RAW'}
    sheets.spreadsheets().values().batchUpdate(
        spreadsheetId=sheet_id,
        body=body
    ).execute()
    
    print(f"Backfilled {len(updates)} Awards IDs")
```

---

## Next Steps

1. ✅ Complete this schema update
2. → Implement ID generation in Cloud Function (Task 1.2)
3. → Update confirmation email template (Task 1.3)
4. → Create admin winner marking script (Task 1.4)
5. → Implement team extraction (Task 1.5)
6. → Test end-to-end (Task 1.6)

---

**Questions?** Contact: Jesse Montgomery (jlmontie@gmail.com)

