import { Injectable, signal } from "@angular/core";
import { Router } from "@angular/router";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "./config";

export interface LoginRequest {
  usernameOrEmail: string;
  password: string;
  tenantUuid: string;
}

export interface LoginResponse {
  tokenType: string;
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface JwtResponse {
  amr?: string[];
  aud?: string;
  email?: string;
  exp?: number;
  family_name?: string;
  given_name?: string;
  iat?: number;
  iss?: string;
  preferred_username?: string;
  sub?: string;
  tenant_name?: string;
  tenant_uuid?: string;
  token_use?: string;
  user_id?: number;
}

export interface Tenant {
  tenantUuid: string;
  tenantCode: string;
  tenantName: string;
  status: string;
  createdOn?: string;
  modifiedOn?: string;
}

export interface TenantSearchResponse {
  success: boolean;
  count: number;
  data: Tenant[];
}

export interface RegisterOrganizationRequest {
  organizationName: string;
  organizationType: string;
  parentOrganizationId?: number | null;

  username: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  displayName?: string;
  phoneCountryCode: string;
  phoneNumber: string;

  password: string;
}

export interface RegisterOrganizationResponse {
  tokenType: string;
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn: number;
  tenantUuid: string;
  organizationId: number;
  userId: number;
}

/**
 * AuthService — organization-admin-ui has its own /login screen
 * (features/login/login.component.ts) that authenticates directly against
 * sp3digital-identity-admin-service, the same backend identity-admin-ui
 * uses. Both apps store the issued JWT under the same localStorage key
 * (`sp3_organization_token`), so a token from either app's login is
 * treated identically here: claims, tenant scoping, and the Authorization
 * header all work exactly as they do in identity-admin-ui.
 */
@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly key = "sp3_organization_token";
  private readonly idTokenKey = "sp3_organization_id_token";
  private readonly refreshTokenkey = "sp3_organization_refresh_token";

  private readonly identityApiBaseUrl = environment.identityApiBaseUrl;

  readonly token = signal<string | null>(localStorage.getItem(this.key));
  readonly idToken = signal<string | null>(
    localStorage.getItem(this.idTokenKey),
  );
  readonly refreshToken = signal<string | null>(
    localStorage.getItem(this.idTokenKey),
  );

  constructor(
    private router: Router,
    private http: HttpClient,
  ) {}

  /**
   * Login — posts directly to sp3digital-identity-admin-service.
   */
  login(request: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.identityApiBaseUrl}/auth/login`,
      request,
    );
  }

  /**
   * Self-service registration — one call that (server-side, in a
   * transaction) creates the tenant in identity-admin-service, the
   * organization in organization-admin-service, the first user, and grants
   * that user the TENANT_ADMIN role. Public/unauthenticated by design,
   * same as /auth/login. Returns tokens directly so the new user lands
   * signed-in, without a second login step.
   *
   * NOTE: this endpoint doesn't exist in identity-admin-service yet — see
   * the comment in onboarding.component.ts. Adjust the path/payload below
   * once it's implemented if the actual contract differs.
   */
  registerOrganization(
    request: RegisterOrganizationRequest,
  ): Observable<RegisterOrganizationResponse> {
    return this.http.post<RegisterOrganizationResponse>(
      `${this.identityApiBaseUrl}/public/register-organization`,
      request,
    );
  }

  /**
   * Search tenants (identity-admin-service public endpoint).
   *
   * Search should only be triggered when the user has entered at least
   * 5 characters.
   */
  searchTenants(search: string): Observable<TenantSearchResponse> {
    return this.http.get<TenantSearchResponse>(
      `${this.identityApiBaseUrl}/public/tenants/search`,
      {
        params: {
          q: search,
        },
      },
    );
  }

  /** Store access token */
  setToken(token: string) {
    const cleanToken = token.trim();

    localStorage.setItem(this.key, cleanToken);

    this.token.set(cleanToken);
  }

  /** Store id token */
  setIdToken(token: string) {
    const cleanToken = token.trim();

    localStorage.setItem(this.idTokenKey, cleanToken);

    this.idToken.set(cleanToken);
  }

  /** Store access token */
  setRefreshToken(token: string) {
    const cleanToken = token.trim();

    localStorage.setItem(this.refreshTokenkey, cleanToken);

    this.refreshToken.set(cleanToken);
  }
  /** Clear authentication and return to this app's own login screen. */
  clear(queryParams?: Record<string, unknown>) {
    localStorage.removeItem(this.key);

    this.token.set(null);

    this.router.navigate(["/login"], queryParams ? { queryParams } : undefined);
  }

  isAuthenticated() {
    return !!this.token();
  }

  /** Read JWT claims */
  claims(): Record<string, unknown> {
    const token = this.token();

    if (!token) {
      return {};
    }

    try {
      const payload = token.split(".")[1];

      return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    } catch {
      return {};
    }
  }

  /** Get tenant UUID from JWT */
  tenantUuid(): string {
    const c = this.claims();

    return String(c["tenant_uuid"] ?? c["tenantUuid"] ?? c["tid"] ?? "");
  }

  /** Get user id from JWT (used to attribute created_by/modified_by in the UI, if shown) */
  userId(): string {
    const c = this.claims();

    return String(c["user_id"] ?? c["userId"] ?? c["sub"] ?? "");
  }

  private getAccessTokenPayload(): JwtResponse | null {
    const token = localStorage.getItem(this.idTokenKey);

    if (!token) {
      return null;
    }

    try {
      const payload = token.split(".")[1];

      if (!payload) {
        return null;
      }

      // JWT payload is Base64URL encoded
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");

      const padded = base64.padEnd(
        base64.length + ((4 - (base64.length % 4)) % 4),
        "=",
      );

      const decodedPayload = atob(padded);

      return JSON.parse(decodedPayload) as JwtResponse;
    } catch (error) {
      console.error("Unable to decode ID token", error);
      return null;
    }
  }

  userName(): string {
    console.log("Test UserName");
    const payload = this.getAccessTokenPayload();

    return String(payload?.given_name + ", " + payload?.family_name);
  }

  tenantName(): string {
    const payload = this.getAccessTokenPayload();

    return String(payload?.tenant_name ?? "");
  }
}
