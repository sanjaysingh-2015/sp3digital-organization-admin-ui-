import { Component, OnInit, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

import { AgGridAngular } from "ag-grid-angular";
import {
  ColDef,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  ModuleRegistry,
  AllCommunityModule,
} from "ag-grid-community";

import { ApiService } from "../../core/api.service";
import { UiService } from "../../core/ui.service";
import { PageComponent } from "../../shared/page.component";
import { ConfirmModalComponent } from "../../shared/components/confirm-modal/confirm-modal";
import { NotificationModalComponent } from "../../shared/components/notification-modal/notification-modal";

ModuleRegistry.registerModules([AllCommunityModule]);

export const ORGANIZATION_TYPES = [
  "STATE_HEALTH_DEPT",
  "DISTRICT_HEALTH_AUTHORITY",
  "HEALTH_NETWORK",
  "GOVERNMENT",
  "NGO",
  "PRIVATE_CHAIN",
  "OTHER",
];

@Component({
  selector: "app-organizations",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageComponent,
    AgGridAngular,
    ConfirmModalComponent,
    NotificationModalComponent,
  ],
  templateUrl: "./organizations.component.html",
  styleUrls: ["./organizations.component.scss"],
})
export class OrganizationsComponent implements OnInit {
  organizationTypes = ORGANIZATION_TYPES;

  // =========================================================
  // DATA
  // =========================================================

  rows: any[] = [];
  parentOptions: any[] = [];

  search = "";
  status = "";
  organizationType = "";

  page = 1;
  limit = 20;
  totalItems = 0;
  totalPages = 1;

  loading = false;
  saving = false;
  deleting = false;

  selected: any = null;

  @ViewChild("confirmModal") confirmModal!: ConfirmModalComponent;
  @ViewChild("notificationModal") notificationModal!: NotificationModalComponent;

  private pendingDelete: any = null;

  formOpen = false;
  editMode = false;

  form = {
    organizationId: null as number | null,
    organizationName: "",
    organizationType: "" as string,
    parentOrganizationId: null as number | null,
  };

  private gridApi!: GridApi;

  columnDefs: ColDef[] = [
    {
      headerName: "Organization",
      field: "organizationName",
      flex: 1.6,
      minWidth: 220,
      cellRenderer: (params: ICellRendererParams) => {
        const org = params.data;
        return `<div class="ag-tenant-cell"><strong>${this.escapeHtml(org?.organizationName)}</strong><br><small>${this.escapeHtml(org?.organizationCode)}</small></div>`;
      },
    },
    { headerName: "Type", field: "organizationType", flex: 1, minWidth: 160 },
    {
      headerName: "Status",
      field: "status",
      flex: 0.8,
      minWidth: 120,
      cellRenderer: (params: ICellRendererParams) => {
        const status = params.value || "—";
        let className = "ag-status-badge";
        if (status === "ACTIVE") className += " good";
        else if (status === "DISABLED") className += " warning";
        else if (status === "INACTIVE" || status === "DELETED") className += " danger";
        return `<span class="${className}">${this.escapeHtml(status)}</span>`;
      },
    },
    {
      headerName: "Actions",
      flex: 1.7,
      minWidth: 250,
      sortable: false,
      filter: false,
      cellRenderer: (params: ICellRendererParams) => {
        const org = params.data;
        if (!org?.organizationId) return "";
        const isDeleted = org.status === "DELETED";
        if (isDeleted) {
          return `<div class="ag-table-actions"><button type="button" class="ag-action-btn view" data-action="view">View</button></div>`;
        }
        return `
          <div class="ag-table-actions">
            <button type="button" class="ag-action-btn view" data-action="view">View</button>
            <button type="button" class="ag-action-btn edit" data-action="edit">Edit</button>
            <button type="button" class="ag-action-btn delete" data-action="delete">Delete</button>
          </div>`;
      },
      onCellClicked: (params) => {
        const action = (params.event?.target as HTMLElement)?.getAttribute("data-action");
        if (!action) return;
        if (action === "view") this.select(params.data);
        if (action === "edit") this.openEdit(params.data);
        if (action === "delete") this.deleteRow(params.data);
      },
    },
  ];

  defaultColDef: ColDef = { resizable: true, sortable: true, filter: true };
  gridOptions = { rowHeight: 64, headerHeight: 44, suppressCellFocus: true, animateRows: true };

  constructor(private api: ApiService, private ui: UiService) {}

  ngOnInit(): void {
    this.load();
    this.loadParentOptions();
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.gridApi.sizeColumnsToFit();
  }

