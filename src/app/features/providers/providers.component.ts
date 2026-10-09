import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, GridApi, GridReadyEvent, ICellRendererParams, ModuleRegistry, AllCommunityModule } from 'ag-grid-community';

import { AuthService } from '../../core/auth.service';
import { OrgDirectoryService } from '../../core/org-directory.service';
import { ProviderApiService } from '../../core/provider-api.service';
import { PROVIDER_PERMISSIONS } from '../../core/provider-permissions';
import { PageComponent } from '../../shared/page.component';
import { ConfirmModalComponent } from '../../shared/components/confirm-modal/confirm-modal';
import { NotificationModalComponent } from '../../shared/components/notification-modal/notification-modal';
import { AVAILABILITY_TYPES, PROVIDER_TYPES, STATUSES, VERIFICATION_STATUSES, labelOf } from './provider-model';

ModuleRegistry.registerModules([AllCommunityModule]);

@Component({
  selector: 'app-providers',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageComponent, AgGridAngular, ConfirmModalComponent, NotificationModalComponent],
  templateUrl: './providers.component.html',
  styleUrls: ['./providers.component.scss'],
})
export class ProvidersComponent implements OnInit {
  readonly providerTypes = PROVIDER_TYPES;
  readonly availabilityTypes = AVAILABILITY_TYPES;
  readonly statuses = STATUSES;
  readonly verificationStatuses = VERIFICATION_STATUSES;

  rows: any[] = [];
  organizations: any[] = [];
  private allFacilities: any[] = [];

  search = '';
  providerType = '';
  status = '';
  verificationStatus = '';
  availabilityType = '';
  organizationId: number | '' = '';
  facilityId: number | '' = '';

  page = 1;
  limit = 20;
  totalItems = 0;
  totalPages = 1;
  loading = false;

  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;
  @ViewChild('notificationModal') notificationModal!: NotificationModalComponent;
  private pendingDelete: any = null;
  private gridApi!: GridApi;

