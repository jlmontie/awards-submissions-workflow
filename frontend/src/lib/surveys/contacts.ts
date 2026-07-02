export interface FirmContact {
  name: string;
  email: string;
}

/**
 * From a raw "Survey Contacts" sheet value grid, return the active contacts for
 * a given firm within a survey category. Matching mirrors the invite/token
 * routes: firm name exact match, category case-insensitive, active === 'TRUE'.
 */
export function activeFirmContacts(
  contactRows: string[][],
  firmName: string,
  surveyCategory: string,
): FirmContact[] {
  const contacts: FirmContact[] = [];
  if (contactRows.length < 2 || !firmName) return contacts;

  const headers = contactRows[0];
  const firmCol = headers.indexOf('firm_name');
  const nameCol = headers.indexOf('contact_name');
  const emailCol = headers.indexOf('contact_email');
  const categoryCol = headers.indexOf('category');
  const activeCol = headers.indexOf('active');

  const wantCategory = surveyCategory.trim().toLowerCase();

  for (let i = 1; i < contactRows.length; i++) {
    const row = contactRows[i];
    const rowFirm = (row[firmCol] || '').trim();
    const rowCategory = (row[categoryCol] || '').trim().toLowerCase();
    const active = (row[activeCol] || '').trim().toUpperCase();
    if (rowFirm === firmName && rowCategory === wantCategory && active === 'TRUE') {
      contacts.push({
        name: nameCol !== -1 ? row[nameCol] || '' : '',
        email: emailCol !== -1 ? row[emailCol] || '' : '',
      });
    }
  }
  return contacts;
}
