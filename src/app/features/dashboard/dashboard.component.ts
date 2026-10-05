import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';

import { ApiService } from '../../core/api.service';
import { AppointmentApiService } from '../../core/appointment-api.service';
import { AuthService } from '../../core/auth.service';
import { UserService } from '../../core/user.service';
import { PageComponent } from '../../shared/page.component';

interface CountResponse {
  count?: number;
  total?: number;
  data?: {
    count?: number;
    total?: number;
  };
}

// Same values as facility-closures.component.ts's CLOSURE_TYPE_LABELS.
const CLOSURE_TYPE_LABELS: Record<string, string> = {
  HOLIDAY: 'Holiday',
  WEEKLY_OFF: 'Weekly off',
  EMERGENCY: 'Emergency closure',
  MAINTENANCE: 'Maintenance',
  OTHER: 'Other',
};

interface DashboardStat {
  label: string;
  value: number;
  icon: string;
  route: string;
  // Purely decorative — these are counts, not statuses, so this is a
  // rotating accent palette rather than --good/--warn/--danger.
  color: "indigo" | "sky" | "emerald" | "amber";
}

interface TeamMemberPreview {
  id: number | string;
  name: string;
  secondary: string;
  userType: string;
  status: string;
}

interface FacilityPreview {
  facilityId: number | string;
  facilityName: string;
  facilityType: string;
  cityName: string;
  status: string;
}

interface DepartmentPreview {
  departmentId: number | string;
  departmentName: string;
  departmentType: string;
  facilityName: string;
  status: string;
}

interface SchedulePreview {
  id: number | string;
  serviceName: string;
  recurrenceLabel: string;
  timeRange: string;
  capacity: number;
  status: string;
}

interface ClosurePreview {
  id: number | string;
  scope: string;
  typeLabel: string;
  dateLabel: string;
  reason: string;
}

interface ServicePreview {
  id: number | string;
  name: string;
  scope: string;
  status: string;
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

  readonly stats: DashboardStat[] = [
    {
      label: 'Organizations',
      value: 0,
      icon: '◉',
      route: '/organizations',
      color: 'indigo',
    },
    {
      label: 'Facilities',
      value: 0,
      icon: '◈',
      route: '/facilities',
      color: 'sky',
    },
    {
      label: 'Departments',
      value: 0,
      icon: '◆',
      route: '/departments',
      color: 'emerald',
    },
    {
      label: 'Facility Services',
      value: 0,
      icon: '◇',
      route: '/facility-services',
      color: 'amber',
    },
  ];

  facility: FacilityPreview[] = [];
  facilityLoading = true;

  department: DepartmentPreview[] = [];
  departmentLoading = true;

  team: TeamMemberPreview[] = [];
  teamLoading = true;

  schedule: SchedulePreview[] = [];
  scheduleLoading = true;

  closures: ClosurePreview[] = [];
  closuresLoading = true;

  services: ServicePreview[] = [];
  servicesLoading = true;

  constructor(
    private readonly api: ApiService,
    private readonly appointmentApi: AppointmentApiService,
    private readonly userApi: UserService,
    public readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.loadDashboardStats();
    this.loadFacilities();
    this.loadDepartments();
    this.loadTeam();
    this.loadFacilityServicesAndSchedule();
    this.loadFacilitiesAndClosures();
  }

