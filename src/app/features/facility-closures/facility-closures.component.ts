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

const CLOSURE_TYPE_LABELS: Record<string, string> = {
  HOLIDAY: "Holiday",
  WEEKLY_OFF: "Weekly off",
  EMERGENCY: "Emergency closure",
  MAINTENANCE: "Maintenance",
  OTHER: "Other",
};

const RECURRENCE_LABELS: Record<string, string> = {
  ONE_TIME: "One-time date",
  WEEKLY: "Weekly off (day of week)",
  ANNUAL: "Annual (same date every year)",
};

@Component({
  selector: "app-facility-closures",
  standalone: true,
  imports: [CommonModule, FormsModule, PageComponent, AgGridAngular, ConfirmModalComponent, NotificationModalComponent],
  templateUrl: "./facility-closures.component.html",
  styleUrls: ["./facility-closures.component.scss"],
})
export class FacilityClosuresComponent implements OnInit {
  closureTypeOptions = Object.entries(CLOSURE_TYPE_LABELS).map(([value, label]) => ({ value, label }));
  recurrenceOptions = Object.entries(RECURRENCE_LABELS).map(([value, label]) => ({ value, label }));
  dayOptions = Object.entries(DAY_LABELS).map(([value, label]) => ({ value: Number(value), label }));

  // =========================================================
  // DATA
  // =========================================================

  rows: any[] = [];
  facilityOptions: any[] = [];

  // Filters
  facilityId: number | "" = "";
  closureType = "";
  recurrenceType = "";
  status = "";

  page = 1;
  limit = 20;
  totalItems = 0;
  totalPages = 1;

  loading = false;
  saving = false;
  cancelling = false;

  selected: any = null;
  private pendingCancel: any = null;

  @ViewChild("confirmModal") confirmModal!: ConfirmModalComponent;
  @ViewChild("notificationModal") notificationModal!: NotificationModalComponent;

  formOpen = false;
  editMode = false;

  form = {
    closureId: null as number | null,
    facilityId: null as number | null,
    closureType: "HOLIDAY",
    recurrenceType: "ANNUAL" as "ONE_TIME" | "WEEKLY" | "ANNUAL",
    closureDate: "" as string | null,
    dayOfWeek: null as number | null,
    closureName: "",
    reason: "",
  };

  private gridApi!: GridApi;

