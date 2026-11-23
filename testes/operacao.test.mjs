// Operação completa pela API (ambiente de homologação): Pix com aprovação manual, comprovantes, painel e agenda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bancoDeTeste } from './d1-local.mjs';
import { AparelhoFalso, verificadorTeste } from './autenticador-falso.mjs';
import { criarApp } from '../src/app.js';
import { emitirConviteInicial } from '../src/auth.js';

const ORIGEM = 'https://teste-passkey.saaranailstudio.pages.dev', RP_ID = 'teste-passkey.saaranailstudio.pages.dev';
const MIN = 60e3, H = 3600e3, DIA = 86400e3;
const TER = '2026-11-24', QUA = '2026-11-25';

class KVLocal {
  constructor() { this.m = new Map(); }
  async put(k, v, o) { this.m.set(k, { v: new Uint8Array(v).slice(), meta: o?.metadata }); }
  async get(k) { const x = this.m.get(k); return x ? x.v.buffer.slice(x.v.byteOffset, x.v.byteOffset + x.v.byteLength) : null; }
  async delete(k) { this.m.delete(k); }
}
const jpeg = (n = 3000, sem = 1) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + sem) & 255; b.set([0xff, 0xd8, 0xff, 0xe0]); return b; };
const pdf = txt => new TextEncoder().encode(`%PDF-1.4\n${txt}\n%%EOF`);

