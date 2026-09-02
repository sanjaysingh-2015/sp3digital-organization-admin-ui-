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

export const DEPARTMENT_TYPES = ["OPD", "IPD", "EMERGENCY", "LAB", "PHARMACY", "RADIOLOGY", "MATERNITY", "OTHER"];

@Component({
  selector: "app-departments",
  standalone: true,
  imports: [CommonModule, FormsModule, PageComponent, AgGridAngular, ConfirmModalComponent, NotificationModalComponent],
  templateUrl: "./departments.component.html",
  styleUrls: ["./departments.component.scss"],
})
export class DepartmentsComponent implements OnInit {
  departmentTypes = DEPARTMENT_TYPES;

  rows: any[] = [];
  facilityOptions: any[] = [];

  search = "";
  status = "";
  facilityId = "";

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
    departmentId: null as number | null,
    facilityId: null as number | null,
    departmentName: "",
    departmentType: "" as string,
  };

  private gridApi!: GridApi;

  columnDefs: ColDef[] = [
    {
      headerName: "Department",
      field: "departmentName",
      flex: 1.6,
      minWidth: 220,
      cellRenderer: (params: ICellRendererParams) => {
        const dept = params.data;
        return `<div class="ag-tenant-cell"><strong>${this.escapeHtml(dept?.departmentName)}</strong><br><small>${this.escapeHtml(dept?.departmentCode)}</small></div>`;
      },
    },
    { headerName: "Type", field: "departmentType", flex: 0.8, minWidth: 140 },
    { headerName: "Facility ID", field: "facilityId", flex: 0.8, minWidth: 130 },
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
        const dept = params.data;
        if (!dept?.departmentId) return "";
        if (dept.status === "DELETED") {
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
      .get<any>("/departments", {
        page: this.page,
        limit: this.limit,
        search: this.search,
        status: this.status,
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
            this.gridApi.setGridOption("rowData", this.rows);
            setTimeout(() => this.gridApi.sizeColumnsToFit());
          }
        },
        error: (error) => {
          this.loading = false;
          this.notificationModal.open({ type: "ERROR", title: "Failed to load departments", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
        },
      });
  }

  loadFacilityOptions(): void {
    this.api.get<any>("/facilities/list").subscribe({
      next: (response) => (this.facilityOptions = response?.data || []),
      error: () => (this.facilityOptions = []),
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

  openEdit(dept: any): void {
    if (!dept?.departmentId) return;
    this.editMode = true;
    this.form = {
      departmentId: dept.departmentId,
      facilityId: dept.facilityId ?? null,
      departmentName: dept.departmentName || "",
      departmentType: dept.departmentType || "",
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
      facilityId: this.form.facilityId,
      departmentName: this.form.departmentName.trim(),
      departmentType: this.form.departmentType || null,
    };

    if (this.editMode) {
      this.api.put<any>(`/departments/${this.form.departmentId}`, request).subscribe({
        next: () => {
          this.saving = false;
          this.formOpen = false;
          this.editMode = false;
          this.resetForm();
          this.notificationModal.open({ type: "SUCCESS", title: "Department updated", message: "Department updated successfully", contentType: "TEXT", autoCloseAfter: 2500 });
          this.load();
        },
        error: (error) => {
          this.saving = false;
          this.notificationModal.open({ type: "ERROR", title: "Failed to update department", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
        },
      });
      return;
    }

    this.api.post<any>("/departments", request).subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.resetForm();
        this.notificationModal.open({ type: "SUCCESS", title: "Department created", message: "Department created successfully", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
      },
      error: (error) => {
        this.saving = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to create department", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  deleteRow(dept: any): void {
    if (!dept?.departmentId) return;
    this.pendingDelete = dept;
    this.confirmModal.open({
      title: "Delete department",
      message: `Are you sure you want to delete "${dept.departmentName}"?\n\nThe department will be marked as DELETED and will not be physically removed.`,
      confirmText: "Delete",
      cancelText: "Cancel",
    });
  }

  onDeleteConfirmed(): void {
    const dept = this.pendingDelete;
    this.pendingDelete = null;
    if (!dept?.departmentId) return;

    this.deleting = true;
    this.api.patch<any>(`/departments/${dept.departmentId}/status`, { status: "DELETED" }).subscribe({
      next: () => {
        this.deleting = false;
        this.notificationModal.open({ type: "SUCCESS", title: "Department deleted", message: "Department deleted successfully", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
      },
      error: (error) => {
        this.deleting = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to delete department", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  onDeleteCancelled(): void {
    this.pendingDelete = null;
  }

  select(dept: any): void {
    if (!dept?.departmentId) return;
    this.loading = true;
    this.api.get<any>(`/departments/${dept.departmentId}`).subscribe({
      next: (response) => {
        this.selected = response;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to load department", message: error, contentType: "TEXT", autoCloseAfter: 3000 });
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
    if (!this.form.departmentName.trim()) {
      this.ui.show("Department name is required");
      return false;
    }
    return true;
  }

  resetForm(): void {
    this.form = { departmentId: null, facilityId: null, departmentName: "", departmentType: "" };
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