  columnDefs: ColDef[] = [
    {
      headerName: "Closure",
      flex: 1.6,
      minWidth: 220,
      cellRenderer: (params: ICellRendererParams) => {
        const row = params.data;
        const scope = row?.facilityId ? this.facilityFor(row.facilityId)?.facilityName || `Facility #${row.facilityId}` : "All facilities";
        return `<div class="ag-closure-cell"><strong>${this.escapeHtml(row?.closureName)}</strong><small>${this.escapeHtml(scope)}</small></div>`;
      },
    },
    {
      headerName: "Type",
      field: "closureType",
      flex: 1,
      minWidth: 150,
      valueFormatter: (params) => CLOSURE_TYPE_LABELS[params.value] || params.value,
    },
    {
      headerName: "Recurs",
      flex: 1.3,
      minWidth: 190,
      valueGetter: (params) => this.recurrenceLabel(params.data),
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
        else if (status === "CANCELLED") className += " danger";
        return `<span class="${className}">${this.escapeHtml(status)}</span>`;
      },
    },
    {
      headerName: "Actions",
      flex: 1.4,
      minWidth: 220,
      sortable: false,
      filter: false,
      cellRenderer: (params: ICellRendererParams) => {
        const row = params.data;
        if (!row?.closureId) return "";
        const buttons = [`<button type="button" class="ag-action-btn view" data-action="view">View</button>`];
        if (this.canWrite) {
          buttons.push(`<button type="button" class="ag-action-btn edit" data-action="edit">Edit</button>`);
          if (row.status === "ACTIVE") {
            buttons.push(`<button type="button" class="ag-action-btn delete" data-action="cancel">Cancel</button>`);
          }
        }
        return `<div class="ag-table-actions">${buttons.join("")}</div>`;
      },
      onCellClicked: (params) => {
        const action = (params.event?.target as HTMLElement)?.getAttribute("data-action");
        if (!action) return;
        if (action === "view") this.select(params.data);
        if (action === "edit") this.openEdit(params.data);
        if (action === "cancel") this.confirmCancel(params.data);
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

  /**
   * Unlike slot configs, there's no maker-checker workflow here — closing
   * a facility is treated as an administrative decision, so write access
   * is TENANT_ADMIN-only (the appointment-admin:facility-closure:update
   * permission covers edit and cancel both; create is its own permission
   * but always granted alongside it — see identity-admin-service's
   * database/seeds/facility-closure-rbac.sql). The backend is still the
   * real enforcement point; this only hides buttons a TENANT_USER's token
   * would just get a 403 from anyway.
   */
  get canWrite(): boolean {
    return this.auth.hasPermission("appointment-admin:facility-closure:update");
  }

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

    this.appointmentApi
      .get<any>("/facility-closures", {
        page: this.page,
        limit: this.limit,
        facilityId: this.facilityId || undefined,
        closureType: this.closureType,
        recurrenceType: this.recurrenceType,
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
          this.notificationModal.open({ type: "ERROR", title: "Failed to load closures", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
        },
      });
  }

  loadFacilityOptions(): void {
    this.api.get<any>("/facilities/list").subscribe({
      next: (response) => (this.facilityOptions = response?.data || []),
      error: () => (this.facilityOptions = []),
    });
  }

  facilityFor(facilityId: number): any {
    return this.facilityOptions.find((f) => f.facilityId === facilityId);
  }

  recurrenceLabel(row: any): string {
    if (!row) return "—";
    switch (row.recurrenceType) {
      case "WEEKLY":
        return row.dayOfWeek ? `Every ${DAY_LABELS[row.dayOfWeek]}` : "Weekly";
      case "ANNUAL":
        return row.closureDate ? `Annually on ${row.closureDate.slice(5)}` : "Annual";
      case "ONE_TIME":
      default:
        return row.closureDate || "One-time";
    }
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

  // =========================================================
  // CREATE / EDIT
  // =========================================================

  openCreate(): void {
    this.editMode = false;
    this.resetForm();
    this.formOpen = true;
  }

  openEdit(row: any): void {
    if (!row?.closureId || !this.canWrite) return;
    this.editMode = true;
    this.form = {
      closureId: row.closureId,
      facilityId: row.facilityId ?? null,
      closureType: row.closureType,
      recurrenceType: row.recurrenceType,
      closureDate: row.closureDate || "",
      dayOfWeek: row.dayOfWeek ?? null,
      closureName: row.closureName || "",
      reason: row.reason || "",
    };
    this.formOpen = true;
  }

  /**
   * Called when the Recurrence Type select changes in the create/edit
   * form — resets the now-irrelevant field and defaults the newly
   * relevant one, mirroring appointment-slot-configs' the same pattern
   * (switching ONE_TIME/ANNUAL <-> WEEKLY and back never leaves a stale
   * value sitting in the form).
   */
  onRecurrenceTypeChange(): void {
    if (this.form.recurrenceType === "WEEKLY") {
      this.form.dayOfWeek = this.form.dayOfWeek ?? 1;
      this.form.closureDate = "";
    } else {
      this.form.dayOfWeek = null;
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

    const isWeekly = this.form.recurrenceType === "WEEKLY";
    const request: any = {
      facilityId: this.form.facilityId,
      closureType: this.form.closureType,
      recurrenceType: this.form.recurrenceType,
      closureDate: isWeekly ? null : this.form.closureDate,
      dayOfWeek: isWeekly ? this.form.dayOfWeek : null,
      closureName: this.form.closureName,
      reason: this.form.reason || null,
    };

    if (this.editMode) {
      this.appointmentApi.patch<any>(`/facility-closures/${this.form.closureId}`, request).subscribe({
        next: () => {
          this.saving = false;
          this.formOpen = false;
          this.editMode = false;
          this.resetForm();
          this.notificationModal.open({ type: "SUCCESS", title: "Closure updated", message: "Closure updated successfully", contentType: "TEXT", autoCloseAfter: 2500 });
          this.load();
        },
        error: (error) => {
          this.saving = false;
          this.notificationModal.open({ type: "ERROR", title: "Failed to update closure", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
        },
      });
      return;
    }

    this.appointmentApi.post<any>("/facility-closures", request).subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.resetForm();
        this.notificationModal.open({ type: "SUCCESS", title: "Closure created", message: "Closure created successfully", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
      },
      error: (error) => {
        this.saving = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to create closure", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  // =========================================================
  // CANCEL (soft delete) — TENANT_ADMIN only (button hidden otherwise)
  // =========================================================

  confirmCancel(row: any): void {
    if (!row?.closureId) return;
    this.pendingCancel = row;
    this.confirmModal.open({
      title: "Cancel closure",
      message: `Cancel "${row.closureName}"? This can't be undone from the UI, though the record is kept for audit.`,
      confirmText: "Cancel closure",
      cancelText: "Keep it",
    });
  }

  onCancelConfirmed(): void {
    const row = this.pendingCancel;
    this.pendingCancel = null;
    if (!row?.closureId) return;

    this.cancelling = true;
    this.appointmentApi.post<any>(`/facility-closures/${row.closureId}/cancel`).subscribe({
      next: () => {
        this.cancelling = false;
        this.notificationModal.open({ type: "SUCCESS", title: "Closure cancelled", message: "Closure cancelled successfully", contentType: "TEXT", autoCloseAfter: 2500 });
        this.load();
      },
      error: (error) => {
        this.cancelling = false;
        this.notificationModal.open({ type: "ERROR", title: "Failed to cancel closure", message: error, contentType: "TEXT", autoCloseAfter: 4000 });
      },
    });
  }

  onCancelDismissed(): void {
    this.pendingCancel = null;
  }

  // =========================================================
  // DETAILS
  // =========================================================

  select(closure: any): void {
    this.selected = closure;
  }

  closeDetails(): void {
    this.selected = null;
  }

  validateForm(): boolean {
    if (!this.form.closureType) {
      this.ui.show("Closure type is required");
      return false;
    }
    if (!this.form.closureName.trim()) {
      this.ui.show("A name is required");
      return false;
    }
    if (this.form.recurrenceType === "WEEKLY" && !this.form.dayOfWeek) {
      this.ui.show("Day of week is required for a weekly off");
      return false;
    }
    if ((this.form.recurrenceType === "ONE_TIME" || this.form.recurrenceType === "ANNUAL") && !this.form.closureDate) {
      this.ui.show("Date is required");
      return false;
    }
    return true;
  }

  resetForm(): void {
    this.form = {
      closureId: null,
      facilityId: null,
      closureType: "HOLIDAY",
      recurrenceType: "ANNUAL",
      closureDate: "",
      dayOfWeek: null,
      closureName: "",
      reason: "",
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
