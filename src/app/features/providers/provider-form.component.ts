import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { OrgDirectoryService } from '../../core/org-directory.service';
import { ProviderApiService } from '../../core/provider-api.service';
import { UiService } from '../../core/ui.service';
import { PageComponent } from '../../shared/page.component';
import { NotificationModalComponent } from '../../shared/components/notification-modal/notification-modal';
import { AffiliationFieldsComponent } from './affiliation-fields.component';
import { GeoAddressComponent, emptyGeoLabels } from './geo-address.component';
import {
  AffiliationModel,
  DOCUMENT_TYPES,
  GENDERS,
  LICENSED_TYPES,
  PROVIDER_TYPES,
  REGISTRATION_BODIES,
  SPECIALTY_LEVELS,
  SYSTEMS_OF_MEDICINE,
  affiliationPayload,
  availabilityLabel,
  labelOf,
  newAffiliation,
  validateAffiliation,
} from './provider-model';

const text = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

@Component({
  selector: 'app-provider-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageComponent, NotificationModalComponent, AffiliationFieldsComponent, GeoAddressComponent],
  templateUrl: './provider-form.component.html',
  styleUrls: ['./provider-form.component.scss'],
})
export class ProviderFormComponent implements OnInit {
  readonly providerTypes = PROVIDER_TYPES;
  readonly systems = SYSTEMS_OF_MEDICINE;
  readonly genders = GENDERS;
  readonly bodies = REGISTRATION_BODIES;
  readonly specialtyLevels = SPECIALTY_LEVELS;
  readonly documentTypes = DOCUMENT_TYPES;

  providerId: number | null = null;
  loading = false;
  saving = false;
  affiliations: AffiliationModel[] = [];

  f = this.blankForm();

  @ViewChild('notificationModal') notificationModal!: NotificationModalComponent;

  constructor(
    private api: ProviderApiService,
    private route: ActivatedRoute,
    private router: Router,
    private ui: UiService,
    private directory: OrgDirectoryService,
  ) {}

  get editMode(): boolean { return this.providerId !== null; }
  get licensed(): boolean { return LICENSED_TYPES.includes(this.f.providerType); }

  // ---- stepped workflow ------------------------------------------------------
  private readonly allSteps: { key: string; label: string; hint: string }[] = [
    { key: 'basic', label: 'Basic details', hint: 'Name, type, gender' },
    { key: 'contact', label: 'Contact & address', hint: 'Phone, email, address' },
    { key: 'registration', label: 'Registration', hint: 'Council / licence number' },
    { key: 'professional', label: 'Professional profile', hint: 'Specialties, languages' },
    { key: 'qualifications', label: 'Qualifications', hint: 'Degrees' },
    { key: 'experience', label: 'Experience', hint: 'Work history' },
    { key: 'documents', label: 'Documents', hint: 'Certificates, ID' },
    { key: 'locations', label: 'Where they practise', hint: 'Organizations & facilities' },
    { key: 'review', label: 'Review', hint: 'Check and submit' },
  ];

  stepIndex = 0;
  /** Steps the user has moved past with valid data — shown with a tick. */
  completed = new Set<string>();

  organizationNames = new Map<number, string>();
  facilityNames = new Map<number, string>();

  /** Editing an existing doctor skips "where they practise" — that lives on the doctor's page. */
  get steps() { return this.editMode ? this.allSteps.filter((step) => step.key !== 'locations') : this.allSteps; }
  get currentKey(): string { return this.steps[Math.min(this.stepIndex, this.steps.length - 1)].key; }
  get isFirstStep(): boolean { return this.stepIndex === 0; }
  get isLastStep(): boolean { return this.stepIndex === this.steps.length - 1; }
  get progressPercent(): number { return Math.round(((this.stepIndex + 1) / this.steps.length) * 100); }

  goToKey(key: string): void {
    const index = this.steps.findIndex((step) => step.key === key);
    if (index >= 0) this.goTo(index);
  }

  /** Going back is always free; going forward checks every step on the way. */
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

