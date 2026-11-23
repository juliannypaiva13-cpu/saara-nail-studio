// Operação do estúdio (painel de Saara e Julianny). Toda escrita é um lote atômico com histórico e auditoria.
// Regras de dinheiro: o valor SEMPRE vem do banco (preço do serviço), nunca do navegador; pagamento só fica
// "confirmado" por decisão de uma administradora, com conferência no banco marcada; nada é retido sem justificativa.
import { lote, afirmar } from './db.js';
import { comandoAuditoria } from './auditoria.js';
import { ErroRegra, validarInicio, casasDoAtendimento, casasDoBloqueio, instante, emFortaleza, periodosDoDia, PASSO_MIN, ULTIMO_DIA } from './regras.js';
import { carregarExpediente, comandosCliente, ATIVOS, expirarReservas, servico, inserirCasa, historico, reagendar, processarAlertasPagamento } from './reservas.js';
import { novoId, codigoAgendamento } from './util.js';

const DIA = 86400e3, TOLERANCIA_MIN = 15;
const diaOk = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const txt = (v, max = 300) => (v == null ? null : String(v).trim().slice(0, max) || null);
const sinal30 = preco => Math.round(preco * 0.3);
const audit = (db, sessao, agoraMs, acao, entidade, dados) => comandoAuditoria(db, { quando: agoraMs, adminId: sessao.adminId, acao, entidade, dados });

async function agendamento(db, id) {
  const a = await db.prepare('SELECT * FROM agendamentos WHERE id = ?').bind(String(id || '')).first();
  if (!a) throw new ErroRegra('agendamento_inexistente');
  return a;
}
/** Quanto já foi pago e ainda não devolvido (centavos). */
const SQL_SALDO = `(SELECT COALESCE(SUM(valor_centavos), 0) FROM pagamentos WHERE agendamento_id = ? AND status = 'confirmado')
                 - (SELECT COALESCE(SUM(valor_centavos), 0) FROM reembolsos WHERE agendamento_id = ? AND status <> 'cancelado')`;
async function saldoPago(db, id) { return (await db.prepare(`SELECT ${SQL_SALDO} v`).bind(id, id).first()).v; }

/* ───────────── Leitura: painel, agendamento, clientes ───────────── */
export async function painel(db, { de, ate, sessao, agoraMs }) {
  if (!diaOk(de) || !diaOk(ate) || ate < de) throw new ErroRegra('periodo_invalido');
  if ((Date.parse(ate) - Date.parse(de)) / DIA > 62) throw new ErroRegra('periodo_grande_demais');
  // O Pages não tem agenda (cron): a liberação de reservas vencidas e os avisos de 30 min, 2 h e 12 h rodam aqui,
  // sempre que o painel é aberto ou atualizado (e a cada reserva/consulta de horários).
  await expirarReservas(db, agoraMs);
  await processarAlertasPagamento(db, agoraMs);
  const q = async (sql, ...p) => (await db.prepare(sql).bind(...p).all()).results;
  const [agendamentos, bloqueios, pendentes, solicitacoes, notificacoes, expediente, fin] = await Promise.all([
    q(`SELECT a.id, a.codigo, a.dia, a.inicio_min, a.fim_min, a.status, a.origem, a.forma_pagamento, a.preco_centavos, a.servico_id,
              a.presenca_confirmada, a.atraso_min, a.prazo_visivel_em, a.prazo_final_em, a.criado_em, a.versao,
              c.id cliente_id, c.nome cliente_nome, c.whatsapp cliente_whatsapp,
              (SELECT COALESCE(SUM(valor_centavos), 0) FROM pagamentos p WHERE p.agendamento_id = a.id AND p.status = 'confirmado') pago_centavos,
              (SELECT COUNT(*) FROM pagamentos p WHERE p.agendamento_id = a.id AND p.status = 'em_analise') em_analise
         FROM agendamentos a LEFT JOIN clientes c ON c.id = a.cliente_id
        WHERE a.dia BETWEEN ? AND ? ORDER BY a.dia, a.inicio_min`, de, ate),
    q('SELECT id, dia, inicio_min, fim_min, motivo, criado_por FROM bloqueios WHERE dia BETWEEN ? AND ? AND removido_em IS NULL ORDER BY dia, inicio_min', de, ate),
    q(`SELECT p.id, p.agendamento_id, p.tipo, p.valor_centavos, p.status, p.criado_em, p.alerta_nivel, p.comprovante_id,
              a.codigo, a.dia, a.inicio_min, c.nome cliente_nome
         FROM pagamentos p JOIN agendamentos a ON a.id = p.agendamento_id LEFT JOIN clientes c ON c.id = a.cliente_id
        WHERE p.status IN ('em_analise', 'aguardando_pix') ORDER BY p.criado_em`),
    q(`SELECT s.*, a.codigo, a.dia, a.inicio_min, c.nome cliente_nome FROM solicitacoes s JOIN agendamentos a ON a.id = s.agendamento_id
         LEFT JOIN clientes c ON c.id = a.cliente_id WHERE s.status = 'pendente' ORDER BY s.criada_em`),
    q(`SELECT n.id, n.tipo, n.referencia, n.texto, n.nivel, n.criada_em,
              EXISTS (SELECT 1 FROM notificacoes_lidas l WHERE l.notificacao_id = n.id AND l.admin_id = ?) lida
         FROM notificacoes n ORDER BY n.criada_em DESC LIMIT 60`, sessao.adminId),
    carregarExpediente(db),
    q(`SELECT p.tipo, p.status, COUNT(*) n, COALESCE(SUM(p.valor_centavos), 0) total FROM pagamentos p JOIN agendamentos a ON a.id = p.agendamento_id
        WHERE a.dia BETWEEN ? AND ? GROUP BY p.tipo, p.status`, de, ate)
  ]);
  const reembolsosPendentes = await q(`SELECT r.*, a.codigo FROM reembolsos r JOIN agendamentos a ON a.id = r.agendamento_id WHERE r.status = 'pendente' ORDER BY r.decidido_em`);
  return { agora: agoraMs, de, ate, agendamentos, bloqueios, pagamentosPendentes: pendentes, solicitacoes, notificacoes, expediente,
           financeiro: fin, reembolsosPendentes };
}