  initialsFor(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  private loadFacilities(): void {
    this.facilityLoading = true;
    this.api
      .get<any>("/facilities", {page: 1, limit: 5, search: '', status: '', 
      })
      .pipe(
        map((response: any) => {
          const rows = this.extractFacilityRows(response);
          return rows.map((facility: any): FacilityPreview => {
            const name =
              facility.facilityName ||
              'Unknown facility';
            return {
              facilityId: facility.facilityId ?? facility.userUuid ?? name,
              facilityName: facility.facilityName,
              facilityType: facility.facilityType || '',
              cityName: facility.cityName + ", "+ facility.stateName || '—',
              status: facility.status || '—',
            };
          });
        }),
        catchError(() => of([])),
        finalize(() => (this.facilityLoading = false)),
      )
      .subscribe((facility) => (this.facility = facility));
  }

  private loadDepartments(): void {
    this.departmentLoading = true;
    this.api
      .get<any>("/departments", {page: 1, limit: 5, search: '', status: '', 
      })
      .pipe(
        map((response: any) => {
          const rows = this.extractFacilityRows(response);
          return rows.map((department: any): DepartmentPreview => {
            const name =
              department.departmentName ||
              'Unknown department';
            return {
              departmentId: department.departmentId ?? department.departmentUuid ?? name,
              departmentName: department.departmentName,
              departmentType: department.departmentType || '',
              facilityName: department.facilityName || '',
              status: department.status || '—',
            };
          });
        }),
        catchError(() => of([])),
        finalize(() => (this.departmentLoading = false)),
      )
      .subscribe((department) => (this.department = department));
  }

  private loadTeam(): void {
    this.teamLoading = true;
    this.userApi
      .getUsers({ page: 1, limit: 5, search: '', status: '' })
      .pipe(
        map((response: any) => {
          const rows = this.extractUserRows(response);
          return rows.map((user: any): TeamMemberPreview => {
            const name =
              user.displayName ||
              `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
              user.username ||
              'Unknown user';
            return {
              id: user.userId ?? user.userUuid ?? name,
              name,
              secondary: user.username || user.email || '',
              userType: user.userType || '—',
              status: user.status || '—',
            };
          });
        }),
        catchError(() => of([])),
        finalize(() => (this.teamLoading = false)),
      )
      .subscribe((team) => (this.team = team));
  }

  private loadFacilityServicesAndSchedule(): void {
    this.servicesLoading = true;
    this.scheduleLoading = true;

    this.api
      .get<any>('/facility-services/list')
      .pipe(catchError(() => of({ data: [] })))
      .subscribe((response) => {
        const facilityServices = response?.data || [];
        const nameById = new Map<number, string>(
          facilityServices.map((fs: any) => [fs.facilityServiceId, fs.serviceName]),
        );

        this.services = facilityServices.slice(0, 5).map((fs: any): ServicePreview => ({
          id: fs.facilityServiceId,
          name: fs.serviceName || `Facility service #${fs.facilityServiceId}`,
          scope: fs.facilityName || fs.categoryName || '—',
          status: fs.status || '—',
        }));
        this.servicesLoading = false;

        this.appointmentApi
          .get<any>('/slot-configs', { page: 1, limit: 5, status: 'ACTIVE' })
          .pipe(
            map((response: any) => {
              const rows = response?.data || [];
              return rows.map((row: any): SchedulePreview => ({
                id: row.slotConfigId,
                serviceName: nameById.get(row.facilityServiceId) || `Facility service #${row.facilityServiceId}`,
                recurrenceLabel: this.recurrenceLabel(row),
                timeRange: `${row.startTime?.slice(0, 5) || ''}–${row.endTime?.slice(0, 5) || ''}`,
                capacity: row.capacityPerSlot,
                status: row.status || '—',
              }));
            }),
            catchError(() => of([])),
            finalize(() => (this.scheduleLoading = false)),
          )
          .subscribe((schedule) => (this.schedule = schedule));
      });
  }

  private loadFacilitiesAndClosures(): void {
    this.closuresLoading = true;

    this.api
      .get<any>('/facilities/list')
      .pipe(catchError(() => of({ data: [] })))
      .subscribe((response) => {
        const facilities = response?.data || [];
        const nameById = new Map<number, string>(
          facilities.map((f: any) => [f.facilityId, f.facilityName]),
        );

        this.appointmentApi
          .get<any>('/facility-closures', { page: 1, limit: 5, status: 'ACTIVE' })
          .pipe(
            map((response: any) => {
              const rows = response?.data || [];
              return rows.map((row: any): ClosurePreview => ({
                id: row.closureId,
                scope: row.facilityId ? nameById.get(row.facilityId) || `Facility #${row.facilityId}` : 'All facilities',
                typeLabel: CLOSURE_TYPE_LABELS[row.closureType] || row.closureType || '—',
                dateLabel: row.closureDate
                  ? row.closureDate
                  : row.dayOfWeek
                    ? this.dayLabel(row.dayOfWeek)
                    : 'Recurring',
                reason: row.reason || '—',
              }));
            }),
            catchError(() => of([])),
            finalize(() => (this.closuresLoading = false)),
          )
          .subscribe((closures) => (this.closures = closures));
      });
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

  // Same extraction logic as users.component.ts — the list endpoint's
  // envelope shape varies (data as array vs. data.items vs. top-level items/rows).
  private extractFacilityRows(response: any): any[] {
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

  get organizationCount(): number {
    return this.getStatValue('Organizations');
  }

  get facilityCount(): number {
    return this.getStatValue('Facilities');
  }

  get departmentCount(): number {
    return this.getStatValue('Departments');
  }

  get serviceCount(): number {
    return this.getStatValue('Facility Services');
  }

  get hasNoOrganizations(): boolean {
    return !this.loading && this.organizationCount === 0;
  }

  private loadDashboardStats(): void {
    this.loading = true;

    forkJoin({
      organizations: this.getCount('/organizations/list'),
      facilities: this.getCount('/facilities/list'),
      departments: this.getCount('/departments/list'),
      services: this.getCount('/facility-services/list'),
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe((counts) => {
        this.updateStat('Organizations', counts.organizations);
        this.updateStat('Facilities', counts.facilities);
        this.updateStat('Departments', counts.departments);
        this.updateStat('Facility Services', counts.services);
      });
  }

  private getCount(endpoint: string): Observable<number> {
    return this.api.get<CountResponse>(endpoint).pipe(
      map((response) => this.extractCount(response)),
      catchError(() => of(0)),
    );
  }

  private extractCount(response: CountResponse | null | undefined): number {
    const count =
      response?.count ??
      response?.total ??
      response?.data?.count ??
      response?.data?.total ??
      0;

    const numericCount = Number(count);

    return Number.isFinite(numericCount) && numericCount >= 0
      ? numericCount
      : 0;
  }

  private updateStat(label: string, value: number): void {
    const stat = this.stats.find((item) => item.label === label);

    if (stat) {
      stat.value = value;
    }
  }

  private getStatValue(label: string): number {
    return this.stats.find((item) => item.label === label)?.value ?? 0;
  }
}
