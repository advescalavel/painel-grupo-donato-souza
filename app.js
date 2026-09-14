// =============================================================================
// app.js — Painel Vigia · Grupo Donato Souza
//
// Mesma arquitetura de UI do Painel Vigia (barra pegajosa, popover de
// período, gráficos com eixo/grade/tooltip, estados de carregando/vazio/
// erro, toast, modo demonstração). O que é próprio do Grupo Donato Souza:
//
//  - um único departamento (Sucesso do Cliente) — sem seletor de
//    departamento nem de IA supervisora, porque não há agente de IA de
//    primeiro atendimento neste escritório: todo atendimento é humano;
//  - critérios de avaliação do colaborador (objetividade, simplicidade,
//    velocidade, previsibilidade), cada um com zeragem por falha própria,
//    em vez das notas da IA (compreensão/precisão/esforço/encaminhamento);
//  - sinais operacionais próprios (SLA 2h, aviso de 1h, insatisfação,
//    palavra-chave sensível) em vez de janela oficial/sem resposta/falha
//    da IA;
//  - sem histórico de feedback manual do auditor (decisão do escritório
//    para esta versão de testes) — por isso não há coluna nem drawer de
//    feedback.
//
// Autenticação: api_key fixa (mesmo padrão do painel da própria Advocacia
// Escalável) — sem login por colaborador nesta versão de testes.
// =============================================================================

const API_BASE = 'https://webhook.prod.advocaciaescalaveldev.shop/webhook';
const API_KEY = 'PLACEHOLDER_PAINEL_API_KEY_TROCAR';
const CHAT_BASE = 'https://SEU-PORTAL-donato.bitrix24.com.br/online/?IM_DIALOG=chat';
const TEMA_STORAGE_KEY = 'ae-tema:painel-vigia-donato-souza';

const STATUS_OPCOES = [
  ['todos', 'Todos os status'],
  ['aberto', 'Em andamento'],
  ['concluido', 'Concluído']
];

const CHIPS_AUDITORIA = [
  { chave: 'sla_2h', rotulo: 'SLA de 2h descumprido' },
  { chave: 'sla_1h', rotulo: 'Aviso de 1h' },
  { chave: 'insatisfacao', rotulo: 'Cliente insatisfeito' },
  { chave: 'palavra_chave', rotulo: 'Palavra-chave sensível' }
];

const nf = new Intl.NumberFormat('pt-BR');
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const df = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const hf = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const $ = (id) => document.getElementById(id);
function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function num(v) { return Number(v) || 0; }
function pct(parte, total) { return total > 0 ? (parte / total) * 100 : 0; }

const estado = {
  demo: false,
  secao: 'visao',
  status: 'todos',
  avaliado: 'sim', // 'sim' | 'nao' | 'todos' - só afeta a aba Atendimentos
  baseData: 'criacao',
  periodos: [],
  periodoRotulo: 'Hoje',
  periodoPreset: 'hoje',
  sinais: { sla_2h: false, sla_1h: false, insatisfacao: false, palavra_chave: false },
  filtroCriterio: null,
  filtroMotivoFalha: null,
  pagina: 1,
  limite: 25,
  dados: null,
  lista: null
};

// =============================================================================
// Períodos
// =============================================================================
function periodoDia(d) {
  return {
    desde: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString(),
    ate: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString()
  };
}
function periodoMes(ano, mes) {
  return {
    desde: new Date(ano, mes, 1).toISOString(),
    ate: new Date(ano, mes + 1, 0, 23, 59, 59, 999).toISOString()
  };
}
function periodoAno(ano) {
  return { desde: new Date(ano, 0, 1).toISOString(), ate: new Date(ano, 11, 31, 23, 59, 59, 999).toISOString() };
}
function segundaDaSemana(d) {
  const dia = d.getDay();
  const seg = new Date(d);
  seg.setDate(d.getDate() + ((dia === 0 ? -6 : 1) - dia));
  seg.setHours(0, 0, 0, 0);
  return seg;
}
function periodoSemana(ref) {
  const seg = segundaDaSemana(ref);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  dom.setHours(23, 59, 59, 999);
  return { desde: seg.toISOString(), ate: dom.toISOString() };
}

const PRESETS = {
  'hoje': { rotulo: 'Hoje', calcular: () => periodoDia(new Date()) },
  'semana-atual': { rotulo: 'Semana atual', calcular: () => periodoSemana(new Date()) },
  'semana-anterior': { rotulo: 'Semana anterior', calcular: () => periodoSemana(new Date(Date.now() - 7 * 86400000)) },
  'mes-atual': { rotulo: 'Mês atual', calcular: () => { const a = new Date(); return periodoMes(a.getFullYear(), a.getMonth()); } },
  'mes-anterior': { rotulo: 'Mês anterior', calcular: () => { const a = new Date(); const m = a.getMonth() - 1; return m < 0 ? periodoMes(a.getFullYear() - 1, 11) : periodoMes(a.getFullYear(), m); } },
  'trimestre-atual': { rotulo: 'Trimestre atual', calcular: () => { const a = new Date(); const i = Math.floor(a.getMonth() / 3) * 3; return { desde: new Date(a.getFullYear(), i, 1).toISOString(), ate: new Date(a.getFullYear(), i + 3, 0, 23, 59, 59, 999).toISOString() }; } },
  'semestre-atual': { rotulo: 'Semestre atual', calcular: () => { const a = new Date(); const i = a.getMonth() < 6 ? 0 : 6; return { desde: new Date(a.getFullYear(), i, 1).toISOString(), ate: new Date(a.getFullYear(), i + 6, 0, 23, 59, 59, 999).toISOString() }; } },
  'ano-atual': { rotulo: 'Ano atual', calcular: () => periodoAno(new Date().getFullYear()) }
};

function formatarBucket(bucket, granularidade) {
  if (!bucket) return '';
  const p = String(bucket).split('-');
  if (granularidade === 'mes') return NOMES_MES[Number(p[1]) - 1] + '/' + p[0].slice(2);
  return p[2] + '/' + p[1];
}

function agruparSeriePorDia(dados) {
  const mapa = new Map();
  const ordem = [];
  dados.forEach(d => {
    const data = new Date(d.bucket);
    const chave = isNaN(data)
      ? String(d.bucket)
      : data.getFullYear() + '-' + String(data.getMonth() + 1).padStart(2, '0') + '-' + String(data.getDate()).padStart(2, '0');
    if (!mapa.has(chave)) {
      const copia = Object.assign({}, d, { bucket: chave });
      mapa.set(chave, copia);
      ordem.push(chave);
    } else {
      const alvo = mapa.get(chave);
      Object.keys(d).forEach(k => {
        if (k === 'bucket') return;
        if (typeof d[k] === 'number') alvo[k] = num(alvo[k]) + d[k];
      });
    }
  });
  return ordem.sort().map(c => mapa.get(c));
}

