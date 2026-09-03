import { Component, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { forkJoin, of, Observable } from "rxjs";

import { ApiService } from "../../../core/api.service";
import { UiService } from "../../../core/ui.service";
import { NotificationModalComponent } from "../../../shared/components/notification-modal/notification-modal";
/**
 * AssignRolesModalComponent
 * ---------------------------------------------------------
 * Reusable "many-to-many" assignment dialog that lets an admin
 * assign / revoke roles for a single user.
 *
 * Rows are now multi-select checkboxes. Nothing hits the network
 * until "Save changes" is pressed - at that point the diff between
 * what was originally assigned and what's currently checked is
 * sent as a single batched request per direction:
 *
 *   POST  /users/:userId/roles                 { roleIds: [...] }      (assign, batched)
 *   PATCH /users/:userId/roles/:userRoleId      { status: 'INACTIVE' } (revoke, one call per row, fired in parallel)
 *
 * NOTE: the assign endpoint's body changed from a single `roleId`
 * to a `roleIds` array - the backend needs to accept that array
 * (mirrors the pattern already used by the permissions endpoint).
 * The revoke endpoint is unchanged; we just fire several of them
 * at once via forkJoin so the whole save feels like one action.
 *
 * Usage (from a parent component):
 *
 *   <app-assign-roles-modal #assignRolesModal></app-assign-roles-modal>
 *
 *   @ViewChild('assignRolesModal') assignRolesModal!: AssignRolesModalComponent;
 *   openAssignRoles(user) { this.assignRolesModal.open(user); }
 */
@Component({
  selector: "app-assign-roles-modal",
  standalone: true,
  imports: [CommonModule, FormsModule, NotificationModalComponent],
  templateUrl: "./assign-roles-modal.html",
  styleUrls: ["./assign-roles-modal.css"],
})
export class AssignRolesModalComponent {
  visible = false;

  user: any = null;

  search = "";

  loading = false;
  saving = false;

  allRoles: any[] = [];

  // roleId -> userRoleId, for roles ORIGINALLY (effectively) assigned to the user.
  // This is our source of truth for computing the save diff.
  private assignedMap: Record<string, number | string> = {};

  // roleIds currently checked in the UI. Seeded from assignedMap on load,
  // then mutated locally as the admin (un)checks rows. Nothing is sent to
  // the server until save() is called.
  private selectedIds = new Set<string>();

  // =========================================================
  // NOTIFICATION MODAL
  // =========================================================

  @ViewChild("notificationModal")
  notificationModal!: NotificationModalComponent;

  constructor(
    private api: ApiService,
    private ui: UiService,
  ) {}

  // =========================================================
  // OPEN / CLOSE
  // =========================================================

  open(user: any): void {
    const userId = user?.user_id || user?.userId;

    if (!userId) {
      this.notificationModal.open({
        type: "ERROR",
        title: "Failed to load roles",
        message: "Invalid user ID",
        contentType: "TEXT",
        autoCloseAfter: 3000,
      });
      return;
    }

    this.user = user;
    this.search = "";
    this.assignedMap = {};
    this.selectedIds = new Set();
    this.visible = true;

    this.loadRoles();
    this.loadAssignments();
  }

  close(): void {
    if (this.saving) {
      return;
    }
    this.visible = false;
    this.user = null;
  }

  // =========================================================
  // DATA LOADING
  // =========================================================

  private loadRoles(): void {
    this.loading = true;

    this.api
      .get<any>("/authorization/roles", { page: 1, limit: 200 })
      .subscribe({
        next: (response) => {
          const rows =
            response?.data?.items ||
            response?.items ||
            response?.data ||
            response?.rows ||
            [];

          this.allRoles = rows.filter(
            (role: any) => (role?.status || "ACTIVE") === "ACTIVE",
          );
          this.loading = false;
        },
        error: (error) => {
          this.loading = false;
          console.error("Failed to load roles:", error);
          this.notificationModal.open({
            type: "ERROR",
            title: "Failed to load roles",
            message: "Failed to load roles",
            contentType: "TEXT",
            autoCloseAfter: 3000,
          });
        },
      });
  }

  private loadAssignments(): void {
    const userId = this.getUserId();
    if (!userId) {
      return;
    }

    this.api.get<any>(`/users/${userId}/roles`).subscribe({
      next: (response) => {
        const items =
          response?.items || response?.data?.items || response?.data || [];

        const map: Record<string, number | string> = {};
        items.forEach((assignment: any) => {
          const roleId = assignment?.roleId ?? assignment?.role_id;
          const userRoleId = assignment?.userRoleId ?? assignment?.user_role_id;
          if (
            roleId !== undefined &&
            roleId !== null &&
            userRoleId !== undefined
          ) {
            map[String(roleId)] = userRoleId;
          }
        });
        this.assignedMap = map;
        // Seed the checkbox selection with whatever is currently assigned.
        this.selectedIds = new Set(Object.keys(map));
      },
      error: (error) => {
        console.error("Failed to load assigned roles:", error);
        this.notificationModal.open({
          type: "ERROR",
          title: "Failed to load roles",
          message: "Failed to load assigned roles",
          contentType: "TEXT",
          autoCloseAfter: 3000,
        });
      },
    });
  }

  // =========================================================
  // SELECTION (local only, no network calls)
  // =========================================================

  isSelected(role: any): boolean {
    const roleId = role?.role_id ?? role?.roleId;
    return roleId !== undefined && this.selectedIds.has(String(roleId));
  }

  private isOriginallyAssigned(role: any): boolean {
    const roleId = role?.role_id ?? role?.roleId;
    return (
      roleId !== undefined && this.assignedMap[String(roleId)] !== undefined
    );
  }

  /** Visual state of a row relative to the original assignment, for highlighting. */
  rowState(role: any): "added" | "removed" | "unchanged" {
    const selected = this.isSelected(role);
    const wasAssigned = this.isOriginallyAssigned(role);
    if (selected && !wasAssigned) {
      return "added";
    }
    if (!selected && wasAssigned) {
      return "removed";
    }
    return "unchanged";
  }

  toggleSelection(role: any): void {
    if (this.saving) {
      return;
    }
    const roleId = role?.role_id ?? role?.roleId;
    if (roleId === undefined || roleId === null) {
      return;
    }
    const key = String(roleId);
    if (this.selectedIds.has(key)) {
      this.selectedIds.delete(key);
    } else {
      this.selectedIds.add(key);
    }
  }

  get hasChanges(): boolean {
    const originalKeys = Object.keys(this.assignedMap);
    if (originalKeys.length !== this.selectedIds.size) {
      return true;
    }
    return originalKeys.some((key) => !this.selectedIds.has(key));
  }

  get pendingAddCount(): number {
    let count = 0;
    this.selectedIds.forEach((id) => {
      if (this.assignedMap[id] === undefined) {
        count++;
      }
    });
    return count;
  }

  get pendingRemoveCount(): number {
    return Object.keys(this.assignedMap).filter(
      (id) => !this.selectedIds.has(id),
    ).length;
  }

  // =========================================================
  // SAVE (batched)
  // =========================================================

  save(): void {
    const userId = this.getUserId();
    if (!userId || this.saving || !this.hasChanges) {
      return;
    }

    const toAssign: (number | string)[] = [];
    this.selectedIds.forEach((id) => {
      if (this.assignedMap[id] === undefined) {
        toAssign.push(id);
      }
    });

    const toRevokeUserRoleIds: (number | string)[] = Object.keys(
      this.assignedMap,
    )
      .filter((id) => !this.selectedIds.has(id))
      .map((id) => this.assignedMap[id]);

    this.saving = true;

    const requests: Observable<any>[] = [];

    if (toAssign.length) {
      // Single batched call - all newly-checked roles assigned at once.
      requests.push(
        this.api.post<any>(`/users/${userId}/roles`, { roleIds: toAssign }),
      );
    }

    toRevokeUserRoleIds.forEach((userRoleId) => {
      requests.push(
        this.api.patch<any>(`/users/${userId}/roles/${userRoleId}`, {
          status: "INACTIVE",
        }),
      );
    });

    forkJoin(requests.length ? requests : [of(null)]).subscribe({
      next: () => {
        this.saving = false;
        const message = `Roles updated for ${this.getUserLabel()}`;
        this.notificationModal.open({
          type: "SUCCESS",
          title: "Role Assignment",
          message: message,
          contentType: "TEXT",
          autoCloseAfter: 3000,
        });
        this.close();
      },
      error: (error) => {
        this.saving = false;
        console.error("Failed to save role assignments:", error);
        this.notificationModal.open({
          type: "ERROR",
          title: "Failed to save roles",
          message: "Failed to save role assignments",
          contentType: "TEXT",
          autoCloseAfter: 3000,
        });
        // Re-sync with the server so the checkboxes reflect what actually
        // stuck, in case only some of the batched requests failed.
        this.loadAssignments();
      },
    });
  }

  // =========================================================
  // FILTERING
  // =========================================================

  get filteredRoles(): any[] {
    const term = this.search.trim().toLowerCase();
    if (!term) {
      return this.allRoles;
    }
    return this.allRoles.filter((role) => {
      const name = (role?.role_name || role?.roleName || "").toLowerCase();
      const type = (role?.role_type || role?.roleType || "").toLowerCase();
      return name.includes(term) || type.includes(term);
    });
  }

  // =========================================================
  // HELPERS
  // =========================================================

  private getUserId(): number | string | null {
    return this.user?.user_id || this.user?.userId || null;
  }

  getUserLabel(): string {
    if (!this.user) {
      return "user";
    }
    const displayName = this.user?.display_name || this.user?.displayName;
    const first = this.user?.first_name || this.user?.firstName || "";
    const last = this.user?.last_name || this.user?.lastName || "";
    const fullName = `${first} ${last}`.trim();
    return displayName || fullName || this.user?.username || "this user";
  }

  getRoleName(role: any): string {
    return role?.role_name || role?.roleName || "—";
  }

  formatRoleType(roleType: string | null | undefined): string {
    if (!roleType) {
      return "—";
    }
    return roleType
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
