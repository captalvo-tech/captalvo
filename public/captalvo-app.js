// ==============================================================================
// CAPTALVO — Client Application Core
// Conquista sem limites.
// ==============================================================================

'use strict';

const REQUIRED_ASSETS = [
    { name: 'INIZH.big', desc: 'Configuração Zero Hour', required: true },
    { name: 'TexturesZH.big', desc: 'Texturas Zero Hour', required: true },
    { name: 'W3DZH.big', desc: 'Modelos 3D Zero Hour', required: true },
    { name: 'WindowZH.big', desc: 'Interface e Telas ZH', required: true },
    { name: 'MapsZH.big', desc: 'Mapas Zero Hour', required: true },
    { name: 'TerrainZH.big', desc: 'Texturas de Terreno ZH', required: true },
    { name: 'ShadersZH.big', desc: 'Shaders Zero Hour', required: true },
    { name: 'PatchINI.big', desc: 'Patches de Inicialização', required: true },
    { name: 'INI.big', desc: 'Configuração Base', required: false },
    { name: 'Textures.big', desc: 'Texturas Base', required: false },
    { name: 'W3D.big', desc: 'Modelos 3D Base', required: false },
    { name: 'maps.big', desc: 'Mapas Base', required: false },
    { name: 'Window.big', desc: 'Interface Base', required: false },
    { name: 'Terrain.big', desc: 'Terreno Base', required: false },
    { name: 'shaders.big', desc: 'Shaders Base', required: false },
];

const LOCALIZATION_VARIANTS = [
    { target: 'EnglishZH.big', alternatives: ['BrazilianZH.big', 'brazilianzh.big', 'englishzh.big'] },
    { target: 'English.big', alternatives: ['Brazilian.big', 'brazilian.big', 'english.big'] },
    { target: 'SpeechEnglishZH.big', alternatives: ['SpeechBrazilianZH.big', 'speechbrazilianzh.big'] },
    { target: 'AudioEnglishZH.big', alternatives: ['AudioBrazilianZH.big', 'audiobrazilianzh.big'] }
];

const AppState = {
    opfsSupported: false,
    opfsRoot: null,
    assetsDir: null,
    installedFiles: new Set(),
    isGameReady: false,
    isGameRunning: false,
    backendHealthy: false,
};

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    initServiceWorker();
    await checkStorageSupport();
    await checkBackendHealth();
    await refreshInstalledAssets();
    setupUIEventListeners();
    applyStoredSettings();
    initDevConsole();
    initFpsMonitor();
});

// -----------------------------------------------------------------------------
// Service Worker Registration (Anti-Cache / Zero-Cache Mode)
// -----------------------------------------------------------------------------
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('captalvo-sw.js?t=' + Date.now(), { updateViaCache: 'none' })
            .then((reg) => {
                reg.update();
                console.log('[Captalvo] Service Worker ativo (Zero-Cache Mode):', reg.scope);
            })
            .catch((err) => {
                console.warn('[Captalvo] Service Worker falhou:', err);
            });
    }
}

