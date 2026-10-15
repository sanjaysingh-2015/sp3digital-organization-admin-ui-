/**
 * Must match appointment-admin-service's src/utils/permissions.js exactly
 * — these are the codes identity-admin-service grants to TENANT_ADMIN
 * (all four) and TENANT_USER (create+read only) via its
 * database/seeds/appointment-slot-config-rbac.sql.
 */
export const SLOT_CONFIG_PERMISSIONS = {
  CREATE: 'appointment-admin:slot-config:create',
  READ: 'appointment-admin:slot-config:read',
  UPDATE: 'appointment-admin:slot-config:update',
  APPROVE: 'appointment-admin:slot-config:approve',
};

/**
 * Booking. Must match appointment-admin-service's utils/permissions.js
 * (seeded by database/seeds/identity-admin-booking-rbac.sql):
 *   Tenant admin: all  ·  Front desk: read, create, update  ·  Tenant user: read, create
 */
export const APPOINTMENT_PERMISSIONS = {
  READ: 'appointment-admin:appointment:read',
  CREATE: 'appointment-admin:appointment:create', // book
  UPDATE: 'appointment-admin:appointment:update', // cancel / reschedule
};

export const SLOT_PERMISSIONS = {
  READ: 'appointment-admin:slot:read',
  GENERATE: 'appointment-admin:slot:generate',
};

