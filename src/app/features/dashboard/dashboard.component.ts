import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, finalize, map, switchMap } from 'rxjs/operators';

import { ApiService } from '../../core/api.service';
import { AppointmentApiService } from '../../core/appointment-api.service';
import { AuthService } from '../../core/auth.service';
import { UserService } from '../../core/user.service';
import { PageComponent } from '../../shared/page.component';

// Same values as facility-closures.component.ts's CLOSURE_TYPE_LABELS.
const CLOSURE_TYPE_LABELS: Record<string, string> = {
  HOLIDAY: 'Holiday',
  WEEKLY_OFF: 'Weekly off',
  EMERGENCY: 'Emergency closure',
  MAINTENANCE: 'Maintenance',
  OTHER: 'Other',
};

type Tone = 'indigo' | 'emerald' | 'sky';
type PillTone = 'good' | 'warning' | 'danger' | 'neutral' | 'tone';

interface Tile {
  key: string;
  label: string;
  icon: string;
  route: string;
  // Shown under the label for child entities, e.g. "in Facilities".
  hint?: string;
  // Columns taken on the 4-column tile grid (default 1).
  span?: 1 | 2;
}

interface PreviewRow {
  id: number | string;
  title: string;
  subtitle: string;
  pill: string;
  pillTone: PillTone;
  // Initials shown in a round avatar (people lists only).
  avatar?: string;
}

interface PreviewPanel {
  key: string;
  title: string;
  route: string;
  empty: string;
}

