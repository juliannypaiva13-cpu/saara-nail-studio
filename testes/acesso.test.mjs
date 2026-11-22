import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bancoDeTeste } from './d1-local.mjs';
import { AparelhoFalso, verificadorTeste } from './autenticador-falso.mjs';
import { criarApp, ROTAS, NIVEL } from '../src/app.js';
import { emitirConviteInicial } from '../src/auth.js';
import { verificarCorrente } from '../src/auditoria.js';

// VERIFICADOR=producao (no GitHub Actions) troca o verificador de teste pelo @simplewebauthn/server real.
const verif = process.env.VERIFICADOR === 'producao' ? (await import('../src/webauthn.js')).verificadorProducao : verificadorTeste;
const ORIGEM = 'https://saaranailstudio.pages.dev', RP_ID = 'saaranailstudio.pages.dev';
const MIN = 60e3, H = 3600e3;

function ambiente(modo = 'completo') {
  const db = bancoDeTeste();
  let agora = Date.UTC(2026, 10, 22, 15, 0);
  const relogio = { get: () => agora, andar: ms => { agora += ms; } };
  const app = criarApp({ verif, agora: relogio.get, turnstile: t => t === 'humano' });
  const env = { DB: db, ORIGEM, RP_ID, MODO: modo };
  const chamar = async (metodo, caminho, { corpo, cookie, origem = ORIGEM, ip = '10.0.0.1' } = {}) => {
    const h = { 'CF-Connecting-IP': ip, 'User-Agent': 'teste' };
    if (metodo !== 'GET') { h['Content-Type'] = 'application/json'; if (origem) h.Origin = origem; }
    if (cookie) h.Cookie = `__Host-sessao=${cookie}`;
    const res = await app(new Request(ORIGEM + caminho, { method: metodo, headers: h, body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}) }), env);
    const sc = res.headers.get('set-cookie') || '';
    const m = sc.match(/__Host-sessao=([A-Za-z0-9_-]{43})/);
    return { status: res.status, dados: await res.json(), cookie: m ? m[1] : null, setCookie: sc, headers: res.headers };
  };
  return { db, relogio, chamar };
}

async function cadastrar(amb, adminId, aparelho = new AparelhoFalso({ origem: ORIGEM, rpId: RP_ID }), token) {
  token ??= await emitirConviteInicial(amb.db, { adminId, agoraMs: amb.relogio.get() });
  const o = await amb.chamar('POST', '/api/auth/convite/opcoes', { corpo: { convite: token } });
  assert.equal(o.status, 200, JSON.stringify(o.dados));
  const resposta = await aparelho.criar(o.dados.opcoes);
  const c = await amb.chamar('POST', '/api/auth/convite/concluir', { corpo: { convite: token, desafioId: o.dados.desafioId, resposta } });
  return { ...c, aparelho, token };
}
async function entrar(amb, aparelho, opcoesUso = {}) {
  const o = await amb.chamar('POST', '/api/auth/login/opcoes');
  const resposta = await aparelho.usar(o.dados.opcoes, opcoesUso);
  return amb.chamar('POST', '/api/auth/login/concluir', { corpo: { desafioId: o.dados.desafioId, resposta } });
}
async function reautenticar(amb, cookie, aparelho) {
  const o = await amb.chamar('POST', '/api/admin/reautenticar/opcoes', { cookie });
  const resposta = await aparelho.usar(o.dados.opcoes);
  return amb.chamar('POST', '/api/admin/reautenticar/concluir', { cookie, corpo: { desafioId: o.dados.desafioId, resposta } });
}

test('primeiro acesso por convite: passkey criada, sessão aberta, 10 códigos de recuperação entregues uma vez', async () => {
  const amb = ambiente();
  const c = await cadastrar(amb, 'saara');
  assert.equal(c.status, 200);
  assert.equal(c.dados.codigosRecuperacao.length, 10);
  assert.match(c.setCookie, /HttpOnly/); assert.match(c.setCookie, /Secure/); assert.match(c.setCookie, /SameSite=Strict/);
  const eu = await amb.chamar('GET', '/api/admin/eu', { cookie: c.cookie });
  assert.deepEqual(eu.dados, { id: 'saara', nome: 'Saara' });
  // nada secreto fica em claro no banco
  const conv = await amb.db.prepare('SELECT token_hash FROM convites').first();
  assert.notEqual(conv.token_hash, c.token);
  const ses = await amb.db.prepare('SELECT id_hash FROM sessoes').first();
  assert.notEqual(ses.id_hash, c.cookie);
  const cods = (await amb.db.prepare('SELECT codigo_hash FROM codigos_recuperacao').all()).results.map(x => x.codigo_hash);
  for (const k of c.dados.codigosRecuperacao) assert.ok(!cods.includes(k));
});