  next(): void {
    const key = this.currentKey;
    const problem = this.validateStep(key);
    if (problem) {
      this.ui.show(problem);
      return;
    }
    this.completed.add(key);
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

  // ---- review-step helpers ---------------------------------------------------
  typeLabel(value: string) { return labelOf(PROVIDER_TYPES, value); }
  systemLabel(value: string) { return labelOf(SYSTEMS_OF_MEDICINE, value); }
  genderLabel(value: string) { return labelOf(GENDERS, value); }
  availability(a: AffiliationModel) { return availabilityLabel(a); }
  orgName(id: number | null) { return id ? this.organizationNames.get(id) || `Organization #${id}` : '—'; }
  facilityName(id: number | null) { return id ? this.facilityNames.get(id) || `Facility #${id}` : 'Whole organization'; }
  get fullName(): string { return [this.f.title, this.f.firstName, this.f.middleName, this.f.lastName].map((v) => v.trim()).filter(Boolean).join(' '); }
  get filledRegistrations() { return this.f.registrations.filter((r) => r.registrationNumber.trim()); }
  get filledSpecialties() { return this.f.specialties.filter((s) => s.specialtyName.trim()); }
  get filledQualifications() { return this.f.qualifications.filter((q) => q.degree.trim()); }
  get filledExperiences() { return this.f.experiences.filter((e) => e.organizationName.trim()); }
  get filledDocuments() { return this.f.documents.filter((d) => d.documentName.trim() && d.fileUrl.trim()); }
  get languageList(): string[] { return this.f.languagesText.split(',').map((v) => v.trim()).filter(Boolean); }

  ngOnInit(): void {
    this.directory.organizations().subscribe((rows) => rows.forEach((o) => this.organizationNames.set(o.organizationId, o.organizationName)));
    this.directory.facilities().subscribe((rows) => rows.forEach((f) => this.facilityNames.set(f.facilityId, f.facilityName)));
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.providerId = Number(id);
      this.load();
    } else {
      this.f.registrations.push(this.blankRegistration());
      this.f.qualifications.push({ degree: '', specialization: '', institution: '', university: '', country: '', yearOfCompletion: null });
      this.f.specialties.push({ specialtyName: '', specialtyLevel: 'PRIMARY' });
      this.affiliations.push(newAffiliation());
    }
  }

  private blankForm() {
    return {
      providerType: 'DOCTOR', systemOfMedicine: '', title: 'Dr.', firstName: '', middleName: '', lastName: '',
      gender: '', dateOfBirth: '', nationality: '', photoUrl: '', bio: '',
      email: '', phoneCountryCode: '+91', phoneNumber: '', alternatePhoneNumber: '', emergencyContactName: '', emergencyContactPhone: '',
      addressLine1: '', addressLine2: '', countryId: null as number | null, stateId: null as number | null, districtId: null as number | null,
      subDistrictId: null as number | null, cityId: null as number | null, postalCodeId: null as number | null,
      labels: emptyGeoLabels(), legacyText: '',
      hprId: '', practiceStartDate: '', memberships: '', awards: '', idProofType: '', idProofLast4: '',
      languagesText: '',
      registrations: [] as any[],
      qualifications: [] as any[],
      specialties: [] as any[],
      experiences: [] as any[],
      documents: [] as any[],
    };
  }

  private blankRegistration() {
    return { registrationBody: 'NMC', registrationNumber: '', registeredState: '', issuedOn: '', validUntil: '', isPrimary: false };
  }

