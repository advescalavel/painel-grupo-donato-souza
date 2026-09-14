// =============================================================================
// demo-data.js — conjunto de DEMONSTRAÇÃO do Painel Vigia · Grupo Donato Souza
//
// Usado só quando a API não responde. O formato é exatamente o contrato dos
// endpoints (ver README.md), então trocar por dados reais não muda uma linha
// do app.js. Nenhum número aqui é dado real da operação.
// =============================================================================

window.VigiaDemo = (function () {
  'use strict';

  function rng(semente) {
    var s = 0;
    for (var i = 0; i < semente.length; i++) s = (s * 31 + semente.charCodeAt(i)) % 2147483647;
    return function (min, max) {
      s = (s * 1103515245 + 12345) % 2147483647;
      return min + Math.floor((s / 2147483647) * (max - min + 1));
    };
  }

  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function buckets(periodos) {
    var desde = new Date(Math.min.apply(null, periodos.map(function (p) { return +new Date(p.desde); })));
    var ate = new Date(Math.min(Date.now(), Math.max.apply(null, periodos.map(function (p) { return +new Date(p.ate); }))));
    var dias = Math.max(1, Math.round((ate - desde) / 86400000) + 1);

    if (dias > 70) {
      var lista = [];
      var cursor = new Date(desde.getFullYear(), desde.getMonth(), 1);
      while (cursor <= ate && lista.length < 24) {
        lista.push(cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-01');
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
      return { granularidade: 'mes', chaves: lista, escala: 22 };
    }

    var out = [];
    for (var i = 0; i < Math.min(dias, 31); i++) {
      var d = new Date(desde);
      d.setDate(desde.getDate() + i);
      if (d > ate) break;
      out.push(iso(d));
    }
    if (!out.length) out.push(iso(ate));
    return { granularidade: 'dia', chaves: out, escala: dias <= 1 ? 1 : 2 };
  }

  var TIPOS_ATEND = ['andamento_processual', 'duvidas_administrativas_gerais', 'golpe_falso_advogado', 'outro'];
  var CRITERIOS = ['Objetividade', 'Simplicidade', 'Velocidade', 'Previsibilidade'];
  var FALHAS_POR_CRITERIO = {
    Objetividade: ['nao_respondeu_pergunta', 'detalhamento_excessivo'],
    Simplicidade: ['juridiques_sem_explicacao'],
    Velocidade: ['demora_excessiva', 'ignorou_urgencia'],
    Previsibilidade: ['sem_estimativa_quando_cabia']
  };
  var NOMES = ['Ana Beatriz Moraes', 'Carlos Eduardo Lima', 'Fernanda Ribeiro', 'Marcos Vinícius Alves', 'Juliana Prado', 'Rafael Antunes', 'Patrícia Nogueira', 'Diego Camargo', 'Larissa Bittencourt', 'Otávio Menezes', 'Simone Vasconcelos', 'Thiago Barreto'];
  var COLABORADORES = ['Beatriz Souza', 'Renato Donato', 'Camila Ferraz'];

  function distribuir(rotulos, total, r, campoRotulo, campoValor) {
    var pesos = rotulos.map(function () { return r(4, 20); });
    var soma = pesos.reduce(function (a, b) { return a + b; }, 0);
    return rotulos.map(function (l, i) {
      var o = {};
      o[campoRotulo] = l;
      o[campoValor] = Math.max(1, Math.round((pesos[i] / soma) * total));
      return o;
    }).sort(function (a, b) { return b[campoValor] - a[campoValor]; });
  }

  function metricas(periodos) {
    var b = buckets(periodos);
    var r = rng('donato|' + b.chaves.join(''));

    var serie = b.chaves.map(function (chave) {
      var atend = r(3, 11) * b.escala;
      var scoreMedio = r(68, 92);
      return { bucket: chave, atendimentos: atend, score_medio: scoreMedio };
    });

    var totalAtendimentos = serie.reduce(function (a, d) { return a + d.atendimentos; }, 0);
    var concluidos = Math.round(totalAtendimentos * (r(70, 92) / 100));
    var emAndamento = Math.max(0, totalAtendimentos - concluidos);
    var avaliados = Math.round(totalAtendimentos * (r(80, 97) / 100));

    var FAIXAS = [
      { chave: 'critico', rotulo: 'Crítico (0-49)' },
      { chave: 'regular', rotulo: 'Regular (50-69)' },
      { chave: 'bom', rotulo: 'Bom (70-84)' },
      { chave: 'excelente', rotulo: 'Excelente (85-100)' }
    ];
    var serieScore = b.chaves.map(function (chave) {
      var base = Math.max(1, Math.round(r(3, 11) * b.escala * 0.85));
      var critico = Math.round(base * (r(2, 9) / 100));
      var regular = Math.round(base * (r(10, 20) / 100));
      var bom = Math.round(base * (r(25, 38) / 100));
      return { bucket: chave, critico: critico, regular: regular, bom: bom, excelente: Math.max(0, base - critico - regular - bom) };
    });
    var distribuicaoScore = FAIXAS.map(function (f) {
      var total = serieScore.reduce(function (a, d) { return a + num(d[f.chave]); }, 0);
      return { chave: f.chave, rotulo: f.rotulo, quantidade: total };
    });

    var criterios = CRITERIOS.map(function (c) {
      return { criterio: c, quantidade_avaliada: Math.round(avaliados * (r(75, 100) / 100)), media: r(70, 95), taxa_aprovacao_pct: r(58, 92) };
    });

    var falhasPorCriterio = CRITERIOS.map(function (c) {
      var motivos = FALHAS_POR_CRITERIO[c];
      var totalFalhas = Math.round(avaliados * (r(5, 16) / 100));
      return { criterio: c, motivos: distribuir(motivos, totalFalhas, r, 'motivo', 'quantidade') };
    });

    function num(v) { return Number(v) || 0; }

    return {
      demo: true,
      granularidade: b.granularidade,
      serie: serie,
      distribuicao_score: distribuicaoScore,
      distribuicao_score_serie: serieScore,
      criterios: criterios,
      falhas_por_criterio: falhasPorCriterio,
      tipos_atendimento: distribuir(TIPOS_ATEND, totalAtendimentos, r, 'tipo', 'quantidade'),
      por_colaborador: COLABORADORES.map(function (nome) {
        return { operador: nome, atendimentos: r(8, 40), score_medio: r(68, 94) };
      }).sort(function (a, b) { return b.atendimentos - a.atendimentos; }),
      kpis: {
        total_atendimentos: totalAtendimentos,
        concluidos: concluidos,
        em_andamento: emAndamento,
        avaliados: avaliados,
        efetividade_media_pct: r(72, 90),
        sla_2h_descumprido_agora: r(0, 4),
        sla_1h_aviso_agora: r(0, 5),
        insatisfacao_detectada_agora: r(0, 3),
        palavra_chave_detectada_agora: r(0, 2)
      }
    };
  }

  function atendimentos(params) {
    var r = rng('donato|lista');
    var itens = [];
    var total = 84;

    for (var i = 0; i < total; i++) {
      var d = new Date();
      d.setDate(d.getDate() - r(0, 24));
      d.setHours(r(8, 19), r(0, 59), 0, 0);
      var concluido = r(0, 100) < 82;
      var temFalha = r(0, 100) < 20;
      var criterioFalho = CRITERIOS[r(0, 3)];
      var falhas = { objetividade_score: r(60, 100), falha_objetividade: 'nenhuma', simplicidade_score: r(60, 100), falha_simplicidade: 'nenhuma', velocidade_score: r(60, 100), falha_velocidade: 'nenhuma', previsibilidade_score: r(60, 100), falha_previsibilidade: 'nenhuma' };
      if (temFalha) {
        var motivos = FALHAS_POR_CRITERIO[criterioFalho];
        var motivo = motivos[r(0, motivos.length - 1)];
        var campoScore = criterioFalho.toLowerCase() + '_score';
        var campoFalha = 'falha_' + criterioFalho.toLowerCase();
        falhas[campoScore] = r(20, 55);
        falhas[campoFalha] = motivo;
      }
      var soma = falhas.objetividade_score + falhas.simplicidade_score + falhas.velocidade_score + falhas.previsibilidade_score;
      var scoreEfetividade = Math.round(soma / 4);

      var item = Object.assign({
        session_id: 'donato-' + (1200 + i),
        chat_id: String(51000 + i),
        contact_name: NOMES[i % NOMES.length],
        contact_phone: '11 9' + String(80000000 + i * 37).slice(0, 8),
        operator_name: COLABORADORES[i % COLABORADORES.length],
        started_at: d.toISOString(),
        finished_at: concluido ? new Date(d.getTime() + r(6, 260) * 60000).toISOString() : null,
        status: concluido ? 'concluido' : 'em_andamento',
        tipo_atendimento: TIPOS_ATEND[r(0, 100) < 55 ? 0 : (r(0, 100) < 75 ? 1 : (r(0, 100) < 95 ? 3 : 2))],
        score_efetividade: scoreEfetividade,
        categoria_erro: temFalha ? 'Falha de ' + criterioFalho.toLowerCase() : null,
        evidencia_erro: temFalha ? 'Trecho da conversa em que o colaborador não atendeu ao critério.' : null,
        impacto_erro: temFalha ? 'Cliente precisou insistir ou ficou sem clareza sobre o próximo passo.' : null,
        sugestao_melhoria: temFalha ? 'Reforçar o ponto com o colaborador na próxima reunião de alinhamento.' : null,
        justificativa: temFalha
          ? 'Atendimento com falha pontual em ' + criterioFalho.toLowerCase() + ', restante dentro do padrão.'
          : 'Atendimento dentro do padrão nos quatro critérios avaliados.',
        acao_recomendada: temFalha ? 'Conversar com o colaborador sobre o ponto identificado.' : 'Nenhuma ação necessária.',
        sla_2h_descumprido: !concluido && r(0, 100) < 10,
        sla_1h_aviso_enviado: !concluido && r(0, 100) < 16,
        insatisfacao_detectada: r(0, 100) < 9,
        palavra_chave_detectada: r(0, 100) < 4,
        palavra_chave_termo: r(0, 100) < 4 ? (r(0, 1) ? 'busca e apreensao' : 'oficial de justica') : null
      }, falhas);

      itens.push(item);
    }

    var filtrados = itens.filter(function (a) {
      if (params.sla_2h && !a.sla_2h_descumprido) return false;
      if (params.sla_1h && !a.sla_1h_aviso_enviado) return false;
      if (params.insatisfacao && !a.insatisfacao_detectada) return false;
      if (params.palavra_chave && !a.palavra_chave_detectada) return false;
      if (params.status === 'aberto' && a.status !== 'em_andamento') return false;
      if (params.status === 'concluido' && a.status !== 'concluido') return false;
      if (params.avaliado === 'nao' && a.score_efetividade != null) return false;
      return true;
    }).sort(function (a, b) { return new Date(b.started_at) - new Date(a.started_at); });

    var limite = Number(params.limite) || 25;
    var pagina = Number(params.pagina) || 1;

    return {
      demo: true,
      total: filtrados.length,
      pagina_atual: pagina,
      limite: limite,
      contadores: {
        sla_2h: itens.filter(function (a) { return a.sla_2h_descumprido; }).length,
        sla_1h: itens.filter(function (a) { return a.sla_1h_aviso_enviado; }).length,
        insatisfacao: itens.filter(function (a) { return a.insatisfacao_detectada; }).length,
        palavra_chave: itens.filter(function (a) { return a.palavra_chave_detectada; }).length
      },
      itens: filtrados.slice((pagina - 1) * limite, pagina * limite)
    };
  }

  return {
    metricas: metricas,
    atendimentos: atendimentos
  };
})();