test('convite usado, vencido ou inventado é recusado', async () => {
  const amb = ambiente();
  const c = await cadastrar(amb, 'saara');
  const reuso = await amb.chamar('POST', '/api/auth/convite/opcoes', { corpo: { convite: c.token } });
  assert.equal(reuso.status, 401); assert.equal(reuso.dados.erro, 'convite_invalido');
  const t2 = await emitirConviteInicial(amb.db, { adminId: 'julianny', agoraMs: amb.relogio.get() });
  amb.relogio.andar(24 * H + 1);
  assert.equal((await amb.chamar('POST', '/api/auth/convite/opcoes', { corpo: { convite: t2 } })).dados.erro, 'convite_invalido');
  assert.equal((await amb.chamar('POST', '/api/auth/convite/opcoes', { corpo: { convite: 'x'.repeat(43) } })).dados.erro, 'convite_invalido');
});

test('mesmo convite usado em dois aparelhos ao mesmo tempo: só um cadastra', async () => {
  const amb = ambiente();
  const token = await emitirConviteInicial(amb.db, { adminId: 'saara', agoraMs: amb.relogio.get() });
  const a1 = new AparelhoFalso({ origem: ORIGEM, rpId: RP_ID }), a2 = new AparelhoFalso({ origem: ORIGEM, rpId: RP_ID });
  const o1 = await amb.chamar('POST', '/api/auth/convite/opcoes', { corpo: { convite: token } });
  const o2 = await amb.chamar('POST', '/api/auth/convite/opcoes', { corpo: { convite: token } });
  const [r1, r2] = [await a1.criar(o1.dados.opcoes), await a2.criar(o2.dados.opcoes)];
  const res = await Promise.all([
    amb.chamar('POST', '/api/auth/convite/concluir', { corpo: { convite: token, desafioId: o1.dados.desafioId, resposta: r1 } }),
    amb.chamar('POST', '/api/auth/convite/concluir', { corpo: { convite: token, desafioId: o2.dados.desafioId, resposta: r2 } })]);
  assert.deepEqual(res.map(r => r.status).sort(), [200, 401]);
  assert.equal((await amb.db.prepare('SELECT COUNT(*) n FROM passkeys').first()).n, 1);
});

test('entrada com passkey; recusas: sem biometria/PIN, outra origem, outro domínio, desafio reutilizado, contador voltando', async () => {
  const amb = ambiente();
  const { aparelho } = await cadastrar(amb, 'saara');
  const ok = await entrar(amb, aparelho);
  assert.equal(ok.status, 200); assert.ok(ok.cookie);
  assert.equal((await entrar(amb, aparelho, { uv: false })).dados.erro, 'passkey_recusada');
  assert.equal((await entrar(amb, aparelho, { origem: 'https://saara-falso.pages.dev' })).dados.erro, 'passkey_recusada');
  assert.equal((await entrar(amb, aparelho, { rpId: 'saara-falso.pages.dev' })).dados.erro, 'passkey_recusada');
  // reutilizar a mesma resposta (ataque de repetição)
  const o = await amb.chamar('POST', '/api/auth/login/opcoes');
  const resp = await aparelho.usar(o.dados.opcoes);
  assert.equal((await amb.chamar('POST', '/api/auth/login/concluir', { corpo: { desafioId: o.dados.desafioId, resposta: resp } })).status, 200);
  assert.equal((await amb.chamar('POST', '/api/auth/login/concluir', { corpo: { desafioId: o.dados.desafioId, resposta: resp } })).dados.erro, 'desafio_invalido');
  // passkey copiada: contador voltando para trás
  const k = aparelho.chaves.get([...aparelho.chaves.keys()][0]); k.contador = 1;
  assert.equal((await entrar(amb, aparelho)).dados.erro, 'passkey_recusada');
  // desafio vencido (5 min)
  const o2 = await amb.chamar('POST', '/api/auth/login/opcoes');
  k.contador = 100;
  const r2 = await aparelho.usar(o2.dados.opcoes);
  amb.relogio.andar(5 * MIN + 1);
  assert.equal((await amb.chamar('POST', '/api/auth/login/concluir', { corpo: { desafioId: o2.dados.desafioId, resposta: r2 } })).dados.erro, 'desafio_invalido');
});

