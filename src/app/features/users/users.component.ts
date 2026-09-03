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
import {
  UserListResponse,
  UserResponse,
  UserService,
} from "../../core/user.service";
import { UiService } from "../../core/ui.service";
import { PageComponent } from "../../shared/page.component";
import { ConfirmModalComponent } from "../../shared/components/confirm-modal/confirm-modal";
import { NotificationModalComponent } from "../../shared/components/notification-modal/notification-modal";
import { AssignRolesModalComponent } from "../../shared/components/assign-roles-modal/assign-roles-modal";
import { finalize } from "rxjs";

// Register AG Grid community modules
ModuleRegistry.registerModules([AllCommunityModule]);

export interface Tenant {
  tenantUuid: string;
  tenantCode: string;
  tenantName: string;
  status?: string;
  createdOn?: string;
  modifiedOn?: string;
}

@Component({
  selector: "app-users",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageComponent,
    AgGridAngular,
    ConfirmModalComponent,
    NotificationModalComponent,
    AssignRolesModalComponent,
  ],
  templateUrl: "./users.component.html",
  styleUrls: ["./users.component.scss"],
})
export class UsersComponent implements OnInit {
  // Server-side pagination state — the API paginates (page/limit/totalItems/
  // totalPages), so AG Grid's built-in pager can't be used as-is: it only
  // paginates whatever rows are already loaded, but a given response only
  // ever holds one page's worth (<= limit) out of totalItems.
  page = 1;
  limit = 20;
  totalItems = 0;
  totalPages = 1;

  // =========================================================
  // TENANTS
  // =========================================================

  tenants: Tenant[] = [];
 // loadingTenants = false;

  // =========================================================
  // DATA
  // =========================================================

  rows: UserResponse[] = [];

  search = "";
  status = "";

  loading = false;
  saving = false;
  deleting = false;
  tenantUuid = localStorage.getItem("tenantUuid");

  selected: any = null;

  // =========================================================
  // CONFIRM MODAL
  // =========================================================

  @ViewChild("confirmModal")
  confirmModal!: ConfirmModalComponent;

  private pendingDeleteUser: any = null;
  // =========================================================
  // NOTIFICATION MODAL
  // =========================================================

  @ViewChild("notificationModal")
  notificationModal!: NotificationModalComponent;

  // =========================================================
  // ASSIGN ROLES MODAL
  // =========================================================

  @ViewChild("assignRolesModal")
  assignRolesModal!: AssignRolesModalComponent;

  // =========================================================
  // CREATE / EDIT
  // =========================================================

  formOpen = false;
  editMode = false;

  form = {
    userId: null as number | string | null,
    tenantUuid: "",
    username: "",
    email: "",
    firstName: "",
    middleName: "",
    lastName: "",
    displayName: "",
    phoneCountryCode: "",
    phoneNumber: "",
    userType: "USER",
  };

  // =========================================================
  // STATIC USER TYPES
  // =========================================================

  readonly userTypes: string[] = ["USER", "ADMIN", "SERVICE"];

  // =========================================================
  // AG GRID
  // =========================================================

  private gridApi!: GridApi;

  columnDefs: ColDef[] = [
    {
      headerName: "User",
      field: "username",
      flex: 1.5,
      minWidth: 220,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams) => {
        const user = params.data;

        const name = this.getUserName(user);
        const username = user?.username || "—";

        return `
          <div class="ag-user-cell">
            <strong>${this.escapeHtml(name)}</strong>
            <small>${this.escapeHtml(username)}</small>
          </div>
        `;
      },
    },

    {
      headerName: "Email",
      field: "email",
      flex: 1.4,
      minWidth: 220,
      sortable: true,
      filter: true,
      valueFormatter: (params) => params.value || "—",
    },

