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

// Tokens that must survive case-folding intact. Without these, folding an
// all-caps entry turns 'PRESIDENT/CEO' into 'President/Ceo'.
const PRESERVED_ACRONYMS = new Set([
  'CEO', 'COO', 'CFO', 'CTO', 'CIO', 'EVP', 'SVP', 'VP', 'GM', 'PIC',
  'PE', 'SE', 'PLS', 'RA', 'AIA', 'PTOE', 'MEP', 'GIS', 'BD', 'IT', 'HR',
  'US', 'USA', 'UT', 'SLC', 'LEED', 'AP',
]);

/**
 * Title-case a value that arrived shouting, leaving acronyms alone:
 * 'PRESIDENT' -> 'President', 'P.E., COO' -> 'P.E., COO', 'SANDY' -> 'Sandy'.
 *
 * A value containing any lowercase is returned untouched — it is already
 * cased the way its author meant it, and re-casing would fight entries like
 * 'McKay' or 'de Boer'.
 */
function foldAllCaps(value: string): string {
  if (!/[A-Z]/.test(value) || /[a-z]/.test(value)) return value;
  return value.replace(/[A-Za-z][A-Za-z.]*/g, (word) => {
    if (PRESERVED_ACRONYMS.has(word.replace(/\./g, '').toUpperCase())) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

// Professional credentials that print in neither the name nor the title
// column. The engineering list runs on licensed professionals, so a licence
// distinguishes nobody; editorial has stripped these by hand every year.
// Matched whole, so a surname made of the same letters survives.
const CREDENTIAL = /^(?:P\.?\s?E\.?|S\.?\s?E\.?|P\.?L\.?S\.?|PTOE|RSP\s?\d*|R\.?A\.?|AIA|LEED\s*AP|SECB|F?\.?ASCE)$/i;

/**
 * Drop credentials from a comma-delimited person or title string, wherever
 * they sit: 'Brent Crowther, PE, PTOE, RSP1' -> 'Brent Crowther', and
 * 'P.E., COO' -> 'COO', where the credential leads rather than trails. A
 * space-separated trailing credential ('Clark Prothero PE') goes too.
 *
 * Only a part that is entirely a credential is dropped, so a stray job title
 * typed into the name box survives to be seen and fixed.
 */
function dropCredentials(value: string): string {
  const kept = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !CREDENTIAL.test(part));
  let out = kept.join(', ');
  let prev: string;
  do {
    prev = out;
    out = out.replace(/\s+(?:P\.?\s?E\.?|S\.?\s?E\.?|P\.?L\.?S\.?|PTOE|RSP\s?\d*|AIA|LEED\s*AP)\s*$/i, '').trim();
  } while (out !== prev);
  return out;
}

// Long-form title words the page sets short, taken from what editorial
// actually changed rather than from a general abbreviation scheme.
// 'Senior' shortens only in 'Senior Vice President' -- 'Senior Principal'
// runs in full on both the 2025 and 2026 pages, because it already fits.
const TITLE_ABBREVIATIONS: [RegExp, string][] = [
  [/\bSenior Vice President\b/gi, 'Sr. Vice President'],
  [/\bPrincipal in Charge\b/gi, 'Principal-in-Charge'],
  [/\bRegional\b/g, 'Reg.'],
  [/\bBusiness\b/g, 'Bus.'],
];

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

  // A person's name prints without their credentials. The engineering list
  // runs on licensed professionals, so a licence distinguishes nobody, and
  // the page has never set one in the name column -- last year ran 'Jeffrey
  // S. Watkins', with the credential in the title column where a firm put it
  // there.
  //
  // This started as PE only, on the reasoning that SE and PLS say something.
  // Editorial's own pass over the 2026 export says otherwise: it cut 'PE,
  // PTOE, RSP1' from Brent Crowther and 'SE' from Scott Wilson. The one SE
  // left standing (Justin Naser, in the structural table but not the overall
  // one) is the same inconsistency the 2025 page shipped with, so it reads as
  // an oversight rather than intent.
  //
  // All-caps entries fold too: 'JARED FORD' -> 'Jared Ford'.
  personName: (raw: unknown): string => {
    const original = String(raw ?? '').trim();
    return dropCredentials(foldAllCaps(original)) || original;
  },

  // An executive's title, set the way the page sets it:
  //
  //   'President & CEO'              -> 'President/CEO'
  //   'President and CEO'            -> 'President/CEO'
  //   'President - CEO'              -> 'President/CEO'
  //   'Senior Vice President'        -> 'Sr. Vice President'
  //   'Regional Chief Executive'     -> 'Reg. Chief Executive'
  //   'Local Business Leader'        -> 'Local Bus. Leader'
  //   'Principal in Charge'          -> 'Principal-in-Charge'
  //   'PRESIDENT'                    -> 'President'
  //   'P.E., COO'                    -> 'COO'
  //
  // Every rule here is one editorial applied by hand to the 2026 export.
  // Only a spaced hyphen joins two titles, so 'Principal-in-Charge' and
  // other hyphenated words survive.
  title: (raw: unknown): string => {
    const original = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!original) return '';
    let out = dropCredentials(foldAllCaps(original));
    out = out.replace(/\s*&\s*|\s+and\s+|\s+-\s+/gi, '/');
    for (const [pattern, replacement] of TITLE_ABBREVIATIONS) {
      out = out.replace(pattern, replacement);
    }
    // A title that was nothing but a credential keeps what the firm typed;
    // blanking the column loses more than the credential costs.
    return out.trim() || original;
  },

  // Fold a shouted free-text value to normal case, for fields the page sets
  // in title case regardless of how they were typed ('SANDY' -> 'Sandy').
  // Not for firm names: 'AECOM' and 'BHB' are meant to shout.
  properCase: (raw: unknown): string => foldAllCaps(String(raw ?? '').trim()),

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
  // sets as 'okland.com'. Drop the scheme, a leading 'www.', the path, and
  // any trailing slash, and lowercase the host.
  //
  // The path used to be kept, on the theory that a deep link should still
  // resolve. One then showed up -- Terracon submitted
  // 'terracon.com/offices/salt-lake-city' -- and editorial cut it back to the
  // domain, which is what the column has always carried. The reader is being
  // pointed at the firm, not at a page.
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
    return (slash === -1 ? bare : bare.slice(0, slash)).toLowerCase();
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
