import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, GridApi, GridReadyEvent, ICellRendererParams, ModuleRegistry, AllCommunityModule } from 'ag-grid-community';

import { AuthService } from '../../core/auth.service';
import { OrgDirectoryService } from '../../core/org-directory.service';
import { PatientApiService } from '../../core/patient-api.service';
import { PATIENT_PERMISSIONS } from '../../core/patient-permissions';
import { UiService } from '../../core/ui.service';
import { PageComponent } from '../../shared/page.component';
import { ConfirmModalComponent } from '../../shared/components/confirm-modal/confirm-modal';
import { NotificationModalComponent } from '../../shared/components/notification-modal/notification-modal';
import { STATUSES } from './patient-model';

ModuleRegistry.registerModules([AllCommunityModule]);

@Component({
  selector: 'app-patients',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageComponent, AgGridAngular, ConfirmModalComponent, NotificationModalComponent],
  templateUrl: './patients.component.html',
  styleUrls: ['./patients.component.scss'],
})
export class PatientsComponent implements OnInit {
  readonly statuses = STATUSES;

  rows: any[] = [];
  facilities: any[] = [];
  private facilityNames = new Map<number, string>();

  search = '';
  status = '';
  facilityId: number | '' = '';

  page = 1;
  limit = 20;
  totalItems = 0;
  totalPages = 1;
  loading = false;

  // retention settings (admins only)
  settingsOpen = false;
  retentionMonths = 6;
  settingsSaving = false;

  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;
  @ViewChild('notificationModal') notificationModal!: NotificationModalComponent;
  private pendingDelete: any = null;
  private gridApi!: GridApi;

  constructor(
    private api: PatientApiService,
    private directory: OrgDirectoryService,
    private auth: AuthService,
    private router: Router,
    private ui: UiService,
  ) {}

  get canCreate(): boolean { return this.auth.hasPermission(PATIENT_PERMISSIONS.CREATE); }
  get canUpdate(): boolean { return this.auth.hasPermission(PATIENT_PERMISSIONS.UPDATE); }
  get canConfigure(): boolean { return this.auth.hasPermission(PATIENT_PERMISSIONS.SETTINGS); }

