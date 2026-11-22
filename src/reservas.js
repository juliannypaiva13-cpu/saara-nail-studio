// Reservas, comprovantes, reagendamento e expiração. Toda escrita é um lote atômico.
import { validarInicio, horariosLivres, casasDoAtendimento, emFortaleza, instante, alertaPagamento,
         PRAZO_VISIVEL_MS, PRAZO_FINAL_MS, MARGEM_PROCESSAMENTO_MS, ErroRegra } from './regras.js';
import { afirmar, lote, ErroBanco } from './db.js';
import { novoId, codigoAgendamento } from './util.js';
import { comandoAuditoria } from './auditoria.js';

export const ATIVOS = ['aguardando_comprovante', 'em_analise', 'aguardando_pix', 'confirmado'];

export async function carregarExpediente(db) {
  return (await db.prepare('SELECT dia_semana, inicio_min, fim_min, vigente_desde FROM expediente').all()).results;
}
async function servico(db, id) {
  const s = await db.prepare('SELECT * FROM servicos WHERE id = ? AND ativo = 1').bind(id).first();
  if (!s) throw new ErroRegra('servico_invalido');
  return s;
}
async function casasOcupadas(db, dia) {
  const { results } = await db.prepare('SELECT minuto FROM casas_ocupadas WHERE dia = ?').bind(dia).all();
  return new Set(results.map(r => r.minuto));
}
const inserirCasa = (db, dia, minuto, agendamentoId) =>
  db.prepare('INSERT INTO casas_ocupadas (dia, minuto, agendamento_id) VALUES (?, ?, ?)').bind(dia, minuto, agendamentoId);
const historico = (db, agendamentoId, quando, quem, acao, detalhes) =>
  db.prepare('INSERT INTO historico_agendamento (agendamento_id, quando, quem, acao, detalhes) VALUES (?, ?, ?, ?, ?)')
    .bind(agendamentoId, quando, quem, acao, detalhes == null ? null : JSON.stringify(detalhes));

/** Horários livres (a lista que o site mostra). Expira reservas vencidas antes de responder. */
export async function horariosDoDia(db, { servicoId, dia, agoraMs, equipe = false }) {
  await expirarReservas(db, agoraMs);
  const s = await servico(db, servicoId);
  return horariosLivres({ expediente: await carregarExpediente(db), dia, duracao: s.duracao_min,
                          ocupadas: await casasOcupadas(db, dia), agoraMs, equipe });
}

/**
 * Reserva provisória feita pela cliente no site: bloqueia o horário por 17 min (a cliente vê 15).
 * Se outra pessoa pegou alguma casa antes, a chave única derruba o lote e nada é gravado.
 */
export async function criarReservaSite(db, { servicoId, dia, inicio, cliente, formaPagamento, agoraMs }) {
  if (!['sinal', 'integral'].includes(formaPagamento)) throw new ErroRegra('forma_pagamento_invalida');
  await expirarReservas(db, agoraMs);
  const s = await servico(db, servicoId);
  const { fim } = validarInicio({ expediente: await carregarExpediente(db), dia, inicio, duracao: s.duracao_min, agoraMs });
  const id = novoId('ag'), codigo = codigoAgendamento(), clienteId = novoId('cl');
  const cmds = [
    db.prepare('INSERT INTO clientes (id, nome, whatsapp, criada_em) VALUES (?, ?, ?, ?)')
      .bind(clienteId, cliente?.nome ?? null, cliente?.whatsapp ?? null, agoraMs),
    db.prepare(`INSERT INTO agendamentos (id, codigo, cliente_id, servico_id, preco_centavos, dia, inicio_min, fim_min, status,
                origem, forma_pagamento, prazo_visivel_em, prazo_final_em, criado_em, atualizado_em)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aguardando_comprovante', 'site', ?, ?, ?, ?, ?)`)
      .bind(id, codigo, clienteId, s.id, s.preco_centavos, dia, inicio, fim, formaPagamento,
            agoraMs + PRAZO_VISIVEL_MS, agoraMs + PRAZO_FINAL_MS, agoraMs, agoraMs),
    ...casasDoAtendimento(inicio, fim).map(m => inserirCasa(db, dia, m, id)),
    historico(db, id, agoraMs, 'cliente', 'reserva_provisoria', { dia, inicio, fim, forma: formaPagamento })
  ];
  await lote(db, cmds);
  return { id, codigo, prazoVisivelEm: agoraMs + PRAZO_VISIVEL_MS, prazoFinalEm: agoraMs + PRAZO_FINAL_MS };
}