  private load(): void {
    this.loading = true;
    this.api.get<any>(`/providers/${this.providerId}`).subscribe({
      next: (p) => {
        const f = this.blankForm();
        for (const key of Object.keys(f) as (keyof typeof f)[]) {
          if (key in p && typeof f[key] === 'string') (f as any)[key] = p[key] ?? '';
        }
        f.countryId = p.countryId ?? null; f.stateId = p.stateId ?? null; f.districtId = p.districtId ?? null;
        f.subDistrictId = p.subDistrictId ?? null; f.cityId = p.cityId ?? null; f.postalCodeId = p.postalCodeId ?? null;
        f.labels = {
          country: p.countryName ?? '', state: p.stateName ?? '', district: p.districtName ?? '',
          subDistrict: p.subDistrictName ?? '', city: p.city ?? '', postalCode: p.postalCode ?? '',
        };
        const hasIds = f.countryId || f.stateId || f.districtId || f.subDistrictId || f.cityId || f.postalCodeId;
        f.legacyText = hasIds ? '' : [p.city, p.subDistrictName, p.districtName, p.stateName, p.countryName, p.postalCode].filter(Boolean).join(', ');
        f.languagesText = (p.languages || []).map((l: any) => l.languageName).join(', ');
        f.registrations = (p.registrations || []).map((r: any) => ({
          registrationBody: r.registrationBody, registrationNumber: r.registrationNumber, registeredState: r.registeredState ?? '',
          issuedOn: r.issuedOn ?? '', validUntil: r.validUntil ?? '', isPrimary: !!r.isPrimary,
        }));
        f.qualifications = (p.qualifications || []).map((q: any) => ({
          degree: q.degree, specialization: q.specialization ?? '', institution: q.institution ?? '', university: q.university ?? '',
          country: q.country ?? '', yearOfCompletion: q.yearOfCompletion ?? null,
        }));
        f.specialties = (p.specialties || []).map((s: any) => ({ specialtyName: s.specialtyName, specialtyLevel: s.specialtyLevel }));
        f.experiences = (p.experiences || []).map((e: any) => ({
          organizationName: e.organizationName, designation: e.designation ?? '', department: e.department ?? '', location: e.location ?? '',
          fromDate: e.fromDate ?? '', toDate: e.toDate ?? '', isCurrent: !!e.isCurrent, description: e.description ?? '',
        }));
        f.documents = (p.documents || []).map((d: any) => ({
          documentType: d.documentType, documentName: d.documentName, fileUrl: d.fileUrl, expiresOn: d.expiresOn ?? '',
        }));
        this.f = f;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.notificationModal.open({ type: 'ERROR', title: 'Failed to load doctor', message: error, contentType: 'TEXT', autoCloseAfter: 4000 });
      },
    });
  }

  // ---- repeaters -----------------------------------------------------------
  addRegistration() { this.f.registrations.push(this.blankRegistration()); }
  addQualification() { this.f.qualifications.push({ degree: '', specialization: '', institution: '', university: '', country: '', yearOfCompletion: null }); }
  addSpecialty() { this.f.specialties.push({ specialtyName: '', specialtyLevel: this.f.specialties.length ? 'SECONDARY' : 'PRIMARY' }); }
  addExperience() { this.f.experiences.push({ organizationName: '', designation: '', department: '', location: '', fromDate: '', toDate: '', isCurrent: false, description: '' }); }
  addDocument() { this.f.documents.push({ documentType: 'REGISTRATION_CERTIFICATE', documentName: '', fileUrl: '', expiresOn: '' }); }
  addAffiliation() { this.affiliations.push(newAffiliation()); }
  remove(list: any[], index: number) { list.splice(index, 1); }

  markPrimaryRegistration(index: number) {
    this.f.registrations.forEach((r, i) => (r.isPrimary = i === index));
  }
  markPrimaryAffiliation(index: number) {
    this.affiliations.forEach((a, i) => (a.isPrimary = i === index));
  }

  // ---- save ----------------------------------------------------------------
  private payload(): Record<string, unknown> {
    const f = this.f;
    const languages = f.languagesText.split(',').map((s) => s.trim()).filter(Boolean).map((languageName) => ({ languageName }));
    return {
      providerType: f.providerType,
      systemOfMedicine: f.systemOfMedicine || null,
      title: text(f.title), firstName: f.firstName.trim(), middleName: text(f.middleName), lastName: text(f.lastName),
      gender: f.gender || null, dateOfBirth: f.dateOfBirth || null, nationality: text(f.nationality),
      photoUrl: text(f.photoUrl), bio: text(f.bio),
      email: text(f.email), phoneCountryCode: text(f.phoneCountryCode), phoneNumber: text(f.phoneNumber),
      alternatePhoneNumber: text(f.alternatePhoneNumber), emergencyContactName: text(f.emergencyContactName), emergencyContactPhone: text(f.emergencyContactPhone),
      addressLine1: text(f.addressLine1), addressLine2: text(f.addressLine2), countryId: f.countryId, stateId: f.stateId, districtId: f.districtId,
      subDistrictId: f.subDistrictId, cityId: f.cityId, postalCodeId: f.postalCodeId,
      hprId: text(f.hprId), practiceStartDate: f.practiceStartDate || null, memberships: text(f.memberships), awards: text(f.awards),
      idProofType: text(f.idProofType), idProofLast4: text(f.idProofLast4),
      registrations: f.registrations
        .filter((r) => r.registrationNumber.trim())
        .map((r) => ({
          registrationBody: r.registrationBody.trim(), registrationNumber: r.registrationNumber.trim(), registeredState: text(r.registeredState),
          issuedOn: r.issuedOn || null, validUntil: r.validUntil || null, isPrimary: !!r.isPrimary,
        })),
      qualifications: f.qualifications
        .filter((q) => q.degree.trim())
        .map((q) => ({
          degree: q.degree.trim(), specialization: text(q.specialization), institution: text(q.institution), university: text(q.university),
          country: text(q.country), yearOfCompletion: q.yearOfCompletion || null,
        })),
      specialties: f.specialties.filter((s) => s.specialtyName.trim()).map((s) => ({ specialtyName: s.specialtyName.trim(), specialtyLevel: s.specialtyLevel })),
      languages,
      experiences: f.experiences
        .filter((e) => e.organizationName.trim())
        .map((e) => ({
          organizationName: e.organizationName.trim(), designation: text(e.designation), department: text(e.department), location: text(e.location),
          fromDate: e.fromDate || null, toDate: e.isCurrent ? null : e.toDate || null, isCurrent: !!e.isCurrent, description: text(e.description),
        })),
      documents: f.documents
        .filter((d) => d.documentName.trim() && d.fileUrl.trim())
        .map((d) => ({ documentType: d.documentType, documentName: d.documentName.trim(), fileUrl: d.fileUrl.trim(), expiresOn: d.expiresOn || null })),
    };
  }

