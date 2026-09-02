import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { forkJoin } from "rxjs";

import { ApiService } from "../../core/api.service";
import { AuthService } from "../../core/auth.service";
import { PageComponent } from "../../shared/page.component";

@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [CommonModule, RouterLink, PageComponent],
  templateUrl: "./dashboard.component.html",
  styleUrls: ["./dashboard.component.scss"],
})
export class DashboardComponent implements OnInit {
  loading = true;

  organizationCount = 0;
  facilityCount = 0;
  departmentCount = 0;
  serviceCount = 0;

  constructor(private api: ApiService, public auth: AuthService) {}

  ngOnInit(): void {
    forkJoin({
      organizations: this.api.get<any>("/organizations/list"),
      facilities: this.api.get<any>("/facilities/list"),
      departments: this.api.get<any>("/departments/list"),
      services: this.api.get<any>("/facility-services/list"),
    }).subscribe({
      next: ({ organizations, facilities, departments, services }) => {
        this.organizationCount = organizations?.count ?? 0;
        this.facilityCount = facilities?.count ?? 0;
        this.departmentCount = departments?.count ?? 0;
        this.serviceCount = services?.count ?? 0;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  get hasNoOrganizations(): boolean {
    return !this.loading && this.organizationCount === 0;
  }
}
