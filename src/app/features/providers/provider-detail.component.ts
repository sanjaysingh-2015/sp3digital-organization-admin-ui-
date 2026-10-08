import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { OrgDirectoryService } from '../../core/org-directory.service';
import { ProviderApiService } from '../../core/provider-api.service';
import { PROVIDER_PERMISSIONS } from '../../core/provider-permissions';
import { UiService } from '../../core/ui.service';
import { PageComponent } from '../../shared/page.component';
import { ConfirmModalComponent } from '../../shared/components/confirm-modal/confirm-modal';
import { NotificationModalComponent } from '../../shared/components/notification-modal/notification-modal';
import { AffiliationFieldsComponent } from './affiliation-fields.component';
import {
  AffiliationModel,
  AVAILABILITY_TYPES,
  DOCUMENT_TYPES,
  EMPLOYMENT_TYPES,
  GENDERS,
  PROVIDER_TYPES,
  SPECIALTY_LEVELS,
  SYSTEMS_OF_MEDICINE,
  affiliationFromApi,
  affiliationPayload,
  availabilityLabel,
  labelOf,
  newAffiliation,
  validateAffiliation,
} from './provider-model';

type PendingAction =
  | { kind: 'status'; status: string }
  | { kind: 'affiliationStatus'; affiliation: any; status: string };

@Component({
  selector: 'app-provider-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageComponent, ConfirmModalComponent, NotificationModalComponent, AffiliationFieldsComponent],
  templateUrl: './provider-detail.component.html',
  styleUrls: ['./provider-detail.component.scss'],
})
export class ProviderDetailComponent implements OnInit {
  provider: any = null;
  loading = true;
  busy = false;

  organizationNames = new Map<number, string>();
  facilityNames = new Map<number, string>();
  facilityServiceNames = new Map<number, string>();

  // affiliation modal
  affiliationFormOpen = false;
  affiliationModel: AffiliationModel = newAffiliation();

  // verify modal
  verifyOpen = false;
  verifyDecision: 'VERIFIED' | 'REJECTED' | 'PENDING' = 'VERIFIED';
  verifyRemarks = '';

  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;
  @ViewChild('notificationModal') notificationModal!: NotificationModalComponent;
  private pending: PendingAction | null = null;

  constructor(
    private api: ProviderApiService,
    private directory: OrgDirectoryService,
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
    private ui: UiService,
  ) {}

  get canUpdate(): boolean { return this.auth.hasPermission(PROVIDER_PERMISSIONS.UPDATE); }
  get canCreate(): boolean { return this.auth.hasPermission(PROVIDER_PERMISSIONS.CREATE); }
  get isDeleted(): boolean { return this.provider?.status === 'DELETED'; }

  ngOnInit(): void {
    this.directory.organizations().subscribe((rows) => rows.forEach((o) => this.organizationNames.set(o.organizationId, o.organizationName)));
    this.directory.facilities().subscribe((rows) => rows.forEach((f) => this.facilityNames.set(f.facilityId, f.facilityName)));
    this.load();
  }

