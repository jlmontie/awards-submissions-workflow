import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  OTHER_LABEL,
  buildProjectTeamWorkbook,
  buildWinnerProjects,
  cleanFirm,
} from './project-team-export';

const HEADERS = [
  'Awards ID',
  'Winner Category',
  'Official Name',
  'Name of Firm',
  'Owner',
  'General Contractor',
  'Civil',
  'Structural',
  'Plumbing',
  'HVAC',
  'Flooring',
  'Roofing',
  'Waterproofing',
  'Carpentry',
  'DrywallAcoustics',
  'Painting',
  'Excavation',
  'Demolition',
];

function winner(fields: Record<string, string>): string[] {
  const row: Record<string, string> = { 'Winner Category': 'K-12', ...fields };
  return HEADERS.map((h) => row[h] ?? '');
}

function team(fields: Record<string, string>) {
  const [project] = buildWinnerProjects([HEADERS, winner(fields)]);
  return project;
}

function other(fields: Record<string, string>) {
  return team(fields).combined.find((line) => line.label === OTHER_LABEL)?.firm;
}

describe('cleanFirm', () => {
  // All from 2025 submissions.
  it.each([
    ['Helix Electric - David Alger', 'Helix Electric'],
    ['Salisbury Plumbing - Zach Salisbury, Owner', 'Salisbury Plumbing'],
    ['Climb Concrete | Scott Denney', 'Climb Concrete'],
    ['Lloyd Architects; Aaron Day, Principal', 'Lloyd Architects'],
    ['Basin Masonry, Clark Round', 'Basin Masonry'],
    ['Anderson Wahlen & Associates, Shaun Young PE', 'Anderson Wahlen & Associates'],
    // "Miller" must not read as the company word "mill".
    ['HNTB, Robert Miller, PE', 'HNTB'],
    ['E&R Painting, Inc, John Longman', 'E&R Painting'],
    ['Meridian Engineering, Inc - Nichole Luthi', 'Meridian Engineering'],
    ['Thalmann Architect - Fred L. Thalmann, Licensed Architect', 'Thalmann Architect'],
    ['MHTN: Tales Brito', 'MHTN'],
  ])('removes the contact from %s', (raw, firm) => {
    expect(cleanFirm(raw)).toBe(firm);
  });

  it.each([
    ['RJ Masonry, Rocky Mountain Masonry'],
    ['Reaveley Engineers, Dunn Associates'],
    ['IGES, Ninyo & Moore'],
    ['Comers Concrete, Harper'],
    ['Utah State University, State of Utah DFCM'],
    ['Structural - Baker Construction / Site - Innovative Concrete'],
    ['JWC - James Crawford Company'],
    ['Big-D Construction'],
    ['CMC Steel Fabricators, D&D Welding & Fabrication, Mass Timber: Timberlab'],
    ['Drywall: Alpine Drywall & Floor Coverings, Acoustics: Golder Acoustics'],
  ])('keeps every firm in %s', (raw) => {
    expect(cleanFirm(raw)).toBe(raw);
  });

  it('removes legal suffixes, wherever the firm sits in the entry', () => {
    expect(cleanFirm('Specialty Systems, Inc.')).toBe('Specialty Systems');
    expect(cleanFirm('Flatiron Development  LLC, Rory Christensen')).toBe('Flatiron Development');
    expect(cleanFirm('UTR, Inc., Weatherseald')).toBe('UTR, Weatherseald');
  });

  it('separates firms laid out on their own lines of the field', () => {
    expect(
      cleanFirm('1. d-7 Roofing, LLC |  Emily Clerc      2. H&H Fireproofing, Inc. |  Jamie Donovan')
    ).toBe('d-7 Roofing, H&H Fireproofing');
    expect(cleanFirm('Floor Styles\nDesign Team')).toBe('Floor Styles, Design Team');
  });

  it.each([
    ['N/A'],
    ['n/a'],
    ['NA'],
    ['N/A (Snowbird will do some later)'],
    ['Owner'],
    ['Owner supplied'],
    ['Owner Supplied (Midwest)'],
    ['Owners Rep'],
    ['Out of contract'],
    ['   '],
  ])('treats %s as no firm', (raw) => {
    expect(cleanFirm(raw)).toBe('');
  });

  it('leaves a contact in place rather than break open parentheses', () => {
    const raw = '(Maggie and Co Studio; Maggie Glendenning) and (RAPT Studio; Nicola Kerger )';
    expect(cleanFirm(raw)).toBe(raw);
  });
});

