// Tidsperiodene man kan velge på siden. Brukes både av serveren, bygget og nettsiden.
export const PERIODS = [
  { key: 'today', label: 'I dag', today: true },
  { key: '1w', label: 'Siste uke', days: 7 },
  { key: '1m', label: 'Siste mnd', days: 30 },
  { key: '6m', label: 'Siste 6 mnd', days: 182 },
  { key: '1y', label: 'Siste år', days: 365 },
  { key: '2y', label: 'Siste 2 år', days: 730 },
  { key: '5y', label: 'Siste 5 år', days: 1826 },
  { key: 'all', label: 'Hele perioden', days: null },
];

// Sekunder siden midnatt i norsk tid (gjelder også for den som ser siden fra utlandet)
const osloClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
export function startOfDay(now = Date.now()) {
  const [h, m, s] = osloClock.format(now).split(':').map(Number);
  return Math.floor(now / 1000) - (h * 3600 + m * 60 + s);
}

// Unix-sekunder for starten av perioden, eller null for hele perioden
export function periodStart(key, now = Date.now()) {
  const period = PERIODS.find((p) => p.key === key);
  if (period?.today) return startOfDay(now);
  return period?.days ? Math.floor(now / 1000) - period.days * 86400 : null;
}
