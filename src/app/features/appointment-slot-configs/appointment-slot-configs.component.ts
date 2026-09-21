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
import { AppointmentApiService } from "../../core/appointment-api.service";
import { AuthService } from "../../core/auth.service";
import { UiService } from "../../core/ui.service";
import { SLOT_CONFIG_PERMISSIONS } from "../../core/appointment-permissions";
import { PageComponent } from "../../shared/page.component";
import { ConfirmModalComponent } from "../../shared/components/confirm-modal/confirm-modal";
import { NotificationModalComponent } from "../../shared/components/notification-modal/notification-modal";

ModuleRegistry.registerModules([AllCommunityModule]);

const DAY_LABELS: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

@Component({
  selector: "app-appointment-slot-configs",
  standalone: true,
  imports: [CommonModule, FormsModule, PageComponent, AgGridAngular, ConfirmModalComponent, NotificationModalComponent],
  templateUrl: "./appointment-slot-configs.component.html",
  styleUrls: ["./appointment-slot-configs.component.scss"],
})
export class AppointmentSlotConfigsComponent implements OnInit {
  dayOptions = Object.entries(DAY_LABELS).map(([value, label]) => ({ value: Number(value), label }));

  // =========================================================
  // DATA
  // =========================================================

  rows: any[] = [];

  // Loaded once, unfiltered — used to resolve any row's facilityId /
  // facilityServiceId to a readable name in the grid, regardless of the
  // current filter/form state. appointment-admin-service only knows the
  // raw ids (it's a separate service/database — see AppointmentApiService).
  facilityOptions: any[] = [];
  allFacilityServiceOptions: any[] = [];

  // Scoped to whichever facility is selected in the create/edit form.
  formFacilityServiceOptions: any[] = [];

  // Filters
  facilityId: number | "" = "";
  facilityServiceId: number | "" = "";
  approvalStatus = "";
  status = "";

  page = 1;
  limit = 20;
  totalItems = 0;
  totalPages = 1;

  loading = false;
  saving = false;
  approving = false;
  rejecting = false;

  selected: any = null;

  @ViewChild("confirmModal") confirmModal!: ConfirmModalComponent;
  @ViewChild("notificationModal") notificationModal!: NotificationModalComponent;

  private pendingApprove: any = null;

  formOpen = false;
  editMode = false;

  form = {
    slotConfigId: null as number | null,
    facilityId: null as number | null,
    facilityServiceId: null as number | null,
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "13:00",
    slotDurationMinutes: 30,
    capacityPerSlot: 1,
    effectiveFrom: "",
    effectiveTo: "" as string | null,
  };

  // Reject modal — separate from confirmModal since it needs a required
  // free-text reason, not just a yes/no confirmation.
  rejectFormOpen = false;
  rejectTarget: any = null;
  rejectReason = "";

  private gridApi!: GridApi;

