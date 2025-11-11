export type FootballPosition = 'QB' | 'WR' | 'C' | 'DB' | 'B' | 'unassigned';
export type Unit = 'offense' | 'defense' | null;

export const POSITION_LABELS: Record<FootballPosition, string> = {
  'QB': 'Quarterback',
  'WR': 'Wide Receiver',
  'C': 'Center',
  'DB': 'Defensive Back',
  'B': 'Linebacker',
  'unassigned': 'Unassigned',
};

export const POSITION_OPTIONS: FootballPosition[] = ['QB', 'WR', 'C', 'DB', 'B', 'unassigned'];

/**
 * Determines if a position is offensive, defensive, or unassigned
 */
export function getPositionUnit(position: FootballPosition): Unit {
  switch (position) {
    case 'QB':
    case 'WR':
    case 'C':
      return 'offense';
    case 'DB':
    case 'B':
      return 'defense';
    case 'unassigned':
    default:
      return null;
  }
}

/**
 * Filters positions by unit (offense/defense)
 */
export function getPositionsByUnit(unit: 'offense' | 'defense'): FootballPosition[] {
  return POSITION_OPTIONS.filter(pos => getPositionUnit(pos) === unit);
}

export interface PlayerPosition {
  id: string;
  player_id: string;
  position: FootballPosition;
}
