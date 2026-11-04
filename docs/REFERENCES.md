# Projetos de Referência — C&C Generals & Zero Hour WebAssembly

Documentação permanente dos projetos de referência no ecossistema de código aberto que conseguiram executar *Command & Conquer: Generals / Zero Hour* no navegador via WebAssembly.

---

## Os 4 Principais Projetos no GitHub

| Projeto | Tecnologia | Estado Informado | Link |
| :--- | :--- | :--- | :--- |
| **Generals-Web — TheodoryLabs** | WebAssembly + WebGL 2.0 | Menu funcional e partidas de escaramuça, com limitações de desempenho. | [GitHub](https://github.com/TheodoryLabs/command-and-conquer-generals-zero-hour-web) |
| **GeneralsX Web — origami-ltd** | WebAssembly + WebGPU / WebGL2 (`d3d8webgl`) | Interface original, renderização 3D, carregamento de arquivos locais, Worker e multiplayer WebRTC. Site online em produção: [generals.wasm.ltd](https://generals.wasm.ltd). | [GitHub](https://github.com/origami-ltd/wasm-generals) |
| **GeneralsXWeb — meerzulee** | WebAssembly + WebGL 2.0 | Menu, controles e escaramuça demonstrados. | [GitHub](https://github.com/meerzulee/GeneralsXWeb) |
| **Generals-WebAssembly — JaroslavBes** | WebAssembly + WebGL 2.0 | Menu, escaramuça, armazenamento OPFS e multiplayer experimental. Base C++ do generals.wasm.ltd. | [GitHub](https://github.com/JaroslavBes/Generals-WebAssembly) |

---

## Priorização e Papel no Captalvo

### 1. TheodoryLabs (Referência da Engine Atual)
- É a principal referência para o binário da engine que estamos executando no Captalvo.
- Documenta controles de mouse, teclado e estrutura de renderização WebGL 2.0 via SDL.

### 2. GeneralsX Web / origami-ltd / JaroslavBes (Referência de Arquitetura e Produção)
- É a referência do estado da arte mais avançada, com demonstração pública funcional em [generals.wasm.ltd](https://generals.wasm.ltd).
- **Inovações-chave adotadas pelo Captalvo:**
  1. **Execução em Web Worker (`-sPROXY_TO_PTHREAD`):** Permite chamadas síncronas diretas via `FileSystemFileHandle.createSyncAccessHandle()`, reduzindo o consumo de RAM de 1.2 GB para ~130 MB.
  2. **Multiplayer Serverless P2P:** Conexão direta entre navegadores via WebRTC DataChannels com sinalização gratuita por brokers MQTT públicos (`broker.emqx.io`).
  3. **Blindagem de Teclas (`KeyGuard`):** Prevenção de conflito de atalhos de RTS (`Ctrl+1..9`, `Backspace`, `Tab`, `F1-F12`) com o navegador.
  4. **Ciclo de Vida:** Teardown limpo via recarga de página para desalocar a memória do motor SAGE.
