# Phase 1 Testing Guide

**Awards ID System Enhancement**  
**Date:** December 19, 2025  
**Status:** Ready for Testing

---

## Overview

This guide walks through testing all Phase 1 features:
- Unique submission ID generation (AW-YYYY-NNN)
- Winner tracking in Google Sheets
- Confirmation email templates
- Admin winner marking script
- Project team extraction and export

---

## Prerequisites

Before testing:

- [ ] Google Sheet schema has been updated (see `SCHEMA_UPDATE_GUIDE.md`)
- [ ] New columns added: Awards ID, Status, Winner_Category, Winner_Notes
- [ ] Cloud Function code deployed with Phase 1 changes
- [ ] Google Cloud credentials configured
- [ ] Python 3.8+ installed for admin scripts

---

## Test Plan

### Test 1: Submission ID Generation

**Objective:** Verify unique Awards IDs are generated correctly

**Steps:**
1. Upload a test PDF submission through the web interface
2. Wait for Cloud Function to process
3. Check Cloud Function logs:
   ```bash
   gcloud functions logs read pdf-processor --limit 50
   ```
4. Verify log shows:
   - "Generated Awards ID: AW-YYYY-NNN"
   - ID follows format with current year
   - Number increments from previous submissions

5. Check Google Sheet:
   - New row appears
   - Awards ID column contains AW-YYYY-NNN
   - Status column shows "pending"
   - Winner_Category is empty
   - Winner_Notes is empty

**Expected Results:**
✅ ID is unique  
✅ Format is correct (AW-YYYY-NNN)  
✅ Number increments sequentially  
✅ No duplicate IDs possible  

**Test Cases:**
- First submission of year → AW-2025-001
- Second submission of year → AW-2025-002
- 10th submission → AW-2025-010
- 100th submission → AW-2025-100

---

### Test 2: ID Incrementing Logic

**Objective:** Verify IDs increment correctly even with gaps

**Steps:**
1. Submit 3 test PDFs
2. Verify IDs: AW-2025-001, AW-2025-002, AW-2025-003
3. Manually delete row for AW-2025-002 from sheet
4. Submit another PDF
5. Verify new ID is AW-2025-004 (not 002)

**Expected Results:**
✅ System finds highest existing number  
✅ Doesn't reuse deleted IDs  
✅ Maintains sequential ordering  

---

### Test 3: Cross-Year ID Reset

**Objective:** Verify IDs reset to 001 for new calendar year

**Steps:**
1. Submit test with current year (e.g., 2025)
2. Verify ID: AW-2025-XXX
3. Manually create test row with future year ID: AW-2026-001
4. For next submission, verify system detects correct year
   - If submission is 2025, continues 2025 sequence
   - If submission is 2026, starts at 002

**Expected Results:**
✅ Each year has independent sequence  
✅ System correctly identifies year from submission date  

---

### Test 4: Confirmation Email Template

**Objective:** Verify confirmation email is formatted correctly with Awards ID

**Steps:**
1. Submit a test PDF with valid email address
2. Check Cloud Function logs for confirmation email:
   ```bash
   gcloud functions logs read pdf-processor --limit 100 | grep "CONFIRMATION EMAIL"
   ```
3. Verify log shows:
   - Complete email text
   - Awards ID appears in subject
   - Awards ID appears in body
   - Project name appears correctly
   - Contact name appears correctly
   - Date and time formatted properly

**Expected Results:**
✅ Email template includes Awards ID  
✅ All placeholders filled correctly  
✅ Professional formatting  
✅ Contains all required information  

**Note:** Phase 1 logs the email but doesn't send it. Actual sending will be implemented in Phase 3 with SendGrid.

---

### Test 5: Admin Winner Marking Script

**Objective:** Verify admin can mark submissions as winners

**Setup:**
1. Ensure you have 2-3 test submissions in the sheet
2. Note their Awards IDs

**Test 5a: Mark as Winner**

**Steps:**
```bash
cd scripts
python mark-winner.py AW-2025-001 "Best Concrete Project"
```

**Verify:**
- Script shows success message
- Google Sheet updates:
  - Status → "winner"
  - Winner_Category → "Best Concrete Project"
- Script completes without errors

**Test 5b: Mark with Notes**

