import { Component, inject, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterLink } from "@angular/router";
import { ApiService } from "../../core/api.service";
import { GeoService } from "../../core/geo.service";

import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { finalize } from "rxjs";

import { AuthService } from "../../core/auth.service";
import { HttpParams } from "@angular/common/http";

export interface Country {
  countryId: number;
  isoAlpha2?: string;
  isoAlpha3?: string;
  name?: string;
  status?: string;
}

export interface State {
  countryId: number;
  stateId: number;
  name?: string;
  status?: string;
}

export interface District {
  districtId: number;
  stateId: number;
  name?: string;
  status?: string;
}

export interface SubDistrict {
  districtId: number;
  subDistrictId: number;
  name?: string;
  status?: string;
}

export interface City {
  cityId: number;
  subDistrictId: number;
  name?: string;
  status?: string;
}

export interface PostalCode {
  postalCodeId: number;
  subDistrictId: number;
  code?: string;
  status?: string;
}

// Mirrors ORGANIZATION_TYPES in organization-admin-ui's
// organizations.component.ts and organization-admin-service's
// organization.validation.js — keep all three in sync if this list changes.
export const ORGANIZATION_TYPES = [
  "STATE_HEALTH_DEPT",
  "DISTRICT_HEALTH_AUTHORITY",
  "HEALTH_NETWORK",
  "GOVERNMENT",
  "NGO",
  "PRIVATE_CHAIN",
  "OTHER",
];

/** Group-level validator: confirmPassword must match password. */
function passwordsMatchValidator(
  group: AbstractControl,
): ValidationErrors | null {
  const password = group.get("password")?.value;
  const confirmPassword = group.get("confirmPassword")?.value;

  return password && confirmPassword && password !== confirmPassword
    ? { passwordMismatch: true }
    : null;
}

/**
 * "Create Organization" — public self-service signup, same backend call
 * (POST /public/register-organization) as before, just split into two
 * screens instead of one long form:
 *   Step 1 — Organization Details (incl. address)
 *   Step 2 — Administrator Detail
 * Both steps' values are combined into a single request on final submit;
 * the API itself hasn't changed shape, only how this page collects it.
 */