// =============================================================================
// Tooltip / toast
// =============================================================================
function mostrarTip(html, evento) {
  const tip = $('vg-tip');
  tip.hidden = false;
  tip.innerHTML = html;
  posicionarTip(evento);
  requestAnimationFrame(() => tip.classList.add('is-visivel'));
}
function posicionarTip(evento) {
  const tip = $('vg-tip');
  const caixa = tip.getBoundingClientRect();
  let x = evento.clientX + 14;
  let y = evento.clientY - caixa.height - 12;
  if (x + caixa.width > window.innerWidth - 8) x = evento.clientX - caixa.width - 14;
  if (y < 8) y = evento.clientY + 18;
  tip.style.left = Math.max(8, x) + 'px';
  tip.style.top = y + 'px';
}
function esconderTip() {
  const tip = $('vg-tip');
  tip.classList.remove('is-visivel');
  tip.hidden = true;
}

let toastTimer = null;
function mostrarToast(msg) {
  const el = $('vg-toast');
  el.hidden = false;
  el.innerHTML = '<span class="vg-toast__ponto"></span><span>' + escapeHtml(msg) + '</span>';
  requestAnimationFrame(() => el.classList.add('is-visivel'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visivel');
    setTimeout(() => { el.hidden = true; }, 250);
  }, 5000);
}

// =============================================================================
// Estados
// =============================================================================
function blocoVazio(titulo, texto) {
  return `<div class="vg-estado">
    <span class="vg-estado__icone" aria-hidden="true">—</span>
    <p class="vg-estado__titulo">${escapeHtml(titulo)}</p>
    <p class="vg-estado__texto">${escapeHtml(texto || '')}</p>
  </div>`;
}
function blocoErro(texto, comCard) {
  return `<div class="vg-estado vg-estado--erro${comCard ? ' vg-estado--card' : ''}">
    <span class="vg-estado__icone" aria-hidden="true">!</span>
    <p class="vg-estado__titulo">Não foi possível carregar os dados</p>
    <p class="vg-estado__texto">${escapeHtml(texto || 'Tente novamente em alguns instantes.')}</p>
    <button class="ae-btn" type="button" data-acao="recarregar">↻ Tentar de novo</button>
  </div>`;
}
function skeletonKpis(q) {
  let h = '';
  for (let i = 0; i < q; i++) h += '<div class="vg-kpi"><div class="vg-skel vg-skel--rotulo"></div><div class="vg-skel vg-skel--valor"></div></div>';
  return h;
}
function skeletonGraficos(q) {
  let h = '';
  for (let i = 0; i < q; i++) h += `<div class="vg-card${i === 0 ? ' vg-card--largo' : ''}"><div class="vg-skel vg-skel--titulo"></div><div class="vg-skel vg-skel--plot"></div></div>`;
  return h;
}
function pintarCarregandoMetricas() {
  const secao = estado.secao === 'qualidade' ? 'qualidade' : 'visao';
  $('kpis-' + secao).innerHTML = skeletonKpis(secao === 'visao' ? 5 : 3);
  $('graficos-' + secao).innerHTML = skeletonGraficos(3);
}

// =============================================================================
// KPI
// =============================================================================
function cardKpi({ rotulo, valor, apoio, tag, alerta, medidorPct, sinal, status }) {
  const tagEl = tag ? `<span class="vg-kpi__tag">${escapeHtml(tag)}</span>` : '';
  const medidor = medidorPct != null ? `<span class="vg-kpi__medidor"><i style="width:${Math.max(0, Math.min(100, medidorPct))}%"></i></span>` : '';
  const apoioEl = apoio ? `<span class="vg-kpi__apoio">${escapeHtml(apoio)}</span>` : '';
  const miolo = `<div class="vg-kpi__topo">
      <span class="vg-kpi__rotulo" title="${escapeHtml(rotulo)}">${escapeHtml(rotulo)}</span>${tagEl}
    </div>
    <span class="vg-kpi__valor">${valor}</span>${medidor}${apoioEl}`;

  if (sinal || status) {
    const atributo = sinal ? `data-sinal="${sinal}"` : `data-status="${status}"`;
    return `<button class="vg-kpi${alerta ? ' vg-kpi--alerta' : ''}" type="button" ${atributo}>
      ${miolo}<span class="vg-kpi__ir">ver atendimentos →</span></button>`;
  }
  return `<div class="vg-kpi${alerta ? ' vg-kpi--alerta' : ''}">${miolo}</div>`;
}

// =============================================================================
// Gráficos (idênticos ao Painel Vigia - primitivas genéricas, sem alteração)
// =============================================================================
function ticksEixo(max) {
  const passos = 4;
  const bruto = max / passos;
  const magnitude = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
  const passo = Math.max(1, Math.ceil(bruto / magnitude) * magnitude);
  const ticks = [];
  for (let v = 0; v <= passo * passos; v += passo) ticks.push(v);
  return { ticks, topo: passo * passos };
}