  columnDefs: ColDef[] = [
    {
      headerName: "Service",
      flex: 1.6,
      minWidth: 240,
      valueGetter: (params) => this.serviceLabel(params.data),
      cellRenderer: (params: ICellRendererParams) => {
        const row = params.data;
        const service = this.facilityServiceFor(row?.facilityServiceId);
        const name = service?.serviceName || `Facility service #${row?.facilityServiceId}`;
        const facility = service?.facilityName || this.facilityFor(row?.facilityId)?.facilityName || "—";
        return `<div class="ag-slot-config-cell"><strong>${this.escapeHtml(name)}</strong><small>${this.escapeHtml(facility)}${row?.resourceName ? " · " + this.escapeHtml(row.resourceName) : ""}</small></div>`;
      },
    },
    {
      headerName: "Day / Time",
      flex: 1.2,
      minWidth: 180,
      valueGetter: (params) => `${DAY_LABELS[params.data?.dayOfWeek] || "—"} · ${params.data?.startTime}–${params.data?.endTime}`,
    },
    {
      headerName: "Duration / Capacity",
      flex: 1,
      minWidth: 170,
      valueGetter: (params) => `${params.data?.slotDurationMinutes} min · cap ${params.data?.capacityPerSlot}`,
    },
    {
      headerName: "Status",
      field: "status",
      flex: 0.7,
      minWidth: 110,
      cellRenderer: (params: ICellRendererParams) => {
        const status = params.value || "—";
        let className = "ag-status-badge";
        if (status === "ACTIVE") className += " good";
        else if (status === "INACTIVE") className += " warning";
        return `<span class="${className}">${this.escapeHtml(status)}</span>`;
      },
    },
    {
      headerName: "Approval",
      field: "approvalStatus",
      flex: 0.9,
      minWidth: 150,
      cellRenderer: (params: ICellRendererParams) => {
        const approval = params.value || "—";
        let className = "ag-status-badge";
        if (approval === "APPROVED") className += " good";
        else if (approval === "PENDING_APPROVAL") className += " warning";
        else if (approval === "REJECTED") className += " danger";
        return `<span class="${className}">${this.escapeHtml(approval)}</span>`;
      },
    },
    {
      headerName: "Actions",
      flex: 1.7,
      minWidth: 260,
      sortable: false,
      filter: false,
      cellRenderer: (params: ICellRendererParams) => {
        const row = params.data;
        if (!row?.slotConfigId) return "";
        const buttons = [`<button type="button" class="ag-action-btn view" data-action="view">View</button>`];
        if (this.canEdit) {
          buttons.push(`<button type="button" class="ag-action-btn edit" data-action="edit">Edit</button>`);
        }
        if (this.canApprove && row.approvalStatus === "PENDING_APPROVAL") {
          buttons.push(`<button type="button" class="ag-action-btn assign" data-action="approve">Approve</button>`);
          buttons.push(`<button type="button" class="ag-action-btn delete" data-action="reject">Reject</button>`);
        }
        return `<div class="ag-table-actions">${buttons.join("")}</div>`;
      },
      onCellClicked: (params) => {
        const action = (params.event?.target as HTMLElement)?.getAttribute("data-action");
        if (!action) return;
        if (action === "view") this.select(params.data);
        if (action === "edit") this.openEdit(params.data);
        if (action === "approve") this.confirmApprove(params.data);
        if (action === "reject") this.openReject(params.data);
      },
    },
  ];

  defaultColDef: ColDef = { resizable: true, sortable: true, filter: true };
  gridOptions = { rowHeight: 64, headerHeight: 44, suppressCellFocus: true, animateRows: true };

  constructor(
    private api: ApiService,
    private appointmentApi: AppointmentApiService,
    public auth: AuthService,
    private ui: UiService,
  ) {}

  // =========================================================
  // ROLE-BASED UI
  //
  // These only decide what's shown — appointment-admin-service enforces
  // the real permission check server-side regardless of what the UI does.
  // =========================================================

  get canEdit(): boolean {
    return this.auth.hasPermission(SLOT_CONFIG_PERMISSIONS.UPDATE);
  }

  get canApprove(): boolean {
    return this.auth.hasPermission(SLOT_CONFIG_PERMISSIONS.APPROVE);
  }

  ngOnInit(): void {
    this.load();
    this.loadFacilityOptions();
    this.loadAllFacilityServiceOptions();
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.gridApi.sizeColumnsToFit();
  }

  load(page: number = this.page): void {
    this.loading = true;
    this.page = page;

    this.appointmentApi
      .get<any>("/slot-configs", {
        page: this.page,
        limit: this.limit,
        facilityId: this.facilityId || undefined,
        facilityServiceId: this.facilityServiceId || undefined,
        approvalStatus: this.approvalStatus,
        status: this.status,
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
          this.notificationModal.open({ type: "ERROR", title: "Failed to load slot configurations", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
        },
      });
  }

  loadFacilityOptions(): void {
    this.api.get<any>("/facilities/list").subscribe({
      next: (response) => (this.facilityOptions = response?.data || []),
      error: () => (this.facilityOptions = []),
    });
  }

  /** Unscoped — every ACTIVE facility service across the tenant, purely for id->name lookup in the grid and the filter bar. */
  loadAllFacilityServiceOptions(): void {
    this.api.get<any>("/facility-services/list").subscribe({
      next: (response) => (this.allFacilityServiceOptions = response?.data || []),
      error: () => (this.allFacilityServiceOptions = []),
    });
  }

  facilityFor(facilityId: number): any {
    return this.facilityOptions.find((f) => f.facilityId === facilityId);
  }

  facilityServiceFor(facilityServiceId: number): any {
    return this.allFacilityServiceOptions.find((s) => s.facilityServiceId === facilityServiceId);
  }

  serviceLabel(row: any): string {
    const service = this.facilityServiceFor(row?.facilityServiceId);
    return service?.serviceName || `Facility service #${row?.facilityServiceId}`;
  }

  /** Called when the facility filter changes — narrows the facility-service filter to that facility's services. */
  onFilterFacilityChange(): void {
    this.facilityServiceId = "";
    this.onFilterChange();
  }

  onFilterChange(): void {
    this.load(1);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.page || this.loading) return;
    this.load(page);
  }