  load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.loading = true;
    this.api.get<any>(`/providers/${id}`).subscribe({
      next: (provider) => {
        this.provider = provider;
        this.loading = false;
        this.resolveServiceNames();
      },
      error: (error) => {
        this.loading = false;
        this.notificationModal.open({ type: 'ERROR', title: 'Failed to load doctor', message: error, contentType: 'TEXT', autoCloseAfter: 4000 });
      },
    });
  }

  /** Affiliations only carry facility-service ids; look the names up once per facility. */
  private resolveServiceNames(): void {
    const facilityIds = [...new Set<number>((this.provider?.affiliations || []).filter((a: any) => a.facilityId && a.facilityServiceIds?.length).map((a: any) => a.facilityId))];
    if (!facilityIds.length) return;
    forkJoin(facilityIds.map((id) => this.directory.facilityServices(id))).subscribe((lists) => {
      lists.flat().forEach((s: any) => this.facilityServiceNames.set(s.facilityServiceId, s.serviceName));
    });
  }

  // ---- display helpers -----------------------------------------------------
  typeLabel(value: string) { return labelOf(PROVIDER_TYPES, value); }
  systemLabel(value: string) { return labelOf(SYSTEMS_OF_MEDICINE, value); }
  genderLabel(value: string) { return labelOf(GENDERS, value); }
  specialtyLevelLabel(value: string) { return labelOf(SPECIALTY_LEVELS, value); }
  documentTypeLabel(value: string) { return labelOf(DOCUMENT_TYPES, value); }
  employmentLabel(value: string) { return labelOf(EMPLOYMENT_TYPES, value); }
  availability(a: any) { return availabilityLabel(a); }
  availabilityClass(a: any) { return 'chip chip--' + String(a.availabilityType).toLowerCase(); }
  orgName(id: number) { return this.organizationNames.get(id) || `Organization #${id}`; }
  facilityName(id: number | null) { return id ? this.facilityNames.get(id) || `Facility #${id}` : 'Whole organization'; }
  serviceNames(a: any): string { return (a.facilityServiceIds || []).map((id: number) => this.facilityServiceNames.get(id) || `#${id}`).join(', '); }
  statusClass(status: string): string {
    return { ACTIVE: 'good', VERIFIED: 'good', SUSPENDED: 'warning', PENDING: 'warning', INACTIVE: 'danger', DELETED: 'danger', REJECTED: 'danger', ENDED: 'danger' }[status] || '';
  }
  /** Whether this placement can be given slot rules, and if not, what is missing. */
  bookable(a: any): { ok: boolean; text: string } {
    const p = this.provider;
    if (p.status !== 'ACTIVE') return { ok: false, text: `Doctor is ${String(p.status).toLowerCase()} — no slots` };
    if (p.verificationStatus !== 'VERIFIED') return { ok: false, text: 'Verify the doctor to allow slots' };
    if (a.status !== 'ACTIVE') return { ok: false, text: 'Placement is not active — no slots' };
    if (a.availabilityType === 'OTHER') return { ok: false, text: 'On-demand style availability — no fixed slots' };
    if (!a.facilityId) return { ok: false, text: 'Place the doctor at a facility to allow slots' };
    if (!a.facilityServiceIds?.length) return { ok: false, text: 'Add the services this doctor delivers to allow slots' };
    const n = a.facilityServiceIds.length;
    return { ok: true, text: `Can be given slots for ${n} service${n === 1 ? '' : 's'}` };
  }

  get phone(): string { return [this.provider?.phoneCountryCode, this.provider?.phoneNumber].filter(Boolean).join(' '); }
  get address(): string {
    const p = this.provider;
    return [p?.addressLine1, p?.addressLine2, p?.city, p?.districtName, p?.stateName, p?.postalCode, p?.countryName].filter(Boolean).join(', ');
  }
  get languages(): string { return (this.provider?.languages || []).map((l: any) => l.languageName).join(', '); }
  get activeAffiliations(): any[] { return (this.provider?.affiliations || []).filter((a: any) => a.status !== 'ENDED'); }
  get endedAffiliations(): any[] { return (this.provider?.affiliations || []).filter((a: any) => a.status === 'ENDED'); }

  // ---- affiliation add / edit ---------------------------------------------
  openAddAffiliation(): void {
    this.affiliationModel = newAffiliation();
    this.affiliationFormOpen = true;
  }

  openEditAffiliation(a: any): void {
    this.affiliationModel = affiliationFromApi(a);
    this.affiliationFormOpen = true;
  }

  closeAffiliationForm(): void { this.affiliationFormOpen = false; }

  saveAffiliation(): void {
    const problem = validateAffiliation(this.affiliationModel);
    if (problem) {
      this.ui.show(problem);
      return;
    }
    this.busy = true;
    const payload = affiliationPayload(this.affiliationModel);
    const id = this.affiliationModel.affiliationId;
    const request = id
      ? this.api.patch<any>(`/affiliations/${id}`, payload)
      : this.api.post<any>(`/providers/${this.provider.providerId}/affiliations`, payload);

    request.subscribe({
      next: () => {
        this.busy = false;
        this.affiliationFormOpen = false;
        this.ui.show(id ? 'Affiliation updated' : 'Affiliation added');
        this.load();
      },
      error: (error) => {
        this.busy = false;
        this.notificationModal.open({ type: 'ERROR', title: id ? 'Failed to update affiliation' : 'Failed to add affiliation', message: error, contentType: 'TEXT', autoCloseAfter: 6000 });
      },
    });
  }

  // ---- status / verification ------------------------------------------------
  askProviderStatus(status: string): void {
    this.pending = { kind: 'status', status };
    const verb = { ACTIVE: 'Activate', INACTIVE: 'Deactivate', SUSPENDED: 'Suspend', DELETED: 'Delete' }[status] || status;
    this.confirmModal.open({
      title: `${verb} doctor`,
      message: `${verb} ${this.provider.displayName}?` + (status === 'DELETED' ? '\n\nThe doctor is marked DELETED and hidden from lists; nothing is physically removed.' : ''),
      confirmText: verb,
      cancelText: 'Cancel',
    });
  }

  askAffiliationStatus(affiliation: any, status: string): void {
    this.pending = { kind: 'affiliationStatus', affiliation, status };
    const verb = { ACTIVE: 'Re-activate', INACTIVE: 'Pause', SUSPENDED: 'Suspend', ENDED: 'End' }[status] || status;
    this.confirmModal.open({
      title: `${verb} affiliation`,
      message: `${verb} ${this.availability(affiliation)} availability at ${this.facilityName(affiliation.facilityId)} (${this.orgName(affiliation.organizationId)})?`,
      confirmText: verb,
      cancelText: 'Cancel',
    });
  }

  onConfirmed(): void {
    const action = this.pending;
    this.pending = null;
    if (!action) return;
    const request =
      action.kind === 'status'
        ? this.api.patch<any>(`/providers/${this.provider.providerId}/status`, { status: action.status })
        : this.api.patch<any>(`/affiliations/${action.affiliation.affiliationId}/status`, { status: action.status });
    this.busy = true;
    request.subscribe({
      next: () => {
        this.busy = false;
        this.ui.show('Updated');
        this.load();
      },
      error: (error) => {
        this.busy = false;
        this.notificationModal.open({ type: 'ERROR', title: 'Update failed', message: error, contentType: 'TEXT', autoCloseAfter: 5000 });
      },
    });
  }

  onCancelled(): void { this.pending = null; }

  openVerify(decision: 'VERIFIED' | 'REJECTED' | 'PENDING'): void {
    this.verifyDecision = decision;
    this.verifyRemarks = this.provider.verificationRemarks || '';
    this.verifyOpen = true;
  }

  submitVerify(): void {
    this.busy = true;
    this.api.post<any>(`/providers/${this.provider.providerId}/verify`, { verificationStatus: this.verifyDecision, remarks: this.verifyRemarks.trim() || null }).subscribe({
      next: () => {
        this.busy = false;
        this.verifyOpen = false;
        this.ui.show(`Marked ${this.verifyDecision.toLowerCase()}`);
        this.load();
      },
      error: (error) => {
        this.busy = false;
        this.notificationModal.open({ type: 'ERROR', title: 'Verification failed', message: error, contentType: 'TEXT', autoCloseAfter: 5000 });
      },
    });
  }

  back(): void { this.router.navigate(['/providers']); }
}
