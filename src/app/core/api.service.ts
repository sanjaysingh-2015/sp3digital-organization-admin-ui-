import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from './config';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  get<T>(path: string, query?: Record<string, string | number | undefined>) {
    let params = new HttpParams();
    Object.entries(query ?? {}).forEach(([k,v]) => { if (v !== undefined && v !== '') params = params.set(k, String(v)); });
    return this.http.get<T>(`${environment.apiBaseUrl}${path}`, { params });
  }
  post<T>(path: string, body: unknown = {}) { return this.http.post<T>(`${environment.apiBaseUrl}${path}`, body); }
  put<T>(path: string, body: unknown) { return this.http.put<T>(`${environment.apiBaseUrl}${path}`, body); }
  patch<T>(path: string, body: unknown = {}) { return this.http.patch<T>(`${environment.apiBaseUrl}${path}`, body); }
  delete<T>(path: string) { return this.http.delete<T>(`${environment.apiBaseUrl}${path}`); }
}