    {
      headerName: "Phone",
      flex: 1.1,
      minWidth: 150,
      sortable: false,
      valueGetter: (params) => {
        const user = params.data;

        const countryCode =
          user?.phone_country_code || user?.phoneCountryCode || "";

        const phone = user?.phone_number || user?.phoneNumber || "";

        return `${countryCode} ${phone}`.trim() || "—";
      },
    },

    {
      headerName: "Type",
      flex: 0.8,
      minWidth: 120,
      sortable: true,
      filter: true,
      valueGetter: (params) => this.getUserType(params.data),
    },

    {
      headerName: "Status",
      field: "status",
      flex: 0.8,
      minWidth: 120,
      sortable: true,
      filter: true,

      cellRenderer: (params: ICellRendererParams) => {
        const status = params.value || "—";

        let className = "ag-status-badge";

        if (status === "ACTIVE") {
          className += " good";
        } else if (status === "SUSPENDED") {
          className += " warning";
        } else if (status === "INACTIVE" || status === "DELETED") {
          className += " danger";
        }

        return `
          <span class="${className}">
            ${this.escapeHtml(status)}
          </span>
        `;
      },
    },

    {
      headerName: "Created",
      flex: 1,
      minWidth: 170,
      sortable: true,
      valueGetter: (params) => this.getCreatedDate(params.data),
    },

