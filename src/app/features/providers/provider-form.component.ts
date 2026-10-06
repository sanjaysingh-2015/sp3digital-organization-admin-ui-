import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ProviderApiService } from '../../core/provider-api.service';
import { UiService } from '../../core/ui.service';
import { PageComponent } from '../../shared/page.component';
import { NotificationModalComponent } from '../../shared/components/notification-modal/notification-modal';
import { AffiliationFieldsComponent } from './affiliation-fields.component';
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
  newAffiliation,
  validateAffiliation,
} from './provider-model';

const text = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);

@Component({
  selector: 'app-provider-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageComponent, NotificationModalComponent, AffiliationFieldsComponent],
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
  ) {}

  get editMode(): boolean { return this.providerId !== null; }
  get licensed(): boolean { return LICENSED_TYPES.includes(this.f.providerType); }

  ngOnInit(): void {
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
      addressLine1: '', addressLine2: '', city: '', subDistrictName: '', districtName: '', stateName: '', countryName: '', postalCode: '',
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
      addressLine1: text(f.addressLine1), addressLine2: text(f.addressLine2), city: text(f.city), subDistrictName: text(f.subDistrictName),
      districtName: text(f.districtName), stateName: text(f.stateName), countryName: text(f.countryName), postalCode: text(f.postalCode),
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

  private validate(): string | null {
    if (!this.f.firstName.trim()) return 'First name is required';
    if (this.licensed && !this.f.registrations.some((r) => r.registrationNumber.trim())) {
      return 'Add at least one council / licence registration number';
    }
    if (this.f.specialties.filter((s) => s.specialtyName.trim() && s.specialtyLevel === 'PRIMARY').length > 1) {
      return 'Only one specialty can be the primary specialty';
    }
    if (!this.editMode) {
      for (let i = 0; i < this.affiliations.length; i++) {
        const problem = validateAffiliation(this.affiliations[i]);
        if (problem) return `Affiliation ${i + 1}: ${problem}`;
      }
    }
    return null;
  }

  save(): void {
    const problem = this.validate();
    if (problem) {
      this.ui.show(problem);
      return;
    }
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
