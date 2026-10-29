import { STUDY } from "@/config/study";

export function pointsForPass(input: {
  familiarity: number;
  repeat: boolean;
  earnedToday: number;
}): number {
  const familiarity = Math.min(1, Math.max(0, input.familiarity));
  const multiplier = 1 + STUDY.unfamiliarBonus * (1 - familiarity);
  const scaled = STUDY.basePoints * multiplier * (input.repeat ? STUDY.repeatFactor : 1);
  const room = Math.max(0, STUDY.dailyPointCap - Math.max(0, input.earnedToday));
  return Math.min(room, Math.max(0, Math.round(scaled)));
}

export function calendarDay(value: string, now = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const picked = Date.UTC(year, month - 1, day);
  if (Number.isNaN(picked)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const shift = Math.round((picked - today) / 86_400_000);
  if (shift < -1 || shift > 1) return null;
  return value;
}

export function previousDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

export function streakEnding(dayPoints: Map<string, number>, today: string): number {
  let cursor = (dayPoints.get(today) ?? 0) > 0 ? today : previousDay(today);
  let count = 0;
  while ((dayPoints.get(cursor) ?? 0) > 0) {
    count += 1;
    cursor = previousDay(cursor);
  }
  return count;
}
