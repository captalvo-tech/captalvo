# CAPTALVO — HANDOFF E GUIA DE INÍCIO RÁPIDO

> **Para novos agentes de IA e desenvolvedores:**  
> Este documento é o ponto de partida para compreender a arquitetura, localização de arquivos e o estado atual do Captalvo.
> Documentações internas e planejamento avançado estão disponíveis no repositório privado:
> **[captalvo-tech/captalvo-source](https://github.com/captalvo-tech/captalvo-source)**

---

## 🧭 1. O QUE É O CAPTALVO?

O **Captalvo** (*Conquista sem limites. Simulador de Guerra Global Virtual*) é um MMORTS militar global executado nativamente no navegador web.
- **Produção:** [https://captalvo.online](https://captalvo.online)
- **Base Técnica:** Motor WebAssembly de **Command & Conquer: Generals / Zero Hour** (Emscripten) + WebGL 2.0 + SDL3.
- **Armazenamento de Assets:** Os arquivos do jogo (`.big`) pertencem à Electronic Arts e **não são distribuídos no servidor**. O jogador importa os arquivos a partir da sua cópia legítima local, que são armazenados de forma privativa no navegador via **OPFS (Origin Private File System)**.

---

## 🗺️ 2. ONDE ESTÃO OS ARQUIVOS NO AMBIENTE LOCAL?

| Caminho Local | Descrição |
|---|---|
| `Z:\AI\captalvo` | Aplicação web principal (HTML5/CSS3/JS, Afterburner HUD, API PHP 8.3, deploy scripts). |
| `Z:\AI\captalvo-source` | Repositório privado com a documentação mestre, análise de crash, planejamento e infraestrutura. |
| `Z:\AI\Generals-WebAssembly` | Código-fonte C++ completo do motor Generals Zero Hour portado para WebAssembly. |
| `Z:\AI\theodory-release-v052` | Build standalone web com `GeneralsZH.js`, `GeneralsZH.wasm` e `serve.py`. |
| `C:\Users\VIOLI\Captalvo_NVMe_Assets\` | **33 arquivos `.big` originais descompactados** no NVMe para testes e importação rápida. |
| `D:\Captalvo_ZeroHour_Browser_Assets.zip` | Arquivo comprimido de backup com os 33 arquivos `.big`. |

---

## ⚡ 3. O QUE ESTÁ FEITO E OPERACIONAL HOJE?

1. **Interface Militar Moderna:** Integrada em `public/index.html` e `public/captalvo.css`.
2. **Modal de Console Sob Demanda:** `#modal-console` permite visualizar e copiar logs sem poluir a tela.
3. **MSI Afterburner HUD & OSD Flutuante:**
   - Métricas em tempo real: FPS (Instantâneo, Médio, Mínimo e 1% Low), Frametime sparkline, uso de CPU (lag do event loop), RAM Heap e rede (download/upload KB/s).
   - Janela arrastável flutuante `#afterburner-osd`.
4. **Profiler de Hardware & Telemetria:**
   - Detecta GPU, CPU cores + benchmark single-core, tela, RAM e benchmark de disco OPFS.
   - Ingestão remota em `POST /api/telemetry` salvando relatórios em `/app/storage/logs/` na Hostinger.
5. **Servidor Hostinger Cloud:**
   - SSH porta `65002` no IP `186.244.144.164`, usuário `u415074840`.
   - Script de deploy seguro: `scripts/deploy.ps1`.
   - Monitor de logs ao vivo: `scripts/tail-logs.ps1`.

---

## 🔬 4. DIAGNÓSTICO DO ERRO ATUAL DA ENGINE (`-404` / `INIError`)

Ao iniciar o jogo no navegador, a engine aborta com:
```text
ERROR: Failed to fetch first 16 bytes of archive: INI.big (status -404)
Mounted 0 files to Emscripten FS under /assets/
FATAL C++ CRASH (ReleaseCrash): INIError exception during init: -559087610
```

### Causa Raiz Técnica Comprovada:
- `GeneralsZH.js` utiliza `new XMLHttpRequest()` com parâmetro síncrono (`open("GET", url, false)`).
- **Limitação de Segurança do Chromium (Chrome/Edge):** XHR síncrono na thread principal **não aciona o Service Worker**.
- As requisições de range caem na internet, batem no servidor Apache da Hostinger com HTTP 404, nenhum arquivo `.big` é montado e a engine falha ao tentar abrir `Window\Menus\MainMenu.wnd`.

### Solução Planejada:
- **Dedicated File Worker** + `SharedArrayBuffer` + `Atomics.wait()` lendo do OPFS via `createSyncAccessHandle()`, **OU**
- **Pré-montagem assíncrona dos arquivos essenciais** no Emscripten MEMFS (`FS.createDataFile`) antes de chamar `CreateGameEngine()`.

Consulte a documentação completa em `Z:\AI\captalvo-source\docs\arquitetura\ENGINE_WASM_E_CRASH_ANALYSIS.md`.

---

## 🛠️ 5. GUIA RÁPIDO DE COMANDOS

```powershell
# Executar servidor local de desenvolvimento
cd Z:\AI\captalvo
node scripts/local_server.js

# Ver logs de telemetria das sessões remotas
cd Z:\AI\captalvo
powershell -ExecutionPolicy Bypass -File scripts/tail-logs.ps1 -Follow

# Deploy atômico seguro na Hostinger
cd Z:\AI\captalvo
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
```