function graficoBarras(container, dados, series, granularidade, opcoes) {
  const el = typeof container === 'string' ? $(container) : container;
  if (!el) return;
  const card = el.closest('.vg-card');
  const cfg = opcoes || {};

  if (granularidade !== 'mes' && dados && dados.length) dados = agruparSeriePorDia(dados);
  const totais = dados ? dados.map(d => series.reduce((acc, s) => acc + num(d[s.chave]), 0)) : [];
  const somaTotal = totais.reduce((a, b) => a + b, 0);

  if (!dados || !dados.length || somaTotal === 0) {
    if (card) card.hidden = true;
    el.innerHTML = '';
    return;
  }
  if (card) card.hidden = false;

  const { ticks, topo } = ticksEixo(Math.max(...totais, 1));

  const legenda = series.map(s => {
    const soma = dados.reduce((acc, d) => acc + num(d[s.chave]), 0);
    return `<span class="vg-legenda__item"><span class="vg-legenda__cor" style="background:${s.cor}"></span>${escapeHtml(s.rotulo)} <b>${nf.format(soma)}</b></span>`;
  }).join('') + (cfg.taxaRotulo ? `<span class="vg-legenda__item">${escapeHtml(cfg.taxaRotulo)} <b>${nf1.format(cfg.taxaValor)}%</b></span>` : '');

  const linhas = ticks.map(v => `<div class="vg-plot__linha${v === 0 ? ' vg-plot__linha--base' : ''}" style="bottom:${pct(v, topo)}%">
      <span class="vg-plot__tick">${nf.format(v)}</span></div>`).join('');

  const trilhas = dados.map((d, i) => {
    const total = totais[i];
    const segs = series.map(s => {
      const valor = num(d[s.chave]);
      if (!valor || !total) return '';
      return `<span class="vg-coluna__seg" style="height:${pct(valor, total)}%;background:${s.cor}"></span>`;
    }).join('');
    return `<div class="vg-trilha" data-i="${i}">
      <span class="vg-trilha__total">${total ? nf.format(total) : ''}</span>
      <span class="vg-coluna" style="height:${pct(total, topo)}%">${segs}</span>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="vg-legenda">${legenda}</div>
    <div class="vg-plot"><div class="vg-plot__area">${linhas}<div class="vg-trilhas">${trilhas}</div></div></div>
    <div class="vg-xrow">${dados.map(d => `<span class="vg-xlab">${escapeHtml(formatarBucket(d.bucket, granularidade))}</span>`).join('')}</div>`;

  el.querySelectorAll('.vg-trilha').forEach(trilha => {
    const i = Number(trilha.dataset.i);
    const d = dados[i];
    const conteudo = () => {
      const linhasTip = series.filter(s => num(d[s.chave]) > 0).map(s =>
        `<span class="vg-tip__linha"><span class="vg-tip__ponto" style="background:${s.cor}"></span><span>${escapeHtml(s.rotulo)}</span><b>${nf.format(num(d[s.chave]))}</b></span>`
      ).join('');
      const taxa = cfg.taxaBucket
        ? `<div class="vg-tip__total"><span>${escapeHtml(cfg.taxaRotulo || 'Taxa')}</span><b>${nf1.format(cfg.taxaBucket(d))}%</b></div>`
        : '';
      return `<div class="vg-tip__titulo">${escapeHtml(formatarBucket(d.bucket, granularidade))}</div>
        ${linhasTip || '<span class="vg-tip__linha"><span></span><span>Sem registros</span><b>0</b></span>'}
        <div class="vg-tip__total"><span>Total</span><b>${nf.format(totais[i])}</b></div>${taxa}`;
    };
    trilha.addEventListener('mouseenter', (e) => mostrarTip(conteudo(), e));
    trilha.addEventListener('mousemove', posicionarTip);
    trilha.addEventListener('mouseleave', esconderTip);
  });
}

function graficoComposicao(container, partes, opcoes) {
  const el = typeof container === 'string' ? $(container) : container;
  if (!el) return;
  const card = el.closest('.vg-card');
  const total = partes ? partes.reduce((acc, p) => acc + num(p.valor), 0) : 0;
  if (!total) {
    if (card) card.hidden = true;
    el.innerHTML = '';
    return;
  }
  if (card) card.hidden = false;

  const segs = partes.filter(p => num(p.valor) > 0).map(p =>
    `<span class="vg-comp__seg" style="width:${pct(num(p.valor), total)}%;background:${p.cor}" title="${escapeHtml(p.rotulo)}: ${nf.format(num(p.valor))}"></span>`
  ).join('');
  const cfg = opcoes || {};
  const linhas = partes.map((p, i) =>
    `<span class="vg-comp__linha${cfg.aoClicarParte ? ' vg-comp__linha--clicavel' : ''}"${cfg.aoClicarParte ? ` data-i="${i}" role="button" tabindex="0"` : ''}>
      <span class="vg-comp__ponto" style="background:${p.cor}"></span>
      <span class="vg-comp__nome">${escapeHtml(p.rotulo)}</span>
      <span class="vg-comp__valor">${nf.format(num(p.valor))}</span>
      <span class="vg-comp__pct">${nf1.format(pct(num(p.valor), total))}%</span>
    </span>`).join('');
  el.innerHTML = `<div class="vg-comp">${segs}</div><div class="vg-comp__legenda">${linhas}</div>
    ${(cfg.rodape) ? `<p class="vg-card__apoio" style="margin-top:12px">${escapeHtml(cfg.rodape)}</p>` : ''}`;

  if (cfg.aoClicarParte) {
    el.querySelectorAll('.vg-comp__linha--clicavel').forEach(linha => {
      linha.addEventListener('click', () => cfg.aoClicarParte(partes[Number(linha.dataset.i)]));
      linha.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cfg.aoClicarParte(partes[Number(linha.dataset.i)]); } });
    });
  }
}

function graficoBarrasH(container, dados, campoRotulo, campoValor, opcoes) {
  const el = typeof container === 'string' ? $(container) : container;
  if (!el) return;
  const card = el.closest('.vg-card');
  const cfg = opcoes || {};
  const soma = dados ? dados.reduce((acc, d) => acc + num(d[campoValor]), 0) : 0;
  if (!dados || !dados.length || soma === 0) {
    if (card) card.hidden = true;
    el.innerHTML = '';
    return;
  }
  if (card) card.hidden = false;

  const itens = dados.slice().sort((a, b) => num(b[campoValor]) - num(a[campoValor]));
  const max = Math.max(...itens.map(d => num(d[campoValor])), 1);
  el.innerHTML = '<div class="vg-barras">' + itens.map(d => {
    const valor = num(d[campoValor]);
    const rotulo = String(d[campoRotulo] == null ? '—' : d[campoRotulo]);
    const parte = cfg.semParticipacao ? '' : cfg.campoSecundario
      ? ` <span class="vg-comp__pct">${escapeHtml(cfg.formatadorSecundario ? cfg.formatadorSecundario(d[cfg.campoSecundario]) : nf.format(num(d[cfg.campoSecundario])))}</span>`
      : ` <span class="vg-comp__pct">${nf1.format(pct(valor, soma))}%</span>`;
    return `<div class="vg-barras__linha${cfg.aoClicarItem ? ' vg-barras__linha--clicavel' : ''}"${cfg.aoClicarItem ? ' role="button" tabindex="0"' : ''}>
      <span class="vg-barras__rotulo" title="${escapeHtml(rotulo)}">${escapeHtml(rotulo)}</span>
      <span class="vg-barras__trilha"><i class="vg-barras__preenchido" style="width:${pct(valor, max)}%;${cfg.cor ? 'background:' + cfg.cor : ''}"></i></span>
      <span class="vg-barras__valor">${cfg.formatador ? cfg.formatador(valor) : nf.format(valor)}${parte}</span>
    </div>`;
  }).join('') + '</div>';

  if (cfg.aoClicarItem) {
    el.querySelectorAll('.vg-barras__linha--clicavel').forEach((linha, i) => {
      linha.addEventListener('click', () => cfg.aoClicarItem(itens[i]));
      linha.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cfg.aoClicarItem(itens[i]); } });
    });
  }
}

function cardGrafico(id, titulo, apoio, largo, nota) {
  return `<div class="vg-card${largo ? ' vg-card--largo' : ''}">
    <div class="vg-card__cabecalho">
      <div>
        <h2 class="vg-card__titulo">${escapeHtml(titulo)}</h2>
        ${apoio ? `<p class="vg-card__apoio">${escapeHtml(apoio)}</p>` : ''}
      </div>
      ${nota ? `<span class="vg-card__nota">${escapeHtml(nota)}</span>` : ''}
    </div>
    <div id="${id}"></div>
  </div>`;
}