  load(page: number = this.page): void {
    this.loading = true;
    this.page = page;

    this.api
      .get<any>("/organizations", {
        page: this.page,
        limit: this.limit,
        search: this.search,
        status: this.status,
        organizationType: this.organizationType,
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
            this.gridApi.setGridOption("rowData", this.rows);
            setTimeout(() => this.gridApi.sizeColumnsToFit());
          }
        },
        error: (error) => {
          this.loading = false;
          this.notificationModal.open({
            type: "ERROR",
            title: "Failed to load organizations",
            message: error,
            contentType: "TEXT",
            autoCloseAfter: 4000,
          });
        },
      });
  }

  loadParentOptions(): void {
    this.api.get<any>("/organizations/list").subscribe({
      next: (response) => (this.parentOptions = response?.data || []),
      error: () => (this.parentOptions = []),
    });
  }

  onFilterChange(): void {
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

  openCreate(): void {
    this.editMode = false;
    this.resetForm();
    this.formOpen = true;
  }

  openEdit(org: any): void {
    if (!org?.organizationId) {
      this.notificationModal.open({ type: "WARNING", title: "Edit organization", message: "Invalid organization id", contentType: "TEXT", autoCloseAfter: 3000 });
      return;
    }
    this.editMode = true;
    this.form = {
      organizationId: org.organizationId,
      organizationName: org.organizationName || "",
      organizationType: org.organizationType || "",
      parentOrganizationId: org.parentOrganizationId ?? null,
    };
    this.formOpen = true;
  }

  closeCreate(): void {
    if (this.saving) return;
    this.formOpen = false;
    this.editMode = false;
    this.resetForm();
  }

  save(): void {
    if (!this.validateForm()) return;
    this.saving = true;

    const request: any = {
      organizationName: this.form.organizationName.trim(),
      organizationType: this.form.organizationType || null,
      parentOrganizationId: this.form.parentOrganizationId || null,
    };

    if (this.editMode) {
      this.api.put<any>(`/organizations/${this.form.organizationId}`, request).subscribe({
        next: () => {
          this.saving = false;
          this.formOpen = false;
          this.editMode = false;
          this.resetForm();
          this.notificationModal.open({ type: "SUCCESS", title: "Organization updated", message: "Organization updated successfully", contentType: "TEXT", autoCloseAfter: 2500 });
          this.load();
          this.loadParentOptions();
        },
        error: (error) => {
          this.saving = false;
          this.notificationModal.open({ type: "ERROR", title: "Failed to update organization", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
        },
      });
      return;
    }

    this.api.post<any>("/organizations", request).subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.resetForm();
        this.notificationModal.open({ type: "SUCCESS", title: "Organization created", message: "Organization created successfully", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
        this.loadParentOptions();
      },
      error: (error) => {
        this.saving = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to create organization", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  deleteRow(org: any): void {
    if (!org?.organizationId) return;
    this.pendingDelete = org;
    this.confirmModal.open({
      title: "Delete organization",
      message: `Are you sure you want to delete "${org.organizationName}"?\n\nThe organization will be marked as DELETED and will not be physically removed.`,
      confirmText: "Delete",
      cancelText: "Cancel",
    });
  }

  onDeleteConfirmed(): void {
    const org = this.pendingDelete;
    this.pendingDelete = null;
    if (!org?.organizationId) return;

    this.deleting = true;
    this.api.patch<any>(`/organizations/${org.organizationId}/status`, { status: "DELETED" }).subscribe({
      next: () => {
        this.deleting = false;
        this.notificationModal.open({ type: "SUCCESS", title: "Organization deleted", message: "Organization deleted successfully", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
        this.loadParentOptions();
      },
      error: (error) => {
        this.deleting = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to delete organization", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  onDeleteCancelled(): void {
    this.pendingDelete = null;
  }

  select(org: any): void {
    if (!org?.organizationId) return;
    this.loading = true;
    this.api.get<any>(`/organizations/${org.organizationId}`).subscribe({
      next: (response) => {
        this.selected = response;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to load organization", message: error, contentType: "TEXT", autoCloseAfter: 3000 });
      },
    });
  }

  closeDetails(): void {
    this.selected = null;
  }

  validateForm(): boolean {
    if (!this.form.organizationName.trim()) {
      this.ui.show("Organization name is required");
      return false;
    }
    if (this.editMode && this.form.parentOrganizationId === this.form.organizationId) {
      this.ui.show("An organization cannot be its own parent");
      return false;
    }
    return true;
  }

  resetForm(): void {
    this.form = { organizationId: null, organizationName: "", organizationType: "", parentOrganizationId: null };
  }

  private escapeHtml(value: any): string {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
