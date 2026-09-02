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

export const FACILITY_TYPES = ["CHC", "PHC", "SUB_CENTER", "DISTRICT_HOSPITAL", "CLINIC", "OTHER"];

@Component({
  selector: "app-facilities",
  standalone: true,
  imports: [CommonModule, FormsModule, PageComponent, AgGridAngular, ConfirmModalComponent, NotificationModalComponent],
  templateUrl: "./facilities.component.html",
  styleUrls: ["./facilities.component.scss"],
})
export class FacilitiesComponent implements OnInit {
  facilityTypes = FACILITY_TYPES;

  rows: any[] = [];
  organizationOptions: any[] = [];

  search = "";
  status = "";
  facilityType = "";
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
    facilityId: null as number | null,
    organizationId: null as number | null,
    facilityName: "",
    facilityType: "" as string,
    addressLine1: "",
    addressLine2: "",
    city: "",
    stateName: "",
    districtName: "",
    postalCode: "",
    country: "India",
    latitude: null as number | null,
    longitude: null as number | null,
    phoneNumber: "",
    email: "",
  };

  private gridApi!: GridApi;

  columnDefs: ColDef[] = [
    {
      headerName: "Facility",
      field: "facilityName",
      flex: 1.6,
      minWidth: 220,
      cellRenderer: (params: ICellRendererParams) => {
        const facility = params.data;
        return `<div class="ag-tenant-cell"><strong>${this.escapeHtml(facility?.facilityName)}</strong><br><small>${this.escapeHtml(facility?.facilityCode)}</small></div>`;
      },
    },
    { headerName: "Type", field: "facilityType", flex: 0.8, minWidth: 140 },
    { headerName: "City", field: "city", flex: 0.9, minWidth: 140 },
    { headerName: "Organization ID", field: "organizationId", flex: 0.8, minWidth: 140 },
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
        const facility = params.data;
        if (!facility?.facilityId) return "";
        if (facility.status === "DELETED") {
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
      .get<any>("/facilities", {
        page: this.page,
        limit: this.limit,
        search: this.search,
        status: this.status,
        facilityType: this.facilityType,
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
          this.notificationModal.open({ type: "ERROR", title: "Failed to load facilities", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
        },
      });
  }

  loadOrganizationOptions(): void {
    this.api.get<any>("/organizations/list").subscribe({
      next: (response) => (this.organizationOptions = response?.data || []),
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

  openEdit(facility: any): void {
    if (!facility?.facilityId) return;
    this.editMode = true;
    this.form = {
      facilityId: facility.facilityId,
      organizationId: facility.organizationId ?? null,
      facilityName: facility.facilityName || "",
      facilityType: facility.facilityType || "",
      addressLine1: facility.addressLine1 || "",
      addressLine2: facility.addressLine2 || "",
      city: facility.city || "",
      stateName: facility.stateName || "",
      districtName: facility.districtName || "",
      postalCode: facility.postalCode || "",
      country: facility.country || "India",
      latitude: facility.latitude ?? null,
      longitude: facility.longitude ?? null,
      phoneNumber: facility.phoneNumber || "",
      email: facility.email || "",
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
      facilityName: this.form.facilityName.trim(),
      facilityType: this.form.facilityType || null,
      addressLine1: this.form.addressLine1 || null,
      addressLine2: this.form.addressLine2 || null,
      city: this.form.city || null,
      stateName: this.form.stateName || null,
      districtName: this.form.districtName || null,
      postalCode: this.form.postalCode || null,
      country: this.form.country || null,
      latitude: this.form.latitude,
      longitude: this.form.longitude,
      phoneNumber: this.form.phoneNumber || null,
      email: this.form.email || null,
    };

    if (this.editMode) {
      this.api.put<any>(`/facilities/${this.form.facilityId}`, request).subscribe({
        next: () => {
          this.saving = false;
          this.formOpen = false;
          this.editMode = false;
          this.resetForm();
          this.notificationModal.open({ type: "SUCCESS", title: "Facility updated", message: "Facility updated successfully", contentType: "TEXT", autoCloseAfter: 2500 });
          this.load();
        },
        error: (error) => {
          this.saving = false;
          this.notificationModal.open({ type: "ERROR", title: "Failed to update facility", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
        },
      });
      return;
    }

    this.api.post<any>("/facilities", request).subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.resetForm();
        this.notificationModal.open({ type: "SUCCESS", title: "Facility created", message: "Facility created successfully", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
      },
      error: (error) => {
        this.saving = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to create facility", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  deleteRow(facility: any): void {
    if (!facility?.facilityId) return;
    this.pendingDelete = facility;
    this.confirmModal.open({
      title: "Delete facility",
      message: `Are you sure you want to delete "${facility.facilityName}"?\n\nThe facility will be marked as DELETED and will not be physically removed.`,
      confirmText: "Delete",
      cancelText: "Cancel",
    });
  }

  onDeleteConfirmed(): void {
    const facility = this.pendingDelete;
    this.pendingDelete = null;
    if (!facility?.facilityId) return;

    this.deleting = true;
    this.api.patch<any>(`/facilities/${facility.facilityId}/status`, { status: "DELETED" }).subscribe({
      next: () => {
        this.deleting = false;
        this.notificationModal.open({ type: "SUCCESS", title: "Facility deleted", message: "Facility deleted successfully", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
      },
      error: (error) => {
        this.deleting = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to delete facility", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  onDeleteCancelled(): void {
    this.pendingDelete = null;
  }

  select(facility: any): void {
    if (!facility?.facilityId) return;
    this.loading = true;
    this.api.get<any>(`/facilities/${facility.facilityId}`).subscribe({
      next: (response) => {
        this.selected = response;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to load facility", message: error, contentType: "TEXT", autoCloseAfter: 3000 });
      },
    });
  }

  closeDetails(): void {
    this.selected = null;
  }

  validateForm(): boolean {
    if (!this.form.organizationId) {
      this.ui.show("Organization is required");
      return false;
    }
    if (!this.form.facilityName.trim()) {
      this.ui.show("Facility name is required");
      return false;
    }
    return true;
  }

  resetForm(): void {
    this.form = {
      facilityId: null,
      organizationId: null,
      facilityName: "",
      facilityType: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      stateName: "",
      districtName: "",
      postalCode: "",
      country: "India",
      latitude: null,
      longitude: null,
      phoneNumber: "",
      email: "",
    };
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
