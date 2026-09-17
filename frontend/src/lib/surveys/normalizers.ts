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

// Suite / unit designators fold to a bare '#'. The printed lists have never
// carried the word: last year's page sets '756 E. Winchester St #400', not
// 'STE 400'. Editorial retyped these by hand every year, so the rule lives
// here instead. 'Suite 400', 'STE 400', 'Ste. #400' and '# 400' all land on
// '#400'; an address with no suite is untouched.
//
// Only the suite words are folded. 'Unit', 'Apt' and 'Bldg' are left alone —
// none has ever appeared in these lists, and guessing at one would mangle an
// address rather than tidy it.
//
// The designator has to be a whole word on both sides, or the rule eats real
// street names: without the trailing boundary 'Stevens Dr' folds to '#vens Dr',
// and without the leading one 'Winchester St' loses its first six characters.
function foldSuite(address: string): string {
  return address
    .replace(/\b(?:ste|suite)\b\.?\s*#?\s*(?=[A-Za-z0-9])/gi, '#')
    .replace(/#\s+(?=[A-Za-z0-9])/g, '#');
}

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

  // A person's name prints without their PE. Nearly every executive on the
  // engineering list carries the licence, so it distinguishes no one and the
  // magazine has never set it in the name — last year's page ran 'Jeffrey S.
  // Watkins' in the name column and put the credential in the title column,
  // where a firm chose to put it.
  //
  // Strips a trailing 'PE' / 'P.E.' with any leading comma, and loops so a
  // doubled 'Name, PE, PE' collapses too. Only PE: 'SE' and 'PLS' are not
  // universal, so they say something and are left for editorial to judge.
  // The word boundary keeps surnames ending in the letters ('Lope') intact.
  personName: (raw: unknown): string => {
    let name = String(raw ?? '').trim();
    let prev: string;
    do {
      prev = name;
      name = name.replace(/[,\s]*\bP\.?\s?E\.?\s*$/i, '').trim();
    } while (name !== prev);
    return name || String(raw ?? '').trim();
  },

  // Revenue is entered in millions to two decimal places — the second decimal
  // breaks ranking ties at the hundreds-of-thousands place, so stored values
  // must be consistently two-decimal. Coerce a bare or short number to two
  // decimals ("250" -> "250.00", "47.5" -> "47.50"); pass non-numeric input
  // through trimmed so validation still surfaces it. Mirrors the field's
  // on-blur formatting so drafts, edits, and edge cases land the same way.
  currency: (raw: unknown): string => {
    const cleaned = String(raw ?? '').replace(/[$,]/g, '').trim();
    if (!cleaned || !/^\d+(\.\d*)?$|^\.\d+$/.test(cleaned)) return String(raw ?? '').trim();
    return Number(cleaned).toFixed(2);
  },

  email: (raw: unknown): string => String(raw ?? '').trim().toLowerCase(),

  // Print style for a website is the bare domain: 'https://www.Okland.com/'
  // sets as 'okland.com'. Drop the scheme, a leading 'www.', and any trailing
  // slash, and lowercase the host. A path is kept as typed (only the host is
  // case-insensitive) so a deep link still resolves if one ever shows up.
  //
  // Unlike its siblings this one runs at *export* time only (via
  // `formatWebsite`), not at write-time: submitted responses are prefilled
  // back into the form for editing, and a bare domain fails the native
  // validation on the `type="url"` input it would land in. The sheet keeps
  // whatever the firm typed; only the printed list is tidied.
  website: (raw: unknown): string => {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) return '';
    const bare = trimmed
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
      .replace(/^www\./i, '');
    const slash = bare.indexOf('/');
    if (slash === -1) return bare.toLowerCase();
    const host = bare.slice(0, slash).toLowerCase();
    const path = bare.slice(slash).replace(/\/+$/, '');
    return `${host}${path}`;
  },

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
    const trimmed = foldSuite(String(raw ?? '').trim().replace(/\s+/g, ' '));
    if (!trimmed) return '';
    return trimmed
      .split(' ')
      .map((tokenRaw) => {
        // A folded suite token is already in print form. Title-casing it would
        // turn '#B' into '#b', so only the designator itself is uppercased.
        if (tokenRaw.startsWith('#')) return `#${tokenRaw.slice(1).toUpperCase()}`;
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