function notaGranularidade(dados) { return dados.granularidade === 'mes' ? 'por mês' : 'por dia'; }

// =============================================================================
// Visão geral
// =============================================================================
const KPI_ALERTAS = (k) => [
  cardKpi({
    rotulo: 'SLA de 2h descumprido',
    valor: nf.format(num(k.sla_2h_descumprido_agora)),
    tag: 'agora',
    alerta: num(k.sla_2h_descumprido_agora) > 0,
    apoio: 'cliente aguardando resposta humana há mais de 2h',
    sinal: 'sla_2h'
  }),
  cardKpi({
    rotulo: 'Aviso de 1h',
    valor: nf.format(num(k.sla_1h_aviso_agora)),
    tag: 'agora',
    alerta: num(k.sla_1h_aviso_agora) > 0,
    apoio: 'perto de estourar o SLA de 2h',
    sinal: 'sla_1h'
  }),
  cardKpi({
    rotulo: 'Cliente insatisfeito',
    valor: nf.format(num(k.insatisfacao_detectada_agora)),
    tag: 'agora',
    alerta: num(k.insatisfacao_detectada_agora) > 0,
    apoio: 'na última mensagem avaliada',
    sinal: 'insatisfacao'
  }),
  cardKpi({
    rotulo: 'Palavra-chave sensível',
    valor: nf.format(num(k.palavra_chave_detectada_agora)),
    tag: 'agora',
    alerta: num(k.palavra_chave_detectada_agora) > 0,
    apoio: '"busca e apreensão" / "oficial de justiça"',
    sinal: 'palavra_chave'
  })
];

function pintarVisao(dados) {
  const k = dados.kpis || {};

  $('kpis-visao').innerHTML = [
    cardKpi({ rotulo: 'Atendimentos', valor: nf.format(num(k.total_atendimentos)), apoio: 'no período selecionado' }),
    cardKpi({ rotulo: 'Concluídos', valor: nf.format(num(k.concluidos)), apoio: nf.format(num(k.em_andamento)) + ' em andamento agora' }),
    cardKpi({
      rotulo: 'Efetividade média',
      valor: k.efetividade_media_pct != null ? nf.format(num(k.efetividade_media_pct)) + '%' : '—',
      apoio: nf.format(num(k.avaliados)) + ' atendimentos avaliados',
      medidorPct: num(k.efetividade_media_pct)
    })
  ].concat(KPI_ALERTAS(k)).join('');

  $('graficos-visao').innerHTML =
    cardGrafico('g-serie', 'Atendimentos ao longo do tempo', 'volume por período, com o score médio no tooltip', true, notaGranularidade(dados)) +
    cardGrafico('g-composicao', 'Concluídos x em andamento', 'participação no período') +
    cardGrafico('g-tipos', 'Tipo de atendimento', 'andamento processual, dúvidas gerais e golpe do falso advogado') +
    cardGrafico('g-colaborador', 'Por colaborador', 'volume e score médio de cada colaborador', true);

  graficoBarras('g-serie', dados.serie, [
    { chave: 'atendimentos', rotulo: 'Atendimentos', cor: 'var(--ae-serie-2)' }
  ], dados.granularidade, {
    taxaRotulo: 'Score médio geral',
    taxaValor: num(k.efetividade_media_pct),
    taxaBucket: (d) => num(d.score_medio)
  });

  graficoComposicao('g-composicao', [
    { rotulo: 'Concluído', valor: num(k.concluidos), cor: 'var(--ae-serie-2)', status: 'concluido' },
    { rotulo: 'Em andamento', valor: num(k.em_andamento), cor: 'var(--ae-serie-1)', status: 'aberto' }
  ], {
    rodape: nf.format(num(k.total_atendimentos)) + ' atendimentos no período',
    aoClicarParte: (p) => irParaAtendimentos({ status: p.status })
  });

  graficoBarrasH('g-tipos', dados.tipos_atendimento, 'tipo', 'quantidade', { cor: 'var(--ae-serie-4)' });
  graficoBarrasH('g-colaborador', dados.por_colaborador, 'operador', 'atendimentos', {
    cor: 'var(--ae-serie-3)',
    campoSecundario: 'score_medio',
    formatadorSecundario: v => (v != null ? nf.format(num(v)) + ' pts médios' : '—')
  });
}

// =============================================================================
// Qualidade do atendimento
// =============================================================================
const CORES_FAIXA = { critico: 'var(--ae-serie-7)', regular: 'var(--ae-serie-1)', bom: 'var(--ae-serie-3)', excelente: 'var(--ae-serie-2)' };

function pintarQualidade(dados) {
  const k = dados.kpis || {};
  const faixas = (dados.distribuicao_score || []).map(f => ({ chave: f.chave, rotulo: f.rotulo, cor: CORES_FAIXA[f.chave] || 'var(--ae-serie-5)' }));

  const ocorrenciasFalha = (dados.falhas_por_criterio || [])
    .reduce((acc, bloco) => acc + bloco.motivos.reduce((a, m) => a + num(m.quantidade), 0), 0);

  $('kpis-qualidade').innerHTML = [
    cardKpi({
      rotulo: 'Efetividade média',
      valor: k.efetividade_media_pct != null ? nf.format(num(k.efetividade_media_pct)) + '%' : '—',
      apoio: 'score do colaborador no período',
      medidorPct: num(k.efetividade_media_pct)
    }),
    cardKpi({ rotulo: 'Atendimentos avaliados', valor: nf.format(num(k.avaliados)), apoio: 'com score do Vigia no período' }),
    cardKpi({
      rotulo: 'Ocorrências de falha',
      valor: nf.format(ocorrenciasFalha),
      alerta: ocorrenciasFalha > 0,
      apoio: 'em qualquer um dos 4 critérios'
    })
  ].join('');

  $('graficos-qualidade').innerHTML =
    cardGrafico('q-distribuicao', 'Distribuição do score de efetividade', 'atendimentos por faixa de nota, ao longo do tempo', true, notaGranularidade(dados)) +
    cardGrafico('q-criterios', 'Critérios avaliados', 'taxa de aprovação (nota ≥ 90) por critério, com a quantidade avaliada ao lado') +
    cardGrafico('q-falha', 'Motivo de falha por critério', 'quantidade por motivo, entre os quatro critérios');

  graficoBarras('q-distribuicao', dados.distribuicao_score_serie, faixas, dados.granularidade);
  graficoBarrasH('q-criterios', dados.criterios, 'criterio', 'taxa_aprovacao_pct', {
    formatador: v => nf1.format(v) + '%',
    campoSecundario: 'quantidade_avaliada',
    formatadorSecundario: v => nf.format(num(v)) + ' aval.',
    cor: 'var(--ae-serie-2)',
    aoClicarItem: (d) => irParaAtendimentos({ criterio: d.criterio })
  });

  const motivosCombinados = [];
  (dados.falhas_por_criterio || []).forEach(bloco => {
    bloco.motivos.forEach(m => motivosCombinados.push({ motivo: bloco.criterio + ': ' + m.motivo, quantidade: m.quantidade, motivoBruto: m.motivo }));
  });
  graficoBarrasH('q-falha', motivosCombinados, 'motivo', 'quantidade', {
    cor: 'var(--ae-serie-7)',
    aoClicarItem: (d) => irParaAtendimentos({ motivoFalha: d.motivoBruto })
  });
}

