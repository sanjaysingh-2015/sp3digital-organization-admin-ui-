import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AppointmentApiService } from '../../core/appointment-api.service';
import { APPOINTMENT_PERMISSIONS } from '../../core/appointment-permissions';
import { AuthService } from '../../core/auth.service';
import { OrgDirectoryService } from '../../core/org-directory.service';
import { PATIENT_PERMISSIONS } from '../../core/patient-permissions';
import { UiService } from '../../core/ui.service';
import { PageComponent } from '../../shared/page.component';
import { ConfirmModalComponent } from '../../shared/components/confirm-modal/confirm-modal';
import { NotificationModalComponent } from '../../shared/components/notification-modal/notification-modal';
import { PatientPickerComponent } from '../patients/patient-picker.component';
import { QuickRegisterComponent } from './quick-register.component';
import { addDays, fmtDate, hhmm, maskPhone, todayLocal } from './appointment-model';

interface SlotGroup { key: string; name: string; slots: any[]; }

/**
 * The front-desk booking screen: choose where and when, pick a slot, pick (or
 * register) the patient, confirm. The server only ever offers slots that start
 * after the current time, and enforces every rule again when the booking is made.
 *
 * With ?reschedule=<appointmentId> the same screen moves an existing booking to
 * another slot of the same service for the same patient.
 */
@Component({
  selector: 'app-book-appointment',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PageComponent, PatientPickerComponent, QuickRegisterComponent, ConfirmModalComponent, NotificationModalComponent],
  templateUrl: './book-appointment.component.html',
  styleUrls: ['./book-appointment.component.scss'],
})
export class BookAppointmentComponent implements OnInit {
  // where and when
  facilities: any[] = [];
  services: any[] = [];
  facilityId: number | null = null;
  facilityServiceId: number | null = null;
  date = todayLocal();
  readonly today = todayLocal();

  // slots
  loadingSlots = false;
  slotsLoaded = false;
  groups: SlotGroup[] = [];
  doctorFilter = '';
  selected: any | null = null;
  finding = false;

  // patient and confirmation
  patient: any | null = null;
  notes = '';
  quickOpen = false;
  booking = false;
  booked: any | null = null;

  // reschedule mode
  rescheduleOf: any | null = null;

  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;
  @ViewChild('notificationModal') notificationModal!: NotificationModalComponent;

  constructor(
    private api: AppointmentApiService,
    private directory: OrgDirectoryService,
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
    private ui: UiService,
  ) {}

  readonly fmtDate = fmtDate;
  readonly hhmm = hhmm;
  readonly maskPhone = maskPhone;

  get rescheduling(): boolean { return !!this.rescheduleOf; }
  get canRegister(): boolean { return this.auth.hasPermission(PATIENT_PERMISSIONS.CREATE); }
  get canSearchPatients(): boolean { return this.auth.hasPermission(PATIENT_PERMISSIONS.READ); }
  get canBook(): boolean { return this.auth.hasPermission(rescheduleOrBook(this.rescheduling)); }
  get facilityName(): string { return this.facilities.find((f) => f.facilityId === this.facilityId)?.facilityName || ''; }
  get serviceName(): string { return this.services.find((s) => s.facilityServiceId === this.facilityServiceId)?.serviceName || ''; }
  get doctorOptions(): string[] { return this.groups.map((g) => g.name); }
  get visibleGroups(): SlotGroup[] { return this.doctorFilter ? this.groups.filter((g) => g.name === this.doctorFilter) : this.groups; }
  get readyToBook(): boolean { return !!this.selected && !!this.patient && !this.booking; }

  ngOnInit(): void {
    this.directory.facilities().subscribe((rows) => {
      this.facilities = rows;
      if (!this.rescheduling && rows.length === 1 && !this.facilityId) {
        this.facilityId = rows[0].facilityId;
        this.onFacilityChange();
      }
    });

    const rescheduleId = this.route.snapshot.queryParamMap.get('reschedule');
    if (rescheduleId) this.startReschedule(Number(rescheduleId));
  }

  private startReschedule(appointmentId: number): void {
    this.api.get<any>(`/appointments/${appointmentId}`).subscribe({
      next: (a) => {
        this.rescheduleOf = a;
        this.facilityId = a.facilityId;
        this.facilityServiceId = a.facilityServiceId;
        // the patient stays the same, and so does the service
        this.patient = { patientUuid: a.patientRef, displayName: a.patientName, phoneMasked: maskPhone(a.patientPhone), patientNumber: '' };
        const start = String(a.appointmentDate).slice(0, 10);
        this.date = start > this.today ? start : this.today;
        this.directory.facilityServices(a.facilityId).subscribe((rows) => { this.services = rows; this.loadSlots(); });
      },
      error: (error) => this.notificationModal.open({ type: 'ERROR', title: 'Failed to load the appointment', message: error, contentType: 'TEXT', autoCloseAfter: 4000 }),
    });
  }

  // ---- step 1: where and when ------------------------------------------------------
  onFacilityChange(): void {
    this.facilityServiceId = null;
    this.services = [];
    this.resetSlots();
    if (!this.facilityId) return;
    this.directory.facilityServices(this.facilityId).subscribe((rows) => {
      this.services = rows;
      if (rows.length === 1) { this.facilityServiceId = rows[0].facilityServiceId; this.loadSlots(); }
    });
  }

  onServiceChange(): void { this.resetSlots(); this.loadSlots(); }

