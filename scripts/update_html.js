const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Storage Mode selector in launcher
const launcherTarget = `                    <div class="status-row">
                        <span class="status-label">Servidor Backend:</span>
                        <span id="backend-badge" class="status-badge badge-info">Conectando...</span>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="action-buttons">
                    <button id="btn-play" class="btn-primary" type="button" disabled>
                        JOGAR CAPTALVO
                    </button>
                    
                    <button id="btn-import-assets" class="btn-secondary" type="button">
                        📁 Importar Arquivos do Jogo (.BIG)
                    </button>`;

const launcherReplacement = `                    <div class="status-row">
                        <span class="status-label">Servidor Backend:</span>
                        <span id="backend-badge" class="status-badge badge-info">Conectando...</span>
                    </div>
                    <div class="status-row">
                        <span class="status-label">Modo de Armazenamento:</span>
                        <select id="select-storage-mode" class="select-tactical">
                            <option value="automatic">AUTOMÁTICO (Adaptativo)</option>
                            <option value="turbo">TURBO (Pré-carregamento RAM)</option>
                            <option value="balanced">EQUILIBRADO (OPFS + RAM)</option>
                            <option value="economic">ECONÔMICO (Menor uso RAM)</option>
                        </select>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="action-buttons">
                    <button id="btn-play" class="btn-primary" type="button" disabled>
                        JOGAR CAPTALVO
                    </button>
                    <button id="btn-open-game-files" class="btn-secondary" style="border-color:var(--accent-gold); color:var(--accent-gold);" type="button">
                        📁 Gerenciador de Arquivos do Jogo (.BIG)
                    </button>
                    <button id="btn-import-assets" class="btn-secondary" type="button">
                        📥 Importação Rápida de Pasta
                    </button>`;

if (html.includes(launcherTarget)) {
    html = html.replace(launcherTarget, launcherReplacement);
    console.log('1. Launcher updated with storage mode and files button.');
}

// 2. Tabs in modal-diag
const diagHeaderTarget = `<div id="modal-diag" class="modal-overlay">
        <div class="modal-card" style="width: min(720px, 95vw);">
            <div class="modal-header">
                <h3 class="modal-title">Diagnóstico do Sistema &middot; Telemetria</h3>
                <button class="modal-close" type="button">&times;</button>
            </div>
            <div class="modal-body">`;

const diagHeaderReplacement = `<div id="modal-diag" class="modal-overlay">
        <div class="modal-card" style="width: min(940px, 96vw); max-height: 90vh; display: flex; flex-direction: column;">
            <div class="modal-header">
                <div>
                    <h3 class="modal-title">🔬 Captalvo Diagnostics &middot; Painel Técnico &amp; Admin</h3>
                    <div class="modal-subtitle">Observabilidade total da Engine &bull; I/O de Arquivos &bull; Telemetria LGPD</div>
                </div>
                <button class="modal-close" type="button">&times;</button>
            </div>
            <div class="modal-body" style="overflow-y: auto; flex: 1;">
                <!-- Navigation Tabs -->
                <div class="tactical-tabs-nav">
                    <button class="tactical-tab-btn active" data-tab="diag-tab-overview" type="button">📊 Visão Geral</button>
                    <button class="tactical-tab-btn" data-tab="diag-tab-ranking" type="button">📈 Ranking de Arquivos</button>
                    <button class="tactical-tab-btn" data-tab="diag-tab-sessions" type="button">⏱️ Sessões &amp; Timeline</button>
                    <button class="tactical-tab-btn" data-tab="diag-tab-modes" type="button">🚀 Modos de Armazenamento</button>
                    <button class="tactical-tab-btn" data-tab="diag-tab-consent" type="button">🛡️ Consentimento LGPD</button>
                </div>

                <!-- Tab 1: Overview -->
                <div id="diag-tab-overview" class="tactical-tab-pane active">`;

if (html.includes(diagHeaderTarget)) {
    html = html.replace(diagHeaderTarget, diagHeaderReplacement);
    console.log('2a. modal-diag header updated.');
}

const diagFooterTarget = `                    <button id="btn-copy-diag-report" class="btn-secondary" style="font-size:12px; padding:10px 16px;" type="button">
                        📋 Copiar Relatório Completo
                    </button>
                </div>
            </div>
        </div>
    </div>`;