describe('buildWinnerProjects', () => {
  it('takes winners only, with Project of the Year first and the rest by category', () => {
    const projects = buildWinnerProjects([
      HEADERS,
      winner({ 'Awards ID': 'AW-2026-001', 'Winner Category': 'Water', 'Official Name': 'W' }),
      winner({ 'Awards ID': 'AW-2026-002', 'Winner Category': ' ', 'Official Name': 'Not a winner' }),
      winner({ 'Awards ID': 'AW-2026-003', 'Winner Category': 'Adaptive Reuse', 'Official Name': 'A' }),
      winner({ 'Awards ID': 'AW-2026-004', 'Winner Category': 'project of the year', 'Official Name': 'P' }),
    ]);
    expect(projects.map((p) => [p.number, p.name])).toEqual([
      [1, 'P'],
      [2, 'A'],
      [3, 'W'],
    ]);
  });

  it('gives a project one block for each category it won', () => {
    const projects = buildWinnerProjects([
      HEADERS,
      winner({ 'Winner Category': 'K-12; Green/Sustainable', 'Official Name': 'School' }),
    ]);
    expect(projects.map((p) => p.category)).toEqual(['Green/Sustainable', 'K-12']);
  });

  it('returns nothing from an empty sheet', () => {
    expect(buildWinnerProjects([])).toEqual([]);
    expect(buildWinnerProjects([HEADERS])).toEqual([]);
  });

  it('skips roles with no firm', () => {
    const { individual } = team({ Owner: 'Reef Capital', Civil: 'N/A', Plumbing: '' });
    expect(individual).toEqual([{ label: 'Owner', firm: 'Reef Capital' }]);
  });

  it('lists every trade on its own line on the individual tab', () => {
    const { individual } = team({
      Plumbing: 'Archer Mechanical',
      HVAC: 'Archer Mechanical',
      Painting: 'Fisher Painting',
      Roofing: 'Superior Roofing',
    });
    expect(individual).toEqual([
      { label: 'Plumbing', firm: 'Archer Mechanical' },
      { label: 'HVAC', firm: 'Archer Mechanical' },
      { label: 'Painting', firm: 'Fisher Painting' },
      { label: 'Roofing', firm: 'Superior Roofing' },
    ]);
  });

  it('folds the lesser trades, Flooring and Roofing included, into one line, last', () => {
    const { combined } = team({
      Owner: 'Reef Capital',
      Flooring: 'Stone Touch',
      DrywallAcoustics: 'CSI Drywall',
      Painting: 'Fisher Painting',
      Roofing: 'Superior Roofing',
      Excavation: 'Wind River Excavation',
      Demolition: 'Red Rock Demolition',
    });
    expect(combined).toEqual([
      { label: 'Owner', firm: 'Reef Capital' },
      {
        label: OTHER_LABEL,
        firm: 'CSI Drywall, Fisher Painting, Stone Touch, Superior Roofing, Wind River Excavation, Red Rock Demolition',
      },
    ]);
  });

  it('has no Other line when there is nothing to put on it', () => {
    expect(other({ Owner: 'Reef Capital' })).toBeUndefined();
  });

  it('lists a firm holding several folded trades once', () => {
    expect(
      other({ Excavation: 'Mitchell Excavation - Steve Mitchell', Demolition: 'Mitchell Excavation, LLC' })
    ).toBe('Mitchell Excavation');
  });

  it('compares firm by firm when a trade names several', () => {
    expect(other({ Roofing: 'UTR, Inc', Waterproofing: 'UTR, Inc., Weatherseald' })).toBe(
      'UTR, Weatherseald'
    );
    expect(
      other({ DrywallAcoustics: 'Comflors (hardwood, athletic flooring), Wall 2 Wall' })
    ).toBe('Comflors (hardwood, athletic flooring), Wall 2 Wall');
  });

  it('leaves the general contractor off the Other line, though not the individual tab', () => {
    const fields = {
      'General Contractor': 'Okland Construction',
      Carpentry: 'Okland',
      Painting: 'Fisher Painting',
    };
    expect(other(fields)).toBe('Fisher Painting');
    expect(team(fields).individual).toContainEqual({ label: 'Carpentry', firm: 'Okland' });
  });

  it('shares a line between paired roles held by one firm', () => {
    const { combined } = team({
      Civil: 'Horrocks Engineering',
      Structural: 'Horrocks Engineering, Inc.',
      Plumbing: 'Gunthers - Porter Rockwell',
      HVAC: 'Gunthers - Porter Rockwell',
    });
    expect(combined).toEqual([
      { label: 'Civil & Structural Engineer', firm: 'Horrocks Engineering' },
      { label: 'Plumbing & HVAC', firm: 'Gunthers' },
    ]);
  });

  it('keeps paired roles apart when the firms differ', () => {
    const { combined } = team({ Plumbing: 'S & B Plumbing', HVAC: 'Salmon Mechanical' });
    expect(combined.map((line) => line.label)).toEqual(['Plumbing', 'HVAC']);
  });
});