test('sessão: 12 h parada encerra; 7 dias é o limite absoluto; sair encerra de verdade', async () => {
  const amb = ambiente();
  const { cookie, aparelho } = await cadastrar(amb, 'saara');
  amb.relogio.andar(11 * H);
  assert.equal((await amb.chamar('GET', '/api/admin/eu', { cookie })).status, 200);
  amb.relogio.andar(12 * H + 1);
  const exp = await amb.chamar('GET', '/api/admin/eu', { cookie });
  assert.equal(exp.status, 401); assert.equal(exp.dados.erro, 'sessao_expirada'); assert.match(exp.setCookie, /Max-Age=0/);
  const s2 = (await entrar(amb, aparelho)).cookie;
  for (let d = 0; d < 7; d++) { amb.relogio.andar(23 * H); await amb.chamar('GET', '/api/admin/eu', { cookie: s2 }); }
  assert.equal((await amb.chamar('GET', '/api/admin/eu', { cookie: s2 })).dados.erro, 'sessao_expirada');
  const s3 = (await entrar(amb, aparelho)).cookie;
  assert.equal((await amb.chamar('POST', '/api/admin/sair', { cookie: s3 })).status, 200);
  assert.equal((await amb.chamar('GET', '/api/admin/eu', { cookie: s3 })).dados.erro, 'sessao_invalida');
});

test('ações sensíveis exigem confirmar a passkey de novo (vale 5 min)', async () => {
  const amb = ambiente();
  const { cookie, aparelho } = await cadastrar(amb, 'saara');
  await cadastrar(amb, 'julianny');
  const semReaut = await amb.chamar('POST', '/api/admin/convites', { cookie, corpo: { para: 'julianny' } });
  assert.equal(semReaut.status, 403); assert.equal(semReaut.dados.erro, 'reautenticacao_necessaria');
  assert.equal((await reautenticar(amb, cookie, aparelho)).status, 200);
  const conv = await amb.chamar('POST', '/api/admin/convites', { cookie, corpo: { para: 'julianny' } });
  assert.equal(conv.status, 200); assert.ok(conv.dados.conviteToken);
  amb.relogio.andar(5 * MIN + 1);
  assert.equal((await amb.chamar('GET', '/api/admin/auditoria', { cookie })).dados.erro, 'reautenticacao_necessaria');
});

test('recuperação: código impresso vale uma vez e gera convite; a outra administradora é avisada', async () => {
  const amb = ambiente();
  const { dados } = await cadastrar(amb, 'saara');
  const cod = dados.codigosRecuperacao[3].toLowerCase().replace('-', ' ');  // aceita minúsculas e espaço
  const r = await amb.chamar('POST', '/api/auth/recuperar', { corpo: { codigo: cod } });
  assert.equal(r.status, 200);
  assert.equal((await amb.chamar('POST', '/api/auth/recuperar', { corpo: { codigo: cod } })).dados.erro, 'codigo_invalido');
  const novo = await cadastrar(amb, 'saara', new AparelhoFalso({ origem: ORIGEM, rpId: RP_ID }), r.dados.conviteToken);
  assert.equal(novo.status, 200);
  assert.equal(novo.dados.codigosRecuperacao, null, 'ainda há 9 códigos válidos; não gera outros');
  assert.equal((await amb.db.prepare(`SELECT COUNT(*) n FROM notificacoes WHERE tipo = 'seguranca'`).first()).n, 1);
  assert.equal((await amb.db.prepare(`SELECT COUNT(*) n FROM passkeys WHERE admin_id = 'saara'`).first()).n, 2);
});

