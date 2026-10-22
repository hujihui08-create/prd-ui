const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * True when `value` is a real calendar date in ISO `YYYY-MM-DD` form.
 * Pure string arithmetic: no Date parsing, so no timezone drift.
 */
export function isIsoDate(value: string): boolean {
  const match = isoDatePattern.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonth[month - 1]!;
}
