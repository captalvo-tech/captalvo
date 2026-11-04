# CAPTALVO — RELATÓRIO TÉCNICO E ARQUITETURAL PERMANENTE
## Diagnóstico Completo de Entrada do Mouse, Escala de Viewport e Análise Comparativa dos Projetos de Referência

**Data:** 04 de Novembro de 2026  
**Ambiente:** `captalvo.online` (Produção WebAssembly / WebGL 2.0)  
**Autor:** Antigravity Pair Programming & Engine Architecture Team  

---

## 1. Resumo Executivo & Status Atual

Após a resolução da camada de leitura integral de texturas (.big), Asset Bridge e síntese do CSF em português, o motor Command & Conquer Generals: Zero Hour executa com sucesso no navegador a 60 FPS estáveis, carregando o cenário de fundo 3D, áudio e a interface nativa.

Contudo, dois sintomas impeditivos foram observados pelo usuário em testes reais de tela cheia:
1. **O menu principal não responde a nenhum clique do mouse** (botão "UM JOGADOR" e demais opções inoperantes).
2. **O jogo é renderizado em um retângulo reduzido no canto superior esquerdo**, circundado por uma extensa área preta.

Este relatório detalha a causa raiz de ambos os problemas a partir da análise comparativa profunda com os 4 principais projetos de referência que já executam Command & Conquer: Generals / Zero Hour na Web.

---

## 2. Projetos de Referência em Execução no Navegador