// Global Hard-Refresh Cache Buster Helper
window.CaptalvoBustCacheAndReload = async function() {
    console.log('[Captalvo] Limpando todos os caches e forçando recarregamento...');
    if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
    }
    try {
        sessionStorage.clear();
        document.cookie.split(";").forEach(c => {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
    } catch (e) {}
    window.location.href = window.location.pathname + '?_nocache=' + Date.now();
};

// -----------------------------------------------------------------------------
// Storage & OPFS Detection
// -----------------------------------------------------------------------------
async function checkStorageSupport() {
    const badge = document.getElementById('storage-badge');
    if (window.isSecureContext && navigator.storage && navigator.storage.getDirectory) {
        try {
            AppState.opfsRoot = await navigator.storage.getDirectory();
            AppState.assetsDir = await AppState.opfsRoot.getDirectoryHandle('assets', { create: true });
            AppState.opfsSupported = true;
            badge.textContent = 'OPFS Ativo';
            badge.className = 'status-badge badge-ready';
            return;
        } catch (e) {
            console.warn('[Captalvo] Falha ao inicializar OPFS:', e);
        }
    }
    badge.textContent = 'Storage Local';
    badge.className = 'status-badge badge-info';
}

// -----------------------------------------------------------------------------
// Backend Health Check
// -----------------------------------------------------------------------------
async function checkBackendHealth() {
    const badge = document.getElementById('backend-badge');
    try {
        const resp = await fetch('/api/health');
        if (resp.ok) {
            const data = await resp.json();
            if (data.status === 'ok') {
                AppState.backendHealthy = true;
                badge.textContent = `Online (PHP ${data.php_version})`;
                badge.className = 'status-badge badge-ready';
                return;
            }
        }
    } catch (e) {
        console.warn('[Captalvo] API health falhou:', e);
    }
    badge.textContent = 'Indisponível';
    badge.className = 'status-badge badge-missing';
}

// -----------------------------------------------------------------------------
// Scan Installed Assets in OPFS
// -----------------------------------------------------------------------------
async function refreshInstalledAssets() {
    AppState.installedFiles.clear();

    if (AppState.assetsDir) {
        try {
            for await (const [name] of AppState.assetsDir.entries()) {
                AppState.installedFiles.add(name);
                AppState.installedFiles.add(name.toLowerCase());
            }
        } catch (e) {
            console.warn('[Captalvo] Erro listando OPFS:', e);
        }
    }

    // Check required files
    let requiredCount = 0;
    let foundCount = 0;

    for (const item of REQUIRED_ASSETS) {
        if (item.required) {
            requiredCount++;
            if (AppState.installedFiles.has(item.name) || AppState.installedFiles.has(item.name.toLowerCase())) {
                foundCount++;
            }
        }
    }

    // Check localization files
    for (const loc of LOCALIZATION_VARIANTS) {
        const hasVariant = loc.alternatives.some((alt) => AppState.installedFiles.has(alt) || AppState.installedFiles.has(alt.toLowerCase()));
        if (hasVariant) {
            AppState.installedFiles.add(loc.target);
        }
    }

    const assetBadge = document.getElementById('assets-badge');
    const playBtn = document.getElementById('btn-play');

    if (foundCount >= requiredCount && requiredCount > 0) {
        AppState.isGameReady = true;
        assetBadge.textContent = `${AppState.installedFiles.size} arquivos prontos`;
        assetBadge.className = 'status-badge badge-ready';
        playBtn.disabled = false;
        playBtn.textContent = 'JOGAR CAPTALVO';
    } else {
        AppState.isGameReady = false;
        assetBadge.textContent = foundCount > 0 ? `${foundCount}/${requiredCount} essenciais` : 'Não importados';
        assetBadge.className = 'status-badge badge-missing';
        playBtn.disabled = false; // Clicking will prompt import
        playBtn.textContent = 'IMPORTAR & JOGAR';
    }

    updateAssetListUI();
}

function updateAssetListUI() {
    const list = document.getElementById('modal-asset-list');
    if (!list) return;

    list.innerHTML = '';
    for (const item of REQUIRED_ASSETS) {
        const found = AppState.installedFiles.has(item.name) || AppState.installedFiles.has(item.name.toLowerCase());
        const div = document.createElement('div');
        div.className = `asset-item ${found ? 'found' : 'missing'}`;
        div.innerHTML = `<span>${item.name} <small>(${item.desc})</small></span><span>${found ? '✓ PRONTO' : '✗ PENDENTE'}</span>`;
        list.appendChild(div);
    }
}

// -----------------------------------------------------------------------------
// Folder & File Import Handlers
// -----------------------------------------------------------------------------
async function handleDirectoryImport() {
    if (!window.showDirectoryPicker) {
        // Fallback for browsers without showDirectoryPicker
        document.getElementById('file-input-fallback').click();
        return;
    }

    try {
        const dirHandle = await window.showDirectoryPicker({
            id: 'captalvo-game-folder',
            mode: 'read'
        });

        const progressWrap = document.getElementById('import-progress-wrap');
        const progressBar = document.getElementById('import-progress-bar');
        const progressDetail = document.getElementById('import-progress-detail');

        progressWrap.style.display = 'block';
        progressBar.style.width = '0%';
        progressDetail.textContent = 'Varrendo diretório selecionado...';

        const foundBigFiles = [];
        await scanDirectoryForBigFiles(dirHandle, foundBigFiles);

        if (foundBigFiles.length === 0) {
            alert('Nenhum arquivo .big foi encontrado na pasta selecionada.\nCertifique-se de selecionar a pasta onde o Command & Conquer Generals Zero Hour está instalado.');
            progressWrap.style.display = 'none';
            return;
        }

        // Copy files into OPFS assets directory
        let copied = 0;
        for (const item of foundBigFiles) {
            progressDetail.textContent = `Importando ${item.name} (${(item.file.size / (1024 * 1024)).toFixed(1)} MB)...`;
            
            const targetHandle = await AppState.assetsDir.getFileHandle(item.name, { create: true });
            const writable = await targetHandle.createWritable();
            await item.file.stream().pipeTo(writable);

            // If Brazilian Portuguese edition, also provide English aliases for engine compatibility
            const lower = item.name.toLowerCase();
            if (lower === 'brazilianzh.big') {
                const enHandle = await AppState.assetsDir.getFileHandle('EnglishZH.big', { create: true });
                const enWritable = await enHandle.createWritable();
                await (await targetHandle.getFile()).stream().pipeTo(enWritable);
            } else if (lower === 'brazilian.big') {
                const enHandle = await AppState.assetsDir.getFileHandle('English.big', { create: true });
                const enWritable = await enHandle.createWritable();
                await (await targetHandle.getFile()).stream().pipeTo(enWritable);
            }

            copied++;
            const pct = Math.round((copied / foundBigFiles.length) * 100);
            progressBar.style.width = `${pct}%`;
        }

        progressDetail.textContent = `Concluído! ${copied} arquivos importados com sucesso para o OPFS.`;
        await refreshInstalledAssets();

        setTimeout(() => {
            progressWrap.style.display = 'none';
            closeModal('modal-import');
        }, 1200);

    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error('[Captalvo] Erro importando diretório:', err);
            alert('Erro durante a importação: ' + err.message);
        }
        document.getElementById('import-progress-wrap').style.display = 'none';
    }
}

