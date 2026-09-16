import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { GeographyService } from '../../../core/geography.service';

export interface PickedAddress {
  country: string | null;
  stateName: string | null;
  districtName: string | null;
  city: string | null;
  postalCode: string | null;
}

/**
 * Assistive address picker backed by GET /geography/* — NOT a form
 * control that owns the address fields itself. Facility (and anything
 * else with free-text city/state/district/postalCode/country columns)
 * still stores those as plain strings; the backend hasn't migrated to
 * FK'ing into the geography tables yet (a separate, larger migration).
 *
 * So this component doesn't do two-way binding on the address value —
 * it's a one-directional "pick from here, we'll fill in your text
 * fields for you" tool. The host keeps its own plain-text inputs (so
 * existing/edited data that doesn't cleanly match a geography row is
 * never silently overwritten or hidden) and just listens for `picked`.
 *
 * Two ways to fill it in:
 *  1. Cascading dropdowns: Country -> State -> District -> Sub-District
 *     (Taluk/Tehsil) -> City/Village. Each level requires its parent,
 *     same as the API — picking a City also loads that city's postal
 *     codes so a single pincode can be offered as a one-click suggestion.
 *  2. Reverse pincode search: type 3+ digits of a pincode, pick a
 *     match, and country/state/district/city/postalCode are all filled
 *     at once from that one result — skips the cascade entirely.
 */
@Component({
  selector: 'app-address-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './address-picker.component.html',
  styleUrls: ['./address-picker.component.scss'],
})
export class AddressPickerComponent implements OnInit {
  @Output() picked = new EventEmitter<PickedAddress>();

  countryOptions: any[] = [];
  stateOptions: any[] = [];
  districtOptions: any[] = [];
  subDistrictOptions: any[] = [];
  cityOptions: any[] = [];
  postalCodeOptions: any[] = [];

  selectedCountryId: number | null = null;
  selectedStateId: number | null = null;
  selectedDistrictId: number | null = null;
  selectedSubDistrictId: number | null = null;
  selectedCityId: number | null = null;
  selectedPostalCode: string | null = null;

  pincodeQuery = '';
  pincodeResults: any[] = [];
  pincodeSearching = false;
  pincodeSearchError = '';

  loadingStates = false;
  loadingDistricts = false;
  loadingSubDistricts = false;
  loadingCities = false;
  loadingPostalCodes = false;

  constructor(private geo: GeographyService) {}

  ngOnInit(): void {
    this.geo.getCountries().subscribe({
      next: (response) => {
        this.countryOptions = response?.data || [];
        // This system is India-only today (see the geography seed data) --
        // default straight to it and load its states so the common case
        // needs zero extra clicks, while still leaving the dropdown open
        // for whenever a second country's data exists.
        const india = this.countryOptions.find((c) => c.isoAlpha2 === 'IN');
        if (india) {
          this.selectedCountryId = india.countryId;
          this.onCountryChange();
        }
      },
      error: () => (this.countryOptions = []),
    });
  }

  onCountryChange(): void {
    this.resetFrom('state');
    if (!this.selectedCountryId) return;
    this.loadingStates = true;
    this.geo.getStates(this.selectedCountryId).subscribe({
      next: (response) => {
        this.stateOptions = response?.data || [];
        this.loadingStates = false;
      },
      error: () => {
        this.stateOptions = [];
        this.loadingStates = false;
      },
    });
  }

  onStateChange(): void {
    this.resetFrom('district');
    this.emitCurrentSelection();
    if (!this.selectedStateId) return;
    this.loadingDistricts = true;
    this.geo.getDistricts(this.selectedStateId).subscribe({
      next: (response) => {
        this.districtOptions = response?.data || [];
        this.loadingDistricts = false;
      },
      error: () => {
        this.districtOptions = [];
        this.loadingDistricts = false;
      },
    });
  }

  onDistrictChange(): void {
    this.resetFrom('subDistrict');
    this.emitCurrentSelection();
    if (!this.selectedDistrictId) return;
    this.loadingSubDistricts = true;
    this.geo.getSubDistricts(this.selectedDistrictId).subscribe({
      next: (response) => {
        this.subDistrictOptions = response?.data || [];
        this.loadingSubDistricts = false;
      },
      error: () => {
        this.subDistrictOptions = [];
        this.loadingSubDistricts = false;
      },
    });
  }