  onDateChange(): void {
    if (this.date < this.today) this.date = this.today; // the past is never bookable
    this.resetSlots();
    this.loadSlots();
  }

  shiftDay(days: number): void {
    const next = addDays(this.date, days);
    if (next < this.today) return;
    this.date = next;
    this.onDateChange();
  }

  private resetSlots(): void {
    this.selected = null;
    this.groups = [];
    this.doctorFilter = '';
    this.slotsLoaded = false;
  }

  loadSlots(): void {
    if (!this.facilityId || !this.facilityServiceId || !this.date) return;
    this.loadingSlots = true;
    this.api.get<any>('/slots', { facilityId: this.facilityId, facilityServiceId: this.facilityServiceId, date: this.date }).subscribe({
      next: (response) => {
        this.groups = this.group(response?.data || []);
        this.loadingSlots = false;
        this.slotsLoaded = true;
        // the slot the user had picked may have just been taken by someone else
        if (this.selected && !this.groups.some((g) => g.slots.some((s) => s.slotId === this.selected.slotId))) this.selected = null;
      },
      error: (error) => {
        this.loadingSlots = false;
        this.slotsLoaded = true;
        this.notificationModal.open({ type: 'ERROR', title: 'Failed to load slots', message: error, contentType: 'TEXT', autoCloseAfter: 4000 });
      },
    });
  }

  private group(slots: any[]): SlotGroup[] {
    const byDoctor = new Map<string, SlotGroup>();
    for (const slot of slots) {
      const key = String(slot.resourceId ?? 0);
      if (!byDoctor.has(key)) byDoctor.set(key, { key, name: slot.resourceName || 'No specific doctor', slots: [] });
      byDoctor.get(key)!.slots.push(slot);
    }
    return [...byDoctor.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The next 14 days: jump to the first day that has an open slot. */
  findNextAvailable(): void {
    if (!this.facilityId || !this.facilityServiceId) return;
    this.finding = true;
    const from = addDays(this.date, 1);
    this.api.get<any>('/slots', { facilityId: this.facilityId, facilityServiceId: this.facilityServiceId, dateFrom: from, dateTo: addDays(from, 13) }).subscribe({
      next: (response) => {
        this.finding = false;
        const first = (response?.data || [])[0];
        if (!first) { this.ui.show('No open slots in the next two weeks'); return; }
        this.date = String(first.slotDate).slice(0, 10);
        this.onDateChange();
      },
      error: () => (this.finding = false),
    });
  }

  // ---- step 2: slot ----------------------------------------------------------------
  pick(slot: any): void { this.selected = slot; }

  // ---- step 3: patient ---------------------------------------------------------------
  onPatientPicked(patient: any): void { this.patient = patient; }
  clearPatient(): void { if (!this.rescheduling) this.patient = null; }
  onRegistered(patient: any): void {
    this.quickOpen = false;
    // a freshly registered patient comes back as a full record; a chosen duplicate as a summary
    this.patient = { ...patient, phoneMasked: patient.phoneMasked ?? maskPhone(patient.phoneNumber) };
    this.ui.show(`Patient ready (${patient.patientNumber})`);
  }

  // ---- step 4: confirm ---------------------------------------------------------------
  book(allowSameDay = false): void {
    if (!this.readyToBook) return;
    this.booking = true;
    const body: Record<string, unknown> = { slotId: this.selected.slotId, notes: this.notes.trim() || null };
    const request = this.rescheduling
      ? this.api.post<any>(`/appointments/${this.rescheduleOf.appointmentId}/reschedule`, body)
      : this.api.post<any>('/appointments', { ...body, patientUuid: this.patient.patientUuid, allowSameDay });

    request.subscribe({
      next: (appointment) => {
        this.booking = false;
        this.booked = appointment;
      },
      error: (error) => {
        this.booking = false;
        const detail = error?.error?.error;
        switch (detail?.code) {
          case 'SAME_DAY_DUPLICATE':
            this.confirmModal.open({
              title: 'Second appointment the same day?',
              message: `${this.patient.displayName} already has an appointment for ${this.serviceName} on this day.\n\nBook another one anyway?`,
              confirmText: 'Book anyway',
              cancelText: 'Cancel',
            });
            return;
          case 'SLOT_FULL':
          case 'SLOT_UNAVAILABLE':
          case 'SLOT_IN_PAST':
          case 'PROVIDER_NOT_BOOKABLE':
            this.notificationModal.open({ type: 'ERROR', title: 'This slot can no longer be booked', message: detail.message, contentType: 'TEXT', autoCloseAfter: 6000 });
            this.selected = null;
            this.loadSlots();
            return;
          default:
            this.notificationModal.open({ type: 'ERROR', title: this.rescheduling ? 'Could not reschedule' : 'Could not book', message: error, contentType: 'TEXT', autoCloseAfter: 6000 });
        }
      },
    });
  }

  onSameDayConfirmed(): void { this.book(true); }

  bookAnother(): void {
    this.booked = null;
    this.selected = null;
    this.patient = null;
    this.notes = '';
    this.loadSlots();
  }

  goToAppointments(): void { this.router.navigate(['/appointments']); }
}

function rescheduleOrBook(rescheduling: boolean): string {
  return rescheduling ? APPOINTMENT_PERMISSIONS.UPDATE : APPOINTMENT_PERMISSIONS.CREATE;
}