  get filteredFacilityServiceOptions(): any[] {
    if (!this.facilityId) return this.allFacilityServiceOptions;
    return this.allFacilityServiceOptions.filter((s) => s.facilityId === this.facilityId);
  }

  get hasPreviousPage(): boolean { return this.page > 1; }
  get hasNextPage(): boolean { return this.page < this.totalPages; }
  get rangeStart(): number { return this.totalItems === 0 ? 0 : (this.page - 1) * this.limit + 1; }
  get rangeEnd(): number { return Math.min(this.page * this.limit, this.totalItems); }

  // =========================================================
  // CREATE / EDIT
  // =========================================================

  openCreate(): void {
    this.editMode = false;
    this.resetForm();
    this.formOpen = true;
  }

  openEdit(row: any): void {
    if (!row?.slotConfigId || !this.canEdit) return;
    this.editMode = true;
    this.form = {
      slotConfigId: row.slotConfigId,
      facilityId: row.facilityId ?? null,
      facilityServiceId: row.facilityServiceId ?? null,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime?.slice(0, 5) || "09:00",
      endTime: row.endTime?.slice(0, 5) || "13:00",
      slotDurationMinutes: row.slotDurationMinutes,
      capacityPerSlot: row.capacityPerSlot,
      effectiveFrom: row.effectiveFrom || "",
      effectiveTo: row.effectiveTo || "",
    };
    this.formOpen = true;

    if (this.form.facilityId) {
      this.api.get<any>("/facility-services/list", { facilityId: this.form.facilityId }).subscribe({
        next: (response) => (this.formFacilityServiceOptions = response?.data || []),
        error: () => (this.formFacilityServiceOptions = []),
      });
    }
  }

  /** Called when the facility select changes inside the create/edit form. */
  onFormFacilityChange(): void {
    this.form.facilityServiceId = null;
    this.formFacilityServiceOptions = [];

    if (!this.form.facilityId) return;

    this.api.get<any>("/facility-services/list", { facilityId: this.form.facilityId }).subscribe({
      next: (response) => (this.formFacilityServiceOptions = response?.data || []),
      error: () => (this.formFacilityServiceOptions = []),
    });
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
      facilityServiceId: this.form.facilityServiceId,
      dayOfWeek: this.form.dayOfWeek,
      startTime: this.form.startTime,
      endTime: this.form.endTime,
      slotDurationMinutes: this.form.slotDurationMinutes,
      capacityPerSlot: this.form.capacityPerSlot || 1,
      effectiveFrom: this.form.effectiveFrom,
      effectiveTo: this.form.effectiveTo || null,
    };

