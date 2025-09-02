export function addDays(date: Date, days: number) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function calculateStudyDays(hours: number, hoursPerDay: number): number {
  const h = Math.max(0, hours || 0);
  const perDay = Math.max(1, Math.floor(hoursPerDay || 0));
  return Math.ceil(h / perDay);
}
