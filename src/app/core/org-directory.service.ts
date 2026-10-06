import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { ApiService } from './api.service';

/**
 * Cached lookups (organizations, facilities) used by the provider screens'
 * pickers. Every affiliation editor on a page shares one request instead of
 * firing its own. Departments and facility services are per-facility, so
 * they are not cached here.
 */
@Injectable({ providedIn: 'root' })
export class OrgDirectoryService {
  private organizations$?: Observable<any[]>;
  private facilities$?: Observable<any[]>;

  constructor(private api: ApiService) {}

  organizations(): Observable<any[]> {
    this.organizations$ ??= this.api.get<any>('/organizations/list').pipe(
      map((r) => r?.data || []),
      catchError(() => of([])),
      shareReplay(1),
    );
    return this.organizations$;
  }

  facilities(): Observable<any[]> {
    this.facilities$ ??= this.api.get<any>('/facilities/list').pipe(
      map((r) => r?.data || []),
      catchError(() => of([])),
      shareReplay(1),
    );
    return this.facilities$;
  }

  departments(facilityId: number): Observable<any[]> {
    return this.api.get<any>('/departments/list', { facilityId }).pipe(
      map((r) => (r?.data || []).filter((d: any) => Number(d.facilityId) === Number(facilityId))),
      catchError(() => of([])),
    );
  }

  facilityServices(facilityId: number): Observable<any[]> {
    return this.api.get<any>('/facility-services/list', { facilityId }).pipe(
      map((r) => (r?.data || []).filter((s: any) => Number(s.facilityId) === Number(facilityId))),
      catchError(() => of([])),
    );
  }
}
