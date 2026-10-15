import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { PatientApiService } from '../../core/patient-api.service';
import { MINOR_AGE_YEARS, USERNAME_PATTERN, suggestUsername } from '../patients/patient-model';

/**
 * Register a walk-in in the middle of a booking: only what is mandatory (name,
 * phone, username). Everything else can be completed later from the patient's
 * page. A patient under 18 needs a guardian, which this short form cannot
 * capture, so it points to the full form instead.
 */
@Component({
  selector: 'app-quick-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './quick-register.component.html',
  styleUrls: ['./quick-register.component.scss'],
})
export class QuickRegisterComponent implements OnInit {
  /** The facility the patient is being registered at (it issues the patient number). */
  @Input({ required: true }) facilityId!: number;
  @Output() registered = new EventEmitter<any>();
  @Output() closed = new EventEmitter<void>();

  readonly minorAge = MINOR_AGE_YEARS;
  f = { firstName: '', lastName: '', phoneCountryCode: '+91', phoneNumber: '', username: '', gender: '', age: null as number | null };
  usernameState: 'idle' | 'checking' | 'free' | 'taken' = 'idle';
  private usernameTouched = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  saving = false;
  error = '';
  /** Likely duplicates found by the service; the user picks one or confirms it is someone else. */
  candidates: any[] | null = null;

  constructor(private api: PatientApiService) {}

  ngOnInit(): void {}

  get isMinor(): boolean { return this.f.age !== null && this.f.age !== ('' as any) && Number(this.f.age) < MINOR_AGE_YEARS; }

  onNameChange(): void {
    if (this.usernameTouched) return;
    this.f.username = suggestUsername(this.f.firstName, this.f.lastName);
    this.scheduleCheck();
  }

  onUsernameInput(): void {
    this.usernameTouched = true;
    this.f.username = this.f.username.toLowerCase().replace(/\s+/g, '');
    this.scheduleCheck();
  }

  private scheduleCheck(): void {
    if (this.timer) clearTimeout(this.timer);
    if (!USERNAME_PATTERN.test(this.f.username)) { this.usernameState = 'idle'; return; }
    this.usernameState = 'checking';
    this.timer = setTimeout(() => {
      const username = this.f.username;
      this.api.post<any>('/patients/username-check', { username }).subscribe({
        next: (r) => { if (username === this.f.username) this.usernameState = r?.available ? 'free' : 'taken'; },
        error: () => { if (username === this.f.username) this.usernameState = 'idle'; },
      });
    }, 350);
  }

  private validate(): string | null {
    if (!this.f.firstName.trim()) return 'First name is required';
    if (this.f.phoneNumber.replace(/\D/g, '').length < 6) return 'Enter a valid phone number';
    if (!USERNAME_PATTERN.test(this.f.username)) return 'Username must be 3–50 characters: letters, digits, dot, dash or underscore';
    if (this.usernameState === 'taken') return 'That username is already used by another patient';
    if (this.isMinor) return `A patient under ${MINOR_AGE_YEARS} needs a guardian: use the full registration form`;
    return null;
  }

  save(allowDuplicate = false): void {
    const problem = this.validate();
    if (problem) { this.error = problem; return; }
    this.error = '';
    this.saving = true;
    this.candidates = null;

    const body: Record<string, unknown> = {
      registrationFacilityId: this.facilityId,
      username: this.f.username.trim(),
      firstName: this.f.firstName.trim(),
      lastName: this.f.lastName.trim() || null,
      phoneCountryCode: this.f.phoneCountryCode.trim() || '+91',
      phoneNumber: this.f.phoneNumber.trim(),
      gender: this.f.gender || null,
      allowDuplicate,
    };
    if (this.f.age !== null && this.f.age !== ('' as any)) body['estimatedAgeYears'] = Number(this.f.age);

    this.api.post<any>('/patients', body).subscribe({
      next: (patient) => {
        this.saving = false;
        this.registered.emit(patient);
      },
      error: (err) => {
        this.saving = false;
        const detail = err?.error?.error;
        if (detail?.code === 'DUPLICATE_CANDIDATES') { this.candidates = detail.candidates || []; return; }
        if (detail?.code === 'USERNAME_TAKEN') this.usernameState = 'taken';
        this.error = detail?.message || 'Could not register the patient';
      },
    });
  }

  useExisting(candidate: any): void { this.registered.emit(candidate); }
  cancelDuplicates(): void { this.candidates = null; }
}
