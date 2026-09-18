import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from './config';
import { Observable } from 'rxjs';

export interface CountryResponse {
  countryId: number;
  isoAlpha2?: string;
  isoAlpha3?: string;
  name?: string;
  status?: string;
}

export interface StateResponse {
  countryId: number;
  stateId: number;
  name?: string;
  status?: string;
}

export interface DistrictResponse {
  districtId: number;
  stateId: number;
  name?: string;
  status?: string;
}

export interface SubDistrictResponse {
  districtId: number;
  subDistrictId: number;
  name?: string;
  status?: string;
}

export interface CityResponse {
  cityId: number;
  subDistrictId: number;
  name?: string;
  status?: string;
}

export interface PostalCodeResponse {
  postalCodeId: number;
  subDistrictId: number;
  code?: string;
  status?: string;
}

const headers = new HttpHeaders({
  'Content-Type': 'application/json',
  'x-tenant-uuid': 'NEW TENANT',
  'authorization': 'Bearer '+environment.internalServiceToken
});

@Injectable({ providedIn: 'root' })
export class GeoService {
  constructor(private http: HttpClient) {}

  getGeography<T>(path: string, query?: Record<string, string | number | undefined>) {
    let params = new HttpParams();
    
    Object.entries(query ?? {}).forEach(([k,v]) => { if (v !== undefined && v !== '') params = params.set(k, String(v)); });
    return this.http.get<T>(`${environment.apiBaseUrl}${path}`, { params,  headers });
  }
}