test('limite de tentativas na recuperação (5 a cada 15 min por endereço)', async () => {
  const amb = ambiente();
  const st = [];
  for (let i = 0; i < 7; i++) st.push((await amb.chamar('POST', '/api/auth/recuperar', { corpo: { codigo: 'AAAAA-BBBBB' } })).status);
  assert.deepEqual(st, [401, 401, 401, 401, 401, 429, 429]);
  assert.equal((await amb.chamar('POST', '/api/auth/recuperar', { ip: '10.0.0.2', corpo: { codigo: 'AAAAA-BBBBB' } })).status, 401);
});

test('não desativa a última passkey; não mexe na passkey da outra', async () => {
  const amb = ambiente();
  const s = await cadastrar(amb, 'saara');
  const j = await cadastrar(amb, 'julianny');
  await reautenticar(amb, s.cookie, s.aparelho);
  const pkS = [...s.aparelho.chaves.keys()][0], pkJ = [...j.aparelho.chaves.keys()][0];
  assert.equal((await amb.chamar('POST', '/api/admin/passkeys/desativar', { cookie: s.cookie, corpo: { id: pkS } })).dados.erro, 'ultima_passkey');
  assert.equal((await amb.chamar('POST', '/api/admin/passkeys/desativar', { cookie: s.cookie, corpo: { id: pkJ } })).status, 404);
});

test('auditoria: cada ação vira um elo; adulterar o banco quebra a corrente (e o banco recusa alterar)', async () => {
  const amb = ambiente();
  const s = await cadastrar(amb, 'saara');
  await entrar(amb, s.aparelho);
  await reautenticar(amb, s.cookie, s.aparelho);
  const a = await amb.chamar('GET', '/api/admin/auditoria', { cookie: s.cookie });
  assert.equal(a.dados.corrente.ok, true);
  assert.deepEqual(a.dados.registros.map(r => r.acao).reverse(), ['convite_inicial', 'passkey_cadastrada', 'entrada', 'reautenticacao']);
  await assert.rejects(amb.db.prepare(`UPDATE auditoria SET acao = 'x'`).run(), /somente_inclusao/);
  // mesmo burlando a trava (acesso direto ao arquivo), a adulteração é detectada
  amb.db.db.exec('DROP TRIGGER auditoria_sem_alterar'); amb.db.db.exec(`UPDATE auditoria SET admin_id = 'julianny' WHERE id = 3`);
  assert.deepEqual(await verificarCorrente(amb.db), { ok: false, quebraEm: 3 });
});

