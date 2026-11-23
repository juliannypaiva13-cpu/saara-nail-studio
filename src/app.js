// Roteador da API. Cada rota declara o nível de acesso; nada fica "aberto por esquecimento":
// rota sem nível declarado não existe. O teste 9 percorre esta tabela inteira.
import * as A from './auth.js';
import * as R from './reservas.js';
import { ErroRegra, alertaPagamento, ordenarPendencias, instante, horariosLivres, emFortaleza } from './regras.js';
import { garantirEsquema } from './esquema.js';
import { novoId, tokenSecreto } from './util.js';
import { ErroBanco } from './db.js';
import { verificarCorrente } from './auditoria.js';
import * as O from './operacao.js';
import { autorizarEnvio, receberEnvio, abrirComprovante, TAMANHO_MAXIMO } from './comprovantes.js';
import { ESTUDIO, SERVICOS, EXPEDIENTE } from './catalogo.js';

export const NIVEL = { PUBLICO: 'publico', ADMIN: 'admin', REAUT: 'admin_reautenticada' };
// Ambientes (variável MODO):
//  desligado   — nada responde além de /api/saude (padrão quando MODO não existe);
//  vitrine     — PRODUÇÃO ATÉ A AUTORIZAÇÃO: site aprovado no ar, agendamento público FECHADO, painel fechado, sem banco;
//  homologacao — ambiente de TESTE (ramo teste-passkey): tudo ligado, só com dados de teste;
//  completo    — produção liberada (só depois dos testes e da autorização expressa; o build recusa este modo por enquanto).
export const MODOS = ['desligado', 'vitrine', 'homologacao', 'completo'];
const TODOS = MODOS, VIT = ['vitrine', 'homologacao', 'completo'], ADM = ['homologacao', 'completo'], RES = ['homologacao', 'completo'], TESTE = ['homologacao'];

const COOKIE = '__Host-sessao';
const CABECALHOS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
};

function json(dados, status = 200, extra = {}) {
  return new Response(JSON.stringify(dados), { status, headers: { ...CABECALHOS, ...extra } });
}
const cookieSessao = token => `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${A.SESSAO_MAXIMA_MS / 1000}`;
const cookieApagar = `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
function lerCookie(req) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{43})(?:;|$)`));
  return m ? m[1] : null;
}
async function corpo(req) {
  if (!(req.headers.get('Content-Type') || '').startsWith('application/json')) throw new ErroRegra('formato_invalido');
  const t = await req.text();
  if (t.length > 20000) throw new ErroRegra('pedido_grande_demais');
  try { return JSON.parse(t || '{}'); } catch { throw new ErroRegra('formato_invalido'); }
}

