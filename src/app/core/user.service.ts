import { Injectable, signal } from "@angular/core";
import { Router } from "@angular/router";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "./config";

export interface UserRequest {
  tenantUuid: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string;
  displayName: string;
  phoneCountryCode: string;
  phoneNumber: string;
  userType: string;
}

export interface UserListRequest {
  page: number;
  limit: number;
  search: string;
  status: string;
}

export interface UserResponse {
  tenantUuid: string;
  userId: 5;
  userUuid: string;
  username: string;
  email: string;
  firstName: string;
  middleName: string;
  lastName: string;
  userType: string;
  displayName: string;
  phoneCountryCode: string;
  phoneNumber: string;
  status: string;
  createdOn: string;
}
// Define what the API actually returns (adjust to your real shape)
export interface UserListResponse {
  data?: UserResponse[] | { items: UserResponse[] };
  items?: UserResponse[];
  rows?: UserResponse[];
  pagination?: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface UserStatusUpdateRequest {
  status: string
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
 * (`sp3_identity_admin_token`), so a token from either app's login is
 * treated identically here: claims, tenant scoping, and the Authorization
 * header all work exactly as they do in identity-admin-ui.
 */
@Injectable({ providedIn: "root" })
export class UserService {
  private readonly key = "sp3_identity_admin_token";

  private readonly identityApiBaseUrl = environment.identityApiBaseUrl;

  readonly token = signal<string | null>(localStorage.getItem(this.key));

  constructor(
    private router: Router,
    private http: HttpClient,
  ) {}

  /**
   * Create User — posts directly to sp3digital-identity-admin-service.
   */
  createUser(request: UserRequest): Observable<UserRequest> {
    return this.http.post<UserRequest>(
      `${this.identityApiBaseUrl}/users`,
      request,
    );
  }

  /**
   * Update User — posts directly to sp3digital-identity-admin-service.
   */
  updateUser(userId: string | number, request: UserRequest): Observable<UserRequest> {
    return this.http.patch<UserRequest>(
      `${this.identityApiBaseUrl}/users/${userId}`,
      request,
    );
  }

  /**
   * Update User Status — posts directly to sp3digital-identity-admin-service.
   */
  updateUserStatus(userId: string | number, request: UserStatusUpdateRequest): Observable<UserRequest> {
    return this.http.patch<UserRequest>(
      `${this.identityApiBaseUrl}/users/${userId}/status`,
      request,
    );
  }
  
  /**
   * Get User List — posts directly to sp3digital-identity-admin-service.
   */
  getUsers(request: UserListRequest): Observable<UserListResponse> {
    let params = new HttpParams();

    Object.entries(request).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") {
        params = params.set(key, value.toString());
      }
    });

    return this.http.get<UserListResponse>(`${this.identityApiBaseUrl}/users`, {
      params,
    });
  }

  /**
   * Get User List — posts directly to sp3digital-identity-admin-service.
   */
  getUserDetail(userId: number): Observable<UserResponse> {
    return this.http.get<UserResponse>(`${this.identityApiBaseUrl}/users/${userId}`);
  }
  
  /** Store access token */
  setToken(token: string) {
    const cleanToken = token.trim();

    localStorage.setItem(this.key, cleanToken);

    this.token.set(cleanToken);
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
}
