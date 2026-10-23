/**
 * Every year's entries share one tab (Sheet1); the processors, the Awards ID
 * numbering and these routes all read it. A row's year is the one in its
 * Awards ID (AW-YYYY-NNN), which comes from the year the entry was filed
 * under. The submission timestamp covers a row whose ID was never written.
 */
export function rowYear(headers: string[], row: string[]): string {
  const at = (name: string) => {
    const i = headers.findIndex((h) => h.trim() === name);
    return i >= 0 ? String(row[i] ?? '').trim() : '';
  };
  return (
    at('Awards ID').match(/^AW-(\d{4})-/)?.[1] ||
    at('Submission Timestamp').match(/^(\d{4})-/)?.[1] ||
    ''
  );
}

/** Sheet values (header row first) narrowed to one year; all rows when `year` is empty. */
export function filterValuesByYear(values: string[][], year: string | null): string[][] {
  if (!year || values.length === 0) return values;
  const [headers, ...rows] = values;
  return [headers, ...rows.filter((row) => rowYear(headers, row) === year)];
}