    if (this.editMode) {
      // facilityId/facilityServiceId aren't part of the edit contract —
      // appointment-admin-service's updateSchema doesn't accept them (a
      // slot config's service is fixed at creation; only its schedule,
      // capacity and status can change).
      const patch: any = {
        dayOfWeek: request.dayOfWeek,
        startTime: request.startTime,
        endTime: request.endTime,
        slotDurationMinutes: request.slotDurationMinutes,
        capacityPerSlot: request.capacityPerSlot,
        effectiveFrom: request.effectiveFrom,
        effectiveTo: request.effectiveTo,
      };
      this.appointmentApi.patch<any>(`/slot-configs/${this.form.slotConfigId}`, patch).subscribe({
        next: () => {
          this.saving = false;
          this.formOpen = false;
          this.editMode = false;
          this.resetForm();
          this.notificationModal.open({ type: "SUCCESS", title: "Slot configuration updated", message: "Slot configuration updated successfully", contentType: "TEXT", autoCloseAfter: 2500 });
          this.load();
        },
        error: (error) => {
          this.saving = false;
          this.notificationModal.open({ type: "ERROR", title: "Failed to update slot configuration", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
        },
      });
      return;
    }

    this.appointmentApi.post<any>("/slot-configs", request).subscribe({
      next: (created) => {
        this.saving = false;
        this.formOpen = false;
        this.resetForm();
        const pending = created?.approvalStatus === "PENDING_APPROVAL";
        this.notificationModal.open({
          type: "SUCCESS",
          title: "Slot configuration created",
          message: pending
            ? "Submitted for approval — a tenant admin needs to approve it before it takes effect."
            : "Slot configuration created and approved.",
          contentType: "TEXT",
          autoCloseAfter: 3500,
        });
        this.load();
      },
      error: (error) => {
        this.saving = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to create slot configuration", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  // =========================================================
  // APPROVE / REJECT — TENANT_ADMIN only (buttons hidden otherwise; the
  // real gate is server-side, this is just avoiding a confusing 403).
  // =========================================================

  confirmApprove(row: any): void {
    if (!row?.slotConfigId) return;
    this.pendingApprove = row;
    this.confirmModal.open({
      title: "Approve slot configuration",
      message: `Approve the "${this.serviceLabel(row)}" schedule for ${DAY_LABELS[row.dayOfWeek]} ${row.startTime}–${row.endTime}?`,
      confirmText: "Approve",
      cancelText: "Cancel",
    });
  }

  onApproveConfirmed(): void {
    const row = this.pendingApprove;
    this.pendingApprove = null;
    if (!row?.slotConfigId) return;

    this.approving = true;
    this.appointmentApi.post<any>(`/slot-configs/${row.slotConfigId}/approve`).subscribe({
      next: () => {
        this.approving = false;
        this.notificationModal.open({ type: "SUCCESS", title: "Slot configuration approved", message: "Slot configuration approved successfully", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
      },
      error: (error) => {
        this.approving = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to approve slot configuration", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  onApproveCancelled(): void {
    this.pendingApprove = null;
  }

  openReject(row: any): void {
    if (!row?.slotConfigId) return;
    this.rejectTarget = row;
    this.rejectReason = "";
    this.rejectFormOpen = true;
  }

  closeReject(): void {
    if (this.rejecting) return;
    this.rejectFormOpen = false;
    this.rejectTarget = null;
    this.rejectReason = "";
  }

  submitReject(): void {
    if (!this.rejectTarget?.slotConfigId) return;
    if (!this.rejectReason.trim()) {
      this.ui.show("A rejection reason is required");
      return;
    }

    this.rejecting = true;
    this.appointmentApi.post<any>(`/slot-configs/${this.rejectTarget.slotConfigId}/reject`, { rejectionReason: this.rejectReason.trim() }).subscribe({
      next: () => {
        this.rejecting = false;
        this.rejectFormOpen = false;
        this.rejectTarget = null;
        this.rejectReason = "";
        this.notificationModal.open({ type: "SUCCESS", title: "Slot configuration rejected", message: "Slot configuration rejected", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
      },
      error: (error) => {
        this.rejecting = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to reject slot configuration", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  // =========================================================
  // DETAILS
  // =========================================================

  select(row: any): void {
    if (!row?.slotConfigId) return;
    this.loading = true;
    this.appointmentApi.get<any>(`/slot-configs/${row.slotConfigId}`).subscribe({
      next: (response) => {
        this.selected = response;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to load slot configuration", message: error, contentType: "TEXT", autoCloseAfter: 3000 });
      },
    });
  }

  closeDetails(): void {
    this.selected = null;
  }

  dayLabel(dayOfWeek: number): string {
    return DAY_LABELS[dayOfWeek] || "—";
  }

  validateForm(): boolean {
    if (!this.form.facilityId) {
      this.ui.show("Facility is required");
      return false;
    }
    if (!this.form.facilityServiceId) {
      this.ui.show("Facility service is required");
      return false;
    }
    if (!this.form.startTime || !this.form.endTime) {
      this.ui.show("Start and end time are required");
      return false;
    }
    if (this.form.endTime <= this.form.startTime) {
      this.ui.show("End time must be after start time");
      return false;
    }
    if (!this.form.slotDurationMinutes || this.form.slotDurationMinutes < 1) {
      this.ui.show("Slot duration is required");
      return false;
    }
    if (!this.form.effectiveFrom) {
      this.ui.show("Effective from date is required");
      return false;
    }
    return true;
  }

  resetForm(): void {
    this.form = {
      slotConfigId: null,
      facilityId: null,
      facilityServiceId: null,
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "13:00",
      slotDurationMinutes: 30,
      capacityPerSlot: 1,
      effectiveFrom: "",
      effectiveTo: "",
    };
    this.formFacilityServiceOptions = [];
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
