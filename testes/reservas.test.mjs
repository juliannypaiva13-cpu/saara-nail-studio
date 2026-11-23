import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bancoDeTeste } from './d1-local.mjs';
import * as R from '../src/reservas.js';
import { instante } from '../src/regras.js';

const MIN = 60e3, H = 3600e3;
const AGORA = Date.UTC(2026, 10, 22, 15, 0);      // domingo 22/11/2026, 12h em Fortaleza
const TER = '2026-11-24';                           // terça: 14h–21h
const cliente = i => ({ nome: `Teste ${i}`, whatsapp: '99900000000' });
const casasDe = async (db, id) => (await db.prepare('SELECT COUNT(*) n FROM casas_ocupadas WHERE agendamento_id = ?').bind(id).first()).n;
const statusDe = async (db, id) => (await db.prepare('SELECT status FROM agendamentos WHERE id = ?').bind(id).first()).status;
const comprovante = (id, recebidoEmMs, etag = 'e1') =>
  ({ agendamentoId: id, objeto: `comprovantes/${id}/${etag}`, etag, tipo: 'image/jpeg', tamanho: 900000, recebidoEmMs, agoraMs: recebidoEmMs });

test('teste 1 · 50 reservas simultâneas no mesmo horário: exatamente 1 grava', async () => {
  const db = bancoDeTeste();
  const pedidos = Array.from({ length: 50 }, (_, i) =>
    R.criarReservaSite(db, { servicoId: 'f1', dia: TER, inicio: 14 * 60, cliente: cliente(i), formaPagamento: 'sinal', agoraMs: AGORA }));
  const r = await Promise.allSettled(pedidos);
  const ok = r.filter(x => x.status === 'fulfilled');
  const ocupado = r.filter(x => x.status === 'rejected' && x.reason.codigo === 'horario_ocupado');
  assert.equal(ok.length, 1);
  assert.equal(ocupado.length, 49);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM agendamentos').first()).n, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM clientes').first()).n, 1, 'lote desfeito não deixa cliente solto');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM casas_ocupadas').first()).n, 11); // 2h30 + 15 min = 11 casas
});

test('teste 1b · 50 pedidos sobrepostos em horários diferentes: nenhum par de atendimentos se sobrepõe', async () => {
  const db = bancoDeTeste();
  const inicios = Array.from({ length: 50 }, (_, i) => 14 * 60 + (i % 19) * 15);
  await Promise.allSettled(inicios.map((t, i) =>
    R.criarReservaSite(db, { servicoId: i % 2 ? 'manicure' : 'f1', dia: TER, inicio: t, cliente: cliente(i), formaPagamento: 'integral', agoraMs: AGORA })));
  const { results } = await db.prepare('SELECT inicio_min, fim_min FROM agendamentos ORDER BY inicio_min').all();
  assert.ok(results.length >= 2);
  for (let i = 1; i < results.length; i++) assert.ok(results[i].inicio_min >= results[i - 1].fim_min + 15, 'respeita 15 min de intervalo');
});

test('antecedência de 24 h para o site e expediente', async () => {
  const db = bancoDeTeste();
  await assert.rejects(R.criarReservaSite(db, { servicoId: 'f1', dia: '2026-11-23', inicio: 14 * 60 - 15 * 0 - 120, cliente: cliente(1), formaPagamento: 'sinal', agoraMs: AGORA }),
                       e => e.codigo === 'fora_do_expediente');
  await assert.rejects(R.criarReservaSite(db, { servicoId: 'f1', dia: '2026-11-23', inicio: 14 * 60, cliente: cliente(1), formaPagamento: 'sinal', agoraMs: AGORA + 4 * H }),
                       e => e.codigo === 'antecedencia_minima');
  await assert.rejects(R.criarReservaSite(db, { servicoId: 'f1', dia: '2026-11-28', inicio: 9 * 60 + 45, cliente: cliente(1), formaPagamento: 'sinal', agoraMs: AGORA }),
                       e => e.codigo === 'fora_do_expediente', 'sábado F1 não pode começar 9h45 (passaria das 12h)');
  await assert.rejects(R.criarReservaSite(db, { servicoId: 'f1', dia: '2028-01-04', inicio: 14 * 60, cliente: cliente(1), formaPagamento: 'sinal', agoraMs: AGORA }),
                       e => e.codigo === 'fora_do_calendario');
});