async function scanDirectoryForBigFiles(dirHandle, results) {
    for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === 'file' && name.toLowerCase().endsWith('.big')) {
            const file = await handle.getFile();
            results.push({ name, file });
        } else if (handle.kind === 'directory') {
            // Recurse into subdirectories (e.g., base Generals folder or Zero Hour folder)
            await scanDirectoryForBigFiles(handle, results);
        }
    }
}

async function handleFileInputFallback(files) {
    if (!files || files.length === 0) return;

    const progressWrap = document.getElementById('import-progress-wrap');
    const progressBar = document.getElementById('import-progress-bar');
    const progressDetail = document.getElementById('import-progress-detail');

    progressWrap.style.display = 'block';

    let copied = 0;
    const bigFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.big'));

    if (bigFiles.length === 0) {
        alert('Nenhum arquivo .big selecionado.');
        progressWrap.style.display = 'none';
        return;
    }

    for (const file of bigFiles) {
        progressDetail.textContent = `Importando ${file.name}...`;
        const targetHandle = await AppState.assetsDir.getFileHandle(file.name, { create: true });
        const writable = await targetHandle.createWritable();
        await file.stream().pipeTo(writable);

        copied++;
        progressBar.style.width = `${Math.round((copied / bigFiles.length) * 100)}%`;
    }

    progressDetail.textContent = `Concluído! ${copied} arquivos importados.`;
    await refreshInstalledAssets();

    setTimeout(() => {
        progressWrap.style.display = 'none';
        closeModal('modal-import');
    }, 1200);
}

