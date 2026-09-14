# Painel Vigia — Grupo Donato Souza (frontend)

Site estático (HTML/CSS/JS puro, sem build), pronto para um novo projeto Vercel.

## Antes de publicar

1. Ative e publique o workflow n8n `Painel - Vigia - Grupo Donato Souza - API`
   (backend) e confirme a URL de produção dos dois webhooks.
2. Abra `config.js` e ajuste:
   - `API_BASE_URL`: base da URL de produção do n8n (sem `/painel-donato-...`
     no final, só até `/webhook`).
   - `API_KEY`: o mesmo valor colocado no node `Config Painel` do backend
     (`painel_api_key`), e nas condições `Autorizado?` dos dois webhooks.
3. Opcional: troque o favicon/logo se um dia o Grupo Donato Souza tiver
   marca própria a exibir (hoje o painel usa a marca Advocacia Escalável).

## Publicar na Vercel

1. Crie um novo repositório Git com o conteúdo desta pasta (`index.html`,
   `styles.css`, `app.js`, `config.js`, `ae-brand.css`, `assets/`).
2. Na Vercel: **New Project** → importe o repositório → Framework Preset
   **Other** (site estático puro, sem etapa de build) → Deploy.
3. Teste a URL gerada; confira no console do navegador se as duas chamadas
   (`/painel-donato-metricas` e `/painel-donato-atendimentos`) retornam 200.
   Um erro 401 quase sempre é `API_KEY` divergente entre `config.js` e o
   node `Config Painel` do backend.

## Estrutura

- `index.html` — página única do painel (KPIs, gráfico, distribuição de
  score, critérios, falhas, tipo de atendimento, por colaborador, tabela de
  atendimentos com filtro por sinal e paginação).
- `app.js` — busca os dois endpoints e renderiza tudo; sem framework.
  Usa Chart.js via CDN só para o gráfico de série temporal.
- `styles.css` — estilos do app, construídos sobre os tokens `--ae-*` de
  `ae-brand.css` (identidade Advocacia Escalável: Purple Blue `#2B2B6E` +
  Magic Pink `#FF038F`, tipografia Geologica).
- `config.js` — os dois únicos valores que mudam por ambiente.

## Limitações conhecidas (versão de testes)

- Autenticação por `api_key` fixa e visível no código-fonte do navegador —
  mesmo modelo já usado no painel da própria Advocacia Escalável. Não
  distingue quem no escritório está olhando; adequado para uma versão de
  testes sem contrato ainda fechado. Se o painel virar produto contratado,
  vale migrar para login por colaborador (modelo da Engel, com OAuth Bitrix
  e token por escopo).
- Sem observações manuais de auditor (decisão do escritório para esta
  versão) — só os dados automáticos gerados pelo Vigia.
- Sem período contínuo por padrão: os atalhos de período (7/30/90 dias)
  cobrem os casos mais comuns; não há seletor de data livre nesta primeira
  versão.