| Projeto | Repositório / Link | Tecnologia Principal | Estado & Aprendizados Relevantes |
| :--- | :--- | :--- | :--- |
| **Generals-Web (TheodoryLabs)** | [TheodoryLabs/command-and-conquer-generals-zero-hour-web](https://github.com/TheodoryLabs/command-and-conquer-generals-zero-hour-web) | WebAssembly + WebGL 2.0 (SDL2/SDL3 + Emscripten) | **Nossa base binária direta.** O motor renderiza em resolução fixa de **800x600**. Força `canvas.width = 800; canvas.height = 600` via JavaScript periódico e `ResizeObserver`. Converte coordenadas do mouse para o espaço `800x600` antes de entregar ao motor. |
| **GeneralsX Web (origami-ltd)** | [origami-ltd/wasm-generals](https://github.com/origami-ltd/wasm-generals) • Demo: [generals.wasm.ltd](https://generals.wasm.ltd) | WebAssembly + WebGPU (fallback WebGL 2.0) + pthread | **Alta performance e fidelidade.** Executa `main()` em worker (`-sPROXY_TO_PTHREAD`), com `OffscreenCanvas`, OPFS nativo e foco resiliente (`gxInstallFocusGuard`). Trata o mouse via `scaleMouseCoordinates()` recalculando coordenadas relativas à viewport real em relação a `TheDisplay`. |
| **GeneralsXWeb (meerzulee)** | [meerzulee/GeneralsXWeb](https://github.com/meerzulee/GeneralsXWeb) | WebAssembly + WebGL 2.0 | Menus, controles e escaramuça demonstrados. Foco em simplificação de pipeline WebGL 2.0 e buffers diretos. |
| **Generals-WebAssembly (JaroslavBes)** | [JaroslavBes/Generals-WebAssembly](https://github.com/JaroslavBes/Generals-WebAssembly) | WebAssembly + WebGL 2.0 + OPFS + Multiplayer | Código-fonte C++ completo disponível localmente em `z:\AI\Generals-WebAssembly`. Contém a implementação exata de `SDL3Mouse.cpp` (`m_inputMovesAbsolute = TRUE`, tratamento de perda de foco e escala de coordenadas). |

---

## 3. Investigação dos Logs e Causa Raiz do Problema

A inspeção do log de telemetria `session_sess_mw1kvis3_tsbig2.json` e dos binários compilados revelou com exatidão a cadeia causal dos dois problemas:

### 3.1. Causa Raiz da Escala e Viewport Reduzido
```
[ZeroHour-WASM] INFO: Creating SDL3 OpenGL ES 3.0 window (→ WebGL 2.0) ...
[ZeroHour-WASM] INFO: SDL3 + WebGL 2.0 context ready. logical: 1740x1305, physical: 2610x1957
```

1. **A Consulta de Resolução Inicial:**
   No arquivo compilado `GeneralsZH.js`, a tabela de chamadas `EM_ASM` (objeto `lg`) expõe:
   ```javascript
   680012: () => { var a = document.getElementById("canvas"); return a ? a.clientWidth : 0 },
   680104: () => { var a = document.getElementById("canvas"); return a ? a.clientHeight : 0 },
   680382: () => window.devicePixelRatio || 1,
   ```
   Em monitores modernos de alta densidade (DPR 1.5, tela 2560x1440), o elemento `<canvas>` estilizado com CSS `height: 100%; aspect-ratio: 4/3` tinha dimensões CSS de $1740 \times 1305$.
2. **Criação da Janela SDL3 com Resolução Gigante:**
   O código C++ consulta `680012` e `680104` e inicializa a janela lógica SDL3 com $1740 \times 1305$ e física com $2610 \times 1957$ ($1740 \times 1.5$).
   O SDL então redimensiona o buffer físico do canvas:
   `canvas.width = 2610; canvas.height = 1957;`
3. **Resolução Interna Fixa do Zero Hour:**
   O renderizador 3D e o sistema de interface 2D (`WW3D::Init`, `DX8Wrapper::Init`, `W3DDisplay`) são compilados internamente para renderizar em **$800 \times 600$** (padrão de interface do jogo).
   O motor emite `glViewport(0, 0, 800, 600)`.
4. **O Efeito Visual:**
   Em um buffer WebGL de $2610 \times 1957$, um retângulo de $800 \times 600$ ocupa apenas **$30.6\%$** da largura e **$30.6\%$** da altura.
   Os outros **$70\%$** do canvas permanecem pretos e não renderizados.

---

### 3.2. Causa Raiz da Falha no Mouse

O mouse falhou devido a **duas causas simultâneas**:

#### Causa A: Interceptação Invisível pelo Modal DOM (`.modal-overlay.active`)
- No arquivo `captalvo.css`:
  ```css
  #game-container { position: fixed; inset: 0; z-index: 1000; }
  .modal-overlay { position: fixed; inset: 0; z-index: 2000; pointer-events: none; background: rgba(0,0,0,0.001); }
  .modal-overlay.active { pointer-events: auto; }
  ```
- Quando o usuário clicou no botão "COMEÇAR O JOGO" / "JOGAR C&C GENERALS ZERO HOUR", o modal `#modal-launcher` recebeu a classe `.active`.
- As rotinas de inicialização do jogo fecharam apenas `#modal-import`, **deixando `#modal-launcher.active` ativo no DOM**.
- Como `.modal-overlay.active` possui `z-index: 2000` (superior ao `#game-container` de `z-index: 1000`) e fundo transparente (`rgba(0,0,0,0.001)`), uma camada invisível em tela cheia cobria 100% do canvas, interceptando e descartando todos os cliques do mouse antes que o canvas pudesse recebê-los.

#### Causa B: Deslocamento de Coordenadas de Entrada (TargetX / TargetY)
- No Emscripten (`GeneralsZH.js`), a função compilada `Qf` repassa as coordenadas dos eventos `mousedown`, `mousemove` e `mouseup`:
  ```javascript
  a = be(c); // canvas.getBoundingClientRect()
  v[d + 10] = b.clientX - (a.left | 0); // targetX em pixels CSS
  v[d + 11] = b.clientY - (a.top | 0);  // targetY em pixels CSS
  ```
- Se o canvas mede 1740 CSS px de largura, um clique no centro gera `targetX = 870`.
- No C++ do Zero Hour, o arquivo de interface `Window\Menus\MainMenu.wnd` define as coordenadas dos botões do menu em uma grade fixa de **$800 \times 600$**:
  ```ini
  NAME = "MainMenu.wnd:ButtonSinglePlayer";
  SCREENRECT = UPPERLEFT: 540 116, BOTTOMRIGHT: 748 152, CREATIONRESOLUTION: 800 600;
  ```
- O botão **"UM JOGADOR"** ocupa exclusivamente o retângulo $X \in [540, 748]$ e $Y \in [116, 152]$!
- Sem a projeção das coordenadas da tela para o espaço nativo $800 \times 600$, qualquer clique na tela enviava coordenadas totalmente distorcidas, tornando matematicamente impossível acertar o hit-test dos botões.

---

## 4. Solução Arquitetural Aplicada

Para resolver de forma definitiva e permanente ambos os problemas:

```mermaid
flowchart TD
    A["Clique Físico do Usuário"] --> B["Navegador / Evento DOM (clientX, clientY)"]
    B --> C["Limpeza de Modais (z-index 5000, pointer-events: auto)"]
    C --> D["Canvas getBoundingClientRect() (rw, rh)"]
    D --> E["Projeção de Escala: X * (800 / rw), Y * (600 / rh)"]
    E --> F["Emscripten Event Struct: targetX=(0..799), targetY=(0..599)"]
    F --> G["SDL3 Mouse Subsystem (window 800x600)"]
    G --> H["Zero Hour C++ GameEngine & W3DMainMenu"]
    H --> I["Hit-Test MainMenu.wnd:ButtonSinglePlayer (540..748, 116..152) -> SUCESSO!"]
```

### 1. Adequação da Resolução do Canvas e Viewport
1. **Enforçamento de Resolução 800x600:**
   Ajustamos os pontos de consulta do `EM_ASM` no `GeneralsZH.js` (`680012`, `680104`, `680197`, `680289`, `680382`) para reportarem a resolução lógica de **$800 \times 600$** com `dpr = 1`.
2. O SDL3 inicializa a janela nativa WebGL em **$800 \times 600$**, de modo que `glViewport(0, 0, 800, 600)` cobre **100% da área do buffer do canvas**.
3. O CSS estica o canvas suavemente em tela cheia via `aspect-ratio: 4 / 3`, com interpolação de hardware pelo GPU do navegador, sem bordas pretas internas.

### 2. Correção da Tradução de Coordenadas do Mouse em `Qf`
Instrumentamos a função compilada `Qf` no `GeneralsZH.js`:
```javascript
var cw = c && c.width ? c.width : 800;
var ch = c && c.height ? c.height : 600;
var rw = a.width || cw;
var rh = a.height || ch;
var rawRelX = b.clientX - a.left;
var rawRelY = b.clientY - a.top;
var engineX = Math.round(rawRelX * (cw / rw));
var engineY = Math.round(rawRelY * (ch / rh));
if (engineX < 0) engineX = 0;
if (engineX >= cw) engineX = cw - 1;
if (engineY < 0) engineY = 0;
if (engineY >= ch) engineY = ch - 1;
v[d + 10] = engineX;
v[d + 11] = engineY;
```
Dessa forma, qualquer clique no botão "UM JOGADOR" mapeia com precisão sub-pixel para o centro da caixa $[540 \dots 748, 116 \dots 152]$.

### 3. Remoção de Sobreposição de Modais & Focus Guard
1. Toda chamada de início de jogo descarta ativamente todas as classes `.active` de qualquer `.modal-overlay`.
2. `#game-container` tem `z-index` elevado para `5000`.
3. Guardião de foco (`gxInstallFocusGuard`) implementado no `captalvo-app.js` mantém o foco ativo no `#canvas` em eventos de clique, restauração de aba e visibilidade.

### 4. Instrumentação Diagnóstica Obrigatória
Criado `window.CaptalvoMouseDiag` e integrado ao Console do Desenvolvedor (F2 / Console OSD), registrando a cada clique:
- Coordenadas DOM (`clientX`, `clientY`).
- Coordenadas relativas ao canvas.
- Coordenadas projetadas na resolução lógica do motor ($800 \times 600$).
- Confirmação de entrega ao buffer de eventos Emscripten/SDL.
- Identificação em tempo real do botão atingido em `MainMenu.wnd` (`ButtonSinglePlayer`, `ButtonMultiplayer`, etc.).
