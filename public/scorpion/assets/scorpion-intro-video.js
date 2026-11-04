/**
 * CAPTALVO — PROJETO SCORPION
 * Sistema de Reprodução do Vídeo de Introdução (1m11s) com Carregamento Real em Segundo Plano
 * 
 * Regras:
 * 1. Reprodução em tela cheia de Command-Conquer-Generals-Zero-Hour-Intro-1080p.mp4 com áudio (não mutado).
 * 2. Sem controles de áudio e sem pause.
 * 3. HUD de carregamento REAL (zero barra fake): reflete o progresso real do motor WASM/WebGPU e auto-reparo cloud.
 * 4. Duração de 1 minuto e 11 segundos (71s): o jogo não abre antes disso, a menos que o usuário clique em "Pular".
 * 5. Se o jogo carregar antes dos 71s: surge o botão "Pular Introdução". Se não clicar, aguarda o fim do vídeo.
 * 6. Se o jogo demorar mais de 71s: o vídeo pausa no último frame (sem loop) e aguarda o término do carregamento.
 */

(function () {
    'use strict';

    let videoOverlay = null;
    let videoEl = null;
    let timerEl = null;
    let statusEl = null;
    let detailEl = null;
    let percentEl = null;
    let progressBarEl = null;
    let btnSkipEl = null;

    let engineReady = false;
    let videoCompleted = false;
    let isIntroPlaying = false;
    let currentRealProgress = 0;
    let subsystemCount = 0;
    const INTRO_DURATION = 71; // 1m11s (71 segundos)

    function createOverlayDOM() {
        if (document.getElementById('scorpion-intro-overlay')) {
            videoOverlay = document.getElementById('scorpion-intro-overlay');
            videoEl = document.getElementById('scorpion-intro-video');
            timerEl = document.getElementById('intro-timer');
            statusEl = document.getElementById('intro-engine-status');
            detailEl = document.getElementById('intro-engine-detail');
            percentEl = document.getElementById('intro-percent');
            progressBarEl = document.getElementById('intro-progress-bar');
            btnSkipEl = document.getElementById('intro-btn-skip');
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'scorpion-intro-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            width: 100vw;
            height: 100vh;
            background: #000;
            z-index: 99999999;
            display: none;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
            user-select: none;
            transition: opacity 0.8s ease-out;
        `;

        // Video element - 1080p Intro unmuted with audio
        const video = document.createElement('video');
        video.id = 'scorpion-intro-video';
        video.src = '/Command-Conquer-Generals-Zero-Hour-Intro-1080p.mp4';
        video.preload = 'auto';
        video.playsInline = true;
        video.controls = false;
        video.loop = false; // Never loop
        video.style.cssText = `
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            z-index: 1;
        `;

        // Scanlines & Vignette Overlay
        const effectsLayer = document.createElement('div');
        effectsLayer.style.cssText = `
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 2;
            background: radial-gradient(circle at center, transparent 65%, rgba(0,0,0,0.85) 100%),
                        repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 2px);
        `;

        // Top Tactical HUD
        const topHud = document.createElement('div');
        topHud.style.cssText = `
            position: relative;
            z-index: 3;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 24px;
            background: linear-gradient(180deg, rgba(2, 11, 18, 0.95) 0%, rgba(2, 11, 18, 0.4) 70%, transparent 100%);
            font-family: ui-monospace, monospace;
            gap: 12px;
            flex-wrap: wrap;
        `;

        topHud.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="display:inline-block; width:10px; height:10px; background:#00d9ff; border-radius:50%; box-shadow:0 0 10px #00d9ff; animation:pulse 1.5s infinite;"></span>
                <span style="color:#00d9ff; font-size:13px; font-weight:800; letter-spacing:1px; text-transform:uppercase;">
                    PROJETO SCORPION &bull; BRIEFING TÁTICO ZERO HOUR
                </span>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <button id="intro-btn-skip" type="button" style="display:none; align-items:center; gap:6px; background:#00d9ff; color:#020b12; border:1px solid #4de2ff; border-radius:4px; padding:6px 14px; font-family:ui-monospace, monospace; font-size:12px; font-weight:800; cursor:pointer; box-shadow:0 0 15px rgba(0,217,255,0.6); text-transform:uppercase; letter-spacing:0.5px;">
                    ▶ PULAR INTRODUÇÃO
                </button>
                <div style="background:rgba(0,0,0,0.7); border:1px solid rgba(0,217,255,0.4); border-radius:4px; padding:6px 14px; color:#00d9ff; font-size:12px; font-weight:700;">
                    TEMPO RESTANTE: <span id="intro-timer">01:11</span>
                </div>
            </div>
        `;

        // Bottom Tactical HUD (REAL ENGINE LOADING TRACKER)
        const bottomHud = document.createElement('div');
        bottomHud.style.cssText = `
            position: relative;
            z-index: 3;
            padding: 20px 24px 24px;
            background: linear-gradient(0deg, rgba(2, 11, 18, 0.96) 0%, rgba(2, 11, 18, 0.6) 70%, transparent 100%);
            font-family: ui-monospace, monospace;
        `;

        bottomHud.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px;">
                <div style="display:flex; flex-direction:column; gap:4px; max-width:75%;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:10px; color:#ffaa00; text-transform:uppercase; letter-spacing:0.5px; font-weight:700;">
                            ⚡ CARREGAMENTO REAL DO MOTOR &bull; AUTO-REPARO ATIVO
                        </span>
                    </div>
                    <span id="intro-engine-status" style="font-size:13px; font-weight:700; color:#00d9ff; text-shadow:0 0 8px rgba(0,217,255,0.4); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        INICIALIZANDO MOTOR E AUTO-REPARO...
                    </span>
                    <span id="intro-engine-detail" style="font-size:11px; color:#88a0b0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        Preparando subsistemas e arquivos .BIG...
                    </span>
                </div>
                <div id="intro-percent" style="font-size:18px; font-weight:800; color:#00d9ff; font-family:ui-monospace, monospace; text-shadow:0 0 10px rgba(0,217,255,0.5);">
                    0%
                </div>
            </div>
            <div style="width:100%; height:8px; background:rgba(0,0,0,0.6); border-radius:4px; overflow:hidden; border:1px solid rgba(0,217,255,0.4); position:relative;">
                <div id="intro-progress-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #ffaa00 0%, #00d9ff 100%); box-shadow:0 0 12px #00d9ff; transition:width 0.25s ease-out;"></div>
            </div>
        `;

        overlay.appendChild(video);
        overlay.appendChild(effectsLayer);
        overlay.appendChild(topHud);
        overlay.appendChild(bottomHud);
        document.body.appendChild(overlay);

        videoOverlay = overlay;
        videoEl = video;
        timerEl = document.getElementById('intro-timer');
        statusEl = document.getElementById('intro-engine-status');
        detailEl = document.getElementById('intro-engine-detail');
        percentEl = document.getElementById('intro-percent');
        progressBarEl = document.getElementById('intro-progress-bar');
        btnSkipEl = document.getElementById('intro-btn-skip');

        // Video Event Listeners — ONLY updates the countdown timer, NEVER the progress bar!
        video.addEventListener('timeupdate', () => {
            if (!isIntroPlaying) return;
            const current = video.currentTime;
            const total = video.duration || INTRO_DURATION;
            const remaining = Math.max(0, total - current);

            const remMin = Math.floor(remaining / 60);
            const remSec = Math.floor(remaining % 60);
            if (timerEl) {
                timerEl.textContent = `${String(remMin).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
            }

            // Check if 71 seconds have finished
            if (current >= total - 0.25 || video.ended) {
                onVideoCompleted();
            }
        });

        video.addEventListener('ended', onVideoCompleted);

        // Skip button click handler
        if (btnSkipEl) {
            btnSkipEl.addEventListener('click', () => {
                console.log('[ScorpionIntro] Usuário clicou em PULAR INTRODUÇÃO.');
                transitionToGame();
            });
        }

        // Unmute safety click
        overlay.addEventListener('click', (e) => {
            if (e.target === btnSkipEl || btnSkipEl.contains(e.target)) return;
            if (video.muted) {
                video.muted = false;
                video.volume = 1.0;
            }
        });
    }

    function setRealProgress(pct, statusText, detailText) {
        currentRealProgress = Math.min(100, Math.max(currentRealProgress, Math.round(pct)));
        
        if (percentEl) percentEl.textContent = `${currentRealProgress}%`;
        if (progressBarEl) progressBarEl.style.width = `${currentRealProgress}%`;
        if (statusEl && statusText) statusEl.textContent = statusText.toUpperCase();
        if (detailEl && detailText) detailEl.textContent = detailText;
    }

    function onVideoCompleted() {
        if (videoCompleted) return;
        videoCompleted = true;

        if (engineReady) {
            transitionToGame();
        } else {
            // Freeze video on last frame without looping, and wait for engine
            if (videoEl && !videoEl.paused) {
                videoEl.pause();
            }
            if (statusEl) {
                statusEl.textContent = 'FINALIZANDO COMPILAÇÃO DOS SHADERS E CARREGAMENTO DO MOTOR...';
                statusEl.style.color = '#ffaa00';
            }
            if (detailEl) {
                detailEl.textContent = 'Vídeo finalizado (1m11s). Aguardando últimos subsistemas do motor...';
            }
            console.log('[ScorpionIntro] Vídeo de 1m11 finalizado. Aguardando sinal do motor WASM...');
        }
    }

    function transitionToGame() {
        if (!videoOverlay) return;
        console.log('[ScorpionIntro] Transição para o jogo iniciada. Liberando tela e áudio do Zero Hour...');

        if (statusEl) {
            statusEl.textContent = 'PRONTO! INICIANDO C&C GENERALS ZERO HOUR...';
            statusEl.style.color = '#00ff88';
        }
        if (percentEl) percentEl.textContent = '100%';
        if (progressBarEl) progressBarEl.style.width = '100%';

        // Smooth fade out
        videoOverlay.style.opacity = '0';
        videoOverlay.style.pointerEvents = 'none';

        setTimeout(() => {
            videoOverlay.style.display = 'none';
            if (videoEl) videoEl.pause();
            isIntroPlaying = false;

            // Unmute the game audio now that intro is over
            if (window.GeneralsXMuteAudio) {
                window.GeneralsXMuteAudio(false);
            }

            // Ensure canvas has focus
            const canvas = document.querySelector('canvas') || document.getElementById('canvas');
            if (canvas) {
                canvas.focus();
            }
            console.log('[ScorpionIntro] Transição concluída com sucesso. Jogo rodando em primeiro plano.');
        }, 800);
    }

    // Public API: Start the 1m11s Intro and start loading the engine
    async function playIntroAndBoot(onStartEngineCallback) {
        createOverlayDOM();
        if (!videoOverlay || !videoEl) return;

        engineReady = false;
        videoCompleted = false;
        isIntroPlaying = true;
        currentRealProgress = 0;
        subsystemCount = 0;

        if (btnSkipEl) {
            btnSkipEl.style.display = 'none';
        }

        // Mute game audio while intro video is playing
        if (window.GeneralsXMuteAudio) {
            window.GeneralsXMuteAudio(true);
        }

        // Show overlay
        videoOverlay.style.display = 'flex';
        videoOverlay.style.opacity = '1';
        videoOverlay.style.pointerEvents = 'auto';

        // Play video with audio
        videoEl.currentTime = 0;
        videoEl.muted = false;
        videoEl.volume = 1.0;

        try {
            await videoEl.play();
            console.log('[ScorpionIntro] Vídeo de introdução iniciado com áudio.');
        } catch (err) {
            console.warn('[ScorpionIntro] Autoplay com áudio bloqueado pelo navegador, tentando com clique:', err);
            videoEl.muted = true;
            await videoEl.play();
            if (statusEl) statusEl.textContent = 'CLIQUE NA TELA PARA ATIVAR O ÁUDIO';
        }

        setRealProgress(5, 'Iniciando verificação e carregamento do motor...', 'Disparando auto-reparo e montagem de arquivos');

        // Trigger engine loading in the background!
        if (typeof onStartEngineCallback === 'function') {
            try {
                onStartEngineCallback();
            } catch (e) {
                console.error('[ScorpionIntro] Erro ao disparar inicialização do motor:', e);
            }
        } else if (typeof window.__scorpionStartGame === 'function') {
            try {
                window.__scorpionStartGame();
            } catch (e) {
                console.error('[ScorpionIntro] Erro ao iniciar motor via __scorpionStartGame:', e);
            }
        }
    }

    // REAL PROGRESS REPORTING HOOKS
    window.__scorpionOnProgress = function (status, detail, fraction) {
        let calcPct = currentRealProgress;

        if (typeof fraction === 'number' && !isNaN(fraction)) {
            const frac = Math.min(1, Math.max(0, fraction));
            const st = (status || '').toLowerCase();
            if (st.includes('runtime') || st.includes('wasm') || st.includes('data')) {
                calcPct = Math.round(5 + frac * 20); // 5% -> 25%
            } else if (st.includes('download') || st.includes('stream') || st.includes('mount') || st.includes('reparo')) {
                calcPct = Math.round(25 + frac * 45); // 25% -> 70%
            } else {
                calcPct = Math.round(frac * 100);
            }
        } else {
            // Qualitative progress steps
            const st = (status || '').toLowerCase();
            if (st.includes('mounting')) calcPct = Math.max(calcPct, 30);
            if (st.includes('starting engine')) calcPct = Math.max(calcPct, 65);
            if (st.includes('running')) calcPct = 100;
        }

        setRealProgress(calcPct, status, detail);
    };

    window.__scorpionOnEngineSubsystem = function (subsystemName) {
        subsystemCount++;
        const subPct = Math.min(92, 70 + subsystemCount * 3); // 70% -> 92%
        setRealProgress(subPct, `Inicializando subsistema: ${subsystemName}`, 'Carregando bibliotecas nativas de áudio, render e física...');
    };

    window.__scorpionOnEngineIni = function (iniName) {
        const iniPct = Math.min(98, currentRealProgress + 1);
        setRealProgress(iniPct, `Lendo configuração: ${iniName}`, 'Indexando regras de combate, unidades e dados do Zero Hour...');
    };

    window.__scorpionSetEngineStatus = function (statusText) {
        if (statusEl) {
            statusEl.textContent = statusText.toUpperCase();
        }
    };

    // Engine ready reporter — MainMenu.wnd loaded and ready
    window.__scorpionSetEngineReady = function () {
        console.log('[ScorpionIntro] Motor WASM/WebGPU sinalizou PRONTO (MainMenu carregado).');
        engineReady = true;
        setRealProgress(100, 'MOTOR PRONTO • MENU PRINCIPAL CARREGADO!', 'Todos os recursos estão em memória');

        // Reveal the SKIP button over the video if the video hasn't finished yet
        if (btnSkipEl && !videoCompleted) {
            btnSkipEl.style.display = 'inline-flex';
            console.log('[ScorpionIntro] Botão PULAR INTRODUÇÃO liberado na tela.');
        }

        // If the video already finished its 1m11, transition immediately!
        if (videoCompleted) {
            transitionToGame();
        }
    };

    window.ScorpionIntroManager = {
        playIntroAndBoot: playIntroAndBoot,
        isIntroPlaying: () => isIntroPlaying,
        isEngineReady: () => engineReady,
        transitionToGame: transitionToGame
    };

    // Pre-create DOM
    window.addEventListener('DOMContentLoaded', () => {
        createOverlayDOM();
    });

})();