// -----------------------------------------------------------------------------
// Engine Launch Coordinator
// -----------------------------------------------------------------------------
async function startGame() {
    if (!AppState.isGameReady) {
        openModal('modal-import');
        return;
    }

    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('main-progress-fill');
    const progressDetail = document.getElementById('main-progress-detail');
    const progressStatus = document.getElementById('main-progress-status');

    progressContainer.style.display = 'block';
    progressFill.style.width = '10%';
    progressStatus.textContent = 'INICIALIZANDO MOTOR WEBASSEMBLY';
    progressDetail.textContent = 'Carregando binários do Zero Hour...';

    // Configure Emscripten Module
    window.Module = {
        canvas: document.getElementById('canvas'),
        print: (text) => {
            console.log('[ZeroHour-WASM]', text);
            if (DevConsole) DevConsole.write(text);
        },
        printErr: (text) => {
            console.warn('[ZeroHour-WASM]', text);
            if (DevConsole) DevConsole.write(text, 'log-err');
        },
        onRuntimeInitialized: () => {
            console.log('[Captalvo] Runtime WASM inicializado com sucesso.');
            progressFill.style.width = '100%';
            progressStatus.textContent = 'PRONTO';
            progressDetail.textContent = 'Iniciando simulação...';

            setTimeout(() => {
                document.getElementById('captalvo-shell').classList.add('hidden');
                document.getElementById('game-escape-bar').style.display = 'block';
                AppState.isGameRunning = true;
            }, 600);
        },
        setStatus: (text) => {
            if (text) {
                progressDetail.textContent = text;
                const m = text.match(/\((\d+)\/(\d+)\)/);
                if (m) {
                    const pct = Math.round((parseInt(m[1]) / parseInt(m[2])) * 100);
                    progressFill.style.width = `${pct}%`;
                }
            }
        },
        onAbort: (err) => {
            console.error('[Captalvo] Abort:', err);
            alert('O motor de jogo foi abortado: ' + err);
            progressContainer.style.display = 'none';
        }
    };

    // Global GeneralsX Progress callback if supported
    window.GeneralsX = window.GeneralsX || {};
    window.GeneralsX.setProgress = (stage, cur, tot, label) => {
        if (tot > 0) {
            const pct = Math.round((cur / tot) * 100);
            progressFill.style.width = `${pct}%`;
        }
        if (label) {
            progressDetail.textContent = label;
        }
        if (stage === 'ready') {
            document.getElementById('captalvo-shell').classList.add('hidden');
            document.getElementById('game-escape-bar').style.display = 'block';
            AppState.isGameRunning = true;
        }
    };

    // Load GeneralsZH.js dynamically with live anti-cache timestamp
    try {
        const script = document.createElement('script');
        script.src = 'GeneralsZH.js?t=' + Date.now();
        script.async = true;
        document.body.appendChild(script);
    } catch (e) {
        console.error('[Captalvo] Erro carregando script do motor:', e);
        alert('Falha ao carregar o script do motor: ' + e.message);
        progressContainer.style.display = 'none';
    }
}

// -----------------------------------------------------------------------------
// UI Event Handlers & Modals
// -----------------------------------------------------------------------------
function setupUIEventListeners() {
    document.getElementById('btn-play').addEventListener('click', startGame);
    document.getElementById('btn-import-assets').addEventListener('click', () => openModal('modal-import'));
    document.getElementById('btn-settings').addEventListener('click', () => openModal('modal-settings'));
    document.getElementById('btn-info').addEventListener('click', () => openModal('modal-info'));
    document.getElementById('btn-diag').addEventListener('click', async () => {
        openModal('modal-diag');
        await CaptalvoDiagnostics.renderDiagnosticsUI();
    });
    document.getElementById('btn-toggle-console').addEventListener('click', () => {
        DevConsole.toggle();
    });
    document.getElementById('btn-game-console').addEventListener('click', () => {
        DevConsole.toggle();
    });
    document.getElementById('dev-console-close').addEventListener('click', () => {
        DevConsole.close();
    });
    document.getElementById('btn-run-diag').addEventListener('click', async () => {
        await CaptalvoDiagnostics.renderDiagnosticsUI();
    });
    const btnDiagCacheBust = document.getElementById('btn-diag-cache-bust');
    if (btnDiagCacheBust) {
        btnDiagCacheBust.addEventListener('click', () => {
            if (confirm('Deseja purgar todo o cache, service workers e cookies para carregar a versão mais recente?')) {
                window.CaptalvoBustCacheAndReload();
            }
        });
    }
    document.getElementById('btn-copy-diag-report').addEventListener('click', async () => {
        await CaptalvoDiagnostics.copyReportToClipboard();
    });

    document.getElementById('btn-pick-folder').addEventListener('click', handleDirectoryImport);
    document.getElementById('btn-pick-files').addEventListener('click', () => {
        document.getElementById('file-input-fallback').click();
    });

    document.getElementById('file-input-fallback').addEventListener('change', (e) => {
        handleFileInputFallback(e.target.files);
    });

    // Drag and Drop support on dropzone
    const dropZone = document.getElementById('import-drop-zone');
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer && e.dataTransfer.files) {
            handleFileInputFallback(e.dataTransfer.files);
        }
    });

    // Modal Close buttons
    document.querySelectorAll('.modal-close, .btn-modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal-overlay');
            if (modal) modal.classList.remove('active');
        });
    });

    // Close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });

    // Exit Game button
    document.getElementById('btn-exit-game').addEventListener('click', () => {
        document.getElementById('captalvo-shell').classList.remove('hidden');
        document.getElementById('game-escape-bar').style.display = 'none';
        AppState.isGameRunning = false;
    });

    // Settings save
    document.getElementById('setting-fps').addEventListener('change', (e) => {
        localStorage.setItem('captalvo_fps', e.target.value);
    });
    document.getElementById('setting-lock-cursor').addEventListener('change', (e) => {
        localStorage.setItem('captalvo_lock_cursor', e.target.checked ? '1' : '0');
    });
    document.getElementById('setting-edge-scroll').addEventListener('change', (e) => {
        localStorage.setItem('captalvo_edge_scroll', e.target.checked ? '1' : '0');
    });

    // Cache purge & force reload
    const btnForceCacheBust = document.getElementById('btn-force-cache-bust');
    if (btnForceCacheBust) {
        btnForceCacheBust.addEventListener('click', () => {
            if (confirm('Deseja limpar todo o cache e recarregar a versão mais recente do Captalvo?')) {
                window.CaptalvoBustCacheAndReload();
            }
        });
    }

    // Wipe storage
    document.getElementById('btn-wipe-storage').addEventListener('click', async () => {
        if (confirm('Tem certeza de que deseja remover todos os arquivos do jogo armazenados no navegador?')) {
            if (AppState.assetsDir) {
                for await (const [name] of AppState.assetsDir.entries()) {
                    await AppState.assetsDir.removeEntry(name, { recursive: true });
                }
            }
            localStorage.clear();
            alert('Armazenamento limpo com sucesso.');
            location.reload();
        }
    });
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