describe('buildProjectTeamWorkbook', () => {
  async function workbookFor(...rows: string[][]) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildProjectTeamWorkbook(buildWinnerProjects([HEADERS, ...rows])));
    return workbook;
  }

  const cells = (sheet: ExcelJS.Worksheet, row: number) =>
    [1, 2, 3, 4, 5, 6].map((c) => sheet.getCell(row, c).value);

  it('has the two team tabs and the clean list of winners', async () => {
    const workbook = await workbookFor(winner({ 'Official Name': 'A' }));
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      'Project Team - All Lines',
      'Project Team - Combined',
      'Winners Clean',
    ]);
  });

  it('lays out each block as the client does, two blank rows apart', async () => {
    const workbook = await workbookFor(
      winner({
        'Awards ID': 'AW-2026-001',
        'Winner Category': 'Adaptive Reuse',
        'Official Name': 'Arbor 515',
        'Name of Firm': 'Bonneville Builders',
        Owner: 'Perpetual Housing Fund',
        'General Contractor': 'Bonneville Builders',
        Civil: 'Ensign Engineering',
      }),
      winner({
        'Awards ID': 'AW-2026-002',
        'Winner Category': 'Water',
        'Official Name': 'Pipeline',
        'Name of Firm': 'Whitaker',
      })
    );
    const sheet = workbook.getWorksheet('Project Team - All Lines') as ExcelJS.Worksheet;

    expect(cells(sheet, 1)).toEqual([
      'Project #',
      'Note',
      'Category & Project Name',
      'Submitting Firm(s)',
      'Project Team',
      null,
    ]);
    expect(cells(sheet, 2)).toEqual([1, null, 'Adaptive Reuse', 'Bonneville Builders', 'Owner:', 'Perpetual Housing Fund']);
    expect(cells(sheet, 3)).toEqual([1, null, 'Arbor 515', null, 'General Contractor:', 'Bonneville Builders']);
    expect(cells(sheet, 4)).toEqual([null, null, null, null, 'Civil Engineer:', 'Ensign Engineering']);
    expect(cells(sheet, 5).every((v) => v === null)).toBe(true);
    expect(cells(sheet, 6).every((v) => v === null)).toBe(true);
    // A winner with no team still gets its category and name rows.
    expect(cells(sheet, 7)).toEqual([2, null, 'Water', 'Whitaker', null, null]);
    expect(cells(sheet, 8)).toEqual([2, null, 'Pipeline', null, null, null]);
  });

  it('numbers Winners Clean to match the team tabs', async () => {
    const workbook = await workbookFor(
      winner({ 'Winner Category': 'Water', 'Official Name': 'Pipeline', 'Name of Firm': 'Whitaker' })
    );
    const sheet = workbook.getWorksheet('Winners Clean') as ExcelJS.Worksheet;
    expect(sheet.getRow(2).values).toEqual([undefined, 1, 'Water', 'Pipeline', 'Whitaker']);
  });
});
