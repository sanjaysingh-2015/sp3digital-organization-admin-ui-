import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { OrgDirectoryService } from '../../core/org-directory.service';
import { PatientApiService } from '../../core/patient-api.service';
import { UiService } from '../../core/ui.service';
import { PageComponent } from '../../shared/page.component';
import { NotificationModalComponent } from '../../shared/components/notification-modal/notification-modal';
import { GeoAddressComponent, emptyGeoLabels } from '../providers/geo-address.component';
import { PatientPickerComponent } from './patient-picker.component';
import { GENDERS, MINOR_AGE_YEARS, RELATIONSHIPS, USERNAME_PATTERN, ageFromDob, labelOf, suggestUsername } from './patient-model';

const text = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);
const digits = (value: string) => value.replace(/\D/g, '');

@Component({
  selector: 'app-patient-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageComponent, NotificationModalComponent, GeoAddressComponent, PatientPickerComponent],
  templateUrl: './patient-form.component.html',
  styleUrls: ['./patient-form.component.scss'],
})
export class PatientFormComponent implements OnInit {
  readonly genders = GENDERS;
  readonly relationships = RELATIONSHIPS;
  readonly minorAge = MINOR_AGE_YEARS;

  readonly steps = [
    { key: 'identity', label: 'Identity', hint: 'Name, age, facility' },
    { key: 'contact', label: 'Contact & address', hint: 'Phone, email, address' },
    { key: 'guardian', label: 'Guardian & emergency', hint: 'Guardian for minors' },
    { key: 'review', label: 'Review', hint: 'Check and save' },
  ];
  stepIndex = 0;
  completed = new Set<string>();

  patientId: number | null = null;
  loading = false;
  saving = false;
  facilities: any[] = [];

  usernameState: 'idle' | 'checking' | 'free' | 'taken' = 'idle';
  private usernameTouched = false;
  private usernameTimer: ReturnType<typeof setTimeout> | null = null;

  /** Possible duplicates the service found; the user must confirm before registering anyway. */
  duplicates: any[] | null = null;

  f = this.blankForm();
  guardian: any | null = null;
  private original = { dateOfBirth: '', estimatedAgeYears: null as number | null, geo: '' };

  @ViewChild('notificationModal') notificationModal!: NotificationModalComponent;

  constructor(
    private api: PatientApiService,
    private directory: OrgDirectoryService,
    private route: ActivatedRoute,
    private router: Router,
    private ui: UiService,
  ) {}

  get editMode(): boolean { return this.patientId !== null; }
  get currentKey(): string { return this.steps[this.stepIndex].key; }
  get isLastStep(): boolean { return this.stepIndex === this.steps.length - 1; }
  get progressPercent(): number { return Math.round(((this.stepIndex + 1) / this.steps.length) * 100); }

  /** Age from the date of birth, or the estimate; null while neither is given. */
  get age(): number | null {
    if (this.f.ageMode === 'dob') return ageFromDob(this.f.dateOfBirth);
    return this.f.estimatedAgeYears === null || this.f.estimatedAgeYears === undefined || this.f.estimatedAgeYears === ('' as any) ? null : Number(this.f.estimatedAgeYears);
  }
  get isMinor(): boolean { return this.age !== null && this.age < MINOR_AGE_YEARS; }
  get fullName(): string { return [this.f.title, this.f.firstName, this.f.middleName, this.f.lastName].map((v) => v.trim()).filter(Boolean).join(' '); }
  get facilityName(): string { return this.facilities.find((x) => x.facilityId === this.f.registrationFacilityId)?.facilityName || '—'; }
  genderLabel(value: string) { return labelOf(GENDERS, value); }