  constructor(
    private api: ProviderApiService,
    private directory: OrgDirectoryService,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  get canCreate(): boolean { return this.auth.hasPermission(PROVIDER_PERMISSIONS.CREATE); }
  get canUpdate(): boolean { return this.auth.hasPermission(PROVIDER_PERMISSIONS.UPDATE); }

  get facilities(): any[] {
    return this.allFacilities.filter((f) => !this.organizationId || Number(f.organizationId) === Number(this.organizationId));
  }

  columnDefs: ColDef[] = [
    {
      headerName: 'Doctor',
      field: 'displayName',
      flex: 1.7,
      minWidth: 240,
      cellRenderer: (p: ICellRendererParams) => {
        const d = p.data;
        const sub = [d?.providerCode, d?.registrationNumber].filter(Boolean).join(' · ');
        return `<div class="ag-provider-cell"><strong>${this.esc(d?.displayName)}</strong><small>${this.esc(sub)}</small></div>`;
      },
    },
    {
      headerName: 'Specialty',
      field: 'primarySpecialty',
      flex: 1.1,
      minWidth: 150,
      valueFormatter: (p) => p.value || '—',
    },
    {
      headerName: 'Type',
      field: 'providerType',
      flex: 0.9,
      minWidth: 130,
      valueFormatter: (p) => labelOf(PROVIDER_TYPES, p.value),
    },
    {
      headerName: 'Experience',
      field: 'experienceYears',
      flex: 0.6,
      minWidth: 110,
      valueFormatter: (p) => (p.value === null || p.value === undefined ? '—' : `${p.value} yr`),
    },
    {
      headerName: 'Practises at',
      sortable: false,
      filter: false,
      flex: 1.5,
      minWidth: 220,
      cellRenderer: (p: ICellRendererParams) => {
        const d = p.data;
        if (!d?.affiliationCount) return '<span class="ag-muted">Not affiliated yet</span>';
        const chips = (d.availabilityTypes || [])
          .map((t: string) => `<span class="ag-chip ag-chip--${t.toLowerCase()}">${this.esc(labelOf(AVAILABILITY_TYPES, t))}</span>`)
          .join('');
        const where = `${d.organizationCount} org${d.organizationCount === 1 ? '' : 's'} · ${d.facilityCount} facilit${d.facilityCount === 1 ? 'y' : 'ies'}`;
        return `<div class="ag-provider-cell"><div class="ag-chips">${chips}</div><small>${where}</small></div>`;
      },
    },
    {
      headerName: 'Verification',
      field: 'verificationStatus',
      flex: 0.8,
      minWidth: 130,
      cellRenderer: (p: ICellRendererParams) => this.badge(p.value, { VERIFIED: 'good', REJECTED: 'danger', PENDING: 'warning' }),
    },
    {
      headerName: 'Status',
      field: 'status',
      flex: 0.7,
      minWidth: 120,
      cellRenderer: (p: ICellRendererParams) => this.badge(p.value, { ACTIVE: 'good', SUSPENDED: 'warning', INACTIVE: 'danger', DELETED: 'danger' }),
    },
    {
      headerName: 'Actions',
      flex: 1,
      minWidth: 190,
      sortable: false,
      filter: false,
      cellRenderer: (p: ICellRendererParams) => {
        const d = p.data;
        if (!d?.providerId) return '';
        const edit = this.canUpdate && d.status !== 'DELETED'
          ? `<button type="button" class="ag-action-btn edit" data-action="edit">Edit</button>
             <button type="button" class="ag-action-btn delete" data-action="delete">Delete</button>`
          : '';
        return `<div class="ag-table-actions"><button type="button" class="ag-action-btn view" data-action="view">View</button>${edit}</div>`;
      },
      onCellClicked: (p) => {
        const action = (p.event?.target as HTMLElement)?.getAttribute('data-action');
        if (!action || !p.data) return;
        if (action === 'view') this.router.navigate(['/providers', p.data.providerId]);
        if (action === 'edit') this.router.navigate(['/providers', p.data.providerId, 'edit']);
        if (action === 'delete') this.askDelete(p.data);
      },
    },
  ];

  defaultColDef: ColDef = { resizable: true, sortable: true, filter: false };
  gridOptions = { rowHeight: 64, headerHeight: 44, suppressCellFocus: true, animateRows: true };

  ngOnInit(): void {
    // Dashboard tiles link here with a ready-made filter, e.g. /providers?availabilityType=REMOTE.
    const query = this.route.snapshot.queryParamMap;
    const availability = query.get('availabilityType');
    if (availability && AVAILABILITY_TYPES.some((t) => t.value === availability)) this.availabilityType = availability;
    const verification = query.get('verificationStatus');
    if (verification && VERIFICATION_STATUSES.includes(verification)) this.verificationStatus = verification;

    this.directory.organizations().subscribe((rows) => (this.organizations = rows));
    this.directory.facilities().subscribe((rows) => (this.allFacilities = rows));
    this.load();
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.gridApi.sizeColumnsToFit();
  }

  onOrganizationChange(): void {
    this.facilityId = '';
    this.load(1);
  }

  load(page: number = this.page): void {
    this.loading = true;
    this.page = page;
    this.api
      .get<any>('/providers', {
        page: this.page,
        limit: this.limit,
        search: this.search.trim(),
        providerType: this.providerType,
        status: this.status,
        verificationStatus: this.verificationStatus,
        availabilityType: this.availabilityType,
        organizationId: this.organizationId,
        facilityId: this.facilityId,
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
          this.notificationModal.open({ type: 'ERROR', title: 'Failed to load doctors', message: error, contentType: 'TEXT', autoCloseAfter: 4000 });
        },
      });
  }

  clearFilters(): void {
    this.search = this.providerType = this.status = this.verificationStatus = this.availabilityType = '';
    this.organizationId = this.facilityId = '';
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

  askDelete(provider: any): void {
    this.pendingDelete = provider;
    this.confirmModal.open({
      title: 'Delete doctor',
      message: `Delete "${provider.displayName}"?\n\nThe doctor is marked DELETED and hidden from lists; their affiliations are kept for the audit trail.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
  }

  onDeleteConfirmed(): void {
    const provider = this.pendingDelete;
    this.pendingDelete = null;
    if (!provider) return;
    this.api.patch<any>(`/providers/${provider.providerId}/status`, { status: 'DELETED' }).subscribe({
      next: () => {
        this.notificationModal.open({ type: 'SUCCESS', title: 'Doctor deleted', message: 'Doctor deleted successfully', contentType: 'TEXT', autoCloseAfter: 2500 });
        this.load();
      },
      error: (error) =>
        this.notificationModal.open({ type: 'ERROR', title: 'Failed to delete doctor', message: error, contentType: 'TEXT', autoCloseAfter: 4000 }),
    });
  }

  onDeleteCancelled(): void { this.pendingDelete = null; }

  private badge(value: string | null | undefined, classes: Record<string, string>): string {
    const text = value || '—';
    return `<span class="ag-status-badge ${classes[text] || ''}">${this.esc(text)}</span>`;
  }

  private esc(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
}
