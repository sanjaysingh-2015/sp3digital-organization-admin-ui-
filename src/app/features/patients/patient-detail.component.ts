import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { OrgDirectoryService } from '../../core/org-directory.service';
import { PatientApiService } from '../../core/patient-api.service';
import { PATIENT_PERMISSIONS } from '../../core/patient-permissions';
import { UiService } from '../../core/ui.service';
import { PageComponent } from '../../shared/page.component';
import { ConfirmModalComponent } from '../../shared/components/confirm-modal/confirm-modal';
import { NotificationModalComponent } from '../../shared/components/notification-modal/notification-modal';
import { PatientPickerComponent } from './patient-picker.component';
import { GENDERS, labelOf } from './patient-model';

@Component({
  selector: 'app-patient-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageComponent, ConfirmModalComponent, NotificationModalComponent, PatientPickerComponent],
  templateUrl: './patient-detail.component.html',
  styleUrls: ['./patient-detail.component.scss'],
})
export class PatientDetailComponent implements OnInit {
  patient: any = null;
  loading = true;
  busy = false;

  facilityNames = new Map<number, string>();
  facilities: any[] = [];

  // issue a number at another facility
  newNumberFacilityId: number | null = null;

  // merge a duplicate into this patient
  mergeOpen = false;
  mergeSource: any | null = null;
  mergeReason = '';

  // access log (needs the audit permission)
  audit: any[] = [];
  auditPage = 1;
  auditTotalPages = 1;
  auditLoading = false;

  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;
  @ViewChild('notificationModal') notificationModal!: NotificationModalComponent;
  private pendingStatus: string | null = null;

  constructor(
    private api: PatientApiService,
    private directory: OrgDirectoryService,
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
    private ui: UiService,
  ) {}

  get canUpdate(): boolean { return this.auth.hasPermission(PATIENT_PERMISSIONS.UPDATE); }
  get canMerge(): boolean { return this.auth.hasPermission(PATIENT_PERMISSIONS.MERGE); }
  get canAudit(): boolean { return this.auth.hasPermission(PATIENT_PERMISSIONS.AUDIT); }
  get editable(): boolean { return !!this.patient && !['DELETED', 'MERGED', 'ANONYMIZED'].includes(this.patient.status); }

  ngOnInit(): void {
    this.directory.facilities().subscribe((rows) => {
      this.facilities = rows;
      rows.forEach((f) => this.facilityNames.set(f.facilityId, f.facilityName));
    });
    this.load();
  }

  load(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.loading = true;
    this.api.get<any>(`/patients/${id}`).subscribe({
      next: (patient) => {
        this.patient = patient;
        this.loading = false;
        if (this.canAudit) this.loadAudit(1);
      },
      error: (error) => {
        this.loading = false;
        this.notificationModal.open({ type: 'ERROR', title: 'Failed to load patient', message: error, contentType: 'TEXT', autoCloseAfter: 4000 });
      },
    });
  }

  // ---- display helpers -------------------------------------------------------------
  genderLabel(value: string) { return labelOf(GENDERS, value); }
  facilityName(id: number) { return this.facilityNames.get(id) || `Facility #${id}`; }
  statusClass(status: string): string {
    return { ACTIVE: 'good', INACTIVE: 'warning', MERGED: 'warning', DELETED: 'danger', ANONYMIZED: 'danger' }[status] || '';
  }
  get phone(): string { return [this.patient?.phoneCountryCode, this.patient?.phoneNumber].filter(Boolean).join(' '); }
  get address(): string {
    const p = this.patient;
    return [p?.addressLine1, p?.addressLine2, p?.city, p?.subDistrictName, p?.districtName, p?.stateName, p?.postalCode, p?.countryName].filter(Boolean).join(', ');
  }
  /** Facilities that have not issued this patient a number yet. */
  get facilitiesWithoutNumber(): any[] {
    const have = new Set((this.patient?.facilityNumbers || []).map((n: any) => n.facilityId));
    return this.facilities.filter((f) => !have.has(f.facilityId));
  }

  // ---- number at another facility --------------------------------------------------
  issueNumber(): void {
    if (!this.newNumberFacilityId) return;
    this.busy = true;
    this.api.post<any>(`/patients/${this.patient.patientId}/facility-numbers`, { facilityId: this.newNumberFacilityId }).subscribe({
      next: (patient) => {
        this.busy = false;
        this.patient = patient;
        this.newNumberFacilityId = null;
        this.ui.show('Patient number issued');
        if (this.canAudit) this.loadAudit(1);
      },
      error: (error) => {
        this.busy = false;
        this.notificationModal.open({ type: 'ERROR', title: 'Could not issue a number', message: error, contentType: 'TEXT', autoCloseAfter: 5000 });
      },
    });
  }

  // ---- status ------------------------------------------------------------------------
  askStatus(status: string): void {
    this.pendingStatus = status;
    const verb = { ACTIVE: 'Activate', INACTIVE: 'Deactivate', DELETED: 'Delete' }[status] || status;
    const note = status === 'ACTIVE' ? '' : '\n\nThe record is kept for the retention period, then its personal details are anonymized.';
    this.confirmModal.open({ title: `${verb} patient`, message: `${verb} ${this.patient.displayName}?${note}`, confirmText: verb, cancelText: 'Cancel' });
  }

  onConfirmed(): void {
    const status = this.pendingStatus;
    this.pendingStatus = null;
    if (!status) return;
    this.busy = true;
    this.api.patch<any>(`/patients/${this.patient.patientId}/status`, { status }).subscribe({
      next: (patient) => {
        this.busy = false;
        this.patient = patient;
        this.ui.show('Updated');
        if (this.canAudit) this.loadAudit(1);
      },
      error: (error) => {
        this.busy = false;
        this.notificationModal.open({ type: 'ERROR', title: 'Update failed', message: error, contentType: 'TEXT', autoCloseAfter: 5000 });
      },
    });
  }

  onCancelled(): void { this.pendingStatus = null; }

  // ---- merge -------------------------------------------------------------------------
  openMerge(): void {
    this.mergeSource = null;
    this.mergeReason = '';
    this.mergeOpen = true;
  }

  submitMerge(): void {
    if (!this.mergeSource) return;
    this.busy = true;
    this.api
      .post<any>(`/patients/${this.patient.patientId}/merge`, { sourcePatientId: this.mergeSource.patientId, reason: this.mergeReason.trim() || null })
      .subscribe({
        next: (patient) => {
          this.busy = false;
          this.mergeOpen = false;
          this.patient = patient;
          this.ui.show('Duplicate merged into this patient');
          if (this.canAudit) this.loadAudit(1);
        },
        error: (error) => {
          this.busy = false;
          this.notificationModal.open({ type: 'ERROR', title: 'Merge failed', message: error, contentType: 'TEXT', autoCloseAfter: 5000 });
        },
      });
  }

  // ---- access log --------------------------------------------------------------------
  loadAudit(page: number): void {
    this.auditLoading = true;
    this.api.get<any>(`/patients/${this.patient.patientId}/audit`, { page, limit: 8 }).subscribe({
      next: (response) => {
        this.audit = response?.data || [];
        this.auditPage = response?.pagination?.page ?? page;
        this.auditTotalPages = response?.pagination?.totalPages ?? 1;
        this.auditLoading = false;
      },
      error: () => {
        this.audit = [];
        this.auditLoading = false;
      },
    });
  }

  back(): void { this.router.navigate(['/patients']); }
}
