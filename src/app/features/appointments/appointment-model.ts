// Shared helpers for the booking and appointment screens.

export const STATUS_CLASS: Record<string, string> = {
  BOOKED: 'good', CONFIRMED: 'good', CHECKED_IN: 'good', IN_PROGRESS: 'good',
  COMPLETED: '', CANCELLED: 'danger', NO_SHOW: 'danger', RESCHEDULED: 'warning',
};

export const STATUSES = ['BOOKED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'];

/** Today as YYYY-MM-DD in the browser's local time. (The service decides what is "past"; this only seeds the date box.) */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Wed, 14 Oct 2026" */
export function fmtDate(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export const hhmm = (time: string | null | undefined): string => (time ? String(time).slice(0, 5) : '');

/** XXXXXX3210 — the appointment keeps a copy of the phone; lists never show it in full. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const digits = String(phone);
  const tail = digits.slice(-4);
  const head = digits.startsWith('+') ? digits.slice(0, digits.length - 10 > 0 ? digits.length - 10 : 0) : '';
  return `${head}${'X'.repeat(Math.max(digits.replace(/\D/g, '').length - 4, 0))}${tail}`;
}
