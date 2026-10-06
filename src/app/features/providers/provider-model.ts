// Shared constants and form models for the provider (doctor) screens. The enum
// values must match sp3digital-provider-admin-service's validation schemas.

export const PROVIDER_TYPES = [
  { value: 'DOCTOR', label: 'Doctor' },
  { value: 'DENTIST', label: 'Dentist' },
  { value: 'AYUSH_PRACTITIONER', label: 'AYUSH practitioner' },
  { value: 'NURSE', label: 'Nurse' },
  { value: 'MIDWIFE', label: 'Midwife' },
  { value: 'PHYSIOTHERAPIST', label: 'Physiotherapist' },
  { value: 'PSYCHOLOGIST', label: 'Psychologist' },
  { value: 'NUTRITIONIST', label: 'Nutritionist' },
  { value: 'OTHER', label: 'Other' },
];
// These need a council / licence number (mirrors LICENSED_TYPES in the service).
export const LICENSED_TYPES = ['DOCTOR', 'DENTIST', 'AYUSH_PRACTITIONER', 'NURSE', 'MIDWIFE', 'PHYSIOTHERAPIST', 'PSYCHOLOGIST'];

export const SYSTEMS_OF_MEDICINE = [
  { value: 'ALLOPATHY', label: 'Allopathy' },
  { value: 'AYURVEDA', label: 'Ayurveda' },
  { value: 'HOMEOPATHY', label: 'Homeopathy' },
  { value: 'UNANI', label: 'Unani' },
  { value: 'SIDDHA', label: 'Siddha' },
  { value: 'YOGA_NATUROPATHY', label: 'Yoga & Naturopathy' },
  { value: 'DENTAL', label: 'Dental' },
  { value: 'OTHER', label: 'Other' },
];
export const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'UNDISCLOSED', label: 'Prefer not to say' },
];
export const REGISTRATION_BODIES = ['NMC', 'State Medical Council', 'Dental Council of India', 'CCIM', 'CCH', 'Nursing Council', 'Other'];
export const SPECIALTY_LEVELS = [
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'SECONDARY', label: 'Secondary' },
  { value: 'SUPER_SPECIALTY', label: 'Super-specialty' },
];
export const DOCUMENT_TYPES = [
  { value: 'REGISTRATION_CERTIFICATE', label: 'Registration certificate' },
  { value: 'DEGREE_CERTIFICATE', label: 'Degree certificate' },
  { value: 'ID_PROOF', label: 'ID proof' },
  { value: 'PHOTO', label: 'Photo' },
  { value: 'SIGNATURE', label: 'Signature' },
  { value: 'EXPERIENCE_LETTER', label: 'Experience letter' },
  { value: 'OTHER', label: 'Other' },
];
export const STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED'];
export const VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'];

export const AVAILABILITY_TYPES = [
  { value: 'PHYSICAL', label: 'Physical', hint: 'Sees patients in person at a facility' },
  { value: 'REMOTE', label: 'Remote', hint: 'Consults by video, audio or chat' },
  { value: 'OTHER', label: 'Other', hint: 'On demand, on call, home visits, outreach camps' },
];
export const AVAILABILITY_SUBTYPES = [
  { value: 'ON_DEMAND', label: 'On demand' },
  { value: 'ON_CALL', label: 'On call' },
  { value: 'HOME_VISIT', label: 'Home visit' },
  { value: 'OUTREACH_CAMP', label: 'Outreach camp' },
  { value: 'OTHER', label: 'Other' },
];
export const EMPLOYMENT_TYPES = [
  { value: 'FULL_TIME', label: 'Full time' },
  { value: 'PART_TIME', label: 'Part time' },
  { value: 'VISITING', label: 'Visiting' },
  { value: 'CONSULTANT', label: 'Consultant' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'HONORARY', label: 'Honorary' },
];
export const REMOTE_CHANNELS = [
  { value: 'VIDEO', label: 'Video' },
  { value: 'AUDIO', label: 'Audio' },
  { value: 'CHAT', label: 'Chat' },
];
export const AFFILIATION_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ENDED'];

export const labelOf = (list: { value: string; label: string }[], value: string | null | undefined): string =>
  list.find((item) => item.value === value)?.label ?? (value || '—');

export function availabilityLabel(a: { availabilityType: string; availabilitySubtype?: string | null }): string {
  if (a.availabilityType === 'OTHER') return labelOf(AVAILABILITY_SUBTYPES, a.availabilitySubtype);
  return labelOf(AVAILABILITY_TYPES, a.availabilityType);
}

// ---------------------------------------------------------------- form models

