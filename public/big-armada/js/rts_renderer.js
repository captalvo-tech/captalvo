/**
 * BIG ARMADA — 3D Isometric Tactical Military RTS Renderer
 * Renders rich terrain, runways, roads, base concrete slabs, scenery foliage,
 * true 3D isometric military structures (HQ, War Factory, Barracks, Power, Defense, Airport),
 * realistic battle tanks with rotating turrets, armored tracks, and barrels,
 * animated infantry soldiers, and tactical RTS command HUD effects.
 */

(function (exports) {
    'use strict';

    class RTSRenderer {
        constructor(canvas, s2Engine, terrainEngine) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.s2 = s2Engine;
            this.terrain = terrainEngine;

            // Camera State (Tuned for comfortable RTS gameplay)
            this.camX = -2780; // Default focus near Airport SBUR / Base
            this.camZ = 2045;
            this.zoom = 1.1; // 0.4 to 2.8
            this.pitch = 56 * (Math.PI / 180); // 56 degrees isometric military angle

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

            // Build Ghost Placement Preview
            this.buildGhost = null; // { type, worldX, worldZ, isValid }

            // Visual Effects & Particle System
            this.animTick = 0;
            this.waypointPulses = [];
            this.particles = []; // Dust clouds, smoke puffs, spark effects

            // Procedural Scenery (Trees, rocks, sandbags around Uberaba)
            this.sceneryProps = this.generateSceneryProps();

            this.resize();
            window.addEventListener('resize', () => this.resize());
        }

        resize() {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }

        generateSceneryProps() {
            const props = [];
            const seedLocations = [
                { cx: -2780, cz: 2045, radius: 1800, count: 65 }, // Airport surroundings
                { cx: 0, cz: 0, radius: 2500, count: 80 }          // City outskirts
            ];

            seedLocations.forEach(cluster => {
                for (let i = 0; i < cluster.count; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const r = 250 + Math.random() * (cluster.radius - 250);
                    const px = cluster.cx + Math.cos(ang) * r;
                    const pz = cluster.cz + Math.sin(ang) * r;

                    // Avoid placing on the runway
                    const surface = this.terrain.getSurfaceType(px, pz);
                    if (surface === 'runway' || surface === 'tarmac') continue;

                    const type = Math.random() < 0.65 ? 'tree' : (Math.random() < 0.85 ? 'rock' : 'sandbags');
                    props.push({
                        x: px,
                        z: pz,
                        type: type,
                        scale: 0.8 + Math.random() * 0.45,
                        rotation: Math.random() * Math.PI * 2
                    });
                }
            });
            return props;
        }

        worldToScreen(worldX, worldZ, elevation = 0) {
            const relX = (worldX - this.camX) * this.zoom;
            const relZ = (worldZ - this.camZ) * this.zoom;

            const cosPitch = Math.cos(this.pitch);
            const sinPitch = Math.sin(this.pitch);

            const screenX = this.canvas.width / 2 + relX;
            const screenY = this.canvas.height / 2 + relZ * cosPitch - elevation * this.zoom * sinPitch;

            return { x: screenX, y: screenY };
        }

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
                maxRadius: 32,
                alpha: 1.0
            });
        }

        addDustParticle(worldX, worldZ, color = 'rgba(150, 140, 120, 0.4)') {
            this.particles.push({
                x: worldX + (Math.random() - 0.5) * 8,
                z: worldZ + (Math.random() - 0.5) * 8,
                radius: 2 + Math.random() * 3,
                maxRadius: 8 + Math.random() * 6,
                color,
                alpha: 0.6,
                life: 1.0
            });
        }

        render(worldState, selectedUnitIds = [], localPlayerId = null) {
            this.animTick += 0.04;
            const ctx = this.ctx;
            const w = this.canvas.width;
            const h = this.canvas.height;

            ctx.clearRect(0, 0, w, h);

            // 1. Draw Military Battlefield Ground & Terrain
            this.renderTerrainGround(ctx);

            // 2. Draw Infrastructure (Airports, Runways, Roads, Concrete Construction Pads)
            this.renderInfrastructure(ctx);

            // 3. Draw Scenery Props (Trees, Boulders, Sandbags)
            this.renderScenery(ctx);

            // 4. Draw Waypoint Pulses & Dynamic Move Markers
            this.renderWaypoints(ctx);

            // 5. Draw Strategic Installations (Aeroporto SBUR, etc.)
            if (worldState.installations) {
                Object.values(worldState.installations).forEach(inst => {
                    this.renderInstallation(ctx, inst, localPlayerId);
                });
            }

            // 6. Draw Military Base Buildings (HQ, War Factory, Barracks, Power, Defense)
            if (worldState.buildings) {
                Object.values(worldState.buildings).forEach(bld => {
                    this.renderBuilding(ctx, bld, localPlayerId);
                });
            }

            // 7. Draw Build Ghost Placement Preview
            if (this.buildGhost) {
                this.renderBuildGhost(ctx);
            }

            // 8. Draw Military Units (Battle Tanks, Technicals, Soldiers)
            if (worldState.units) {
                // Sort units by Z position for accurate isometric depth ordering
                const sortedUnits = Object.values(worldState.units).sort((a, b) => (a.lon + a.lat) - (b.lon + b.lat));
                sortedUnits.forEach(unit => {
                    const isSelected = selectedUnitIds.includes(unit.id);
                    this.renderUnit(ctx, unit, isSelected, localPlayerId, worldState.players);
                });
            }

            // 9. Draw Particle FX (Tank dust, chimney smoke, energy sparks)
            this.renderParticles(ctx);

            // 10. Draw RTS Selection Box
            if (this.isSelecting) {
                const x = Math.min(this.selectStartX, this.selectCurrentX);
                const y = Math.min(this.selectStartY, this.selectCurrentY);
                const rw = Math.abs(this.selectCurrentX - this.selectStartX);
                const rh = Math.abs(this.selectCurrentY - this.selectStartY);

                ctx.strokeStyle = '#00ff88';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 2]);
                ctx.strokeRect(x, y, rw, rh);
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(0, 255, 136, 0.08)';
                ctx.fillRect(x, y, rw, rh);
            }
        }

        // =========================================================================
        // 1. TERRAIN & GROUND RENDERING
        // =========================================================================

        renderTerrainGround(ctx) {
            const w = this.canvas.width;
            const h = this.canvas.height;

            // Rich Military Earth Base
            const grad = ctx.createRadialGradient(w / 2, h / 2, 80, w / 2, h / 2, Math.max(w, h));
            grad.addColorStop(0, '#2d3b2b'); // Tactical olive field
            grad.addColorStop(0.6, '#243023');
            grad.addColorStop(1, '#182218'); // Edge shadow
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);

            // Tactical Grid (Subtle 200m military terrain squares)
            const gridSize = 200;
            const startX = Math.floor((this.camX - 2500) / gridSize) * gridSize;
            const endX = startX + 5000;
            const startZ = Math.floor((this.camZ - 2500) / gridSize) * gridSize;
            const endZ = startZ + 5000;

            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(70, 95, 65, 0.18)';

            for (let x = startX; x <= endX; x += gridSize) {
                const p1 = this.worldToScreen(x, startZ, 0);
                const p2 = this.worldToScreen(x, endZ, 0);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }

            for (let z = startZ; z <= endZ; z += gridSize) {
                const p1 = this.worldToScreen(startX, z, 0);
                const p2 = this.worldToScreen(endX, z, 0);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        }

        // =========================================================================
        // 2. INFRASTRUCTURE & LANDMARKS (Airport, Roads, Tarmac)
        // =========================================================================

        renderInfrastructure(ctx) {
            const air = this.terrain.AIRPORT_LOCAL;

            // 1. Airport Concrete Apron / Operations Area
            const apronTL = this.worldToScreen(air.x - 220, air.z - 300, 0);
            const apronTR = this.worldToScreen(air.x + 220, air.z - 300, 0);
            const apronBR = this.worldToScreen(air.x + 220, air.z + 300, 0);
            const apronBL = this.worldToScreen(air.x - 220, air.z + 300, 0);

            ctx.fillStyle = '#22292f'; // Dark apron asphalt
            ctx.beginPath();
            ctx.moveTo(apronTL.x, apronTL.y);
            ctx.lineTo(apronTR.x, apronTR.y);
            ctx.lineTo(apronBR.x, apronBR.y);
            ctx.lineTo(apronBL.x, apronBL.y);
            ctx.closePath();
            ctx.fill();

            // Concrete apron joints
            ctx.strokeStyle = '#2d373e';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 2. Main Runway SBUR (Asphalt 1700m x 70m)
            const rLength = 950;
            const rWidth = 42 * this.zoom;
            const rStart = this.worldToScreen(air.x, air.z - rLength, 0);
            const rEnd = this.worldToScreen(air.x, air.z + rLength, 0);

            ctx.strokeStyle = '#181d22'; // Dark runway tarmac
            ctx.lineWidth = rWidth;
            ctx.lineCap = 'butt';
            ctx.beginPath();
            ctx.moveTo(rStart.x, rStart.y);
            ctx.lineTo(rEnd.x, rEnd.y);
            ctx.stroke();

            // Runway White Shoulder Borders
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 2 * this.zoom;
            const offset = rWidth / 2 - 2;
            // Left stripe
            ctx.beginPath();
            ctx.moveTo(rStart.x - offset, rStart.y);
            ctx.lineTo(rEnd.x - offset, rEnd.y);
            ctx.stroke();
            // Right stripe
            ctx.beginPath();
            ctx.moveTo(rStart.x + offset, rStart.y);
            ctx.lineTo(rEnd.x + offset, rEnd.y);
            ctx.stroke();

            // Runway Center Dashes (Yellow)
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 3 * this.zoom;
            ctx.setLineDash([16 * this.zoom, 12 * this.zoom]);
            ctx.beginPath();
            ctx.moveTo(rStart.x, rStart.y);
            ctx.lineTo(rEnd.x, rEnd.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Runway Threshold Numbers ("17" and "35")
            if (this.zoom > 0.6) {
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${Math.round(14 * this.zoom)}px ui-monospace, monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('17', rStart.x, rStart.y + 40 * this.zoom);
                ctx.fillText('35', rEnd.x, rEnd.y - 30 * this.zoom);
                ctx.textAlign = 'left';
            }

            // 3. Highways BR-050 & BR-262 (Asphalt with shoulders)
            ctx.strokeStyle = '#323c44';
            ctx.lineWidth = 16 * this.zoom;
            const h1Start = this.worldToScreen(-4000, 200, 0);
            const h1End = this.worldToScreen(4000, 200, 0);
            ctx.beginPath();
            ctx.moveTo(h1Start.x, h1Start.y);
            ctx.lineTo(h1End.x, h1End.y);
            ctx.stroke();

            // Highway dashed white divider
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1.5 * this.zoom;
            ctx.setLineDash([10 * this.zoom, 10 * this.zoom]);
            ctx.beginPath();
            ctx.moveTo(h1Start.x, h1Start.y);
            ctx.lineTo(h1End.x, h1End.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // =========================================================================
        // 3. SCENERY PROPS (Foliage, Pines, Rocks, Sandbags)
        // =========================================================================

        renderScenery(ctx) {
            this.sceneryProps.forEach(prop => {
                const s = this.worldToScreen(prop.x, prop.z, 0);
                if (s.x < -60 || s.x > this.canvas.width + 60 || s.y < -60 || s.y > this.canvas.height + 60) return;

                const sc = prop.scale * this.zoom;

                if (prop.type === 'tree') {
                    // Tree shadow
                    ctx.fillStyle = 'rgba(10, 20, 10, 0.4)';
                    ctx.beginPath();
                    ctx.ellipse(s.x + 6 * sc, s.y + 2 * sc, 12 * sc, 6 * sc, 0, 0, Math.PI * 2);
                    ctx.fill();

                    // Trunk
                    ctx.fillStyle = '#4a3525';
                    ctx.fillRect(s.x - 2 * sc, s.y - 10 * sc, 4 * sc, 10 * sc);

                    // Pine Canopy (Tiered conical foliage)
                    ctx.fillStyle = '#1e4822'; // Dark pine green
                    ctx.beginPath();
                    ctx.moveTo(s.x, s.y - 32 * sc);
                    ctx.lineTo(s.x + 11 * sc, s.y - 12 * sc);
                    ctx.lineTo(s.x - 11 * sc, s.y - 12 * sc);
                    ctx.closePath();
                    ctx.fill();

                    // Upper canopy highlight
                    ctx.fillStyle = '#2d6833';
                    ctx.beginPath();
                    ctx.moveTo(s.x, s.y - 32 * sc);
                    ctx.lineTo(s.x + 8 * sc, s.y - 20 * sc);
                    ctx.lineTo(s.x - 8 * sc, s.y - 20 * sc);
                    ctx.closePath();
                    ctx.fill();

                } else if (prop.type === 'rock') {
                    // Boulders
                    ctx.fillStyle = 'rgba(0,0,0,0.35)';
                    ctx.beginPath();
                    ctx.ellipse(s.x + 4 * sc, s.y + 2 * sc, 10 * sc, 5 * sc, 0, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#5c6460';
                    ctx.beginPath();
                    ctx.arc(s.x, s.y - 4 * sc, 8 * sc, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#7a847f';
                    ctx.beginPath();
                    ctx.arc(s.x - 2 * sc, s.y - 6 * sc, 5 * sc, 0, Math.PI * 2);
                    ctx.fill();

                } else if (prop.type === 'sandbags') {
                    // Sandbag fortification arc
                    ctx.strokeStyle = '#a68c5b';
                    ctx.lineWidth = 5 * sc;
                    ctx.beginPath();
                    ctx.arc(s.x, s.y, 14 * sc, Math.PI * 0.8, Math.PI * 1.8);
                    ctx.stroke();
                }
            });
        }

        // =========================================================================
        // 4. WAYPOINT & MOVE ORDER EFFECTS
        // =========================================================================

        renderWaypoints(ctx) {
            for (let i = this.waypointPulses.length - 1; i >= 0; i--) {
                const wp = this.waypointPulses[i];
                wp.radius += 1.5;
                wp.alpha -= 0.04;
                if (wp.alpha <= 0) {
                    this.waypointPulses.splice(i, 1);
                    continue;
                }

                const s = this.worldToScreen(wp.x, wp.z, 0);
                ctx.strokeStyle = wp.color;
                ctx.globalAlpha = wp.alpha;
                ctx.lineWidth = 2.5;

                // Pulsing rings with tactical crosshair
                ctx.beginPath();
                ctx.arc(s.x, s.y, wp.radius * this.zoom, 0, Math.PI * 2);
                ctx.stroke();

                ctx.lineWidth = 1.5;
                const cr = (wp.radius + 4) * this.zoom;
                ctx.beginPath();
                ctx.moveTo(s.x - cr, s.y); ctx.lineTo(s.x + cr, s.y);
                ctx.moveTo(s.x, s.y - cr); ctx.lineTo(s.x, s.y + cr);
                ctx.stroke();

                ctx.globalAlpha = 1.0;
            }
        }

        // =========================================================================
        // 5. STRATEGIC INSTALLATIONS (Aeroporto SBUR with Terminal & Waving 3D Flag)
        // =========================================================================

        renderInstallation(ctx, inst, localPlayerId) {
            const loc = this.s2.latLonToLocalMeters(inst.lat, inst.lon, this.terrain.ORIGIN_LAT, this.terrain.ORIGIN_LON);
            const elev = this.terrain.getElevation(loc.x, loc.z);
            const screen = this.worldToScreen(loc.x, loc.z, elev);

            const z = this.zoom;
            const isControlled = !!inst.controller;
            const flagColor = inst.flag_color || '#888888';

            // 1. Capture Perimeter Ring (Dotted tactical perimeter)
            ctx.strokeStyle = isControlled ? 'rgba(0, 255, 136, 0.45)' : 'rgba(255, 170, 0, 0.4)';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, (inst.capture_radius_m || 65) * z, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // 2. Concrete Foundation Base
            const bWidth = 84 * z;
            const bDepth = 56 * z;
            const bHeight = 44 * z;

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(screen.x - bWidth / 2 + 10 * z, screen.y - bDepth / 2 + 10 * z, bWidth, bDepth);

            // Ground Floor Walls
            ctx.fillStyle = '#26343e';
            ctx.fillRect(screen.x - bWidth / 2, screen.y - bHeight, bWidth, bHeight);

            // Wall shading & panelling
            ctx.strokeStyle = '#1b262e';
            ctx.lineWidth = 2;
            ctx.strokeRect(screen.x - bWidth / 2, screen.y - bHeight, bWidth, bHeight);

            // Terminal Panoramic Windows (Greenish tinted glass)
            ctx.fillStyle = '#3bb8a0';
            ctx.fillRect(screen.x - bWidth / 2 + 8 * z, screen.y - bHeight + 10 * z, bWidth - 16 * z, 14 * z);

            // 3. Control Tower (Elevated radar tower)
            const towerW = 28 * z;
            const towerH = 48 * z;
            const towerX = screen.x - bWidth / 2 + 12 * z;
            const towerY = screen.y - bHeight - towerH;

            // Tower Shaft
            ctx.fillStyle = '#344550';
            ctx.fillRect(towerX, towerY + 16 * z, towerW, towerH - 16 * z);
            ctx.strokeRect(towerX, towerY + 16 * z, towerW, towerH - 16 * z);

            // Tower Cab (Octagonal glass dome)
            ctx.fillStyle = '#00e5b8';
            ctx.fillRect(towerX - 4 * z, towerY, towerW + 8 * z, 18 * z);
            ctx.strokeStyle = '#00ffa2';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(towerX - 4 * z, towerY, towerW + 8 * z, 18 * z);

            // Rotating Radar Dish on top of the tower
            const radarAngle = this.animTick * 2.5;
            const dishX = towerX + towerW / 2;
            const dishY = towerY - 8 * z;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5 * z;
            ctx.beginPath();
            ctx.ellipse(dishX, dishY, 12 * z, 4 * z, radarAngle, 0, Math.PI);
            ctx.stroke();

            // 4. Tall Waving Faction Flagpole
            const poleX = screen.x + bWidth / 2 - 8 * z;
            const poleY = screen.y - bHeight;
            const poleH = 65 * z;

            ctx.strokeStyle = '#dddddd';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(poleX, poleY);
            ctx.lineTo(poleX, poleY - poleH);
            ctx.stroke();

            // Dynamic 3D waving flag
            const wave = Math.sin(this.animTick * 4.0) * 5 * z;
            const wave2 = Math.cos(this.animTick * 3.5) * 3 * z;
            const fW = 34 * z;
            const fH = 20 * z;

            ctx.fillStyle = flagColor;
            ctx.beginPath();
            ctx.moveTo(poleX, poleY - poleH);
            ctx.quadraticCurveTo(poleX + fW / 2, poleY - poleH + wave, poleX + fW, poleY - poleH + wave2);
            ctx.lineTo(poleX + fW, poleY - poleH + fH + wave2);
            ctx.quadraticCurveTo(poleX + fW / 2, poleY - poleH + fH + wave, poleX, poleY - poleH + fH);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Insignia star on flag
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(poleX + fW / 2, poleY - poleH + fH / 2 + wave * 0.5, 3.5 * z, 0, Math.PI * 2);
            ctx.fill();

            // 5. Overhead Information Label
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.max(11, Math.round(12 * z))}px ui-monospace, monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(inst.name, screen.x, towerY - 18 * z);

            ctx.fillStyle = flagColor;
            ctx.font = `bold ${Math.max(10, Math.round(11 * z))}px ui-monospace, monospace`;
            const statusTxt = isControlled ? `CONTROLADO: +$${inst.income_bonus_per_tick || 60}/tick` : `[ NEUTRO — APROXIME TROPAS PARA CAPTURAR ]`;
            ctx.fillText(statusTxt, screen.x, towerY - 4 * z);

            // Capture Progress Bar
            if (inst.capture_progress > 0 && inst.capture_progress < 100) {
                const barW = 90 * z;
                const barH = 7 * z;
                const bx = screen.x - barW / 2;
                const by = screen.y + 14 * z;
                ctx.fillStyle = 'rgba(0,0,0,0.85)';
                ctx.fillRect(bx, by, barW, barH);
                ctx.fillStyle = '#00ff88';
                ctx.fillRect(bx, by, (barW * inst.capture_progress) / 100, barH);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.strokeRect(bx, by, barW, barH);
            }

            ctx.textAlign = 'left';
        }

        // =========================================================================
        // 6. TRUE ISOMETRIC MILITARY BUILDINGS
        // =========================================================================

        renderBuilding(ctx, bld, localPlayerId) {
            const loc = this.s2.latLonToLocalMeters(bld.lat, bld.lon, this.terrain.ORIGIN_LAT, this.terrain.ORIGIN_LON);
            const elev = this.terrain.getElevation(loc.x, loc.z);
            const s = this.worldToScreen(loc.x, loc.z, elev);
            const z = this.zoom;

            const type = bld.type || 'command_center';
            const isOwner = bld.owner === localPlayerId;
            const primaryColor = isOwner ? '#00d9ff' : '#ffaa00';

            // Draw based on structure type
            switch (type) {
                case 'command_center':
                    this.drawHeadquarters(ctx, s.x, s.y, z, primaryColor, bld.health || 500);
                    break;
                case 'war_factory':
                    this.drawWarFactory(ctx, s.x, s.y, z, primaryColor, bld.health || 500);
                    break;
                case 'barracks':
                    this.drawBarracks(ctx, s.x, s.y, z, primaryColor, bld.health || 400);
                    break;
                case 'supply_stash':
                    this.drawSupplyStash(ctx, s.x, s.y, z, primaryColor, bld.health || 350);
                    break;
                case 'power_plant':
                    this.drawPowerPlant(ctx, s.x, s.y, z, primaryColor, bld.health || 300);
                    break;
                case 'defense_turret':
                    this.drawDefenseTurret(ctx, s.x, s.y, z, primaryColor, bld.health || 350);
                    break;
                default:
                    this.drawHeadquarters(ctx, s.x, s.y, z, primaryColor, bld.health || 500);
                    break;
            }
        }

        // A. CENTRO DE COMANDO / QG (Hardened Command Bunker Complex)
        drawHeadquarters(ctx, x, y, z, color, health) {
            const bw = 90 * z;
            const bd = 60 * z;
            const bh = 42 * z;

            // Concrete Base Slab with Caution Stripes
            this.drawConcreteBasePad(ctx, x, y, bw + 24 * z, bd + 20 * z);

            // Drop Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(x - bw / 2 + 12 * z, y - bd / 2 + 10 * z, bw, bd);

            // Lower Fortified Blast Walls
            ctx.fillStyle = '#2f3b39';
            ctx.fillRect(x - bw / 2, y - bh, bw, bh);
            ctx.strokeStyle = '#1b2422';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - bw / 2, y - bh, bw, bh);

            // Sloped armored roof
            ctx.fillStyle = '#3a4a47';
            ctx.beginPath();
            ctx.moveTo(x - bw / 2, y - bh);
            ctx.lineTo(x - bw / 2 + 16 * z, y - bh - 16 * z);
            ctx.lineTo(x + bw / 2 - 16 * z, y - bh - 16 * z);
            ctx.lineTo(x + bw / 2, y - bh);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Armored Blast Door with Hazard Stripes
            const dw = 28 * z;
            const dh = 22 * z;
            ctx.fillStyle = '#111718';
            ctx.fillRect(x - dw / 2, y - dh, dw, dh);
            // Caution stripes
            ctx.fillStyle = '#f1c40f';
            ctx.fillRect(x - dw / 2, y - dh, dw, 4 * z);

            // Command Radar Dome (White hemisphere with glowing ring)
            const domeX = x - 18 * z;
            const domeY = y - bh - 18 * z;
            ctx.fillStyle = '#e8eeea';
            ctx.beginPath();
            ctx.arc(domeX, domeY, 14 * z, Math.PI, 0);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Communications Mast & Antenna with blinking red light
            const mastX = x + 24 * z;
            const mastY = y - bh - 32 * z;
            ctx.strokeStyle = '#cccccc';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(mastX, y - bh);
            ctx.lineTo(mastX, mastY);
            ctx.stroke();

            // Blinking beacon light
            ctx.fillStyle = Math.sin(this.animTick * 6.0) > 0 ? '#ff3344' : '#550011';
            ctx.beginPath();
            ctx.arc(mastX, mastY, 3 * z, 0, Math.PI * 2);
            ctx.fill();

            // Name Tag
            this.drawStructureTag(ctx, x, y - bh - 38 * z, 'QG CLANDESTINO', color, health, 500);
        }

        // B. WAR FACTORY (Heavy Vehicle & Tank Production Plant)
        drawWarFactory(ctx, x, y, z, color, health) {
            const bw = 96 * z;
            const bd = 64 * z;
            const bh = 36 * z;

            this.drawConcreteBasePad(ctx, x, y, bw + 22 * z, bd + 18 * z);

            // Drop shadow
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(x - bw / 2 + 10 * z, y - bd / 2 + 10 * z, bw, bd);

            // Heavy Factory Bay
            ctx.fillStyle = '#3a3e45';
            ctx.fillRect(x - bw / 2, y - bh, bw, bh);
            ctx.strokeStyle = '#202428';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - bw / 2, y - bh, bw, bh);

            // Industrial Corrugated Roof
            ctx.fillStyle = '#4c525c';
            ctx.fillRect(x - bw / 2 + 4 * z, y - bh - 8 * z, bw - 8 * z, 8 * z);

            // Giant Roll-up Vehicle Bay Door with yellow hazard frame
            const doorW = 44 * z;
            const doorH = 26 * z;
            const doorX = x - doorW / 2;
            const doorY = y - doorH;

            ctx.fillStyle = '#15171a'; // Dark bay interior
            ctx.fillRect(doorX, doorY, doorW, doorH);

            // Hazard border around bay door
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 3 * z;
            ctx.strokeRect(doorX, doorY, doorW, doorH);

            // Tank visible under construction inside the bay!
            ctx.fillStyle = '#2d4a36';
            ctx.fillRect(x - 14 * z, y - 14 * z, 28 * z, 12 * z);
            ctx.fillStyle = '#1c2e22';
            ctx.fillRect(x - 8 * z, y - 18 * z, 16 * z, 6 * z);

            // Twin Exhaust Stacks with Smoke Particles
            const s1X = x - bw / 2 + 12 * z;
            const s2X = x - bw / 2 + 20 * z;
            const sY = y - bh - 16 * z;

            ctx.fillStyle = '#22262a';
            ctx.fillRect(s1X, sY, 5 * z, 16 * z);
            ctx.fillRect(s2X, sY, 5 * z, 16 * z);

            if (Math.random() < 0.3) {
                this.addDustParticle(this.camX, this.camZ, 'rgba(120, 130, 140, 0.45)');
            }

            this.drawStructureTag(ctx, x, y - bh - 24 * z, 'FÁBRICA DE TANQUES', color, health, 500);
        }

        // C. BARRACKS / QUARTEL (Infantry Training Quarters)
        drawBarracks(ctx, x, y, z, color, health) {
            const bw = 68 * z;
            const bd = 48 * z;
            const bh = 28 * z;

            this.drawConcreteBasePad(ctx, x, y, bw + 16 * z, bd + 14 * z);

            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(x - bw / 2 + 8 * z, y - bd / 2 + 8 * z, bw, bd);

            // Barracks Walls (Military Khaki / Olive)
            ctx.fillStyle = '#484d3b';
            ctx.fillRect(x - bw / 2, y - bh, bw, bh);
            ctx.strokeStyle = '#2d3125';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - bw / 2, y - bh, bw, bh);

            // Sloped Green Metal Roof
            ctx.fillStyle = '#2d5a37';
            ctx.beginPath();
            ctx.moveTo(x - bw / 2 - 4 * z, y - bh);
            ctx.lineTo(x, y - bh - 16 * z);
            ctx.lineTo(x + bw / 2 + 4 * z, y - bh);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Sandbag perimeter at entrance
            ctx.strokeStyle = '#b09462';
            ctx.lineWidth = 4 * z;
            ctx.beginPath();
            ctx.arc(x, y, 16 * z, Math.PI * 0.1, Math.PI * 0.9);
            ctx.stroke();

            this.drawStructureTag(ctx, x, y - bh - 22 * z, 'QUARTEL DE TROPAS', color, health, 400);
        }

        // D. SUPPLY STASH (Resource Logistics Stash)
        drawSupplyStash(ctx, x, y, z, color, health) {
            const bw = 70 * z;
            const bd = 52 * z;
            this.drawConcreteBasePad(ctx, x, y, bw + 14 * z, bd + 14 * z);

            // Stacked Shipping Containers (Blue, Green, Desert Tan)
            // Container 1 (Blue)
            ctx.fillStyle = '#225277';
            ctx.fillRect(x - 28 * z, y - 24 * z, 30 * z, 18 * z);
            ctx.strokeStyle = '#122f46';
            ctx.strokeRect(x - 28 * z, y - 24 * z, 30 * z, 18 * z);

            // Container 2 (Green)
            ctx.fillStyle = '#2e5538';
            ctx.fillRect(x + 2 * z, y - 22 * z, 28 * z, 18 * z);
            ctx.strokeStyle = '#1a3220';
            ctx.strokeRect(x + 2 * z, y - 22 * z, 28 * z, 18 * z);

            // Container 3 on top (Tan)
            ctx.fillStyle = '#8f774a';
            ctx.fillRect(x - 14 * z, y - 38 * z, 30 * z, 16 * z);
            ctx.strokeStyle = '#55462a';
            ctx.strokeRect(x - 14 * z, y - 38 * z, 30 * z, 16 * z);

            // Oil Drums (Yellow)
            ctx.fillStyle = '#e67e22';
            ctx.beginPath();
            ctx.arc(x - 22 * z, y - 4 * z, 5 * z, 0, Math.PI * 2);
            ctx.arc(x - 12 * z, y - 4 * z, 5 * z, 0, Math.PI * 2);
            ctx.fill();

            this.drawStructureTag(ctx, x, y - 46 * z, 'DEPÓSITO DE RECURSOS', color, health, 350);
        }

        // E. POWER PLANT (Generator facility with pulsing plasma coil)
        drawPowerPlant(ctx, x, y, z, color, health) {
            const bw = 64 * z;
            const bd = 48 * z;
            const bh = 30 * z;

            this.drawConcreteBasePad(ctx, x, y, bw + 16 * z, bd + 14 * z);

            ctx.fillStyle = '#2c333a';
            ctx.fillRect(x - bw / 2, y - bh, bw, bh);
            ctx.strokeStyle = '#171c20';
            ctx.strokeRect(x - bw / 2, y - bh, bw, bh);

            // Pulsing Electrical Transformer Coils (Cyan Glow)
            const pulse = 0.5 + Math.sin(this.animTick * 8.0) * 0.5;
            ctx.fillStyle = `rgba(0, 229, 255, ${0.4 + pulse * 0.6})`;
            ctx.beginPath();
            ctx.arc(x, y - bh - 10 * z, 12 * z, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2 * z;
            ctx.stroke();

            this.drawStructureTag(ctx, x, y - bh - 28 * z, 'USINA DE ENERGIA', color, health, 300);
        }

        // F. DEFENSE TURRET (Hardened Pillbox with Twin Autocannons)
        drawDefenseTurret(ctx, x, y, z, color, health) {
            this.drawConcreteBasePad(ctx, x, y, 46 * z, 46 * z);

            // Concrete Pillbox
            ctx.fillStyle = '#404a4e';
            ctx.beginPath();
            ctx.arc(x, y - 8 * z, 16 * z, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#232b2e';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Rotating Twin Cannons
            const turretAngle = this.animTick * 1.2;
            const barrelLen = 22 * z;

            ctx.strokeStyle = '#181b1d';
            ctx.lineWidth = 4 * z;
            ctx.beginPath();
            ctx.moveTo(x - 3 * z, y - 8 * z);
            ctx.lineTo(x - 3 * z + Math.cos(turretAngle) * barrelLen, y - 8 * z + Math.sin(turretAngle) * barrelLen);
            ctx.moveTo(x + 3 * z, y - 8 * z);
            ctx.lineTo(x + 3 * z + Math.cos(turretAngle) * barrelLen, y - 8 * z + Math.sin(turretAngle) * barrelLen);
            ctx.stroke();

            // Turret Cap
            ctx.fillStyle = '#637278';
            ctx.beginPath();
            ctx.arc(x, y - 8 * z, 9 * z, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = color;
            ctx.fillRect(x - 3 * z, y - 11 * z, 6 * z, 6 * z);

            this.drawStructureTag(ctx, x, y - 32 * z, 'TORRE DE DEFESA', color, health, 350);
        }

        drawConcreteBasePad(ctx, x, y, w, d) {
            // Concrete Slab with Caution Edge Stripes
            ctx.fillStyle = '#555f65';
            ctx.fillRect(x - w / 2, y - d / 2, w, d);
            ctx.strokeStyle = '#3a4247';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x - w / 2, y - d / 2, w, d);

            // Yellow/Black corner hazard ticks
            const tickSize = 6 * this.zoom;
            ctx.fillStyle = '#f1c40f';
            ctx.fillRect(x - w / 2, y - d / 2, tickSize, tickSize);
            ctx.fillRect(x + w / 2 - tickSize, y - d / 2, tickSize, tickSize);
            ctx.fillRect(x - w / 2, y + d / 2 - tickSize, tickSize, tickSize);
            ctx.fillRect(x + w / 2 - tickSize, y + d / 2 - tickSize, tickSize);
        }

        drawStructureTag(ctx, x, y, name, color, health, maxHealth) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.max(10, Math.round(11 * this.zoom))}px ui-monospace, monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(name, x, y);

            // Health bar
            const bw = 50 * this.zoom;
            const bh = 4;
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(x - bw / 2, y + 4, bw, bh);
            ctx.fillStyle = '#00ff88';
            ctx.fillRect(x - bw / 2, y + 4, (bw * Math.max(0, health)) / maxHealth, bh);
            ctx.textAlign = 'left';
        }

        renderBuildGhost(ctx) {
            const g = this.buildGhost;
            const s = this.worldToScreen(g.worldX, g.worldZ, 0);
            const z = this.zoom;

            ctx.fillStyle = g.isValid ? 'rgba(0, 255, 136, 0.25)' : 'rgba(255, 60, 60, 0.3)';
            ctx.strokeStyle = g.isValid ? '#00ff88' : '#ff3344';
            ctx.lineWidth = 2;

            const size = 60 * z;
            ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size);
            ctx.strokeRect(s.x - size / 2, s.y - size / 2, size, size);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`CONSTRUIR: ${g.type.toUpperCase()}`, s.x, s.y - size / 2 - 8);
            ctx.textAlign = 'left';
        }

        // =========================================================================
        // 7. REALISTIC BATTLE TANKS & MILITARY UNITS
        // =========================================================================

        renderUnit(ctx, unit, isSelected, localPlayerId, playerRegistry) {
            const loc = this.s2.latLonToLocalMeters(unit.lat, unit.lon, this.terrain.ORIGIN_LAT, this.terrain.ORIGIN_LON);
            const elev = this.terrain.getElevation(loc.x, loc.z);
            const s = this.worldToScreen(loc.x, loc.z, elev);
            const z = this.zoom;

            const isOwner = unit.owner === localPlayerId;
            const isDeserter = unit.owner === 'neutral_mercenary' || unit.contract_status === 'deserted';

            // Faction Team Color
            let teamColor = isDeserter ? '#e67e22' : (isOwner ? '#00d9ff' : '#ff3b30');
            if (playerRegistry && playerRegistry[unit.owner]) {
                teamColor = playerRegistry[unit.owner].color || teamColor;
            }

            // A. Selection Decal on Ground
            if (isSelected) {
                this.drawSelectionDecal(ctx, s.x, s.y, z, '#00ff88');
            }

            // Calculate Facing Angle
            let angle = unit.facing_angle || 0;
            if (unit.target_lat && unit.is_moving) {
                const targetLoc = this.s2.latLonToLocalMeters(unit.target_lat, unit.target_lon, this.terrain.ORIGIN_LAT, this.terrain.ORIGIN_LON);
                angle = Math.atan2(targetLoc.z - loc.z, targetLoc.x - loc.x);
                unit.facing_angle = angle;
            }

            // Spawn movement dust
            if (unit.is_moving && Math.random() < 0.4) {
                this.addDustParticle(loc.x, loc.z, 'rgba(160, 150, 130, 0.35)');
            }

            // Draw unit type
            const type = unit.type || 'infantry_scout';
            if (type === 'tank_battle' || type === 'tank_heavy') {
                this.drawBattleTank(ctx, s.x, s.y, z, angle, teamColor, isSelected);
            } else if (type === 'vehicle_technical') {
                this.drawTechnicalVehicle(ctx, s.x, s.y, z, angle, teamColor, isSelected);
            } else {
                this.drawInfantrySoldier(ctx, s.x, s.y, z, angle, teamColor, unit, isSelected);
            }

            // B. Overhead Health & Status Badge
            this.drawUnitOverheadHUD(ctx, s.x, s.y, z, unit, isDeserter);
        }

        drawSelectionDecal(ctx, x, y, z, color) {
            const radX = 22 * z;
            const radY = 12 * z;

            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(x, y, radX, radY, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Tactical Corner Notches
            const notch = 6 * z;
            ctx.beginPath();
            ctx.moveTo(x - radX - notch, y); ctx.lineTo(x - radX + notch, y);
            ctx.moveTo(x + radX - notch, y); ctx.lineTo(x + radX + notch, y);
            ctx.moveTo(x, y - radY - notch); ctx.lineTo(x, y - radY + notch);
            ctx.moveTo(x, y + radY - notch); ctx.lineTo(x, y + radY + notch);
            ctx.stroke();
        }

        // BATTLE TANK (Armored Hull, Caterpillar Tracks, 360° Turret & Heavy Cannon)
        drawBattleTank(ctx, x, y, z, angle, color, isSelected) {
            ctx.save();
            ctx.translate(x, y);

            // 1. Drop Shadow under Tank
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.beginPath();
            ctx.ellipse(6 * z, 5 * z, 26 * z, 14 * z, 0, 0, Math.PI * 2);
            ctx.fill();

            // Rotate Hull to Movement Angle
            ctx.rotate(angle);

            // 2. Caterpillar Tracks (Left & Right continuous treads)
            const trackW = 44 * z;
            const trackH = 8 * z;

            ctx.fillStyle = '#1e2226'; // Dark metallic track
            // Left track
            ctx.fillRect(-trackW / 2, -18 * z, trackW, trackH);
            // Right track
            ctx.fillRect(-trackW / 2, 10 * z, trackW, trackH);

            // Tread Wheel Ridges
            ctx.strokeStyle = '#353c44';
            ctx.lineWidth = 1.5;
            for (let i = -trackW / 2 + 4 * z; i < trackW / 2; i += 6 * z) {
                ctx.beginPath();
                ctx.moveTo(i, -18 * z); ctx.lineTo(i, -10 * z);
                ctx.moveTo(i, 10 * z); ctx.lineTo(i, 18 * z);
                ctx.stroke();
            }

            // 3. Armored Tank Hull (Chassis with Sloping Glacis Plate)
            const hullW = 38 * z;
            const hullH = 22 * z;

            ctx.fillStyle = '#3c4e3e'; // Camo Military Green
            ctx.fillRect(-hullW / 2, -hullH / 2, hullW, hullH);
            ctx.strokeStyle = '#223023';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-hullW / 2, -hullH / 2, hullW, hullH);

            // Glacis Plate Slanted Front
            ctx.fillStyle = '#4c624e';
            ctx.beginPath();
            ctx.moveTo(hullW / 2, -hullH / 2);
            ctx.lineTo(hullW / 2 + 8 * z, 0);
            ctx.lineTo(hullW / 2, hullH / 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Rear Engine Vents
            ctx.fillStyle = '#1a221b';
            ctx.fillRect(-hullW / 2 + 2 * z, -6 * z, 6 * z, 12 * z);

            // 4. Rotating Turret with Long Cannon
            // Turret Base
            ctx.fillStyle = '#2c3a2e';
            ctx.beginPath();
            ctx.arc(0, 0, 11 * z, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Team Faction Color Stripe on Turret
            ctx.fillStyle = color;
            ctx.fillRect(-6 * z, -2 * z, 12 * z, 4 * z);

            // Long Heavy Gun Barrel extending forward
            const barrelLen = 30 * z;
            ctx.strokeStyle = '#18201a';
            ctx.lineWidth = 4.5 * z;
            ctx.beginPath();
            ctx.moveTo(4 * z, 0);
            ctx.lineTo(barrelLen, 0);
            ctx.stroke();

            // Muzzle Brake at the tip of the cannon
            ctx.fillStyle = '#0a0d0a';
            ctx.fillRect(barrelLen - 4 * z, -3.5 * z, 5 * z, 7 * z);

            // Commander Cupola Hatch
            ctx.fillStyle = '#526b55';
            ctx.beginPath();
            ctx.arc(-2 * z, -4 * z, 4 * z, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        // TECHNICAL VEHICLE (Armored Pick-up with Mounted Heavy DShK Gun)
        drawTechnicalVehicle(ctx, x, y, z, angle, color, isSelected) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(-16 * z, -8 * z, 32 * z, 16 * z);

            // 4 Rubber Tires
            ctx.fillStyle = '#111';
            ctx.fillRect(-14 * z, -12 * z, 8 * z, 5 * z);
            ctx.fillRect(8 * z, -12 * z, 8 * z, 5 * z);
            ctx.fillRect(-14 * z, 7 * z, 8 * z, 5 * z);
            ctx.fillRect(8 * z, 7 * z, 8 * z, 5 * z);

            // Truck Body
            ctx.fillStyle = '#7a6c53'; // Desert / Sand camo
            ctx.fillRect(-16 * z, -8 * z, 30 * z, 16 * z);

            // Windshield / Cabin
            ctx.fillStyle = '#2c3e50';
            ctx.fillRect(2 * z, -6 * z, 8 * z, 12 * z);

            // Mounted Machine Gun in Bed
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3 * z;
            ctx.beginPath();
            ctx.moveTo(-6 * z, 0);
            ctx.lineTo(14 * z, 0);
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(-6 * z, 0, 4 * z, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        // INFANTRY SOLDIER (Tactical Uniform, Helmet, Rifle, Walking Animation)
        drawInfantrySoldier(ctx, x, y, z, angle, color, unit, isSelected) {
            ctx.save();
            ctx.translate(x, y);

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            ctx.ellipse(0, 2 * z, 6 * z, 3 * z, 0, 0, Math.PI * 2);
            ctx.fill();

            // Walking leg animation cycle
            const walkStep = unit.is_moving ? Math.sin(this.animTick * 12.0) * 4 * z : 0;

            // Legs / Boots
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 2.5 * z;
            ctx.beginPath();
            ctx.moveTo(-2 * z, 0); ctx.lineTo(-2 * z, 6 * z + walkStep);
            ctx.moveTo(2 * z, 0); ctx.lineTo(2 * z, 6 * z - walkStep);
            ctx.stroke();

            // Tactical Body / Vest
            ctx.fillStyle = '#3a4a3b'; // Camo uniform
            ctx.fillRect(-4 * z, -12 * z, 8 * z, 12 * z);

            // Faction identification band
            ctx.fillStyle = color;
            ctx.fillRect(-4 * z, -8 * z, 8 * z, 3 * z);

            // Assault Rifle extending forward
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 2 * z;
            ctx.beginPath();
            ctx.moveTo(2 * z, -6 * z);
            ctx.lineTo(12 * z, -4 * z);
            ctx.stroke();

            // Helmet & Visor
            ctx.fillStyle = '#2d382e';
            ctx.beginPath();
            ctx.arc(0, -15 * z, 4.5 * z, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        drawUnitOverheadHUD(ctx, x, y, z, unit, isDeserter) {
            const barW = 24 * z;
            const barH = 3 * z;
            const barY = y - 24 * z;

            // Health bar
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(x - barW / 2, barY, barW, barH);
            ctx.fillStyle = isDeserter ? '#e67e22' : '#00ff88';
            ctx.fillRect(x - barW / 2, barY, (barW * (unit.health || 100)) / 100, barH);

            // Status Badge
            if (isDeserter) {
                ctx.fillStyle = '#e67e22';
                ctx.font = 'bold 9px ui-monospace, monospace';
                ctx.textAlign = 'center';
                ctx.fillText('🏴 MERCENÁRIO', x, barY - 4);
                ctx.textAlign = 'left';
            }
        }

        renderParticles(ctx) {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.radius += 0.25;
                p.alpha -= 0.02;
                if (p.alpha <= 0) {
                    this.particles.splice(i, 1);
                    continue;
                }

                const s = this.worldToScreen(p.x, p.z, 0);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.alpha;
                ctx.beginPath();
                ctx.arc(s.x, s.y, p.radius * this.zoom, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1.0;
            }
        }
    }

    exports.RTSRenderer = RTSRenderer;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.BigArmadaRenderer = {}));
