/**
 * CAPTALVO — PROJETO SCORPION
 * Interface de Auditoria, Verificação e Auto-Reparo de Arquivos
 */

(function () {
    'use strict';

    let serverCatalog = null;
    let localFilesMap = new Map();
    let currentDirHandles = { GeneralsZH: null, Generals: null };
    let isRepairingBatch = false;

    // Helper: format bytes to human readable
    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Helper: open IndexedDB for scorpion
    function openScorpionDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('captalvo_scorpion', 1);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains('directories')) {
                    req.result.createObjectStore('directories');
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    // Load saved directory handles from IndexedDB
    async function getSavedDirHandles() {
        try {
            const db = await openScorpionDB();
            return new Promise((resolve) => {
                const tx = db.transaction('directories', 'readonly');
                const store = tx.objectStore('directories');
                const handles = { GeneralsZH: null, Generals: null };

                const reqZH = store.get('GeneralsZH');
                reqZH.onsuccess = () => { handles.GeneralsZH = reqZH.result; };

                const reqGen = store.get('Generals');
                reqGen.onsuccess = () => { handles.Generals = reqGen.result; };

                tx.oncomplete = () => resolve(handles);
                tx.onerror = () => resolve(handles);
            });
        } catch (e) {
            console.debug('[ScorpionRepair] IndexedDB inaccessible', e);
            return { GeneralsZH: null, Generals: null };
        }
    }

    // Fetch server catalog from API
    async function fetchCatalog() {
        try {
            const res = await fetch('/api/repair.php?action=catalog');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            serverCatalog = await res.json();
            return serverCatalog;
        } catch (err) {
            console.error('[ScorpionRepair] Falha ao obter catálogo:', err);
            return null;
        }
    }

    // Scan directory handle for .big archives
    async function scanDirectory(handle, mountName) {
        if (!handle) return;
        try {
            for await (const [name, entry] of handle.entries()) {
                if (entry.kind === 'file' && name.toLowerCase().endsWith('.big')) {
                    const file = await entry.getFile();
                    localFilesMap.set(name.toLowerCase(), {
                        name: name,
                        mount: mountName,
                        size: file.size,
                        file: file,
                        handle: entry
                    });
                }
            }
        } catch (err) {
            console.warn(`[ScorpionRepair] Erro ao escanear ${mountName}:`, err);
        }
    }

    // Full scan of all available local files
    async function refreshLocalScan() {
        localFilesMap.clear();
        currentDirHandles = await getSavedDirHandles();
        if (currentDirHandles.GeneralsZH) {
            await scanDirectory(currentDirHandles.GeneralsZH, 'GeneralsZH');
        }
        if (currentDirHandles.Generals) {
            await scanDirectory(currentDirHandles.Generals, 'Generals');
        }
    }

    // Build repair table UI
    async function renderRepairUI(filterMount = 'all') {
        const tbody = document.getElementById('scorpion-repair-tbody');
        if (!tbody) return;

        if (!serverCatalog) {
            await fetchCatalog();
        }
        await refreshLocalScan();

        tbody.innerHTML = '';

        if (!serverCatalog || !serverCatalog.archives) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#ff5555;">Servidor de reparo offline ou inacessível.</td></tr>';
            return;
        }

        let totalFiles = 0;
        let healthyCount = 0;
        let divergentCount = 0;
        let missingCount = 0;

        const allArchives = [];
        ['GeneralsZH', 'Generals'].forEach(m => {
            (serverCatalog.archives[m] || []).forEach(item => {
                allArchives.push({ ...item, mountGroup: m });
            });
        });

        allArchives.forEach(item => {
            totalFiles++;
            const local = localFilesMap.get(item.name.toLowerCase());
            let status = 'missing'; // 'healthy', 'divergent', 'missing'

            if (local) {
                const diff = Math.abs(local.size - item.size);
                if (local.size > 0 && (diff === 0 || (diff / Math.max(1, item.size)) < 0.05)) {
                    status = 'healthy';
                    healthyCount++;
                } else {
                    status = 'divergent';
                    divergentCount++;
                }
            } else {
                missingCount++;
            }

            // Apply filter
            if (filterMount !== 'all') {
                if (filterMount === 'missing' && status === 'healthy') return;
                if (filterMount === 'GeneralsZH' && item.mountGroup !== 'GeneralsZH') return;
                if (filterMount === 'Generals' && item.mountGroup !== 'Generals') return;
            }

            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(0, 217, 255, 0.15)';
            tr.style.background = status === 'missing' ? 'rgba(255, 68, 68, 0.05)' : (status === 'divergent' ? 'rgba(255, 170, 0, 0.05)' : 'transparent');

            let badgeHtml = '';
            if (status === 'healthy') {
                badgeHtml = '<span style="background:rgba(0,255,136,0.15); color:#00ff88; border:1px solid rgba(0,255,136,0.3); border-radius:3px; padding:2px 6px; font-size:11px; font-weight:700;">✓ ÍNTEGRO</span>';
            } else if (status === 'divergent') {
                badgeHtml = '<span style="background:rgba(255,170,0,0.15); color:#ffaa00; border:1px solid rgba(255,170,0,0.3); border-radius:3px; padding:2px 6px; font-size:11px; font-weight:700;">⚠️ DIVERGENTE</span>';
            } else {
                badgeHtml = '<span style="background:rgba(255,68,68,0.15); color:#ff4444; border:1px solid rgba(255,68,68,0.3); border-radius:3px; padding:2px 6px; font-size:11px; font-weight:700;">❌ FALTANDO</span>';
            }

            const mountLabel = item.mountGroup === 'GeneralsZH' ? 'Zero Hour' : 'Generals Base';
            const localSizeLabel = local ? formatBytes(local.size) : '—';
            const serverSizeLabel = formatBytes(item.size);

            let actionHtml = '';
            if (status === 'healthy') {
                actionHtml = '<span style="color:#00ff88; font-size:11px;">✓ Pronto local</span>';
            } else {
                actionHtml = `
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span title="Scorpion irá transmitir este arquivo da nuvem em tempo real" style="background:rgba(0,217,255,0.12); color:#00d9ff; border:1px solid rgba(0,217,255,0.3); border-radius:3px; padding:2px 6px; font-size:10px;">⚡ Stream Nuvem</span>
                        <button class="btn-scorpion-download-single" data-mount="${item.mountGroup}" data-name="${item.name}" style="background:#00d9ff; color:#020b12; border:none; border-radius:3px; padding:2px 8px; font-size:11px; font-weight:700; cursor:pointer;">💾 Baixar</button>
                    </div>
                `;
            }

            tr.innerHTML = `
                <td style="padding:8px 10px; font-family:monospace; font-weight:bold; color:#fff;">
                    ${item.name}
                    <div style="font-size:10px; color:#888; font-weight:normal;">${item.category}</div>
                </td>
                <td style="padding:8px 10px; font-size:11px; color:#00d9ff;">${mountLabel}</td>
                <td style="padding:8px 10px; font-family:monospace; font-size:11px;">
                    <span style="color:#aaa;">${localSizeLabel}</span> / <span style="color:#fff;">${serverSizeLabel}</span>
                </td>
                <td style="padding:8px 10px;">${badgeHtml}</td>
                <td style="padding:8px 10px;">${actionHtml}</td>
            `;

            tbody.appendChild(tr);
        });

        // Update Summary Indicators
        const elLocal = document.getElementById('sc-stat-local');
        const elMissing = document.getElementById('sc-stat-missing');
        const elHealthy = document.getElementById('sc-stat-healthy');
        const elStatus = document.getElementById('sc-cloud-status');

        if (elLocal) elLocal.textContent = `${localFilesMap.size} de ${totalFiles}`;
        if (elMissing) elMissing.textContent = `${missingCount + divergentCount}`;
        if (elHealthy) elHealthy.textContent = `${healthyCount}`;
        if (elStatus) {
            elStatus.textContent = missingCount === 0 ? '✓ 100% Completo no Disco' : `⚡ Auto-Reparo Cloud Ativo (${missingCount} na Nuvem)`;
            elStatus.style.color = missingCount === 0 ? '#00ff88' : '#00d9ff';
        }

        // Attach single download handlers
        document.querySelectorAll('.btn-scorpion-download-single').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const mount = e.target.getAttribute('data-mount');
                const name = e.target.getAttribute('data-name');
                await downloadSingleFile(mount, name, e.target);
            });
        });
    }

    // Download a single file to disk or trigger browser download
    async function downloadSingleFile(mount, fileName, btnElement) {
        const originalText = btnElement ? btnElement.textContent : '';
        if (btnElement) {
            btnElement.textContent = '⏳ Baixando...';
            btnElement.disabled = true;
        }

        showProgressNotification(`Baixando ${fileName} do servidor Captalvo...`, 0);

        try {
            const handle = currentDirHandles[mount] || currentDirHandles.GeneralsZH;
            let wroteToDisk = false;

            if (handle && window.showDirectoryPicker) {
                try {
                    // Try to write directly to picked folder using FileSystem Access API
                    const fileHandle = await handle.getFileHandle(fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    const url = `/api/repair.php?action=download&mount=${mount}&file=${encodeURIComponent(fileName)}`;
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    const totalBytes = parseInt(response.headers.get('Content-Length') || '0', 10);
                    let receivedBytes = 0;
                    const reader = response.body.getReader();

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        await writable.write(value);
                        receivedBytes += value.length;
                        if (totalBytes > 0) {
                            const pct = Math.floor((receivedBytes / totalBytes) * 100);
                            showProgressNotification(`Gravando ${fileName} no disco: ${pct}% (${formatBytes(receivedBytes)} / ${formatBytes(totalBytes)})`, pct);
                        }
                    }
                    await writable.close();
                    wroteToDisk = true;
                    showProgressNotification(`✓ ${fileName} salvo com sucesso na sua pasta!`, 100);
                } catch (err) {
                    console.debug('[ScorpionRepair] Gravação direta falhou, disparando download navegador:', err);
                }
            }

            if (!wroteToDisk) {
                // Fallback: standard browser download link
                const dlUrl = `/api/repair.php?action=download&mount=${mount}&file=${encodeURIComponent(fileName)}`;
                const a = document.createElement('a');
                a.href = dlUrl;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showProgressNotification(`Download de ${fileName} iniciado no navegador.`, 100);
            }

            // Refresh table
            setTimeout(() => {
                renderRepairUI();
            }, 1000);

        } catch (err) {
            console.error(`[ScorpionRepair] Erro ao baixar ${fileName}:`, err);
            showProgressNotification(`❌ Erro ao baixar ${fileName}: ${err.message}`, 0);
        } finally {
            if (btnElement) {
                btnElement.textContent = originalText;
                btnElement.disabled = false;
            }
        }
    }

    // Batch download all missing files
    async function repairAllMissingToDisk() {
        if (isRepairingBatch) return;
        isRepairingBatch = true;

        const btnAll = document.getElementById('btn-scorpion-repair-all');
        if (btnAll) {
            btnAll.disabled = true;
            btnAll.textContent = '⏳ Reparando...';
        }

        try {
            await refreshLocalScan();
            if (!serverCatalog) await fetchCatalog();

            const missingList = [];
            ['GeneralsZH', 'Generals'].forEach(m => {
                (serverCatalog.archives[m] || []).forEach(item => {
                    const local = localFilesMap.get(item.name.toLowerCase());
                    if (!local || local.size === 0) {
                        missingList.push(item);
                    }
                });
            });

            if (missingList.length === 0) {
                alert('Todos os arquivos já estão presentes e válidos no disco!');
                return;
            }

            showProgressNotification(`Iniciando reparo de ${missingList.length} arquivos faltantes...`, 0);

            for (let i = 0; i < missingList.length; i++) {
                const item = missingList[i];
                const pctOverall = Math.floor((i / missingList.length) * 100);
                showProgressNotification(`[${i + 1}/${missingList.length}] Baixando ${item.name}...`, pctOverall);
                await downloadSingleFile(item.mount, item.name, null);
            }

            showProgressNotification(`✓ Reparo concluído! ${missingList.length} arquivos baixados com sucesso.`, 100);
            await renderRepairUI();
        } catch (err) {
            console.error('[ScorpionRepair] Erro no reparo em lote:', err);
            showProgressNotification(`❌ Falha no reparo em lote: ${err.message}`, 0);
        } finally {
            isRepairingBatch = false;
            if (btnAll) {
                btnAll.disabled = false;
                btnAll.textContent = '💾 REPARAR TUDO NO DISCO';
            }
        }
    }

    // Helper: show notification or progress bar in HUD
    function showProgressNotification(text, percent) {
        let notif = document.getElementById('scorpion-repair-notif');
        if (!notif) {
            notif = document.createElement('div');
            notif.id = 'scorpion-repair-notif';
            notif.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: rgba(2, 11, 18, 0.95);
                border: 1px solid #00d9ff;
                border-radius: 6px;
                padding: 12px 18px;
                color: #fff;
                font-family: ui-monospace, monospace;
                font-size: 12px;
                z-index: 9999999;
                box-shadow: 0 4px 20px rgba(0, 217, 255, 0.3);
                backdrop-filter: blur(8px);
                max-width: 420px;
                transition: opacity 0.3s;
            `;
            document.body.appendChild(notif);
        }

        notif.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                <span style="font-weight:700; color:#00d9ff;">🛠️ SCORPION REPAIR</span>
                <span style="font-size:11px; color:#aaa;">${percent}%</span>
            </div>
            <div style="margin-bottom:6px; color:#eee;">${text}</div>
            <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
                <div style="width:${percent}%; height:100%; background:#00d9ff; transition:width 0.2s;"></div>
            </div>
        `;
        notif.style.opacity = '1';

        if (percent >= 100) {
            setTimeout(() => {
                if (notif) notif.style.opacity = '0';
            }, 5000);
        }
    }

    // Open/Close modal functions
    function openRepairModal() {
        const modal = document.getElementById('modal-scorpion-repair');
        if (modal) {
            modal.style.display = 'flex';
            renderRepairUI();
        }
    }

    function closeRepairModal() {
        const modal = document.getElementById('modal-scorpion-repair');
        if (modal) modal.style.display = 'none';
    }

    // Initialize UI on DOMContentLoaded
    window.addEventListener('DOMContentLoaded', () => {
        const btnOpen = document.getElementById('btn-open-scorpion-repair');
        const btnClose = document.getElementById('btn-close-scorpion-repair');
        const btnFilterAll = document.getElementById('sc-filter-all');
        const btnFilterZH = document.getElementById('sc-filter-zh');
        const btnFilterGen = document.getElementById('sc-filter-gen');
        const btnFilterMissing = document.getElementById('sc-filter-missing');
        const btnRescan = document.getElementById('btn-scorpion-rescan');
        const btnRepairAll = document.getElementById('btn-scorpion-repair-all');
        const btnPlayCloud = document.getElementById('btn-scorpion-play-cloud');

        if (btnOpen) btnOpen.addEventListener('click', openRepairModal);
        if (btnClose) btnClose.addEventListener('click', closeRepairModal);

        if (btnFilterAll) btnFilterAll.addEventListener('click', () => renderRepairUI('all'));
        if (btnFilterZH) btnFilterZH.addEventListener('click', () => renderRepairUI('GeneralsZH'));
        if (btnFilterGen) btnFilterGen.addEventListener('click', () => renderRepairUI('Generals'));
        if (btnFilterMissing) btnFilterMissing.addEventListener('click', () => renderRepairUI('missing'));

        if (btnRescan) btnRescan.addEventListener('click', () => renderRepairUI());
        if (btnRepairAll) btnRepairAll.addEventListener('click', repairAllMissingToDisk);
        if (btnPlayCloud) btnPlayCloud.addEventListener('click', () => {
            closeRepairModal();
            // If firstrun pick is visible, simulate play
            const pickBtn = document.getElementById('pick');
            if (pickBtn) pickBtn.click();
        });

        // Listen for Scorpion auto-repair events emitted by index-scorpion.js
        window.__scorpionOnRepair = function (info) {
            showProgressNotification(`⚡ Auto-reparo ativado: ${info.cloudCount} arquivos suplementados via nuvem (Total: ${info.total})`, 100);
        };
    });

    // Expose API globally
    window.CaptalvoScorpionRepair = {
        openModal: openRepairModal,
        closeModal: closeRepairModal,
        renderUI: renderRepairUI,
        downloadSingle: downloadSingleFile,
        repairAll: repairAllMissingToDisk
    };

})();