export interface AffiliationModel {
  affiliationId?: number;
  organizationId: number | null;
  facilityId: number | null;
  departmentId: number | null;
  availabilityType: string;
  availabilitySubtype: string;
  designation: string;
  employmentType: string;
  employeeCode: string;
  roomOrChamber: string;
  remoteChannels: string[];
  consultationFee: number | null;
  followUpFee: number | null;
  currency: string;
  followUpValidDays: number | null;
  consultationDurationMinutes: number | null;
  acceptsNewPatients: boolean;
  isPrimary: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  notes: string;
  facilityServiceIds: number[];
}

export function newAffiliation(): AffiliationModel {
  return {
    organizationId: null,
    facilityId: null,
    departmentId: null,
    availabilityType: 'PHYSICAL',
    availabilitySubtype: '',
    designation: '',
    employmentType: '',
    employeeCode: '',
    roomOrChamber: '',
    remoteChannels: [],
    consultationFee: null,
    followUpFee: null,
    currency: 'INR',
    followUpValidDays: null,
    consultationDurationMinutes: null,
    acceptsNewPatients: true,
    isPrimary: false,
    effectiveFrom: '',
    effectiveTo: '',
    notes: '',
    facilityServiceIds: [],
  };
}

export function affiliationFromApi(a: any): AffiliationModel {
  return {
    affiliationId: a.affiliationId,
    organizationId: a.organizationId ?? null,
    facilityId: a.facilityId ?? null,
    departmentId: a.departmentId ?? null,
    availabilityType: a.availabilityType,
    availabilitySubtype: a.availabilitySubtype ?? '',
    designation: a.designation ?? '',
    employmentType: a.employmentType ?? '',
    employeeCode: a.employeeCode ?? '',
    roomOrChamber: a.roomOrChamber ?? '',
    remoteChannels: [...(a.remoteChannels ?? [])],
    consultationFee: a.consultationFee ?? null,
    followUpFee: a.followUpFee ?? null,
    currency: a.currency ?? 'INR',
    followUpValidDays: a.followUpValidDays ?? null,
    consultationDurationMinutes: a.consultationDurationMinutes ?? null,
    acceptsNewPatients: a.acceptsNewPatients ?? true,
    isPrimary: !!a.isPrimary,
    effectiveFrom: a.effectiveFrom ?? '',
    effectiveTo: a.effectiveTo ?? '',
    notes: a.notes ?? '',
    facilityServiceIds: [...(a.facilityServiceIds ?? [])],
  };
}

const blank = (value: string) => (value && value.trim() ? value.trim() : null);

/** What the API accepts; fields that don't apply to the chosen type are left out. */
export function affiliationPayload(m: AffiliationModel): Record<string, unknown> {
  const physical = m.availabilityType === 'PHYSICAL';
  const remote = m.availabilityType === 'REMOTE';
  const other = m.availabilityType === 'OTHER';
  return {
    organizationId: m.organizationId,
    facilityId: m.facilityId ?? null,
    departmentId: m.facilityId ? (m.departmentId ?? null) : null,
    availabilityType: m.availabilityType,
    availabilitySubtype: other ? m.availabilitySubtype : '',
    designation: blank(m.designation),
    employmentType: m.employmentType || null,
    employeeCode: blank(m.employeeCode),
    roomOrChamber: physical ? blank(m.roomOrChamber) : null,
    remoteChannels: remote ? m.remoteChannels : [],
    consultationFee: m.consultationFee ?? null,
    followUpFee: m.followUpFee ?? null,
    currency: (m.currency || 'INR').toUpperCase(),
    followUpValidDays: m.followUpValidDays ?? null,
    consultationDurationMinutes: m.consultationDurationMinutes ?? null,
    acceptsNewPatients: m.acceptsNewPatients,
    isPrimary: m.isPrimary,
    effectiveFrom: m.effectiveFrom || null,
    effectiveTo: m.effectiveTo || null,
    notes: blank(m.notes),
    facilityServiceIds: m.facilityId ? m.facilityServiceIds : [],
  };
}

/** Client-side mirror of the service's validateAffiliationShape, for a friendlier message before the round-trip. */
export function validateAffiliation(m: AffiliationModel): string | null {
  if (!m.organizationId) return 'Choose an organization';
  if (m.availabilityType === 'PHYSICAL' && !m.facilityId) return 'Physical availability needs a facility';
  if (m.availabilityType === 'REMOTE' && !m.remoteChannels.length) return 'Choose at least one remote channel (video, audio or chat)';
  if (m.availabilityType === 'OTHER' && !m.availabilitySubtype) return 'Choose the kind of availability (on demand, on call, ...)';
  if (m.effectiveFrom && m.effectiveTo && m.effectiveTo < m.effectiveFrom) return 'The end date is before the start date';
  return null;
}
