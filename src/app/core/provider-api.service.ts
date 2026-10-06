import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from './config';

/**
 * Calls sp3digital-provider-admin-service (doctors / providers) from within
 * organization-admin-ui. Same arrangement as appointment-api.service.ts: the
 * auth interceptor attaches the identity-admin-service JWT to every request,
 * and the provider service scopes and authorizes on that token's
 * tenant_uuid / permissions claims.
 */
@Injectable({ providedIn: 'root' })
export class ProviderApiService {
  constructor(private http: HttpClient) {}

  get<T>(path: string, query?: Record<string, string | number | undefined | null>) {
    let params = new HttpParams();
    Object.entries(query ?? {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<T>(`${environment.providerApiBaseUrl}${path}`, { params });
  }
  post<T>(path: string, body: unknown = {}) { return this.http.post<T>(`${environment.providerApiBaseUrl}${path}`, body); }
  patch<T>(path: string, body: unknown = {}) { return this.http.patch<T>(`${environment.providerApiBaseUrl}${path}`, body); }
}
