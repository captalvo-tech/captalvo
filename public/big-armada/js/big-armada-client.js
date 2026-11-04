/**
 * BIG ARMADA — Main Client Application Controller (RTS Visual Edition)
 * Handles user interactions, camera controls, unit selection, contextual orders,
 * real-time movement interpolation (60 FPS), unit production (Battle Tanks, Infantry),
 * structure building with ghost placement grid, and radar tactical HUD.
 */

(function () {
    'use strict';

    const API_BASE = window.location.hostname.includes('github.io')
        ? 'https://captalvo.online/api/big-armada.php'
        : (window.__BIG_ARMADA_API_BASE__ || '/api/big-armada.php');

    let renderer = null;
    let worldState = { players: {}, units: {}, buildings: {}, installations: {}, alliances: {} };
    let localPlayer = null;
    let selectedUnitIds = [];
    let selectedInstallationId = null;

    let buildMode = null; // 'command_center', 'war_factory', 'barracks', 'supply_stash', 'power_plant', 'defense_turret'
    let eventSource = null;
    let pollingInterval = null;
    let lastFrameTime = performance.now();

    // Load or generate Player ID
    let playerId = localStorage.getItem('big_armada_player_id');
    if (!playerId) {
        playerId = 'cmdr_' + Math.random().toString(36).slice(2, 9);
        localStorage.setItem('big_armada_player_id', playerId);
    }
    const playerName = localStorage.getItem('big_armada_player_name') || `Comandante ${playerId.slice(5, 9).toUpperCase()}`;

    // Helper: Call API endpoint
    async function apiPost(action, data = {}) {
        try {
            const res = await fetch(`${API_BASE}?action=${encodeURIComponent(action)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({ action, playerId }, data))
            });
            return await res.json();
        } catch (err) {
            console.warn(`[BigArmadaAPI] Falha em ${action}:`, err);
            return { success: false, error: err.message };
        }
    }

    async function apiGetState() {
        try {
            const res = await fetch(`${API_BASE}?action=state&t=${Date.now()}`);
            return await res.json();
        } catch (err) {
            return null;
        }
    }

    // Initialize application
    async function init() {
        const canvas = document.getElementById('rts-canvas');
        if (!canvas) return;

        renderer = new BigArmadaRenderer.RTSRenderer(canvas, BigArmadaS2, BigArmadaTerrain);

        setupEventListeners(canvas);
        setupUIButtons();

        // 1. Join / Register on Authoritative Backend
        try {
            const joinRes = await apiPost('join', { playerName, color: '#00d9ff' });

            if (joinRes && joinRes.success) {
                localPlayer = joinRes.player;
                worldState = joinRes.snapshot;
                console.log('[BigArmadaClient] Conectado ao servidor autoritativo como:', localPlayer.name);

                // Focus camera directly on player's base and tank
                const spawnLocal = BigArmadaS2.latLonToLocalMeters(
                    localPlayer.spawn_lat,
                    localPlayer.spawn_lon,
                    BigArmadaTerrain.ORIGIN_LAT,
                    BigArmadaTerrain.ORIGIN_LON
                );
                renderer.camX = spawnLocal.x;
                renderer.camZ = spawnLocal.z;

                // Select player's initial battle tank automatically
                Object.values(worldState.units || {}).forEach(u => {
                    if (u.owner === playerId && u.type === 'tank_battle') {
                        selectedUnitIds = [u.id];
                    }
                });

                updateHUD();
                updateInspector();
            }
        } catch (err) {
            console.error('[BigArmadaClient] Falha ao registrar jogador:', err);
        }

        // 2. Connect to Server-Sent Events (SSE) & Fallback Polling
        connectSync();

        // 3. Start 60 FPS Render & Simulation Loop
        function loop(timestamp) {
            const dt = Math.min(0.1, (timestamp - lastFrameTime) / 1000.0);
            lastFrameTime = timestamp;

            // Smooth 60 FPS unit movement step
            stepUnitPositions(dt);

            // Render 3D isometric RTS scene
            renderer.render(worldState, selectedUnitIds, playerId);

            // Render Radar Mini-Map
            renderRadar();

            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
    }

    function stepUnitPositions(dt) {
        if (!worldState.units) return;

        Object.values(worldState.units).forEach(u => {
            if (u.is_moving && u.target_lat && u.target_lon) {
                const currentMeters = BigArmadaS2.latLonToLocalMeters(u.lat, u.lon, BigArmadaTerrain.ORIGIN_LAT, BigArmadaTerrain.ORIGIN_LON);
                const targetMeters = BigArmadaS2.latLonToLocalMeters(u.target_lat, u.target_lon, BigArmadaTerrain.ORIGIN_LAT, BigArmadaTerrain.ORIGIN_LON);

                const dx = targetMeters.x - currentMeters.x;
                const dz = targetMeters.z - currentMeters.z;
                const dist = Math.hypot(dx, dz);

                const speed = (u.speed_ms || 4.0) * 18.0; // Scaled RTS gameplay speed
                const step = speed * dt;

                if (dist <= step) {
                    u.lat = u.target_lat;
                    u.lon = u.target_lon;
                    u.is_moving = false;
                } else {
                    const nx = currentMeters.x + (dx / dist) * step;
                    const nz = currentMeters.z + (dz / dist) * step;
                    const newLatLon = BigArmadaS2.localMetersToLatLon(nx, nz, BigArmadaTerrain.ORIGIN_LAT, BigArmadaTerrain.ORIGIN_LON);
                    u.lat = newLatLon.lat;
                    u.lon = newLatLon.lon;
                    u.facing_angle = Math.atan2(dz, dx);
                }
            }
        });
    }

    function connectSync() {
        try {
            eventSource = new EventSource(`${API_BASE}?action=events`);
            eventSource.addEventListener('tick', (e) => {
                const data = JSON.parse(e.data);
                if (data.snapshot) {
                    applySnapshot(data.snapshot);
                }
            });
        } catch (e) {
            console.warn('[BigArmadaClient] SSE indisponível, usando sincronização via polling.');
        }

        // Polling sync every 1500ms
        pollingInterval = setInterval(async () => {
            const res = await apiGetState();
            if (res && res.snapshot) {
                applySnapshot(res.snapshot);
            }
        }, 1500);
    }

    function applySnapshot(newSnapshot) {
        // Preserve local moving waypoints to prevent snapping during animation
        if (newSnapshot.units && worldState.units) {
            Object.keys(newSnapshot.units).forEach(uId => {
                const localU = worldState.units[uId];
                if (localU && localU.is_moving) {
                    newSnapshot.units[uId].is_moving = true;
                    newSnapshot.units[uId].target_lat = localU.target_lat;
                    newSnapshot.units[uId].target_lon = localU.target_lon;
                    newSnapshot.units[uId].lat = localU.lat;
                    newSnapshot.units[uId].lon = localU.lon;
                }
            });
        }

        worldState = newSnapshot;
        if (worldState.players && worldState.players[playerId]) {
            localPlayer = worldState.players[playerId];
        }
        updateHUD();
        updateInspector();
    }

    function setupEventListeners(canvas) {
        // Panning with Right Mouse Button or Middle Click
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 2 && !e.ctrlKey)) {
                renderer.isPanning = true;
                renderer.lastMouseX = e.clientX;
                renderer.lastMouseY = e.clientY;
                e.preventDefault();
            } else if (e.button === 0) {
                // Left Click: Selection or Build Placement
                const ground = renderer.screenToWorld(e.clientX, e.clientY);

                if (buildMode) {
                    executeBuildStructure(buildMode, ground.x, ground.z);
                    buildMode = null;
                    renderer.buildGhost = null;
                    canvas.style.cursor = 'crosshair';
                    return;
                }

                // Check click on units
                const clickedUnit = findUnitAtScreen(e.clientX, e.clientY);
                if (clickedUnit) {
                    if (e.shiftKey) {
                        if (!selectedUnitIds.includes(clickedUnit.id)) selectedUnitIds.push(clickedUnit.id);
                    } else {
                        selectedUnitIds = [clickedUnit.id];
                    }
                    selectedInstallationId = null;
                    updateInspector();
                    return;
                }

                // Check click on installations
                const clickedInst = findInstallationAtScreen(e.clientX, e.clientY);
                if (clickedInst) {
                    selectedInstallationId = clickedInst.id;
                    updateInspector();
                    return;
                }

                // Start Selection Box drag
                renderer.isSelecting = true;
                renderer.selectStartX = e.clientX;
                renderer.selectStartY = e.clientY;
                renderer.selectCurrentX = e.clientX;
                renderer.selectCurrentY = e.clientY;
            }
        });

        window.addEventListener('mousemove', (e) => {
            // Update Ghost Build Preview
            if (buildMode) {
                const ground = renderer.screenToWorld(e.clientX, e.clientY);
                renderer.buildGhost = {
                    type: buildMode,
                    worldX: ground.x,
                    worldZ: ground.z,
                    isValid: true
                };
            } else {
                renderer.buildGhost = null;
            }

            if (renderer.isPanning) {
                const dx = (e.clientX - renderer.lastMouseX) / renderer.zoom;
                const dz = (e.clientY - renderer.lastMouseY) / (renderer.zoom * Math.cos(renderer.pitch));
                renderer.camX -= dx;
                renderer.camZ -= dz;
                renderer.lastMouseX = e.clientX;
                renderer.lastMouseY = e.clientY;
            } else if (renderer.isSelecting) {
                renderer.selectCurrentX = e.clientX;
                renderer.selectCurrentY = e.clientY;
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (renderer.isPanning) {
                renderer.isPanning = false;
            }
            if (renderer.isSelecting) {
                renderer.isSelecting = false;
                // Select all units inside box
                const x1 = Math.min(renderer.selectStartX, renderer.selectCurrentX);
                const x2 = Math.max(renderer.selectStartX, renderer.selectCurrentX);
                const y1 = Math.min(renderer.selectStartY, renderer.selectCurrentY);
                const y2 = Math.max(renderer.selectStartY, renderer.selectCurrentY);

                if (Math.abs(x2 - x1) > 6 && Math.abs(y2 - y1) > 6) {
                    selectedUnitIds = [];
                    Object.values(worldState.units || {}).forEach(u => {
                        const loc = BigArmadaS2.latLonToLocalMeters(u.lat, u.lon, BigArmadaTerrain.ORIGIN_LAT, BigArmadaTerrain.ORIGIN_LON);
                        const s = renderer.worldToScreen(loc.x, loc.z, BigArmadaTerrain.getElevation(loc.x, loc.z));
                        if (s.x >= x1 && s.x <= x2 && s.y >= y1 && s.y <= y2) {
                            if (u.owner === playerId) {
                                selectedUnitIds.push(u.id);
                            }
                        }
                    });
                    updateInspector();
                }
            }
        });

        // Contextual Right Click: Move, Capture, or Recruit Order
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (selectedUnitIds.length === 0) return;

            const ground = renderer.screenToWorld(e.clientX, e.clientY);
            const targetLatLon = BigArmadaS2.localMetersToLatLon(ground.x, ground.z, BigArmadaTerrain.ORIGIN_LAT, BigArmadaTerrain.ORIGIN_LON);

            // 1. Check if clicked on a Strategic Installation -> CAPTURE ORDER
            const clickedInst = findInstallationAtScreen(e.clientX, e.clientY);
            if (clickedInst) {
                executeCaptureOrder(selectedUnitIds, clickedInst);
                renderer.addWaypointPulse(ground.x, ground.z, '#ffaa00');
                showNotification(`🚩 Ordem de Marcha e Captura transmitida para ${clickedInst.name}!`, '#ffaa00');
                return;
            }

            // 2. Check if clicked on a Neutral Mercenary -> RECRUIT ORDER
            const clickedUnit = findUnitAtScreen(e.clientX, e.clientY);
            if (clickedUnit && (clickedUnit.owner === 'neutral_mercenary' || clickedUnit.contract_status === 'deserted')) {
                executeRecruitMercenary(clickedUnit.id);
                return;
            }

            // 3. Regular Ground Move Order for selected units
            executeMoveOrder(selectedUnitIds, targetLatLon.lat, targetLatLon.lon, ground.x, ground.z);
            renderer.addWaypointPulse(ground.x, ground.z, '#00ff88');
        });

        // Zoom with Mouse Wheel
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1.15 : 0.85;
            renderer.zoom = Math.max(0.4, Math.min(2.5, renderer.zoom * delta));
        }, { passive: false });

        // Keyboard Pan & Escape
        window.addEventListener('keydown', (e) => {
            const panSpeed = 35 / renderer.zoom;
            if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') renderer.camZ -= panSpeed;
            if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') renderer.camZ += panSpeed;
            if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') renderer.camX -= panSpeed;
            if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') renderer.camX += panSpeed;
            if (e.key === 'Escape') {
                buildMode = null;
                renderer.buildGhost = null;
                selectedUnitIds = [];
                selectedInstallationId = null;
                canvas.style.cursor = 'crosshair';
                updateInspector();
            }
        });
    }

    function findUnitAtScreen(screenX, screenY) {
        let found = null;
        Object.values(worldState.units || {}).forEach(u => {
            const loc = BigArmadaS2.latLonToLocalMeters(u.lat, u.lon, BigArmadaTerrain.ORIGIN_LAT, BigArmadaTerrain.ORIGIN_LON);
            const s = renderer.worldToScreen(loc.x, loc.z, BigArmadaTerrain.getElevation(loc.x, loc.z));
            const hitRadius = u.type === 'tank_battle' ? 32 : 24;
            const dist = Math.hypot(screenX - s.x, screenY - s.y);
            if (dist < hitRadius) {
                found = u;
            }
        });
        return found;
    }

    function findInstallationAtScreen(screenX, screenY) {
        let found = null;
        Object.values(worldState.installations || {}).forEach(inst => {
            const loc = BigArmadaS2.latLonToLocalMeters(inst.lat, inst.lon, BigArmadaTerrain.ORIGIN_LAT, BigArmadaTerrain.ORIGIN_LON);
            const s = renderer.worldToScreen(loc.x, loc.z, BigArmadaTerrain.getElevation(loc.x, loc.z));
            const dist = Math.hypot(screenX - s.x, screenY - s.y);
            if (dist < 48) {
                found = inst;
            }
        });
        return found;
    }

    // --- ACTIONS EXECUTORS ---

    async function executeMoveOrder(unitIds, targetLat, targetLon, targetX, targetZ) {
        // Immediate local responsive feedback
        unitIds.forEach((uId, idx) => {
            if (worldState.units && worldState.units[uId]) {
                // Slight formation spacing for multiple units
                const angle = (idx / Math.max(1, unitIds.length)) * Math.PI * 2;
                const offsetLat = Math.cos(angle) * 0.00015;
                const offsetLon = Math.sin(angle) * 0.00015;

                worldState.units[uId].target_lat = targetLat + offsetLat;
                worldState.units[uId].target_lon = targetLon + offsetLon;
                worldState.units[uId].is_moving = true;
            }
        });

        await apiPost('move', { unitIds, targetLat, targetLon, targetX, targetZ });
    }

    async function executeCaptureOrder(soldierIds, installation) {
        const instLoc = BigArmadaS2.latLonToLocalMeters(installation.lat, installation.lon, BigArmadaTerrain.ORIGIN_LAT, BigArmadaTerrain.ORIGIN_LON);
        executeMoveOrder(soldierIds, installation.lat, installation.lon, instLoc.x, instLoc.z);
    }

    async function executeBuildStructure(type, worldX, worldZ) {
        const latLon = BigArmadaS2.localMetersToLatLon(worldX, worldZ, BigArmadaTerrain.ORIGIN_LAT, BigArmadaTerrain.ORIGIN_LON);
        const res = await apiPost('build', { type, lat: latLon.lat, lon: latLon.lon });

        if (res && res.success) {
            showNotification(`✓ Estrutura ${type.toUpperCase()} construída com sucesso!`, '#00ff88');
            renderer.addWaypointPulse(worldX, worldZ, '#00d9ff');
            if (res.building) {
                worldState.buildings = worldState.buildings || {};
                worldState.buildings[res.building.id] = res.building;
            }
            if (localPlayer && res.treasury !== undefined) {
                localPlayer.treasury = res.treasury;
                updateHUD();
            }
        } else {
            showNotification(`❌ Falha: ${res.error || 'Não foi possível construir'}`, '#ff3344');
        }
    }

    async function executeProduceUnit(type) {
        if (!localPlayer) return;

        const res = await apiPost('produce', { type });
        if (res && res.success) {
            if (res.unit) {
                worldState.units = worldState.units || {};
                worldState.units[res.unit.id] = res.unit;
                selectedUnitIds = [res.unit.id]; // Auto-select new unit
            }
            if (res.treasury !== undefined) {
                localPlayer.treasury = res.treasury;
            }
            const unitName = res.unit ? res.unit.name : type.toUpperCase();
            showNotification(`🛡️ ${unitName} fabricado e pronto para o combate!`, '#00ff88');
            updateHUD();
            updateInspector();
        } else {
            showNotification(`❌ Falha: ${res.error || 'Fundos insuficientes'}`, '#ff3344');
        }
    }

    async function executeRecruitMercenary(targetUnitId) {
        const res = await apiPost('recruit', { unitId: targetUnitId });
        if (res && res.success) {
            showNotification(`✓ Mercenário neutro contratado! Você assumiu o contrato militar.`, '#00ff88');
            selectedUnitIds = [targetUnitId];
            if (res.unit && worldState.units) {
                worldState.units[targetUnitId] = res.unit;
            }
            if (localPlayer && res.treasury !== undefined) {
                localPlayer.treasury = res.treasury;
            }
            updateHUD();
            updateInspector();
        } else {
            showNotification(`❌ ${res.error || 'Falha ao recrutar'}`, '#ffaa00');
        }
    }

    function updateHUD() {
        if (!localPlayer) return;

        const hudTreasury = document.getElementById('hud-treasury');
        if (hudTreasury) hudTreasury.innerText = `$${Math.round(localPlayer.treasury).toLocaleString()}`;

        const hudPayroll = document.getElementById('hud-payroll');
        if (hudPayroll) hudPayroll.innerText = `-$${Math.round(localPlayer.upkeep_last || 45)}/tick`;

        const hudCashflow = document.getElementById('hud-cashflow');
        if (hudCashflow) {
            let bonus = 0;
            Object.values(worldState.installations || {}).forEach(inst => {
                if (inst.controller === playerId) bonus += (inst.income_bonus_per_tick || 60);
            });
            Object.values(worldState.buildings || {}).forEach(bld => {
                if (bld.owner === playerId) bonus += (bld.income_per_tick || 10);
            });
            const net = bonus - (localPlayer.upkeep_last || 45);
            hudCashflow.innerText = `${net >= 0 ? '+' : ''}$${Math.round(net)}/tick`;
            hudCashflow.style.color = net >= 0 ? '#00ff88' : '#ff3344';
        }

        const alertBadge = document.getElementById('hud-alert-badge');
        if (alertBadge) {
            if ((localPlayer.unpaid_ticks || 0) > 0) {
                alertBadge.style.display = 'inline-flex';
                alertBadge.innerText = `⚠️ INADIMPLÊNCIA (${localPlayer.unpaid_ticks} ticks sem soldo)`;
            } else {
                alertBadge.style.display = 'none';
            }
        }
    }

    function updateInspector() {
        const container = document.getElementById('inspector-content');
        if (!container) return;

        if (selectedUnitIds.length > 0) {
            const u = worldState.units ? worldState.units[selectedUnitIds[0]] : null;
            if (u) {
                const isMine = u.owner === playerId;
                const isDeserter = u.owner === 'neutral_mercenary' || u.contract_status === 'deserted';
                const isTank = u.type === 'tank_battle';

                container.innerHTML = `
                    <div style="font-weight:800; color:${u.color || '#fff'}; font-size:14px; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                        <span>${isTank ? '🛡️' : '🪖'}</span>
                        <span>${u.name}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:11px;">
                        <span style="color:#888;">Classe:</span>
                        <strong style="color:#00ff88;">${isTank ? 'BLINDADO DE LINHA' : 'INFANTARIA'}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:11px;">
                        <span style="color:#888;">Armamento:</span>
                        <span>${isTank ? 'Canhão 120mm Heavy' : 'Fuzil Tático 5.56mm'}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:11px;">
                        <span style="color:#888;">Blindagem / HP:</span>
                        <span>${u.health || (isTank ? 400 : 100)} / ${u.max_health || (isTank ? 400 : 100)}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:11px;">
                        <span style="color:#888;">Contrato Militar:</span>
                        <span style="color:${isDeserter ? '#e67e22' : '#00ff88'}; font-weight:700;">
                            ${isDeserter ? 'DESERTOR (MERCENÁRIO)' : 'ATIVO &bull; SOLDO EM DIA'}
                        </span>
                    </div>
                    ${isDeserter ? `
                        <button id="btn-inspect-recruit" class="tac-btn success" style="margin-top:10px; width:100%;">
                            🤝 Contratar Mercenário ($100)
                        </button>
                    ` : ''}
                `;

                const btnRecruit = document.getElementById('btn-inspect-recruit');
                if (btnRecruit) {
                    btnRecruit.addEventListener('click', () => executeRecruitMercenary(u.id));
                }
                return;
            }
        }

        if (selectedInstallationId) {
            const inst = worldState.installations ? worldState.installations[selectedInstallationId] : null;
            if (inst) {
                const isMine = inst.controller === playerId;
                container.innerHTML = `
                    <div style="font-weight:800; color:#ffaa00; font-size:13px; margin-bottom:8px;">
                        ✈️ ${inst.name}
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:11px;">
                        <span style="color:#888;">Controlador:</span>
                        <span style="color:${inst.flag_color || '#888'}; font-weight:700;">
                            ${inst.controller ? (isMine ? 'VOCÊ (Comandante)' : inst.controller) : 'NEUTRO'}
                        </span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:11px;">
                        <span style="color:#888;">Progresso:</span>
                        <span>${Math.round(inst.capture_progress || 0)}%</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:11px;">
                        <span style="color:#888;">Renda por Tick:</span>
                        <span style="color:#00ff88; font-weight:700;">+$${inst.income_bonus_per_tick || 60}/tick</span>
                    </div>
                `;
                return;
            }
        }

        container.innerHTML = `
            <div style="font-size:11px; color:#888; text-align:center; padding:24px 0;">
                Nenhuma unidade ou instalação selecionada.<br>
                <small>Clique em um tanque, soldado ou no Aeroporto para inspecionar.</small>
            </div>
        `;
    }

    function setupUIButtons() {
        // Build buttons
        document.querySelectorAll('.btn-build').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-type');
                buildMode = type;
                document.getElementById('rts-canvas').style.cursor = 'cell';
                showNotification(`🏗️ MODO CONSTRUÇÃO: Clique no terreno para posicionar ${type.toUpperCase()}`, '#00d9ff');
            });
        });

        // Produce buttons
        document.querySelectorAll('.btn-produce').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-type');
                executeProduceUnit(type);
            });
        });

        // Quick Base Target Button
        const btnQuickBase = document.getElementById('btn-quick-base');
        if (btnQuickBase) {
            btnQuickBase.addEventListener('click', () => {
                if (localPlayer) {
                    const loc = BigArmadaS2.latLonToLocalMeters(localPlayer.spawn_lat, localPlayer.spawn_lon, BigArmadaTerrain.ORIGIN_LAT, BigArmadaTerrain.ORIGIN_LON);
                    renderer.camX = loc.x;
                    renderer.camZ = loc.z;
                }
            });
        }

        // Quick Airport Target Button
        const btnQuickAirport = document.getElementById('btn-quick-airport');
        if (btnQuickAirport) {
            btnQuickAirport.addEventListener('click', () => {
                const airport = worldState.installations ? worldState.installations['inst_uberaba_airport'] : null;
                if (airport) {
                    const loc = BigArmadaS2.latLonToLocalMeters(airport.lat, airport.lon, BigArmadaTerrain.ORIGIN_LAT, BigArmadaTerrain.ORIGIN_LON);
                    renderer.camX = loc.x;
                    renderer.camZ = loc.z;
                    selectedInstallationId = airport.id;
                    updateInspector();
                }
            });
        }

        // Dev Testing: Add $1,000 Funds
        const btnAddFunds = document.getElementById('btn-dev-add-funds');
        if (btnAddFunds) {
            btnAddFunds.addEventListener('click', async () => {
                await apiPost('adjust_economy', { delta: 1000 });
                if (localPlayer) localPlayer.treasury += 1000;
                updateHUD();
                showNotification('+$1,000 creditados ao tesouro!', '#00ff88');
            });
        }

        // Dev Testing: Trigger Default
        const btnTriggerDefault = document.getElementById('btn-dev-trigger-default');
        if (btnTriggerDefault) {
            btnTriggerDefault.addEventListener('click', async () => {
                await apiPost('adjust_economy', { forceUnpaid: true });
                if (localPlayer) {
                    localPlayer.treasury = 0;
                    localPlayer.unpaid_ticks = (localPlayer.unpaid_ticks || 0) + 1;
                }
                updateHUD();
                showNotification('⚠️ Caixa zerado! Observe as tropas desertarem.', '#ff3344');
            });
        }

        // Dev Testing: Simulate Second Player
        const btnSimPlayer = document.getElementById('btn-dev-sim-player');
        if (btnSimPlayer) {
            btnSimPlayer.addEventListener('click', async () => {
                const simId = 'cmdr_rival_' + Math.floor(Math.random() * 900 + 100);
                await apiPost('join', { playerId: simId, playerName: 'Rival Tático Alfa', color: '#ffaa00' });
                showNotification(`👥 Segundo exército rival gerado: ${simId}!`, '#ffaa00');
            });
        }
    }

    function renderRadar() {
        const radarCanvas = document.getElementById('radar-canvas');
        if (!radarCanvas) return;
        const rctx = radarCanvas.getContext('2d');
        const rw = radarCanvas.width;
        const rh = radarCanvas.height;

        rctx.fillStyle = '#0e1810';
        rctx.fillRect(0, 0, rw, rh);

        // Radar grid circles
        rctx.strokeStyle = 'rgba(0, 255, 136, 0.2)';
        rctx.lineWidth = 1;
        rctx.beginPath();
        rctx.arc(rw / 2, rh / 2, rw * 0.45, 0, Math.PI * 2);
        rctx.arc(rw / 2, rh / 2, rw * 0.25, 0, Math.PI * 2);
        rctx.stroke();

        // Crosshair lines
        rctx.beginPath();
        rctx.moveTo(rw / 2, 0); rctx.lineTo(rw / 2, rh);
        rctx.moveTo(0, rh / 2); rctx.lineTo(rw, rh / 2);
        rctx.stroke();

        // Airport Runway line on radar
        const air = BigArmadaTerrain.AIRPORT_LOCAL;
        const scale = 0.024;
        const rx = rw / 2 + (air.x - renderer.camX) * scale;
        const rz = rh / 2 + (air.z - renderer.camZ) * scale;

        rctx.strokeStyle = '#ffffff';
        rctx.lineWidth = 2.5;
        rctx.beginPath();
        rctx.moveTo(rx, rz - 14);
        rctx.lineTo(rx, rz + 14);
        rctx.stroke();

        // Buildings on radar (small squares)
        if (worldState.buildings) {
            Object.values(worldState.buildings).forEach(b => {
                const bM = BigArmadaS2.latLonToLocalMeters(b.lat, b.lon, BigArmadaTerrain.ORIGIN_LAT, BigArmadaTerrain.ORIGIN_LON);
                const bx = rw / 2 + (bM.x - renderer.camX) * scale;
                const bz = rh / 2 + (bM.z - renderer.camZ) * scale;
                if (bx >= 0 && bx <= rw && bz >= 0 && bz <= rh) {
                    rctx.fillStyle = b.owner === playerId ? '#00ff88' : '#ffaa00';
                    rctx.fillRect(bx - 3, bz - 3, 6, 6);
                }
            });
        }

        // Units on radar (blips)
        if (worldState.units) {
            Object.values(worldState.units).forEach(u => {
                const uM = BigArmadaS2.latLonToLocalMeters(u.lat, u.lon, BigArmadaTerrain.ORIGIN_LAT, BigArmadaTerrain.ORIGIN_LON);
                const ux = rw / 2 + (uM.x - renderer.camX) * scale;
                const uz = rh / 2 + (uM.z - renderer.camZ) * scale;
                if (ux >= 0 && ux <= rw && uz >= 0 && uz <= rh) {
                    rctx.fillStyle = u.owner === playerId ? '#00d9ff' : '#ff3344';
                    rctx.beginPath();
                    rctx.arc(ux, uz, u.type === 'tank_battle' ? 3.5 : 2, 0, Math.PI * 2);
                    rctx.fill();
                }
            });
        }

        // Radar Sweep beam
        const sweepAngle = renderer.animTick * 2.0;
        rctx.strokeStyle = 'rgba(0, 255, 136, 0.4)';
        rctx.lineWidth = 1.5;
        rctx.beginPath();
        rctx.moveTo(rw / 2, rh / 2);
        rctx.lineTo(rw / 2 + Math.cos(sweepAngle) * rw * 0.45, rh / 2 + Math.sin(sweepAngle) * rh * 0.45);
        rctx.stroke();
    }

    function showNotification(text, color = '#00ff88') {
        const container = document.getElementById('tac-notifications');
        if (!container) return;

        const notif = document.createElement('div');
        notif.style.background = 'rgba(12, 20, 15, 0.95)';
        notif.style.border = `1.5px solid ${color}`;
        notif.style.color = '#fff';
        notif.style.padding = '10px 16px';
        notif.style.borderRadius = '5px';
        notif.style.fontSize = '12px';
        notif.style.fontWeight = '700';
        notif.style.boxShadow = `0 6px 20px rgba(0,0,0,0.7), 0 0 12px ${color}44`;
        notif.style.transition = 'opacity 0.35s ease';
        notif.innerHTML = text;

        container.appendChild(notif);

        setTimeout(() => {
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 350);
        }, 4500);
    }

    window.addEventListener('DOMContentLoaded', init);

})();
