import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, GridApi, GridReadyEvent, ICellRendererParams, ModuleRegistry, AllCommunityModule } from 'ag-grid-community';

import { ApiService } from '../../core/api.service';
import { AppointmentApiService } from '../../core/appointment-api.service';
import { APPOINTMENT_PERMISSIONS } from '../../core/appointment-permissions';
import { AuthService } from '../../core/auth.service';
import { OrgDirectoryService } from '../../core/org-directory.service';
import { UiService } from '../../core/ui.service';
import { PageComponent } from '../../shared/page.component';
import { NotificationModalComponent } from '../../shared/components/notification-modal/notification-modal';
import { STATUSES, STATUS_CLASS, addDays, fmtDate, hhmm, maskPhone, todayLocal } from './appointment-model';

ModuleRegistry.registerModules([AllCommunityModule]);

@Component({
  selector: 'app-appointments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageComponent, AgGridAngular, NotificationModalComponent],
  templateUrl: './appointments.component.html',
  styleUrls: ['./appointments.component.scss'],
})
export class AppointmentsComponent implements OnInit {
  readonly statuses = STATUSES;

  rows: any[] = [];
  facilities: any[] = [];
  private facilityNames = new Map<number, string>();
  private serviceNames = new Map<number, string>();

  search = '';
  status = '';
  facilityId: number | '' = '';
  dateFrom = todayLocal();
  dateTo = addDays(todayLocal(), 6);

  page = 1;
  limit = 20;
  totalItems = 0;
  totalPages = 1;
  loading = false;

  // cancel dialog
  cancelTarget: any | null = null;
  reasons: any[] = [];
  reasonId: number | null = null;
  cancelNotes = '';
  cancelling = false;

  @ViewChild('notificationModal') notificationModal!: NotificationModalComponent;
  private gridApi!: GridApi;

  constructor(
    private api: AppointmentApiService,
    private orgApi: ApiService,
    private directory: OrgDirectoryService,
    private auth: AuthService,
    private router: Router,
    private ui: UiService,
  ) {}

  get canBook(): boolean { return this.auth.hasPermission(APPOINTMENT_PERMISSIONS.CREATE); }
  get canChange(): boolean { return this.auth.hasPermission(APPOINTMENT_PERMISSIONS.UPDATE); }

  /** Still in the future, so it can be cancelled or moved. (The service checks again.) */
  private upcoming(a: any): boolean {
    if (!['BOOKED', 'CONFIRMED'].includes(a?.status)) return false;
    const day = String(a.appointmentDate).slice(0, 10);
    const today = todayLocal();
    if (day !== today) return day > today;
    const now = new Date();
    const hhmmNow = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return hhmm(a.startTime) > hhmmNow;
  }

  columnDefs: ColDef[] = [
    {
      headerName: 'When',
      flex: 1.1,
      minWidth: 170,
      valueGetter: (p) => `${p.data?.appointmentDate}${p.data?.startTime}`,
      cellRenderer: (p: ICellRendererParams) => {
        const d = p.data;
        return `<div class="ag-appt-cell"><strong>${this.esc(fmtDate(d?.appointmentDate))}</strong><small>${this.esc(hhmm(d?.startTime))}–${this.esc(hhmm(d?.endTime))}</small></div>`;
      },
    },
    {
      headerName: 'Token',
      field: 'tokenNumber',
      flex: 0.5,
      minWidth: 90,
      cellRenderer: (p: ICellRendererParams) => (p.value ? `<span class="ag-chip ag-chip--token">${this.esc(p.value)}</span>` : '—'),
    },
    {
      headerName: 'Patient',
      flex: 1.3,
      minWidth: 190,
      cellRenderer: (p: ICellRendererParams) => {
        const d = p.data;
        return `<div class="ag-appt-cell"><strong>${this.esc(d?.patientName)}</strong><small>${this.esc(maskPhone(d?.patientPhone))}</small></div>`;
      },
    },
    {
      headerName: 'Service / Doctor',
      flex: 1.3,
      minWidth: 190,
      cellRenderer: (p: ICellRendererParams) => {
        const d = p.data;
        const service = this.serviceNames.get(d?.facilityServiceId) || `Service #${d?.facilityServiceId}`;
        return `<div class="ag-appt-cell"><strong>${this.esc(service)}</strong><small>${this.esc(d?.resourceName || 'No specific doctor')}</small></div>`;
      },
    },
    {
      headerName: 'Facility',
      field: 'facilityId',
      flex: 0.9,
      minWidth: 140,
      valueFormatter: (p) => this.facilityNames.get(p.value) || `Facility #${p.value}`,
    },
    {
      headerName: 'Status',
      field: 'status',
      flex: 0.7,
      minWidth: 120,
      cellRenderer: (p: ICellRendererParams) => `<span class="ag-status-badge ${STATUS_CLASS[p.value as string] ?? ''}">${this.esc(String(p.value || '').replace('_', ' '))}</span>`,
    },
    {
      headerName: 'Actions',
      flex: 0.9,
      minWidth: 170,
      sortable: false,
      cellRenderer: (p: ICellRendererParams) => {
        const d = p.data;
        if (!d || !this.canChange || !this.upcoming(d)) return '';
        return `<div class="ag-table-actions">
          <button type="button" class="ag-action-btn edit" data-action="reschedule">Reschedule</button>
          <button type="button" class="ag-action-btn delete" data-action="cancel">Cancel</button>
        </div>`;
      },
      onCellClicked: (p) => {
        const action = (p.event?.target as HTMLElement)?.getAttribute('data-action');
        if (!action || !p.data) return;
        if (action === 'reschedule') this.router.navigate(['/appointments/book'], { queryParams: { reschedule: p.data.appointmentId } });
        if (action === 'cancel') this.openCancel(p.data);
      },
    },
  ];