test('prazo de 17 min: horário bloqueado durante a tolerância; comprovante aos 16:59 aceito', async () => {
  const db = bancoDeTeste();
  const r = await R.criarReservaSite(db, { servicoId: 'f1', dia: TER, inicio: 15 * 60, cliente: cliente(1), formaPagamento: 'sinal', agoraMs: AGORA });
  assert.equal(r.prazoVisivelEm - AGORA, 15 * MIN);
  assert.equal(r.prazoFinalEm - AGORA, 17 * MIN);
  // aos 16 min (já passou o visível): continua bloqueado para outra cliente
  const livres16 = await R.horariosDoDia(db, { servicoId: 'f1', dia: TER, agoraMs: AGORA + 16 * MIN });
  assert.ok(!livres16.includes(15 * 60));
  await assert.rejects(R.criarReservaSite(db, { servicoId: 'f1', dia: TER, inicio: 15 * 60, cliente: cliente(2), formaPagamento: 'sinal', agoraMs: AGORA + 16 * MIN }),
                       e => e.codigo === 'horario_ocupado');
  const c = await R.registrarComprovante(db, comprovante(r.id, AGORA + 17 * MIN - 1000));
  assert.equal(c.status, 'em_analise');
  // depois do envio, o horário continua bloqueado mesmo horas depois (até decisão)
  await R.expirarReservas(db, AGORA + 30 * H);
  assert.equal(await statusDe(db, r.id), 'em_analise');
  assert.equal(await casasDe(db, r.id), 11);
  const pag = await db.prepare('SELECT valor_centavos, status FROM pagamentos WHERE agendamento_id = ?').bind(r.id).first();
  assert.deepEqual({ ...pag }, { valor_centavos: 3000, status: 'em_analise' }); // 30% de R$ 100
});

test('prazo de 17 min: comprovante que chegou aos 17:01 é recusado e nada muda', async () => {
  const db = bancoDeTeste();
  const r = await R.criarReservaSite(db, { servicoId: 'postica', dia: TER, inicio: 16 * 60, cliente: cliente(1), formaPagamento: 'integral', agoraMs: AGORA });
  await assert.rejects(R.registrarComprovante(db, comprovante(r.id, AGORA + 17 * MIN + 1000)), e => e.codigo === 'prazo_encerrado');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM comprovantes').first()).n, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM pagamentos').first()).n, 0);
  assert.equal(await statusDe(db, r.id), 'aguardando_comprovante');
});

test('liberação automática só depois de 17 min + margem de 3 min (envio autorizado em andamento)', async () => {
  const db = bancoDeTeste();
  const r = await R.criarReservaSite(db, { servicoId: 'postica', dia: TER, inicio: 16 * 60, cliente: cliente(1), formaPagamento: 'integral', agoraMs: AGORA });
  assert.equal(await R.expirarReservas(db, AGORA + 17 * MIN + 1000), 0);
  assert.equal(await R.expirarReservas(db, AGORA + 20 * MIN), 0, 'exatamente aos 20:00 ainda não');
  assert.equal(await casasDe(db, r.id), 9);
  assert.equal(await R.expirarReservas(db, AGORA + 20 * MIN + 1), 1);
  assert.equal(await statusDe(db, r.id), 'expirado');
  assert.equal(await casasDe(db, r.id), 0);
  const livres = await R.horariosDoDia(db, { servicoId: 'postica', dia: TER, agoraMs: AGORA + 21 * MIN });
  assert.ok(livres.includes(16 * 60));
  const hist = (await db.prepare('SELECT acao FROM historico_agendamento WHERE agendamento_id = ? ORDER BY id').bind(r.id).all()).results.map(x => x.acao);
  assert.deepEqual(hist, ['reserva_provisoria', 'expirada_sem_comprovante']);
});