/* ---------- Tabela de rotas ---------- */
export const ROTAS = [
  { m: 'GET', p: '/api/saude', n: NIVEL.PUBLICO, modos: TODOS,
    f: async ({ cfg, env }) => ({ ok: true, modo: cfg.modo, banco: env.DB ? 'ligado' : 'não ligado',
                                  configuracao: env.ORIGEM && env.RP_ID ? 'completa' : 'incompleta',
                                  reservasReais: false }) },

  { m: 'GET', p: '/api/horarios', n: NIVEL.PUBLICO, modos: RES,
    f: async ({ db, url, agora }) => ({ horarios: await R.horariosDoDia(db, { servicoId: url.searchParams.get('servico'), dia: url.searchParams.get('dia'), agoraMs: agora }) }) },

  { m: 'POST', p: '/api/reservas', n: NIVEL.PUBLICO, modos: RES, limite: 'reserva', turnstile: true,
    f: async ({ db, dados, agora }) => {
      const r = await R.criarReservaSite(db, { servicoId: dados.servico, dia: dados.dia, inicio: dados.inicio,
        cliente: { nome: String(dados.nome || '').slice(0, 80), whatsapp: String(dados.whatsapp || '').replace(/\D/g, '').slice(0, 13) },
        formaPagamento: dados.forma, agoraMs: agora });
      return { codigo: r.codigo, prazoVisivelEm: r.prazoVisivelEm }; // o prazo de 17 min nunca é mostrado
    } },

  /* Autenticação (públicas, com limite de tentativas) */
  { m: 'POST', p: '/api/auth/convite/opcoes', n: NIVEL.PUBLICO, modos: ADM, limite: 'auth',
    f: async ({ db, verif, cfg, dados, agora }) => A.opcoesCadastro(db, verif, cfg, { token: dados.convite, agoraMs: agora }) },
  { m: 'POST', p: '/api/auth/convite/concluir', n: NIVEL.PUBLICO, modos: ADM, limite: 'auth',
    f: async ({ db, verif, cfg, dados, agora, req }) => {
      const r = await A.concluirCadastro(db, verif, cfg, { token: dados.convite, desafioId: dados.desafioId, resposta: dados.resposta,
                                                           aparelho: aparelho(req), agoraMs: agora });
      return { corpo: { ok: true, codigosRecuperacao: r.codigosRecuperacao }, cookie: cookieSessao(r.sessaoToken) };
    } },
  { m: 'POST', p: '/api/auth/login/opcoes', n: NIVEL.PUBLICO, modos: ADM, limite: 'auth',
    f: async ({ db, verif, cfg, agora }) => A.opcoesLogin(db, verif, cfg, { agoraMs: agora }) },
  { m: 'POST', p: '/api/auth/login/concluir', n: NIVEL.PUBLICO, modos: ADM, limite: 'auth',
    f: async ({ db, verif, cfg, dados, agora, req }) => {
      const r = await A.concluirLogin(db, verif, cfg, { desafioId: dados.desafioId, resposta: dados.resposta, aparelho: aparelho(req), agoraMs: agora });
      return { corpo: { ok: true }, cookie: cookieSessao(r.sessaoToken) };
    } },
  { m: 'POST', p: '/api/auth/recuperar', n: NIVEL.PUBLICO, modos: ADM, limite: 'recuperar',
    f: async ({ db, dados, agora }) => A.recuperarComCodigo(db, { codigo: dados.codigo, agoraMs: agora }) },

  /* Área das administradoras */
  { m: 'GET', p: '/api/admin/eu', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ sessao }) => ({ id: sessao.adminId, nome: sessao.nome }) },
  { m: 'POST', p: '/api/admin/sair', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, sessao, agora }) => { await A.encerrarSessao(db, { sessao, agoraMs: agora }); return { corpo: { ok: true }, cookie: cookieApagar }; } },
  { m: 'GET', p: '/api/admin/sessoes', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, sessao, agora }) => ({ sessoes: (await db.prepare(
      `SELECT substr(id_hash, 1, 16) ref, criada_em, ultimo_uso, aparelho, id_hash = ? atual FROM sessoes
        WHERE admin_id = ? AND encerrada_em IS NULL AND expira_em > ? ORDER BY ultimo_uso DESC`).bind(sessao.idHash, sessao.adminId, agora).all()).results }) },
  { m: 'POST', p: '/api/admin/sessoes/encerrar', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, sessao, dados, agora }) => {
      const alvo = await db.prepare('SELECT id_hash FROM sessoes WHERE admin_id = ? AND substr(id_hash, 1, 16) = ?').bind(sessao.adminId, String(dados.ref || '')).first();
      if (!alvo) throw new A.ErroAcesso('sessao_desconhecida', 404);
      return { encerradas: await A.encerrarSessao(db, { sessao, alvoHash: alvo.id_hash, agoraMs: agora }) };
    } },
  { m: 'GET', p: '/api/admin/passkeys', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, sessao }) => ({ passkeys: (await db.prepare(
      'SELECT id, aparelho, criada_em, ultimo_uso FROM passkeys WHERE admin_id = ? AND desativada_em IS NULL').bind(sessao.adminId).all()).results }) },
  { m: 'POST', p: '/api/admin/reautenticar/opcoes', n: NIVEL.ADMIN, modos: ADM, limite: 'auth',
    f: async ({ db, verif, cfg, sessao, agora }) => A.opcoesLogin(db, verif, cfg, { agoraMs: agora, sessao }) },
  { m: 'POST', p: '/api/admin/reautenticar/concluir', n: NIVEL.ADMIN, modos: ADM, limite: 'auth',
    f: async ({ db, verif, cfg, sessao, dados, agora }) => {
      await A.concluirLogin(db, verif, cfg, { desafioId: dados.desafioId, resposta: dados.resposta, agoraMs: agora, sessao });
      return { ok: true, validaPorMin: A.REAUTENTICACAO_VALIDA_MS / 60e3 };
    } },
  { m: 'GET', p: '/api/admin/alertas-pagamento', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, agora }) => {
      const { results } = await db.prepare(
        `SELECT p.id, p.criado_em, p.valor_centavos, a.codigo, a.dia, a.inicio_min FROM pagamentos p
           JOIN agendamentos a ON a.id = p.agendamento_id WHERE p.status = 'em_analise'`).all();
      const lista = results.map(p => {
        const atendimentoMs = instante(p.dia, p.inicio_min);
        return { ...p, atendimentoMs, alerta: alertaPagamento({ recebidoMs: p.criado_em, atendimentoMs, agoraMs: agora }) };
      });
      return { pendencias: ordenarPendencias(lista) };
    } },

  /* Site público */
  { m: 'GET', p: '/api/publico/config', n: NIVEL.PUBLICO, modos: VIT,
    f: async ({ db, cfg, agora }) => {
      let servicos = SERVICOS, expediente = EXPEDIENTE;
      if (db && cfg.modo !== 'vitrine') {
        servicos = (await db.prepare('SELECT id, nome, preco_centavos, duracao_min, descricao FROM servicos WHERE ativo = 1').all()).results;
        const linhas = await R.carregarExpediente(db);
        const versao = linhas.reduce((a, e) => (e.vigente_desde <= emFortaleza(agora).dia && e.vigente_desde > a ? e.vigente_desde : a), '');
        expediente = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, linhas.filter(e => e.vigente_desde === versao && e.dia_semana === d).map(e => [e.inicio_min, e.fim_min])]));
      }
      return { estudio: ESTUDIO, servicos, expediente, reservasAbertas: RES.includes(cfg.modo), ambiente: cfg.modo === 'homologacao' ? 'teste' : 'producao' };
    } },
  { m: 'GET', p: '/api/reservas/acompanhar', n: NIVEL.PUBLICO, modos: RES, limite: 'consulta',
    f: async ({ db, url, agora }) => O.acompanhar(db, { codigo: url.searchParams.get('codigo'), agoraMs: agora }) },
  { m: 'POST', p: '/api/reservas/comprovante/autorizar', n: NIVEL.PUBLICO, modos: RES, limite: 'reserva',
    f: async ({ db, dados, agora }) => autorizarEnvio(db, { codigo: dados.codigo, tipo: dados.tipo, tamanho: dados.tamanho, agoraMs: agora }) },
  { m: 'PUT', p: '/api/reservas/comprovante', n: NIVEL.PUBLICO, modos: RES, limite: 'reserva', bruto: true,
    f: async ({ db, env, url, req, corpoBruto, agora }) => {
      const r = await receberEnvio(db, env.COMPROVANTES, { token: url.searchParams.get('token'), tipo: (req.headers.get('Content-Type') || '').split(';')[0].trim(),
                                                          corpo: corpoBruto, agoraMs: agora });
      return { status: r.status, mensagem: 'Pagamento em análise' };
    } },
  { m: 'POST', p: '/api/reservas/solicitacao', n: NIVEL.PUBLICO, modos: RES, limite: 'reserva',
    f: async ({ db, dados, agora }) => O.criarSolicitacao(db, { codigo: dados.codigo, tipo: dados.tipo, motivo: dados.motivo, agoraMs: agora }) },
  { m: 'POST', p: '/api/reservas/remarcar', n: NIVEL.PUBLICO, modos: RES, limite: 'reserva',
    f: async ({ db, dados, agora }) => O.reagendarPelaCliente(db, { codigo: dados.codigo, novoDia: dados.dia, novoInicio: dados.inicio, agoraMs: agora }) },

  /* Painel administrativo (Saara e Julianny, mesmas permissões) */
  { m: 'GET', p: '/api/admin/painel', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, url, sessao, agora }) => O.painel(db, { de: url.searchParams.get('de'), ate: url.searchParams.get('ate'), sessao, agoraMs: agora }) },
  { m: 'GET', p: '/api/admin/agendamento', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, url }) => O.detalheAgendamento(db, { id: url.searchParams.get('id') }) },
  { m: 'GET', p: '/api/admin/horarios', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, url, agora }) => ({ horarios: await R.horariosDoDia(db, { servicoId: url.searchParams.get('servico'), dia: url.searchParams.get('dia'), agoraMs: agora, equipe: true }) }) },
  { m: 'POST', p: '/api/admin/agendamentos', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, dados, sessao, agora }) => O.criarAgendamentoEquipe(db, { servicoId: dados.servico, dia: dados.dia, inicio: dados.inicio,
                                                                              cliente: { nome: dados.nome, whatsapp: dados.whatsapp }, forma: dados.forma, sessao, agoraMs: agora }) },
  { m: 'POST', p: '/api/admin/agendamentos/reagendar', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, dados, sessao, agora }) => O.reagendarEquipe(db, { agendamentoId: dados.id, novoDia: dados.dia, novoInicio: dados.inicio, sessao, agoraMs: agora }) },
  { m: 'POST', p: '/api/admin/agendamentos/cancelar', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, dados, sessao, agora }) => O.cancelar(db, { agendamentoId: dados.id, motivo: dados.motivo, destino: dados.destino, valorCentavos: dados.valorCentavos,
                                                                justificativa: dados.justificativa, sessao, agoraMs: agora }) },
  { m: 'POST', p: '/api/admin/agendamentos/presenca', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, dados, sessao, agora }) => O.presenca(db, { agendamentoId: dados.id, acao: dados.acao, atrasoMin: dados.atrasoMin, sessao, agoraMs: agora }) },
  { m: 'POST', p: '/api/admin/pagamentos/decidir', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, dados, sessao, agora }) => O.decidirPagamento(db, { pagamentoId: dados.id, decisao: dados.decisao, conferido: dados.conferido, motivo: dados.motivo, sessao, agoraMs: agora }) },
  { m: 'POST', p: '/api/admin/pagamentos/presencial', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, dados, sessao, agora }) => O.pagamentoPresencial(db, { agendamentoId: dados.id, valorCentavos: dados.valorCentavos, motivo: dados.motivo, sessao, agoraMs: agora }) },
  { m: 'GET', p: '/api/admin/comprovante', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, env, url }) => abrirComprovante(db, env.COMPROVANTES, { id: url.searchParams.get('id') }) },
  { m: 'GET', p: '/api/admin/clientes', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, url }) => O.listarClientes(db, { busca: url.searchParams.get('busca') }) },
  { m: 'GET', p: '/api/admin/cliente', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, url }) => O.detalheCliente(db, { id: url.searchParams.get('id') }) },
  { m: 'POST', p: '/api/admin/cliente/editar', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, dados, sessao, agora }) => O.editarCliente(db, { id: dados.id, nome: dados.nome, whatsapp: dados.whatsapp, observacoes: dados.observacoes, sessao, agoraMs: agora }) },
  { m: 'POST', p: '/api/admin/bloqueios', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, dados, sessao, agora }) => O.criarBloqueio(db, { dia: dados.dia, inicio: dados.inicio, fim: dados.fim, motivo: dados.motivo, sessao, agoraMs: agora }) },
  { m: 'POST', p: '/api/admin/bloqueios/remover', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, dados, sessao, agora }) => O.removerBloqueio(db, { id: dados.id, sessao, agoraMs: agora }) },
  { m: 'POST', p: '/api/admin/expediente', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, dados, sessao, agora }) => O.alterarExpediente(db, { vigenteDesde: dados.vigenteDesde, periodos: dados.periodos, sessao, agoraMs: agora }) },
  { m: 'POST', p: '/api/admin/solicitacoes/decidir', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, dados, sessao, agora }) => O.decidirSolicitacao(db, { id: dados.id, decisao: dados.decisao, justificativa: dados.justificativa, novoDia: dados.dia,
                                                                          novoInicio: dados.inicio, destino: dados.destino, valorCentavos: dados.valorCentavos, sessao, agoraMs: agora }) },
  { m: 'POST', p: '/api/admin/reembolsos/concluir', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, dados, sessao, agora }) => O.concluirReembolso(db, { id: dados.id, sessao, agoraMs: agora }) },
  { m: 'POST', p: '/api/admin/creditos/usar', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, dados, sessao, agora }) => O.usarCredito(db, { creditoId: dados.credito, agendamentoId: dados.id, sessao, agoraMs: agora }) },
  { m: 'POST', p: '/api/admin/avisos/lidos', n: NIVEL.ADMIN, modos: ADM,
    f: async ({ db, dados, sessao, agora }) => O.marcarAvisosLidos(db, { ids: dados.ids, sessao, agoraMs: agora }) },

  /* Instalação sem linha de comando (só no servidor de teste nesta fase) */
  { m: 'POST', p: '/api/instalacao/convites', n: NIVEL.PUBLICO, modos: TESTE, limite: 'recuperar',
    f: async ({ db, env, dados, agora }) => A.convitesInstalacao(db, { segredoInformado: dados.segredo, segredoConfigurado: env.INSTALACAO_SEGREDO, agoraMs: agora }) },

  /* Testes no banco real com dados FICTÍCIOS (só no servidor de teste, só para Saara e Julianny) */
  { m: 'GET', p: '/api/teste/alvo', n: NIVEL.ADMIN, modos: TESTE,
    f: async ({ db, agora }) => {
      await R.expirarReservas(db, agora);
      const s = await db.prepare(`SELECT duracao_min FROM servicos WHERE id = 'f1'`).first();
      const expediente = await R.carregarExpediente(db);
      for (let d = 2; d <= 21; d++) {
        const dia = emFortaleza(agora + d * 86400e3).dia;
        const ocupadas = new Set((await db.prepare('SELECT minuto FROM casas_ocupadas WHERE dia = ?').bind(dia).all()).results.map(r => r.minuto));
        const livres = horariosLivres({ expediente, dia, duracao: s.duracao_min, ocupadas, agoraMs: agora });
        if (livres.length) return { servico: 'f1', dia, inicio: livres[0] };
      }
      throw new ErroRegra('sem_horario_para_teste');
    } },
  { m: 'POST', p: '/api/teste/reserva-ficticia', n: NIVEL.ADMIN, modos: TESTE, limite: 'teste',
    f: async ({ db, dados, agora }) => {
      const r = await R.criarReservaSite(db, { servicoId: 'f1', dia: String(dados.dia || ''), inicio: Number(dados.inicio),
        cliente: { nome: NOME_FICTICIO, whatsapp: null }, formaPagamento: 'sinal', agoraMs: agora, ficticia: true });
      return { codigo: r.codigo, criadaEm: agora, prazoVisivelEm: r.prazoVisivelEm, prazoFinalEm: r.prazoFinalEm };
    } },
  { m: 'POST', p: '/api/teste/comprovante-ficticio', n: NIVEL.ADMIN, modos: TESTE, limite: 'teste',
    f: async ({ db, dados, agora }) => {
      const ag = await db.prepare(`SELECT a.id, a.criado_em FROM agendamentos a JOIN clientes c ON c.id = a.cliente_id
                                   WHERE a.codigo = ? AND c.nome = ?`).bind(String(dados.codigo || ''), NOME_FICTICIO).first();
      if (!ag) throw new ErroRegra('agendamento_inexistente');
      const etag = tokenSecreto().slice(0, 16);
      const r = await R.registrarComprovante(db, { agendamentoId: ag.id, objeto: `teste/${ag.id}/${etag}`, etag, tipo: 'image/jpeg',
                                                    tamanho: 1, recebidoEmMs: agora, agoraMs: agora });
      return { ...r, segundosDesdeAReserva: Math.round((agora - ag.criado_em) / 1000) };
    } },
  { m: 'GET', p: '/api/teste/situacao', n: NIVEL.ADMIN, modos: TESTE,
    f: async ({ db, agora }) => {
      const expiradasAgora = await R.expirarReservas(db, agora);
      const avisosNovos = await R.processarAlertasPagamento(db, agora);
      const n = async sql => (await db.prepare(sql).first()).n;
      const reservas = (await db.prepare(
        `SELECT a.codigo, a.dia, a.inicio_min, a.fim_min, a.status, a.criado_em, p.alerta_nivel,
                (SELECT COUNT(*) FROM casas_ocupadas k WHERE k.agendamento_id = a.id) casas
           FROM agendamentos a JOIN clientes c ON c.id = a.cliente_id LEFT JOIN pagamentos p ON p.agendamento_id = a.id
          WHERE c.nome = ? ORDER BY a.criado_em DESC LIMIT 30`).bind(NOME_FICTICIO).all()).results
        .map(r => ({ ...r, minutosDesdeAReserva: Math.floor((agora - r.criado_em) / 60e3) }));
      return {
        agora, expiradasAgora, avisosNovos,
        sobreposicoes: await n(`SELECT COUNT(*) n FROM agendamentos a JOIN agendamentos b ON a.dia = b.dia AND a.id < b.id
          AND a.status IN ('aguardando_comprovante','em_analise','aguardando_pix','confirmado')
          AND b.status IN ('aguardando_comprovante','em_analise','aguardando_pix','confirmado')
          AND a.inicio_min < b.fim_min + 15 AND b.inicio_min < a.fim_min + 15`),
        contagens: { passkeys: await n('SELECT COUNT(*) n FROM passkeys WHERE desativada_em IS NULL'),
                     sessoesAbertas: await n(`SELECT COUNT(*) n FROM sessoes WHERE encerrada_em IS NULL AND expira_em > ${Number(agora)}`),
                     registrosAuditoria: await n('SELECT COUNT(*) n FROM auditoria'),
                     reservasFicticias: reservas.length, avisos: await n(`SELECT COUNT(*) n FROM notificacoes`) },
        corrente: await verificarCorrente(db),
        reservas
      };
    } },

  /* Ações sensíveis: exigem passkey confirmada nos últimos 5 minutos */
  { m: 'POST', p: '/api/admin/passkeys/desativar', n: NIVEL.REAUT, modos: ADM,
    f: async ({ db, sessao, dados, agora }) => { await A.desativarPasskey(db, { sessao, passkeyId: String(dados.id || ''), agoraMs: agora }); return { ok: true }; } },
  { m: 'POST', p: '/api/admin/convites', n: NIVEL.REAUT, modos: ADM,
    f: async ({ db, sessao, dados, agora }) => A.conviteParaOutra(db, { sessao, alvoId: String(dados.para || ''), agoraMs: agora }) },
  { m: 'POST', p: '/api/admin/recuperacao/novos-codigos', n: NIVEL.REAUT, modos: ADM,
    f: async ({ db, sessao, agora }) => ({ codigos: await A.novosCodigos(db, { sessao, agoraMs: agora }) }) },
  { m: 'GET', p: '/api/admin/auditoria', n: NIVEL.REAUT, modos: ADM,
    f: async ({ db }) => ({ corrente: await verificarCorrente(db),
      registros: (await db.prepare('SELECT id, quando, admin_id, acao, entidade FROM auditoria ORDER BY id DESC LIMIT 200').all()).results }) }
];

