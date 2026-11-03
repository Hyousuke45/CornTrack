/**
 * Distance and commute-cost helpers for the buyer commute calculator.
 * Pure math — no network needed, so it works fully offline.
 */

export type LatLng = { latitude: number; longitude: number };

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle ("as the crow flies") distance between two coordinates, km.
 * Haversine formula, ±0.3% of the true value.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Roads are never straight: typical PH provincial routes are ~30–45% longer
 * than the straight line. 1.35 is a reasonable default the farmer can adjust.
 */
export const DEFAULT_ROAD_FACTOR = 1.35;

/** Estimated driving distance between two coordinates, km. */
export function roadDistanceKm(a: LatLng, b: LatLng, roadFactor = DEFAULT_ROAD_FACTOR): number {
  return haversineKm(a, b) * roadFactor;
}

/** True when both coordinates exist and are within PH-reasonable bounds. */
export function isValidCoord(latLng: { latitude: number | null; longitude: number | null }): boolean {
  const { latitude, longitude } = latLng;
  if (latitude === null || longitude === null) return false;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

/** "17.1482° N, 121.9763° E" for display. */
export function formatCoord(latLng: { latitude: number | null; longitude: number | null }): string {
  if (!isValidCoord(latLng)) return "No coordinates set";
  const lat = latLng.latitude as number;
  const lng = latLng.longitude as number;
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(4)}° ${
    lng >= 0 ? "E" : "W"
  }`;
}

/**
 * Gets the device's current GPS position (Philippines-shaped accuracy).
 * Rejects when geolocation is unavailable or denied — callers fall back to
 * manual coordinate entry.
 */
export function getCurrentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("This device cannot share GPS location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "Location permission was denied — enter coordinates manually."
              : "Could not get your location — enter coordinates manually."
          )
        ),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 }
    );
  });
}
