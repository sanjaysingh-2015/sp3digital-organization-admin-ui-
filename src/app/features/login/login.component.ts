import { Component, OnInit, inject } from "@angular/core";
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from "@angular/forms";

import {
  debounceTime,
  distinctUntilChanged,
  filter,
  switchMap,
  catchError,
  finalize,
  of,
} from "rxjs";

import { AuthService, Tenant } from "../../core/auth.service";
import { ORGANIZATION_TYPES } from "../organizations/organizations.component";

function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get("password")?.value;
  const confirmPassword = control.get("confirmPassword")?.value;

  return password && confirmPassword && password !== confirmPassword
    ? { passwordMismatch: true }
    : null;
}

@Component({
  selector: "app-login",
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: "./login.component.html",
  styleUrl: "./login.component.scss",
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  mode: "login" | "register" = "login";

  organizationTypes = ORGANIZATION_TYPES;

  loading = false;
  tenantLoading = false;

  tenants: Tenant[] = [];
  showTenantList = false;
  errorMessage = "";

  registerLoading = false;
  registerError = "";
  registerSuccess = false;

  loginForm = this.fb.group({
    usernameOrEmail: ["", Validators.required],

    password: ["", Validators.required],

    tenant: ["", Validators.required],

    tenantUuid: ["", Validators.required],
  });

  registerForm = this.fb.group({
    organizationName: ["", Validators.required],
    organizationType: ["", Validators.required],

    firstName: ["", Validators.required],
    lastName: ["", Validators.required],
    middleName: [""],
    username: ["", [Validators.required, Validators.minLength(3)]],
    email: ["", [Validators.required, Validators.email]],
    phoneCountryCode: ["+91", Validators.required],
    phoneNumber: ["", Validators.required],

    password: ["", [Validators.required, Validators.minLength(8)]],
    confirmPassword: ["", Validators.required],
  }, { validators: passwordsMatchValidator });

  ngOnInit(): void {
    this.loginForm.controls.tenant.valueChanges
      .pipe(
        debounceTime(400),

        distinctUntilChanged(),

        filter((value) => (value ?? "").trim().length >= 5),

        switchMap((value) => {
          const searchValue = (value ?? "").trim();

          this.tenantLoading = true;

          return this.authService.searchTenants(searchValue).pipe(
            catchError((error) => {
              console.error("Tenant search failed:", error);

              this.tenants = [];
              this.showTenantList = false;

              return of({
                success: false,
                count: 0,
                data: [],
              });
            }),

            finalize(() => {
              this.tenantLoading = false;
            }),
          );
        }),
      )

      .subscribe({
        next: (response) => {
          this.tenants = response.data || [];

          this.showTenantList = this.tenants.length > 0;
        },
      });
  }

  switchMode(mode: "login" | "register"): void {
    this.mode = mode;
    this.errorMessage = "";
    this.registerError = "";
    this.registerSuccess = false;
  }

  selectTenant(tenant: Tenant): void {
    this.loginForm.patchValue({
      tenant: `${tenant.tenantName} (${tenant.tenantCode})`,
      tenantUuid: tenant.tenantUuid,
    });
    this.showTenantList = false;
  }

  login(): void {
    this.errorMessage = "";

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();

      return;
    }

    const { usernameOrEmail, password, tenantUuid } =
      this.loginForm.getRawValue();

    const request = {
      usernameOrEmail: usernameOrEmail!,
      password: password!,
      tenantUuid: tenantUuid!,
    };

    this.loading = true;
    this.authService
      .login(request)
      .pipe(
        finalize(() => {
          this.loading = false;
        }),
      )
      .subscribe({
        next: (response) => {
          localStorage.setItem("tenantUuid", tenantUuid!)
          this.authService.setToken(response.accessToken);

          this.router.navigate(['/dashboard']);
        },

        error: (error) => {
          console.error("Login failed:", error);

          this.errorMessage =
            error?.error?.error?.message ??
            "Invalid username, password or tenant.";
        },
      });
  }

  register(): void {
    this.registerError = "";
    this.registerSuccess = false;

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();

      if (this.registerForm.errors?.["passwordMismatch"]) {
        this.registerError = "Passwords do not match.";
      }

      return;
    }

    const raw = this.registerForm.getRawValue();

    const request = {
      organizationName: raw.organizationName!,
      organizationType: raw.organizationType!,
      parentOrganizationId: null,

      username: raw.username!,
      email: raw.email!,
      firstName: raw.firstName!,
      lastName: raw.lastName!,
      middleName: raw.middleName || "",
      displayName: `${raw.firstName} ${raw.lastName}`.trim(),
      phoneCountryCode: raw.phoneCountryCode!,
      phoneNumber: raw.phoneNumber!,

      password: raw.password!,
    };

    this.registerLoading = true;
    this.authService
      .registerOrganization(request)
      .pipe(
        finalize(() => {
          this.registerLoading = false;
        }),
      )
      .subscribe({
        next: (response) => {
          if (response?.accessToken) {
            // Auto-signed-in: the new user lands straight on the dashboard.
            if (response.tenantUuid) {
              localStorage.setItem("tenantUuid", response.tenantUuid);
            }
            this.authService.setToken(response.accessToken);
            this.router.navigate(["/dashboard"]);
            return;
          }

          // Fallback if the backend doesn't auto-issue tokens: prompt the
          // user to sign in with the credentials they just created.
          this.registerSuccess = true;
          this.registerForm.reset({ phoneCountryCode: "+91" });
        },

        error: (error) => {
          console.error("Registration failed:", error);

          this.registerError =
            error?.error?.error?.message ??
            "Could not create your organization. Please check the details and try again.";
        },
      });
  }
}