const NOME_FICTICIO = 'TESTE FICTÍCIO';
function aparelho(req) { return (req.headers.get('User-Agent') || '').slice(0, 120) || null; }

const LIMITES = { auth: [20, 60e3], reserva: [10, 60e3], consulta: [60, 60e3], recuperar: [5, 15 * 60e3], teste: [150, 60e3] };
async function dentroDoLimite(env, db, tipo, ip, agora) {
  const chave = `${tipo}:${ip}`;
  if (env.LIMITE && typeof env.LIMITE.limit === 'function') return (await env.LIMITE.limit({ key: chave })).success;
  const [max, jan] = LIMITES[tipo];
  const janela = Math.floor(agora / jan);
  const [, r] = await db.batch([
    db.prepare('DELETE FROM tentativas WHERE chave = ? AND janela < ?').bind(chave, janela), // limpa janelas velhas
    db.prepare(`INSERT INTO tentativas (chave, janela, contagem) VALUES (?, ?, 1)
                ON CONFLICT (chave, janela) DO UPDATE SET contagem = contagem + 1 RETURNING contagem`).bind(chave, janela)
  ]);
  return r.results[0].contagem <= max;
}

async function turnstileOk(env, token, ip, deps, modo) {
  if (deps.turnstile) return deps.turnstile(token);
  if (modo === 'homologacao' && !env.TURNSTILE_SECRET) return true; // ambiente de teste sem Turnstile configurado
  if (!env.TURNSTILE_SECRET || !token) return false;
  const f = new FormData();
  f.append('secret', env.TURNSTILE_SECRET); f.append('response', String(token)); if (ip) f.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: f });
  return (await r.json()).success === true;
}

