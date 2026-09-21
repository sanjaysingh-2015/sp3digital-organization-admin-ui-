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
