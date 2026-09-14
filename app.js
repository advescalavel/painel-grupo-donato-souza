// =============================================================================
// Painel Vigia — Grupo Donato Souza — app.js
// Consome os dois endpoints do backend n8n (métricas e atendimentos) e
// renderiza o dashboard. Sem build step, sem framework — JS puro + Chart.js
// (via CDN) para o único gráfico da tela.
// =============================================================================

const CONFIG = window.VIGIA_CONFIG;

const FAIXA_CORES = {
  critico: 'var(--ae-danger)',
  regular: 'var(--ae-warn)',
  bom: 'var(--ae-info)',
  excelente: 'var(--ae-success)',
};

const SINAL_ROTULO = {
  sla_2h_descumprido: '🔴 SLA 2h',
  sla_1h_aviso_enviado: '⚠️ Aviso 1h',
  insatisfacao_detectada: '😟 Insatisfação',
  palavra_chave_detectada: '🚨 Palavra-chave',
};

const estado = {
  periodoDias: 7,
  status: 'todos',
  sinal: null,
  pagina: 1,
  limite: 25,
  totalAtendimentos: 0,
};

let graficoSerie = null;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function periodosParaQuery() {
  if (estado.periodoDias === 'tudo') return [];
  const ate = new Date();
  const desde = new Date(ate.getTime() - estado.periodoDias * 24 * 60 * 60 * 1000);
  return [{ desde: desde.toISOString(), ate: ate.toISOString() }];
}

function montarUrl(caminho, paramsExtra) {
  const url = new URL(`${CONFIG.API_BASE_URL}/${caminho}`);
  url.searchParams.set('api_key', CONFIG.API_KEY);
  const periodos = periodosParaQuery();
  if (periodos.length) url.searchParams.set('periodos', JSON.stringify(periodos));
  if (estado.status !== 'todos') url.searchParams.set('status', estado.status);
  for (const [k, v] of Object.entries(paramsExtra || {})) {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, v);
  }
  return url.toString();
}

function formatarData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function rotuloBucket(bucket, granularidade) {
  if (granularidade === 'mes') {
    const [ano, mes] = bucket.split('-');
    return `${mes}/${ano.slice(2)}`;
  }
  const d = new Date(bucket);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

async function buscarJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const corpo = await resp.json().catch(() => ({}));
    throw new Error(corpo.erro || `Erro ${resp.status}`);
  }
  return resp.json();
}

// ---------------------------------------------------------------------------
// Renderização — KPIs
// ---------------------------------------------------------------------------