/**
 * cria o manipulador. deps: { verif, agora?, turnstile? } (agora e turnstile só são trocados nos testes).
 * env: { DB, ORIGEM, RP_ID, MODO, LIMITE?, TURNSTILE_SECRET? }
 */
export function criarApp(deps) {
  return async function tratar(req, env) {
    const cfg = { origem: env.ORIGEM, rpId: env.RP_ID, rpNome: 'Saara Nail Studio', modo: env.MODO || 'desligado' };
    const db = env.DB;
    const agora = deps.agora ? deps.agora() : Date.now();
    const url = new URL(req.url);
    const ip = req.headers.get('CF-Connecting-IP') || 'local';
    try {
      const rota = ROTAS.find(r => r.p === url.pathname && r.m === req.method && r.modos.includes(cfg.modo));
      if (!rota) return json({ erro: ROTAS.some(r => r.p === url.pathname && r.modos.includes(cfg.modo)) ? 'metodo_nao_permitido' : 'nao_encontrado' },
                             ROTAS.some(r => r.p === url.pathname && r.modos.includes(cfg.modo)) ? 405 : 404);
      if (req.method !== 'GET') {
        if (req.headers.get('Origin') !== cfg.origem) return json({ erro: 'origem_recusada' }, 403);
        if (req.headers.get('Sec-Fetch-Site') && req.headers.get('Sec-Fetch-Site') !== 'same-origin') return json({ erro: 'origem_recusada' }, 403);
      }
      if (!MODOS.includes(cfg.modo)) return json({ erro: 'modo_invalido' }, 503);
      const usaBanco = !['desligado', 'vitrine'].includes(cfg.modo) && rota.p !== '/api/saude';
      if (usaBanco) {
        if (!db) return json({ erro: 'banco_nao_ligado', binding: 'DB' }, 503);
        if (!cfg.origem || !cfg.rpId) return json({ erro: 'configuracao_incompleta', faltando: ['ORIGEM', 'RP_ID'].filter(k => !env[k]) }, 503);
      }
      if (usaBanco && !(await garantirEsquema(db, agora)))
        return json({ erro: 'instalando_banco', tenteDeNovo: true }, 503, { 'Retry-After': '1' });
      let sessao = null;
      if (rota.n !== NIVEL.PUBLICO) {
        sessao = await A.validarSessao(db, lerCookie(req), agora);
        if (rota.n === NIVEL.REAUT) A.exigirReautenticacao(sessao, agora);
      }
      if (rota.limite && !(await dentroDoLimite(env, db, rota.limite, ip, agora))) return json({ erro: 'muitas_tentativas' }, 429, { 'Retry-After': '60' });
      let dados = {}, corpoBruto = null;
      if (rota.bruto) {
        const tam = Number(req.headers.get('Content-Length') || 0);
        if (tam > TAMANHO_MAXIMO) return json({ erro: 'arquivo_grande_demais' }, 413);
        corpoBruto = await req.arrayBuffer();
        if (corpoBruto.byteLength > TAMANHO_MAXIMO) return json({ erro: 'arquivo_grande_demais' }, 413);
      } else if (req.method !== 'GET') dados = await corpo(req);
      if (rota.turnstile && !(await turnstileOk(env, dados.turnstile, ip, deps, cfg.modo))) return json({ erro: 'verificacao_humana_falhou' }, 403);
      const out = await rota.f({ db, env, verif: deps.verif, cfg, req, url, dados, corpoBruto, sessao, agora });
      if (out instanceof Response) return out;
      if (out && out.cookie) return json(out.corpo, 200, { 'Set-Cookie': out.cookie });
      return json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof A.ErroAcesso) return json({ erro: e.codigo }, e.status, e.status === 401 ? { 'Set-Cookie': cookieApagar } : {});
      if (e instanceof ErroRegra) return json({ erro: e.codigo, ...(e.detalhes ? { detalhes: e.detalhes } : {}) },
                                              /_inexistente$|^servico_invalido$|^arquivo_nao_encontrado$/.test(e.codigo) ? 404 : e.codigo === 'armazenamento_nao_ligado' ? 503 : 422);
      if (e instanceof ErroBanco && e.codigo !== 'erro_banco') return json({ erro: e.codigo }, 409);
      if (e && e.message === 'falha_na_migracao') return json({ erro: 'falha_na_migracao', migracao: e.migracao, detalhe: e.detalhe }, 503);
      console.error('erro_interno', e && e.message, globalThis.process?.env?.DEPURAR ? e.stack : ''); // sem dados pessoais no log
      return json({ erro: 'erro_interno' }, 500);
    }
  };
}