test('comprovante enviado no prazo e registrado logo depois dos 17 min: não perde o horário', async () => {
  const db = bancoDeTeste();
  const r = await R.criarReservaSite(db, { servicoId: 'manicure', dia: TER, inicio: 14 * 60, cliente: cliente(1), formaPagamento: 'sinal', agoraMs: AGORA });
  const chegou = AGORA + 17 * MIN - 500;
  await R.expirarReservas(db, AGORA + 17 * MIN + 30e3);
  await R.registrarComprovante(db, { ...comprovante(r.id, chegou), agoraMs: AGORA + 17 * MIN + 40e3 });
  assert.equal(await statusDe(db, r.id), 'em_analise');
  assert.equal(await casasDe(db, r.id), 9);
});

test('comprovante e expiração ao mesmo tempo: sempre um ou outro, nunca os dois (as duas ordens acontecem)', async () => {
  const vistos = new Set();
  for (let rodada = 0; rodada < 60; rodada++) {
    const db = bancoDeTeste();
    const r = await R.criarReservaSite(db, { servicoId: 'manicure', dia: TER, inicio: 14 * 60, cliente: cliente(1), formaPagamento: 'sinal', agoraMs: AGORA });
    const t = AGORA + 17 * MIN, tExp = AGORA + 20 * MIN + 1;
    const env = () => R.registrarComprovante(db, { ...comprovante(r.id, t), agoraMs: tExp });
    const espera = n => new Promise(r => { const f = k => (k ? setImmediate(() => f(k - 1)) : r()); f(n); });
    const exp = async () => { await espera(rodada % 4); return R.expirarReservas(db, tExp); }; // varia quem chega primeiro
    await Promise.allSettled([env(), exp()]);
    const st = await statusDe(db, r.id), casas = await casasDe(db, r.id);
    const comp = (await db.prepare('SELECT COUNT(*) n FROM comprovantes').first()).n;
    vistos.add(st);
    if (st === 'em_analise') { assert.equal(casas, 9); assert.equal(comp, 1); }
    else { assert.equal(st, 'expirado'); assert.equal(casas, 0); assert.equal(comp, 0); }
  }
  assert.deepEqual([...vistos].sort(), ['em_analise', 'expirado'], 'as duas ordens foram exercitadas');
});

test('segundo comprovante para a mesma reserva é recusado', async () => {
  const db = bancoDeTeste();
  const r = await R.criarReservaSite(db, { servicoId: 'f1', dia: TER, inicio: 14 * 60, cliente: cliente(1), formaPagamento: 'sinal', agoraMs: AGORA });
  await R.registrarComprovante(db, comprovante(r.id, AGORA + MIN));
  await assert.rejects(R.registrarComprovante(db, { ...comprovante(r.id, AGORA + 2 * MIN), objeto: 'outro' }), e => e.codigo === 'prazo_encerrado' || e.codigo === 'comprovante_repetido');
});