// =============================================================================
// Atendimentos (auditoria)
// =============================================================================
const LARGURAS_COLUNA = {
  'Cliente': 18, 'Colaborador': 12, 'Criado em': 10, 'Concluído em': 10,
  'Status': 9, 'Score': 6, 'Avaliação do Vigia': 29, 'Sinais': 6
};

function colunas() {
  return ['Cliente', 'Colaborador', 'Criado em', 'Concluído em', 'Status', 'Score', 'Avaliação do Vigia', 'Sinais'];
}

function pintarColgroup() {
  $('tabela-colgroup').innerHTML = colunas()
    .map((nome) => `<col style="width:${LARGURAS_COLUNA[nome] || 10}%">`)
    .join('');
}

function pintarChipsAuditoria(contadores) {
  $('chips-auditoria').innerHTML = CHIPS_AUDITORIA.map(c => {
    const qtd = contadores && contadores[c.chave] != null ? `<span class="ae-chip__cont">${nf.format(contadores[c.chave])}</span>` : '';
    return `<button class="ae-chip${estado.sinais[c.chave] ? ' is-ativo' : ''}" type="button" data-sinal="${c.chave}">${escapeHtml(c.rotulo)}${qtd}</button>`;
  }).join('');
}

function skeletonTabela() {
  const total = colunas().length;
  pintarColgroup();
  $('tabela-cabecalho').innerHTML = '<tr>' + colunas().map(c => `<th>${escapeHtml(c)}</th>`).join('') + '</tr>';
  let html = '';
  for (let i = 0; i < 6; i++) {
    html += '<tr>' + Array.from({ length: total }, () => '<td><div class="vg-skel" style="height:13px"></div></td>').join('') + '</tr>';
  }
  $('tabela-corpo').innerHTML = html;
  $('tabela-meta').textContent = 'Carregando…';
  $('paginacao').innerHTML = '';
}

function badgeStatus(status) {
  const mapa = {
    concluido: ['ae-badge--ok', 'Concluído'],
    em_andamento: ['ae-badge--alerta', 'Em andamento']
  };
  const b = mapa[status];
  return b ? `<span class="ae-badge ${b[0]}">${b[1]}</span>` : '<span class="vg-vazio-celula">—</span>';
}

function celulaScore(item) {
  if (item.score_efetividade == null) return '<span class="vg-vazio-celula">Aguardando auditoria</span>';
  const v = num(item.score_efetividade);
  return `<span class="vg-score"><span class="vg-score__valor">${nf.format(v)}</span>
    <span class="vg-score__medidor"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span></span>`;
}

function celulaAvaliacao(item) {
  const criterios = [
    ['Objetividade', item.objetividade_score, item.falha_objetividade],
    ['Simplicidade', item.simplicidade_score, item.falha_simplicidade],
    ['Velocidade', item.velocidade_score, item.falha_velocidade],
    ['Previsibilidade', item.previsibilidade_score, item.falha_previsibilidade]
  ].filter(c => c[1] != null);

  if (!criterios.length && !item.justificativa) return '<span class="vg-vazio-celula">—</span>';

  const linhaCriterios = criterios.map(([nome, nota, falha]) =>
    `${escapeHtml(nome)} <b>${nf.format(num(nota))}</b>${falha && falha !== 'nenhuma' ? ` <span class="ae-badge ae-badge--erro">${escapeHtml(falha)}</span>` : ''}`
  ).join(' · ');

  return `<span class="vg-avaliacao" title="Clique para expandir">${linhaCriterios}${item.justificativa ? ' — ' + escapeHtml(item.justificativa) : ''}</span>`;
}

function celulaSinais(item) {
  const chips = [];
  if (item.sla_2h_descumprido) chips.push('<span class="ae-badge ae-badge--erro">SLA 2h</span>');
  if (item.sla_1h_aviso_enviado) chips.push('<span class="ae-badge ae-badge--alerta">aviso 1h</span>');
  if (item.insatisfacao_detectada) chips.push('<span class="ae-badge ae-badge--erro">insatisfeito</span>');
  if (item.palavra_chave_detectada) chips.push(`<span class="ae-badge ae-badge--erro">${escapeHtml(item.palavra_chave_termo || 'palavra-chave')}</span>`);
  return chips.length ? '<div class="vg-sinais">' + chips.join('') + '</div>' : '<span class="vg-vazio-celula">—</span>';
}

function renderizarTabela(dados) {
  pintarChipsAuditoria(dados.contadores);
  const cols = colunas();
  pintarColgroup();
  $('tabela-cabecalho').innerHTML = '<tr>' + cols.map(c => `<th>${escapeHtml(c)}</th>`).join('') + '</tr>';
  $('tabela-meta').textContent = num(dados.total) ? nf.format(num(dados.total)) + ' no filtro atual' : '';

  if (!dados.itens || !dados.itens.length) {
    $('tabela-corpo').innerHTML = `<tr><td colspan="${cols.length}">${blocoVazio('Nenhum atendimento encontrado', 'Nenhum atendimento nesse período com esses filtros. Amplie o período ou remova um sinal.')}</td></tr>`;
    renderizarPaginacao(dados);
    return;
  }

  $('tabela-corpo').innerHTML = dados.itens.map(item => {
    const nome = escapeHtml(item.contact_name || 'Não informado');
    const cliente = item.chat_id
      ? `<a class="vg-cliente__nome" title="Abrir a conversa no Bitrix24" href="${CHAT_BASE}${encodeURIComponent(item.chat_id)}" target="_blank" rel="noopener">${nome}</a>`
      : `<span class="vg-cliente__nome">${nome}</span>`;
    const tr = `<td><span class="vg-cliente">${cliente}<span class="vg-cliente__meta">${escapeHtml(item.session_id || '')}</span></span></td>
      <td>${escapeHtml(item.operator_name || '—')}</td>
      <td>${item.started_at ? df.format(new Date(item.started_at)) : '<span class="vg-vazio-celula">—</span>'}</td>
      <td>${item.finished_at ? df.format(new Date(item.finished_at)) : '<span class="vg-vazio-celula">em andamento</span>'}</td>
      <td>${badgeStatus(item.status)}${item.tipo_atendimento ? `<span class="vg-cliente__meta">${escapeHtml(item.tipo_atendimento)}</span>` : ''}</td>
      <td class="vg-tabela__num">${celulaScore(item)}</td>
      <td>${celulaAvaliacao(item)}</td>
      <td>${celulaSinais(item)}</td>`;
    return '<tr>' + tr + '</tr>';
  }).join('');

  renderizarPaginacao(dados);
}