export async function detalheAgendamento(db, { id }) {
  const a = await agendamento(db, id);
  const q = async (sql) => (await db.prepare(sql).bind(a.id).all()).results;
  return {
    agendamento: a,
    cliente: a.cliente_id ? await db.prepare('SELECT * FROM clientes WHERE id = ?').bind(a.cliente_id).first() : null,
    pagamentos: await q('SELECT * FROM pagamentos WHERE agendamento_id = ? ORDER BY criado_em'),
    comprovantes: await q('SELECT id, tipo, tamanho, recebido_em, etag FROM comprovantes WHERE agendamento_id = ? ORDER BY recebido_em'),
    historico: await q('SELECT quando, quem, acao, detalhes FROM historico_agendamento WHERE agendamento_id = ? ORDER BY id'),
    solicitacoes: await q('SELECT * FROM solicitacoes WHERE agendamento_id = ? ORDER BY criada_em'),
    reembolsos: await q('SELECT * FROM reembolsos WHERE agendamento_id = ? ORDER BY decidido_em'),
    saldoPagoCentavos: await saldoPago(db, a.id)
  };
}

export async function listarClientes(db, { busca }) {
  const b = txt(busca, 60);
  const like = b ? `%${b.replace(/[%_]/g, '')}%` : '%';
  const { results } = await db.prepare(
    `SELECT c.id, c.nome, c.whatsapp, c.observacoes, c.ultimo_atendimento, c.criada_em,
            (SELECT COUNT(*) FROM agendamentos a WHERE a.cliente_id = c.id AND a.status = 'concluido') atendimentos,
            (SELECT COUNT(*) FROM agendamentos a WHERE a.cliente_id = c.id AND a.status = 'nao_compareceu') faltas,
            (SELECT COALESCE(SUM(valor_centavos), 0) FROM creditos k WHERE k.cliente_id = c.id AND k.usado_em IS NULL) credito_centavos
       FROM clientes c WHERE c.anonimizada_em IS NULL AND (c.nome LIKE ? OR c.whatsapp LIKE ?) ORDER BY c.nome LIMIT 200`).bind(like, like).all();
  return { clientes: results };
}

export async function detalheCliente(db, { id }) {
  const c = await db.prepare('SELECT * FROM clientes WHERE id = ?').bind(String(id || '')).first();
  if (!c) throw new ErroRegra('cliente_inexistente');
  const ag = (await db.prepare(`SELECT id, codigo, dia, inicio_min, servico_id, status, preco_centavos, atraso_min FROM agendamentos
                                 WHERE cliente_id = ? ORDER BY dia DESC, inicio_min DESC LIMIT 100`).bind(c.id).all()).results;
  const cr = (await db.prepare('SELECT * FROM creditos WHERE cliente_id = ? ORDER BY criado_em DESC').bind(c.id).all()).results;
  return { cliente: c, agendamentos: ag, creditos: cr };
}

export async function editarCliente(db, { id, nome, whatsapp, observacoes, sessao, agoraMs }) {
  const c = await db.prepare('SELECT * FROM clientes WHERE id = ?').bind(String(id || '')).first();
  if (!c) throw new ErroRegra('cliente_inexistente');
  const w = whatsapp == null ? c.whatsapp : String(whatsapp).replace(/\D/g, '');
  if (w && !/^\d{10,11}$/.test(w)) throw new ErroRegra('whatsapp_invalido');
  const n = nome == null ? c.nome : txt(nome, 80);
  try {
    await lote(db, [
      db.prepare('UPDATE clientes SET nome = ?, whatsapp = ?, observacoes = ? WHERE id = ?').bind(n, w || null, observacoes == null ? c.observacoes : txt(observacoes, 1000), c.id),
      ...await audit(db, sessao, agoraMs, 'cliente_editada', c.id)
    ]);
  } catch (e) { if (/clientes\.whatsapp|UNIQUE/.test(String(e.original?.message))) throw new ErroRegra('whatsapp_ja_cadastrado'); throw e; }
  return { ok: true };
}

