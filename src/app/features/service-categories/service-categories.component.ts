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
  selector: "app-service-categories",
  standalone: true,
  imports: [CommonModule, FormsModule, PageComponent, AgGridAngular, ConfirmModalComponent, NotificationModalComponent],
  templateUrl: "./service-categories.component.html",
  styleUrls: ["./service-categories.component.scss"],
})
export class ServiceCategoriesComponent implements OnInit {
  rows: any[] = [];
  organizationOptions: any[] = [];

  search = "";
  status = "";
  organizationId = "";

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
    serviceCategoryId: null as number | null,
    organizationId: null as number | null,
    serviceCategoryName: "",
    description: "",
  };

  private gridApi!: GridApi;

  // /service-categories doesn't join and return organizationName, only
  // organizationId — resolve the name client-side from the same
  // organizationOptions dropdown the create/edit form already loads,
  // rather than showing a raw id in the grid.
  private organizationNameOf(organizationId: any): string {
    const match = this.organizationOptions.find((org) => org.organizationId === organizationId);
    return match?.organizationName || "—";
  }

  columnDefs: ColDef[] = [
    {
      headerName: "Service Category",
      field: "serviceCategoryName",
      flex: 1.6,
      minWidth: 220,
      cellRenderer: (params: ICellRendererParams) => {
        const cat = params.data;
        return `<div class="ag-tenant-cell"><strong>${this.escapeHtml(cat?.serviceCategoryName)}</strong><br><small>${this.escapeHtml(cat?.serviceCategoryCode)}</small></div>`;
      },
    },
    {
      headerName: "Organization",
      field: "organizationId",
      flex: 1.2,
      minWidth: 180,
      valueGetter: (params) => this.organizationNameOf(params.data?.organizationId),
    },
    { headerName: "Description", field: "description", flex: 1.4, minWidth: 200, valueFormatter: (p) => p.value || "—" },
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
        const cat = params.data;
        if (!cat?.serviceCategoryId) return "";
        if (cat.status === "DELETED") {
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
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.gridApi.sizeColumnsToFit();
  }

  load(page: number = this.page): void {
    this.loading = true;
    this.page = page;

    this.api
      .get<any>("/service-categories", {
        page: this.page,
        limit: this.limit,
        search: this.search,
        status: this.status,
        organizationId: this.organizationId,
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
          this.notificationModal.open({ type: "ERROR", title: "Failed to load service categories", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
        },
      });
  }

  loadOrganizationOptions(): void {
    this.api.get<any>("/organizations/list").subscribe({
      next: (response) => {
        this.organizationOptions = response?.data || [];
        // Organization names for already-rendered rows resolve lazily
        // once options arrive, so refresh the grid's cells.
        if (this.gridApi) this.gridApi.refreshCells({ force: true });
      },
      error: () => (this.organizationOptions = []),
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

  openEdit(cat: any): void {
    if (!cat?.serviceCategoryId) return;
    this.editMode = true;
    this.form = {
      serviceCategoryId: cat.serviceCategoryId,
      organizationId: cat.organizationId ?? null,
      serviceCategoryName: cat.serviceCategoryName || "",
      description: cat.description || "",
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
      organizationId: this.form.organizationId,
      serviceCategoryName: this.form.serviceCategoryName.trim(),
      description: this.form.description.trim() || null,
    };

    if (this.editMode) {
      this.api.put<any>(`/service-categories/${this.form.serviceCategoryId}`, request).subscribe({
        next: () => {
          this.saving = false;
          this.formOpen = false;
          this.editMode = false;
          this.resetForm();
          this.notificationModal.open({ type: "SUCCESS", title: "Service category updated", message: "Service category updated successfully", contentType: "TEXT", autoCloseAfter: 2500 });
          this.load();
        },
        error: (error) => {
          this.saving = false;
          this.notificationModal.open({ type: "ERROR", title: "Failed to update service category", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
        },
      });
      return;
    }

    this.api.post<any>("/service-categories", request).subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.resetForm();
        this.notificationModal.open({ type: "SUCCESS", title: "Service category created", message: "Service category created successfully", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
      },
      error: (error) => {
        this.saving = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to create service category", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  deleteRow(cat: any): void {
    if (!cat?.serviceCategoryId) return;
    this.pendingDelete = cat;
    this.confirmModal.open({
      title: "Delete service category",
      message: `Are you sure you want to delete "${cat.serviceCategoryName}"?\n\nThe service category will be marked as DELETED and will not be physically removed.`,
      confirmText: "Delete",
      cancelText: "Cancel",
    });
  }

  onDeleteConfirmed(): void {
    const cat = this.pendingDelete;
    this.pendingDelete = null;
    if (!cat?.serviceCategoryId) return;

    this.deleting = true;
    this.api.patch<any>(`/service-categories/${cat.serviceCategoryId}/status`, { status: "DELETED" }).subscribe({
      next: () => {
        this.deleting = false;
        this.notificationModal.open({ type: "SUCCESS", title: "Service category deleted", message: "Service category deleted successfully", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
      },
      error: (error) => {
        this.deleting = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to delete service category", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  onDeleteCancelled(): void {
    this.pendingDelete = null;
  }

  select(cat: any): void {
    if (!cat?.serviceCategoryId) return;
    this.loading = true;
    this.api.get<any>(`/service-categories/${cat.serviceCategoryId}`).subscribe({
      next: (response) => {
        this.selected = response;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to load service category", message: error, contentType: "TEXT", autoCloseAfter: 3000 });
      },
    });
  }

  closeDetails(): void {
    this.selected = null;
  }

  get selectedOrganizationName(): string {
    return this.organizationNameOf(this.selected?.organizationId);
  }

  validateForm(): boolean {
    if (!this.form.organizationId) {
      this.ui.show("Organization is required");
      return false;
    }
    if (!this.form.serviceCategoryName.trim()) {
      this.ui.show("Service category name is required");
      return false;
    }
    return true;
  }

  resetForm(): void {
    this.form = { serviceCategoryId: null, organizationId: null, serviceCategoryName: "", description: "" };
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
