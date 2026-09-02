# sp3digital-organization-admin-ui

Angular 20 (standalone components) admin UI for `sp3digital-organization-admin-service` —
manage Organizations, Facilities, Departments and Facility Services, plus a
**Self Registration** onboarding wizard for a tenant's first organization.

Same stack, layout, and design system as `sp3digital-identity-admin-ui`
(ag-grid, shared `styles.scss` design tokens, confirm/notification modal
pattern) so the two admin consoles feel like one product.

## This app has NO login screen

Authentication is entirely owned by **identity-admin-ui**. This app:

- Never collects a username/password.
- Reads the access token from the **same localStorage key**
  (`sp3_identity_admin_token`) identity-admin-ui uses — if both consoles
  are deployed under one origin (e.g. `/identity/*` and `/organization/*`
  behind a shared reverse proxy), signing in once on either side is enough.
- If deployed on a **different origin** (separate ports/subdomains,
  common in dev), `auth.guard.ts` redirects an unauthenticated visitor to
  `environment.identityAdminLoginUrl` with a `returnUrl`. identity-admin-ui
  is expected to redirect back to that `returnUrl` with `?token=<jwt>`
  once login succeeds; `auth.service.ts#captureTokenFromUrl()` picks that
  token up on bootstrap (via an `APP_INITIALIZER`), stores it, and strips
  it from the visible URL.
- On a 401 `INVALID_TOKEN` / `UNAUTHENTICATED` response from the API, the
  token is cleared and the browser is sent back to identity-admin-ui's
  login the same way.

**Coordination needed with identity-admin-ui:** its login flow needs to
honor an incoming `returnUrl` query param and, on success, redirect back
to it with `?token=<accessToken>` appended (rather than just navigating to
its own `/dashboard`). If identity-admin-ui doesn't do this yet, that's a
small addition on that side — happy to make it if you'd like.

## Self Registration

`/onboarding` is the SaaS onboarding wizard: an authenticated tenant admin
who doesn't have an organization yet registers one (name + type), then
optionally registers their first facility, in two steps. The dashboard
shows a "Register your organization →" banner automatically when the
tenant has zero organizations.

**Scope note:** identity-service currently has no public/anonymous
tenant+user signup endpoint — only `/auth/login`, `/auth/token/refresh`,
`/auth/logout` and `/public/tenants/search` are unauthenticated. So this
wizard covers the part organization-admin-ui actually owns (org +
facility self-service), not a from-scratch "create my company as an
anonymous visitor" flow. If you want that too, it needs a new public
endpoint added to identity-service first.

## Getting started

```bash
npm install
npm start   # ng serve, http://localhost:4201 by default — pick a port that
            # doesn't collide with identity-admin-ui (commonly :4200)
```

Configure `src/app/core/config.ts` / `src/app/environments/environment.ts`:

```ts
export const environment = {
  apiBaseUrl: 'http://localhost:3100/api/v1/organization-admin', // organization-service
  identityAdminLoginUrl: 'http://localhost:4200/login',           // identity-admin-ui
};
```

## Structure

```
src/app/
  core/            AuthService (no login!), ApiService, guards, interceptors, UiService
  layout/          ShellComponent (sidebar + topbar)
  shared/          PageComponent, ConfirmModal, NotificationModal
  features/
    dashboard/     Stat overview + onboarding CTA
    onboarding/     ← Self Registration wizard
    organizations/  Organizations CRUD (self-referencing parent hierarchy)
    facilities/     Facilities CRUD (org dropdown, address, geo)
    departments/    Departments CRUD (facility dropdown)
    facility-services/  Facility Services CRUD (facility + department dropdowns)
```

Every feature follows the same pattern: server-side-paginated ag-grid list
+ search/status/type filters, create/edit modal, details modal, soft-delete
via confirm-modal → `PATCH .../status { status: 'DELETED' }`.
