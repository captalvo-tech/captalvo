/**
 * BIG ARMADA — Main Client Application Controller (Captalvo Production Edition)
 * Handles user interactions, camera controls, unit selection, contextual orders,
 * SSE & Polling multiplayer synchronization with captalvo.online/api/big-armada.php,
 * and real-time tactical HUD updates.
 */

(function () {
    'use strict';

    const API_BASE = '/api/big-armada.php';

    let renderer = null;
    let worldState = { players: {}, units: {}, buildings: {}, installations: {}, alliances: {} };
    let localPlayer = null;
    let selectedUnitIds = [];
    let selectedInstallationId = null;

    let buildMode = null; // 'command_center', 'supply_stash', 'barracks'
    let eventSource = null;
    let pollingInterval = null;

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
                console.log('[BigArmadaClient] Conectado a captalvo.online como:', localPlayer.name);

                // Focus camera on player spawn point
                const spawnLocal = BigArmadaS2.latLonToLocalMeters(
                    localPlayer.spawn_lat,
                    localPlayer.spawn_lon,
                    BigArmadaTerrain.ORIGIN_LAT,
                    BigArmadaTerrain.ORIGIN_LON
                );
                renderer.camX = spawnLocal.x;
                renderer.camZ = spawnLocal.z;

                updateHUD();
            }
        } catch (err) {
            console.error('[BigArmadaClient] Falha ao registrar jogador:', err);
        }

        // 2. Connect to Server-Sent Events (SSE) & Fallback Polling
        connectSync();

        // 3. Start Render Loop (60 FPS)
        function loop() {
            renderer.render(worldState, selectedUnitIds, playerId);
            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
    }

    function connectSync() {
        // SSE Attempt
        try {
            eventSource = new EventSource(`${API_BASE}?action=events`);
            eventSource.addEventListener('tick', (e) => {
                const data = JSON.parse(e.data);
                if (data.snapshot) {
                    applySnapshot(data.snapshot);
                }
            });
            eventSource.onerror = () => {
                // If SSE is buffered or closed by proxy, keep polling active
            };
        } catch (e) {
            console.warn('[BigArmadaClient] SSE não suportado, usando polling contínuo.');
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
                showNotification(`🚩 Ordem de Captura transmitida para ${clickedInst.name}!`, '#ffaa00');
                return;
            }

            // 2. Check if clicked on a Neutral Mercenary -> RECRUIT ORDER
            const clickedUnit = findUnitAtScreen(e.clientX, e.clientY);
            if (clickedUnit && (clickedUnit.owner === 'neutral_mercenary' || clickedUnit.contract_status === 'deserted')) {
                executeRecruitMercenary(clickedUnit.id);
                return;
            }

            // 3. Regular Ground Move Order
            executeMoveOrder(selectedUnitIds, targetLatLon.lat, targetLatLon.lon, ground.x, ground.z);
            renderer.addWaypointPulse(ground.x, ground.z, '#00ff88');
        });

        // Zoom with Mouse Wheel
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1.15 : 0.85;
            renderer.zoom = Math.max(0.35, Math.min(2.5, renderer.zoom * delta));
        }, { passive: false });

        // WASD & Arrow Keys Keyboard Pan
        window.addEventListener('keydown', (e) => {
            const panSpeed = 35 / renderer.zoom;
            if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') renderer.camZ -= panSpeed;
            if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') renderer.camZ += panSpeed;
            if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') renderer.camX -= panSpeed;
            if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') renderer.camX += panSpeed;
            if (e.key === 'Escape') {
                buildMode = null;
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
            const dist = Math.hypot(screenX - s.x, screenY - s.y);
            if (dist < 26) {
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
            if (dist < 40) {
                found = inst;
            }
        });
        return found;
    }

    // --- ACTIONS EXECUTORS ---

    async function executeMoveOrder(unitIds, targetLat, targetLon, targetX, targetZ) {
        // Immediate local visual feedback
        unitIds.forEach(uId => {
            if (worldState.units && worldState.units[uId]) {
                worldState.units[uId].target_lat = targetLat;
                worldState.units[uId].target_lon = targetLon;
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
        const spawnLat = (localPlayer.spawn_lat || -19.7472) + (Math.random() - 0.5) * 0.002;
        const spawnLon = (localPlayer.spawn_lon || -47.9392) + (Math.random() - 0.5) * 0.002;

        const res = await apiPost('join', { playerId, playerName: localPlayer.name, color: localPlayer.color });
        if (res && res.snapshot) {
            worldState = res.snapshot;
            showNotification(`✓ Força militar contratada! Salários atualizados no setor.`, '#00d9ff');
            updateHUD();
        }
    }

    async function executeRecruitMercenary(targetUnitId) {
        const res = await apiPost('recruit', { unitId: targetUnitId });
        if (res && res.success) {
            showNotification(`✓ Mercenário neutro recrutado! Você assumiu o contrato militar.`, '#00ff88');
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
        if (hudPayroll) hudPayroll.innerText = `-$${Math.round(localPlayer.upkeep_last || 15)}`;

        const hudCashflow = document.getElementById('hud-cashflow');
        if (hudCashflow) {
            // Count controlled installations
            let bonus = 0;
            Object.values(worldState.installations || {}).forEach(inst => {
                if (inst.controller === playerId) bonus += (inst.income_bonus_per_tick || 50);
            });
            const net = bonus - (localPlayer.upkeep_last || 15);
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

                container.innerHTML = `
                    <div style="font-weight:700; color:${u.color || '#fff'}; font-size:13px; margin-bottom:8px;">
                        ${u.name}
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="color:#888;">Tipo:</span>
                        <span>${u.type.toUpperCase()}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="color:#888;">Status Contrato:</span>
                        <span style="color:${isDeserter ? '#e67e22' : (u.contract_status === 'overdue' ? '#ff3344' : '#00ff88')}; font-weight:700;">
                            ${isDeserter ? 'DESERTOR (MERCENÁRIO)' : (u.contract_status === 'overdue' ? 'SALÁRIO ATRASADO' : 'ATIVO')}
                        </span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="color:#888;">Camuflagem:</span>
                        <span style="color:#00ff88;">GLA STEALTH ATIVA</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="color:#888;">Integridade:</span>
                        <span>${u.health || 100} / 100</span>
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
                    <div style="font-weight:700; color:#ffaa00; font-size:13px; margin-bottom:8px;">
                        ${inst.name}
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="color:#888;">Controlador:</span>
                        <span style="color:${inst.flag_color || '#888'}; font-weight:700;">
                            ${inst.controller ? (isMine ? 'VOCÊ (Comandante)' : inst.controller) : 'NEUTRO / DISPONÍVEL'}
                        </span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="color:#888;">Progresso Captura:</span>
                        <span>${Math.round(inst.capture_progress || 0)}%</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="color:#888;">Bônus Econômico:</span>
                        <span style="color:#00ff88; font-weight:700;">+$${inst.income_bonus_per_tick || 50}/tick</span>
                    </div>
                    <div style="font-size:10px; color:#888; margin-top:10px; line-height:1.4;">
                        Instalação permanente do mundo real. Mantenha soldados no perímetro de 65m para capturar.
                    </div>
                `;
                return;
            }
        }

        container.innerHTML = `
            <div style="font-size:11px; color:#888; text-align:center; padding:20px 0;">
                Nenhuma unidade ou instalação selecionada.<br>
                <small>Clique em um soldado ou no Aeroporto para inspecionar.</small>
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
                showNotification(`Modo de Construção Ativo: Clique no mapa para posicionar ${type.toUpperCase()}`, '#00d9ff');
            });
        });

        // Produce buttons
        document.querySelectorAll('.btn-produce').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-type');
                executeProduceUnit(type);
            });
        });

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
                showNotification('+$1,000 adicionados ao tesouro!', '#00ff88');
            });
        }

        // Dev Testing: Trigger Default (Zero treasury & trigger overdue/desertion)
        const btnTriggerDefault = document.getElementById('btn-dev-trigger-default');
        if (btnTriggerDefault) {
            btnTriggerDefault.addEventListener('click', async () => {
                await apiPost('adjust_economy', { forceUnpaid: true });
                if (localPlayer) {
                    localPlayer.treasury = 0;
                    localPlayer.unpaid_ticks = (localPlayer.unpaid_ticks || 0) + 1;
                }
                updateHUD();
                showNotification('⚠️ Tesouro zerado! Próximos ciclos provocarão atraso salarial e deserção!', '#ff3344');
            });
        }

        // Dev Testing: Simulate Second Player
        const btnSimPlayer = document.getElementById('btn-dev-sim-player');
        if (btnSimPlayer) {
            btnSimPlayer.addEventListener('click', async () => {
                const simId = 'cmdr_rival_' + Math.floor(Math.random() * 900 + 100);
                await apiPost('join', { playerId: simId, playerName: 'Rival Tático Alfa', color: '#ffaa00' });
                showNotification(`👥 Segundo jogador simulado conectado: ${simId}!`, '#ffaa00');
            });
        }
    }

    function showNotification(text, color = '#00d9ff') {
        const container = document.getElementById('tac-notifications');
        if (!container) return;

        const notif = document.createElement('div');
        notif.style.background = 'rgba(2, 9, 14, 0.92)';
        notif.style.border = `1px solid ${color}`;
        notif.style.color = '#fff';
        notif.style.padding = '8px 14px';
        notif.style.borderRadius = '4px';
        notif.style.fontSize = '12px';
        notif.style.boxShadow = `0 4px 15px rgba(0,0,0,0.6), 0 0 10px ${color}33`;
        notif.style.transition = 'opacity 0.4s ease';
        notif.innerHTML = text;

        container.appendChild(notif);

        setTimeout(() => {
            notif.style.opacity = '0';
            setTimeout(() => notif.remove(), 400);
        }, 5000);
    }

    window.addEventListener('DOMContentLoaded', init);

})();
