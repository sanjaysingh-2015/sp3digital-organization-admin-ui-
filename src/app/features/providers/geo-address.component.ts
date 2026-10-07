import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { GeoService } from '../../core/geo.service';

export interface GeoLabels {
  country: string;
  state: string;
  district: string;
  subDistrict: string;
  city: string;
  postalCode: string;
}

/** What the form keeps for the address: the ids it saves, plus names for display. */
export interface GeoAddressModel {
  countryId: number | null;
  stateId: number | null;
  districtId: number | null;
  subDistrictId: number | null;
  cityId: number | null;
  postalCodeId: number | null;
  labels: GeoLabels;
  /** Address saved as plain text before geography dropdowns existed (no ids). */
  legacyText?: string;
}

export const emptyGeoLabels = (): GeoLabels => ({ country: '', state: '', district: '', subDistrict: '', city: '', postalCode: '' });

/**
 * Country → State → District → Sub-district → City → Postal code dropdowns,
 * the same cascade the Facilities and Organizations forms use, backed by the
 * same /geography API. Edits the ids on the `model` it is given; the doctor
 * service validates the chain and fills in the names when the form is saved.
 */
@Component({
  selector: 'app-geo-address',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './geo-address.component.html',
  styleUrls: ['./geo-address.component.scss'],
})
export class GeoAddressComponent implements OnInit {
  @Input({ required: true }) model!: GeoAddressModel;

  countries: any[] = [];
  states: any[] = [];
  districts: any[] = [];
  subDistricts: any[] = [];
  cities: any[] = [];
  postalCodes: any[] = [];

  loading = { countries: false, states: false, districts: false, subDistricts: false, cities: false, postalCodes: false };

  constructor(private geo: GeoService) {}

  ngOnInit(): void {
    this.loading.countries = true;
    this.geo.getGeography<any>('/geography/countries').subscribe({
      next: (r) => {
        this.countries = r?.data || r?.items || [];
        this.loading.countries = false;
        // New address with nothing chosen yet: start on India (the only country
        // with data today) so the common case needs no extra click.
        if (!this.model.countryId && !this.hasAnyId() && !this.model.legacyText) {
          const india = this.countries.find((c) => c.isoAlpha2 === 'IN' || c.name === 'India');
          if (india) {
            this.model.countryId = india.countryId;
            this.model.labels.country = india.name;
            this.loadStates();
          }
        }
        this.refreshLabel('country');
      },
      error: () => (this.loading.countries = false),
    });

    // Editing a saved doctor: every parent id is already known, so each level's
    // list can be fetched at once so the saved values show as selected.
    if (this.model.countryId) this.loadStates();
    if (this.model.stateId) this.loadDistricts();
    if (this.model.districtId) this.loadSubDistricts();
    if (this.model.subDistrictId) this.loadCities();
    if (this.model.cityId) this.loadPostalCodes();
  }

  onCountryChange(): void {
    this.reset('state');
    this.refreshLabel('country');
    this.loadStates();
  }
  onStateChange(): void {
    this.reset('district');
    this.refreshLabel('state');
    this.loadDistricts();
  }
  onDistrictChange(): void {
    this.reset('subDistrict');
    this.refreshLabel('district');
    this.loadSubDistricts();
  }
  onSubDistrictChange(): void {
    this.reset('city');
    this.refreshLabel('subDistrict');
    this.loadCities();
  }
  onCityChange(): void {
    this.reset('postalCode');
    this.refreshLabel('city');
    this.loadPostalCodes();
  }
  onPostalCodeChange(): void {
    this.refreshLabel('postalCode');
  }

  private hasAnyId(): boolean {
    const m = this.model;
    return !!(m.stateId || m.districtId || m.subDistrictId || m.cityId || m.postalCodeId);
  }

  /** Picking a level clears everything below it, as the API requires a parent for each. */
  private reset(from: 'state' | 'district' | 'subDistrict' | 'city' | 'postalCode'): void {
    const m = this.model;
    const order = ['state', 'district', 'subDistrict', 'city', 'postalCode'];
    const start = order.indexOf(from);
    if (start <= 0) { m.stateId = null; m.labels.state = ''; this.states = []; }
    if (start <= 1) { m.districtId = null; m.labels.district = ''; this.districts = []; }
    if (start <= 2) { m.subDistrictId = null; m.labels.subDistrict = ''; this.subDistricts = []; }
    if (start <= 3) { m.cityId = null; m.labels.city = ''; this.cities = []; }
    m.postalCodeId = null; m.labels.postalCode = ''; this.postalCodes = [];
    m.legacyText = '';
  }

  private refreshLabel(level: 'country' | 'state' | 'district' | 'subDistrict' | 'city' | 'postalCode'): void {
    const m = this.model;
    const pick = (list: any[], idKey: string, id: number | null, nameKey = 'name') =>
      (list.find((row) => row[idKey] === id)?.[nameKey] as string | undefined) ?? '';
    switch (level) {
      case 'country': m.labels.country = pick(this.countries, 'countryId', m.countryId) || m.labels.country; break;
      case 'state': m.labels.state = pick(this.states, 'stateId', m.stateId) || m.labels.state; break;
      case 'district': m.labels.district = pick(this.districts, 'districtId', m.districtId) || m.labels.district; break;
      case 'subDistrict': m.labels.subDistrict = pick(this.subDistricts, 'subDistrictId', m.subDistrictId) || m.labels.subDistrict; break;
      case 'city': m.labels.city = pick(this.cities, 'cityId', m.cityId) || m.labels.city; break;
      case 'postalCode': m.labels.postalCode = pick(this.postalCodes, 'postalCodeId', m.postalCodeId, 'code') || m.labels.postalCode; break;
    }
  }

  private load(
    flag: keyof GeoAddressComponent['loading'],
    path: string,
    query: Record<string, number>,
    assign: (rows: any[]) => void,
    level: Parameters<GeoAddressComponent['refreshLabel']>[0],
  ): void {
    this.loading[flag] = true;
    this.geo.getGeography<any>(path, query).subscribe({
      next: (r) => {
        assign(r?.data || r?.items || []);
        this.loading[flag] = false;
        this.refreshLabel(level);
      },
      error: () => {
        assign([]);
        this.loading[flag] = false;
      },
    });
  }

  private loadStates(): void {
    if (!this.model.countryId) return;
    this.load('states', '/geography/states', { countryId: this.model.countryId }, (rows) => (this.states = rows), 'state');
  }
  private loadDistricts(): void {
    if (!this.model.stateId) return;
    this.load('districts', '/geography/districts', { stateId: this.model.stateId }, (rows) => (this.districts = rows), 'district');
  }
  private loadSubDistricts(): void {
    if (!this.model.districtId) return;
    this.load('subDistricts', '/geography/sub-districts', { districtId: this.model.districtId }, (rows) => (this.subDistricts = rows), 'subDistrict');
  }
  private loadCities(): void {
    if (!this.model.subDistrictId) return;
    this.load('cities', '/geography/cities', { subDistrictId: this.model.subDistrictId }, (rows) => (this.cities = rows), 'city');
  }
  private loadPostalCodes(): void {
    if (!this.model.cityId) return;
    this.load(
      'postalCodes',
      '/geography/postal-codes',
      { cityId: this.model.cityId },
      (rows) => {
        this.postalCodes = rows;
        // One postal code for the place: just use it.
        if (rows.length === 1 && !this.model.postalCodeId) {
          this.model.postalCodeId = rows[0].postalCodeId;
        }
      },
      'postalCode',
    );
  }
}