/* ---------- Teste 9: percorre TODAS as rotas da tabela ---------- */
test('teste 9 · acesso indevido: cada rota da tabela é conferida', async () => {
  const amb = ambiente();
  const s = await cadastrar(amb, 'saara');
  const sessaoVencida = (await entrar(amb, s.aparelho)).cookie;
  amb.relogio.andar(12 * H + 1);
  const valida = (await entrar(amb, s.aparelho)).cookie;           // nova sessão, sem reautenticação
  const corpoQualquer = { convite: 'x', codigo: 'x', id: 'x', para: 'julianny', ref: 'x', desafioId: 'x', resposta: {} };
  const relatorio = [];
  for (const r of ROTAS.filter(x => x.modos.includes('completo'))) {
    const caminho = r.p + (r.p === '/api/horarios' ? '?servico=f1&dia=2026-11-24' : '');
    const linha = { rota: `${r.m} ${r.p}`, nivel: r.n };
    if (r.n !== NIVEL.PUBLICO) {
      const sem = await amb.chamar(r.m, caminho, { corpo: corpoQualquer });
      assert.equal(sem.status, 401, `${linha.rota} sem sessão`);
      const venc = await amb.chamar(r.m, caminho, { corpo: corpoQualquer, cookie: sessaoVencida });
      assert.equal(venc.status, 401, `${linha.rota} sessão vencida`);
      const inventada = await amb.chamar(r.m, caminho, { corpo: corpoQualquer, cookie: 'A'.repeat(43) });
      assert.equal(inventada.status, 401, `${linha.rota} cookie inventado`);
      linha.semSessao = linha.vencida = linha.inventada = 401;
    }
    if (r.n === NIVEL.REAUT) {
      const x = await amb.chamar(r.m, caminho, { corpo: corpoQualquer, cookie: valida });
      assert.equal(x.status, 403, `${linha.rota} sem reautenticação`);
      linha.semReautenticacao = 403;
    }
    if (r.m !== 'GET') {
      for (const origem of ['https://site-malicioso.com', 'https://saaranailstudio.pages.dev.evil.com', null]) {
        const x = await amb.chamar(r.m, caminho, { corpo: corpoQualquer, cookie: r.n === NIVEL.PUBLICO ? undefined : valida, origem });
        assert.equal(x.status, 403, `${linha.rota} origem ${origem}`);
      }
      linha.outraOrigem = 403;
    }
    // cabeçalhos de segurança em toda resposta
    const qualquer = await amb.chamar(r.m, caminho, { corpo: corpoQualquer });
    for (const h of ['x-content-type-options', 'x-frame-options', 'content-security-policy', 'strict-transport-security', 'cache-control'])
      assert.ok(qualquer.headers.get(h), `${linha.rota} sem ${h}`);
    relatorio.push(linha);
  }
  // reserva sem verificação humana (Turnstile)
  assert.equal((await amb.chamar('POST', '/api/reservas', { corpo: { servico: 'f1', dia: '2026-11-26', inicio: 480, forma: 'sinal' } })).dados.erro, 'verificacao_humana_falhou');
  // rota inexistente e método errado
  assert.equal((await amb.chamar('GET', '/api/admin/qualquer')).status, 404);
  assert.equal((await amb.chamar('DELETE', '/api/admin/eu', { cookie: valida })).status, 405);
  console.log(`rotas conferidas: ${relatorio.length} (públicas ${relatorio.filter(x => x.nivel === NIVEL.PUBLICO).length}, ` +
              `administradoras ${relatorio.filter(x => x.nivel === NIVEL.ADMIN).length}, sensíveis ${relatorio.filter(x => x.nivel === NIVEL.REAUT).length})`);
});

test('servidor temporário de passkeys: reservas, horários e pagamentos não existem nesse modo', async () => {
  const amb = ambiente('teste-passkey');
  assert.equal((await amb.chamar('GET', '/api/horarios?servico=f1&dia=2026-11-24')).status, 404);
  assert.equal((await amb.chamar('POST', '/api/reservas', { corpo: {} })).status, 404);
  const s = await cadastrar(amb, 'saara');
  assert.equal((await amb.chamar('GET', '/api/admin/alertas-pagamento', { cookie: s.cookie })).status, 404);
  assert.equal((await amb.chamar('GET', '/api/saude')).dados.modo, 'teste-passkey');
});

test('reserva pelo site via API: prazo de 17 min nunca é exposto à cliente', async () => {
  const amb = ambiente();
  const r = await amb.chamar('POST', '/api/reservas', { corpo: { servico: 'f1', dia: '2026-11-26', inicio: 480, forma: 'sinal', nome: 'Teste', whatsapp: '(99) 9 0000-0000', turnstile: 'humano' } });
  assert.equal(r.status, 200, JSON.stringify(r.dados));
  assert.deepEqual(Object.keys(r.dados).sort(), ['codigo', 'prazoVisivelEm']);
  const dup = await amb.chamar('POST', '/api/reservas', { corpo: { servico: 'f1', dia: '2026-11-26', inicio: 495, forma: 'sinal', turnstile: 'humano' } });
  assert.equal(dup.status, 409); assert.equal(dup.dados.erro, 'horario_ocupado');
});

test('produção desligada por padrão (até a Fase 5): só /api/saude responde, sem tocar no banco', async () => {
  const app = criarApp({ verif });
  const env = { ORIGEM, RP_ID }; // sem MODO e sem banco
  const r = async (m, p) => app(new Request(ORIGEM + p, { method: m, headers: { Origin: ORIGEM, 'Content-Type': 'application/json' }, body: m === 'GET' ? undefined : '{}' }), env);
  assert.equal((await (await r('GET', '/api/saude')).json()).modo, 'desligado');
  for (const rota of ROTAS.filter(x => x.p !== '/api/saude')) assert.equal((await r(rota.m, rota.p)).status, 404, rota.p);
});
