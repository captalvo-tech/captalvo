# CAPTALVO — RELATÓRIO TÉCNICO E ARQUITETURAL PERMANENTE
## Diagnóstico Completo de Entrada do Mouse, Viewport 4:3, Modais e Comparativo dos Projetos de Referência

**Data:** 04 de Novembro de 2026  
**Ambiente:** `captalvo.online` (Produção WebAssembly / WebGL 2.0)  
**Autor:** Antigravity Pair Programming & Engine Architecture Team  

---

## 1. Resumo Executivo & Status Atual

Após as correções de resolução e mapeamento de viewport aplicadas no commit `c882b34`:
1. **O problema de escala e viewport foi 100% resolvido com sucesso comprovado:**
   - A captura de tela do usuário confirmou a renderização do cenário 3D, modelos de tanques, iluminação e menus do Zero Hour em proporção 4:3 perfeita, centralizada na tela cheia com pillarbox limpo, operando a 60 FPS cravados.
2. **Entretanto, dois problemas críticos remanesciam:**
   - **Problema 1 (Mouse sem ação no menu):** Mesmo clicando diretamente sobre "UM JOGADOR", nenhuma ação era disparada na engine.
   - **Problema 2 (Modais invisíveis sobre o jogo):** Ao clicar nos botões "Console" e "Afterburner" na barra superior do jogo, nada se abria por cima do canvas, impedindo o envio manual de logs e monitoramento.

Este relatório detalha a causa raiz exata identificada nos logs reais da sessão `sess_mw1m6efp_lpw2d2`, a correção matemática aplicada no Emscripten e o aprendizado obtido com os 4 projetos de referência da comunidade.

---

## 2. Os 4 Projetos de Referência na Web