function renderizarPaginacao(dados) {
  const total = num(dados.total);
  const totalPaginas = Math.max(1, Math.ceil(total / estado.limite));
  const inicio = total ? (estado.pagina - 1) * estado.limite + 1 : 0;
  const fim = Math.min(total, estado.pagina * estado.limite);
  $('paginacao').innerHTML = `
    <span class="vg-paginacao__info">${total ? nf.format(inicio) + '–' + nf.format(fim) + ' de ' + nf.format(total) : 'Nenhum resultado'}</span>
    <span class="vg-paginacao__nav">
      <span class="vg-paginacao__info">Página ${estado.pagina} de ${totalPaginas}</span>
      <button class="ae-btn" id="pg-anterior" type="button" ${estado.pagina <= 1 ? 'disabled' : ''}>‹ Anterior</button>
      <button class="ae-btn" id="pg-proxima" type="button" ${estado.pagina >= totalPaginas ? 'disabled' : ''}>Próxima ›</button>
    </span>`;
  const a = $('pg-anterior'), p = $('pg-proxima');
  if (a) a.addEventListener('click', () => { estado.pagina--; carregarAtendimentos(); });
  if (p) p.addEventListener('click', () => { estado.pagina++; carregarAtendimentos(); });
}

// =============================================================================
// API + modo demonstração
// =============================================================================
function ativarDemo(motivo) {
  if (!estado.demo) {
    estado.demo = true;
    $('aviso-demo').hidden = false;
    if (motivo) $('aviso-demo-texto').textContent = motivo;
  }
}

function parametrosFiltro() {
  return {
    periodos: JSON.stringify(estado.periodos),
    status: estado.status,
    avaliado: estado.avaliado,
    base_data: estado.baseData,
    ...(estado.filtroCriterio ? { criterio: estado.filtroCriterio } : {}),
    ...(estado.filtroMotivoFalha ? { motivo_falha: estado.filtroMotivoFalha } : {})
  };
}

function sinaisAtivos() {
  const out = {};
  Object.keys(estado.sinais).forEach(k => { if (estado.sinais[k]) out[k] = '1'; });
  return out;
}

async function chamarApi(path, params) {
  const query = new URLSearchParams({ ...params, api_key: API_KEY }).toString();
  const resposta = await fetch(API_BASE.replace(/\/$/, '') + '/' + path + '?' + query, { method: 'GET' });
  if (resposta.status === 401) throw new Error('não autorizado (confira a api_key)');
  if (!resposta.ok) throw new Error('Falha na API (' + resposta.status + ')');
  return resposta.json();
}

async function carregarMetricas(forcar) {
  if (estado.dados && !forcar) { pintarMetricas(); return; }
  pintarCarregandoMetricas();
  marcarCarregando(true);
  try {
    estado.dados = estado.demo
      ? window.VigiaDemo.metricas(estado.periodos)
      : await chamarApi('painel-donato-metricas', parametrosFiltro());
    pintarMetricas();
    marcarAtualizado();
  } catch (e) {
    ativarDemo('A API do Vigia não respondeu (' + e.message + '), então o painel exibe um conjunto de exemplo. Nenhum número aqui é dado real da operação.');
    try {
      estado.dados = window.VigiaDemo.metricas(estado.periodos);
      pintarMetricas();
      marcarAtualizado();
    } catch (e2) {
      const secao = estado.secao === 'qualidade' ? 'qualidade' : 'visao';
      $('kpis-' + secao).innerHTML = '';
      $('graficos-' + secao).innerHTML = `<div class="vg-card vg-card--largo">${blocoErro(e.message)}</div>`;
      mostrarToast('Erro ao carregar as métricas: ' + e.message);
    }
  }
  marcarCarregando(false);
}

function pintarMetricas() {
  const dados = estado.dados;
  if (!dados) return;
  popularFiltrosDinamicos(dados);
  if (estado.secao === 'qualidade') pintarQualidade(dados);
  else pintarVisao(dados);
}

async function carregarAtendimentos() {
  skeletonTabela();
  marcarCarregando(true);
  const params = { ...parametrosFiltro(), ...sinaisAtivos(), limite: estado.limite, pagina: estado.pagina };
  try {
    estado.lista = estado.demo
      ? window.VigiaDemo.atendimentos(params)
      : await chamarApi('painel-donato-atendimentos', params);
    renderizarTabela(estado.lista);
    marcarAtualizado();
  } catch (e) {
    ativarDemo('A API do Vigia não respondeu (' + e.message + '), então o painel exibe um conjunto de exemplo. Nenhum número aqui é dado real da operação.');
    try {
      estado.lista = window.VigiaDemo.atendimentos(params);
      renderizarTabela(estado.lista);
    } catch (e2) {
      $('tabela-meta').textContent = '';
      $('tabela-corpo').innerHTML = `<tr><td colspan="${colunas().length}">${blocoErro(e.message)}</td></tr>`;
      $('paginacao').innerHTML = '';
      mostrarToast('Erro ao carregar os atendimentos: ' + e.message);
    }
  }
  marcarCarregando(false);
}

// =============================================================================
// Feedback de carregamento
// =============================================================================
function marcarCarregando(ligado) { $('btn-atualizar').classList.toggle('is-carregando', ligado); }
function marcarAtualizado() { $('atualizado').textContent = 'Atualizado às ' + hf.format(new Date()); }

// =============================================================================
// Filtros
// =============================================================================
function rotuloStatus(valor) {
  const item = STATUS_OPCOES.find(s => s[0] === valor);
  return item ? item[1] : valor;
}

