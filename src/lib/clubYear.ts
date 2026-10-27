/**
 * The club's calendar, on its own so that both ./analytics and ./seasons can use it without
 * importing each other.
 *
 * The club year turns over on 1 October: Offseason 26 (October), Preseason 26/27 (November
 * to spring) and Season 27 are one year, and all of it is labelled "2026/27".
 */

export const SEASON_START_MONTH = 10;

/** The club year a date belongs to, named by the calendar year it starts in. */
export function seasonOf(isoDate: string): number {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  return month >= SEASON_START_MONTH ? year : year - 1;
}

/** "2026/27" for the year that runs from October 2026 to September 2027. */
export function seasonLabel(season: number): string {
  return `${season}/${String((season + 1) % 100).padStart(2, '0')}`;
}
