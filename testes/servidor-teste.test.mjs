// Servidor temporário: instalação automática do banco, convites por segredo e testes com dados fictícios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { D1Local, bancoDeTeste } from './d1-local.mjs';
import { AparelhoFalso, verificadorTeste } from './autenticador-falso.mjs';
import { criarApp, ROTAS, NIVEL } from '../src/app.js';
import { dividirSql } from '../src/esquema.js';
import { conteudoGerado } from '../scripts/gerar-migracoes.mjs';

const ORIGEM = 'https://teste-passkey.saaranailstudio.pages.dev', RP_ID = 'teste-passkey.saaranailstudio.pages.dev';
const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres-123';
const MIN = 60e3;

function ambiente(db = new D1Local()) {
  let agora = Date.UTC(2026, 10, 22, 15, 0);
  const relogio = { get: () => agora, andar: ms => { agora += ms; } };
  const app = criarApp({ verif: verificadorTeste, agora: relogio.get });
  const env = { DB: db, ORIGEM, RP_ID, MODO: 'teste-passkey', INSTALACAO_SEGREDO: SEGREDO };
  const chamar = async (metodo, caminho, { corpo, cookie, origem = ORIGEM } = {}) => {
    const h = { 'CF-Connecting-IP': '10.0.0.9' };
    if (metodo !== 'GET') { h['Content-Type'] = 'application/json'; if (origem) h.Origin = origem; }
    if (cookie) h.Cookie = `__Host-sessao=${cookie}`;
    const res = await app(new Request(ORIGEM + caminho, { method: metodo, headers: h, body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}) }), env);
    const m = (res.headers.get('set-cookie') || '').match(/__Host-sessao=([A-Za-z0-9_-]{43})/);
    return { status: res.status, dados: await res.json(), cookie: m ? m[1] : null };
  };
  return { db, relogio, chamar, env };
}
async function ate200(amb, metodo, caminho, opts) {
  for (let i = 0; i < 5; i++) { const r = await amb.chamar(metodo, caminho, opts); if (r.status !== 503 || r.dados.erro !== 'instalando_banco') return r; }
  throw new Error('banco não instalou');
}
async function primeiroAcesso(amb, quem = 'saara') {
  const inst = await ate200(amb, 'POST', '/api/instalacao/convites', { corpo: { segredo: SEGREDO } });
  assert.equal(inst.status, 200, JSON.stringify(inst.dados));
  const aparelho = new AparelhoFalso({ origem: ORIGEM, rpId: RP_ID });
  const o = await amb.chamar('POST', '/api/auth/convite/opcoes', { corpo: { convite: inst.dados.convites[quem] } });
  const resposta = await aparelho.criar(o.dados.opcoes);
  const c = await amb.chamar('POST', '/api/auth/convite/concluir', { corpo: { convite: inst.dados.convites[quem], desafioId: o.dados.desafioId, resposta } });
  assert.equal(c.status, 200);
  return { cookie: c.cookie, aparelho, convites: inst.dados.convites };
}

test('src/migracoes.gerado.js está em dia com migrations/*.sql', () => {
  assert.equal(readFileSync(new URL('../src/migracoes.gerado.js', import.meta.url), 'utf8'), conteudoGerado());
});

test('instalação automática: banco vazio vira banco completo, uma migração por pedido, igual ao esperado', async () => {
  const amb = ambiente();
  const r1 = await amb.chamar('GET', '/api/admin/eu');
  assert.deepEqual([r1.status, r1.dados.erro], [503, 'instalando_banco']);
  const r2 = await amb.chamar('GET', '/api/admin/eu');
  assert.equal(r2.status, 401, 'banco pronto: agora é a regra normal (sem sessão)');
  assert.equal(amb.db.consultas < 50, true);
  const limpo = t => (t || '').replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  const esquema = d => d.db.prepare(`SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name <> 'migracoes_aplicadas' ORDER BY name`)
    .all().map(r => ({ type: r.type, name: r.name, sql: limpo(r.sql) }));
  assert.deepEqual(esquema(amb.db), esquema(bancoDeTeste()));
  assert.equal(amb.db.db.prepare('SELECT COUNT(*) n FROM servicos').get().n, 3);
});

