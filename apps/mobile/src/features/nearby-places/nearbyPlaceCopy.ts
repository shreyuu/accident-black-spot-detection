import type {
  NearbyPlaceCategory,
  NearbyPlaceSource,
} from '@/features/nearby-places/nearbyPlaceTypes';

/**
 * Every user-facing string for nearby facilities, in one place.
 *
 * Centralised for the same reason `constants/disclaimer.ts` is: this feature is
 * one careless sentence away from implying the app can get someone medical or
 * police help, which the project's rules forbid outright. Keeping the wording
 * together makes it reviewable as a whole rather than scattered across a screen.
 */

export const NEARBY_PLACE_LABELS: Record<NearbyPlaceCategory, string> = {
  hospital: 'Hospitals',
  police: 'Police stations',
};

/** Singular, for a row's accessibility label. */
export const NEARBY_PLACE_SINGULAR: Record<NearbyPlaceCategory, string> = {
  hospital: 'Hospital',
  police: 'Police station',
};

export const NEARBY_PLACE_SOURCE_LABELS: Record<NearbyPlaceSource, string> = {
  // Required by ODbL. Not optional, and not something to shorten to "OSM".
  openstreetmap: 'OpenStreetMap contributors',
  'google-places': 'Google',
  cache: 'saved on this device',
};

/**
 * The disclaimer above the list.
 *
 * The order is deliberate: the emergency-number instruction comes first,
 * because it is the only sentence that matters to someone reading this in a
 * hurry, and it must not be the thing they scroll past to reach.
 */
export const NEARBY_PLACES_DISCLAIMER =
  'In an emergency, call your local emergency number directly. This list is drawn from public ' +
  'map data that may be incomplete or out of date — a facility shown here may be closed, may ' +
  'have moved, or may not offer the help you need. This app does not contact anyone for you.';

/** Shown next to the distance figure. */
export const NEARBY_PLACES_DISTANCE_NOTE =
  'Distances are straight-line, not travel distance, and are approximate.';

/** Shown when a facility has no opening information — the common case. */
export const NEARBY_PLACES_HOURS_UNKNOWN = 'Opening hours not listed — check before travelling.';

export const NEARBY_PLACES_ALWAYS_OPEN = 'Listed as open 24 hours. Not verified by this app.';

export const NEARBY_PLACES_EMPTY_TITLE = 'Nothing found nearby';

/**
 * Empty state.
 *
 * Says "not recorded" rather than "none here", for the same reason the map's
 * empty state does: absence of data is not evidence of absence, and a driver
 * concluding there is no hospital within 10 km because this screen was empty
 * would be drawing exactly the wrong conclusion.
 */
export const NEARBY_PLACES_EMPTY_BODY =
  'No facilities of this kind are recorded in the map data around you. That does not mean there ' +
  'are none — coverage varies a great deal by area.';

export const NEARBY_PLACES_OFFLINE_NOTE =
  'Showing results saved on this device. They may be out of date.';

export const NEARBY_PLACES_PROVIDER_FAILED =
  'The place lookup service could not be reached. Anything shown below was saved earlier.';

/** Above the directions button. `expo` cannot navigate; it hands off. */
export const NEARBY_PLACES_DIRECTIONS_NOTE =
  'Directions open in your maps app. Do not follow them while driving.';
