// =============================================================================
// Painel Vigia — Grupo Donato Souza — Configuração
//
// AJUSTAR ANTES DE PUBLICAR:
// 1. API_BASE_URL: a URL de produção do n8n (mesma base usada nos outros
//    painéis da Advocacia Escalável), sem barra no final.
// 2. API_KEY: o MESMO valor colocado no node "Config Painel" do workflow
//    "Painel - Vigia - Grupo Donato Souza - API" (painel_api_key), e nas
//    condições "Autorizado?" dos dois webhooks.
//
// Atenção: como este painel não tem login por colaborador, a API_KEY fica
// visível no código-fonte do navegador (é assim também no painel da própria
// Advocacia Escalável). Ela serve para não deixar os dois endpoints abertos
// a qualquer robô que encontre a URL, não para controlar quem no escritório
// pode ver o quê. Adequado para esta versão de testes; se o painel virar
// produto contratado, vale migrar para o modelo de login por colaborador
// (como o da Engel).
// =============================================================================

window.VIGIA_CONFIG = {
  API_BASE_URL: "https://webhook.prod.advocaciaescalaveldev.shop/webhook",
  API_KEY: "PLACEHOLDER_PAINEL_API_KEY_TROCAR",
  ESCRITORIO_NOME: "Grupo Donato Souza",
};