function renderKpis(kpis) {
  const cartoes = [
    { rotulo: 'Atendimentos', valor: kpis.total_atendimentos, alerta: false },
    { rotulo: 'Avaliados', valor: kpis.avaliados, alerta: false },
    { rotulo: 'Efetividade média', valor: kpis.efetividade_media_pct !== null ? `${kpis.efetividade_media_pct}` : '—', alerta: false },
    { rotulo: '🔴 SLA 2h agora', valor: kpis.sla_2h_descumprido_agora, alerta: true },
    { rotulo: '⚠️ Aviso 1h agora', valor: kpis.sla_1h_aviso_agora, alerta: true },
    { rotulo: '😟 Insatisfação agora', valor: kpis.insatisfacao_detectada_agora, alerta: true },
    { rotulo: '🚨 Palavra-chave agora', valor: kpis.palavra_chave_detectada_agora, alerta: true },
  ];

  document.getElementById('kpis').innerHTML = cartoes.map(c => `
    <div class="ae-kpi-card ${c.alerta ? 'ae-kpi-card--alerta' : ''} ${c.alerta && !c.valor ? 'is-zero' : ''}">
      <span class="ae-kpi-card__rotulo">${c.rotulo}</span>
      <span class="ae-kpi-card__valor">${c.valor ?? '—'}</span>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------------
// Renderização — série temporal
// ---------------------------------------------------------------------------

function renderSerie(serie, granularidade) {
  const ctx = document.getElementById('graficoSerie').getContext('2d');
  const rotulos = serie.map(s => rotuloBucket(s.bucket, granularidade));
  const atendimentos = serie.map(s => s.atendimentos);
  const scoreMedio = serie.map(s => s.score_medio);

  if (graficoSerie) graficoSerie.destroy();
  graficoSerie = new Chart(ctx, {
    data: {
      labels: rotulos,
      datasets: [
        {
          type: 'bar', label: 'Atendimentos', data: atendimentos,
          backgroundColor: 'rgba(83, 76, 140, 0.35)', borderRadius: 4, yAxisID: 'y',
        },
        {
          type: 'line', label: 'Score médio', data: scoreMedio,
          borderColor: '#FF038F', backgroundColor: '#FF038F',
          tension: 0.3, pointRadius: 3, yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        y: { position: 'left', beginAtZero: true, title: { display: false } },
        y1: { position: 'right', beginAtZero: true, max: 100, grid: { drawOnChartArea: false } },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Renderização — distribuição de score
// ---------------------------------------------------------------------------

function renderDistribuicaoScore(distribuicao) {
  const total = distribuicao.reduce((acc, f) => acc + f.quantidade, 0) || 1;
  document.getElementById('distribuicaoScore').innerHTML = distribuicao.map(f => `
    <div class="ae-barra-faixa">
      <span class="ae-apoio">${f.rotulo}</span>
      <span class="ae-barra-faixa__trilho">
        <span class="ae-barra-faixa__preenchimento" style="width:${(100 * f.quantidade / total).toFixed(1)}%; background:${FAIXA_CORES[f.chave] || 'var(--ae-pink)'}"></span>
      </span>
      <span class="ae-numero" style="font-size:13px">${f.quantidade}</span>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------------
// Renderização — critérios
// ---------------------------------------------------------------------------

function renderCriterios(criterios) {
  document.getElementById('criterios').innerHTML = criterios.map(c => `
    <div class="ae-criterio">
      <span class="ae-criterio__nome">${c.criterio}</span>
      <span class="ae-criterio__trilho">
        <span class="ae-criterio__preenchimento" style="width:${c.taxa_aprovacao_pct ?? 0}%"></span>
      </span>
      <span class="ae-criterio__pct">${c.taxa_aprovacao_pct !== null ? c.taxa_aprovacao_pct + '%' : '—'}</span>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------------
// Renderização — listas simples (falhas, tipos, colaboradores)
// ---------------------------------------------------------------------------

function renderFalhasPorCriterio(falhasPorCriterio) {
  const el = document.getElementById('falhasPorCriterio');
  const linhas = [];
  for (const bloco of falhasPorCriterio) {
    if (!bloco.motivos.length) continue;
    linhas.push(`<div class="ae-lista-simples__item" style="border-bottom:none;padding-bottom:2px"><strong>${bloco.criterio}</strong></div>`);
    for (const m of bloco.motivos) {
      linhas.push(`<div class="ae-lista-simples__item"><span class="ae-apoio">${m.motivo}</span><span class="ae-lista-simples__qtd">${m.quantidade}</span></div>`);
    }
  }
  el.innerHTML = linhas.length ? linhas.join('') : '<p class="ae-apoio">Nenhuma falha registrada no período.</p>';
}

function renderListaSimples(elId, itens, chaveRotulo, chaveQtd, chaveExtra) {
  const el = document.getElementById(elId);
  if (!itens.length) { el.innerHTML = '<p class="ae-apoio">Sem dados no período.</p>'; return; }
  el.innerHTML = itens.map(it => `
    <div class="ae-lista-simples__item">
      <span>${it[chaveRotulo]}${chaveExtra && it[chaveExtra] !== null && it[chaveExtra] !== undefined ? ` <span class="ae-apoio">(score médio ${it[chaveExtra]})</span>` : ''}</span>
      <span class="ae-lista-simples__qtd">${it[chaveQtd]}</span>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------------
// Renderização — tabela de atendimentos
// ---------------------------------------------------------------------------

function sinaisDoAtendimento(item) {
  return Object.entries(SINAL_ROTULO)
    .filter(([campo]) => item[campo])
    .map(([, rotulo]) => `<span class="ae-badge ae-badge--alerta">${rotulo}</span>`)
    .join(' ');
}

function detalheHtml(item) {
  const criterio = (nome, score, falha) => `
    <div>
      <div class="ae-detalhe-bloco__rotulo">${nome}</div>
      <div class="ae-detalhe-bloco__texto">${score ?? '—'} ${falha && falha !== 'nenhuma' ? `<span class="ae-badge ae-badge--erro">${falha}</span>` : ''}</div>
    </div>`;

  return `
    <div class="ae-detalhe-grid">
      ${criterio('Objetividade', item.objetividade_score, item.falha_objetividade)}
      ${criterio('Simplicidade', item.simplicidade_score, item.falha_simplicidade)}
      ${criterio('Velocidade', item.velocidade_score, item.falha_velocidade)}
      ${criterio('Previsibilidade', item.previsibilidade_score, item.falha_previsibilidade)}
      <div>
        <div class="ae-detalhe-bloco__rotulo">Categoria do erro</div>
        <div class="ae-detalhe-bloco__texto">${item.categoria_erro || '—'}</div>
      </div>
      <div>
        <div class="ae-detalhe-bloco__rotulo">Ação recomendada</div>
        <div class="ae-detalhe-bloco__texto">${item.acao_recomendada || '—'}</div>
      </div>
      <div style="grid-column: 1 / -1">
        <div class="ae-detalhe-bloco__rotulo">Justificativa</div>
        <div class="ae-detalhe-bloco__texto">${item.justificativa || '—'}</div>
      </div>
      ${item.evidencia_erro ? `
      <div style="grid-column: 1 / -1">
        <div class="ae-detalhe-bloco__rotulo">Evidência</div>
        <div class="ae-detalhe-bloco__texto">${item.evidencia_erro}</div>
      </div>` : ''}
    </div>`;
}

function renderTabelaAtendimentos(dados) {
  const corpo = document.getElementById('corpoTabela');
  estado.totalAtendimentos = dados.total;

  if (!dados.itens.length) {
    corpo.innerHTML = '<tr><td colspan="7" class="ae-carregando">Nenhum atendimento encontrado com esses filtros.</td></tr>';
  } else {
    corpo.innerHTML = dados.itens.map((item, idx) => `
      <tr class="ae-tabela-linha--expandivel" data-idx="${idx}">
        <td>${item.contact_name || 'Não informado'}</td>
        <td>${item.operator_name || '—'}</td>
        <td>${formatarData(item.started_at)}</td>
        <td>${item.status === 'em_andamento' ? 'Em andamento' : 'Concluído'}</td>
        <td>${item.tipo_atendimento || '—'}</td>
        <td class="ae-numero">${item.score_efetividade ?? '—'}</td>
        <td>${sinaisDoAtendimento(item) || '—'}</td>
      </tr>
      <tr class="ae-linha-detalhe" data-idx-detalhe="${idx}"><td colspan="7">${detalheHtml(item)}</td></tr>
    `).join('');

    corpo.querySelectorAll('.ae-tabela-linha--expandivel').forEach(tr => {
      tr.addEventListener('click', () => {
        const detalhe = corpo.querySelector(`[data-idx-detalhe="${tr.dataset.idx}"]`);
        detalhe.classList.toggle('is-aberta');
      });
    });
  }

  const totalPaginas = Math.max(1, Math.ceil(dados.total / estado.limite));
  document.getElementById('infoPagina').textContent = `Página ${dados.pagina_atual} de ${totalPaginas} (${dados.total} atendimentos)`;
  document.getElementById('btnPaginaAnterior').disabled = dados.pagina_atual <= 1;
  document.getElementById('btnProximaPagina').disabled = dados.pagina_atual >= totalPaginas;
}

// ---------------------------------------------------------------------------
// Carregamento
// ---------------------------------------------------------------------------

async function carregarMetricas() {
  try {
    const dados = await buscarJson(montarUrl('painel-donato-metricas'));
    renderKpis(dados.kpis);
    renderSerie(dados.serie, dados.granularidade);
    renderDistribuicaoScore(dados.distribuicao_score);
    renderCriterios(dados.criterios);
    renderFalhasPorCriterio(dados.falhas_por_criterio);
    renderListaSimples('tiposAtendimento', dados.tipos_atendimento, 'tipo', 'quantidade');
    renderListaSimples('porColaborador', dados.por_colaborador, 'operador', 'atendimentos', 'score_medio');
  } catch (e) {
    document.getElementById('kpis').innerHTML = `<p class="ae-apoio">Não foi possível carregar os indicadores: ${e.message}</p>`;
  }
}

async function carregarAtendimentos() {
  try {
    const params = { pagina: estado.pagina, limite: estado.limite };
    if (estado.sinal) params[estado.sinal] = '1';
    const dados = await buscarJson(montarUrl('painel-donato-atendimentos', params));
    renderTabelaAtendimentos(dados);
  } catch (e) {
    document.getElementById('corpoTabela').innerHTML = `<tr><td colspan="7" class="ae-carregando">Não foi possível carregar os atendimentos: ${e.message}</td></tr>`;
  }
}

function carregarTudo() {
  carregarMetricas();
  carregarAtendimentos();
}

// ---------------------------------------------------------------------------
// Interações
// ---------------------------------------------------------------------------

function configurarFiltros() {
  document.querySelectorAll('[data-periodo]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-periodo]').forEach(b => b.classList.remove('is-ativo'));
      btn.classList.add('is-ativo');
      estado.periodoDias = btn.dataset.periodo === 'tudo' ? 'tudo' : Number(btn.dataset.periodo);
      estado.pagina = 1;
      carregarTudo();
    });
  });

  document.querySelectorAll('[data-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-status]').forEach(b => b.classList.remove('is-ativo'));
      btn.classList.add('is-ativo');
      estado.status = btn.dataset.status;
      estado.pagina = 1;
      carregarTudo();
    });
  });

  document.querySelectorAll('[data-sinal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const jaAtivo = btn.classList.contains('is-ativo');
      document.querySelectorAll('[data-sinal]').forEach(b => b.classList.remove('is-ativo'));
      estado.sinal = jaAtivo ? null : btn.dataset.sinal;
      if (!jaAtivo) btn.classList.add('is-ativo');
      estado.pagina = 1;
      carregarAtendimentos();
    });
  });

  document.getElementById('btnAtualizar').addEventListener('click', carregarTudo);

  document.getElementById('btnPaginaAnterior').addEventListener('click', () => {
    if (estado.pagina > 1) { estado.pagina--; carregarAtendimentos(); }
  });
  document.getElementById('btnProximaPagina').addEventListener('click', () => {
    const totalPaginas = Math.max(1, Math.ceil(estado.totalAtendimentos / estado.limite));
    if (estado.pagina < totalPaginas) { estado.pagina++; carregarAtendimentos(); }
  });
}