  defaultColDef: ColDef = { resizable: true, sortable: false, filter: false };
  gridOptions = { rowHeight: 64, headerHeight: 44, suppressCellFocus: true, animateRows: true };

  ngOnInit(): void {
    this.directory.facilities().subscribe((rows) => {
      this.facilities = rows;
      rows.forEach((f) => this.facilityNames.set(f.facilityId, f.facilityName));
      this.gridApi?.refreshCells({ force: true });
    });
    this.orgApi.get<any>('/facility-services/list').subscribe({
      next: (r) => {
        (r?.data || []).forEach((s: any) => this.serviceNames.set(s.facilityServiceId, s.serviceName));
        this.gridApi?.refreshCells({ force: true });
      },
      error: () => undefined,
    });
    this.load();
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.gridApi.sizeColumnsToFit();
  }

  load(page: number = this.page): void {
    this.loading = true;
    this.page = page;
    this.api
      .get<any>('/appointments', {
        page: this.page,
        limit: this.limit,
        search: this.search.trim() || undefined,
        status: this.status || undefined,
        facilityId: this.facilityId || undefined,
        dateFrom: this.dateFrom || undefined,
        dateTo: this.dateTo || undefined,
      })
      .subscribe({
        next: (response) => {
          this.rows = response?.data || [];
          const pagination = response?.pagination;
          this.page = pagination?.page ?? this.page;
          this.limit = pagination?.limit ?? this.limit;
          this.totalItems = pagination?.totalItems ?? this.rows.length;
          this.totalPages = pagination?.totalPages ?? 1;
          this.loading = false;
          if (this.gridApi) {
            this.gridApi.setGridOption('rowData', this.rows);
            setTimeout(() => this.gridApi.sizeColumnsToFit());
          }
        },
        error: (error) => {
          this.loading = false;
          this.notificationModal.open({ type: 'ERROR', title: 'Failed to load appointments', message: error, contentType: 'TEXT', autoCloseAfter: 4000 });
        },
      });
  }

  setRange(kind: 'today' | 'week' | 'all'): void {
    const today = todayLocal();
    if (kind === 'today') { this.dateFrom = today; this.dateTo = today; }
    if (kind === 'week') { this.dateFrom = today; this.dateTo = addDays(today, 6); }
    if (kind === 'all') { this.dateFrom = ''; this.dateTo = ''; }
    this.load(1);
  }

  clearFilters(): void {
    this.search = this.status = '';
    this.facilityId = '';
    this.setRange('week');
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.page || this.loading) return;
    this.load(page);
  }
  get hasPreviousPage(): boolean { return this.page > 1; }
  get hasNextPage(): boolean { return this.page < this.totalPages; }
  get rangeStart(): number { return this.totalItems === 0 ? 0 : (this.page - 1) * this.limit + 1; }
  get rangeEnd(): number { return Math.min(this.page * this.limit, this.totalItems); }

  // ---- cancel ----------------------------------------------------------------------
  openCancel(appointment: any): void {
    this.cancelTarget = appointment;
    this.reasonId = null;
    this.cancelNotes = '';
    this.api.get<any>('/cancellation-reasons').subscribe({
      next: (r) => (this.reasons = r?.data || []),
      error: () => (this.reasons = []),
    });
  }

  confirmCancel(): void {
    if (!this.cancelTarget || !this.reasonId) return;
    this.cancelling = true;
    this.api.patch<any>(`/appointments/${this.cancelTarget.appointmentId}/cancel`, { reasonId: this.reasonId, notes: this.cancelNotes.trim() || null }).subscribe({
      next: () => {
        this.cancelling = false;
        this.cancelTarget = null;
        this.ui.show('Appointment cancelled');
        this.load();
      },
      error: (error) => {
        this.cancelling = false;
        this.notificationModal.open({ type: 'ERROR', title: 'Could not cancel', message: error, contentType: 'TEXT', autoCloseAfter: 5000 });
      },
    });
  }

  private esc(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
}