/* ───────────── Agendamento pela equipe ───────────── */
/** A equipe pode agendar com menos de 24 h. estúdio → confirmado (paga no dia); sinal/integral → aguardando o Pix. */
export async function criarAgendamentoEquipe(db, { servicoId, dia, inicio, cliente, forma, sessao, agoraMs }) {
  if (!['estudio', 'sinal', 'integral'].includes(forma)) throw new ErroRegra('forma_pagamento_invalida');
  const nome = txt(cliente?.nome, 80);
  const whatsapp = cliente?.whatsapp ? String(cliente.whatsapp).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '') : null;
  if (!nome || nome.length < 2) throw new ErroRegra('nome_invalido');
  if (whatsapp && !/^\d{10,11}$/.test(whatsapp)) throw new ErroRegra('whatsapp_invalido');
  await expirarReservas(db, agoraMs);
  const s = await servico(db, servicoId);
  const { fim } = validarInicio({ expediente: await carregarExpediente(db), dia, inicio: Number(inicio), duracao: s.duracao_min, agoraMs, equipe: true });
  const id = novoId('ag'), codigo = codigoAgendamento(), clienteNovo = novoId('cl');
  const status = forma === 'estudio' ? 'confirmado' : 'aguardando_pix';
  const cmds = [
    ...comandosCliente(db, { id: clienteNovo, nome, whatsapp, agoraMs }),
    db.prepare(`INSERT INTO agendamentos (id, codigo, cliente_id, servico_id, preco_centavos, dia, inicio_min, fim_min, status, origem,
                forma_pagamento, criado_em, atualizado_em)
                VALUES (?, ?, ${whatsapp ? '(SELECT id FROM clientes WHERE whatsapp = ?)' : '?'}, ?, ?, ?, ?, ?, ?, 'equipe', ?, ?, ?)`)
      .bind(id, codigo, whatsapp ?? clienteNovo, s.id, s.preco_centavos, dia, Number(inicio), fim, status, forma, agoraMs, agoraMs),
    ...casasDoAtendimento(Number(inicio), fim).map(m => inserirCasa(db, dia, m, id)),
    historico(db, id, agoraMs, sessao.adminId, 'agendado_pela_equipe', { dia, inicio: Number(inicio), forma })
  ];
  if (forma !== 'estudio')
    cmds.push(db.prepare(`INSERT INTO pagamentos (id, agendamento_id, tipo, valor_centavos, status, criado_em) VALUES (?, ?, ?, ?, 'aguardando_pix', ?)`)
      .bind(novoId('pg'), id, forma, forma === 'sinal' ? sinal30(s.preco_centavos) : s.preco_centavos, agoraMs));
  cmds.push(...await audit(db, sessao, agoraMs, 'agendamento_equipe', id, { dia, inicio: Number(inicio), servico: s.id, forma }));
  await lote(db, cmds);
  return { id, codigo, status };
}

export async function reagendarEquipe(db, { agendamentoId, novoDia, novoInicio, sessao, agoraMs }) {
  const r = await reagendar(db, { agendamentoId, novoDia, novoInicio: Number(novoInicio), quem: sessao.adminId, equipe: true, agoraMs });
  return { ok: true, ...r };
}

/* ───────────── Pagamentos ───────────── */
/**
 * Decisão manual sobre um pagamento. Imagem de comprovante NUNCA confirma nada sozinha:
 *  - confirmar: exige conferido=true (a administradora viu o dinheiro no banco). Agendamento → confirmado.
 *  - pedir_novo: comprovante não confere; o horário continua reservado aguardando novo Pix.
 *  - recusar_e_liberar: recusa e libera o horário (exige motivo).
 */
