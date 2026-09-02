export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3100/api/v1/organization-admin',
  // sp3digital-identity-admin-service — this app's own /login screen
  // authenticates directly against it (same backend identity-admin-ui uses).
  identityApiBaseUrl: 'http://localhost:3000/api/v1/identity-admin'
};
