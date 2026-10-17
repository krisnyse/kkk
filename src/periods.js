// Tidsperiodene man kan velge på siden. Brukes både av serveren, bygget og nettsiden.
export const PERIODS = [
  { key: '1w', label: 'Siste uke', days: 7 },
  { key: '1m', label: 'Siste mnd', days: 30 },
  { key: '6m', label: 'Siste 6 mnd', days: 182 },
  { key: '1y', label: 'Siste år', days: 365 },
  { key: '2y', label: 'Siste 2 år', days: 730 },
  { key: '5y', label: 'Siste 5 år', days: 1826 },
  { key: 'all', label: 'Hele perioden', days: null },
];

// Unix-sekunder for starten av perioden, eller null for hele perioden
export function periodStart(key, now = Date.now()) {
  const days = PERIODS.find((p) => p.key === key)?.days;
  return days ? Math.floor(now / 1000) - days * 86400 : null;
}