    {
      headerName: "Actions",
      flex: 1.7,
      minWidth: 250,
      sortable: false,
      filter: false,

      cellRenderer: (params: ICellRendererParams) => {
        const user = params.data;

        const userId = user?.user_id || user?.userId;

        if (!userId) {
          return "";
        }

        const isDeleted = user?.status === "DELETED";

        if (isDeleted) {
          return `
            <div class="ag-table-actions">
              <button
                type="button"
                class="ag-action-btn view"
                data-action="view"
              >
                View
              </button>
            </div>
          `;
        }

        return `
          <div class="ag-table-actions">

            <button
              type="button"
              class="ag-action-btn view"
              data-action="view"
            >
              View
            </button>

            <button
              type="button"
              class="ag-action-btn edit"
              data-action="edit"
            >
              Edit
            </button>

            <button
              type="button"
              class="ag-action-btn assign"
              data-action="roles"
            >
              Roles
            </button>

            <button
              type="button"
              class="ag-action-btn delete"
              data-action="delete"
            >
              Delete
            </button>

          </div>
        `;
      },

      onCellClicked: (params) => {
        const target = params.event?.target as HTMLElement;
        if (!target) {
          return;
        }
        const action = target.getAttribute("data-action");
        if (!action) {
          return;
        }
        switch (action) {
          case "view":
            this.select(params.data);
            break;

          case "edit":
            this.openEdit(params.data);
            break;

          case "roles":
            this.openAssignRoles(params.data);
            break;

          case "delete":
            this.deleteUser(params.data);
            break;
        }
      },
    },
  ];

  defaultColDef: ColDef = {
    resizable: true,
    sortable: true,
    filter: true,
  };

  gridOptions = {
    rowHeight: 64,
    headerHeight: 44,
    suppressCellFocus: true,
    animateRows: true,
  };

  // =========================================================
  // CONSTRUCTOR
  // =========================================================

  constructor(
    private api: ApiService,
    private userApi: UserService,
    private ui: UiService,
  ) {}

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    // this.loadTenants();
    this.load();
  }

  // =========================================================
  // GRID READY
  // =========================================================

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;

    this.gridApi.sizeColumnsToFit();
  }

  // =========================================================
  // LOAD USERS
  // =========================================================

  load(page: number = this.page): void {
    this.loading = true;
    this.page = page;

    this.userApi
      .getUsers({
        page: this.page,
        limit: this.limit,
        search: this.search,
        status: this.status,
      })
      .pipe(
        finalize(() => {
          this.loading = false;
        }),
      )
      .subscribe({
        next: (response) => {
          this.rows = this.extractRows(response);

          const pagination = response?.pagination;
          this.page = pagination?.page ?? this.page;
          this.limit = pagination?.limit ?? this.limit;
          this.totalItems = pagination?.totalItems ?? this.rows.length;
          this.totalPages = pagination?.totalPages ?? 1;

          // Refresh AG Grid
          if (this.gridApi) {
            this.gridApi.setGridOption("rowData", this.rows);
            setTimeout(() => {
              this.gridApi.sizeColumnsToFit();
            });
          }
        },
        error: (error) => {
          this.loading = false;
          console.error("Failed to load users:", error);
          this.notificationModal.open({
            type: "ERROR",
            title: "Failed to load users",
            message: error,
            contentType: "TEXT",
            autoCloseAfter: 3000,
          });
        },
      });
  }

  private extractRows(response: UserListResponse): UserResponse[] {
    if (!response) return [];

    if (Array.isArray(response.data)) {
      return response.data;
    }
    if (response.data && "items" in response.data) {
      return response.data.items ?? [];
    }
    if (response.items) {
      return response.items;
    }
    if (response.rows) {
      return response.rows;
    }
    return [];
  }
  // =========================================================
  // FILTER CHANGES (reset to page 1 — a stale page number could
  // otherwise land past the end of a newly-filtered result set)
  // =========================================================

  onFilterChange(): void {
    this.load(1);
  }

  // =========================================================
  // LOAD TENANTS
  // =========================================================

  // loadTenants(): void {
  //   this.loadingTenants = true;

  //   this.userApi.get<any>("/tenants/list").subscribe({
  //     next: (response) => {
  //       this.tenants = response?.data || response?.items || [];
  //       this.loadingTenants = false;
  //     },
  //     error: (error) => {
  //       this.loadingTenants = false;
  //       console.error("Failed to load tenants:", error);
  //       this.notificationModal.open({
  //         type: "ERROR",
  //         title: "Failed to load tenants",
  //         message: error,
  //         contentType: "TEXT",
  //         autoCloseAfter: 3000,
  //       });
  //     },
  //   });
  // }
  // =========================================================
  // CREATE
  // =========================================================

  openCreate(): void {
    this.editMode = false;
    this.resetForm();
    this.formOpen = true;
  }

  // =========================================================
  // EDIT
  // =========================================================

  openEdit(user: any): void {
    const userId = user?.user_id || user?.userId;

    if (!userId) {
      this.notificationModal.open({
        type: "WARNING",
        title: "Failed to edit users",
        message: "Invalid user ID",
        contentType: "TEXT",
        autoCloseAfter: 3000,
      });
      return;
    }

    this.editMode = true;
    this.form = {
      userId,
      tenantUuid: this.tenantUuid || "",
      username: user?.username || "",
      email: user?.email || "",
      firstName: user?.first_name || user?.firstName || "",
      middleName: user?.middle_name || user?.middleName || "",
      lastName: user?.last_name || user?.lastName || "",
      displayName: user?.display_name || user?.displayName || "",
      phoneCountryCode:
        user?.phone_country_code || user?.phoneCountryCode || "",
      phoneNumber: user?.phone_number || user?.phoneNumber || "",
      userType: user?.user_type || user?.userType || "USER",
    };

    this.formOpen = true;
  }

  // =========================================================
  // ASSIGN ROLES
  // =========================================================

  openAssignRoles(user: any): void {
    const userId = user?.user_id || user?.userId;

    if (!userId) {
      this.notificationModal.open({
        type: "WARNING",
        title: "Assign roles",
        message: "Invalid user ID",
        contentType: "TEXT",
        autoCloseAfter: 3000,
      });
      return;
    }

    this.assignRolesModal.open(user);
  }

  // =========================================================
  // CLOSE CREATE / EDIT
  // =========================================================

  closeCreate(): void {
    if (this.saving) {
      return;
    }

    this.formOpen = false;
    this.editMode = false;
    this.resetForm();
  }

  // =========================================================
  // SAVE
  // =========================================================

  save(): void {
    if (!this.validateForm()) {
      return;
    }

    this.saving = true;
    const request = {
      tenantUuid: this.tenantUuid || "",
      username: this.form.username.trim(),
      email: this.form.email.trim(),
      firstName: this.form.firstName.trim(),
      middleName: this.form.middleName.trim(),
      lastName: this.form.lastName.trim(),
      displayName: this.form.displayName.trim(),
      phoneCountryCode: this.form.phoneCountryCode.trim(),
      phoneNumber: this.form.phoneNumber.trim(),
      userType: this.form.userType,
    };

    // =======================================================
    // UPDATE
    // =======================================================

    if (this.editMode) {
      const userId = this.form.userId;

      if (!userId) {
        this.saving = false;
        this.ui.show("Invalid user ID");
        return;
      }

      this.userApi.updateUser(userId, request).subscribe({
        next: () => {
          this.saving = false;
          this.formOpen = false;
          this.editMode = false;
          this.resetForm();
          this.notificationModal.open({
            type: "SUCCESS",
            title: "User Updated",
            message: "User updated successfully.",
            contentType: "TEXT",
            autoCloseAfter: 3000,
          });
          this.load();
        },
        error: (error) => {
          this.saving = false;
          console.error("Failed to update user:", error);
          this.notificationModal.open({
            type: "ERROR",
            title: "User Updation Failed",
            message: error,
            contentType: "TEXT",
            autoCloseAfter: 3000,
          });
        },
      });

      return;
    }

    // =======================================================
    // CREATE
    // =======================================================

    this.userApi.createUser(request).subscribe({
      next: () => {
        this.saving = false;
        this.formOpen = false;
        this.resetForm();
        this.notificationModal.open({
          type: "SUCCESS",
          title: "User Created",
          message: "User created successfully.",
          contentType: "TEXT",
          autoCloseAfter: 3000,
        });
        this.load();
      },

      error: (error) => {
        this.saving = false;
        console.error("Failed to create user:", error);
        this.notificationModal.open({
          type: "ERROR",
          title: "User creation Failed",
          message: error,
          contentType: "TEXT",
          autoCloseAfter: 3000,
        });
      },
    });
  }

  // =========================================================
  // SOFT DELETE
  // =========================================================

  deleteUser(user: any): void {
    const userId = user?.user_id || user?.userId;
    if (!userId) {
      this.notificationModal.open({
        type: "WARNING",
        title: "User deletion",
        message: "Invalid user ID",
        contentType: "TEXT",
        autoCloseAfter: 3000,
      });
      return;
    }
    const userName = this.getUserName(user);
    this.pendingDeleteUser = user;

    this.confirmModal.open({
      title: "Delete permission",
      message:
        `Are you sure you want to delete user "${userName}"?\n\n` +
        `The user will be marked as DELETED and will not be physically removed.`,
      confirmText: "Delete",
      cancelText: "Cancel",
    });
  }

  /**
   * Bound to the confirm-modal's (confirmed) output.
   * Runs the actual soft-delete once the user confirms.
   */
  onDeleteUserConfirmed(): void {
    const user = this.pendingDeleteUser;

    this.pendingDeleteUser = null;
    if (!user) {
      return;
    }
    const userId = user?.user_id || user?.userId;

    if (!userId) {
      this.ui.show("Invalid user ID");
      return;
    }

    this.deleting = true;
    this.userApi
      .updateUserStatus(userId, {
        status: "DELETED",
      })
      .subscribe({
        next: () => {
          this.deleting = false;
          this.notificationModal.open({
            type: "SUCCESS",
            title: "User deletion",
            message: "User deleted successfully",
            contentType: "TEXT",
            autoCloseAfter: 3000,
          });
          this.load();
        },
        error: (error) => {
          this.deleting = false;
          console.error("Failed to delete user:", error);
          this.notificationModal.open({
            type: "ERROR",
            title: "User deletion",
            message: "Failed to delete user",
            contentType: "TEXT",
            autoCloseAfter: 3000,
          });
        },
      });
  }

  /**
   * Bound to the confirm-modal's (cancelled) output.
   */
  onDeleteUserCancelled(): void {
    this.pendingDeleteUser = null;
  }

  // =========================================================
  // PAGINATION CONTROLS
  // =========================================================

  goToPage(page: number): void {
    if (
      page < 1 ||
      page > this.totalPages ||
      page === this.page ||
      this.loading
    ) {
      return;
    }
    this.load(page);
  }

  get hasPreviousPage(): boolean {
    return this.page > 1;
  }

  get hasNextPage(): boolean {
    return this.page < this.totalPages;
  }

  get rangeStart(): number {
    return this.totalItems === 0 ? 0 : (this.page - 1) * this.limit + 1;
  }

  get rangeEnd(): number {
    return Math.min(this.page * this.limit, this.totalItems);
  }

  // =========================================================
  // VIEW
  // =========================================================

  select(user: any): void {
    const userId = user?.user_id || user?.userId;

    if (!userId) {
      this.notificationModal.open({
        type: "WARNING",
        title: "User loading",
        message: "Invalid user ID",
        contentType: "TEXT",
        autoCloseAfter: 3000,
      });
      return;
    }

    this.loading = true;

    this.userApi.getUserDetail(userId).subscribe({
      next: (response) => {
        this.selected = response;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        console.error("Failed to load user:", error);
        this.notificationModal.open({
          type: "ERROR",
          title: "User loading",
          message: error,
          contentType: "TEXT",
          autoCloseAfter: 3000,
        });
      },
    });
  }

  // =========================================================
  // CLOSE DETAILS
  // =========================================================

  closeDetails(): void {
    this.selected = null;
  }

  // =========================================================
  // VALIDATION
  // =========================================================

  validateForm(): boolean {
    if (!this.form.username.trim()) {
      this.ui.show("Username is required");
      return false;
    }

    if (!this.form.email.trim()) {
      this.ui.show("Email is required");
      return false;
    }

    if (!this.form.firstName.trim()) {
      this.ui.show("First name is required");
      return false;
    }

    if (!this.form.lastName.trim()) {
      this.ui.show("Last name is required");
      return false;
    }

    if (!this.form.userType) {
      this.ui.show("User type is required");
      return false;
    }

    return true;
  }

  // =========================================================
  // USER NAME
  // =========================================================

  getUserName(user: any): string {
    const firstName = user?.first_name || user?.firstName || "";
    const middleName = user?.middle_name || user?.middleName || "";
    const lastName = user?.last_name || user?.lastName || "";
    const displayName = user?.display_name || user?.displayName || "";
    const fullName = `${firstName} ${middleName} ${lastName}`
      .replace(/\s+/g, " ")
      .trim();

    return displayName || fullName || user?.username || "—";
  }

  // =========================================================
  // USER TYPE
  // =========================================================

  getUserType(user: any): string {
    return user?.user_type || user?.userType || "USER";
  }

  // =========================================================
  // CREATED DATE
  // =========================================================

  getCreatedDate(user: any): string {
    return user?.created_on || user?.createdOn || user?.createdAt || "—";
  }

  // =========================================================
  // RESET FORM
  // =========================================================

  resetForm(): void {
    this.form = {
      userId: null,
      tenantUuid: "",
      username: "",
      email: "",
      firstName: "",
      middleName: "",
      lastName: "",
      displayName: "",
      phoneCountryCode: "",
      phoneNumber: "",
      userType: "USER",
    };
  }

  // =========================================================
  // HTML ESCAPING FOR CELL RENDERERS
  // =========================================================

  private escapeHtml(value: any): string {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
