/**
 * BIG ARMADA — 3D RTS Viewport & Military Tactical Renderer
 * Implements camera controls, terrain elevation rendering, S2 sector grid,
 * stealth shaders, unit animations, and dynamic 3D installation capture flags.
 */

(function (exports) {
    'use strict';

    class RTSRenderer {
        constructor(canvas, s2Engine, terrainEngine) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.s2 = s2Engine;
            this.terrain = terrainEngine;

            // Camera State
            this.camX = 0; // Local meters relative to Uberaba Center
            this.camZ = 0;
            this.zoom = 1.0; // 0.35 to 2.5
            this.pitch = 55 * (Math.PI / 180); // 55 degrees isometric tilt

            // Drag / Pan State
            this.isPanning = false;
            this.lastMouseX = 0;
            this.lastMouseY = 0;

            // Selection Box
            this.isSelecting = false;
            this.selectStartX = 0;
            this.selectStartY = 0;
            this.selectCurrentX = 0;
            this.selectCurrentY = 0;

            // Visual Effects
            this.animTick = 0;
            this.waypointPulses = [];

            this.resize();
            window.addEventListener('resize', () => this.resize());
        }

        resize() {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }

        /**
         * Converts local world meters (x, z, y_elev) to screen pixel coordinates
         */
        worldToScreen(worldX, worldZ, elevation = 0) {
            const relX = (worldX - this.camX) * this.zoom;
            const relZ = (worldZ - this.camZ) * this.zoom;

            const cosPitch = Math.cos(this.pitch);
            const sinPitch = Math.sin(this.pitch);

            const screenX = this.canvas.width / 2 + relX;
            const screenY = this.canvas.height / 2 + relZ * cosPitch - elevation * this.zoom * sinPitch;

            return { x: screenX, y: screenY };
        }

        /**
         * Converts screen pixel coordinates to ground world meters (x, z)
         */
        screenToWorld(screenX, screenY) {
            const cosPitch = Math.cos(this.pitch);
            const relX = (screenX - this.canvas.width / 2) / this.zoom;
            const relZ = (screenY - this.canvas.height / 2) / (this.zoom * cosPitch);

            return {
                x: this.camX + relX,
                z: this.camZ + relZ
            };
        }

        addWaypointPulse(worldX, worldZ, color = '#00ff88') {
            this.waypointPulses.push({
                x: worldX,
                z: worldZ,
                color,
                radius: 2,
                maxRadius: 28,
                alpha: 1.0
            });
        }

        render(worldState, selectedUnitIds = [], localPlayerId = null) {
            this.animTick += 0.05;
            const ctx = this.ctx;
            const w = this.canvas.width;
            const h = this.canvas.height;

            ctx.clearRect(0, 0, w, h);

            // 1. Draw Deep Tactical Background
            ctx.fillStyle = '#02090e';
            ctx.fillRect(0, 0, w, h);

            // 2. Draw S2 Geometry Sector Grid
            this.renderS2Grid(ctx);

            // 3. Draw Geographic Terrain & Features (Elevation tiles & Roads)
            this.renderTerrain(ctx);

            // 4. Draw Waypoint Pulses
            this.renderWaypoints(ctx);

            // 5. Draw Strategic Installations (Aeroporto de Uberaba, etc.)
            if (worldState.installations) {
                Object.values(worldState.installations).forEach(inst => {
                    this.renderInstallation(ctx, inst);
                });
            }

            // 6. Draw Stealth Base Buildings
            if (worldState.buildings) {
                Object.values(worldState.buildings).forEach(bld => {
                    this.renderBuilding(ctx, bld, localPlayerId);
                });
            }

            // 7. Draw Units (with stealth camo & flags)
            if (worldState.units) {
                Object.values(worldState.units).forEach(unit => {
                    const isSelected = selectedUnitIds.includes(unit.id);
                    this.renderUnit(ctx, unit, isSelected, localPlayerId, worldState.players);
                });
            }

            // 8. Draw Selection Rectangle
            if (this.isSelecting) {
                const x = Math.min(this.selectStartX, this.selectCurrentX);
                const y = Math.min(this.selectStartY, this.selectCurrentY);
                const rw = Math.abs(this.selectCurrentX - this.selectStartX);
                const rh = Math.abs(this.selectCurrentY - this.selectStartY);

                ctx.strokeStyle = '#00d9ff';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, rw, rh);
                ctx.fillStyle = 'rgba(0, 217, 255, 0.12)';
                ctx.fillRect(x, y, rw, rh);
            }
        }

        renderS2Grid(ctx) {
            // S2 Sector Cell Level 13 grid (~1.5km x 1.5km per cell)
            const cellSizeMeters = 1500;
            const halfRange = 6000;

            const startX = Math.floor((this.camX - halfRange) / cellSizeMeters) * cellSizeMeters;
            const endX = startX + halfRange * 2;
            const startZ = Math.floor((this.camZ - halfRange) / cellSizeMeters) * cellSizeMeters;
            const endZ = startZ + halfRange * 2;

            ctx.lineWidth = 1;

            for (let x = startX; x <= endX; x += cellSizeMeters) {
                const p1 = this.worldToScreen(x, startZ, 0);
                const p2 = this.worldToScreen(x, endZ, 0);
                ctx.strokeStyle = 'rgba(0, 217, 255, 0.12)';
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }

            for (let z = startZ; z <= endZ; z += cellSizeMeters) {
                const p1 = this.worldToScreen(startX, z, 0);
                const p2 = this.worldToScreen(endX, z, 0);
                ctx.strokeStyle = 'rgba(0, 217, 255, 0.12)';
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();

                // Draw S2 Cell Token labels
                for (let x = startX; x <= endX; x += cellSizeMeters) {
                    const ll = this.s2.localMetersToLatLon(x + cellSizeMeters / 2, z + cellSizeMeters / 2, this.terrain.ORIGIN_LAT, this.terrain.ORIGIN_LON);
                    const cell = this.s2.latLonToS2Cell(ll.lat, ll.lon, 13);
                    const centerScreen = this.worldToScreen(x + cellSizeMeters / 2, z + cellSizeMeters / 2, 0);

                    if (this.zoom > 0.5) {
                        ctx.fillStyle = 'rgba(0, 217, 255, 0.28)';
                        ctx.font = '10px ui-monospace, monospace';
                        ctx.fillText(`S2:${cell.token.slice(0, 8)}`, centerScreen.x - 30, centerScreen.y);
                    }
                }
            }
        }

        renderTerrain(ctx) {
            // Render Airport Runway (SBUR / Aeroporto Mário de Almeida Franco)
            const air = this.terrain.AIRPORT_LOCAL;
            const rStart = this.worldToScreen(air.x, air.z - 800, 0);
            const rEnd = this.worldToScreen(air.x, air.z + 800, 0);

            ctx.strokeStyle = '#2a353d';
            ctx.lineWidth = 28 * this.zoom;
            ctx.beginPath();
            ctx.moveTo(rStart.x, rStart.y);
            ctx.lineTo(rEnd.x, rEnd.y);
            ctx.stroke();

            // Runway center dashes
            ctx.strokeStyle = '#e0f0ff';
            ctx.lineWidth = 2 * this.zoom;
            ctx.setLineDash([12 * this.zoom, 8 * this.zoom]);
            ctx.beginPath();
            ctx.moveTo(rStart.x, rStart.y);
            ctx.lineTo(rEnd.x, rEnd.y);
            ctx.stroke();
            ctx.setLineDash([]); // Reset line dash

            // Highways (BR-050 & BR-262)
            ctx.strokeStyle = 'rgba(120, 140, 150, 0.25)';
            ctx.lineWidth = 14 * this.zoom;
            const h1Start = this.worldToScreen(-4000, 200, 0);
            const h1End = this.worldToScreen(4000, 200, 0);
            ctx.beginPath();
            ctx.moveTo(h1Start.x, h1Start.y);
            ctx.lineTo(h1End.x, h1End.y);
            ctx.stroke();
        }

        renderWaypoints(ctx) {
            for (let i = this.waypointPulses.length - 1; i >= 0; i--) {
                const wp = this.waypointPulses[i];
                wp.radius += 1.2;
                wp.alpha -= 0.04;
                if (wp.alpha <= 0) {
                    this.waypointPulses.splice(i, 1);
                    continue;
                }

                const s = this.worldToScreen(wp.x, wp.z, 0);
                ctx.strokeStyle = wp.color;
                ctx.globalAlpha = wp.alpha;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(s.x, s.y, wp.radius * this.zoom, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }
        }

        renderInstallation(ctx, inst) {
            const loc = this.s2.latLonToLocalMeters(inst.lat, inst.lon, this.terrain.ORIGIN_LAT, this.terrain.ORIGIN_LON);
            const elev = this.terrain.getElevation(loc.x, loc.z);
            const screen = this.worldToScreen(loc.x, loc.z, elev);

            // Capture Radius indicator
            ctx.strokeStyle = inst.owner_id === 'neutral' ? 'rgba(255, 170, 0, 0.35)' : 'rgba(0, 217, 255, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, inst.capture_radius_meters * this.zoom, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // 3D Building Base
            const bWidth = 50 * this.zoom;
            const bHeight = 35 * this.zoom;

            ctx.fillStyle = '#0f1f2e';
            ctx.strokeStyle = inst.flag_color || '#888';
            ctx.lineWidth = 2;
            ctx.fillRect(screen.x - bWidth / 2, screen.y - bHeight / 2, bWidth, bHeight);
            ctx.strokeRect(screen.x - bWidth / 2, screen.y - bHeight / 2, bWidth, bHeight);

            // Roof details / Airport Terminal Glass
            ctx.fillStyle = 'rgba(0, 217, 255, 0.2)';
            ctx.fillRect(screen.x - bWidth / 2 + 4, screen.y - bHeight / 2 + 4, bWidth - 8, bHeight - 8);

            // 3D Flag Pole & Animated Waving Banner
            const poleHeight = 45 * this.zoom;
            const poleX = screen.x + bWidth / 2 - 4;
            const poleY = screen.y - bHeight / 2;

            ctx.strokeStyle = '#cccccc';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(poleX, poleY);
            ctx.lineTo(poleX, poleY - poleHeight);
            ctx.stroke();

            // Animated waving flag
            const waveOffset = Math.sin(this.animTick * 3.0) * 4;
            const flagWidth = 26 * this.zoom;
            const flagHeight = 16 * this.zoom;

            ctx.fillStyle = inst.flag_color || '#888888';
            ctx.beginPath();
            ctx.moveTo(poleX, poleY - poleHeight);
            ctx.lineTo(poleX + flagWidth, poleY - poleHeight + waveOffset);
            ctx.lineTo(poleX + flagWidth, poleY - poleHeight + flagHeight + waveOffset);
            ctx.lineTo(poleX, poleY - poleHeight + flagHeight);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Title & Owner Label
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(inst.name, screen.x, screen.y - bHeight / 2 - poleHeight - 14);

            // Owner Banner
            ctx.fillStyle = inst.flag_color || '#ffaa00';
            ctx.font = '10px ui-monospace, monospace';
            ctx.fillText(`[ ${inst.banner_name} ]`, screen.x, screen.y - bHeight / 2 - poleHeight - 2);

            // Capture progress bar overhead if capturing
            if (inst.current_capture_progress > 0 && inst.current_capture_progress < 100) {
                const barWidth = 70 * this.zoom;
                const barHeight = 6;
                const barX = screen.x - barWidth / 2;
                const barY = screen.y + bHeight / 2 + 8;

                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.fillRect(barX, barY, barWidth, barHeight);
                ctx.fillStyle = inst.capturing_player_id ? '#00d9ff' : '#ffaa00';
                ctx.fillRect(barX, barY, (barWidth * inst.current_capture_progress) / 100.0, barHeight);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1;
                ctx.strokeRect(barX, barY, barWidth, barHeight);
            }
            ctx.textAlign = 'left';
        }

        renderBuilding(ctx, bld, localPlayerId) {
            const loc = this.s2.latLonToLocalMeters(bld.lat, bld.lon, this.terrain.ORIGIN_LAT, this.terrain.ORIGIN_LON);
            const elev = this.terrain.getElevation(loc.x, loc.z);
            const screen = this.worldToScreen(loc.x, loc.z, elev);

            const bWidth = 38 * this.zoom;
            const bHeight = 28 * this.zoom;

            // GLA Stealth Camouflage Shimmer Effect
            const isOwner = bld.owner_id === localPlayerId;
            const camoAlpha = isOwner ? 0.75 : 0.35;

            ctx.globalAlpha = camoAlpha;
            ctx.fillStyle = '#102820'; // Camouflage Military Green
            ctx.strokeStyle = '#44aa66';
            ctx.lineWidth = 1.5;
            ctx.fillRect(screen.x - bWidth / 2, screen.y - bHeight / 2, bWidth, bHeight);
            ctx.strokeRect(screen.x - bWidth / 2, screen.y - bHeight / 2, bWidth, bHeight);

            // Stealth netting pattern
            ctx.strokeStyle = 'rgba(100, 200, 120, 0.3)';
            ctx.beginPath();
            ctx.moveTo(screen.x - bWidth / 2, screen.y - bHeight / 2);
            ctx.lineTo(screen.x + bWidth / 2, screen.y + bHeight / 2);
            ctx.stroke();

            ctx.globalAlpha = 1.0;

            // Name
            ctx.fillStyle = '#99ffaa';
            ctx.font = '10px ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(bld.name, screen.x, screen.y - bHeight / 2 - 4);
            ctx.textAlign = 'left';
        }

        renderUnit(ctx, unit, isSelected, localPlayerId, playerRegistry) {
            const loc = this.s2.latLonToLocalMeters(unit.lat, unit.lon, this.terrain.ORIGIN_LAT, this.terrain.ORIGIN_LON);
            const elev = this.terrain.getElevation(loc.x, loc.z);
            const screen = this.worldToScreen(loc.x, loc.z, elev);

            const isOwner = unit.owner_id === localPlayerId;
            const isNeutral = unit.owner_id === 'neutral' || unit.contract_state === 'mercenary_neutral';

            // Unit Color
            let unitColor = isNeutral ? '#ffaa00' : (isOwner ? '#00d9ff' : '#ff4444');
            if (playerRegistry && playerRegistry[unit.owner_id]) {
                unitColor = playerRegistry[unit.owner_id].color || unitColor;
            }

            // Selection Circle
            if (isSelected) {
                ctx.strokeStyle = '#00ff88';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(screen.x, screen.y, 14 * this.zoom, 8 * this.zoom, 0, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Stealth shimmer if stealth_mode
            if (unit.stealth_mode && !isSelected) {
                ctx.globalAlpha = isOwner ? 0.65 : 0.25;
            }

            // Unit Geometry
            const uRadius = unit.type === 'vehicle_technical' ? 10 * this.zoom : 6 * this.zoom;
            ctx.fillStyle = unitColor;
            ctx.beginPath();
            ctx.arc(screen.x, screen.y - 4, uRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Reset Alpha
            ctx.globalAlpha = 1.0;

            // Status Icon / Contract Indicator
            let badge = '✓';
            let badgeColor = '#00ff88';
            if (isNeutral) {
                badge = '🏴 MERC';
                badgeColor = '#ffaa00';
            } else if (unit.contract_state === 'overdue') {
                badge = `⚠️ ATRASO (${unit.unpaid_ticks}/3)`;
                badgeColor = '#ff3344';
            }

            ctx.font = '9px ui-monospace, monospace';
            ctx.fillStyle = badgeColor;
            ctx.textAlign = 'center';
            ctx.fillText(badge, screen.x, screen.y - 14);

            // Health Bar
            const barW = 20 * this.zoom;
            const barH = 3;
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(screen.x - barW / 2, screen.y - 10, barW, barH);
            ctx.fillStyle = badgeColor;
            ctx.fillRect(screen.x - barW / 2, screen.y - 10, (barW * unit.health) / 100, barH);

            ctx.textAlign = 'left';
        }
    }

    exports.RTSRenderer = RTSRenderer;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.BigArmadaRenderer = {}));

