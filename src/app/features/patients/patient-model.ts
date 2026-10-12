// Shared constants and helpers for the patient screens. Enum values must match
// sp3digital-patient-admin-service's validation schemas.

export const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'UNDISCLOSED', label: 'Prefer not to say' },
];
export const STATUSES = ['ACTIVE', 'INACTIVE', 'DELETED'];
export const RELATIONSHIPS = ['Mother', 'Father', 'Spouse', 'Son', 'Daughter', 'Brother', 'Sister', 'Grandparent', 'Guardian', 'Other'];

/** A person younger than this needs a guardian (the service's MINOR_AGE_YEARS default). */
export const MINOR_AGE_YEARS = 18;

export const labelOf = (list: { value: string; label: string }[], value: string | null | undefined): string =>
  list.find((item) => item.value === value)?.label ?? (value || '—');

/** Whole years from a date of birth (YYYY-MM-DD); null when empty. */
export function ageFromDob(dob: string | null | undefined, now = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  const before = now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate());
  if (before) years -= 1;
  return Math.max(years, 0);
}

/** first.last in lower case, letters and digits only — a starting point the user can edit. */
export function suggestUsername(firstName: string, lastName: string): string {
  const clean = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  return [clean(firstName), clean(lastName)].filter(Boolean).join('.');
}

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,50}$/;
