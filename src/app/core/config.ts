export const environment = {
  apiBaseUrl: 'http://localhost:3100/api/v1/organization-admin',
  // sp3digital-identity-admin-service — this app's own /login screen
  // authenticates directly against it (same backend identity-admin-ui uses).
  identityApiBaseUrl: 'http://localhost:3000/api/v1/identity-admin',
  // sp3digital-appointment-admin-service — slot configuration. Verifies the
  // exact same JWT this app already holds, so no separate login/token
  // needed — see appointment-api.service.ts.
  appointmentApiBaseUrl: 'http://localhost:3200/api/v1/appointment-admin',
  // sp3digital-provider-admin-service — doctors / providers and their
  // organization / facility affiliations. Same JWT, same pattern as above.
  providerApiBaseUrl: 'http://localhost:3300/api/v1/provider-admin',
  internalServiceToken: 'cvLLdJv2EV1ZvA5NM1Jr5CY1WfzUc-CN8bs8m4El39nW7a1t8pewr4SfgSjvz1wr'
};
