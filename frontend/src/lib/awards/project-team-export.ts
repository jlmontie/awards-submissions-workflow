import ExcelJS from 'exceljs';
import { splitCategories, workbookToArrayBuffer } from './category-export';
import { isWinner } from './sheet-rows';

/**
 * The winners' Project Team workbook: the sheet the client works from for the
 * awards video and the December yearbook issue, and which they used to build
 * by hand from the submission PDFs.
 *
 * Each winner is a block of rows, with the team as "Role: | Firm" lines. It is
 * written twice: once with every role on its own line, and once in the client's
 * published form, with the lesser trades folded into one "Other Specialty
 * Contractors" line. The roles, their order and the folding below were read off
 * the client's 2025 sheet and the 38 submissions behind it.
 */

interface TeamRole {
  /** The sheet heading, which is the PDF field name. */
  header: string;
  label: string;
  /** Folded into the Other Specialty Contractors line on the combined tab. */
  other?: boolean;
}

export const TEAM_ROLES: TeamRole[] = [
  { header: 'Owner', label: 'Owner' },
  { header: 'Architect', label: 'Architect' },
  { header: 'General Contractor', label: 'General Contractor' },
  { header: 'Civil', label: 'Civil Engineer' },
  { header: 'Electrical', label: 'Electrical Engineer' },
  { header: 'Mechanical', label: 'Mechanical Engineer' },
  { header: 'Structural', label: 'Structural Engineer' },
  { header: 'Interior Design', label: 'Interior Design' },
  { header: 'Furniture', label: 'Furniture' },
  { header: 'Landscape Architect', label: 'Landscape Design' },
  { header: 'Geotech', label: 'Geotech' },
  { header: 'Concrete', label: 'Concrete' },
  { header: 'Steel Fabrication', label: 'Steel Fabrication' },
  { header: 'Steel Erection', label: 'Steel Erection' },
  { header: 'Precast', label: 'Precast' },
  { header: 'Plumbing', label: 'Plumbing' },
  { header: 'HVAC', label: 'HVAC' },
  { header: 'Electrical_2', label: 'Electrical' },
  { header: 'Masonry', label: 'Masonry' },
  { header: 'TileStone', label: 'Tile/Stone' },
  { header: 'GlassCurtain Wall', label: 'Glass/Curtain Wall' },
  { header: 'DrywallAcoustics', label: 'Drywall/Acoustics', other: true },
  { header: 'Painting', label: 'Painting', other: true },
  { header: 'Carpentry', label: 'Carpentry', other: true },
  { header: 'Flooring', label: 'Flooring', other: true },
  { header: 'Roofing', label: 'Roofing', other: true },
  { header: 'Waterproofing', label: 'Waterproofing', other: true },
  { header: 'Excavation', label: 'Excavation', other: true },
  { header: 'Demolition', label: 'Demolition', other: true },
  { header: 'Landscaping 1', label: 'Landscaping', other: true },
];

export const OTHER_LABEL = 'Other Specialty Contractors';

/** Two roles held by one firm share a line on the combined tab. */
const SHARED_LINES: [first: string, second: string, label: string][] = [
  ['Civil', 'Structural', 'Civil & Structural Engineer'],
  ['Electrical', 'Mechanical', 'Electrical & Mechanical Engineer'],
  ['Interior Design', 'Landscape Architect', 'Interior & Landscape Design'],
  ['Steel Fabrication', 'Steel Erection', 'Steel Fabrication & Erection'],
  ['Plumbing', 'HVAC', 'Plumbing & HVAC'],
];

// Words that mark text as a company, not a person. Only used to decide whether
// trailing text can be removed, so a miss leaves a person's name to tidy by
// hand. The reverse, a firm mistaken for a person, would lose the firm, so this
// list leans long.
const COMPANY_WORD =
  /\b(acoustic\w*|aquatic\w*|architect\w*|associates?|bridge|build\w*|cabinet\w*|coating\w*|compan\w*|concrete|consult\w*|construct\w*|contract\w*|corp\w*|demolition|design\w*|develop\w*|drywall|electric\w*|engineer\w*|enterprises?|excavat\w*|fabricat\w*|flooring|glass|glazing|group|inc|interiors?|iron\w*|landscap\w*|llc|lumber|manufactur\w*|masonry|materials?|mechanical|metals?|mills?|millwork|mountain|paint\w*|partners|paving|plumbing|precast|products?|roofing|services?|sheet|solutions?|specialt\w*|steel|stone|studios?|supply|systems?|tile|utah|valley|wasatch|waterproof\w*|welding|western|woodworks?|works)\b/i;