  ngOnInit(): void {
    this.directory.facilities().subscribe((rows) => {
      this.facilities = rows;
      // One facility only: no need to ask.
      if (!this.editMode && rows.length === 1 && !this.f.registrationFacilityId) this.f.registrationFacilityId = rows[0].facilityId;
    });
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.patientId = Number(id);
      this.usernameTouched = true;
      this.load();
    }
  }

  private blankForm() {
    return {
      registrationFacilityId: null as number | null,
      username: '', title: '', firstName: '', middleName: '', lastName: '', gender: '',
      ageMode: 'dob' as 'dob' | 'estimate', dateOfBirth: '', estimatedAgeYears: null as number | null, preferredLanguage: '',
      phoneCountryCode: '+91', phoneNumber: '', alternatePhoneNumber: '', email: '',
      addressLine1: '', addressLine2: '',
      countryId: null as number | null, stateId: null as number | null, districtId: null as number | null,
      subDistrictId: null as number | null, cityId: null as number | null, postalCodeId: null as number | null,
      labels: emptyGeoLabels(), legacyText: '',
      guardianRelationship: '',
      emergencyContactName: '', emergencyContactRelationship: '', emergencyContactPhone: '',
      abhaNumber: '', abhaAddress: '', idProofType: '', idProofLast4: '', notes: '',
    };
  }

  private load(): void {
    this.loading = true;
    this.api.get<any>(`/patients/${this.patientId}`).subscribe({
      next: (p) => {
        const f = this.blankForm();
        const str = (v: any) => v ?? '';
        Object.assign(f, {
          registrationFacilityId: p.registrationFacilityId,
          username: p.username, title: str(p.title), firstName: p.firstName, middleName: str(p.middleName), lastName: str(p.lastName),
          gender: str(p.gender), dateOfBirth: str(p.dateOfBirth), preferredLanguage: str(p.preferredLanguage),
          phoneCountryCode: p.phoneCountryCode || '+91', phoneNumber: p.phoneNumber, alternatePhoneNumber: str(p.alternatePhoneNumber), email: str(p.email),
          addressLine1: str(p.addressLine1), addressLine2: str(p.addressLine2),
          countryId: p.countryId ?? null, stateId: p.stateId ?? null, districtId: p.districtId ?? null,
          subDistrictId: p.subDistrictId ?? null, cityId: p.cityId ?? null, postalCodeId: p.postalCodeId ?? null,
          guardianRelationship: str(p.guardianRelationship),
          emergencyContactName: str(p.emergencyContactName), emergencyContactRelationship: str(p.emergencyContactRelationship), emergencyContactPhone: str(p.emergencyContactPhone),
          abhaNumber: str(p.abhaNumber), abhaAddress: str(p.abhaAddress), idProofType: str(p.idProofType), idProofLast4: str(p.idProofLast4), notes: str(p.notes),
        });
        f.ageMode = !p.dateOfBirth && p.estimatedAgeYears !== null && p.estimatedAgeYears !== undefined ? 'estimate' : 'dob';
        // the service reports the advanced age; show that as the estimate
        f.estimatedAgeYears = f.ageMode === 'estimate' ? p.age : null;
        f.labels = {
          country: p.countryName ?? '', state: p.stateName ?? '', district: p.districtName ?? '',
          subDistrict: p.subDistrictName ?? '', city: p.city ?? '', postalCode: p.postalCode ?? '',
        };
        const hasIds = f.countryId || f.stateId || f.districtId || f.subDistrictId || f.cityId || f.postalCodeId;
        f.legacyText = hasIds ? '' : [p.city, p.subDistrictName, p.districtName, p.stateName, p.countryName, p.postalCode].filter(Boolean).join(', ');
        this.f = f;
        this.guardian = p.guardian;
        this.original = { dateOfBirth: f.dateOfBirth, estimatedAgeYears: f.estimatedAgeYears, geo: this.geoKey() };
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.notificationModal.open({ type: 'ERROR', title: 'Failed to load patient', message: error, contentType: 'TEXT', autoCloseAfter: 4000 });
      },
    });
  }

  private geoKey(): string {
    const f = this.f;
    return [f.countryId, f.stateId, f.districtId, f.subDistrictId, f.cityId, f.postalCodeId].join('|');
  }

  // ---- username ------------------------------------------------------------------
  onNameChange(): void {
    if (this.usernameTouched) return;
    this.f.username = suggestUsername(this.f.firstName, this.f.lastName);
    this.scheduleUsernameCheck();
  }

  onUsernameInput(): void {
    this.usernameTouched = true;
    this.f.username = this.f.username.toLowerCase().replace(/\s+/g, '');
    this.scheduleUsernameCheck();
  }

  private scheduleUsernameCheck(): void {
    if (this.usernameTimer) clearTimeout(this.usernameTimer);
    if (!USERNAME_PATTERN.test(this.f.username)) {
      this.usernameState = 'idle';
      return;
    }
    this.usernameState = 'checking';
    this.usernameTimer = setTimeout(() => {
      const username = this.f.username;
      this.api.post<any>('/patients/username-check', { username, ...(this.patientId ? { excludePatientId: this.patientId } : {}) }).subscribe({
        next: (r) => { if (username === this.f.username) this.usernameState = r?.available ? 'free' : 'taken'; },
        error: () => { if (username === this.f.username) this.usernameState = 'idle'; },
      });
    }, 350);
  }

  // ---- guardian --------------------------------------------------------------------
  onGuardianPicked(patient: any): void {
    this.guardian = patient;
  }
  clearGuardian(): void {
    this.guardian = null;
    this.f.guardianRelationship = '';
  }

  // ---- steps -----------------------------------------------------------------------
  private validateStep(key: string): string | null {
    const f = this.f;
    switch (key) {
      case 'identity':
        if (!this.editMode && !f.registrationFacilityId) return 'Choose the facility registering this patient';
        if (!f.firstName.trim()) return 'First name is required';
        if (!USERNAME_PATTERN.test(f.username)) return 'Username must be 3–50 characters: letters, digits, dot, dash or underscore';
        if (this.usernameState === 'taken') return 'That username is already used by another patient';
        if (f.ageMode === 'dob' && f.dateOfBirth && new Date(f.dateOfBirth).getTime() > Date.now()) return 'Date of birth cannot be in the future';
        if (f.ageMode === 'estimate' && f.estimatedAgeYears !== null && (Number(f.estimatedAgeYears) < 0 || Number(f.estimatedAgeYears) > 130)) return 'Estimated age must be between 0 and 130';
        return null;
      case 'contact': {
        const phone = digits(f.phoneNumber);
        if (phone.length < 6 || phone.length > 15) return 'Enter a valid phone number (6–15 digits)';
        if (f.alternatePhoneNumber.trim() && (digits(f.alternatePhoneNumber).length < 6 || digits(f.alternatePhoneNumber).length > 15)) return 'The alternate number is not valid';
        if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) return 'The email address is not valid';
        return null;
      }
      case 'guardian':
        if (this.isMinor && !this.guardian) return `A patient under ${MINOR_AGE_YEARS} needs a guardian who is a registered patient`;
        if (f.abhaNumber.trim() && !/^[0-9-]{14,17}$/.test(f.abhaNumber.trim())) return 'ABHA number must be 14 digits (dashes allowed)';
        if (f.idProofLast4.trim() && f.idProofLast4.trim().length !== 4) return 'ID proof: enter exactly the last 4 characters';
        return null;
      default:
        return null;
    }
  }

  private validateAll(): boolean {
    for (let i = 0; i < this.steps.length; i++) {
      const problem = this.validateStep(this.steps[i].key);
      if (problem) {
        this.stepIndex = i;
        this.ui.show(problem);
        this.scrollToTop();
        return false;
      }
    }
    return true;
  }

  goTo(index: number): void {
    if (index === this.stepIndex || index < 0 || index >= this.steps.length) return;
    if (index > this.stepIndex && !this.editMode) {
      for (let i = this.stepIndex; i < index; i++) {
        const problem = this.validateStep(this.steps[i].key);
        if (problem) {
          this.stepIndex = i;
          this.ui.show(problem);
          this.scrollToTop();
          return;
        }
        this.completed.add(this.steps[i].key);
      }
    }
    this.stepIndex = index;
    this.scrollToTop();
  }

  goToKey(key: string): void {
    this.goTo(this.steps.findIndex((s) => s.key === key));
  }

  next(): void {
    const problem = this.validateStep(this.currentKey);
    if (problem) {
      this.ui.show(problem);
      return;
    }
    this.completed.add(this.currentKey);
    if (!this.isLastStep) {
      this.stepIndex += 1;
      this.scrollToTop();
    }
  }

  back(): void {
    if (this.stepIndex > 0) {
      this.stepIndex -= 1;
      this.scrollToTop();
    }
  }

  private scrollToTop(): void {
    setTimeout(() => document.querySelector('.stepper')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  // ---- save ------------------------------------------------------------------------
  private payload(): Record<string, unknown> {
    const f = this.f;
    const body: Record<string, unknown> = {
      username: f.username.trim(),
      title: text(f.title), firstName: f.firstName.trim(), middleName: text(f.middleName), lastName: text(f.lastName),
      gender: f.gender || null, preferredLanguage: text(f.preferredLanguage),
      phoneCountryCode: f.phoneCountryCode.trim() || '+91', phoneNumber: f.phoneNumber.trim(),
      alternatePhoneNumber: text(f.alternatePhoneNumber), email: text(f.email),
      addressLine1: text(f.addressLine1), addressLine2: text(f.addressLine2),
      emergencyContactName: text(f.emergencyContactName), emergencyContactRelationship: text(f.emergencyContactRelationship), emergencyContactPhone: text(f.emergencyContactPhone),
      guardianPatientId: this.guardian?.patientId ?? null, guardianRelationship: this.guardian ? text(f.guardianRelationship) : null,
      abhaNumber: text(f.abhaNumber), abhaAddress: text(f.abhaAddress), idProofType: text(f.idProofType), idProofLast4: text(f.idProofLast4), notes: text(f.notes),
    };

    // Age: a date of birth, or an estimate. When editing, only send what changed — re-sending an
    // unchanged estimate would restart its clock and the age would stop advancing.
    if (f.ageMode === 'dob') {
      if (!this.editMode || f.dateOfBirth !== this.original.dateOfBirth || this.original.estimatedAgeYears !== null) body['dateOfBirth'] = f.dateOfBirth || null;
      if (this.editMode && this.original.estimatedAgeYears !== null && !f.dateOfBirth) body['estimatedAgeYears'] = null;
    } else {
      const estimate = this.age;
      if (!this.editMode || estimate !== this.original.estimatedAgeYears || this.original.dateOfBirth) {
        body['estimatedAgeYears'] = estimate;
        if (this.editMode && this.original.dateOfBirth) body['dateOfBirth'] = null;
      }
    }

    // The address chain is re-validated by the service whenever any id is sent, so send it only when it changed.
    if (!this.editMode || this.geoKey() !== this.original.geo) {
      Object.assign(body, {
        countryId: f.countryId, stateId: f.stateId, districtId: f.districtId,
        subDistrictId: f.subDistrictId, cityId: f.cityId, postalCodeId: f.postalCodeId,
      });
    }
    return body;
  }

  save(allowDuplicate = false): void {
    if (!this.validateAll()) return;
    this.saving = true;
    this.duplicates = null;

    const body = this.payload();
    const request = this.editMode
      ? this.api.patch<any>(`/patients/${this.patientId}`, body)
      : this.api.post<any>('/patients', { ...body, registrationFacilityId: this.f.registrationFacilityId, allowDuplicate });

    request.subscribe({
      next: (patient) => {
        this.saving = false;
        this.ui.show(this.editMode ? 'Patient updated' : `Patient registered (${patient.patientNumber})`);
        this.router.navigate(['/patients', patient.patientId]);
      },
      error: (error) => {
        this.saving = false;
        const detail = error?.error?.error;
        if (detail?.code === 'DUPLICATE_CANDIDATES') {
          this.duplicates = detail.candidates || [];
          return;
        }
        if (detail?.code === 'USERNAME_TAKEN') {
          this.usernameState = 'taken';
          this.stepIndex = 0;
        }
        if (detail?.code === 'GUARDIAN_REQUIRED' || detail?.code === 'INVALID_GUARDIAN') this.stepIndex = 2;
        this.notificationModal.open({
          type: 'ERROR',
          title: this.editMode ? 'Failed to update patient' : 'Failed to register patient',
          message: error,
          contentType: 'TEXT',
          autoCloseAfter: 6000,
        });
      },
    });
  }

  confirmDuplicate(): void { this.save(true); }
  cancelDuplicate(): void { this.duplicates = null; }
}
