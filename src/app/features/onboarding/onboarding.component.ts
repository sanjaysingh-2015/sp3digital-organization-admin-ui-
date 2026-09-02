import { Component, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";

import { ApiService } from "../../core/api.service";
import { PageComponent } from "../../shared/page.component";
import { NotificationModalComponent } from "../../shared/components/notification-modal/notification-modal";
import { ORGANIZATION_TYPES } from "../organizations/organizations.component";
import { FACILITY_TYPES } from "../facilities/facilities.component";

/**
 * "Self Registration" — this is the SaaS onboarding wizard from the
 * organization-service Build Plan: once a tenant admin has logged in
 * (via identity-admin-ui — this app never handles credentials), they land
 * here to self-register their OWN organization and first facility, rather
 * than waiting on a platform admin to provision it for them.
 *
 * Note on scope: identity-service currently has no public/anonymous
 * tenant+user signup endpoint (only /auth/login, /auth/token/refresh,
 * /auth/logout and /public/tenants/search are unauthenticated) — so a
 * *fully* anonymous "create my company from scratch" flow isn't possible
 * yet without adding one there. This wizard covers the part organization-
 * admin-ui actually owns: turning an authenticated-but-org-less tenant
 * into a working organization + facility in two steps.
 */
@Component({
  selector: "app-onboarding",
  standalone: true,
  imports: [CommonModule, FormsModule, PageComponent, NotificationModalComponent],
  templateUrl: "./onboarding.component.html",
  styleUrls: ["./onboarding.component.scss"],
})
export class OnboardingComponent {
  organizationTypes = ORGANIZATION_TYPES;
  facilityTypes = FACILITY_TYPES;

  step: 1 | 2 | 3 = 1;
  submitting = false;

  createdOrganizationId: number | null = null;
  createdOrganizationName = "";

  @ViewChild("notificationModal") notificationModal!: NotificationModalComponent;

  orgForm = {
    organizationName: "",
    organizationType: "" as string,
  };

  facilityForm = {
    facilityName: "",
    facilityType: "" as string,
    city: "",
    stateName: "",
  };

  constructor(private api: ApiService, private router: Router) {}

  // ============================================================
  // STEP 1 — ORGANIZATION
  // ============================================================

  submitOrganization(): void {
    if (!this.orgForm.organizationName.trim()) {
      this.notificationModal.open({
        type: "WARNING",
        title: "Organization name required",
        message: "Please enter a name for your organization before continuing.",
        contentType: "TEXT",
        autoCloseAfter: 3000,
      });
      return;
    }

    this.submitting = true;

    this.api
      .post<any>("/organizations", {
        organizationName: this.orgForm.organizationName.trim(),
        organizationType: this.orgForm.organizationType || null,
      })
      .subscribe({
        next: (organization) => {
          this.submitting = false;
          this.createdOrganizationId = organization.organizationId;
          this.createdOrganizationName = organization.organizationName;
          this.step = 2;
        },
        error: (error) => {
          this.submitting = false;
          this.notificationModal.open({
            type: "ERROR",
            title: "Failed to register organization",
            message: error,
            contentType: "TEXT",
            autoCloseAfter: 4000,
          });
        },
      });
  }

  // ============================================================
  // STEP 2 — FIRST FACILITY (optional)
  // ============================================================

  submitFacility(): void {
    if (!this.facilityForm.facilityName.trim()) {
      this.notificationModal.open({
        type: "WARNING",
        title: "Facility name required",
        message: "Please enter a facility name, or choose \"Skip for now\".",
        contentType: "TEXT",
        autoCloseAfter: 3000,
      });
      return;
    }

    this.submitting = true;

    this.api
      .post<any>("/facilities", {
        organizationId: this.createdOrganizationId,
        facilityName: this.facilityForm.facilityName.trim(),
        facilityType: this.facilityForm.facilityType || null,
        city: this.facilityForm.city || null,
        stateName: this.facilityForm.stateName || null,
      })
      .subscribe({
        next: () => {
          this.submitting = false;
          this.step = 3;
        },
        error: (error) => {
          this.submitting = false;
          this.notificationModal.open({
            type: "ERROR",
            title: "Failed to register facility",
            message: error,
            contentType: "TEXT",
            autoCloseAfter: 4000,
          });
        },
      });
  }

  skipFacility(): void {
    this.step = 3;
  }

  goToOrganizations(): void {
    this.router.navigateByUrl("/organizations");
  }

  goToFacilities(): void {
    this.router.navigateByUrl("/facilities");
  }
}