function applyStoredSettings() {
    const fps = localStorage.getItem('captalvo_fps') || '60';
    document.getElementById('setting-fps').value = fps;

    const lockCursor = localStorage.getItem('captalvo_lock_cursor') === '1';
    document.getElementById('setting-lock-cursor').checked = lockCursor;

    const edgeScroll = localStorage.getItem('captalvo_edge_scroll') !== '0';
    document.getElementById('setting-edge-scroll').checked = edgeScroll;
}

// =============================================================================
// CAPTALVO DIAGNOSTICS & SYSTEM TELEMETRY
// =============================================================================
const CaptalvoDiagnostics = {
    async getGpuInfo() {
        const info = {
            api: 'WebGL 2.0',
            vendor: 'Desconhecido',
            renderer: 'Desconhecido',
            maxTextureSize: 0,
            status: 'ok'
        };

        try {
            const tempCanvas = document.createElement('canvas');
            const gl = tempCanvas.getContext('webgl2') || tempCanvas.getContext('webgl');
            if (gl) {
                const ext = gl.getExtension('WEBGL_debug_renderer_info');
                if (ext) {
                    info.vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || 'Genérico';
                    info.renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'Acelerador WebGL';
                }
                info.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
                info.api = gl.getParameter(gl.VERSION) || 'WebGL 2.0';
            } else {
                info.status = 'bad';
                info.renderer = 'Não suportado no navegador';
            }
        } catch (e) {
            info.status = 'warn';
            info.renderer = 'Restrito pelo navegador';
        }
        return info;
    },

    getAudioInfo() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
            return { state: 'Não suportado', sampleRate: 'N/A', status: 'bad' };
        }
        try {
            const ctx = new AudioCtx();
            const state = ctx.state;
            const rate = ctx.sampleRate + ' Hz';
            ctx.close().catch(() => {});
            return { state, sampleRate: rate, status: 'ok' };
        } catch (e) {
            return { state: 'Restrito', sampleRate: '44100 Hz', status: 'warn' };
        }
    },

    getMemoryInfo() {
        const res = { wasmHeap: 'Dinâmico', jsHeap: 'N/A' };
        if (window.Module && window.Module.HEAPU8) {
            res.wasmHeap = (window.Module.HEAPU8.byteLength / (1024 * 1024)).toFixed(0) + ' MB';
        }
        if (performance && performance.memory) {
            res.jsHeap = (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(0) + ' MB';
        }
        return res;
    },

    async getNetworkInfo() {
        const start = performance.now();
        try {
            const r = await fetch('/api/health?t=' + Date.now(), { cache: 'no-store' });
            const lat = Math.round(performance.now() - start);
            if (r.ok) {
                const data = await r.json();
                return { latency: lat + ' ms', php: 'PHP ' + (data.php_version || '8.3'), status: 'ok' };
            }
        } catch (e) {}
        return { latency: 'Erro de conexão', php: 'Indisponível', status: 'bad' };
    },

    async runFullDiagnostics() {
        const [gpu, net] = await Promise.all([
            this.getGpuInfo(),
            this.getNetworkInfo()
        ]);
        const audio = this.getAudioInfo();
        const mem = this.getMemoryInfo();

        return {
            timestamp: new Date().toISOString(),
            gpu,
            audio,
            mem,
            net,
            wasm: {
                supported: typeof WebAssembly !== 'undefined',
                sab: typeof SharedArrayBuffer !== 'undefined',
                coi: window.crossOriginIsolated || false
            },
            storage: {
                driver: AppState.opfsSupported ? 'OPFS' : 'IndexedDB',
                fileCount: AppState.installedFiles.size,
                swActive: navigator.serviceWorker && !!navigator.serviceWorker.controller
            }
        };
    },

    async renderDiagnosticsUI() {
        const diag = await this.runFullDiagnostics();

        // GPU
        document.getElementById('diag-gpu-api').textContent = diag.gpu.api;
        document.getElementById('diag-gpu-vendor').textContent = diag.gpu.vendor;
        document.getElementById('diag-gpu-renderer').textContent = diag.gpu.renderer;
        document.getElementById('diag-gpu-max-tex').textContent = diag.gpu.maxTextureSize + 'px';
        const gpuPill = document.getElementById('diag-gpu-pill');
        gpuPill.className = `diag-pill ${diag.gpu.status}`;
        gpuPill.textContent = diag.gpu.status === 'ok' ? 'ATIVO' : 'ATENÇÃO';

        // WASM
        document.getElementById('diag-wasm-status').textContent = diag.wasm.supported ? 'SIM (NATIVO)' : 'NÃO';
        document.getElementById('diag-sab-status').textContent = diag.wasm.sab ? 'DISPONÍVEL' : 'NÃO DISPONÍVEL';
        document.getElementById('diag-coi-status').textContent = diag.wasm.coi ? 'ATIVO (COOP/COEP)' : 'NÃO ISOLADO';
        document.getElementById('diag-wasm-heap').textContent = diag.mem.wasmHeap;

        // Audio
        document.getElementById('diag-audio-state').textContent = diag.audio.state;
        document.getElementById('diag-audio-rate').textContent = diag.audio.sampleRate;

        // Storage & VFS
        document.getElementById('diag-storage-driver').textContent = diag.storage.driver;
        document.getElementById('diag-sw-status').textContent = diag.storage.swActive ? 'ATIVO & INTERCEPTANDO' : 'REGISTRADO';
        document.getElementById('diag-big-count').textContent = diag.storage.fileCount + ' arquivos';

        // Network
        document.getElementById('diag-api-latency').textContent = diag.net.latency;
        document.getElementById('diag-php-version').textContent = diag.net.php;
        const netPill = document.getElementById('diag-backend-pill');
        netPill.className = `diag-pill ${diag.net.status}`;
        netPill.textContent = diag.net.status === 'ok' ? 'ONLINE' : 'FALHA';
    },

    async copyReportToClipboard() {
        const diag = await this.runFullDiagnostics();
        const text = `=== CAPTALVO ALPHA - RELATÓRIO DE TELEMETRIA ===
Data: ${diag.timestamp}
URL: https://captalvo.online

[GPU / RENDERIZADOR]
API: ${diag.gpu.api}
Fabricante: ${diag.gpu.vendor}
Placa: ${diag.gpu.renderer}
Textura Máx: ${diag.gpu.maxTextureSize}px

[WEBASSEMBLY & RUNTIME]
WASM Suporte: ${diag.wasm.supported}
SharedArrayBuffer: ${diag.wasm.sab}
Cross-Origin Isolated: ${diag.wasm.coi}
Heap WASM: ${diag.mem.wasmHeap}
Heap JS: ${diag.mem.jsHeap}

[ÁUDIO]
AudioContext: ${diag.audio.state}
Taxa: ${diag.audio.sampleRate}

[VFS & ARMAZENAMENTO]
Driver: ${diag.storage.driver}
Arquivos .BIG: ${diag.storage.fileCount}
Service Worker: ${diag.storage.swActive}

[BACKEND HOSTINGER]
Serviço: ${diag.net.php}
Latência API: ${diag.net.latency}
=================================================`;

        try {
            await navigator.clipboard.writeText(text);
            alert('Relatório de diagnóstico copiado para a área de transferência!');
        } catch (e) {
            console.log(text);
            alert('Relatório impresso no console do navegador.');
        }
    }
};

