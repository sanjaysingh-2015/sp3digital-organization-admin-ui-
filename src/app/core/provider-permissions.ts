/**
 * Must match sp3digital-provider-admin-service's src/utils/permissions.js —
 * TENANT_ADMIN gets all three, TENANT_USER read only (see that repo's
 * database/seeds/identity-admin-provider-rbac.sql).
 */
export const PROVIDER_PERMISSIONS = {
  CREATE: 'provider-admin:provider:create',
  READ: 'provider-admin:provider:read',
  UPDATE: 'provider-admin:provider:update',
};