| Projeto | Repositório / Link | Tecnologia Principal | Estado & Aprendizados Relevantes para o Captalvo |
| :--- | :--- | :--- | :--- |
| **Generals-Web (TheodoryLabs)** | [TheodoryLabs/command-and-conquer-generals-zero-hour-web](https://github.com/TheodoryLabs/command-and-conquer-generals-zero-hour-web) | WebAssembly + WebGL 2.0 (SDL2/SDL3 + Emscripten) | **Base binária direta do nosso motor.** Renderiza em resolução lógica fixa de **800x600**. Em `GeneralsZH.html`, força o canvas em 4:3 (`aspect-ratio: 4/3; width: auto; height: 100%`). Converte eventos do mouse para o espaço lógico $800 \times 600$. |
| **GeneralsX Web (origami-ltd)** | [origami-ltd/wasm-generals](https://github.com/origami-ltd/wasm-generals) • Demo: [generals.wasm.ltd](https://generals.wasm.ltd) | WebAssembly + WebGPU (fallback WebGL 2.0) + pthread Worker | **Referência de alta performance.** Executa a engine em Worker (`-sPROXY_TO_PTHREAD`), com `OffscreenCanvas`, OPFS nativo e foco resiliente. Utiliza `scaleMouseCoordinates()` recalculando coordenadas relativas à viewport real em relação a `TheDisplay`. |
| **GeneralsXWeb (meerzulee)** | [meerzulee/GeneralsXWeb](https://github.com/meerzulee/GeneralsXWeb) | WebAssembly + WebGL 2.0 | Menus, controles e escaramuça demonstrados. Foco em simplificação do pipeline WebGL 2.0 e buffers diretos. |
| **Generals-WebAssembly (JaroslavBes)** | [JaroslavBes/Generals-WebAssembly](https://github.com/JaroslavBes/Generals-WebAssembly) | WebAssembly + WebGL 2.0 + OPFS + Skirmish | Código-fonte C++ disponível em `z:\AI\Generals-WebAssembly`. Revela a implementação exata de `SDL3Mouse.cpp` (`m_inputMovesAbsolute = TRUE`, eventos `SDL_EVENT_MOUSE_BUTTON_DOWN`/`UP` e conversão de coordenadas). |

---

## 3. Análise dos Logs Reais: Causa Raiz do Clique Inoperante

O usuário enviou o console log completo da sessão de teste `sess_mw1m6efp_lpw2d2`. O sistema de diagnóstico de entrada registrou exatamente:

```
[Diagnostics:Input] MOUSEDOWN DOM(1858, 279) -> RelCanvas(1448, 279) -> Engine(666, 128) -> 🎯 HIT: UM JOGADOR
[Diagnostics:Input] MOUSEUP   DOM(1858, 279) -> RelCanvas(1858, 279) -> Engine(799, 279) -> ❌ Sem colisão
```
E novamente:
```
[Diagnostics:Input] MOUSEDOWN DOM(1793, 451) -> RelCanvas(1383, 451) -> Engine(636, 207) -> 🎯 HIT: CARREGAR REPLAY
[Diagnostics:Input] MOUSEUP   DOM(1793, 451) -> RelCanvas(1793, 451) -> Engine(799, 451) -> ❌ Sem colisão
```

### O Diagnóstico da Assimetria:
1. **No `MOUSEDOWN`:**
   - O usuário clicou dentro do canvas na posição da tela $X = 1858$.
   - Como o canvas estava centralizado com letterbox/pillarbox, `canvas.getBoundingClientRect().left = 410px`.
   - Logo, `RelCanvas = 1858 - 410 = 1448px`.
   - Projetado para a grade $800 \times 600$: `Engine = 1448 * (800 / 1740) = 666`.
   - As coordenadas $(666, 128)$ caíram com perfeição dentro do botão `MainMenu.wnd:ButtonSinglePlayer` ("UM JOGADOR", área: $X \in [540, 748]$, $Y \in [116, 152]$).
   - O motor C++ recebeu `SDL_EVENT_MOUSE_BUTTON_DOWN` em $(666, 128)$ e colocou o botão no estado "pressionado" (`WIN_STATE_SELECTED`).

2. **No `MOUSEUP` (Onde o clique falhou):**
   - No Emscripten HTML5 library, o evento `mouseup` (e `mousemove`) é registrado com escopo no objeto `document` ou `window` (para capturar solturas fora ou através do elemento).
   - Na função compilada `Qf(a, b, c)` em `GeneralsZH.js`, o terceiro parâmetro `c` recebe o alvo do evento.
   - Quando `c` era `document`, a função chamava `a = be(c)`.
   - A função Emscripten `be(c)` verifica:
     ```javascript
     be = a => Sd.indexOf(a) < 0 ? a.getBoundingClientRect() : { left: 0, top: 0 }
     ```
   - Como `document` e `window` pertencem ao array `Sd`, `be(document)` retornou **`{ left: 0, top: 0 }`**!
   - Além disso, `document.width` não existe (`undefined`), fazendo `_rw = 800`.
   - Consequentemente:
     - `rawRelX = 1858 - 0 = 1858px`!
     - `engineX = Math.round(1858 * (800 / 800)) = 1858` -> limitado por clamp em **`799`**!
   - O motor C++ recebeu `SDL_EVENT_MOUSE_BUTTON_UP` na coordenada $(799, 279)$ (fora de qualquer botão)!

3. **Comportamento da Engine SAGE (C&C Generals / Zero Hour):**
   - Conforme documentado no código-fonte nativo (`SDL3Mouse.cpp` e `GadgetPushButton`):
     Para que um botão considere o clique executado e dispare a ação (abrir submenu ou iniciar partida), **AMBOS** os eventos `MOUSE_BUTTON_DOWN` e `MOUSE_BUTTON_UP` precisam ocorrer dentro do retângulo daquele mesmo botão.
   - Ao detectar `DOWN` em $(666, 128)$ e `UP` em $(799, 279)$, a engine tratou o evento como um arrasto ou cancelamento de clique, liberando o botão sem executar o callback!

---

## 4. Causa Raiz dos Modais Invisíveis (Console e Afterburner)

Dois fatores impediam que o DevConsole e o Afterburner aparecessem sobre o jogo:

1. **Camada de Z-Index Invertida:**
   - No CSS anterior:
     `#game-container` estava em `z-index: 5000;`.
     `.modal-overlay` estava em `z-index: 2000;`.
   - Quando o modal era ativado, ele ficava desenhado fisicamente **atrás** do container do jogo.
2. **Conflito de Estilo Inline vs Classe CSS:**
   - A função `dismissAllModals()` executada na inicialização do jogo definia:
     `modal.style.display = 'none';` (estilo inline no elemento).
   - Quando o usuário clicava em "Console" ou "Afterburner", a função `openModal()` executava:
     `modal.classList.add('active');`.
   - O estilo inline `display: none` possui especificidade maior que a classe `.modal-overlay.active { display: flex; }`, mantendo o modal invisível.

---

## 5. Soluções Aplicadas e Verificadas

### 5.1. Resolução Incondicional do Canvas no Emscripten (`Qf` e `Uf`)
Em `public/GeneralsZH.js`:
```javascript
Qf = (a, b, c) => {
    // ...
    var _cv = (typeof document !== "undefined") ? document.getElementById('canvas') : null;
    var _rect = (_cv && _cv.getBoundingClientRect) ? _cv.getBoundingClientRect() : be(c);
    var _cw = (_cv && _cv.width) ? _cv.width : 800;
    var _ch = (_cv && _cv.height) ? _cv.height : 600;
    var _rw = (_rect && _rect.width > 0) ? _rect.width : _cw;
    var _rh = (_rect && _rect.height > 0) ? _rect.height : _ch;
    var _rawX = b.clientX - (_rect ? (_rect.left || 0) : 0);
    var _rawY = b.clientY - (_rect ? (_rect.top || 0) : 0);
    var _engX = Math.max(0, Math.min(_cw - 1, Math.round(_rawX * (_cw / _rw))));
    var _engY = Math.max(0, Math.min(_ch - 1, Math.round(_rawY * (_ch / _rh))));
    v[d + 10] = _engX;
    v[d + 11] = _engY;
};
```
- Independentemente de o evento ser recebido pelo `canvas`, `window` ou `document`, as coordenadas são sempre calculadas relativas a `document.getElementById('canvas').getBoundingClientRect()`.
- O teste unitário `Mousedown and Mouseup coordinate symmetry verified: (644, 134) == (644, 134)` foi incorporado à suíte oficial.

### 5.2. Hierarquia de Z-Index e Gerenciamento de Exibição
- `#game-container`: `z-index: 5000;` (cenário 3D e canvas)
- `#game-escape-bar`: `z-index: 6000;` (botões rápidos: Menu, Afterburner, Console)
- `.afterburner-osd`: `z-index: 8000;` (overlay flutuante de métricas em jogo)
- `.modal-overlay`: `z-index: 10000;` (janelas modais de configuração, diagnóstico e console)
- `.modal-overlay.active`: `display: flex !important; opacity: 1; visibility: visible; pointer-events: auto;`
- Funções `openModal()`, `closeModal()`, `dismissAllModals()` e `DevConsole` limpam explicitamente `style.display = ''`.

### 5.3. Pré-carregamento de Áudio de Interface (`AudioZH.big`)
- O log revelou advertências repetidas da engine ao tentar carregar síncronamente `data/audio/sounds/uboarder.wav` (o efeito sonoro reproduzido ao passar o mouse ou clicar em botões).
- Como `AudioZH.big` possui apenas **23 MB**, foi adicionado a `ESSENTIAL_FULL_PRELOAD` em `captalvo-asset-bridge.js`.
- O arquivo agora reside inteiramente na memória RAM, garantindo resposta sonora imediata nos botões sem stalls de I/O.

### 5.4. Arquivos do Jogo em `/Zero-Hour-Files/`
- Os arquivos do jogo disponibilizados pelo usuário no servidor Hostinger em `/home/u415074840/domains/captalvo.online/Zero-Hour-Files/` foram verificados e estão íntegros (incluindo `AudioZH.big`, `BrazilianZH.big`, `TexturesZH.big`, `W3DZH.big` e executáveis originais).