function atualizarResumoFiltros() {
  const pilulas = [];
  if (estado.baseData !== 'criacao') {
    pilulas.push(`<span class="vg-pilula">Período por: <b>data de conclusão</b>
      <button class="vg-pilula__x" type="button" data-limpar="base-data" aria-label="Voltar para data de criação">×</button></span>`);
  }
  if (estado.status !== 'todos') {
    pilulas.push(`<span class="vg-pilula">Status: <b>${escapeHtml(rotuloStatus(estado.status))}</b>
      <button class="vg-pilula__x" type="button" data-limpar="status" aria-label="Remover filtro de status">×</button></span>`);
  }
  if (!estado.periodoPreset) {
    pilulas.push(`<span class="vg-pilula">Período: <b>${escapeHtml(estado.periodoRotulo)}</b>
      <button class="vg-pilula__x" type="button" data-limpar="periodo" aria-label="Voltar período para hoje">×</button></span>`);
  }
  Object.keys(estado.sinais).filter(k => estado.sinais[k]).forEach(k => {
    const chip = CHIPS_AUDITORIA.find(c => c.chave === k);
    pilulas.push(`<span class="vg-pilula">Sinal: <b>${escapeHtml(chip ? chip.rotulo : k)}</b>
      <button class="vg-pilula__x" type="button" data-limpar="sinal:${k}" aria-label="Remover sinal">×</button></span>`);
  });
  if (estado.filtroCriterio) {
    pilulas.push(`<span class="vg-pilula">Critério: <b>${escapeHtml(estado.filtroCriterio)}</b>
      <button class="vg-pilula__x" type="button" data-limpar="criterio" aria-label="Remover filtro de critério">×</button></span>`);
  }
  if (estado.filtroMotivoFalha) {
    pilulas.push(`<span class="vg-pilula">Falha: <b>${escapeHtml(estado.filtroMotivoFalha)}</b>
      <button class="vg-pilula__x" type="button" data-limpar="motivo-falha" aria-label="Remover filtro de falha">×</button></span>`);
  }

  $('filtros-resumo').innerHTML = pilulas.join('') + (pilulas.length ? '<button class="vg-limpar" type="button" data-limpar="tudo">Limpar filtros</button>' : '');
  $('filtro-status').classList.toggle('is-alterado', estado.status !== 'todos');
  $('filtro-base-data').classList.toggle('is-alterado', estado.baseData !== 'criacao');
  $('filtro-criterio').classList.toggle('is-alterado', !!estado.filtroCriterio);
  $('btn-periodo').classList.toggle('is-alterado', !estado.periodoPreset);
}

function sincronizarSelectsFiltro() {
  $('filtro-status').value = estado.status;
  $('filtro-criterio').value = estado.filtroCriterio || '';
}

function irParaAtendimentos(patch) {
  Object.keys(estado.sinais).forEach(k => { estado.sinais[k] = false; });
  estado.filtroMotivoFalha = null;
  estado.filtroCriterio = null;
  if (patch.status !== undefined) estado.status = patch.status;
  if (patch.sinal) estado.sinais[patch.sinal] = true;
  if (patch.criterio) estado.filtroCriterio = patch.criterio;
  if (patch.motivoFalha) estado.filtroMotivoFalha = patch.motivoFalha;
  estado.pagina = 1;
  sincronizarSelectsFiltro();
  atualizarResumoFiltros();
  selecionarSecao('auditoria');
}

function popularFiltrosDinamicos(dados) {
  const criterios = (dados.criterios || []).map(c => c.criterio).filter(Boolean);
  const selCriterio = $('filtro-criterio');
  const atualCriterio = estado.filtroCriterio;
  selCriterio.innerHTML = '<option value="">Todos os critérios</option>' +
    criterios.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  selCriterio.value = atualCriterio || '';
}

function popularFiltroStatus() {
  $('filtro-status').innerHTML = STATUS_OPCOES.map(s =>
    `<option value="${s[0]}"${estado.status === s[0] ? ' selected' : ''}>${escapeHtml(s[1])}</option>`).join('');
}

function aplicarPreset(chave, semRecarregar) {
  const preset = PRESETS[chave];
  estado.periodos = [preset.calcular()];
  estado.periodoRotulo = preset.rotulo;
  estado.periodoPreset = chave;
  $('periodo-rotulo').textContent = preset.rotulo;
  document.querySelectorAll('.vg-opcao').forEach(b => b.classList.toggle('is-ativo', b.dataset.preset === chave));
  limparMarcacoesPeriodo();
  if (!semRecarregar) recarregarPorFiltro();
}

function limparMarcacoesPeriodo() {
  document.querySelectorAll('#periodo-popup input[type="checkbox"]').forEach(cb => { cb.checked = false; });
  $('periodo-custom-desde').value = '';
  $('periodo-custom-ate').value = '';
  atualizarContagemPeriodo();
}

function atualizarContagemPeriodo() {
  const marcados = document.querySelectorAll('#periodo-popup input[type="checkbox"]:checked').length;
  const temData = !!($('periodo-custom-desde').value || $('periodo-custom-ate').value);
  const total = marcados + (temData ? 1 : 0);
  $('periodo-contagem').textContent = total ? total + (total === 1 ? ' período marcado' : ' períodos marcados') : 'Nenhum conjunto marcado';
}

function recarregarPorFiltro() {
  estado.dados = null;
  estado.pagina = 1;
  atualizarResumoFiltros();
  atualizarTudo();
}

// =============================================================================
// Popover de período
// =============================================================================
function abrirPopupPeriodo() { $('periodo-popup').hidden = false; $('btn-periodo').setAttribute('aria-expanded', 'true'); }
function fecharPopupPeriodo() { $('periodo-popup').hidden = true; $('btn-periodo').setAttribute('aria-expanded', 'false'); }

function popularListasPeriodo() {
  const agora = new Date();
  const meses = $('lista-meses');
  for (let i = 0; i < 24; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" data-tipo="mes" data-ano="${d.getFullYear()}" data-mes="${d.getMonth()}"> ${NOMES_MES[d.getMonth()]}/${d.getFullYear()}`;
    meses.appendChild(l);
  }
  const semanas = $('lista-semanas');
  for (let i = 0; i < 12; i++) {
    const seg = segundaDaSemana(new Date(Date.now() - i * 7 * 86400000));
    const dom = new Date(seg);
    dom.setDate(seg.getDate() + 6);
    const rotulo = `${String(seg.getDate()).padStart(2, '0')}/${String(seg.getMonth() + 1).padStart(2, '0')} – ${String(dom.getDate()).padStart(2, '0')}/${String(dom.getMonth() + 1).padStart(2, '0')}`;
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" data-tipo="semana" data-inicio="${seg.toISOString()}"> ${rotulo}`;
    semanas.appendChild(l);
  }
  const anos = $('lista-anos');
  for (let i = 0; i < 5; i++) {
    const ano = agora.getFullYear() - i;
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" data-tipo="ano" data-ano="${ano}"> ${ano}`;
    anos.appendChild(l);
  }
}

