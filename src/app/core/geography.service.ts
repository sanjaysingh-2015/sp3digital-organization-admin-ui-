import { Injectable } from '@angular/core';
import { ApiService } from './api.service';

export interface GeographyOption {
  [key: string]: any;
}

/**
 * Thin wrapper around GET /geography/* — cascading lookups for
 * Country -> State -> District -> SubDistrict -> City -> PostalCode,
 * plus the reverse pincode search.
 *
 * Every level below country/state REQUIRES its parent id (enforced by
 * the backend, not just a convention here) — that's what makes these
 * cascading rather than "load everything and filter client-side",
 * which would mean pulling all ~154k cities to populate one dropdown.
 */
@Injectable({ providedIn: 'root' })
export class GeographyService {
  constructor(private api: ApiService) {}

  getCountries(search?: string) {
    return this.api.get<any>('/geography/countries', search ? { search } : {});
  }

  getStates(countryId?: number | string, search?: string) {
    return this.api.get<any>('/geography/states', { countryId, search });
  }

  getDistricts(stateId: number | string, search?: string) {
    return this.api.get<any>('/geography/districts', { stateId, search });
  }

  getSubDistricts(districtId: number | string, search?: string) {
    return this.api.get<any>('/geography/sub-districts', { districtId, search });
  }

  getCities(subDistrictId: number | string, search?: string) {
    return this.api.get<any>('/geography/cities', { subDistrictId, search });
  }

  getPostalCodesByCity(cityId: number | string) {
    return this.api.get<any>('/geography/postal-codes', { cityId });
  }

  /** Reverse lookup: partial pincode -> matches with the full hierarchy already resolved. */
  searchPostalCodes(query: string, limit = 20) {
    return this.api.get<any>('/geography/postal-codes/search', { query, limit });
  }
}
