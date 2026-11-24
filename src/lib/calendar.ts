/** Month grid for the calendar screens. Weeks start on Sunday; days outside the month are null. */
export function monthGrid(year: number, month0: number): (number | null)[][] {
  const first = new Date(year, month0, 1).getDay();
  const days = new Date(year, month0 + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function shiftMonth(year: number, month0: number, delta: number): { year: number; month0: number } {
  const d = new Date(year, month0 + delta, 1);
  return { year: d.getFullYear(), month0: d.getMonth() };
}

export function pad2(n: number): string { return String(n).padStart(2, '0'); }
export function ymd(year: number, month0: number, day: number): string { return `${year}-${pad2(month0 + 1)}-${pad2(day)}`; }
