/**
 * BIG ARMADA — S2 Geometry Engine
 * Implements S2-compatible Earth spherical projection, cube face mapping,
 * Hilbert curve spatial indexing, and sector cell token resolution.
 */

(function (exports) {
    'use strict';

    const PI = Math.PI;
    const DEG_TO_RAD = PI / 180.0;
    const RAD_TO_DEG = 180.0 / PI;
    const EARTH_RADIUS_KM = 6371.0088;

    // Hilbert Curve state transition lookup tables
    const HILBERT_MAP = [
        [0, 3, 1, 2], // state 0
        [0, 1, 3, 2], // state 1
        [2, 3, 1, 0], // state 2
        [2, 1, 3, 0]  // state 3
    ];
    const NEXT_STATE = [
        [1, 0, 0, 2],
        [0, 1, 1, 3],
        [3, 2, 2, 0],
        [2, 3, 3, 1]
    ];

    /**
     * Converts Latitude and Longitude to 3D unit sphere vector (x, y, z)
     */
    function latLonToXYZ(lat, lon) {
        const phi = lat * DEG_TO_RAD;
        const theta = lon * DEG_TO_RAD;
        const cosPhi = Math.cos(phi);
        return {
            x: cosPhi * Math.cos(theta),
            y: cosPhi * Math.sin(theta),
            z: Math.sin(phi)
        };
    }

    /**
     * Converts 3D unit sphere vector (x, y, z) to Latitude and Longitude
     */
    function xyzToLatLon(x, y, z) {
        const hyp = Math.sqrt(x * x + y * y);
        const lat = Math.atan2(z, hyp) * RAD_TO_DEG;
        const lon = Math.atan2(y, x) * RAD_TO_DEG;
        return { lat, lon };
    }

    /**
     * Determines the cube face (0 to 5) for a unit sphere vector
     */
    function xyzToFaceUV(x, y, z) {
        let face = 0;
        const ax = Math.abs(x);
        const ay = Math.abs(y);
        const az = Math.abs(z);

        if (ax >= ay && ax >= az) {
            face = x > 0 ? 0 : 3;
        } else if (ay >= ax && ay >= az) {
            face = y > 0 ? 1 : 4;
        } else {
            face = z > 0 ? 2 : 5;
        }

        let u = 0, v = 0;
        switch (face) {
            case 0: u = y / x; v = z / x; break;
            case 1: u = -x / y; v = z / y; break;
            case 2: u = -x / z; v = -y / z; break;
            case 3: u = z / -x; v = y / -x; break;
            case 4: u = z / -y; v = -x / -y; break;
            case 5: u = -y / -z; v = -x / -z; break;
        }
        return { face, u, v };
    }

    /**
     * Reverse Face and UV to unit 3D sphere vector
     */
    function faceUVToXYZ(face, u, v) {
        let x = 0, y = 0, z = 0;
        switch (face) {
            case 0: x = 1; y = u; z = v; break;
            case 1: x = -u; y = 1; z = v; break;
            case 2: x = -u; y = -v; z = 1; break;
            case 3: x = -1; y = v; z = u; break;
            case 4: x = -v; y = -1; z = u; break;
            case 5: x = -v; y = -u; z = -1; break;
        }
        const norm = Math.sqrt(x * x + y * y + z * z);
        return { x: x / norm, y: y / norm, z: z / norm };
    }

    /**
     * Converts UV [-1, 1] to ST [0, 1] using standard quadratic warping
     */
    function uvToST(uv) {
        if (uv >= 0) {
            return 0.5 * Math.sqrt(1 + 3 * uv);
        } else {
            return 1.0 - 0.5 * Math.sqrt(1 - 3 * uv);
        }
    }

    function stToUV(st) {
        if (st >= 0.5) {
            return (4 * st * st - 1) / 3;
        } else {
            return (1 - 4 * (1 - st) * (1 - st)) / 3;
        }
    }

    /**
     * Computes Hilbert curve cell coordinate for (i, j) at given level
     */
    function coordsToHilbert(i, j, level) {
        let hilbert = 0n;
        let state = 0;
        for (let bit = level - 1; bit >= 0; bit--) {
            const bi = (i >> bit) & 1;
            const bj = (j >> bit) & 1;
            const quadrant = (bi << 1) | bj;
            const hIndex = HILBERT_MAP[state][quadrant];
            hilbert = (hilbert << 2n) | BigInt(hIndex);
            state = NEXT_STATE[state][quadrant];
        }
        return hilbert;
    }

    /**
     * Core function: Get S2 Cell Token for given (lat, lon) at level (default 13, ~1.5km cell)
     */
    function latLonToS2Cell(lat, lon, level = 13) {
        const xyz = latLonToXYZ(lat, lon);
        const { face, u, v } = xyzToFaceUV(xyz.x, xyz.y, xyz.z);
        const s = uvToST(u);
        const t = uvToST(v);

        const maxCoord = 1 << level;
        const i = Math.max(0, Math.min(maxCoord - 1, Math.floor(s * maxCoord)));
        const j = Math.max(0, Math.min(maxCoord - 1, Math.floor(t * maxCoord)));

        const hilbert = coordsToHilbert(i, j, level);
        // Pack face (3 bits) + level (5 bits) + hilbert index into a 64-bit integer
        const cellId = (BigInt(face) << 58n) | (BigInt(level) << 52n) | hilbert;
        const token = cellId.toString(16).padStart(16, '0');

        return {
            token,
            face,
            level,
            i,
            j,
            cellId: cellId.toString(),
            center: getCellCenter(face, i, j, level),
            bounds: getCellBounds(face, i, j, level)
        };
    }

    /**
     * Computes center Lat/Lon of cell (face, i, j, level)
     */
    function getCellCenter(face, i, j, level) {
        const maxCoord = 1 << level;
        const s = (i + 0.5) / maxCoord;
        const t = (j + 0.5) / maxCoord;
        const u = stToUV(s);
        const v = stToUV(t);
        const xyz = faceUVToXYZ(face, u, v);
        return xyzToLatLon(xyz.x, xyz.y, xyz.z);
    }

    /**
     * Computes bounding box [minLat, minLon, maxLat, maxLon] of cell
     */
    function getCellBounds(face, i, j, level) {
        const maxCoord = 1 << level;
        const corners = [
            { s: i / maxCoord, t: j / maxCoord },
            { s: (i + 1) / maxCoord, t: j / maxCoord },
            { s: (i + 1) / maxCoord, t: (j + 1) / maxCoord },
            { s: i / maxCoord, t: (j + 1) / maxCoord }
        ];

        let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
        corners.forEach(c => {
            const u = stToUV(c.s);
            const v = stToUV(c.t);
            const pt = faceUVToXYZ(face, u, v);
            const ll = xyzToLatLon(pt.x, pt.y, pt.z);
            if (ll.lat < minLat) minLat = ll.lat;
            if (ll.lat > maxLat) maxLat = ll.lat;
            if (ll.lon < minLon) minLon = ll.lon;
            if (ll.lon > maxLon) maxLon = ll.lon;
        });

        return { minLat, maxLat, minLon, maxLon };
    }

    /**
     * Great Circle distance between two lat/lon coordinates in kilometers (Haversine formula)
     */
    function distanceKm(lat1, lon1, lat2, lon2) {
        const dLat = (lat2 - lat1) * DEG_TO_RAD;
        const dLon = (lon2 - lon1) * DEG_TO_RAD;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS_KM * c;
    }

    /**
     * Converts a lat/lon offset to local meters relative to a reference origin
     */
    function latLonToLocalMeters(lat, lon, originLat, originLon) {
        const dLat = (lat - originLat) * DEG_TO_RAD;
        const dLon = (lon - originLon) * DEG_TO_RAD;
        const x = dLon * Math.cos(((lat + originLat) / 2) * DEG_TO_RAD) * (EARTH_RADIUS_KM * 1000);
        const z = -dLat * (EARTH_RADIUS_KM * 1000); // In 3D graphics, -Z is North
        return { x, z };
    }

    /**
     * Converts local meters back to lat/lon relative to reference origin
     */
    function localMetersToLatLon(x, z, originLat, originLon) {
        const lat = originLat - (z / (EARTH_RADIUS_KM * 1000)) * RAD_TO_DEG;
        const lon = originLon + (x / ((EARTH_RADIUS_KM * 1000) * Math.cos(originLat * DEG_TO_RAD))) * RAD_TO_DEG;
        return { lat, lon };
    }

    // Export functions
    exports.latLonToXYZ = latLonToXYZ;
    exports.xyzToLatLon = xyzToLatLon;
    exports.latLonToS2Cell = latLonToS2Cell;
    exports.getCellCenter = getCellCenter;
    exports.getCellBounds = getCellBounds;
    exports.distanceKm = distanceKm;
    exports.latLonToLocalMeters = latLonToLocalMeters;
    exports.localMetersToLatLon = localMetersToLatLon;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.BigArmadaS2 = {}));
