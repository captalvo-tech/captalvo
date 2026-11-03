# CAPTALVO — Roteiro de Desenvolvimento (Roadmap)

## Fase 1 — Alpha Foundation (Concluída)
- [x] Domínio de produção ativo: `https://captalvo.online`
- [x] Hospedagem Hostinger Cloud Startup configurada com PHP 8.3 e SSL.
- [x] Motor Zero Hour WebAssembly com renderizador WebGL 2.0.
- [x] Carregamento seguro via OPFS (Origin Private File System) e Service Worker com HTTP Range requests.
- [x] Suporte automático à instalação PT-BR (EA App) em `D:\Command and Conquer Generals Zero Hour`.
- [x] API de backend isolada com `/api/health`.
- [x] Repositório oficial configurado sob a organização `captalvo-tech/captalvo`.

---

## Fase 2 — Modo de Jogo "Captalvo Alpha"
Preservando o modo original para regressão, introduz-se a mecânica inicial de sobrevivência e conquista tática:

1. **Condição Inicial:**
   - O jogador inicia sem Centro de Comando (Command Center).
   - Saldo financeiro inicial: $0.
   - 1 Trabalhador ativo (inspirado no Worker da GLA).
   - Kit inicial de recursos para a primeira estrutura.

2. **Primeiras Estruturas e Ações:**
   - Movimentação e seleção básica do trabalhador.
   - Construção do **Abrigo Inicial** (Primeiro ponto de apoio territorial).
   - Fincar **Bandeira de Território** para demarcação da área de influência.

3. **Pontos de Investigação no Código-Fonte C++:**
   - `GameLogic.cpp` -> Rotina `placeNetworkBuildingsForPlayer`.
   - `Player.cpp` -> `initStartingBuildings()`, créditos iniciais e unidades de início de partida.
   - `Faction.ini` e `CommandSet.ini` -> Definição de estruturas construíveis pelo Worker.

---

## Fase 3 — Economia Rural e Recursos Básicos
- Poço de Água (Geração de recurso hídrico).
- Plantação e Fazenda (Produção de alimentos e sustento).
- Mercado de venda e entreposto comercial (Conversão de produção em capital).

---

## Fase 4 — Persistência Global e Multijogador
- Registro e autenticação de comandantes via API PHP 8.3 + MySQL.
- Mapa global tático com demarcação territorial persistente.
- Batalhas de fronteira e alianças de clãs.
