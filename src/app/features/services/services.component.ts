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

@Component({
  selector: "app-services",
  standalone: true,
  imports: [CommonModule, FormsModule, PageComponent, AgGridAngular, ConfirmModalComponent, NotificationModalComponent],
  templateUrl: "./services.component.html",
  styleUrls: ["./services.component.scss"],
})
export class ServicesComponent implements OnInit {
  rows: any[] = [];
  organizationOptions: any[] = [];
  // Filter-bar category options — all categories for the selected
  // organization filter (or every category if no organization is picked).
  filterServiceCategoryOptions: any[] = [];
  // Create/edit form's category options — narrowed to the form's own
  // organizationId, independently of the filter bar above.
  formServiceCategoryOptions: any[] = [];

  search = "";
  status = "";
  organizationId = "";
  serviceCategoryId = "";

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
    serviceId: null as number | null,
    organizationId: null as number | null,
    serviceCategoryId: null as number | null,
    serviceName: "",
    description: "",
  };

  private gridApi!: GridApi;

  // /services doesn't join and return organizationName/serviceCategoryName,
  // only the ids — resolve them client-side from the dropdown data already
  // loaded, rather than showing raw ids in the grid.
  private organizationNameOf(organizationId: any): string {
    const match = this.organizationOptions.find((org) => org.organizationId === organizationId);
    return match?.organizationName || "—";
  }

  private serviceCategoryNameOf(serviceCategoryId: any): string {
    const match = [...this.filterServiceCategoryOptions, ...this.formServiceCategoryOptions].find(
      (cat) => cat.serviceCategoryId === serviceCategoryId,
    );
    return match?.serviceCategoryName || "—";
  }

  columnDefs: ColDef[] = [
    {
      headerName: "Service",
      field: "serviceName",
      flex: 1.6,
      minWidth: 220,
      cellRenderer: (params: ICellRendererParams) => {
        const svc = params.data;
        return `<div class="ag-tenant-cell"><strong>${this.escapeHtml(svc?.serviceName)}</strong><br><small>${this.escapeHtml(svc?.serviceCode)}</small></div>`;
      },
    },
    {
      headerName: "Category",
      field: "serviceCategoryId",
      flex: 1,
      minWidth: 160,
      valueGetter: (params) => this.serviceCategoryNameOf(params.data?.serviceCategoryId),
    },
    {
      headerName: "Organization",
      field: "organizationId",
      flex: 1.2,
      minWidth: 180,
      valueGetter: (params) => this.organizationNameOf(params.data?.organizationId),
    },
    { headerName: "Description", field: "description", flex: 1.2, minWidth: 180, valueFormatter: (p) => p.value || "—" },
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
        const svc = params.data;
        if (!svc?.serviceId) return "";
        if (svc.status === "DELETED") {
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
    this.loadOrganizationOptions();
    this.loadFilterServiceCategoryOptions();
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.gridApi.sizeColumnsToFit();
  }

  load(page: number = this.page): void {
    this.loading = true;
    this.page = page;

    this.api
      .get<any>("/services", {
        page: this.page,
        limit: this.limit,
        search: this.search,
        status: this.status,
        organizationId: this.organizationId,
        serviceCategoryId: this.serviceCategoryId,
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
          this.notificationModal.open({ type: "ERROR", title: "Failed to load services", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
        },
      });
  }

  loadOrganizationOptions(): void {
    this.api.get<any>("/organizations/list").subscribe({
      next: (response) => {
        this.organizationOptions = response?.data || [];
        if (this.gridApi) this.gridApi.refreshCells({ force: true });
      },
      error: () => (this.organizationOptions = []),
    });
  }

  // Filter bar: reload categories whenever the organization filter changes,
  // narrowed to that organization (or all categories if none is selected).
  loadFilterServiceCategoryOptions(): void {
    this.api.get<any>("/service-categories/list", this.organizationId ? { organizationId: this.organizationId } : {}).subscribe({
      next: (response) => {
        this.filterServiceCategoryOptions = response?.data || [];
        if (this.gridApi) this.gridApi.refreshCells({ force: true });
      },
      error: () => (this.filterServiceCategoryOptions = []),
    });
  }

  onOrganizationFilterChange(): void {
    this.serviceCategoryId = "";
    this.loadFilterServiceCategoryOptions();
    this.onFilterChange();
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

  openEdit(svc: any): void {
    if (!svc?.serviceId) return;
    this.editMode = true;
    this.form = {
      serviceId: svc.serviceId,
      organizationId: svc.organizationId ?? null,
      serviceCategoryId: svc.serviceCategoryId ?? null,
      serviceName: svc.serviceName || "",
      description: svc.description || "",
    };
    this.loadFormServiceCategoryOptions();
    this.formOpen = true;
  }

  closeCreate(): void {
    if (this.saving) return;
    this.formOpen = false;
    this.editMode = false;
    this.resetForm();
  }

  // Form's organization picker: reload the form's own category dropdown
  // whenever it changes, and clear any category chosen under the old
  // organization since it may no longer be valid.
  onFormOrganizationChange(): void {
    this.form.serviceCategoryId = null;
    this.loadFormServiceCategoryOptions();
  }

  loadFormServiceCategoryOptions(): void {
    if (!this.form.organizationId) {
      this.formServiceCategoryOptions = [];
      return;
    }
    this.api.get<any>("/service-categories/list", { organizationId: this.form.organizationId }).subscribe({
      next: (response) => (this.formServiceCategoryOptions = response?.data || []),
      error: () => (this.formServiceCategoryOptions = []),
    });
  }

  save(): void {
    if (!this.validateForm()) return;
    this.saving = true;

    const request: any = {
      organizationId: this.form.organizationId,
      serviceCategoryId: this.form.serviceCategoryId,
      serviceName: this.form.serviceName.trim(),
      description: this.form.description.trim() || null,
    };

    if (this.editMode) {
      this.api.put<any>(`/services/${this.form.serviceId}`, request).subscribe({
        next: () => {
          this.saving = false;
          this.formOpen = false;
          this.editMode = false;
          this.resetForm();
          this.notificationModal.open({ type: "SUCCESS", title: "Service updated", message: "Service updated successfully", contentType: "TEXT", autoCloseAfter: 2500 });
          this.load();
        },
        error: (error) => {
          this.saving = false;
          this.notificationModal.open({ type: "ERROR", title: "Failed to update service", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
        },
      });
      return;
    }

    this.api.post<any>("/services", request).subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.resetForm();
        this.notificationModal.open({ type: "SUCCESS", title: "Service created", message: "Service created successfully", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
      },
      error: (error) => {
        this.saving = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to create service", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  deleteRow(svc: any): void {
    if (!svc?.serviceId) return;
    this.pendingDelete = svc;
    this.confirmModal.open({
      title: "Delete service",
      message: `Are you sure you want to delete "${svc.serviceName}"?\n\nThe service will be marked as DELETED and will not be physically removed.`,
      confirmText: "Delete",
      cancelText: "Cancel",
    });
  }

  onDeleteConfirmed(): void {
    const svc = this.pendingDelete;
    this.pendingDelete = null;
    if (!svc?.serviceId) return;

    this.deleting = true;
    this.api.patch<any>(`/services/${svc.serviceId}/status`, { status: "DELETED" }).subscribe({
      next: () => {
        this.deleting = false;
        this.notificationModal.open({ type: "SUCCESS", title: "Service deleted", message: "Service deleted successfully", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
      },
      error: (error) => {
        this.deleting = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to delete service", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  onDeleteCancelled(): void {
    this.pendingDelete = null;
  }

  select(svc: any): void {
    if (!svc?.serviceId) return;
    this.loading = true;
    this.api.get<any>(`/services/${svc.serviceId}`).subscribe({
      next: (response) => {
        this.selected = response;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to load service", message: error, contentType: "TEXT", autoCloseAfter: 3000 });
      },
    });
  }

  closeDetails(): void {
    this.selected = null;
  }

  get selectedOrganizationName(): string {
    return this.organizationNameOf(this.selected?.organizationId);
  }

  get selectedServiceCategoryName(): string {
    return this.serviceCategoryNameOf(this.selected?.serviceCategoryId);
  }

  validateForm(): boolean {
    if (!this.form.organizationId) {
      this.ui.show("Organization is required");
      return false;
    }
    if (!this.form.serviceCategoryId) {
      this.ui.show("Service category is required");
      return false;
    }
    if (!this.form.serviceName.trim()) {
      this.ui.show("Service name is required");
      return false;
    }
    return true;
  }

  resetForm(): void {
    this.form = { serviceId: null, organizationId: null, serviceCategoryId: null, serviceName: "", description: "" };
    this.formServiceCategoryOptions = [];
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