**Steps:**
```bash
python mark-winner.py AW-2025-002 "Excellence in Steel" --notes "Unanimous decision. Outstanding craftsmanship."
```

**Verify:**
- Status → "winner"
- Winner_Category → "Excellence in Steel"
- Winner_Notes → "Unanimous decision..."

**Test 5c: Unmark Winner**

**Steps:**
```bash
python mark-winner.py AW-2025-001 --unmark
```

**Verify:**
- Status → "pending"
- Winner_Category → (empty)
- Winner_Notes → (empty)

**Test 5d: List Submissions**

**Steps:**
```bash
python mark-winner.py --list-pending
python mark-winner.py --list-winners
python mark-winner.py --list-all
```

**Verify:**
- Lists display correctly
- Filtering works
- All columns show data

**Expected Results:**
✅ Marking winners works  
✅ Unmarking works  
✅ Notes are saved  
✅ Listing functions work  
✅ No errors or crashes  

---

### Test 6: Project Team Extraction

**Objective:** Verify team data is extracted and formatted correctly

**Setup:**
1. Ensure you have at least 1 winner marked
2. Winner should have complete team member data in PDF

**Steps:**
```bash
cd scripts
python export-winners-teams.py --year 2025 --dry-run
```

**Verify dry run output:**
- Shows number of winners found
- Displays sample row data
- Shows all team members extracted
- No errors

**Run actual export:**
```bash
python export-winners-teams.py --year 2025
```

**Verify in Google Sheets:**
- New sheet created: "Project Team 2025"
- Headers are clear and descriptive
- All winner rows present
- Team member data correctly populated
- No missing critical fields (project name, GC, architect, etc.)

**Expected Results:**
✅ Team data extracted from all fields  
✅ Formatted correctly for sheet  
✅ New sheet created successfully  
✅ All winners included  
✅ Data is accurate and complete  

---

### Test 7: End-to-End Workflow

**Objective:** Test complete workflow from submission to winner export

**Steps:**
1. **Submit:** Upload test PDF through web interface
2. **Confirm ID:** Verify Awards ID generated (check logs and sheet)
3. **Review Email:** Check confirmation email in logs
4. **Mark Winner:** Use admin script to mark as winner
5. **Export Team:** Export to Project Team sheet
6. **Verify Export:** Check team sheet has correct data

**Timeline:** Complete workflow in under 5 minutes

**Expected Results:**
✅ All steps complete without manual intervention  
✅ Data flows correctly through system  
✅ No errors at any stage  
✅ Final output is usable for awards ceremony  

---

### Test 8: Error Handling

**Objective:** Verify system handles errors gracefully

**Test 8a: Missing Contact Email**

**Steps:**
1. Submit PDF with no email field filled
2. Check logs

**Expected:**
- Warning: "No contact email found - cannot send confirmation"
- Processing continues
- Submission still gets Awards ID

**Test 8b: Invalid Awards ID in Script**

**Steps:**
```bash
python mark-winner.py AW-9999-999 "Test"
```

**Expected:**
- Error message: "Submission AW-9999-999 not found"
- Script exits gracefully
- No changes to sheet

**Test 8c: Sheet ID Generation Race Condition**

**Steps:**
1. Submit two PDFs simultaneously
2. Verify both get unique IDs

**Expected:**
- IDs are sequential (001, 002)
- No duplicates
- Both submissions processed

**Expected Results:**
✅ Errors logged appropriately  
✅ System degrades gracefully  
✅ No data corruption  
✅ Clear error messages  

---

### Test 9: Data Validation

**Objective:** Verify data integrity

**Checks:**
- [ ] Awards IDs match regex: `^AW-\d{4}-\d{3}$`
- [ ] Status is one of: pending, winner, not_selected
- [ ] Winner_Category only populated when Status = winner
- [ ] All required fields from PDF extracted
- [ ] No data truncation
- [ ] Special characters handled correctly
- [ ] Unicode characters (é, ñ, etc.) preserved

---

### Test 10: Performance

**Objective:** Verify system performs well under load

**Test Cases:**

| Scenario | Expected Time |
|----------|---------------|
| ID generation | < 2 seconds |
| Email template formatting | < 1 second |
| Winner marking script | < 5 seconds |
| Team export (10 winners) | < 10 seconds |
| Team export (50 winners) | < 30 seconds |