test('reagendamento atômico: conflito mantém o horário antigo intacto', async () => {
  const db = bancoDeTeste();
  const a = await R.criarReservaSite(db, { servicoId: 'f1', dia: TER, inicio: 14 * 60, cliente: cliente(1), formaPagamento: 'sinal', agoraMs: AGORA });
  const b = await R.criarReservaSite(db, { servicoId: 'f1', dia: TER, inicio: 17 * 60, cliente: cliente(2), formaPagamento: 'sinal', agoraMs: AGORA });
  await assert.rejects(R.reagendar(db, { agendamentoId: a.id, novoDia: TER, novoInicio: 17 * 60 + 30, quem: 'saara', equipe: true, agoraMs: AGORA }),
                       e => e.codigo === 'horario_ocupado');
  const ag = await db.prepare('SELECT dia, inicio_min, versao FROM agendamentos WHERE id = ?').bind(a.id).first();
  assert.deepEqual({ ...ag }, { dia: TER, inicio_min: 14 * 60, versao: 1 });
  assert.equal(await casasDe(db, a.id), 11);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM auditoria').first()).n, 0, 'auditoria desfeita junto');
  // sucesso: casas antigas liberadas, novas ocupadas, histórico e auditoria gravados
  await R.reagendar(db, { agendamentoId: a.id, novoDia: '2026-11-25', novoInicio: 14 * 60, quem: 'saara', equipe: true, agoraMs: AGORA });
  assert.equal((await db.prepare(`SELECT COUNT(*) n FROM casas_ocupadas WHERE agendamento_id = ? AND dia = ?`).bind(a.id, TER).first()).n, 0);
  assert.equal((await db.prepare(`SELECT COUNT(*) n FROM casas_ocupadas WHERE agendamento_id = ? AND dia = '2026-11-25'`).bind(a.id).first()).n, 11);
  assert.equal((await db.prepare(`SELECT COUNT(*) n FROM historico_agendamento WHERE agendamento_id = ? AND acao = 'reagendado'`).bind(a.id).first()).n, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM auditoria').first()).n, 1);
  assert.ok(b.id);
});

test('dois reagendamentos simultâneos do mesmo agendamento: só um vale', async () => {
  const db = bancoDeTeste();
  const a = await R.criarReservaSite(db, { servicoId: 'manicure', dia: TER, inicio: 14 * 60, cliente: cliente(1), formaPagamento: 'sinal', agoraMs: AGORA });
  const r = await Promise.allSettled([
    R.reagendar(db, { agendamentoId: a.id, novoDia: '2026-11-25', novoInicio: 14 * 60, quem: 'saara', equipe: true, agoraMs: AGORA }),
    R.reagendar(db, { agendamentoId: a.id, novoDia: '2026-11-27', novoInicio: 15 * 60, quem: 'julianny', equipe: true, agoraMs: AGORA })
  ]);
  assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(await casasDe(db, a.id), 9, 'nunca fica com casas em dois dias');
});

test('alertas de pagamento em análise: 30 min, 2 h e 12 h, um aviso por nível, horário nunca liberado', async () => {
  const db = bancoDeTeste();
  const r = await R.criarReservaSite(db, { servicoId: 'f1', dia: TER, inicio: 14 * 60, cliente: cliente(1), formaPagamento: 'sinal', agoraMs: AGORA });
  await R.registrarComprovante(db, comprovante(r.id, AGORA + 5 * MIN));
  const base = AGORA + 5 * MIN;
  const avisos = async () => (await db.prepare(`SELECT nivel FROM notificacoes WHERE tipo = 'pagamento_em_analise' ORDER BY nivel`).all()).results.map(x => x.nivel);
  assert.equal(await R.processarAlertasPagamento(db, base + 29 * MIN), 0);
  assert.deepEqual(await avisos(), []);
  await R.processarAlertasPagamento(db, base + 30 * MIN);
  await R.processarAlertasPagamento(db, base + 31 * MIN); // rodar de novo não repete
  assert.deepEqual(await avisos(), [1]);
  await R.processarAlertasPagamento(db, base + 2 * H);
  assert.deepEqual(await avisos(), [1, 2]);
  await R.processarAlertasPagamento(db, base + 12 * H);
  await R.processarAlertasPagamento(db, base + 20 * H);
  assert.deepEqual(await avisos(), [1, 2, 3]);
  assert.equal(await statusDe(db, r.id), 'em_analise');
  assert.equal(await casasDe(db, r.id), 11);
  const txt = (await db.prepare(`SELECT texto FROM notificacoes WHERE nivel = 3`).first()).texto;
  assert.match(txt, /Pendência antiga/);
});

test('cron atrasado (pulou de 0 para 13 h): cria os três avisos de uma vez, sem repetir', async () => {
  const db = bancoDeTeste();
  const r = await R.criarReservaSite(db, { servicoId: 'f1', dia: TER, inicio: 14 * 60, cliente: cliente(1), formaPagamento: 'sinal', agoraMs: AGORA });
  await R.registrarComprovante(db, comprovante(r.id, AGORA));
  assert.equal(await R.processarAlertasPagamento(db, AGORA + 13 * H), 3);
  assert.equal(await R.processarAlertasPagamento(db, AGORA + 14 * H), 0);
});

test('destaque: pagamento em análise com atendimento em menos de 24 h', async () => {
  const { alertaPagamento, ordenarPendencias } = await import('../src/regras.js');
  const atend = instante(TER, 14 * 60);
  const a = alertaPagamento({ recebidoMs: atend - 30 * H, atendimentoMs: atend, agoraMs: atend - 20 * H });
  const b = alertaPagamento({ recebidoMs: atend - 30 * H, atendimentoMs: atend, agoraMs: atend - 2 * H });
  assert.deepEqual([a.nivel, a.proximo, a.urgente], [2, true, false]);
  assert.deepEqual([b.nivel, b.proximo, b.urgente], [3, true, true]);
  const fila = ordenarPendencias([
    { id: 'longe', atendimentoMs: atend + 5 * 24 * H, alerta: { urgente: false, proximo: false, esperaMin: 900 } },
    { id: 'urgente', atendimentoMs: atend, alerta: { urgente: true, proximo: true, esperaMin: 40 } },
    { id: 'amanha', atendimentoMs: atend + 20 * H, alerta: { urgente: false, proximo: true, esperaMin: 60 } }
  ]);
  assert.deepEqual(fila.map(x => x.id), ['urgente', 'amanha', 'longe']);
});

test('histórico e auditoria não aceitam alteração nem exclusão', async () => {
  const db = bancoDeTeste();
  const r = await R.criarReservaSite(db, { servicoId: 'f1', dia: TER, inicio: 14 * 60, cliente: cliente(1), formaPagamento: 'sinal', agoraMs: AGORA });
  await assert.rejects(db.prepare(`UPDATE historico_agendamento SET acao = 'x' WHERE agendamento_id = ?`).bind(r.id).run(), /somente_inclusao/);
  await assert.rejects(db.prepare(`DELETE FROM historico_agendamento`).run(), /somente_inclusao/);
});

test('pagamento confirmado exige conferência e decisão registrada; nunca dois confirmados do mesmo tipo', async () => {
  const db = bancoDeTeste();
  const r = await R.criarReservaSite(db, { servicoId: 'f1', dia: TER, inicio: 14 * 60, cliente: cliente(1), formaPagamento: 'sinal', agoraMs: AGORA });
  const c = await R.registrarComprovante(db, comprovante(r.id, AGORA + MIN));
  await assert.rejects(db.prepare(`UPDATE pagamentos SET status = 'confirmado' WHERE id = ?`).bind(c.pagamentoId).run(), /CHECK constraint/);
  await db.prepare(`UPDATE pagamentos SET status = 'confirmado', conferido = 1, decidido_por = 'saara', decidido_em = ? WHERE id = ?`).bind(AGORA, c.pagamentoId).run();
  await assert.rejects(db.prepare(`INSERT INTO pagamentos (id, agendamento_id, tipo, valor_centavos, status, conferido, decidido_por, decidido_em, criado_em)
                                   VALUES ('dup', ?, 'sinal', 3000, 'confirmado', 1, 'julianny', ?, ?)`).bind(r.id, AGORA, AGORA).run(), /UNIQUE/);
  await assert.rejects(db.prepare(`INSERT INTO reembolsos (id, agendamento_id, valor_centavos, status, decidido_por, decidido_em)
                                   VALUES ('rb', ?, 3001, 'pendente', 'saara', ?)`).bind(r.id, AGORA).run(), /reembolso_maior_que_pago/);
});