  /** One check per step, so the message always matches the screen the user is on. */
  private validateStep(key: string): string | null {
    const f = this.f;
    switch (key) {
      case 'basic':
        if (!f.firstName.trim()) return 'First name is required';
        return null;
      case 'registration': {
        const rows = f.registrations.filter((r) => r.registrationNumber.trim() || r.registeredState.trim());
        if (rows.some((r) => !r.registrationBody.trim() || !r.registrationNumber.trim())) return 'Each registration needs a body and a number';
        if (this.licensed && !rows.some((r) => r.registrationNumber.trim())) return 'Add at least one council / licence registration number';
        return null;
      }
      case 'professional':
        if (f.specialties.filter((s) => s.specialtyName.trim() && s.specialtyLevel === 'PRIMARY').length > 1) return 'Only one specialty can be the primary specialty';
        if (f.idProofLast4.trim() && f.idProofLast4.trim().length !== 4) return 'ID proof: enter exactly the last 4 characters';
        return null;
      case 'qualifications':
        if (f.qualifications.some((q) => !q.degree.trim() && (q.institution.trim() || q.university.trim() || q.specialization.trim() || q.yearOfCompletion))) return 'Each qualification needs a degree';
        return null;
      case 'experience':
        if (f.experiences.some((e) => !e.organizationName.trim() && (e.designation.trim() || e.fromDate))) return 'Each work experience needs a hospital / organization';
        if (f.experiences.some((e) => !e.isCurrent && e.fromDate && e.toDate && e.toDate < e.fromDate)) return 'Work experience: the end date is before the start date';
        return null;
      case 'documents':
        if (f.documents.some((d) => !!d.documentName.trim() !== !!d.fileUrl.trim())) return 'Each document needs both a name and a file link';
        if (f.documents.some((d) => d.fileUrl.trim() && !/^https?:\/\//i.test(d.fileUrl.trim()))) return 'Document links must start with http:// or https://';
        return null;
      case 'locations':
        if (this.editMode) return null;
        for (let i = 0; i < this.affiliations.length; i++) {
          const problem = validateAffiliation(this.affiliations[i]);
          if (problem) return `Affiliation ${i + 1}: ${problem}`;
        }
        return null;
      default:
        return null;
    }
  }

  /** Every step, in order; jumps to the first step with a problem. */
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

  save(): void {
    if (!this.validateAll()) return;
    this.saving = true;

    const body: Record<string, unknown> = this.payload();
    const request = this.editMode
      ? this.api.patch<any>(`/providers/${this.providerId}`, body)
      : this.api.post<any>('/providers', { ...body, affiliations: this.affiliations.map((a) => affiliationPayload(a)) });

    request.subscribe({
      next: (provider) => {
        this.saving = false;
        this.ui.show(this.editMode ? 'Doctor updated' : `Doctor registered (${provider.providerCode})`);
        this.router.navigate(['/providers', provider.providerId]);
      },
      error: (error) => {
        this.saving = false;
        this.notificationModal.open({
          type: 'ERROR',
          title: this.editMode ? 'Failed to update doctor' : 'Failed to register doctor',
          message: error,
          contentType: 'TEXT',
          autoCloseAfter: 6000,
        });
      },
    });
  }
}