async function ambiente() {
  const db = bancoDeTeste(), kv = new KVLocal();
  let agora = Date.UTC(2026, 10, 22, 15, 0); // domingo 22/11, 12h em Fortaleza
  const relogio = { get: () => agora, andar: ms => { agora += ms; }, ir: ms => { agora = ms; } };
  const app = criarApp({ verif: verificadorTeste, agora: relogio.get });
  const env = { DB: db, COMPROVANTES: kv, ORIGEM, RP_ID, MODO: 'homologacao' };
  const chamar = async (metodo, caminho, { corpo, cookie, bruto, tipo } = {}) => {
    const h = { 'CF-Connecting-IP': `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
    if (metodo !== 'GET') { h.Origin = ORIGEM; h['Content-Type'] = bruto ? tipo : 'application/json'; }
    if (cookie) h.Cookie = `__Host-sessao=${cookie}`;
    const res = await app(new Request(ORIGEM + caminho, { method: metodo, headers: h, body: metodo === 'GET' ? undefined : bruto ?? JSON.stringify(corpo ?? {}) }), env);
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, dados: ct.startsWith('application/json') ? await res.json() : new Uint8Array(await res.arrayBuffer()) };
  };
  const entrar = async (adminId) => {
    const token = await emitirConviteInicial(db, { adminId, agoraMs: agora });
    const ap = new AparelhoFalso({ origem: ORIGEM, rpId: RP_ID });
    const o = await chamar('POST', '/api/auth/convite/opcoes', { corpo: { convite: token } });
    const c = await app(new Request(ORIGEM + '/api/auth/convite/concluir', { method: 'POST', headers: { Origin: ORIGEM, 'Content-Type': 'application/json' },
      body: JSON.stringify({ convite: token, desafioId: o.dados.desafioId, resposta: await ap.criar(o.dados.opcoes) }) }), env);
    return (c.headers.get('set-cookie') || '').match(/__Host-sessao=([A-Za-z0-9_-]{43})/)[1];
  };
  return { db, kv, relogio, chamar, entrar, env };
}
async function reservar(amb, { dia = TER, inicio = 840, servico = 'f1', forma = 'sinal', whatsapp = '99988887777', nome = 'Maria Teste' } = {}) {
  const r = await amb.chamar('POST', '/api/reservas', { corpo: { servico, dia, inicio, forma, nome, whatsapp } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  return r.dados.codigo;
}
async function enviar(amb, codigo, bytes, tipo = 'image/jpeg', tamanho = bytes.length) {
  const a = await amb.chamar('POST', '/api/reservas/comprovante/autorizar', { corpo: { codigo, tipo, tamanho } });
  if (a.status !== 200) return a;
  return amb.chamar('PUT', `/api/reservas/comprovante?token=${a.dados.token}`, { bruto: bytes, tipo });
}
const idDe = async (amb, codigo) => (await amb.db.prepare('SELECT id FROM agendamentos WHERE codigo = ?').bind(codigo).first()).id;
const pagDe = async (amb, codigo) => (await amb.db.prepare(`SELECT p.* FROM pagamentos p JOIN agendamentos a ON a.id = p.agendamento_id WHERE a.codigo = ? ORDER BY p.criado_em DESC`).bind(codigo).first());

test('fluxo Pix: reserva → comprovante → em análise → só confirma com conferência manual de uma administradora', async () => {
  const amb = await ambiente();
  const s = await amb.entrar('saara');
  const codigo = await reservar(amb);
  const env = await enviar(amb, codigo, jpeg());
  assert.equal(env.status, 200, JSON.stringify(env.dados));
  assert.deepEqual(env.dados, { status: 'em_analise', mensagem: 'Pagamento em análise' });
  assert.equal((await amb.chamar('GET', `/api/reservas/acompanhar?codigo=${codigo}`)).dados.status, 'pagamento_em_analise');
  const p = await pagDe(amb, codigo);
  assert.equal(p.valor_centavos, 3000, 'sinal de 30% calculado no servidor');
  const painel = (await amb.chamar('GET', `/api/admin/painel?de=${TER}&ate=${TER}`, { cookie: s })).dados;
  assert.equal(painel.pagamentosPendentes.length, 1);
  // ver o comprovante: só administradora, sem execução no navegador
  const comp = (await amb.chamar('GET', `/api/admin/agendamento?id=${p.agendamento_id}`, { cookie: s })).dados.comprovantes[0];
  assert.equal((await amb.chamar('GET', `/api/admin/comprovante?id=${comp.id}`)).status, 401);
  const arq = await amb.chamar('GET', `/api/admin/comprovante?id=${comp.id}`, { cookie: s });
  assert.equal(arq.status, 200); assert.match(arq.headers.get('content-security-policy'), /sandbox/);
  assert.deepEqual(arq.dados.slice(0, 3), new Uint8Array([0xff, 0xd8, 0xff]));
  // sem marcar a conferência no banco, não confirma
  assert.equal((await amb.chamar('POST', '/api/admin/pagamentos/decidir', { cookie: s, corpo: { id: p.id, decisao: 'confirmar' } })).dados.erro, 'conferencia_obrigatoria');
  const ok = await amb.chamar('POST', '/api/admin/pagamentos/decidir', { cookie: s, corpo: { id: p.id, decisao: 'confirmar', conferido: true } });
  assert.equal(ok.status, 200);
  assert.equal((await amb.chamar('GET', `/api/reservas/acompanhar?codigo=${codigo}`)).dados.status, 'confirmado');
  assert.equal((await amb.chamar('POST', '/api/admin/pagamentos/decidir', { cookie: s, corpo: { id: p.id, decisao: 'confirmar', conferido: true } })).dados.erro, 'pagamento_ja_decidido');
  const det = (await amb.chamar('GET', `/api/admin/agendamento?id=${p.agendamento_id}`, { cookie: s })).dados;
  assert.ok(det.historico.some(h => h.acao === 'pagamento_confirmar' && h.quem === 'saara'), 'histórico de confirmação');
  const aud = (await amb.db.prepare(`SELECT COUNT(*) n FROM auditoria WHERE acao = 'pagamento_confirmar' AND admin_id = 'saara'`).first()).n;
  assert.equal(aud, 1);
});

test('valor nunca vem do navegador; acompanhamento não expõe nome nem telefone', async () => {
  const amb = await ambiente();
  const r = await amb.chamar('POST', '/api/reservas', { corpo: { servico: 'f1', dia: TER, inicio: 840, forma: 'integral', nome: 'Ana', whatsapp: '99911112222', preco_centavos: 1, valor: 1 } });
  const a = (await amb.chamar('GET', `/api/reservas/acompanhar?codigo=${r.dados.codigo}`)).dados;
  assert.equal(a.pixCentavos, 10000);
  assert.ok(!JSON.stringify(a).includes('Ana') && !JSON.stringify(a).includes('99911112222'));
  assert.equal((await amb.chamar('GET', '/api/reservas/acompanhar?codigo=XXXX-YYYY')).status, 404);
});

test('comprovante: tipo real, tamanho, PDF com script, token de uso único e com validade', async () => {
  const amb = await ambiente();
  const codigo = await reservar(amb);
  const falso = new TextEncoder().encode('<script>alert(1)</script>');
  assert.equal((await enviar(amb, codigo, falso, 'image/jpeg')).dados.erro, 'conteudo_nao_confere_com_o_tipo');
  assert.equal((await enviar(amb, codigo, pdf('/OpenAction << /S /JavaScript /JS (app.alert(1)) >>'), 'application/pdf')).dados.erro, 'pdf_com_conteudo_ativo');
  assert.equal((await enviar(amb, codigo, jpeg(), 'image/svg+xml')).dados.erro, 'tipo_de_arquivo_nao_aceito');
  assert.equal((await enviar(amb, codigo, jpeg(4000), 'image/jpeg', 1000)).dados.erro, 'arquivo_maior_que_o_autorizado');
  assert.equal((await amb.chamar('POST', '/api/reservas/comprovante/autorizar', { corpo: { codigo, tipo: 'image/jpeg', tamanho: 6 * 1024 * 1024 } })).dados.erro, 'arquivo_grande_demais');
  // token vencido (2 min) e token reutilizado
  const a = await amb.chamar('POST', '/api/reservas/comprovante/autorizar', { corpo: { codigo, tipo: 'image/jpeg', tamanho: 3000 } });
  amb.relogio.andar(2 * MIN + 1);
  assert.equal((await amb.chamar('PUT', `/api/reservas/comprovante?token=${a.dados.token}`, { bruto: jpeg(), tipo: 'image/jpeg' })).dados.erro, 'autorizacao_invalida');
  const b = await amb.chamar('POST', '/api/reservas/comprovante/autorizar', { corpo: { codigo, tipo: 'image/jpeg', tamanho: 3000 } });
  assert.equal((await amb.chamar('PUT', `/api/reservas/comprovante?token=${b.dados.token}`, { bruto: jpeg(), tipo: 'image/jpeg' })).status, 200);
  assert.equal((await amb.chamar('PUT', `/api/reservas/comprovante?token=${b.dados.token}`, { bruto: jpeg(3000, 2), tipo: 'image/jpeg' })).dados.erro, 'autorizacao_invalida');
  assert.equal(amb.kv.m.size, 1, 'arquivos recusados não ficam guardados');
  // tipo declarado diferente do enviado
  const c2 = await reservar(amb, { inicio: 1080, whatsapp: '99900001111' });
  const t2 = (await amb.chamar('POST', '/api/reservas/comprovante/autorizar', { corpo: { codigo: c2, tipo: 'image/png', tamanho: 3000 } })).dados.token;
  assert.equal((await amb.chamar('PUT', `/api/reservas/comprovante?token=${t2}`, { bruto: jpeg(), tipo: 'image/jpeg' })).dados.erro, 'tipo_diferente_do_autorizado');
});

test('envio iniciado no prazo vale: autorizado aos 16:50 e recebido aos 18:40 é aceito; autorização aos 17:01 é recusada', async () => {
  const amb = await ambiente();
  const t0 = amb.relogio.get();
  const c1 = await reservar(amb);
  const c2 = await reservar(amb, { inicio: 1080, whatsapp: '99900002222' });
  amb.relogio.ir(t0 + 16 * MIN + 50e3);
  const a = await amb.chamar('POST', '/api/reservas/comprovante/autorizar', { corpo: { codigo: c1, tipo: 'image/jpeg', tamanho: 3000 } });
  assert.equal(a.status, 200);
  amb.relogio.ir(t0 + 17 * MIN + 1000);
  assert.equal((await amb.chamar('POST', '/api/reservas/comprovante/autorizar', { corpo: { codigo: c2, tipo: 'image/jpeg', tamanho: 3000 } })).dados.erro, 'prazo_encerrado');
  amb.relogio.ir(t0 + 18 * MIN + 40e3);
  await amb.chamar('GET', '/api/horarios?servico=f1&dia=' + TER); // roda a liberação automática no meio do envio
  const r = await amb.chamar('PUT', `/api/reservas/comprovante?token=${a.dados.token}`, { bruto: jpeg(), tipo: 'image/jpeg' });
  assert.equal(r.dados.status, 'em_analise', JSON.stringify(r.dados));
  amb.relogio.ir(t0 + 20 * MIN + 1);
  await amb.chamar('GET', '/api/horarios?servico=f1&dia=' + TER);
  assert.equal((await amb.chamar('GET', `/api/reservas/acompanhar?codigo=${c2}`)).dados.status, 'expirado');
  assert.equal((await amb.chamar('GET', `/api/reservas/acompanhar?codigo=${c1}`)).dados.status, 'pagamento_em_analise');
});

test('mesmo comprovante em outro agendamento: aceito para análise, mas as administradoras são avisadas', async () => {
  const amb = await ambiente();
  const arquivo = jpeg(5000, 7);
  const c1 = await reservar(amb), c2 = await reservar(amb, { inicio: 1080, whatsapp: '99900003333' });
  assert.equal((await enviar(amb, c1, arquivo)).dados.status, 'em_analise');
  const r2 = await enviar(amb, c2, arquivo);
  assert.equal(r2.dados.status, 'em_analise');
  const n = await amb.db.prepare(`SELECT texto FROM notificacoes WHERE tipo = 'comprovante_repetido'`).first();
  assert.match(n.texto, new RegExp(c1));
});

test('pedir novo comprovante mantém o horário; recusar e liberar devolve o horário à agenda', async () => {
  const amb = await ambiente();
  const s = await amb.entrar('julianny');
  const c1 = await reservar(amb), c2 = await reservar(amb, { dia: QUA, whatsapp: '99900004444' });
  await enviar(amb, c1, jpeg()); await enviar(amb, c2, jpeg(3000, 9));
  const p1 = await pagDe(amb, c1), p2 = await pagDe(amb, c2);
  assert.equal((await amb.chamar('POST', '/api/admin/pagamentos/decidir', { cookie: s, corpo: { id: p1.id, decisao: 'pedir_novo' } })).dados.erro, 'motivo_obrigatorio');
  assert.equal((await amb.chamar('POST', '/api/admin/pagamentos/decidir', { cookie: s, corpo: { id: p1.id, decisao: 'pedir_novo', motivo: 'valor não aparece' } })).status, 200);
  assert.equal((await amb.chamar('GET', `/api/reservas/acompanhar?codigo=${c1}`)).dados.status, 'aguardando_pagamento');
  assert.ok(!(await amb.chamar('GET', `/api/horarios?servico=f1&dia=${TER}`)).dados.horarios.includes(840), 'horário continua reservado');
  await amb.chamar('POST', '/api/admin/pagamentos/decidir', { cookie: s, corpo: { id: p2.id, decisao: 'recusar_e_liberar', motivo: 'Pix não recebido' } });
  assert.ok((await amb.chamar('GET', `/api/horarios?servico=f1&dia=${QUA}`)).dados.horarios.includes(840), 'horário voltou para a agenda');
});

test('equipe: agenda com menos de 24 h; no estúdio = confirmado; pagamento presencial nunca passa do valor', async () => {
  const amb = await ambiente();
  amb.relogio.ir(Date.UTC(2026, 10, 24, 15, 0)); // terça 12h: 14h de hoje (só a equipe pode)
  const s = await amb.entrar('saara');
  assert.equal((await amb.chamar('POST', '/api/reservas', { corpo: { servico: 'manicure', dia: TER, inicio: 840, forma: 'sinal', nome: 'Bia', whatsapp: '99911113333' } })).dados.erro, 'antecedencia_minima');
  const r = await amb.chamar('POST', '/api/admin/agendamentos', { cookie: s, corpo: { servico: 'manicure', dia: TER, inicio: 840, forma: 'estudio', nome: 'Bia', whatsapp: '99911113333' } });
  assert.equal(r.dados.status, 'confirmado');
  assert.equal((await amb.chamar('POST', '/api/admin/pagamentos/presencial', { cookie: s, corpo: { id: r.dados.id, valorCentavos: 2501 } })).dados.erro, 'valor_maior_que_o_devido');
  assert.equal((await amb.chamar('POST', '/api/admin/pagamentos/presencial', { cookie: s, corpo: { id: r.dados.id, valorCentavos: 2000 } })).status, 200);
  assert.equal((await amb.chamar('POST', '/api/admin/pagamentos/presencial', { cookie: s, corpo: { id: r.dados.id, valorCentavos: 500 } })).dados.erro, 'pagamento_ja_confirmado',
               'um pagamento presencial por atendimento (impede lançar duas vezes)');
  // Pix pela equipe: aguarda o Pix, sem prazo de 17 min; confirma só com conferência
  const r2 = await amb.chamar('POST', '/api/admin/agendamentos', { cookie: s, corpo: { servico: 'postica', dia: QUA, inicio: 840, forma: 'sinal', nome: 'Bia', whatsapp: '99911113333' } });
  assert.equal(r2.dados.status, 'aguardando_pix');
  const p = await amb.db.prepare('SELECT * FROM pagamentos WHERE agendamento_id = ?').bind(r2.dados.id).first();
  assert.equal(p.valor_centavos, 1500);
  await amb.chamar('POST', '/api/admin/pagamentos/decidir', { cookie: s, corpo: { id: p.id, decisao: 'confirmar', conferido: true } });
  assert.equal((await amb.db.prepare('SELECT status FROM agendamentos WHERE id = ?').bind(r2.dados.id).first()).status, 'confirmado');
  assert.equal((await amb.chamar('GET', '/api/admin/clientes?busca=Bia', { cookie: s })).dados.clientes.length, 1, 'mesma cliente, uma ficha');
});

test('cancelamento: com valor pago exige destino; reter exige justificativa; reembolso e crédito registrados', async () => {
  const amb = await ambiente();
  const s = await amb.entrar('saara');
  const c1 = await reservar(amb); await enviar(amb, c1, jpeg());
  const p1 = await pagDe(amb, c1);
  await amb.chamar('POST', '/api/admin/pagamentos/decidir', { cookie: s, corpo: { id: p1.id, decisao: 'confirmar', conferido: true } });
  const id1 = await idDe(amb, c1);
  assert.equal((await amb.chamar('POST', '/api/admin/agendamentos/cancelar', { cookie: s, corpo: { id: id1 } })).dados.erro, 'destino_do_valor_obrigatorio');
  assert.equal((await amb.chamar('POST', '/api/admin/agendamentos/cancelar', { cookie: s, corpo: { id: id1, destino: 'reter' } })).dados.erro, 'justificativa_obrigatoria');
  assert.equal((await amb.chamar('POST', '/api/admin/agendamentos/cancelar', { cookie: s, corpo: { id: id1, destino: 'reembolso', valorCentavos: 3001 } })).dados.erro, 'valor_invalido');
  const ok = await amb.chamar('POST', '/api/admin/agendamentos/cancelar', { cookie: s, corpo: { id: id1, destino: 'credito', motivo: 'cliente pediu' } });
  assert.deepEqual([ok.status, ok.dados.valorCentavos], [200, 3000]);
  assert.ok((await amb.chamar('GET', `/api/horarios?servico=f1&dia=${TER}`)).dados.horarios.includes(840), 'horário liberado');
  // usa o crédito num novo agendamento da mesma cliente
  const r = await amb.chamar('POST', '/api/admin/agendamentos', { cookie: s, corpo: { servico: 'postica', dia: QUA, inicio: 840, forma: 'sinal', nome: 'Maria Teste', whatsapp: '99988887777' } });
  const cred = await amb.db.prepare('SELECT id FROM creditos').first();
  assert.equal((await amb.chamar('POST', '/api/admin/creditos/usar', { cookie: s, corpo: { credito: cred.id, id: r.dados.id } })).status, 200);
  assert.equal((await amb.chamar('POST', '/api/admin/creditos/usar', { cookie: s, corpo: { credito: cred.id, id: r.dados.id } })).dados.erro, 'credito_inexistente');
  // reembolso com conclusão registrada
  const c3 = await reservar(amb, { dia: '2026-11-27', whatsapp: '99900005555' }); await enviar(amb, c3, jpeg(3000, 3));
  await amb.chamar('POST', '/api/admin/pagamentos/decidir', { cookie: s, corpo: { id: (await pagDe(amb, c3)).id, decisao: 'confirmar', conferido: true } });
  await amb.chamar('POST', '/api/admin/agendamentos/cancelar', { cookie: s, corpo: { id: await idDe(amb, c3), destino: 'reembolso' } });
  const painel = (await amb.chamar('GET', '/api/admin/painel?de=2026-11-27&ate=2026-11-27', { cookie: s })).dados;
  assert.equal(painel.reembolsosPendentes.length, 1);
  assert.equal((await amb.chamar('POST', '/api/admin/reembolsos/concluir', { cookie: s, corpo: { id: painel.reembolsosPendentes[0].id } })).status, 200);
});

test('presença: falta só depois de 15 min de tolerância; atraso registrado; concluir só após o início', async () => {
  const amb = await ambiente();
  const s = await amb.entrar('saara');
  const r = await amb.chamar('POST', '/api/admin/agendamentos', { cookie: s, corpo: { servico: 'f1', dia: TER, inicio: 840, forma: 'estudio', nome: 'Cris', whatsapp: '99922223333' } });
  const r2 = await amb.chamar('POST', '/api/admin/agendamentos', { cookie: s, corpo: { servico: 'manicure', dia: TER, inicio: 1080, forma: 'estudio', nome: 'Duda', whatsapp: '99922224444' } });
  amb.relogio.ir(Date.UTC(2026, 10, 24, 17, 10)); // 14h10 em Fortaleza
  let s2 = await amb.entrar('saara');            // dias depois: sessão antiga expirou (12 h parada), entra de novo
  assert.equal((await amb.chamar('POST', '/api/admin/agendamentos/presenca', { cookie: s2, corpo: { id: r.dados.id, acao: 'falta' } })).dados.erro, 'ainda_na_tolerancia');
  assert.equal((await amb.chamar('POST', '/api/admin/agendamentos/presenca', { cookie: s2, corpo: { id: r.dados.id, acao: 'chegou' } })).status, 200);
  assert.equal((await amb.db.prepare('SELECT atraso_min FROM agendamentos WHERE id = ?').bind(r.dados.id).first()).atraso_min, 10);
  assert.equal((await amb.chamar('POST', '/api/admin/agendamentos/presenca', { cookie: s2, corpo: { id: r.dados.id, acao: 'concluir' } })).status, 200);
  amb.relogio.ir(Date.UTC(2026, 10, 24, 21, 16)); // 18h16: passou a tolerância de 15 min da Duda
  s2 = await amb.entrar('saara');
  assert.equal((await amb.chamar('POST', '/api/admin/agendamentos/presenca', { cookie: s2, corpo: { id: r2.dados.id, acao: 'falta' } })).status, 200);
  const st = (await amb.chamar('GET', `/api/admin/painel?de=${TER}&ate=${TER}`, { cookie: s2 })).dados.agendamentos.map(a => a.status);
  assert.deepEqual(st, ['concluido', 'nao_compareceu']);
  assert.equal((await amb.chamar('GET', `/api/admin/cliente?id=${(await amb.db.prepare('SELECT cliente_id FROM agendamentos WHERE id = ?').bind(r.dados.id).first()).cliente_id}`, { cookie: s2 })).dados.cliente.ultimo_atendimento, TER);
});

test('bloqueio: não cobre atendimento existente; tira o horário da agenda; remover devolve', async () => {
  const amb = await ambiente();
  const s = await amb.entrar('saara');
  await reservar(amb);
  assert.equal((await amb.chamar('POST', '/api/admin/bloqueios', { cookie: s, corpo: { dia: TER, inicio: 900, fim: 960, motivo: 'médico' } })).dados.erro, 'horario_ocupado');
  const b = await amb.chamar('POST', '/api/admin/bloqueios', { cookie: s, corpo: { dia: QUA, inicio: 840, fim: 1260, motivo: 'folga' } });
  assert.deepEqual((await amb.chamar('GET', `/api/horarios?servico=manicure&dia=${QUA}`)).dados.horarios, []);
  await amb.chamar('POST', '/api/admin/bloqueios/remover', { cookie: s, corpo: { id: b.dados.id } });
  assert.ok((await amb.chamar('GET', `/api/horarios?servico=manicure&dia=${QUA}`)).dados.horarios.length > 0);
});

test('expediente: nova versão fecha um dia de verdade e lista (sem cancelar) os agendamentos que ficaram fora', async () => {
  const amb = await ambiente();
  const s = await amb.entrar('saara');
  const c = await reservar(amb, { dia: '2026-11-30', inicio: 840 }); // segunda
  const periodos = { 0: [], 1: [], 2: [[840, 1260]], 3: [[840, 1260]], 4: [[480, 720], [1020, 1200]], 5: [[840, 1260]], 6: [[480, 720], [840, 1020]] };
  const r = await amb.chamar('POST', '/api/admin/expediente', { cookie: s, corpo: { vigenteDesde: '2026-11-29', periodos } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.deepEqual(r.dados.foraDoHorario.map(x => x.codigo), [c]);
  assert.deepEqual((await amb.chamar('GET', '/api/horarios?servico=manicure&dia=2026-12-07')).dados.horarios, [], 'segunda fechada na nova versão');
  assert.equal((await amb.chamar('GET', `/api/reservas/acompanhar?codigo=${c}`)).dados.status, 'aguardando_comprovante', 'nada é cancelado sozinho');
  assert.equal((await amb.chamar('POST', '/api/admin/expediente', { cookie: s, corpo: { vigenteDesde: '2026-11-29', periodos: { 1: [[840, 1005], [990, 1095]] } } })).dados.erro, 'periodos_sobrepostos');
});

test('pedidos da cliente: cancelamento vai para decisão; remarcar sozinha só com 24 h ou mais', async () => {
  const amb = await ambiente();
  const s = await amb.entrar('saara');
  const c = await reservar(amb, { dia: '2026-11-27' }); await enviar(amb, c, jpeg());
  await amb.chamar('POST', '/api/admin/pagamentos/decidir', { cookie: s, corpo: { id: (await pagDe(amb, c)).id, decisao: 'confirmar', conferido: true } });
  const rem = await amb.chamar('POST', '/api/reservas/remarcar', { corpo: { codigo: c, dia: '2026-11-30', inicio: 900 } });
  assert.equal(rem.status, 200, JSON.stringify(rem.dados));
  amb.relogio.ir(Date.UTC(2026, 10, 30, 0, 0)); // faltam menos de 24 h para segunda 15h
  const s3 = await amb.entrar('saara');
  assert.equal((await amb.chamar('POST', '/api/reservas/remarcar', { corpo: { codigo: c, dia: '2026-12-01', inicio: 900 } })).dados.erro, 'menos_de_24h_faca_um_pedido');
  const sol = await amb.chamar('POST', '/api/reservas/solicitacao', { corpo: { codigo: c, tipo: 'cancelamento', motivo: 'imprevisto' } });
  assert.equal(sol.status, 200);
  assert.equal((await amb.chamar('POST', '/api/reservas/solicitacao', { corpo: { codigo: c, tipo: 'cancelamento' } })).dados.erro, 'solicitacao_ja_pendente');
  const painel = (await amb.chamar('GET', '/api/admin/painel?de=2026-11-30&ate=2026-11-30', { cookie: s3 })).dados;
  assert.equal(painel.solicitacoes.length, 1);
  assert.ok(painel.notificacoes.some(n => n.tipo === 'solicitacao'));
  const dec = await amb.chamar('POST', '/api/admin/solicitacoes/decidir', { cookie: s3, corpo: { id: painel.solicitacoes[0].id, decisao: 'aprovar', destino: 'credito' } });
  assert.equal(dec.status, 200, JSON.stringify(dec.dados));
  assert.equal((await amb.chamar('GET', `/api/reservas/acompanhar?codigo=${c}`)).dados.status, 'cancelado');
  assert.equal((await amb.db.prepare(`SELECT status FROM solicitacoes`).first()).status, 'decidida');
  // avisos marcados como lidos por administradora
  const ids = painel.notificacoes.map(n => n.id);
  await amb.chamar('POST', '/api/admin/avisos/lidos', { cookie: s3, corpo: { ids } });
  assert.ok((await amb.chamar('GET', '/api/admin/painel?de=2026-11-30&ate=2026-11-30', { cookie: s3 })).dados.notificacoes.filter(n => ids.includes(n.id)).every(n => n.lida));
});

test('sem armazenamento de comprovantes ligado: erro claro, nada registrado', async () => {
  const amb = await ambiente();
  delete amb.env.COMPROVANTES;
  const c = await reservar(amb);
  const r = await enviar(amb, c, jpeg());
  assert.deepEqual([r.status, r.dados.erro], [503, 'armazenamento_nao_ligado']);
  assert.equal((await amb.db.prepare('SELECT COUNT(*) n FROM comprovantes').first()).n, 0);
});