interface Group {
  key: string;
  title: string;
  // One tone per group; everything inside the group inherits it.
  tone: Tone;
  route: string;
  // Entity hierarchy, shown under the group title.
  hierarchy: string;
  // Optional headline count for the group's root entity (Organizations).
  rootCountKey?: string;
  tiles: Tile[];
  panels: PreviewPanel[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, PageComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  loading = true;

  // Entity hierarchy:
  //   Organizations: Users, Facilities (Departments, Facility Services)
  //   Services:      Service Categories, Services
  //   Schedule:      Weekly Offs / Holidays, Slots
  readonly groups: Group[] = [
    {
      key: 'organizations',
      title: 'Organizations',
      tone: 'indigo',
      route: '/organizations',
      hierarchy: 'Users · Facilities › Departments, Facility Services',
      rootCountKey: 'organizations',
      tiles: [
        { key: 'users', label: 'Users', icon: '◉', route: '/users' },
        { key: 'facilities', label: 'Facilities', icon: '◈', route: '/facilities' },
        { key: 'departments', label: 'Departments', icon: '◆', route: '/departments', hint: 'in Facilities' },
        { key: 'facilityServices', label: 'Facility Services', icon: '◇', route: '/facility-services', hint: 'in Facilities' },
      ],
      panels: [
        { key: 'team', title: 'Team', route: '/users', empty: 'No users yet.' },
        { key: 'facilities', title: 'Facilities', route: '/facilities', empty: 'No facilities yet.' },
        { key: 'departments', title: 'Departments', route: '/departments', empty: 'No departments yet.' },
        { key: 'facilityServices', title: 'Facility Services', route: '/facility-services', empty: 'No facility services yet.' },
      ],
    },
    {
      key: 'services',
      title: 'Services',
      tone: 'emerald',
      route: '/services',
      hierarchy: 'Service Categories · Services',
      tiles: [
        { key: 'serviceCategories', label: 'Service Categories', icon: '◉', route: '/service-categories', span: 2 },
        { key: 'services', label: 'Services', icon: '◈', route: '/services', span: 2 },
      ],
      panels: [
        { key: 'serviceCategories', title: 'Service Categories', route: '/service-categories', empty: 'No service categories yet.' },
        { key: 'services', title: 'Services', route: '/services', empty: 'No services configured yet.' },
      ],
    },
    {
      key: 'schedule',
      title: 'Schedule',
      tone: 'sky',
      route: '/appointment-slot-configs',
      hierarchy: 'Weekly Offs / Holidays · Slots',
      tiles: [
        { key: 'closures', label: 'Weekly Offs & Holidays', icon: '◉', route: '/facility-closures', span: 2 },
        { key: 'slots', label: 'Slots', icon: '◈', route: '/appointment-slot-configs', span: 2 },
      ],
      panels: [
        { key: 'closures', title: 'Weekly Offs & Holidays', route: '/facility-closures', empty: 'No upcoming closures.' },
        { key: 'slots', title: 'Slots', route: '/appointment-slot-configs', empty: 'No active slots yet.' },
      ],
    },
  ];

  counts: Record<string, number> = {};
  previews: Record<string, PreviewRow[]> = {};
  previewLoading: Record<string, boolean> = {};

  constructor(
    private readonly api: ApiService,
    private readonly appointmentApi: AppointmentApiService,
    private readonly userApi: UserService,
    public readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.loadCounts();
    this.loadTeam();
    this.loadFacilities();
    this.loadDepartments();
    this.loadFacilityServices();
    this.loadServiceCategories();
    this.loadServices();
    this.loadClosures();
    this.loadSlots();
  }

  initialsFor(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  countFor(key: string): string {
    if (this.loading) return '—';
    return String(this.counts[key] ?? 0);
  }

  isPreviewLoading(key: string): boolean {
    return this.previewLoading[key] !== false;
  }

  previewRows(key: string): PreviewRow[] {
    return this.previews[key] ?? [];
  }

  get hasNoOrganizations(): boolean {
    return !this.loading && (this.counts['organizations'] ?? 0) === 0;
  }

  // ---- headline counts --------------------------------------------------

  private loadCounts(): void {
    this.loading = true;

    forkJoin({
      organizations: this.getCount(this.api.get<any>('/organizations/list')),
      facilities: this.getCount(this.api.get<any>('/facilities/list')),
      departments: this.getCount(this.api.get<any>('/departments/list')),
      facilityServices: this.getCount(this.api.get<any>('/facility-services/list')),
      users: this.getCount(this.userApi.getUsers({ page: 1, limit: 1, search: '', status: '' })),
      serviceCategories: this.getCount(this.api.get<any>('/service-categories', { page: 1, limit: 1 })),
      services: this.getCount(this.api.get<any>('/services', { page: 1, limit: 1 })),
      closures: this.getCount(this.appointmentApi.get<any>('/facility-closures', { page: 1, limit: 1, status: 'ACTIVE' })),
      slots: this.getCount(this.appointmentApi.get<any>('/slot-configs', { page: 1, limit: 1, status: 'ACTIVE' })),
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe((counts) => (this.counts = counts));
  }

  private getCount(source: Observable<any>): Observable<number> {
    return source.pipe(
      map((response) => this.extractCount(response)),
      catchError(() => of(0)),
    );
  }

  private extractCount(response: any): number {
    const count =
      response?.pagination?.totalItems ??
      response?.count ??
      response?.total ??
      response?.data?.count ??
      response?.data?.total ??
      (Array.isArray(response?.data) ? response.data.length : 0);

    const numericCount = Number(count);
    return Number.isFinite(numericCount) && numericCount >= 0 ? numericCount : 0;
  }

  // ---- previews (first five rows of each list) ---------------------------

  private loadPreview(
    key: string,
    source: Observable<any>,
    toRows: (response: any) => PreviewRow[],
  ): void {
    this.previewLoading[key] = true;
    source
      .pipe(
        map((response) => toRows(response).slice(0, 5)),
        catchError(() => of([] as PreviewRow[])),
        finalize(() => (this.previewLoading[key] = false)),
      )
      .subscribe((rows) => (this.previews[key] = rows));
  }

  private statusTone(status: string): PillTone {
    switch (status) {
      case 'ACTIVE':
        return 'good';
      case 'DISABLED':
        return 'warning';
      case 'INACTIVE':
      case 'DELETED':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  private loadTeam(): void {
    this.loadPreview(
      'team',
      this.userApi.getUsers({ page: 1, limit: 5, search: '', status: '' }),
      (response) =>
        this.extractUserRows(response).map((user: any): PreviewRow => {
          const name =
            user.displayName ||
            `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
            user.username ||
            'Unknown user';
          return {
            id: user.userId ?? user.userUuid ?? name,
            title: name,
            subtitle: user.username || user.email || '',
            pill: user.userType || '—',
            pillTone: 'neutral',
            avatar: this.initialsFor(name),
          };
        }),
    );
  }

  private loadFacilities(): void {
    this.loadPreview(
      'facilities',
      this.api.get<any>('/facilities', { page: 1, limit: 5, search: '', status: '' }),
      (response) =>
        this.extractUserRows(response).map((facility: any): PreviewRow => {
          const name = facility.facilityName || 'Unknown facility';
          return {
            id: facility.facilityId ?? name,
            title: name,
            subtitle:
              [facility.facilityType, [facility.cityName, facility.stateName].filter(Boolean).join(', ')]
                .filter(Boolean)
                .join(' · ') || '—',
            pill: facility.status || '—',
            pillTone: this.statusTone(facility.status),
            avatar: this.initialsFor(name),
          };
        }),
    );
  }

  private loadDepartments(): void {
    this.loadPreview(
      'departments',
      this.api.get<any>('/departments', { page: 1, limit: 5, search: '', status: '' }),
      (response) =>
        this.extractUserRows(response).map((department: any): PreviewRow => {
          const name = department.departmentName || 'Unknown department';
          return {
            id: department.departmentId ?? department.departmentUuid ?? name,
            title: name,
            subtitle:
              [department.departmentType, department.facilityName].filter(Boolean).join(' · ') || '—',
            pill: department.status || '—',
            pillTone: this.statusTone(department.status),
            avatar: this.initialsFor(name),
          };
        }),
    );
  }

  // Facility service data: which service runs at which facility / department.
  private loadFacilityServices(): void {
    this.loadPreview(
      'facilityServices',
      this.api.get<any>('/facility-services/list'),
      (response) =>
        (response?.data || []).map((fs: any): PreviewRow => ({
          id: fs.facilityServiceId,
          title: fs.serviceName || `Facility service #${fs.facilityServiceId}`,
          subtitle: [fs.facilityName, fs.departmentName].filter(Boolean).join(' · ') || '—',
          pill: fs.status || '—',
          pillTone: this.statusTone(fs.status),
        })),
    );
  }

  private loadServiceCategories(): void {
    this.loadPreview(
      'serviceCategories',
      this.api.get<any>('/service-categories', { page: 1, limit: 5 }),
      (response) =>
        (response?.data || []).map((row: any): PreviewRow => ({
          id: row.serviceCategoryId,
          title: row.serviceCategoryName || `Category #${row.serviceCategoryId}`,
          subtitle: row.description || '—',
          pill: row.status || '—',
          pillTone: this.statusTone(row.status),
        })),
    );
  }

  private loadServices(): void {
    this.loadPreview(
      'services',
      this.api.get<any>('/services', { page: 1, limit: 5 }),
      (response) =>
        (response?.data || []).map((row: any): PreviewRow => ({
          id: row.serviceId,
          title: row.serviceName || `Service #${row.serviceId}`,
          subtitle: row.description || '—',
          pill: row.status || '—',
          pillTone: this.statusTone(row.status),
        })),
    );
  }

  private loadClosures(): void {
    // Closures only carry a facility id, so resolve names from the facility list.
    const source = this.api.get<any>('/facilities/list').pipe(
      catchError(() => of({ data: [] })),
      switchMap((facilityResponse) => {
        const nameById = new Map<number, string>(
          (facilityResponse?.data || []).map((f: any) => [f.facilityId, f.facilityName]),
        );
        return this.appointmentApi
          .get<any>('/facility-closures', { page: 1, limit: 5, status: 'ACTIVE' })
          .pipe(map((response) => ({ response, nameById })));
      }),
    );

    this.previewLoading['closures'] = true;
    source
      .pipe(
        map(({ response, nameById }) =>
          (response?.data || []).slice(0, 5).map((row: any): PreviewRow => ({
            id: row.closureId,
            title: row.facilityId
              ? nameById.get(row.facilityId) || `Facility #${row.facilityId}`
              : 'All facilities',
            subtitle: `${
              row.closureDate
                ? row.closureDate
                : row.dayOfWeek
                  ? this.dayLabel(row.dayOfWeek)
                  : 'Recurring'
            } · ${row.reason || '—'}`,
            pill: CLOSURE_TYPE_LABELS[row.closureType] || row.closureType || '—',
            pillTone: 'tone',
          })),
        ),
        catchError(() => of([] as PreviewRow[])),
        finalize(() => (this.previewLoading['closures'] = false)),
      )
      .subscribe((rows) => (this.previews['closures'] = rows));
  }

  private loadSlots(): void {
    // Slot configs only carry a facility-service id, so resolve names first.
    const source = this.api.get<any>('/facility-services/list').pipe(
      catchError(() => of({ data: [] })),
      switchMap((fsResponse) => {
        const nameById = new Map<number, string>(
          (fsResponse?.data || []).map((fs: any) => [fs.facilityServiceId, fs.serviceName]),
        );
        return this.appointmentApi
          .get<any>('/slot-configs', { page: 1, limit: 5, status: 'ACTIVE' })
          .pipe(map((response) => ({ response, nameById })));
      }),
    );

    this.previewLoading['slots'] = true;
    source
      .pipe(
        map(({ response, nameById }) =>
          (response?.data || []).slice(0, 5).map((row: any): PreviewRow => ({
            id: row.slotConfigId,
            title: nameById.get(row.facilityServiceId) || `Facility service #${row.facilityServiceId}`,
            subtitle: `${this.recurrenceLabel(row)} · ${row.startTime?.slice(0, 5) || ''}–${row.endTime?.slice(0, 5) || ''} · cap ${row.capacityPerSlot}`,
            pill: row.status || '—',
            pillTone: this.statusTone(row.status),
          })),
        ),
        catchError(() => of([] as PreviewRow[])),
        finalize(() => (this.previewLoading['slots'] = false)),
      )
      .subscribe((rows) => (this.previews['slots'] = rows));
  }

  private recurrenceLabel(row: any): string {
    if (!row) return '—';
    switch (row.recurrenceType) {
      case 'DAILY':
        return 'Daily';
      case 'MONTHLY':
        return row.dayOfMonth ? `Monthly · day ${row.dayOfMonth}` : 'Monthly';
      case 'WEEKLY':
      default:
        return row.dayOfWeek ? `Weekly · ${this.dayLabel(row.dayOfWeek)}` : 'Weekly';
    }
  }

  // Same extraction logic as users.component.ts — the list endpoint's
  // envelope shape varies (data as array vs. data.items vs. top-level items/rows).
  private extractUserRows(response: any): any[] {
    if (!response) return [];
    if (Array.isArray(response.data)) return response.data;
    if (response.data && 'items' in response.data) return response.data.items ?? [];
    if (response.items) return response.items;
    if (response.rows) return response.rows;
    return [];
  }

  private dayLabel(dayOfWeek: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek === 7 ? 0 : dayOfWeek] || '—';
  }
}
