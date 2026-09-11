import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';

import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { PageComponent } from '../../shared/page.component';

interface CountResponse {
  count?: number;
  total?: number;
  data?: {
    count?: number;
    total?: number;
  };
}

interface DashboardStat {
  label: string;
  value: number;
  icon: string;
  route: string;
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
    },
    {
      label: 'Facilities',
      value: 0,
      icon: '◈',
      route: '/facilities',
    },
    {
      label: 'Departments',
      value: 0,
      icon: '◆',
      route: '/departments',
    },
    {
      label: 'Facility Services',
      value: 0,
      icon: '◇',
      route: '/facility-services',
    },
  ];

  constructor(
    private readonly api: ApiService,
    public readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.loadDashboardStats();
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