function ligarPopupPeriodo() {
  popularListasPeriodo();
  $('btn-periodo').addEventListener('click', (e) => {
    e.stopPropagation();
    if ($('periodo-popup').hidden) abrirPopupPeriodo(); else fecharPopupPeriodo();
  });
  $('periodo-popup').addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => fecharPopupPeriodo());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharPopupPeriodo(); });
  $('btn-periodo-cancelar').addEventListener('click', fecharPopupPeriodo);
  $('btn-periodo-limpar').addEventListener('click', limparMarcacoesPeriodo);
  $('periodo-popup').addEventListener('change', atualizarContagemPeriodo);

  document.querySelectorAll('.vg-opcao').forEach(botao => {
    botao.addEventListener('click', () => { aplicarPreset(botao.dataset.preset); fecharPopupPeriodo(); });
  });

  $('btn-periodo-aplicar').addEventListener('click', () => {
    const periodos = [];
    document.querySelectorAll('#lista-meses input:checked').forEach(cb => periodos.push(periodoMes(Number(cb.dataset.ano), Number(cb.dataset.mes))));
    document.querySelectorAll('#lista-semanas input:checked').forEach(cb => periodos.push(periodoSemana(new Date(cb.dataset.inicio))));
    document.querySelectorAll('#lista-anos input:checked').forEach(cb => periodos.push(periodoAno(Number(cb.dataset.ano))));
    const desde = $('periodo-custom-desde').value;
    const ate = $('periodo-custom-ate').value;
    if (desde && ate) periodos.push({ desde: new Date(desde + 'T00:00:00').toISOString(), ate: new Date(ate + 'T23:59:59').toISOString() });
    else if (desde) periodos.push(periodoDia(new Date(desde + 'T00:00:00')));
    else if (ate) periodos.push(periodoDia(new Date(ate + 'T00:00:00')));
    if (!periodos.length) { fecharPopupPeriodo(); return; }

    estado.periodos = periodos;
    estado.periodoPreset = null;
    estado.periodoRotulo = periodos.length === 1 ? 'Período personalizado' : periodos.length + ' períodos';
    $('periodo-rotulo').textContent = estado.periodoRotulo;
    document.querySelectorAll('.vg-opcao').forEach(b => b.classList.remove('is-ativo'));
    fecharPopupPeriodo();
    recarregarPorFiltro();
  });
}

// =============================================================================
// Logo e tema
// =============================================================================
async function carregarLogos() {
  try {
    const [completo, isotipo] = await Promise.all([
      fetch('assets/logo-completo.svg').then(r => r.text()),
      fetch('assets/isotipo-gradiente.svg').then(r => r.text())
    ]);
    $('logo-completo').innerHTML = completo;
    $('logo-rodape').innerHTML = completo;
    $('logo-isotipo').innerHTML = isotipo;
  } catch (e) {
    console.warn('Não foi possível carregar os SVGs da marca.', e);
  }
}

function aplicarTema(tema) {
  document.documentElement.setAttribute('data-tema', tema);
  try { localStorage.setItem(TEMA_STORAGE_KEY, tema); } catch (e) {}
  if (estado.dados && estado.secao !== 'auditoria') pintarMetricas();
}
function alternarTema() {
  const atual = document.documentElement.getAttribute('data-tema') || 'claro';
  aplicarTema(atual === 'claro' ? 'escuro' : 'claro');
}

// =============================================================================
// Seção
// =============================================================================
function selecionarSecao(secao) {
  document.querySelectorAll('.vg-abas__item').forEach(b => {
    const ativo = b.dataset.secao === secao;
    b.classList.toggle('is-ativo', ativo);
    b.setAttribute('aria-selected', ativo ? 'true' : 'false');
  });
  $('secao-visao').hidden = secao !== 'visao';
  $('secao-qualidade').hidden = secao !== 'qualidade';
  $('secao-auditoria').hidden = secao !== 'auditoria';
  estado.secao = secao;
  esconderTip();
  atualizarTudo();
}

async function atualizarTudo(forcar) {
  if (estado.secao === 'auditoria') await carregarAtendimentos();
  else await carregarMetricas(forcar);
}

// =============================================================================
// Eventos
// =============================================================================
function ligarNavegacao() {
  document.querySelectorAll('.vg-abas__item').forEach(b => {
    b.addEventListener('click', () => selecionarSecao(b.dataset.secao));
  });

  $('filtro-status').addEventListener('change', (e) => {
    estado.status = e.target.value;
    recarregarPorFiltro();
  });
  $('filtro-avaliado').addEventListener('change', (e) => {
    estado.avaliado = e.target.value;
    recarregarPorFiltro();
  });
  $('filtro-base-data').addEventListener('change', (e) => {
    estado.baseData = e.target.value;
    recarregarPorFiltro();
  });
  $('filtro-criterio').addEventListener('change', (e) => {
    estado.filtroCriterio = e.target.value || null;
    recarregarPorFiltro();
  });
  $('filtro-limite').addEventListener('change', (e) => {
    estado.limite = Number(e.target.value);
    estado.pagina = 1;
    carregarAtendimentos();
  });

  $('filtros-resumo').addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-limpar]');
    if (!alvo) return;
    const qual = alvo.dataset.limpar;
    if (qual === 'status' || qual === 'tudo') { estado.status = 'todos'; $('filtro-status').value = 'todos'; }
    if (qual === 'avaliado' || qual === 'tudo') { estado.avaliado = 'sim'; $('filtro-avaliado').value = 'sim'; }
    if (qual === 'base-data' || qual === 'tudo') { estado.baseData = 'criacao'; $('filtro-base-data').value = 'criacao'; }
    if (qual === 'periodo' || qual === 'tudo') aplicarPreset('hoje', true);
    if (qual === 'criterio' || qual === 'tudo') { estado.filtroCriterio = null; $('filtro-criterio').value = ''; }
    if (qual === 'motivo-falha' || qual === 'tudo') estado.filtroMotivoFalha = null;
    if (qual === 'tudo') Object.keys(estado.sinais).forEach(k => { estado.sinais[k] = false; });
    if (qual.indexOf('sinal:') === 0) estado.sinais[qual.split(':')[1]] = false;
    recarregarPorFiltro();
  });

  $('chips-auditoria').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sinal]');
    if (!b) return;
    estado.sinais[b.dataset.sinal] = !estado.sinais[b.dataset.sinal];
    estado.pagina = 1;
    atualizarResumoFiltros();
    carregarAtendimentos();
  });

  document.querySelectorAll('#kpis-visao, #kpis-qualidade').forEach(el => {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sinal], [data-status]');
      if (!b) return;
      if (b.dataset.sinal) irParaAtendimentos({ sinal: b.dataset.sinal });
      else irParaAtendimentos({ status: b.dataset.status });
    });
  });

  $('tabela-corpo').addEventListener('click', (e) => {
    const avaliacao = e.target.closest('.vg-avaliacao');
    if (avaliacao) avaliacao.classList.toggle('is-expandida');
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-acao="recarregar"]')) atualizarTudo(true);
  });

  $('btn-atualizar').addEventListener('click', () => atualizarTudo(true));
  $('btn-tema').addEventListener('click', alternarTema);
}

// =============================================================================
// Inicialização
// =============================================================================
async function iniciar() {
  carregarLogos();
  ligarNavegacao();
  ligarPopupPeriodo();
  popularFiltroStatus();
  aplicarPreset('hoje', true);
  atualizarResumoFiltros();
  atualizarTudo();
}

document.addEventListener('DOMContentLoaded', iniciar);