**Steps:**
1. Time each operation
2. Verify meets performance criteria
3. Check Cloud Function execution time in logs

---

## Test Results Template

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1 TESTING RESULTS                                     │
├─────────────────────────────────────────────────────────────┤
│ Date: YYYY-MM-DD                                           │
│ Tester: [Name]                                             │
│ Environment: Production / Staging                           │
└─────────────────────────────────────────────────────────────┘

Test 1: Submission ID Generation         [ PASS / FAIL ]
  - IDs format correctly                 [ PASS / FAIL ]
  - IDs increment                        [ PASS / FAIL ]
  - No duplicates                        [ PASS / FAIL ]

Test 2: ID Incrementing Logic            [ PASS / FAIL ]
  - Handles gaps                         [ PASS / FAIL ]
  - Finds highest number                 [ PASS / FAIL ]

Test 3: Cross-Year ID Reset              [ PASS / FAIL ]
  - Year detection works                 [ PASS / FAIL ]
  - Independent sequences                [ PASS / FAIL ]

Test 4: Confirmation Email               [ PASS / FAIL ]
  - Template formatted                   [ PASS / FAIL ]
  - All placeholders filled              [ PASS / FAIL ]
  - Logged correctly                     [ PASS / FAIL ]

Test 5: Admin Winner Script              [ PASS / FAIL ]
  - Mark winner                          [ PASS / FAIL ]
  - Mark with notes                      [ PASS / FAIL ]
  - Unmark winner                        [ PASS / FAIL ]
  - List functions                       [ PASS / FAIL ]

Test 6: Project Team Extraction          [ PASS / FAIL ]
  - Dry run works                        [ PASS / FAIL ]
  - Export creates sheet                 [ PASS / FAIL ]
  - Data complete                        [ PASS / FAIL ]

Test 7: End-to-End Workflow              [ PASS / FAIL ]

Test 8: Error Handling                   [ PASS / FAIL ]
  - Missing email handled                [ PASS / FAIL ]
  - Invalid ID handled                   [ PASS / FAIL ]
  - Race conditions handled              [ PASS / FAIL ]

Test 9: Data Validation                  [ PASS / FAIL ]

Test 10: Performance                     [ PASS / FAIL ]

┌─────────────────────────────────────────────────────────────┐
│ OVERALL RESULT: PASS / FAIL                                │
│                                                             │
│ Issues Found: X                                            │
│ Critical: X                                                 │
│ Non-Critical: X                                             │
└─────────────────────────────────────────────────────────────┘

Notes:
[Add any observations or issues here]
```

---

## Deployment Checklist

Before deploying to production:

- [ ] All tests pass
- [ ] Schema update guide followed
- [ ] Google Sheet updated with new columns
- [ ] Cloud Function code updated
- [ ] Terraform plan reviewed
- [ ] Terraform apply executed
- [ ] Cloud Function deployed successfully
- [ ] Test submission processed correctly
- [ ] Admin scripts tested
- [ ] Documentation updated
- [ ] Client trained on new features

---

## Troubleshooting

### Issue: IDs not generating
**Check:**
- Cloud Function logs for errors
- Sheet ID correct in environment
- New columns exist in sheet
- OAuth credentials valid

**Fix:**
- Verify environment variables
- Check Secret Manager secrets
- Re-deploy Cloud Function

### Issue: Admin script can't connect
**Check:**
- GCP_PROJECT_ID environment variable
- OAuth token in Secret Manager
- Permissions on Sheet

**Fix:**
- Set environment variables
- Re-run OAuth setup
- Share Sheet with service account

### Issue: Team export fails
**Check:**
- Winners exist in sheet
- Winners have Status = "winner"
- All required columns present

**Fix:**
- Mark at least one winner
- Check column names match
- Verify sheet access

---

## Next Steps After Phase 1

Once all tests pass:
1. ✅ Deploy to production
2. → Train client on new features
3. → Begin Phase 2: Portal Foundation
4. → Plan for SendGrid integration (Phase 3)

---

**Contact:** Jesse Montgomery (jlmontie@gmail.com)  
**Phase:** 1 of 4  
**Next Phase:** Portal Foundation (3 weeks)

