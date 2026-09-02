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

export const SERVICE_CATEGORIES = [
  "OUTPATIENT",
  "INPATIENT",
  "DIAGNOSTIC",
  "IMMUNIZATION",
  "MATERNAL_HEALTH",
  "TELECONSULTATION",
  "EMERGENCY",
  "OTHER",
];

@Component({
  selector: "app-facility-services",
  standalone: true,
  imports: [CommonModule, FormsModule, PageComponent, AgGridAngular, ConfirmModalComponent, NotificationModalComponent],
  templateUrl: "./facility-services.component.html",
  styleUrls: ["./facility-services.component.scss"],
})
export class FacilityServicesComponent implements OnInit {
  serviceCategories = SERVICE_CATEGORIES;

  rows: any[] = [];
  facilityOptions: any[] = [];
  formDepartmentOptions: any[] = [];

  search = "";
  status = "";
  facilityId = "";
  serviceCategory = "";

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
    facilityServiceId: null as number | null,
    facilityId: null as number | null,
    departmentId: null as number | null,
    serviceName: "",
    serviceCategory: "" as string,
  };

  private gridApi!: GridApi;

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
    { headerName: "Category", field: "serviceCategory", flex: 1, minWidth: 160 },
    { headerName: "Facility ID", field: "facilityId", flex: 0.8, minWidth: 120 },
    { headerName: "Department ID", field: "departmentId", flex: 0.8, minWidth: 130 },
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
        if (!svc?.facilityServiceId) return "";
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
    this.loadFacilityOptions();
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.gridApi.sizeColumnsToFit();
  }

  load(page: number = this.page): void {
    this.loading = true;
    this.page = page;

    this.api
      .get<any>("/facility-services", {
        page: this.page,
        limit: this.limit,
        search: this.search,
        status: this.status,
        facilityId: this.facilityId,
        serviceCategory: this.serviceCategory,
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
          this.notificationModal.open({ type: "ERROR", title: "Failed to load facility services", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
        },
      });
  }

  loadFacilityOptions(): void {
    this.api.get<any>("/facilities/list").subscribe({
      next: (response) => (this.facilityOptions = response?.data || []),
      error: () => (this.facilityOptions = []),
    });
  }

  /** Called when the facility select changes inside the create/edit form. */
  onFormFacilityChange(): void {
    this.form.departmentId = null;
    this.formDepartmentOptions = [];

    if (!this.form.facilityId) return;

    this.api.get<any>("/departments/list", { facilityId: this.form.facilityId }).subscribe({
      next: (response) => (this.formDepartmentOptions = response?.data || []),
      error: () => (this.formDepartmentOptions = []),
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

  openEdit(svc: any): void {
    if (!svc?.facilityServiceId) return;
    this.editMode = true;
    this.form = {
      facilityServiceId: svc.facilityServiceId,
      facilityId: svc.facilityId ?? null,
      departmentId: svc.departmentId ?? null,
      serviceName: svc.serviceName || "",
      serviceCategory: svc.serviceCategory || "",
    };
    this.formOpen = true;

    if (this.form.facilityId) {
      this.api.get<any>("/departments/list", { facilityId: this.form.facilityId }).subscribe({
        next: (response) => (this.formDepartmentOptions = response?.data || []),
        error: () => (this.formDepartmentOptions = []),
      });
    }
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
      facilityId: this.form.facilityId,
      departmentId: this.form.departmentId || null,
      serviceName: this.form.serviceName.trim(),
      serviceCategory: this.form.serviceCategory || null,
    };

    if (this.editMode) {
      this.api.put<any>(`/facility-services/${this.form.facilityServiceId}`, request).subscribe({
        next: () => {
          this.saving = false;
          this.formOpen = false;
          this.editMode = false;
          this.resetForm();
          this.notificationModal.open({ type: "SUCCESS", title: "Facility service updated", message: "Facility service updated successfully", contentType: "TEXT", autoCloseAfter: 2500 });
          this.load();
        },
        error: (error) => {
          this.saving = false;
          this.notificationModal.open({ type: "ERROR", title: "Failed to update facility service", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
        },
      });
      return;
    }

    this.api.post<any>("/facility-services", request).subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.resetForm();
        this.notificationModal.open({ type: "SUCCESS", title: "Facility service created", message: "Facility service created successfully", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
      },
      error: (error) => {
        this.saving = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to create facility service", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  deleteRow(svc: any): void {
    if (!svc?.facilityServiceId) return;
    this.pendingDelete = svc;
    this.confirmModal.open({
      title: "Delete facility service",
      message: `Are you sure you want to delete "${svc.serviceName}"?\n\nThe service will be marked as DELETED and will not be physically removed.`,
      confirmText: "Delete",
      cancelText: "Cancel",
    });
  }

  onDeleteConfirmed(): void {
    const svc = this.pendingDelete;
    this.pendingDelete = null;
    if (!svc?.facilityServiceId) return;

    this.deleting = true;
    this.api.patch<any>(`/facility-services/${svc.facilityServiceId}/status`, { status: "DELETED" }).subscribe({
      next: () => {
        this.deleting = false;
        this.notificationModal.open({ type: "SUCCESS", title: "Facility service deleted", message: "Facility service deleted successfully", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
      },
      error: (error) => {
        this.deleting = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to delete facility service", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  onDeleteCancelled(): void {
    this.pendingDelete = null;
  }

  select(svc: any): void {
    if (!svc?.facilityServiceId) return;
    this.loading = true;
    this.api.get<any>(`/facility-services/${svc.facilityServiceId}`).subscribe({
      next: (response) => {
        this.selected = response;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to load facility service", message: error, contentType: "TEXT", autoCloseAfter: 3000 });
      },
    });
  }

  closeDetails(): void {
    this.selected = null;
  }

  validateForm(): boolean {
    if (!this.form.facilityId) {
      this.ui.show("Facility is required");
      return false;
    }
    if (!this.form.serviceName.trim()) {
      this.ui.show("Service name is required");
      return false;
    }
    return true;
  }

  resetForm(): void {
    this.form = { facilityServiceId: null, facilityId: null, departmentId: null, serviceName: "", serviceCategory: "" };
    this.formDepartmentOptions = [];
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
