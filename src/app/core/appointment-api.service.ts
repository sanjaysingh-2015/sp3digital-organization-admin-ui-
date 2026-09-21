import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from './config';

/**
 * Calls sp3digital-appointment-admin-service (slot configuration) from
 * within organization-admin-ui.
 *
 * No auth headers set here on purpose — auth.interceptor.ts already
 * attaches `Authorization: Bearer <token>` to every outgoing HttpClient
 * request app-wide, and appointment-admin-service verifies tokens minted
 * by identity-admin-service directly (same shared secret organization
 * -admin-service verifies with) — so this app's own tenant_uuid/
 * permissions claims are exactly what appointment-admin-service sees and
 * scopes/authorizes against.
 */
@Injectable({ providedIn: 'root' })
export class AppointmentApiService {
  constructor(private http: HttpClient) {}

  get<T>(path: string, query?: Record<string, string | number | undefined>) {
    let params = new HttpParams();
    Object.entries(query ?? {}).forEach(([k, v]) => { if (v !== undefined && v !== '') params = params.set(k, String(v)); });
    return this.http.get<T>(`${environment.appointmentApiBaseUrl}${path}`, { params });
  }
  post<T>(path: string, body: unknown = {}) { return this.http.post<T>(`${environment.appointmentApiBaseUrl}${path}`, body); }
  patch<T>(path: string, body: unknown = {}) { return this.http.patch<T>(`${environment.appointmentApiBaseUrl}${path}`, body); }
}