function configurarTema() {
  const salvo = localStorage.getItem('vigia-donato-tema') || 'claro';
  aplicarTema(salvo);
  document.getElementById('btnTema').addEventListener('click', () => {
    const atual = document.documentElement.getAttribute('data-tema');
    aplicarTema(atual === 'claro' ? 'escuro' : 'claro');
  });
}

function aplicarTema(tema) {
  document.documentElement.setAttribute('data-tema', tema);
  document.body.setAttribute('data-tema', tema);
  localStorage.setItem('vigia-donato-tema', tema);
  document.getElementById('temaIcone').textContent = tema === 'claro' ? '🌙' : '☀️';
  document.getElementById('temaLabel').textContent = tema === 'claro' ? 'Escuro' : 'Claro';
  if (graficoSerie) graficoSerie.update();
}

async function carregarLogos() {
  const [completo, isotipo] = await Promise.all([
    fetch('assets/logo-completo.svg').then(r => r.text()),
    fetch('assets/isotipo-gradiente.svg').then(r => r.text()),
  ]);
  document.getElementById('logoCompleto').innerHTML = completo;
  document.getElementById('logoIsotipo').innerHTML = isotipo;
  document.getElementById('logoRodape').innerHTML = completo;
}

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------

document.getElementById('nomeEscritorio').textContent = CONFIG.ESCRITORIO_NOME;
configurarFiltros();
configurarTema();
carregarLogos().catch(() => {});
carregarTudo();