// =============================================================================
// DEVELOPER CONSOLE (Backtick / Tilde Command Shell)
// =============================================================================
const DevConsole = {
    panel: null,
    output: null,
    form: null,
    input: null,
    history: [],
    historyIndex: 0,
    isOpen: false,

    commands: [
        'help', 'status', 'diag', 'gpu', 'vfs', 'audio', 'mem', 'fps',
        'ping', 'capture', 'cursor', 'clear', 'reload', 'close'
    ],

    init() {
        this.panel = document.getElementById('dev-console');
        this.output = document.getElementById('dev-console-output');
        this.form = document.getElementById('dev-console-form');
        this.input = document.getElementById('dev-console-input');

        if (!this.panel) return;

        // Command submission
        this.form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const cmd = this.input.value.trim();
            this.input.value = '';
            if (!cmd) return;

            this.history.push(cmd);
            this.historyIndex = this.history.length;
            this.write(`> ${cmd}`, 'log-cmd');

            await this.execute(cmd);
        });

        // History and autocomplete
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' && this.historyIndex > 0) {
                this.historyIndex--;
                this.input.value = this.history[this.historyIndex] || '';
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                this.historyIndex = Math.min(this.historyIndex + 1, this.history.length);
                this.input.value = this.history[this.historyIndex] || '';
                e.preventDefault();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                const term = this.input.value.trim().toLowerCase();
                const matches = this.commands.filter(c => c.startsWith(term));
                if (matches.length === 1) {
                    this.input.value = matches[0] + ' ';
                } else if (matches.length > 1) {
                    this.write(`Comandos: ${matches.join('  ')}`, 'log-ok');
                }
            }
        });

        // Capture phase keydown for ~ / Backtick and Escape
        window.addEventListener('keydown', (e) => {
            if ((e.code === 'Backquote' || e.key === '`' || e.key === '~' || e.key === 'F2') && !e.repeat) {
                // Avoid capturing when typing inside normal inputs other than console
                if (e.target && e.target !== this.input && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                    return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                this.toggle();
                return;
            }

            if (this.isOpen) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.close();
                }
                e.stopImmediatePropagation();
            }
        }, { capture: true });

        this.write('Captalvo Diagnostic Console initialized. Digite "help" para ver os comandos.', 'log-ok');
    },

    write(msg, className = '') {
        const span = document.createElement('div');
        if (className) span.className = className;
        span.textContent = msg;
        this.output.appendChild(span);
        this.output.scrollTop = this.output.scrollHeight;
    },

    open() {
        this.panel.hidden = false;
        this.isOpen = true;
        if (document.exitPointerLock) document.exitPointerLock();
        setTimeout(() => this.input.focus(), 50);
    },

    close() {
        this.panel.hidden = true;
        this.isOpen = false;
        this.input.blur();
    },

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    },

    async execute(cmdLine) {
        const parts = cmdLine.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        switch (cmd) {
            case 'help':
                this.write(`Comandos disponíveis:
  status       - Exibe resumo em tempo real do motor, áudio, memória e canvas
  diag         - Executa diagnóstico completo de hardware, WebAssembly e rede
  gpu          - Exibe detalhes do adaptador WebGL 2.0 e placa de vídeo
  vfs          - Lista todos os arquivos .BIG registrados no OPFS
  audio        - Exibe telemetria do subsistema de som
  mem          - Informações de uso de memória WASM e heap JS
  fps [num]    - Consulta ou ajusta o limitador de taxa de quadros (30/60/120)
  ping         - Testa latência direta da API PHP 8.3 (/api/health)
  capture      - Captura screenshot diagnóstica do canvas
  cursor free  - Força liberação do confinamento do ponteiro
  clear        - Limpa o histórico de mensagens do console
  reload       - Recarrega a aplicação
  close        - Fecha este painel (ou pressione \` ou Esc)`);
                break;

            case 'status':
                const fps = document.getElementById('game-fps-counter').textContent;
                this.write(`STATUS: JogoRodando=${AppState.isGameRunning} | FPS=${fps} | OPFS=${AppState.installedFiles.size} arquivos | Backend=${AppState.backendHealthy ? 'Online' : 'Falha'}`, 'log-ok');
                break;

            case 'diag':
                this.write('Executando diagnóstico do sistema...', 'log-warn');
                const d = await CaptalvoDiagnostics.runFullDiagnostics();
                this.write(`GPU: ${d.gpu.renderer} (${d.gpu.vendor})
WASM: Suportado=${d.wasm.supported} | SAB=${d.wasm.sab} | COI=${d.wasm.coi}
ÁUDIO: ${d.audio.state} (${d.audio.sampleRate})
VFS: ${d.storage.driver} com ${d.storage.fileCount} arquivos
API: ${d.net.php} - Latência: ${d.net.latency}`, 'log-ok');
                break;

            case 'gpu':
                const gpu = await CaptalvoDiagnostics.getGpuInfo();
                this.write(`GPU / WebGL2:
  API: ${gpu.api}
  Fabricante: ${gpu.vendor}
  Renderizador: ${gpu.renderer}
  Textura Máx: ${gpu.maxTextureSize}px`, 'log-ok');
                break;

            case 'vfs':
                this.write(`Arquivos .BIG armazenados (${AppState.installedFiles.size}):`);
                for (const item of REQUIRED_ASSETS) {
                    const found = AppState.installedFiles.has(item.name) || AppState.installedFiles.has(item.name.toLowerCase());
                    this.write(`  [${found ? 'OK' : 'MISSING'}] ${item.name} (${item.desc})`, found ? 'log-ok' : 'log-err');
                }
                break;

            case 'audio':
                const aud = CaptalvoDiagnostics.getAudioInfo();
                this.write(`Áudio: Estado=${aud.state} | SampleRate=${aud.sampleRate}`, 'log-ok');
                break;

            case 'mem':
                const mem = CaptalvoDiagnostics.getMemoryInfo();
                this.write(`Memória: Heap WASM=${mem.wasmHeap} | Heap JS=${mem.jsHeap}`, 'log-ok');
                break;

            case 'fps':
                if (args[0]) {
                    const limit = parseInt(args[0], 10);
                    localStorage.setItem('captalvo_fps', String(limit));
                    document.getElementById('setting-fps').value = String(limit);
                    this.write(`Limitador de FPS ajustado para: ${limit}`, 'log-ok');
                } else {
                    const cur = localStorage.getItem('captalvo_fps') || '60';
                    this.write(`Limite atual de FPS: ${cur}`);
                }
                break;

            case 'ping':
                this.write('Enviando requisição de ping para https://captalvo.online/api/health...');
                const net = await CaptalvoDiagnostics.getNetworkInfo();
                this.write(`Resposta da API: ${net.php} em ${net.latency}`, net.status === 'ok' ? 'log-ok' : 'log-err');
                break;

            case 'cursor':
                if (document.exitPointerLock) document.exitPointerLock();
                this.write('Ponteiro liberado com sucesso.', 'log-ok');
                break;

            case 'capture':
                const canvas = document.getElementById('canvas');
                if (canvas) {
                    try {
                        const url = canvas.toDataURL('image/png');
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `captalvo-capture-${Date.now()}.png`;
                        a.click();
                        this.write(`Screenshot capturada (${canvas.width}x${canvas.height}).`, 'log-ok');
                    } catch (e) {
                        this.write('Erro capturando canvas: ' + e.message, 'log-err');
                    }
                }
                break;

            case 'clear':
                this.output.innerHTML = '';
                break;

            case 'reload':
                location.reload();
                break;

            case 'close':
                this.close();
                break;

            default:
                this.write(`Comando não reconhecido: "${cmd}". Digite "help" para ver as opções.`, 'log-err');
        }
    }
};

function initDevConsole() {
    DevConsole.init();
}

// =============================================================================
// FPS MONITOR HUD
// =============================================================================
function initFpsMonitor() {
    const el = document.getElementById('game-fps-counter');
    let lastTime = performance.now();
    let frameCount = 0;

    function tick(now) {
        frameCount++;
        if (now - lastTime >= 1000) {
            const fps = Math.round((frameCount * 1000) / (now - lastTime));
            if (el) el.textContent = `${fps} FPS`;
            frameCount = 0;
            lastTime = now;
        }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