/**
 * Libera reservas cujo prazo final (17 min) + margem de processamento passou sem comprovante. Um único lote, com a mesma condição em
 * cada comando: se um comprovante chegar ao mesmo tempo, ou ele entra antes (e a reserva não expira) ou
 * a reserva expira antes (e o comprovante é recusado). Nunca os dois.
 */
export async function expirarReservas(db, agoraMs) {
  const cond = `status = 'aguardando_comprovante' AND prazo_final_em + ${MARGEM_PROCESSAMENTO_MS} < ?`;
  const r = await lote(db, [
    db.prepare(`DELETE FROM casas_ocupadas WHERE agendamento_id IN (SELECT id FROM agendamentos WHERE ${cond})`).bind(agoraMs),
    db.prepare(`INSERT INTO historico_agendamento (agendamento_id, quando, quem, acao)
                SELECT id, ?, 'sistema', 'expirada_sem_comprovante' FROM agendamentos WHERE ${cond}`).bind(agoraMs, agoraMs),
    db.prepare(`UPDATE agendamentos SET status = 'expirado', atualizado_em = ?, versao = versao + 1 WHERE ${cond}`).bind(agoraMs, agoraMs)
  ]);
  return r[2].meta.changes;
}

/**
 * Registra o comprovante já guardado no R2 privado. recebidoEmMs vem do próprio R2 (hora do servidor),
 * nunca do navegador. Aceito até o prazo final de 17 min; depois disso é recusado e nada muda.
 * O pagamento entra "em análise" e o horário continua bloqueado até decisão de Saara ou Julianny.
 */
