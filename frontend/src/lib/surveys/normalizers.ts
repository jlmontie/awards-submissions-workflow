// Map of full US state names (uppercased) → 2-letter postal codes.
// Used by the `usState` normalizer to handle free-text variants like 'Utah'.
const US_STATE_NAMES: Record<string, string> = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR',
  CALIFORNIA: 'CA', COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE',
  FLORIDA: 'FL', GEORGIA: 'GA', HAWAII: 'HI', IDAHO: 'ID',
  ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS',
  KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
  MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS',
  MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM',
  'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND',
  OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VERMONT: 'VT',
  VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI', WYOMING: 'WY',
  'DISTRICT OF COLUMBIA': 'DC',
};

// USPS-style street directional abbreviations. Any of the long forms,
// abbreviated forms with a trailing period, or bare letters get folded to
// the canonical bare-letter form when they appear as a standalone word in
// an address line.
const DIRECTIONALS: Record<string, string> = {
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W',
  NORTHEAST: 'NE', NORTHWEST: 'NW',
  SOUTHEAST: 'SE', SOUTHWEST: 'SW',
  N: 'N', S: 'S', E: 'E', W: 'W',
  NE: 'NE', NW: 'NW', SE: 'SE', SW: 'SW',
};

// Named normalizers applied to survey field values at write-time.
//
// Add a new entry here, then tag fields in `templates.ts` with
// `normalize: '<name>'`. The responses POST route applies them via
// `normalizeSubmission` before persisting to the sheet.
//
// Normalizers must be pure: `(unknown) => string`. Unknown inputs pass
// through (uppercased / trimmed where applicable) rather than throwing —
// validation is a separate concern.
export const normalizers = {
  trim: (raw: unknown): string => String(raw ?? '').trim(),

  email: (raw: unknown): string => String(raw ?? '').trim().toLowerCase(),

  // Normalize a US state value to its 2-letter postal code. Accepts the
  // code already ('ut', 'UT '), the full name ('Utah', 'CALIFORNIA'), or
  // anything else (returned trimmed + uppercased so the export's state
  // routing still works on garbage like 'XX').
  usState: (raw: unknown): string => {
    const s = String(raw ?? '').trim().toUpperCase();
    return US_STATE_NAMES[s] ?? s;
  },

  // 10-digit US numbers → "xxx-xxx-xxxx". 11-digit numbers starting with 1
  // lose the leading country code. Anything else passes through trimmed so
  // we don't mangle international or extension-bearing entries. The
  // all-dashes format is what the print designer wants in the export and
  // is also the canonical form on the sheet so admin views, edit prefill,
  // and export all stay consistent.
  phone: (raw: unknown): string => {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) return '';
    const digits = trimmed.replace(/\D/g, '');
    const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    if (ten.length !== 10) return trimmed;
    return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
  },

  // Collapse whitespace, title-case words, then fold standalone directional
  // tokens ("South", "S.", "s") to the canonical bare letter (S/N/E/W/etc).
  // Tie-break export ordering on hundreds-of-K precision needs consistent
  // address text so duplicates collapse cleanly downstream.
  address: (raw: unknown): string => {
    const trimmed = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    return trimmed
      .split(' ')
      .map((tokenRaw) => {
        const stripped = tokenRaw.replace(/\.$/, '');
        const upper = stripped.toUpperCase();
        if (DIRECTIONALS[upper]) return DIRECTIONALS[upper];
        if (/^\d+(ST|ND|RD|TH)?$/i.test(tokenRaw)) return tokenRaw.toLowerCase();
        const lower = tokenRaw.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(' ');
  },
} as const satisfies Record<string, (raw: unknown) => string>;

export type NormalizerName = keyof typeof normalizers;