export async function decidirPagamento(db, { pagamentoId, decisao, conferido, motivo, sessao, agoraMs }) {
  const p = await db.prepare('SELECT * FROM pagamentos WHERE id = ?').bind(String(pagamentoId || '')).first();
  if (!p) throw new ErroRegra('pagamento_inexistente');
  if (!['em_analise', 'aguardando_pix'].includes(p.status)) throw new ErroRegra('pagamento_ja_decidido');
  const m = txt(motivo, 300);
  const guarda = afirmar(db, `EXISTS (SELECT 1 FROM pagamentos WHERE id = ? AND status IN ('em_analise', 'aguardando_pix'))`, p.id);
  let cmds;
  if (decisao === 'confirmar') {
    if (conferido !== true) throw new ErroRegra('conferencia_obrigatoria');
    cmds = [guarda,
      db.prepare(`UPDATE pagamentos SET status = 'confirmado', conferido = 1, decidido_por = ?, decidido_em = ?, motivo = ? WHERE id = ?`)
        .bind(sessao.adminId, agoraMs, m, p.id),
      db.prepare(`UPDATE agendamentos SET status = 'confirmado', atualizado_em = ?, versao = versao + 1
                   WHERE id = ? AND status IN ('em_analise', 'aguardando_pix')`).bind(agoraMs, p.agendamento_id)];
  } else if (decisao === 'pedir_novo') {
    if (!m) throw new ErroRegra('motivo_obrigatorio');
    cmds = [guarda,
      db.prepare(`UPDATE pagamentos SET status = 'recusado', decidido_por = ?, decidido_em = ?, motivo = ? WHERE id = ?`).bind(sessao.adminId, agoraMs, m, p.id),
      db.prepare(`INSERT INTO pagamentos (id, agendamento_id, tipo, valor_centavos, status, criado_em) VALUES (?, ?, ?, ?, 'aguardando_pix', ?)`)
        .bind(novoId('pg'), p.agendamento_id, p.tipo, p.valor_centavos, agoraMs),
      db.prepare(`UPDATE agendamentos SET status = 'aguardando_pix', atualizado_em = ?, versao = versao + 1 WHERE id = ?`).bind(agoraMs, p.agendamento_id)];
  } else if (decisao === 'recusar_e_liberar') {
    if (!m) throw new ErroRegra('motivo_obrigatorio');
    cmds = [guarda,
      db.prepare(`UPDATE pagamentos SET status = 'recusado', decidido_por = ?, decidido_em = ?, motivo = ? WHERE id = ?`).bind(sessao.adminId, agoraMs, m, p.id),
      db.prepare('DELETE FROM casas_ocupadas WHERE agendamento_id = ?').bind(p.agendamento_id),
      db.prepare(`UPDATE agendamentos SET status = 'recusado', atualizado_em = ?, versao = versao + 1 WHERE id = ?`).bind(agoraMs, p.agendamento_id)];
  } else throw new ErroRegra('decisao_invalida');
  cmds.push(historico(db, p.agendamento_id, agoraMs, sessao.adminId, `pagamento_${decisao}`, { pagamento: p.id, valor: p.valor_centavos, motivo: m }),
            ...await audit(db, sessao, agoraMs, `pagamento_${decisao}`, p.id, { agendamento: p.agendamento_id, valor: p.valor_centavos, conferido: conferido === true }));
  await lote(db, cmds);
  return { ok: true };
}

/** Pagamento feito no estúdio (dinheiro, cartão ou Pix na hora), registrado pela equipe. Nunca passa do que falta pagar. */
export async function pagamentoPresencial(db, { agendamentoId, valorCentavos, motivo, sessao, agoraMs }) {
  const a = await agendamento(db, agendamentoId);
  if (!['confirmado', 'aguardando_pix', 'concluido'].includes(a.status)) throw new ErroRegra('agendamento_sem_pagamento_presencial');
  const v = Number(valorCentavos);
  if (!Number.isInteger(v) || v <= 0) throw new ErroRegra('valor_invalido');
  const id = novoId('pg');
  await lote(db, [
    afirmar(db, `? <= (SELECT preco_centavos FROM agendamentos WHERE id = ?)
                     - (SELECT COALESCE(SUM(valor_centavos), 0) FROM pagamentos WHERE agendamento_id = ? AND status = 'confirmado')`, v, a.id, a.id),
    db.prepare(`INSERT INTO pagamentos (id, agendamento_id, tipo, valor_centavos, status, conferido, decidido_por, decidido_em, motivo, criado_em)
                VALUES (?, ?, 'estudio', ?, 'confirmado', 1, ?, ?, ?, ?)`).bind(id, a.id, v, sessao.adminId, agoraMs, txt(motivo, 120), agoraMs),
    historico(db, a.id, agoraMs, sessao.adminId, 'pagamento_presencial', { valor: v }),
    ...await audit(db, sessao, agoraMs, 'pagamento_presencial', id, { agendamento: a.id, valor: v })
  ]).catch(e => { if (e.codigo === 'condicao_mudou') throw new ErroRegra('valor_maior_que_o_devido'); throw e; });
  return { ok: true, pagamentoId: id };
}

/* ───────────── Cancelamento, presença, faltas ───────────── */
/**
 * Cancelamento (pela equipe ou ao aprovar pedido da cliente). Com valor pago, a administradora escolhe o destino:
 * reembolso, crédito ou retenção — retenção só com justificativa (sem perda automática do sinal, conforme o CDC).
 */
