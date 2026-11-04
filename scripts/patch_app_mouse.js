const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../public/captalvo-app.js');
let content = fs.readFileSync(file, 'utf8');

// 1. Target block for startGame and helpers
const targetBlock = `// -----------------------------------------------------------------------------
// Engine Launch Coordinator with Fullscreen Cinematic Intro & Real Loading HUD
// -----------------------------------------------------------------------------
async function startGame() {
    if (!AppState.isGameReady) {
        openModal('modal-import');
        return;
    }

    closeModal('modal-import');
    await launchWithCinematicIntro();
}

async function launchWithCinematicIntro() {`;

const replacementBlock = `// -----------------------------------------------------------------------------
// Global Target Resolution & Canvas Sizing Enforcement (800x600 4:3 Engine Layout)
// -----------------------------------------------------------------------------
window.CaptalvoTargetWidth = 800;
window.CaptalvoTargetHeight = 600;
window.CaptalvoDPR = 1;

function enforceCanvasResolution() {
    const cv = document.getElementById('canvas');
    if (cv) {
        if (cv.width !== 800) cv.width = 800;
        if (cv.height !== 600) cv.height = 600;
    }
}
enforceCanvasResolution();
if (typeof ResizeObserver !== 'undefined') {
    try {
        const cv = document.getElementById('canvas');
        if (cv) new ResizeObserver(enforceCanvasResolution).observe(cv);
    } catch (e) {}
}
setInterval(enforceCanvasResolution, 1000);

// Focus resilience guard: ensures canvas retains focus across pointer events & tab switching
function installFocusGuard() {
    if (window._captalvoFocusGuardInstalled) return;
    window._captalvoFocusGuardInstalled = true;
    const refocus = () => {
        const cv = document.getElementById('canvas');
        if (!cv) return;
        const ae = document.activeElement;
        if (!ae || ae === document.body || ae === cv) {
            try { cv.focus({ preventScroll: true }); } catch (e) {}
        }
    };
    window.addEventListener('focus', () => setTimeout(refocus, 10));
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) setTimeout(refocus, 10);
    });
    window.addEventListener('pointerdown', refocus, { capture: true });
    refocus();
}

// Global modal cleanup: guarantees no invisible .modal-overlay.active blocks canvas clicks
function dismissAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('active');
        modal.style.display = 'none';
    });
    document.body.classList.remove('modal-open');
}

// -----------------------------------------------------------------------------
// Engine Launch Coordinator with Fullscreen Cinematic Intro & Real Loading HUD
// -----------------------------------------------------------------------------
async function startGame() {
    if (!AppState.isGameReady) {
        openModal('modal-import');
        return;
    }

    dismissAllModals();
    await launchWithCinematicIntro();
}

async function launchWithCinematicIntro() {
    dismissAllModals();`;

// Normalize newlines for replacement
if (content.includes('\r\n')) {
    const targetCRLF = targetBlock.replace(/\n/g, '\r\n');
    const replacementCRLF = replacementBlock.replace(/\n/g, '\r\n');
    if (!content.includes(targetCRLF)) {
        console.error('Target block not found in CRLF');
        process.exit(1);
    }
    content = content.replace(targetCRLF, replacementCRLF);
} else {
    if (!content.includes(targetBlock)) {
        console.error('Target block not found in LF');
        process.exit(1);
    }
    content = content.replace(targetBlock, replacementBlock);
}

// 2. Target block for doActualGameStart
const targetActualStart = `    function doActualGameStart() {
        if (gameLaunched) return;
        gameLaunched = true;

        if (video) {
            try { video.pause(); } catch (e) {}
        }
        if (overlay) overlay.style.display = 'none';

        // Reveal game container & focus canvas
        const homeMain = document.getElementById('home-main');
        if (homeMain) homeMain.style.display = 'none';
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.style.display = 'flex';
        const escapeBar = document.getElementById('game-escape-bar');
        if (escapeBar) escapeBar.style.display = 'flex';
        const canvas = document.getElementById('canvas');
        if (canvas) canvas.focus();

        AppState.isGameRunning = true;
    }`;

