import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from './config';

/**
 * Calls sp3digital-patient-admin-service. Same arrangement as the provider and
 * appointment services: the auth interceptor attaches the identity-admin-service
 * JWT, and the service scopes and authorizes on its tenant / permission claims.
 *
 * Searching is a POST on purpose — names and phone numbers must not appear in
 * URLs, browser history or server logs.
 */
@Injectable({ providedIn: 'root' })
export class PatientApiService {
  constructor(private http: HttpClient) {}

  get<T>(path: string, query?: Record<string, string | number | undefined | null>) {
    let params = new HttpParams();
    Object.entries(query ?? {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<T>(`${environment.patientApiBaseUrl}${path}`, { params });
  }
  post<T>(path: string, body: unknown = {}) { return this.http.post<T>(`${environment.patientApiBaseUrl}${path}`, body); }
  patch<T>(path: string, body: unknown = {}) { return this.http.patch<T>(`${environment.patientApiBaseUrl}${path}`, body); }
  put<T>(path: string, body: unknown = {}) { return this.http.put<T>(`${environment.patientApiBaseUrl}${path}`, body); }
}
