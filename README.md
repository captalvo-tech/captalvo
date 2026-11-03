# CAPTALVO — Simulador de Guerra Global Virtual

> **Conquista sem limites.**  
> *A virtual global warfare simulation powered by the Command & Conquer: Generals Zero Hour WebAssembly engine.*

---

## 🌐 Produção

- **URL Oficial:** [https://captalvo.online](https://captalvo.online)
- **Hospedagem:** Hostinger Cloud Startup
- **Backend:** PHP 8.3 + MySQL (API isolada em `/api/health`)
- **Cliente:** WebAssembly + WebGL 2.0 (Emscripten) + OPFS (Origin Private File System)

---

## ⚖️ Licenciamento e Propriedade Intelectual

- O código do motor C++ é derivado do código-fonte liberado pela **Electronic Arts Inc.** sob a licença **GNU General Public License v3 (GPL-3.0)** com os termos adicionais da Seção 7 da EA.
- **Aviso Legal:** A *Electronic Arts Inc.* não patrocina, endossa ou apoia este projeto. *Command & Conquer* e *Generals Zero Hour* são marcas comerciais da Electronic Arts.
- **Conformidade de Assets:** **Nenhum arquivo comercial original da EA (.big, .bik, mapas, modelos ou áudios) é distribuído publicamente** neste repositório ou no servidor Hostinger. Os arquivos são importados exclusivamente pelo usuário a partir de sua cópia legítima local e armazenados no sandbox privativo do navegador do jogador via OPFS.

---

## 🚀 Arquitetura Técnica

| Camada | Tecnologia | Papel |
|---|---|---|
| **Simulação RTS** | C++ (Zero Hour) compilado para WebAssembly | Simulação de unidades, física, IA, lógica de combate e economia tática. |
| **Renderização** | Direct3D 8 traduzido para WebGL 2.0 | Shaders GLES3, renderização de terreno, estruturas, partículas e interface clássica. |
| **Armazenamento de Assets** | OPFS (Origin Private File System) + Service Worker | Streaming sob demanda via HTTP Range requests servidos localmente pelo Service Worker, mantendo os arquivos 100% no dispositivo do usuário. |
| **Backend de Serviços** | PHP 8.3 REST API | Autenticação, telemetria, integridade de sessões, persistência futura de contas e territórios. |
| **Banco de Dados** | MySQL | Persistência de jogadores, estado de mundo e alianças. |

---

## 🕹️ Como Rodar Localmente

1. Clone o repositório:
   ```bash
   git clone https://github.com/captalvo-tech/captalvo.git
   cd captalvo
   ```

2. Inicie o servidor de desenvolvimento local:
   ```bash
   node scripts/local_server.js
   ```

3. Abra `http://127.0.0.1:8080` no navegador (Chrome, Edge ou Firefox).
4. Clique em **Importar Arquivos do Jogo** e selecione a pasta da sua instalação de Zero Hour (Steam ou EA App).
5. Clique em **JOGAR CAPTALVO**.

---

## 📦 Estrutura do Repositório

```text
captalvo/
├── public/                 # Diretório servido na web (public_html)
│   ├── index.html          # Shell tático responsivo (Desktop & Mobile)
│   ├── captalvo.css        # Identidade visual militar escura do Captalvo
│   ├── captalvo-app.js     # Gerenciamento de OPFS, importador e boot do motor
│   ├── captalvo-sw.js      # Service Worker (COOP/COEP + Interceptor Range OPFS)
│   ├── GeneralsZH.wasm     # Binário WebAssembly do motor Zero Hour
│   ├── GeneralsZH.js       # Bootstrap Emscripten
│   ├── .htaccess           # Configuração Apache, MIME types e isolamento
│   └── api/
│       ├── index.php       # Front-controller da API PHP 8.3
│       └── health.php      # Endpoint /api/health
├── app/                    # Backend PHP 8.3 (não exposto publicamente)
│   ├── Bootstrap.php       # Autoloading e ciclo de vida
│   ├── Config/             # Configurações do sistema
│   ├── Controllers/        # Controladores REST
│   └── Database/           # Camada de conexão PDO
├── scripts/
│   ├── deploy.ps1          # Script de deploy seguro para Hostinger Cloud
│   └── local_server.js     # Servidor de teste local com suporte a Range requests
└── docs/
    ├── ARCHITECTURE.md     # Documentação detalhada da arquitetura
    └── ROADMAP.md          # Fases de expansão e mecânica do Captalvo
```
