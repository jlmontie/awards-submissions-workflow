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
} as const satisfies Record<string, (raw: unknown) => string>;

export type NormalizerName = keyof typeof normalizers;
