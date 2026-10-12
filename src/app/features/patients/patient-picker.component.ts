import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { PatientApiService } from '../../core/patient-api.service';

/**
 * Search-and-select for one patient. Searches on the server (a POST, so names
 * and phone numbers stay out of URLs) and shows masked results only. Used to
 * choose a guardian now, and by the booking screen later.
 */
@Component({
  selector: 'app-patient-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './patient-picker.component.html',
  styleUrls: ['./patient-picker.component.scss'],
})
export class PatientPickerComponent {
  @Input() placeholder = 'Search by name, patient number, username or phone';
  /** A patient that must not be offered (e.g. the patient being edited). */
  @Input() excludePatientId: number | null = null;
  @Output() picked = new EventEmitter<any>();

  query = '';
  results: any[] = [];
  searching = false;
  searched = false;
  failed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private api: PatientApiService) {}

  onType(): void {
    if (this.timer) clearTimeout(this.timer);
    const q = this.query.trim();
    if (q.length < 2) {
      this.results = [];
      this.searched = false;
      return;
    }
    this.timer = setTimeout(() => this.search(q), 300);
  }

  private search(q: string): void {
    this.searching = true;
    this.failed = false;
    this.api.post<any>('/patients/search', { q, status: 'ACTIVE', limit: 8 }).subscribe({
      next: (response) => {
        this.results = (response?.data || []).filter((p: any) => p.patientId !== this.excludePatientId);
        this.searching = false;
        this.searched = true;
      },
      error: () => {
        this.results = [];
        this.searching = false;
        this.failed = true;
      },
    });
  }

  choose(patient: any): void {
    this.picked.emit(patient);
    this.query = '';
    this.results = [];
    this.searched = false;
  }
}