@Component({
  selector: "app-register-organization",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: "./register-organization.component.html",
  styleUrl: "./register-organization.component.scss",
})
export class RegisterOrganizationComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly geoApi = inject(GeoService);

  organizationTypes = ORGANIZATION_TYPES;
  countries: Country[] = [];
  states: State[] = [];
  districts: District[] = [];
  subDistricts: SubDistrict[] = [];
  cities: City[] = [];
  postalCodes: PostalCode[] = [];

  loadingCountries = false;
  loadingStates = false;
  loadingDistricts = false;
  loadingSubDistricts = false;
  loadingCities = false;
  loadingPostalCodes = false;

  step: 1 | 2 = 1;
  submitting = false;
  errorMessage = "";

  // ============================================================
  // STEP 1 — ORGANIZATION DETAILS (WITH ADDRESS)
  // ============================================================

  orgForm = this.fb.group({
    organizationName: [
      "",
      [Validators.required, Validators.minLength(2), Validators.maxLength(200)],
    ],
    organizationType: ["", Validators.required],

    addressLine1: ["", Validators.maxLength(250)],
    addressLine2: ["", Validators.maxLength(250)],
    cityId: [null, Validators.min(1)],
    subDistrictId: [null, Validators.min(1)],
    districtId: [null, Validators.min(1)],
    stateId: [null, Validators.min(1)],
    countryId: [null, Validators.min(1)],
    postalCodeId: [null, Validators.min(1)],
  });

  // ============================================================
  // STEP 2 — ADMINISTRATOR DETAIL
  // ============================================================

  adminForm = this.fb.group(
    {
      firstName: ["", [Validators.required, Validators.maxLength(100)]],
      lastName: ["", [Validators.required, Validators.maxLength(100)]],
      middleName: ["", Validators.maxLength(100)],
      displayName: ["", Validators.maxLength(250)],

      username: [
        "",
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(100),
        ],
      ],
      email: [
        "",
        [Validators.required, Validators.email, Validators.maxLength(320)],
      ],

      phoneCountryCode: [
        "+91",
        [Validators.required, Validators.maxLength(10)],
      ],
      phoneNumber: ["", [Validators.required, Validators.maxLength(30)]],

      password: [
        "",
        [
          Validators.required,
          Validators.minLength(8),
          Validators.maxLength(256),
        ],
      ],
      confirmPassword: ["", Validators.required],
    },
    { validators: passwordsMatchValidator },
  );

  // ============================================================
  // PAGE LOAD
  // ============================================================
  ngOnInit(): void {
    this.loadCountries();
  }

  loadCountries(): void {
    this.loadingCountries = true;

    this.geoApi.getGeography<any>("/geography/countries").subscribe({
      next: (response) => {
        this.countries = response?.data || response?.items || [];
        this.loadingCountries = false;
      },
      error: (error) => {
        this.loadingCountries = false;
        console.error("Failed to load countries:", error);
      },
    });
  }

  onCountryChange(): void {
    this.loadingStates = true;
    const countryId = this.orgForm.controls.countryId.value;

    if (!countryId) {
      this.states = [];
      return;
    }
    
    this.geoApi.getGeography<any>("/geography/states", { countryId }).subscribe({
      next: (response) => {
        this.states = response?.data || response?.items || [];
        this.loadingStates = false;
      },
      error: (error) => {
        this.loadingStates = false;
        console.error("Failed to load states:", error);
      },
    });
  }

  onStateChange(): void {
    this.loadingDistricts = true;
    const stateId = this.orgForm.controls.stateId.value;

    if (!stateId) {
      this.districts = [];
      return;
    }
    
    this.geoApi.getGeography<any>("/geography/districts", { stateId }).subscribe({
      next: (response) => {
        this.districts = response?.data || response?.items || [];
        this.loadingDistricts = false;
      },
      error: (error) => {
        this.loadingDistricts = false;
        console.error("Failed to load districts:", error);
      },
    });
  }

  onDistrictChange(): void {
    this.loadingSubDistricts = true;
    const districtId = this.orgForm.controls.districtId.value;

    if (!districtId) {
      this.subDistricts = [];
      return;
    }
    
    this.geoApi.getGeography<any>("/geography/sub-districts", { districtId }).subscribe({
      next: (response) => {
        this.subDistricts = response?.data || response?.items || [];
        this.loadingSubDistricts = false;
      },
      error: (error) => {
        this.loadingSubDistricts = false;
        console.error("Failed to load districts:", error);
      },
    });
  }

  onSubDistrictChange(): void {
    this.loadingCities = true;
    const subDistrictId = this.orgForm.controls.subDistrictId.value;

    if (!subDistrictId) {
      this.cities = [];
      return;
    }
    
    this.geoApi.getGeography<any>("/geography/cities", { subDistrictId }).subscribe({
      next: (response) => {
        this.cities = response?.data || response?.items || [];
        this.loadingCities = false;
      },
      error: (error) => {
        this.loadingCities = false;
        console.error("Failed to load cities/villages:", error);
      },
    });
  }

  onCityChange(): void {
    this.loadingPostalCodes = true;
    const cityId = this.orgForm.controls.cityId.value;

    if (!cityId) {
      this.cities = [];
      return;
    }
    
    this.geoApi.getGeography<any>("/geography/postal-codes", { cityId }).subscribe({
      next: (response) => {
        this.postalCodes = response?.data || response?.items || [];
        this.loadingPostalCodes = false;
      },
      error: (error) => {
        this.loadingPostalCodes = false;
        console.error("Failed to load postal codes:", error);
      },
    });
  }
  // ============================================================
  // STEP NAVIGATION
  // ============================================================

  continueToAdministrator(): void {
    if (this.orgForm.invalid) {
      this.orgForm.markAllAsTouched();
      return;
    }

    this.step = 2;
  }

  backToOrganization(): void {
    this.step = 1;
  }

  // ============================================================
  // SUBMIT (end of step 2)
  // ============================================================

  submit(): void {
    this.errorMessage = "";

    if (this.orgForm.invalid) {
      // Shouldn't normally happen (step 1 is validated before advancing),
      // but guards against e.g. a field being cleared out after going back.
      this.step = 1;
      this.orgForm.markAllAsTouched();
      return;
    }

    if (this.adminForm.invalid) {
      this.adminForm.markAllAsTouched();
      return;
    }

    const org = this.orgForm.getRawValue();
    const admin = this.adminForm.getRawValue();

    const request = {
      organizationName: org.organizationName!.trim(),
      organizationType: org.organizationType!,

      addressLine1: org.addressLine1?.trim() || null,
      addressLine2: org.addressLine2?.trim() || null,
      cityId: org.cityId || null,
      subDistrictId: org.subDistrictId || null,
      districtId: org.districtId || null,
      stateId: org.stateId || null,
      countryId: org.countryId || null,
      postalCodeId: org.postalCodeId || null,

      username: admin.username!.trim(),
      email: admin.email!.trim(),
      firstName: admin.firstName!.trim(),
      lastName: admin.lastName!.trim(),
      middleName: admin.middleName?.trim() || "",
      displayName:
        admin.displayName?.trim() ||
        `${admin.firstName} ${admin.lastName}`.trim(),
      phoneCountryCode: admin.phoneCountryCode!.trim(),
      phoneNumber: admin.phoneNumber!.trim(),
      password: admin.password!,
    };

    this.submitting = true;

    this.authService
      .registerOrganization(request)
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: (response) => {
          if (response?.accessToken) {
            // Auto-login, same as a normal /auth/login success.
            localStorage.setItem("tenantUuid", response.tenantUuid);
            this.authService.setToken(response.accessToken);
            this.router.navigate(["/dashboard"]);
            return;
          }

          // Tenant's security policy required MFA ({ mfaRequired: true, ... }).
          // This app doesn't have an MFA-challenge screen wired up yet, so
          // send them to sign in normally rather than getting stuck here —
          // the organization itself was still created successfully.
          this.router.navigate(["/login"], {
            queryParams: { organizationCreated: "1" },
          });
        },
        error: (error) => {
          console.error("Organization registration failed:", error);
          this.errorMessage =
            error?.error?.error?.message ??
            error?.error?.message ??
            "Could not create the organization. Please check the details and try again.";
        },
      });
  }
}