test('cada migração cabe no limite gratuito de 50 consultas por pedido', () => {
  for (const f of ['0001_inicial.sql', '0002_dados_iniciais.sql']) {
    const n = dividirSql(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8')).length;
    assert.ok(n + 4 <= 50, `${f}: ${n} comandos`);
  }
});

test('dois pedidos instalando ao mesmo tempo: nada duplica nem quebra', async () => {
  const amb = ambiente();
  await Promise.all(Array.from({ length: 6 }, () => amb.chamar('GET', '/api/admin/eu')));
  const r = await ate200(amb, 'GET', '/api/admin/eu');
  assert.equal(r.status, 401);
  assert.equal(amb.db.db.prepare('SELECT COUNT(*) n FROM migracoes_aplicadas').get().n, 2);
});

test('convites por segredo de instalação: segredo errado recusado; porta fecha quando as duas têm passkey', async () => {
  const amb = ambiente();
  assert.equal((await ate200(amb, 'POST', '/api/instalacao/convites', { corpo: { segredo: 'errado' } })).dados.erro, 'segredo_incorreto');
  const s = await primeiroAcesso(amb, 'saara');
  // convite antigo da Julianny foi anulado ao pedir de novo
  const novo = await amb.chamar('POST', '/api/instalacao/convites', { corpo: { segredo: SEGREDO } });
  assert.deepEqual(Object.keys(novo.dados.convites), ['julianny']);
  assert.equal((await amb.chamar('POST', '/api/auth/convite/opcoes', { corpo: { convite: s.convites.julianny } })).dados.erro, 'convite_invalido');
  const aj = new AparelhoFalso({ origem: ORIGEM, rpId: RP_ID });
  const o = await amb.chamar('POST', '/api/auth/convite/opcoes', { corpo: { convite: novo.dados.convites.julianny } });
  await amb.chamar('POST', '/api/auth/convite/concluir', { corpo: { convite: novo.dados.convites.julianny, desafioId: o.dados.desafioId, resposta: await aj.criar(o.dados.opcoes) } });
  assert.equal((await amb.chamar('POST', '/api/instalacao/convites', { corpo: { segredo: SEGREDO } })).dados.erro, 'instalacao_concluida');
});

test('sem segredo configurado no Cloudflare, a instalação fica fechada', async () => {
  const amb = ambiente(); delete amb.env.INSTALACAO_SEGREDO;
  const r = await ate200(amb, 'POST', '/api/instalacao/convites', { corpo: { segredo: '' } });
  assert.deepEqual([r.status, r.dados.erro], [503, 'instalacao_nao_configurada']);
  amb.env.INSTALACAO_SEGREDO = 'curto';
  assert.equal((await amb.chamar('POST', '/api/instalacao/convites', { corpo: { segredo: 'curto' } })).dados.erro, 'instalacao_nao_configurada');
});

test('50 reservas fictícias simultâneas pela API: 1 grava, 49 "horário ocupado", nenhuma sobreposição', async () => {
  const amb = ambiente();
  const { cookie } = await primeiroAcesso(amb);
  const alvo = (await amb.chamar('GET', '/api/teste/alvo', { cookie })).dados;
  assert.equal(alvo.servico, 'f1');
  const r = await Promise.all(Array.from({ length: 50 }, () => amb.chamar('POST', '/api/teste/reserva-ficticia', { cookie, corpo: alvo })));
  const cont = r.reduce((m, x) => ({ ...m, [x.status]: (m[x.status] || 0) + 1 }), {});
  assert.deepEqual(cont, { 200: 1, 409: 49 });
  const sit = (await amb.chamar('GET', '/api/teste/situacao', { cookie })).dados;
  assert.equal(sit.sobreposicoes, 0);
  assert.equal(sit.reservas.length, 1);
  assert.equal(sit.reservas[0].casas, 11);
  assert.equal(sit.corrente.ok, true);
  const alvo2 = (await amb.chamar('GET', '/api/teste/alvo', { cookie })).dados;
  assert.notDeepEqual(alvo2, alvo, 'o próximo alvo pula o horário ocupado');
});

test('prazo no servidor real: comprovante fictício aos 16 min aceito; outra reserva aos 18 min recusada e liberada aos 19', async () => {
  const amb = ambiente();
  const { cookie } = await primeiroAcesso(amb);
  const a1 = (await amb.chamar('GET', '/api/teste/alvo', { cookie })).dados;
  const r1 = (await amb.chamar('POST', '/api/teste/reserva-ficticia', { cookie, corpo: a1 })).dados;
  const a2 = (await amb.chamar('GET', '/api/teste/alvo', { cookie })).dados;
  const r2 = (await amb.chamar('POST', '/api/teste/reserva-ficticia', { cookie, corpo: a2 })).dados;
  amb.relogio.andar(16 * MIN);
  assert.equal((await amb.chamar('POST', '/api/teste/comprovante-ficticio', { cookie, corpo: { codigo: r1.codigo } })).dados.status, 'em_analise');
  amb.relogio.andar(2 * MIN);
  assert.equal((await amb.chamar('POST', '/api/teste/comprovante-ficticio', { cookie, corpo: { codigo: r2.codigo } })).dados.erro, 'prazo_encerrado');
  amb.relogio.andar(1 * MIN + 1);
  const sit = (await amb.chamar('GET', '/api/teste/situacao', { cookie })).dados;
  const st = Object.fromEntries(sit.reservas.map(x => [x.codigo, [x.status, x.casas]]));
  assert.deepEqual(st[r1.codigo], ['em_analise', 11]);
  assert.deepEqual(st[r2.codigo], ['expirado', 0]);
  amb.relogio.andar(31 * MIN);
  const sit2 = (await amb.chamar('GET', '/api/teste/situacao', { cookie })).dados;
  assert.equal(sit2.reservas.find(x => x.codigo === r1.codigo).alerta_nivel, 1, 'aviso de 30 min');
});

test('teste 9 (servidor temporário): rotas de teste exigem sessão e só existem nesse modo', async () => {
  const amb = ambiente();
  await primeiroAcesso(amb);
  for (const r of ROTAS.filter(x => x.modos.includes('teste-passkey') && x.n !== NIVEL.PUBLICO)) {
    const x = await amb.chamar(r.m, r.p, { corpo: {} });
    assert.equal(x.status, 401, `${r.m} ${r.p}`);
  }
  for (const modo of ['completo', 'desligado']) {
    const app = criarApp({ verif: verificadorTeste });
    for (const p of ['/api/teste/alvo', '/api/teste/situacao', '/api/instalacao/convites', '/api/teste/reserva-ficticia']) {
      const res = await app(new Request(ORIGEM + p, { method: p.includes('situacao') || p.includes('alvo') ? 'GET' : 'POST',
        headers: { Origin: ORIGEM, 'Content-Type': 'application/json' }, body: p.includes('situacao') || p.includes('alvo') ? undefined : '{}' }),
        { DB: bancoDeTeste(), ORIGEM, RP_ID, MODO: modo, INSTALACAO_SEGREDO: SEGREDO });
      assert.equal(res.status, 404, `${modo} ${p}`);
    }
  }
});

test('build: produção recebe só a página "em preparação"; o ramo de teste recebe a página de passkeys; protótipo nunca entra', async () => {
  const { execFileSync } = await import('node:child_process');
  const { readdirSync, readFileSync: ler, mkdtempSync, cpSync } = await import('node:fs');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const raiz = new URL('..', import.meta.url).pathname;
  for (const [ramo, esperado] of [['main', ['_headers', 'index.html']], ['teste-passkey', ['_headers', 'index.html', 'teste.js']]]) {
    const dir = mkdtempSync(join(tmpdir(), 'build-'));
    for (const p of ['public', 'teste-passkey', 'scripts']) cpSync(join(raiz, p), join(dir, p), { recursive: true });
    execFileSync('node', ['scripts/build.mjs'], { cwd: dir, env: { ...process.env, CF_PAGES_BRANCH: ramo } });
    assert.deepEqual(readdirSync(join(dir, 'dist')).sort(), esperado, ramo);
    const idx = ler(join(dir, 'dist/index.html'), 'utf8');
    assert.match(idx, ramo === 'main' ? /Sistema em preparação/ : /Teste de passkeys/);
  }
});
