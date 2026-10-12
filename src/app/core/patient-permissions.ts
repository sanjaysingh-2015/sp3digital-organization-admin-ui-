/**
 * Must match sp3digital-patient-admin-service's src/utils/permissions.js
 * (seeded by database/seeds/identity-admin-patient-rbac.sql):
 *   Tenant admin: all   ·   Front desk: create, read, update   ·   Tenant user: create, read
 */
export const PATIENT_PERMISSIONS = {
  CREATE: 'patient-admin:patient:create',
  READ: 'patient-admin:patient:read',
  UPDATE: 'patient-admin:patient:update',
  MERGE: 'patient-admin:patient:merge',
  AUDIT: 'patient-admin:patient:audit',
  SETTINGS: 'patient-admin:settings:update',
};
