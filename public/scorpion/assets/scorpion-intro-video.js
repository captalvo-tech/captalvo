/**
 * CAPTALVO — PROJETO SCORPION
 * Sistema de Reprodução do Vídeo de Introdução (1m11s) com Pré-carregamento Oculto
 */

(function () {
    'use strict';

    let videoOverlay = null;
    let videoEl = null;
    let timerEl = null;
    let statusEl = null;
    let progressBarEl = null;

    let engineReady = false;
    let videoCompleted = false;
    let isIntroPlaying = false;
    let introStartTime = 0;
    const INTRO_DURATION = 71; // 1m11s (71 segundos)

    function createOverlayDOM() {
        if (document.getElementById('scorpion-intro-overlay')) return;

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

        // Video element - 1080p Intro
        const video = document.createElement('video');
        video.id = 'scorpion-intro-video';
        video.src = '/Command-Conquer-Generals-Zero-Hour-Intro-1080p.mp4';
        video.preload = 'auto';
        video.playsInline = true;
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
            background: radial-gradient(circle at center, transparent 60%, rgba(0,0,0,0.7) 100%),
                        repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 2px);
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
            background: linear-gradient(180deg, rgba(2, 11, 18, 0.9) 0%, transparent 100%);
            font-family: ui-monospace, monospace;
        `;

        topHud.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="display:inline-block; width:10px; height:10px; background:#ffaa00; border-radius:50%; box-shadow:0 0 10px #ffaa00; animation:pulse 1.5s infinite;"></span>
                <span style="color:#ffaa00; font-size:13px; font-weight:800; letter-spacing:1px; text-transform:uppercase;">
                    PROJETO SCORPION &bull; BRIEFING TÁTICO ZERO HOUR
                </span>
            </div>
            <div style="background:rgba(0,0,0,0.6); border:1px solid rgba(255,170,0,0.4); border-radius:4px; padding:6px 14px; color:#ffaa00; font-size:12px; font-weight:700;">
                TEMPO RESTANTE: <span id="intro-timer">01:11</span>
            </div>
        `;

        // Bottom Tactical HUD (Real-time Engine Loading Tracker)
        const bottomHud = document.createElement('div');
        bottomHud.style.cssText = `
            position: relative;
            z-index: 3;
            padding: 20px 24px 24px;
            background: linear-gradient(0deg, rgba(2, 11, 18, 0.95) 0%, rgba(2, 11, 18, 0.6) 70%, transparent 100%);
            font-family: ui-monospace, monospace;
        `;

        bottomHud.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px;">
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <span style="font-size:10px; color:#88a0b0; text-transform:uppercase; letter-spacing:0.5px;">Carregamento em Segundo Plano (Zero-Wait)</span>
                    <span id="intro-engine-status" style="font-size:13px; font-weight:700; color:#00d9ff; text-shadow:0 0 8px rgba(0,217,255,0.4);">
                        INICIALIZANDO MOTOR E SUBSISTEMAS...
                    </span>
                </div>
                <div id="intro-percent" style="font-size:14px; font-weight:800; color:#00d9ff;">
                    0%
                </div>
            </div>
            <div style="width:100%; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden; border:1px solid rgba(0,217,255,0.3); position:relative;">
                <div id="intro-progress-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #ffaa00, #00d9ff); box-shadow:0 0 10px #00d9ff; transition:width 0.25s linear;"></div>
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
        progressBarEl = document.getElementById('intro-progress-bar');

        // Video Event Listeners
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

            const pct = Math.min(100, Math.floor((current / total) * 100));
            const elPct = document.getElementById('intro-percent');
            if (elPct) elPct.textContent = `${pct}%`;
            if (progressBarEl) progressBarEl.style.width = `${pct}%`;

            // Check completion: minimum 71 seconds watched
            if (current >= total - 0.3 || video.ended) {
                onVideoCompleted();
            }
        });

        video.addEventListener('ended', onVideoCompleted);

        // Click to ensure unmuted audio if browser blocked audio policy
        overlay.addEventListener('click', () => {
            if (video.muted) {
                video.muted = false;
                video.volume = 1.0;
            }
        });
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
        introStartTime = Date.now();

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
            // User can click anywhere to unmute
            if (statusEl) statusEl.textContent = 'CLIQUE NA TELA PARA ATIVAR O ÁUDIO';
        }

        // Trigger engine loading in the background!
        if (typeof onStartEngineCallback === 'function') {
            try {
                onStartEngineCallback();
            } catch (e) {
                console.error('[ScorpionIntro] Erro ao disparar inicialização do motor:', e);
            }
        }
    }

    // Engine progress reporter
    window.__scorpionSetEngineStatus = function (statusText) {
        if (statusEl) {
            statusEl.textContent = statusText.toUpperCase();
        }
    };

    // Engine ready reporter
    window.__scorpionSetEngineReady = function () {
        console.log('[ScorpionIntro] Motor WASM/WebGPU sinalizou PRONTO (MainMenu carregado).');
        engineReady = true;

        if (statusEl) {
            statusEl.textContent = 'SISTEMAS PRONTOS &bull; CONCLUINDO INTRODUÇÃO (1m11s)';
            statusEl.style.color = '#00ff88';
        }

        // If the video already finished its 1m11, transition immediately!
        if (videoCompleted) {
            transitionToGame();
        }
    };

    window.ScorpionIntroManager = {
        playIntroAndBoot: playIntroAndBoot,
        isIntroPlaying: () => isIntroPlaying,
        isEngineReady: () => engineReady
    };

    // Pre-create DOM
    window.addEventListener('DOMContentLoaded', () => {
        createOverlayDOM();
    });

})();
