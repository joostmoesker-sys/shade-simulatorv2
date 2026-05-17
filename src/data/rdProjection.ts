import type { LatLon } from '../model/schema';

/**
 * Approximate forward conversion from WGS84 (EPSG:4326) to the Dutch
 * "Rijksdriehoekscoördinaten" system (EPSG:28992), accurate to a few meters
 * within the Netherlands. Source: official PDOK polynomial coefficients.
 */
export function wgs84ToRd(location: LatLon): { x: number; y: number } {
  const dLat = 0.36 * (location.lat - 52.1551744);
  const dLon = 0.36 * (location.lon - 5.38720621);
  const x =
    155_000 +
    [
      [0, 1, 190_094.945],
      [1, 1, -11_832.228],
      [2, 1, -114.221],
      [0, 3, -32.391],
      [1, 0, -0.705],
      [3, 1, -2.34],
      [1, 3, -0.608],
      [0, 2, -0.008],
      [2, 3, 0.148],
    ].reduce((sum, [p, q, k]) => sum + k * dLat ** p * dLon ** q, 0);
  const y =
    463_000 +
    [
      [1, 0, 309_056.544],
      [0, 2, 3_638.893],
      [2, 0, 73.077],
      [1, 2, -157.984],
      [3, 0, 59.788],
      [0, 1, 0.433],
      [2, 2, -6.439],
      [1, 1, -0.032],
      [0, 4, 0.092],
      [1, 4, -0.054],
    ].reduce((sum, [p, q, k]) => sum + k * dLat ** p * dLon ** q, 0);
  return { x, y };
}

/**
 * Approximate inverse conversion from RD (EPSG:28992) to WGS84 (EPSG:4326)
 * coordinates. Mirrors the forward polynomial above.
 */
export function rdToWgs84(x: number, y: number): LatLon {
  const dX = (x - 155_000) * 1e-5;
  const dY = (y - 463_000) * 1e-5;
  const lat =
    52.1551744 +
    [
      [0, 1, 3_235.65389],
      [2, 0, -32.58297],
      [0, 2, -0.2475],
      [2, 1, -0.84978],
      [0, 3, -0.0655],
      [2, 2, -0.01709],
      [1, 0, -0.00738],
      [4, 0, 0.0053],
      [2, 3, -0.00039],
      [4, 1, 0.00033],
      [1, 1, -0.00012],
    ].reduce((sum, [p, q, k]) => sum + k * dX ** p * dY ** q, 0) /
      3600;
  const lon =
    5.38720621 +
    [
      [1, 0, 5_260.52916],
      [1, 1, 105.94684],
      [1, 2, 2.45656],
      [3, 0, -0.81885],
      [1, 3, 0.05594],
      [3, 1, -0.05607],
      [0, 1, 0.01199],
      [3, 2, -0.00256],
      [1, 4, 0.00128],
      [0, 2, 0.00022],
      [2, 0, -0.00022],
      [5, 0, 0.00026],
    ].reduce((sum, [p, q, k]) => sum + k * dX ** p * dY ** q, 0) /
      3600;
  return { lat, lon };
}

export function isRdCoordinate(x: number, y: number): boolean {
  return x >= 0 && x <= 300_000 && y >= 300_000 && y <= 625_000;
}

export function isDutchLonLat([lon, lat]: [number, number]): boolean {
  return lon >= 3.1 && lon <= 7.4 && lat >= 50.4 && lat <= 53.8;
}