const PERSON_NAME = /^[A-Z][\w'.-]*(?: [A-Z][\w'.-]*){1,3}$/;

const JOB_TITLE =
  /^(?:pe|se|rla|aia|pm|owner|president|vice president|principal|project manager|manager|director\b.*)\.?$/i;

const PLACEHOLDER =
  /^(?:n\/?a|none|tbd|not applicable|out of contract|owners?'?s?(?: rep| representative| supplied| provided)?)\.?(?:\s*\(.*\))?$/i;

const LEGAL_SUFFIX = /,?\s+(?:inc|llc|lc|ltd)\b\.?(?=\s*(?:,|\(|$))/gi;

function parensBalanced(text: string): boolean {
  return text.split('(').length === text.split(')').length;
}

function cleanEntry(raw: string): string {
  let entry = raw.replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim();

  // "Firm | Contact": submitters only ever use the pipe this way.
  const pipe = entry.indexOf('|');
  if (pipe > 0 && parensBalanced(entry.slice(0, pipe))) entry = entry.slice(0, pipe).trim();

  // "Firm - Contact" and "Firm; Contact". The same marks also appear as
  // "Scope - Firm" and "Firm - Firm", which are left alone. Only the text up to
  // a comma is judged: the title in "Firm - Jo Day, Licensed Architect" is not
  // a company.
  const mark = entry.match(/\s+[-–—]\s+|\s*;\s*/);
  if (mark?.index) {
    const head = entry.slice(0, mark.index);
    const tail = entry.slice(mark.index + mark[0].length).split(',')[0];
    if (!COMPANY_WORD.test(tail) && parensBalanced(head)) entry = head.trim();
  }

  // "Firm, Contact[, Title]". A comma as often separates two firms, so the
  // last part has to read as a person's name or a job title to be removed.
  for (;;) {
    const comma = entry.lastIndexOf(',');
    if (comma <= 0) break;
    const tail = entry.slice(comma + 1).trim();
    const isContact = JOB_TITLE.test(tail) || (PERSON_NAME.test(tail) && !COMPANY_WORD.test(tail));
    if (!isContact) break;
    entry = entry.slice(0, comma).trim();
  }

  // "Firm: Contact". Also used as "Scope: Firm", so again it must read as a name.
  const colon = entry.lastIndexOf(':');
  if (colon > 0) {
    const tail = entry.slice(colon + 1).trim();
    if (PERSON_NAME.test(tail) && !COMPANY_WORD.test(tail)) entry = entry.slice(0, colon).trim();
  }

  return entry.replace(LEGAL_SUFFIX, '').replace(/[\s,;]+$/, '');
}

/**
 * A team entry as it should print: the firm alone, or '' if it names no firm.
 *
 * The form asks for a name and title beside each firm, so most entries carry
 * one, in whichever format the submitter chose. Long entries are several firms
 * laid out on separate lines of the form field, sometimes numbered.
 */
export function cleanFirm(value: string): string {
  const text = value.trim();
  if (PLACEHOLDER.test(text)) return '';
  return text
    .split(/\s*[\r\n]+\s*|\s{3,}/)
    .map(cleanEntry)
    .filter(Boolean)
    .join(', ');
}

/** Compares firm names, so "Okland" and "Okland Construction Co." are one firm. */
function firmKey(firm: string): string {
  const key = firm
    .toLowerCase()
    .replace(/\b(the|and|inc|llc|co|company|corp|corporation|construction|contractors?|group)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  return key || firm.toLowerCase();
}

export interface TeamLine {
  label: string;
  firm: string;
}

export interface WinnerProject {
  number: number;
  category: string;
  name: string;
  firm: string;
  /** Every role on its own line. */
  individual: TeamLine[];
  /** Shared lines joined and the lesser trades folded into one line. */
  combined: TeamLine[];
}

function individualLines(firms: Map<string, string>): TeamLine[] {
  return TEAM_ROLES.filter((role) => firms.has(role.header)).map((role) => ({
    label: role.label,
    firm: firms.get(role.header) as string,
  }));
}

function combinedLines(firms: Map<string, string>): TeamLine[] {
  const relabelled = new Map<string, string>();
  const absorbed = new Set<string>();
  for (const [first, second, label] of SHARED_LINES) {
    const a = firms.get(first);
    const b = firms.get(second);
    if (a && b && firmKey(a) === firmKey(b)) {
      relabelled.set(first, label);
      absorbed.add(second);
    }
  }

  const lines: TeamLine[] = [];
  for (const role of TEAM_ROLES) {
    const firm = firms.get(role.header);
    if (!firm || role.other || absorbed.has(role.header)) continue;
    lines.push({ label: relabelled.get(role.header) ?? role.label, firm });
  }

  // A general contractor doing its own carpentry is already on the team, and
  // one firm can hold several of these trades.
  const gc = firms.get('General Contractor');
  const seen = new Set(gc ? [firmKey(gc)] : []);
  const others: string[] = [];
  for (const role of TEAM_ROLES) {
    if (!role.other) continue;
    // Commas inside parentheses are a note about the firm, not a second firm.
    for (const part of (firms.get(role.header) ?? '').split(/,(?![^()]*\))/)) {
      const firm = part.trim();
      if (!firm || seen.has(firmKey(firm))) continue;
      seen.add(firmKey(firm));
      others.push(firm);
    }
  }
  if (others.length) lines.push({ label: OTHER_LABEL, firm: others.join(', ') });

  return lines;
}

/**
 * Sheet rows (header row first) narrowed to winners, one project per category
 * won. Project of the Year leads, the rest run alphabetically by category, as
 * on the client's sheet, and the Project # follows that order.
 */
export function buildWinnerProjects(values: string[][]): WinnerProject[] {
  const [headers = [], ...rows] = values;
  const column = new Map(headers.map((h, i) => [h.trim(), i]));
  const at = (row: string[], name: string) => {
    const i = column.get(name);
    return i === undefined ? '' : String(row[i] ?? '').trim();
  };

  const entries = rows
    .filter((row) => isWinner(at(row, 'Winner Category')))
    .flatMap((row) => {
      const firms = new Map<string, string>();
      for (const { header } of TEAM_ROLES) {
        const firm = cleanFirm(at(row, header));
        if (firm) firms.set(header, firm);
      }
      return splitCategories(at(row, 'Winner Category')).map((category) => ({
        category,
        awardsId: at(row, 'Awards ID'),
        name: at(row, 'Official Name'),
        firm: at(row, 'Name of Firm'),
        individual: individualLines(firms),
        combined: combinedLines(firms),
      }));
    });

  const rank = (category: string) => (category.toLowerCase() === 'project of the year' ? 0 : 1);
  entries.sort(
    (a, b) =>
      rank(a.category) - rank(b.category) ||
      a.category.localeCompare(b.category, undefined, { sensitivity: 'base', numeric: true }) ||
      a.awardsId.localeCompare(b.awardsId, undefined, { numeric: true })
  );

  return entries.map(({ awardsId, ...entry }, i) => ({ number: i + 1, ...entry }));
}

// Named in full: a font given only as bold loses the workbook's default face.
const HEADER_FONT = { name: 'Calibri', size: 11, bold: true };

function addTeamSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  projects: WinnerProject[],
  lines: (project: WinnerProject) => TeamLine[]
) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { width: 9 },
    { width: 11 },
    { width: 42 },
    { width: 32 },
    { width: 35 },
    { width: 60 },
  ];
  sheet.addRow(['Project #', 'Note', 'Category & Project Name', 'Submitting Firm(s)', 'Project Team']);
  sheet.getRow(1).font = HEADER_FONT;

  for (const project of projects) {
    const team = lines(project);
    for (let i = 0; i < Math.max(team.length, 2); i++) {
      const row = sheet.addRow([
        i < 2 ? project.number : null,
        null,
        i === 0 ? project.category : i === 1 ? project.name : null,
        i === 0 ? project.firm : null,
        team[i] ? `${team[i].label}:` : null,
        team[i]?.firm ?? null,
      ]);
      row.alignment = { vertical: 'top', wrapText: true };
    }
    sheet.addRow([]);
    sheet.addRow([]);
  }
}

export async function buildProjectTeamWorkbook(projects: WinnerProject[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  addTeamSheet(workbook, 'Project Team - All Lines', projects, (p) => p.individual);
  addTeamSheet(workbook, 'Project Team - Combined', projects, (p) => p.combined);

  const clean = workbook.addWorksheet('Winners Clean', { views: [{ state: 'frozen', ySplit: 1 }] });
  clean.columns = [{ width: 10 }, { width: 34 }, { width: 60 }, { width: 45 }];
  clean.addRow(['Project #', 'Category', 'Project Name', 'Submitting Firm(s)']);
  clean.getRow(1).font = HEADER_FONT;
  for (const project of projects) {
    clean.addRow([project.number, project.category, project.name, project.firm]);
  }

  return workbookToArrayBuffer(workbook);
}
