/** UTC midnight timestamp (ms) for the calendar day containing `d`. */
export function utcMidnightMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function utcMidnightDate(d: Date): Date {
  const ms = utcMidnightMs(d);
  return new Date(ms);
}