const replacementActualStart = `    function doActualGameStart() {
        if (gameLaunched) return;
        gameLaunched = true;

        dismissAllModals();
        enforceCanvasResolution();
        installFocusGuard();

        if (video) {
            try { video.pause(); } catch (e) {}
        }
        if (overlay) overlay.style.display = 'none';

        // Reveal game container & focus canvas
        const homeMain = document.getElementById('home-main');
        if (homeMain) homeMain.style.display = 'none';
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) gameContainer.style.display = 'flex';
        const escapeBar = document.getElementById('game-escape-bar');
        if (escapeBar) escapeBar.style.display = 'flex';
        const canvas = document.getElementById('canvas');
        if (canvas) {
            enforceCanvasResolution();
            canvas.focus({ preventScroll: true });
        }

        AppState.isGameRunning = true;
    }`;

if (content.includes('\r\n')) {
    const targetCRLF = targetActualStart.replace(/\n/g, '\r\n');
    const repCRLF = replacementActualStart.replace(/\n/g, '\r\n');
    content = content.replace(targetCRLF, repCRLF);
} else {
    content = content.replace(targetActualStart, replacementActualStart);
}

// 3. Update DevConsole status command
const targetStatus = `            case 'status':
                const fps = document.getElementById('game-fps-counter').textContent;
                this.write(\`STATUS: JogoRodando=\${AppState.isGameRunning} | FPS=\${fps} | OPFS=\${AppState.installedFiles.size} arquivos | Backend=\${AppState.backendHealthy ? 'Online' : 'Falha'}\`, 'log-ok');
                break;`;

const replacementStatus = `            case 'status': {
                const fps = document.getElementById('game-fps-counter') ? document.getElementById('game-fps-counter').textContent : '--';
                const canvas = document.getElementById('canvas');
                const cr = canvas ? canvas.getBoundingClientRect() : { width: 0, height: 0, left: 0, top: 0 };
                const diag = window.CaptalvoMouseDiag ? window.CaptalvoMouseDiag.getDiagnosticsSummary() : null;
                const lastClick = diag && diag.lastClick ? JSON.stringify(diag.lastClick) : 'Nenhum clique registrado';
                this.write(\`STATUS DO MOTOR:
  JogoRodando=\${AppState.isGameRunning} | FPS=\${fps} | Backend=\${AppState.backendHealthy ? 'Online' : 'Falha'}
  Canvas Buffer: \${canvas ? canvas.width + 'x' + canvas.height : 'N/A'} (Alvo: 800x600 Fixo 4:3)
  Canvas CSS Rect: \${cr.width.toFixed(1)}x\${cr.height.toFixed(1)} (Pos: left=\${cr.left.toFixed(1)}, top=\${cr.top.toFixed(1)})
  DPR da Tela: \${window.devicePixelRatio || 1}
  Último Clique Mouse: \${lastClick}\`, 'log-ok');
                break;
            }

            case 'mouse':
            case 'mousedebug': {
                if (!window.CaptalvoMouseDiag) {
                    this.write('CaptalvoMouseDiag não inicializado.', 'log-err');
                    break;
                }
                const summary = window.CaptalvoMouseDiag.getDiagnosticsSummary();
                this.write(\`DIAGNÓSTICO DE MOUSE & VIEWPORT:
  Buffer Canvas: \${summary.canvasBuffer}
  Dimensão Visual CSS: \${summary.canvasCssRect}
  Device Pixel Ratio: \${summary.devicePixelRatio}
  Resolução Lógica do Motor: \${summary.targetResolution}
  Total de Cliques: \${summary.totalClicks}
  Último Clique: \${summary.lastClick ? JSON.stringify(summary.lastClick, null, 2) : 'Ainda nenhum clique no canvas'}\`, 'log-ok');
                break;
            }`;

if (content.includes('\r\n')) {
    const targetCRLF = targetStatus.replace(/\n/g, '\r\n');
    const repCRLF = replacementStatus.replace(/\n/g, '\r\n');
    content = content.replace(targetCRLF, repCRLF);
} else {
    content = content.replace(targetStatus, replacementStatus);
}

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully patched public/captalvo-app.js!');