  onSubDistrictChange(): void {
    this.resetFrom('city');
    if (!this.selectedSubDistrictId) return;
    this.loadingCities = true;
    this.geo.getCities(this.selectedSubDistrictId).subscribe({
      next: (response) => {
        this.cityOptions = response?.data || [];
        this.loadingCities = false;
      },
      error: () => {
        this.cityOptions = [];
        this.loadingCities = false;
      },
    });
  }

  onCityChange(): void {
    this.resetFrom('postalCode');
    this.emitCurrentSelection();
    if (!this.selectedCityId) return;
    this.loadingPostalCodes = true;
    this.geo.getPostalCodesByCity(this.selectedCityId).subscribe({
      next: (response) => {
        this.postalCodeOptions = response?.data || [];
        // Most localities have exactly one postal code -- if so, just
        // use it rather than making the user pick from a list of one.
        if (this.postalCodeOptions.length === 1) {
          this.selectedPostalCode = this.postalCodeOptions[0].code;
        }
        this.loadingPostalCodes = false;
        this.emitCurrentSelection();
      },
      error: () => {
        this.postalCodeOptions = [];
        this.loadingPostalCodes = false;
      },
    });
  }

  onPostalCodeChange(): void {
    this.emitCurrentSelection();
  }

  searchPincode(): void {
    const query = this.pincodeQuery.trim();
    this.pincodeSearchError = '';
    if (query.length < 3) {
      this.pincodeSearchError = 'Enter at least 3 digits';
      this.pincodeResults = [];
      return;
    }
    this.pincodeSearching = true;
    this.geo.searchPostalCodes(query).subscribe({
      next: (response) => {
        this.pincodeResults = response?.data || [];
        this.pincodeSearching = false;
        if (this.pincodeResults.length === 0) {
          this.pincodeSearchError = 'No matching pincode found';
        }
      },
      error: () => {
        this.pincodeResults = [];
        this.pincodeSearching = false;
        this.pincodeSearchError = 'Search failed';
      },
    });
  }

  // One click from a pincode search result fills everything at once --
  // skips the cascade entirely, since the result already carries the
  // full resolved hierarchy.
  pickPincodeResult(result: any): void {
    this.picked.emit({
      country: result.countryName || null,
      stateName: result.stateName || null,
      districtName: result.districtName || null,
      city: result.cityName || null,
      postalCode: result.code || null,
    });
    this.pincodeResults = [];
    this.pincodeQuery = result.code;
  }

  private resetFrom(level: 'state' | 'district' | 'subDistrict' | 'city' | 'postalCode'): void {
    if (level === 'state') {
      this.stateOptions = [];
      this.selectedStateId = null;
    }
    if (level === 'state' || level === 'district') {
      this.districtOptions = [];
      this.selectedDistrictId = null;
    }
    if (level === 'state' || level === 'district' || level === 'subDistrict') {
      this.subDistrictOptions = [];
      this.selectedSubDistrictId = null;
    }
    if (level === 'state' || level === 'district' || level === 'subDistrict' || level === 'city') {
      this.cityOptions = [];
      this.selectedCityId = null;
    }
    this.postalCodeOptions = [];
    this.selectedPostalCode = null;
  }

  private emitCurrentSelection(): void {
    const country = this.countryOptions.find((c) => c.countryId === this.selectedCountryId);
    const state = this.stateOptions.find((s) => s.stateId === this.selectedStateId);
    const district = this.districtOptions.find((d) => d.districtId === this.selectedDistrictId);
    const city = this.cityOptions.find((c) => c.cityId === this.selectedCityId);

    // Only emit once there's at least a state selected -- a bare country
    // pick with nothing else chosen isn't useful to fill anything with.
    if (!state) return;

    this.picked.emit({
      country: country?.name || null,
      stateName: state?.name || null,
      districtName: district?.name || null,
      city: city?.name || null,
      postalCode: this.selectedPostalCode || null,
    });
  }
}