const diagFooterReplacement = `                    <button id="btn-copy-diag-report" class="btn-secondary" style="font-size:12px; padding:10px 16px;" type="button">
                        📋 Copiar Relatório Completo
                    </button>
                </div>
                </div><!-- End Tab 1 Overview -->

                <!-- Tab 2: Ranking de Arquivos -->
                <div id="diag-tab-ranking" class="tactical-tab-pane">
                    <p style="font-size:12px; margin-bottom:12px; color:var(--muted);">
                        Ranking de operações de I/O em tempo real. Identifica arquivos com maior tráfego, maior latência e taxa de acerto no cache RAM.
                    </p>
                    <div class="game-files-table-wrap">
                        <table class="tactical-table">
                            <thead>
                                <tr>
                                    <th>Arquivo</th>
                                    <th>Leituras</th>
                                    <th>Volume (MB)</th>
                                    <th>Cache Hit %</th>
                                    <th>Latência p50</th>
                                    <th>Latência p95</th>
                                    <th>Espera Acum.</th>
                                </tr>
                            </thead>
                            <tbody id="diag-ranking-table-body">
                                <tr><td colspan="7" style="text-align:center; color:var(--muted);">Nenhuma leitura registrada ainda.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Tab 3: Sessões & Timeline -->
                <div id="diag-tab-sessions" class="tactical-tab-pane">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                        <div>
                            <strong>Sessão Atual:</strong> <code id="diag-sess-id-val" style="color:var(--accent-gold);">--</code>
                        </div>
                        <button id="btn-refresh-sessions" class="btn-secondary" style="font-size:11px; padding:6px 12px;" type="button">
                            🔄 Atualizar do Servidor
                        </button>
                    </div>
                    <div id="diag-sessions-container" style="display:flex; flex-direction:column; gap:8px;">
                        <!-- Populated dynamically -->
                    </div>
                </div>

                <!-- Tab 4: Modos de Armazenamento -->
                <div id="diag-tab-modes" class="tactical-tab-pane">
                    <div class="diag-grid" style="margin-bottom:14px;">
                        <div class="diag-card">
                            <div class="diag-card-title">
                                <span>AUTOMÁTICO</span>
                                <span class="diag-pill ok">Padrão</span>
                            </div>
                            <p style="font-size:11px; color:var(--muted); margin: 6px 0;">
                                Ajusta o orçamento de RAM dinamicamente conforme a capacidade do dispositivo. Ideal para a maioria dos computadores.
                            </p>
                            <div class="diag-row"><span class="diag-key">Orçamento RAM:</span><span class="diag-val">384 MB - 1.2 GB</span></div>
                            <div class="diag-row"><span class="diag-key">Fonte Primária:</span><span class="diag-val">OPFS + RAM LRU</span></div>
                        </div>

                        <div class="diag-card">
                            <div class="diag-card-title">
                                <span>TURBO</span>
                                <span class="diag-pill ok">Máximo Desempenho</span>
                            </div>
                            <p style="font-size:11px; color:var(--muted); margin: 6px 0;">
                                Pré-carrega todos os arquivos essenciais e texturas completas na memória RAM antes de iniciar o motor.
                            </p>
                            <div class="diag-row"><span class="diag-key">Orçamento RAM:</span><span class="diag-val">Até 1.5 GB</span></div>
                            <div class="diag-row"><span class="diag-key">Latência I/O:</span><span class="diag-val">&lt; 0.05 ms</span></div>
                        </div>

                        <div class="diag-card">
                            <div class="diag-card-title">
                                <span>EQUILIBRADO</span>
                                <span class="diag-pill ok">Balanceado</span>
                            </div>
                            <p style="font-size:11px; color:var(--muted); margin: 6px 0;">
                                Mantém arquivos vitais (INI, CSF, Window) em RAM e lê dados pesados sob demanda através do OPFS.
                            </p>
                            <div class="diag-row"><span class="diag-key">Orçamento RAM:</span><span class="diag-val">512 MB</span></div>
                            <div class="diag-row"><span class="diag-key">Fonte Primária:</span><span class="diag-val">OPFS Persistente</span></div>
                        </div>

                        <div class="diag-card">
                            <div class="diag-card-title">
                                <span>ECONÔMICO</span>
                                <span class="diag-pill ok">Baixo Consumo</span>
                            </div>
                            <p style="font-size:11px; color:var(--muted); margin: 6px 0;">
                                Minimiza o uso de memória do navegador. Mantém apenas os índices em RAM e evita pré-carregamento.
                            </p>
                            <div class="diag-row"><span class="diag-key">Orçamento RAM:</span><span class="diag-val">160 MB</span></div>
                            <div class="diag-row"><span class="diag-key">Recomendado para:</span><span class="diag-val">Dispositivos &lt; 4 GB RAM</span></div>
                        </div>
                    </div>
                </div>

                <!-- Tab 5: Consentimento LGPD -->
                <div id="diag-tab-consent" class="tactical-tab-pane">
                    <p style="font-size:12px; margin-bottom:14px; color:var(--muted);">
                        Em conformidade com a LGPD e privacidade técnica: nenhum arquivo proprietário ou dado pessoal é transmitido.
                        Você pode habilitar ou desabilitar cada categoria de telemetria a qualquer momento.
                    </p>

                    <div class="consent-toggle-row">
                        <div class="consent-toggle-info">
                            <span class="consent-toggle-title">Diagnóstico Técnico Essencial</span>
                            <span class="consent-toggle-desc">Erros de inicialização, montagem VFS e falhas de runtime necessários para o jogo funcionar.</span>
                        </div>
                        <input type="checkbox" id="consent-essential" checked disabled>
                    </div>

                    <div class="consent-toggle-row">
                        <div class="consent-toggle-info">
                            <span class="consent-toggle-title">Métricas de Desempenho (FPS &amp; I/O)</span>
                            <span class="consent-toggle-desc">Frametimes frame a frame, picos de congelamento e tempos de leitura para otimização da engine.</span>
                        </div>
                        <input type="checkbox" id="consent-performance" checked>
                    </div>

                    <div class="consent-toggle-row">
                        <div class="consent-toggle-info">
                            <span class="consent-toggle-title">Perfil Técnico de Hardware</span>
                            <span class="consent-toggle-desc">Modelo da GPU WebGL, núcleos aproximados e resolução para compatibilidade gráfica.</span>
                        </div>
                        <input type="checkbox" id="consent-hardware" checked>
                    </div>

                    <button id="btn-save-consent" class="btn-primary" style="font-size:12px; padding:10px 18px; margin-top:10px;" type="button">
                        💾 Salvar Preferências de Privacidade
                    </button>
                </div>
            </div>
        </div>
    </div>`;

if (html.includes(diagFooterTarget)) {
    html = html.replace(diagFooterTarget, diagFooterReplacement);
    console.log('2b. modal-diag tabs added.');
}

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Update finished.');
