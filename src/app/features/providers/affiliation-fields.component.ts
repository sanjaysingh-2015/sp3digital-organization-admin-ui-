import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { OrgDirectoryService } from '../../core/org-directory.service';
import {
  AffiliationModel,
  AVAILABILITY_SUBTYPES,
  AVAILABILITY_TYPES,
  EMPLOYMENT_TYPES,
  REMOTE_CHANNELS,
} from './provider-model';

/**
 * The fields of ONE affiliation: which organization / facility the doctor
 * practises at, and how (physical, remote, or other such as on demand).
 * Edits the `model` object it is given in place; the parent decides when to
 * save. Used inline on the registration form and inside the affiliation modal
 * on the doctor's page.
 */
@Component({
  selector: 'app-affiliation-fields',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './affiliation-fields.component.html',
  styleUrls: ['./affiliation-fields.component.scss'],
})
export class AffiliationFieldsComponent implements OnInit, OnChanges {
  @Input({ required: true }) model!: AffiliationModel;

  readonly availabilityTypes = AVAILABILITY_TYPES;
  readonly subtypes = AVAILABILITY_SUBTYPES;
  readonly employmentTypes = EMPLOYMENT_TYPES;
  readonly channels = REMOTE_CHANNELS;

  organizations: any[] = [];
  private allFacilities: any[] = [];
  departments: any[] = [];
  facilityServices: any[] = [];
  loadingFacilityData = false;

  constructor(private directory: OrgDirectoryService) {}

  ngOnInit(): void {
    this.directory.organizations().subscribe((rows) => (this.organizations = rows));
    this.directory.facilities().subscribe((rows) => (this.allFacilities = rows));
    this.loadFacilityData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // The modal reuses this component for a different affiliation.
    if (changes['model'] && !changes['model'].firstChange) this.loadFacilityData();
  }

  get facilities(): any[] {
    return this.allFacilities.filter((f) => Number(f.organizationId) === Number(this.model.organizationId));
  }

  get isPhysical(): boolean { return this.model.availabilityType === 'PHYSICAL'; }
  get isRemote(): boolean { return this.model.availabilityType === 'REMOTE'; }
  get isOther(): boolean { return this.model.availabilityType === 'OTHER'; }

  onOrganizationChange(): void {
    this.model.facilityId = null;
    this.model.departmentId = null;
    this.model.facilityServiceIds = [];
    this.departments = [];
    this.facilityServices = [];
  }

  onFacilityChange(): void {
    this.model.departmentId = null;
    this.model.facilityServiceIds = [];
    this.loadFacilityData();
  }

  onTypeChange(): void {
    // Anything that doesn't apply to the new type is dropped, same as the API does.
    if (!this.isRemote) this.model.remoteChannels = [];
    if (!this.isPhysical) this.model.roomOrChamber = '';
    if (!this.isOther) this.model.availabilitySubtype = '';
  }

  toggleChannel(channel: string): void {
    const list = this.model.remoteChannels;
    const index = list.indexOf(channel);
    if (index >= 0) list.splice(index, 1);
    else list.push(channel);
  }

  toggleService(id: number): void {
    const list = this.model.facilityServiceIds;
    const index = list.indexOf(id);
    if (index >= 0) list.splice(index, 1);
    else list.push(id);
  }

  private loadFacilityData(): void {
    const facilityId = this.model?.facilityId;
    if (!facilityId) {
      this.departments = [];
      this.facilityServices = [];
      return;
    }
    this.loadingFacilityData = true;
    this.directory.departments(facilityId).subscribe((rows) => (this.departments = rows));
    this.directory.facilityServices(facilityId).subscribe((rows) => {
      this.facilityServices = rows;
      this.loadingFacilityData = false;
    });
  }
}
