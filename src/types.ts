/** Response shapes of the Google Maps Platform endpoints this server uses. */

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

// --- Geocoding API ----------------------------------------------------------

export interface GeocodeAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface GeocodeResult {
  formatted_address: string;
  place_id: string;
  types: string[];
  address_components?: GeocodeAddressComponent[];
  geometry: {
    location: LatLngLiteral;
    location_type?: string;
    viewport?: { northeast: LatLngLiteral; southwest: LatLngLiteral };
  };
}

export interface GeocodeResponse {
  status: string;
  results: GeocodeResult[];
  error_message?: string;
}

// --- Places API (New) -------------------------------------------------------

export interface PlaceLocalizedText {
  text?: string;
  languageCode?: string;
}

export interface PlaceOpeningHours {
  openNow?: boolean;
  weekdayDescriptions?: string[];
}

export interface PlaceReview {
  rating?: number;
  relativePublishTimeDescription?: string;
  text?: PlaceLocalizedText;
  authorAttribution?: { displayName?: string };
}

export interface Place {
  id?: string;
  displayName?: PlaceLocalizedText;
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: LatLng;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  businessStatus?: string;
  primaryTypeDisplayName?: PlaceLocalizedText;
  types?: string[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  regularOpeningHours?: PlaceOpeningHours;
  currentOpeningHours?: PlaceOpeningHours;
  editorialSummary?: PlaceLocalizedText;
  accessibilityOptions?: Record<string, boolean>;
  reviews?: PlaceReview[];
}

export interface PlacesSearchResponse {
  places?: Place[];
}

// --- Routes API -------------------------------------------------------------

export interface RouteStep {
  distanceMeters?: number;
  staticDuration?: string;
  travelMode?: string;
  navigationInstruction?: { maneuver?: string; instructions?: string };
  transitDetails?: {
    stopDetails?: {
      departureStop?: { name?: string };
      arrivalStop?: { name?: string };
      departureTime?: string;
      arrivalTime?: string;
    };
    headsign?: string;
    transitLine?: {
      name?: string;
      nameShort?: string;
      vehicle?: { type?: string; name?: PlaceLocalizedText };
    };
  };
}

export interface RouteLeg {
  distanceMeters?: number;
  duration?: string;
  startLocation?: { latLng?: LatLng };
  endLocation?: { latLng?: LatLng };
  steps?: RouteStep[];
}

export interface Route {
  description?: string;
  distanceMeters?: number;
  duration?: string;
  staticDuration?: string;
  warnings?: string[];
  legs?: RouteLeg[];
  polyline?: { encodedPolyline?: string };
  travelAdvisory?: { tollInfo?: { estimatedPrice?: MoneyAmount[] } };
}

export interface MoneyAmount {
  currencyCode?: string;
  units?: string;
  nanos?: number;
}

export interface ComputeRoutesResponse {
  routes?: Route[];
}

export interface RouteMatrixElement {
  originIndex?: number;
  destinationIndex?: number;
  duration?: string;
  distanceMeters?: number;
  status?: { code?: number; message?: string };
  condition?: string;
}

// --- Elevation & Time Zone --------------------------------------------------

export interface ElevationResponse {
  status: string;
  error_message?: string;
  results: Array<{ elevation: number; location: LatLngLiteral; resolution?: number }>;
}

export interface TimeZoneResponse {
  status: string;
  error_message?: string;
  timeZoneId?: string;
  timeZoneName?: string;
  dstOffset?: number;
  rawOffset?: number;
}