export async function cancelar(db, { agendamentoId, motivo, destino = 'nada', valorCentavos, justificativa, sessao, agoraMs, extras = [] }) {
  const a = await agendamento(db, agendamentoId);
  if (!ATIVOS.includes(a.status)) throw new ErroRegra('agendamento_nao_cancelavel');
  const pago = await saldoPago(db, a.id);
  const j = txt(justificativa, 500);
  if (pago > 0 && destino === 'nada') throw new ErroRegra('destino_do_valor_obrigatorio');
  if (!['nada', 'reembolso', 'credito', 'reter'].includes(destino)) throw new ErroRegra('destino_invalido');
  const v = destino === 'nada' ? 0 : Number(valorCentavos ?? pago);
  if (destino !== 'nada' && (!Number.isInteger(v) || v < 0 || v > pago)) throw new ErroRegra('valor_invalido');
  if ((destino === 'reter' || v < pago) && (!j || j.length < 10)) throw new ErroRegra('justificativa_obrigatoria');
  const cmds = [
    afirmar(db, `EXISTS (SELECT 1 FROM agendamentos WHERE id = ? AND versao = ?)`, a.id, a.versao),
    ...extras,
    db.prepare('DELETE FROM casas_ocupadas WHERE agendamento_id = ?').bind(a.id),
    db.prepare(`UPDATE agendamentos SET status = 'cancelado', atualizado_em = ?, versao = versao + 1 WHERE id = ?`).bind(agoraMs, a.id),
    db.prepare(`UPDATE pagamentos SET status = 'recusado', decidido_por = ?, decidido_em = ?, motivo = 'agendamento cancelado'
                 WHERE agendamento_id = ? AND status IN ('em_analise', 'aguardando_pix')`).bind(sessao.adminId, agoraMs, a.id)
  ];
  if (destino === 'reembolso' && v > 0)
    cmds.push(db.prepare(`INSERT INTO reembolsos (id, agendamento_id, valor_centavos, status, prazo_em, justificativa, decidido_por, decidido_em)
                          VALUES (?, ?, ?, 'pendente', ?, ?, ?, ?)`).bind(novoId('rb'), a.id, v, agoraMs + 7 * DIA, j, sessao.adminId, agoraMs));
  if (destino === 'credito' && v > 0)
    cmds.push(db.prepare(`INSERT INTO creditos (id, cliente_id, valor_centavos, origem_agendamento_id, criado_por, criado_em) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(novoId('cr'), a.cliente_id, v, a.id, sessao.adminId, agoraMs));
  cmds.push(historico(db, a.id, agoraMs, sessao.adminId, 'cancelado', { motivo: txt(motivo), destino, valor: v, justificativa: j }),
            ...await audit(db, sessao, agoraMs, 'cancelar', a.id, { destino, valor: v, pago }));
  await lote(db, cmds);
  return { ok: true, destino, valorCentavos: v };
}

/** chegou · atraso (minutos) · falta (só depois de 15 min de tolerância) · concluir (só depois do início). */
export async function presenca(db, { agendamentoId, acao, atrasoMin, sessao, agoraMs }) {
  const a = await agendamento(db, agendamentoId);
  const inicioMs = instante(a.dia, a.inicio_min);
  const cmds = [afirmar(db, `EXISTS (SELECT 1 FROM agendamentos WHERE id = ? AND versao = ?)`, a.id, a.versao)];
  if (acao === 'chegou' || acao === 'atraso') {
    if (!['confirmado', 'aguardando_pix', 'em_analise'].includes(a.status)) throw new ErroRegra('agendamento_nao_ativo');
    if (agoraMs < inicioMs - 2 * 3600e3) throw new ErroRegra('cedo_demais');
    const atraso = acao === 'atraso' ? Number(atrasoMin) : Math.max(0, Math.floor((agoraMs - inicioMs) / 60e3));
    if (!Number.isInteger(atraso) || atraso < 0 || atraso > 240) throw new ErroRegra('atraso_invalido');
    cmds.push(db.prepare(`UPDATE agendamentos SET presenca_confirmada = ?, atraso_min = ?, atualizado_em = ?, versao = versao + 1 WHERE id = ?`)
      .bind(acao === 'chegou' ? 1 : a.presenca_confirmada, atraso, agoraMs, a.id));
    cmds.push(historico(db, a.id, agoraMs, sessao.adminId, acao, { atrasoMin: atraso, dentroDaTolerancia: atraso <= TOLERANCIA_MIN }));
  } else if (acao === 'falta') {
    if (!['confirmado', 'aguardando_pix', 'em_analise'].includes(a.status)) throw new ErroRegra('agendamento_nao_ativo');
    if (agoraMs < inicioMs + TOLERANCIA_MIN * 60e3) throw new ErroRegra('ainda_na_tolerancia');
    if (a.presenca_confirmada) throw new ErroRegra('cliente_compareceu');
    cmds.push(db.prepare('DELETE FROM casas_ocupadas WHERE agendamento_id = ?').bind(a.id),
              db.prepare(`UPDATE agendamentos SET status = 'nao_compareceu', atualizado_em = ?, versao = versao + 1 WHERE id = ?`).bind(agoraMs, a.id),
              historico(db, a.id, agoraMs, sessao.adminId, 'nao_compareceu', null));
  } else if (acao === 'concluir') {
    if (a.status !== 'confirmado') throw new ErroRegra('so_confirmado_pode_concluir');
    if (agoraMs < inicioMs) throw new ErroRegra('atendimento_nao_comecou');
    cmds.push(db.prepare(`UPDATE agendamentos SET status = 'concluido', atualizado_em = ?, versao = versao + 1 WHERE id = ?`).bind(agoraMs, a.id),
              db.prepare('UPDATE clientes SET ultimo_atendimento = ? WHERE id = ?').bind(a.dia, a.cliente_id),
              historico(db, a.id, agoraMs, sessao.adminId, 'concluido', null));
  } else throw new ErroRegra('acao_invalida');
  cmds.push(...await audit(db, sessao, agoraMs, `presenca_${acao}`, a.id, acao === 'atraso' ? { atrasoMin: Number(atrasoMin) } : null));
  await lote(db, cmds);
  return { ok: true };
}

/* ───────────── Bloqueios e expediente ───────────── */
export async function criarBloqueio(db, { dia, inicio, fim, motivo, sessao, agoraMs }) {
  const i = Number(inicio), f = Number(fim);
  if (!diaOk(dia) || dia > ULTIMO_DIA) throw new ErroRegra('dia_invalido');
  if (!Number.isInteger(i) || !Number.isInteger(f) || i % PASSO_MIN || f % PASSO_MIN || i < 0 || f > 1440 || f <= i) throw new ErroRegra('periodo_invalido');
  const id = novoId('bl');
  await lote(db, [
    db.prepare('INSERT INTO bloqueios (id, dia, inicio_min, fim_min, motivo, criado_por, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, dia, i, f, txt(motivo, 120), sessao.adminId, agoraMs),
    ...casasDoBloqueio(i, f).map(m => db.prepare('INSERT INTO casas_ocupadas (dia, minuto, bloqueio_id) VALUES (?, ?, ?)').bind(dia, m, id)),
    ...await audit(db, sessao, agoraMs, 'bloqueio_criado', id, { dia, inicio: i, fim: f })
  ]);
  return { id };
}
export async function removerBloqueio(db, { id, sessao, agoraMs }) {
  const b = await db.prepare('SELECT * FROM bloqueios WHERE id = ? AND removido_em IS NULL').bind(String(id || '')).first();
  if (!b) throw new ErroRegra('bloqueio_inexistente');
  await lote(db, [
    db.prepare('DELETE FROM casas_ocupadas WHERE bloqueio_id = ?').bind(b.id),
    db.prepare('UPDATE bloqueios SET removido_em = ? WHERE id = ?').bind(agoraMs, b.id),
    ...await audit(db, sessao, agoraMs, 'bloqueio_removido', b.id)
  ]);
  return { ok: true };
}

/**
 * Novo expediente semanal a partir de uma data. periodos = { "0": [], "1": [[840, 1260]], … } (minutos, de 15 em 15).
 * Não cancela nada: devolve a lista de agendamentos ativos que ficariam fora do novo horário para a equipe decidir.
 */
export async function alterarExpediente(db, { vigenteDesde, periodos, sessao, agoraMs }) {
  const hoje = emFortaleza(agoraMs).dia;
  if (!diaOk(vigenteDesde) || vigenteDesde < hoje || vigenteDesde > ULTIMO_DIA) throw new ErroRegra('data_invalida');
  const linhas = [];
  for (let d = 0; d <= 6; d++) {
    const ps = (periodos?.[d] ?? periodos?.[String(d)] ?? []).map(([a, b]) => [Number(a), Number(b)]).sort((x, y) => x[0] - y[0]);
    ps.forEach(([a, b], k) => {
      if (!Number.isInteger(a) || !Number.isInteger(b) || a % PASSO_MIN || b % PASSO_MIN || a < 0 || b > 1440 || b <= a) throw new ErroRegra('periodo_invalido', { dia: d });
      if (k && a < ps[k - 1][1]) throw new ErroRegra('periodos_sobrepostos', { dia: d });
      linhas.push([d, a, b]);
    });
  }
  if (!linhas.length) throw new ErroRegra('expediente_vazio');
  await lote(db, [
    db.prepare('DELETE FROM expediente WHERE vigente_desde = ?').bind(vigenteDesde), // substitui uma versão futura da mesma data
    ...linhas.map(([d, a, b]) => db.prepare('INSERT INTO expediente (dia_semana, inicio_min, fim_min, vigente_desde) VALUES (?, ?, ?, ?)').bind(d, a, b, vigenteDesde)),
    ...await audit(db, sessao, agoraMs, 'expediente_alterado', vigenteDesde, { periodos: linhas })
  ]);
  const exp = await carregarExpediente(db);
  const { results } = await db.prepare(`SELECT id, codigo, dia, inicio_min, fim_min, status FROM agendamentos WHERE dia >= ? AND status IN (${ATIVOS.map(() => '?').join(',')})`)
    .bind(vigenteDesde, ...ATIVOS).all();
  const foraDoHorario = results.filter(a => !periodosDoDia(exp, a.dia).some(([i, f]) => a.inicio_min >= i && a.fim_min <= f));
  return { ok: true, foraDoHorario };
}

/* ───────────── Pedidos da cliente (solicitações) ───────────── */
export async function criarSolicitacao(db, { codigo, tipo, motivo, agoraMs, origem = 'site' }) {
  if (!['cancelamento', 'reagendamento'].includes(tipo)) throw new ErroRegra('tipo_invalido');
  const a = await db.prepare('SELECT * FROM agendamentos WHERE codigo = ?').bind(String(codigo || '').toUpperCase()).first();
  if (!a || !ATIVOS.includes(a.status)) throw new ErroRegra('agendamento_inexistente');
  const id = novoId('sl');
  await lote(db, [
    db.prepare(`INSERT INTO solicitacoes (id, tipo, agendamento_id, origem, motivo, criada_em, responder_ate, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente')`)
      .bind(id, tipo, a.id, origem, txt(motivo, 500), agoraMs, agoraMs + DIA),
    db.prepare(`INSERT INTO notificacoes (id, tipo, referencia, texto, nivel, criada_em) VALUES (?, 'solicitacao', ?, ?, 0, ?)`)
      .bind(novoId('nt'), id, `Pedido de ${tipo} · ${a.codigo}`, agoraMs),
    historico(db, a.id, agoraMs, 'cliente', `pediu_${tipo}`, { motivo: txt(motivo, 500) })
  ]);
  return { ok: true, protocolo: id };
}

/** Decide um pedido. cancelamento aprovado → cancelar (com destino do valor); reagendamento aprovado → novo horário. */
export async function decidirSolicitacao(db, { id, decisao, justificativa, novoDia, novoInicio, destino, valorCentavos, sessao, agoraMs }) {
  const s = await db.prepare(`SELECT * FROM solicitacoes WHERE id = ? AND status = 'pendente'`).bind(String(id || '')).first();
  if (!s) throw new ErroRegra('solicitacao_inexistente');
  const j = txt(justificativa, 500);
  const fechar = db.prepare(`UPDATE solicitacoes SET status = 'decidida', decisao = ?, justificativa = ?, decidida_por = ?, decidida_em = ?
                              WHERE id = ? AND status = 'pendente'`).bind(decisao, j, sessao.adminId, agoraMs, s.id);
  if (decisao === 'recusar') {
    if (!j) throw new ErroRegra('justificativa_obrigatoria');
    await lote(db, [afirmar(db, `EXISTS (SELECT 1 FROM solicitacoes WHERE id = ? AND status = 'pendente')`, s.id), fechar,
                    historico(db, s.agendamento_id, agoraMs, sessao.adminId, `pedido_${s.tipo}_recusado`, { justificativa: j }),
                    ...await audit(db, sessao, agoraMs, 'solicitacao_recusada', s.id)]);
    return { ok: true };
  }
  if (decisao !== 'aprovar') throw new ErroRegra('decisao_invalida');
  if (s.tipo === 'cancelamento')
    return cancelar(db, { agendamentoId: s.agendamento_id, motivo: 'pedido da cliente', destino: destino ?? 'nada', valorCentavos, justificativa: j,
                          sessao, agoraMs, extras: [afirmar(db, `EXISTS (SELECT 1 FROM solicitacoes WHERE id = ? AND status = 'pendente')`, s.id), fechar] });
  const r = await reagendar(db, { agendamentoId: s.agendamento_id, novoDia, novoInicio: Number(novoInicio), quem: sessao.adminId, equipe: true, agoraMs,
    extras: [afirmar(db, `EXISTS (SELECT 1 FROM solicitacoes WHERE id = ? AND status = 'pendente')`, s.id), fechar] });
  return { ok: true, ...r };
}

/** Cliente remarca sozinha se faltam 24 h ou mais para o horário atual (e o novo também respeita 24 h). Senão: pedido. */
export async function reagendarPelaCliente(db, { codigo, novoDia, novoInicio, agoraMs }) {
  const a = await db.prepare('SELECT * FROM agendamentos WHERE codigo = ?').bind(String(codigo || '').toUpperCase()).first();
  if (!a || !['confirmado', 'em_analise', 'aguardando_pix'].includes(a.status)) throw new ErroRegra('agendamento_nao_reagendavel');
  if (instante(a.dia, a.inicio_min) - agoraMs < 24 * 3600e3) throw new ErroRegra('menos_de_24h_faca_um_pedido');
  return reagendar(db, { agendamentoId: a.id, novoDia, novoInicio: Number(novoInicio), quem: 'cliente', equipe: false, agoraMs });
}

/* ───────────── Reembolsos, créditos, avisos ───────────── */
export async function concluirReembolso(db, { id, sessao, agoraMs }) {
  const r = await db.prepare(`SELECT * FROM reembolsos WHERE id = ? AND status = 'pendente'`).bind(String(id || '')).first();
  if (!r) throw new ErroRegra('reembolso_inexistente');
  await lote(db, [
    afirmar(db, `EXISTS (SELECT 1 FROM reembolsos WHERE id = ? AND status = 'pendente')`, r.id),
    db.prepare(`UPDATE reembolsos SET status = 'concluido', concluido_por = ?, concluido_em = ? WHERE id = ?`).bind(sessao.adminId, agoraMs, r.id),
    historico(db, r.agendamento_id, agoraMs, sessao.adminId, 'reembolso_concluido', { valor: r.valor_centavos }),
    ...await audit(db, sessao, agoraMs, 'reembolso_concluido', r.id, { valor: r.valor_centavos })
  ]);
  return { ok: true };
}

/** Usa um crédito da cliente como pagamento confirmado de um agendamento dela (sem passar do que falta pagar). */
export async function usarCredito(db, { creditoId, agendamentoId, sessao, agoraMs }) {
  const c = await db.prepare('SELECT * FROM creditos WHERE id = ? AND usado_em IS NULL').bind(String(creditoId || '')).first();
  if (!c) throw new ErroRegra('credito_inexistente');
  const a = await agendamento(db, agendamentoId);
  if (a.cliente_id !== c.cliente_id) throw new ErroRegra('credito_de_outra_cliente');
  if (!ATIVOS.includes(a.status)) throw new ErroRegra('agendamento_nao_ativo');
  const pg = novoId('pg');
  await lote(db, [
    afirmar(db, `EXISTS (SELECT 1 FROM creditos WHERE id = ? AND usado_em IS NULL)`, c.id),
    afirmar(db, `? <= (SELECT preco_centavos FROM agendamentos WHERE id = ?)
                     - (SELECT COALESCE(SUM(valor_centavos), 0) FROM pagamentos WHERE agendamento_id = ? AND status = 'confirmado')`, c.valor_centavos, a.id, a.id),
    db.prepare('UPDATE creditos SET usado_em = ?, usado_em_agendamento_id = ? WHERE id = ?').bind(agoraMs, a.id, c.id),
    db.prepare(`INSERT INTO pagamentos (id, agendamento_id, tipo, valor_centavos, status, conferido, decidido_por, decidido_em, motivo, criado_em)
                VALUES (?, ?, 'estudio', ?, 'confirmado', 1, ?, ?, 'crédito da cliente', ?)`).bind(pg, a.id, c.valor_centavos, sessao.adminId, agoraMs, agoraMs),
    db.prepare(`UPDATE agendamentos SET status = 'confirmado', atualizado_em = ?, versao = versao + 1 WHERE id = ? AND status IN ('aguardando_pix', 'em_analise')`).bind(agoraMs, a.id),
    historico(db, a.id, agoraMs, sessao.adminId, 'credito_usado', { credito: c.id, valor: c.valor_centavos }),
    ...await audit(db, sessao, agoraMs, 'credito_usado', c.id, { agendamento: a.id })
  ]).catch(e => { if (e.codigo === 'condicao_mudou') throw new ErroRegra('credito_maior_que_o_devido_ou_ja_usado'); throw e; });
  return { ok: true };
}

export async function marcarAvisosLidos(db, { ids, sessao, agoraMs }) {
  const lista = (Array.isArray(ids) ? ids : []).slice(0, 40).map(String);
  if (!lista.length) return { ok: true, marcados: 0 };
  await db.batch(lista.map(i => db.prepare(`INSERT OR IGNORE INTO notificacoes_lidas (notificacao_id, admin_id, lida_em)
                                             SELECT id, ?, ? FROM notificacoes WHERE id = ?`).bind(sessao.adminId, agoraMs, i)));
  return { ok: true, marcados: lista.length };
}

/* ───────────── Acompanhamento público (pelo código) ───────────── */
const STATUS_PUBLICO = { aguardando_comprovante: 'aguardando_comprovante', em_analise: 'pagamento_em_analise', aguardando_pix: 'aguardando_pagamento',
  confirmado: 'confirmado', recusado: 'nao_confirmado', expirado: 'expirado', cancelado: 'cancelado', concluido: 'concluido', nao_compareceu: 'nao_compareceu' };
/** Só o necessário para a cliente: nada de nome, telefone ou dados de outras pessoas. */
export async function acompanhar(db, { codigo, agoraMs }) {
  await expirarReservas(db, agoraMs);
  const a = await db.prepare(`SELECT a.*, s.nome servico_nome FROM agendamentos a JOIN servicos s ON s.id = a.servico_id WHERE a.codigo = ?`)
    .bind(String(codigo || '').toUpperCase().trim()).first();
  if (!a) throw new ErroRegra('agendamento_inexistente');
  const pago = (await db.prepare(`SELECT COALESCE(SUM(valor_centavos), 0) v FROM pagamentos WHERE agendamento_id = ? AND status = 'confirmado'`).bind(a.id).first()).v;
  const pend = await db.prepare(`SELECT id FROM solicitacoes WHERE agendamento_id = ? AND status = 'pendente'`).bind(a.id).first();
  const devido = a.forma_pagamento === 'sinal' ? sinal30(a.preco_centavos) : a.forma_pagamento === 'integral' ? a.preco_centavos : 0;
  return {
    codigo: a.codigo, servico: a.servico_nome, servicoId: a.servico_id, dia: a.dia, inicio: a.inicio_min, fim: a.fim_min,
    status: STATUS_PUBLICO[a.status] || a.status, formaPagamento: a.forma_pagamento,
    precoCentavos: a.preco_centavos, pixCentavos: devido, pagoCentavos: pago, restanteCentavos: Math.max(0, a.preco_centavos - pago),
    prazoVisivelEm: a.status === 'aguardando_comprovante' ? a.prazo_visivel_em : null,
    podeRemarcarSozinha: ['confirmado', 'em_analise', 'aguardando_pix'].includes(a.status) && instante(a.dia, a.inicio_min) - agoraMs >= 24 * 3600e3,
    pedidoPendente: !!pend
  };
}