export async function registrarComprovante(db, { agendamentoId, objeto, etag, tipo, tamanho, recebidoEmMs, agoraMs }) {
  const ag = await db.prepare('SELECT * FROM agendamentos WHERE id = ?').bind(agendamentoId).first();
  if (!ag) throw new ErroRegra('agendamento_inexistente');
  const valor = ag.forma_pagamento === 'sinal' ? Math.round(ag.preco_centavos * 0.3) : ag.preco_centavos;
  const compId = novoId('cp'), pagId = novoId('pg');
  try {
    await lote(db, [
      afirmar(db, `EXISTS (SELECT 1 FROM agendamentos WHERE id = ? AND status = 'aguardando_comprovante' AND prazo_final_em >= ?)`,
              agendamentoId, recebidoEmMs),
      db.prepare('INSERT INTO comprovantes (id, agendamento_id, objeto, etag, tipo, tamanho, recebido_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(compId, agendamentoId, objeto, etag, tipo, tamanho, recebidoEmMs),
      db.prepare(`INSERT INTO pagamentos (id, agendamento_id, tipo, valor_centavos, status, comprovante_id, criado_em)
                  VALUES (?, ?, ?, ?, 'em_analise', ?, ?)`).bind(pagId, agendamentoId, ag.forma_pagamento, valor, compId, recebidoEmMs),
      db.prepare(`UPDATE agendamentos SET status = 'em_analise', atualizado_em = ?, versao = versao + 1 WHERE id = ?`).bind(agoraMs, agendamentoId),
      historico(db, agendamentoId, agoraMs, 'cliente', 'comprovante_recebido', { pagamento: pagId, tamanho, tipo })
    ]);
  } catch (e) {
    if (e instanceof ErroBanco && e.codigo === 'condicao_mudou') throw new ErroRegra('prazo_encerrado');
    throw e;
  }
  return { pagamentoId: pagId, comprovanteId: compId, status: 'em_analise' };
}

/**
 * Reagendamento atômico: libera as casas antigas, ocupa as novas, muda o agendamento e grava o histórico
 * num único lote. Se o novo horário estiver ocupado (ou o agendamento tiver mudado), nada muda.
 */
export async function reagendar(db, { agendamentoId, novoDia, novoInicio, quem, equipe, agoraMs }) {
  const ag = await db.prepare('SELECT * FROM agendamentos WHERE id = ?').bind(agendamentoId).first();
  if (!ag || !ATIVOS.includes(ag.status)) throw new ErroRegra('agendamento_nao_reagendavel');
  const s = await servico(db, ag.servico_id);
  const { fim } = validarInicio({ expediente: await carregarExpediente(db), dia: novoDia, inicio: novoInicio,
                                  duracao: s.duracao_min, agoraMs, equipe });
  const cmds = [
    afirmar(db, `EXISTS (SELECT 1 FROM agendamentos WHERE id = ? AND versao = ?)`, agendamentoId, ag.versao),
    db.prepare('DELETE FROM casas_ocupadas WHERE agendamento_id = ?').bind(agendamentoId),
    ...casasDoAtendimento(novoInicio, fim).map(m => inserirCasa(db, novoDia, m, agendamentoId)),
    db.prepare(`UPDATE agendamentos SET dia = ?, inicio_min = ?, fim_min = ?, presenca_confirmada = 0, atraso_min = NULL,
                atualizado_em = ?, versao = versao + 1 WHERE id = ?`).bind(novoDia, novoInicio, fim, agoraMs, agendamentoId),
    historico(db, agendamentoId, agoraMs, quem, 'reagendado',
              { de: { dia: ag.dia, inicio: ag.inicio_min }, para: { dia: novoDia, inicio: novoInicio } })
  ];
  if (equipe) cmds.push(...await comandoAuditoria(db, { quando: agoraMs, adminId: quem, acao: 'reagendar', entidade: agendamentoId,
                                                         dados: { de: [ag.dia, ag.inicio_min], para: [novoDia, novoInicio] } }));
  await lote(db, cmds);
  return { dia: novoDia, inicio: novoInicio, fim };
}

/**
 * Rotina dos alertas de pagamento em análise (30 min, 2 h, 12 h). Cria um aviso interno por nível,
 * no máximo uma vez (a chave única de notificacoes impede repetição). Nunca libera horário.
 */
export async function processarAlertasPagamento(db, agoraMs) {
  const { results } = await db.prepare(
    `SELECT p.id, p.criado_em, p.alerta_nivel, a.dia, a.inicio_min, a.codigo
       FROM pagamentos p JOIN agendamentos a ON a.id = p.agendamento_id
      WHERE p.status = 'em_analise'`).all();
  const textos = { 1: 'Pagamento em análise há mais de 30 minutos', 2: 'Pagamento em análise há mais de 2 horas',
                   3: 'Pendência antiga: pagamento em análise há mais de 12 horas — decidir' };
  let criados = 0;
  for (const p of results) {
    const al = alertaPagamento({ recebidoMs: p.criado_em, atendimentoMs: instante(p.dia, p.inicio_min), agoraMs });
    if (al.nivel <= p.alerta_nivel) continue;
    const cmds = [];
    for (let n = p.alerta_nivel + 1; n <= al.nivel; n++) {
      cmds.push(db.prepare(`INSERT OR IGNORE INTO notificacoes (id, tipo, referencia, texto, nivel, criada_em)
                            VALUES (?, 'pagamento_em_analise', ?, ?, ?, ?)`)
        .bind(novoId('nt'), p.id, `${textos[n]} · ${p.codigo}${al.proximo ? ' · atendimento em menos de 24 h' : ''}`, n, agoraMs));
    }
    cmds.push(db.prepare('UPDATE pagamentos SET alerta_nivel = ? WHERE id = ? AND alerta_nivel < ?').bind(al.nivel, p.id, al.nivel));
    await lote(db, cmds);
    criados += al.nivel - p.alerta_nivel;
  }
  return criados;
}

export { emFortaleza };