  columnDefs: ColDef[] = [
    {
      headerName: 'Patient',
      field: 'displayName',
      flex: 1.8,
      minWidth: 240,
      cellRenderer: (p: ICellRendererParams) => {
        const d = p.data;
        const sub = [d?.patientNumber, d?.username].filter(Boolean).join(' · ');
        const minor = d?.isMinor ? '<span class="ag-chip ag-chip--minor">Minor</span>' : '';
        return `<div class="ag-patient-cell"><strong>${this.esc(d?.displayName)} ${minor}</strong><small>${this.esc(sub)}</small></div>`;
      },
    },
    {
      headerName: 'Age / Gender',
      flex: 0.8,
      minWidth: 120,
      sortable: false,
      valueGetter: (p) => {
        const d = p.data;
        const age = d?.age === null || d?.age === undefined ? '' : `${d.age}${d.ageIsEstimated ? '~' : ''} yrs`;
        const gender = d?.gender ? String(d.gender).charAt(0) + String(d.gender).slice(1).toLowerCase() : '';
        return [age, gender].filter(Boolean).join(' · ') || '—';
      },
    },
    {
      headerName: 'Phone',
      field: 'phoneMasked',
      flex: 0.9,
      minWidth: 130,
      valueFormatter: (p) => (p.value ? `${p.data?.phoneCountryCode || ''} ${p.value}`.trim() : '—'),
    },
    {
      headerName: 'Registered at',
      field: 'registrationFacilityId',
      flex: 1,
      minWidth: 150,
      valueFormatter: (p) => this.facilityNames.get(p.value) || (p.value ? `Facility #${p.value}` : '—'),
    },
    {
      headerName: 'Status',
      field: 'status',
      flex: 0.7,
      minWidth: 110,
      cellRenderer: (p: ICellRendererParams) => {
        const cls = { ACTIVE: 'good', INACTIVE: 'warning', DELETED: 'danger', MERGED: 'warning', ANONYMIZED: 'danger' }[p.value as string] || '';
        return `<span class="ag-status-badge ${cls}">${this.esc(p.value || '—')}</span>`;
      },
    },
    {
      headerName: 'Actions',
      flex: 1,
      minWidth: 180,
      sortable: false,
      cellRenderer: (p: ICellRendererParams) => {
        const d = p.data;
        if (!d?.patientId) return '';
        const editable = this.canUpdate && !['DELETED', 'MERGED', 'ANONYMIZED'].includes(d.status);
        const buttons = editable
          ? `<button type="button" class="ag-action-btn edit" data-action="edit">Edit</button>
             <button type="button" class="ag-action-btn delete" data-action="delete">Delete</button>`
          : '';
        return `<div class="ag-table-actions"><button type="button" class="ag-action-btn view" data-action="view">View</button>${buttons}</div>`;
      },
      onCellClicked: (p) => {
        const action = (p.event?.target as HTMLElement)?.getAttribute('data-action');
        if (!action || !p.data) return;
        if (action === 'view') this.router.navigate(['/patients', p.data.patientId]);
        if (action === 'edit') this.router.navigate(['/patients', p.data.patientId, 'edit']);
        if (action === 'delete') this.askDelete(p.data);
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
    this.load();
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.gridApi.sizeColumnsToFit();
  }

  load(page: number = this.page): void {
    this.loading = true;
    this.page = page;
    // A POST body, so what staff type in the search box never ends up in a URL.
    this.api
      .post<any>('/patients/search', {
        q: this.search.trim(),
        status: this.status,
        ...(this.facilityId ? { facilityId: this.facilityId } : {}),
        page: this.page,
        limit: this.limit,
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
          this.notificationModal.open({ type: 'ERROR', title: 'Failed to load patients', message: error, contentType: 'TEXT', autoCloseAfter: 4000 });
        },
      });
  }

  clearFilters(): void {
    this.search = this.status = '';
    this.facilityId = '';
    this.load(1);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.page || this.loading) return;
    this.load(page);
  }
  get hasPreviousPage(): boolean { return this.page > 1; }
  get hasNextPage(): boolean { return this.page < this.totalPages; }
  get rangeStart(): number { return this.totalItems === 0 ? 0 : (this.page - 1) * this.limit + 1; }
  get rangeEnd(): number { return Math.min(this.page * this.limit, this.totalItems); }

  askDelete(patient: any): void {
    this.pendingDelete = patient;
    this.confirmModal.open({
      title: 'Delete patient',
      message: `Delete "${patient.displayName}"?\n\nThe record is hidden from lists and kept for the retention period, then its personal details are anonymized.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
  }

  onDeleteConfirmed(): void {
    const patient = this.pendingDelete;
    this.pendingDelete = null;
    if (!patient) return;
    this.api.patch<any>(`/patients/${patient.patientId}/status`, { status: 'DELETED' }).subscribe({
      next: () => {
        this.ui.show('Patient deleted');
        this.load();
      },
      error: (error) => this.notificationModal.open({ type: 'ERROR', title: 'Failed to delete patient', message: error, contentType: 'TEXT', autoCloseAfter: 4000 }),
    });
  }

  onDeleteCancelled(): void { this.pendingDelete = null; }

  // ---- retention settings ------------------------------------------------------
  openSettings(): void {
    this.api.get<any>('/settings').subscribe({
      next: (s) => {
        this.retentionMonths = s?.retentionMonths ?? 6;
        this.settingsOpen = true;
      },
      error: (error) => this.notificationModal.open({ type: 'ERROR', title: 'Failed to load settings', message: error, contentType: 'TEXT', autoCloseAfter: 4000 }),
    });
  }

  saveSettings(): void {
    this.settingsSaving = true;
    this.api.put<any>('/settings', { retentionMonths: Number(this.retentionMonths) }).subscribe({
      next: () => {
        this.settingsSaving = false;
        this.settingsOpen = false;
        this.ui.show('Retention period saved');
      },
      error: (error) => {
        this.settingsSaving = false;
        this.notificationModal.open({ type: 'ERROR', title: 'Failed to save settings', message: error, contentType: 'TEXT', autoCloseAfter: 4000 });
      },
    });
  }

  private esc(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
}
