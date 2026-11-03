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
});

// -----------------------------------------------------------------------------
// Service Worker Registration
// -----------------------------------------------------------------------------
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('captalvo-sw.js')
            .then((reg) => {
                console.log('[Captalvo] Service Worker ativo:', reg.scope);
            })
            .catch((err) => {
                console.warn('[Captalvo] Service Worker falhou:', err);
            });
    }
}

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
        print: (text) => console.log('[ZeroHour-WASM]', text),
        printErr: (text) => console.warn('[ZeroHour-WASM]', text),
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

    // Load GeneralsZH.js dynamically
    try {
        const script = document.createElement('script');
        script.src = 'GeneralsZH.js?v=0.5.2';
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
