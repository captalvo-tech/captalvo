/**
 * BIG ARMADA — Geographic Terrain & Elevation Engine
 * Procedural & DEM-based elevation model for the Uberaba, MG pilot sector,
 * including road networks, river contours, and airport runway landmarks.
 */

(function (exports) {
    'use strict';

    // Center Origin: Uberaba, Minas Gerais, Brazil
    const ORIGIN_LAT = -19.7472;
    const ORIGIN_LON = -47.9392;
    const BASE_ELEVATION_METERS = 780.0; // Real altitude of Uberaba

    // Airport Runway Landmark (Aeroporto Mário de Almeida Franco)
    const AIRPORT_LOCAL = (function () {
        if (typeof BigArmadaS2 !== 'undefined') {
            return BigArmadaS2.latLonToLocalMeters(-19.7656, -47.9658, ORIGIN_LAT, ORIGIN_LON);
        }
        return { x: -2780, z: 2045 };
    })();

    /**
     * Computes the terrain elevation at local (x, z) meters relative to Uberaba Center
     */
    function getElevation(x, z) {
        // Base rolling plateau (Triângulo Mineiro topography)
        const wave1 = Math.sin(x * 0.0008) * Math.cos(z * 0.0008) * 16.0;
        const wave2 = Math.sin(x * 0.0025 + 0.5) * Math.sin(z * 0.0025) * 6.0;
        const wave3 = Math.cos(x * 0.006) * Math.sin(z * 0.006) * 2.5;

        let height = wave1 + wave2 + wave3;

        // Flatten the runway area of Aeroporto de Uberaba
        const dxAir = x - AIRPORT_LOCAL.x;
        const dzAir = z - AIRPORT_LOCAL.z;
        const distAir = Math.sqrt(dxAir * dxAir + dzAir * dzAir);
        if (distAir < 500.0) {
            const factor = Math.min(1.0, distAir / 500.0);
            height = height * factor; // Flat terrain for airport runway
        }

        return height;
    }

    /**
     * Checks if coordinates fall on a road or airport runway
     */
    function getSurfaceType(x, z) {
        // Airport Runway & Tarmac check
        const dxAir = x - AIRPORT_LOCAL.x;
        const dzAir = z - AIRPORT_LOCAL.z;
        // Runway heading ~ 170 degrees (roughly along Z axis), length 1750m, width 80m
        if (Math.abs(dxAir) < 45.0 && Math.abs(dzAir) < 850.0) {
            return 'runway';
        }
        if (Math.abs(dxAir) < 180.0 && Math.abs(dzAir) < 250.0) {
            return 'tarmac';
        }

        // Highway BR-050 (runs roughly along X = 200, North-South)
        if (Math.abs(x - (z * 0.15 + 200)) < 20.0) {
            return 'highway';
        }
        // Highway BR-262 (East-West corridor)
        if (Math.abs(z - (x * -0.1 - 400)) < 20.0) {
            return 'highway';
        }

        return 'ground';
    }

    exports.ORIGIN_LAT = ORIGIN_LAT;
    exports.ORIGIN_LON = ORIGIN_LON;
    exports.BASE_ELEVATION_METERS = BASE_ELEVATION_METERS;
    exports.AIRPORT_LOCAL = AIRPORT_LOCAL;
    exports.getElevation = getElevation;
    exports.getSurfaceType = getSurfaceType;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.BigArmadaTerrain = {}));

