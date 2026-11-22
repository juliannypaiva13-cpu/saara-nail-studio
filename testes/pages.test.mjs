// Compatibilidade com o Cloudflare Pages: configuração, build, ponto de entrada das Functions e banco D1.
// Limite honesto: o Pages real (esbuild do Cloudflare + @simplewebauthn/server de verdade) só é exercitado na
// implantação. Aqui a biblioteca de passkeys é substituída por um dublê só para carregar o ponto de entrada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { D1Local } from './d1-local.mjs';
import { verificarImportacoes } from '../scripts/verificar-pages.mjs';
import { MIGRACOES } from '../src/migracoes.gerado.js';
import { dividirSql } from '../src/esquema.js';

const RAIZ = new URL('..', import.meta.url).pathname;
const UUID_FALSO = '00000000-0000-4000-8000-000000000000';

function copiaDoRepositorio({ comDubleDaBiblioteca = false, idReal = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pages-'));
  for (const f of readdirSync(RAIZ)) if (!['node_modules', 'dist'].includes(f)) cpSync(join(RAIZ, f), join(dir, f), { recursive: true });
  if (idReal) writeFileSync(join(dir, 'wrangler.toml'), readFileSync(join(dir, 'wrangler.toml'), 'utf8').replace('COLE_AQUI_O_DATABASE_ID', UUID_FALSO));
  if (comDubleDaBiblioteca) {
    const lib = join(dir, 'node_modules/@simplewebauthn/server');
    mkdirSync(lib, { recursive: true });
    writeFileSync(join(lib, 'package.json'), JSON.stringify({ name: '@simplewebauthn/server', type: 'module', exports: './index.js' }));
    writeFileSync(join(lib, 'index.js'), ['generateRegistrationOptions', 'verifyRegistrationResponse', 'generateAuthenticationOptions', 'verifyAuthenticationResponse']
      .map(n => `export async function ${n}() { throw new Error('duble'); }`).join('\n'));
  }
  return dir;
}
const build = (dir, env) => spawnSync('node', ['scripts/build.mjs'], { cwd: dir, env: { ...process.env, ...env }, encoding: 'utf8' });

test('wrangler.toml é de Pages: produção desligada e sem banco; prévia com DB → saara-nail-studio-db', () => {
  const j = JSON.parse(execFileSync('python3', ['-c', 'import tomllib,json,sys;print(json.dumps(tomllib.load(open(sys.argv[1],"rb"))))', join(RAIZ, 'wrangler.toml')], { encoding: 'utf8' }));
  assert.equal(j.pages_build_output_dir, './dist');
  assert.equal(j.main, undefined, 'sem "main" (isso seria Worker)');
  assert.equal(j.assets, undefined, 'sem [assets] (isso seria Worker)');
  assert.equal(j.vars.MODO, 'desligado');
  assert.equal(j.d1_databases, undefined, 'produção sem banco');
  assert.equal(j.env.preview.vars.MODO, 'teste-passkey');
  assert.equal(j.env.preview.vars.ORIGEM, 'https://teste-passkey.saaranailstudio.pages.dev');
  assert.equal(j.env.preview.vars.RP_ID, 'teste-passkey.saaranailstudio.pages.dev');
  assert.deepEqual(j.env.preview.d1_databases.map(d => [d.binding, d.database_name]), [['DB', 'saara-nail-studio-db']]);
  assert.ok(j.compatibility_flags.includes('nodejs_compat'));
  assert.doesNotMatch(readFileSync(join(RAIZ, 'wrangler.toml'), 'utf8').replace(/#.*$/gm, ''), /SEGREDO|SECRET|TOKEN|SENHA/i, 'nenhum segredo no arquivo');
});

test('npm run build: main → só "Sistema em preparação"; teste-passkey → página de teste; nunca o protótipo', () => {
  const dir = copiaDoRepositorio();
  for (const [ramo, esperado, marca] of [['main', ['_headers', '_routes.json', 'index.html'], /Sistema em preparação/],
                                          ['teste-passkey', ['_headers', '_routes.json', 'index.html', 'teste.js'], /Teste de passkeys/]]) {
    const r = build(dir, { CF_PAGES_BRANCH: ramo });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(readdirSync(join(dir, 'dist')).sort(), esperado);
    assert.match(readFileSync(join(dir, 'dist/index.html'), 'utf8'), marca);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'dist/_routes.json'), 'utf8')).include, ['/api/*']);
  }
  rmSync(dir, { recursive: true });
});

test('build no Cloudflare falha com mensagem clara sem database_id real, com wrangler.json extra ou sem dependências', () => {
  const dir = copiaDoRepositorio({ comDubleDaBiblioteca: true });
  const r1 = build(dir, { CF_PAGES: '1', CF_PAGES_BRANCH: 'main' });
  assert.notEqual(r1.status, 0); assert.match(r1.stderr, /database_id "COLE_AQUI_O_DATABASE_ID" não é um ID de D1/);
  rmSync(dir, { recursive: true });
  const ok = copiaDoRepositorio({ comDubleDaBiblioteca: true, idReal: true });
  assert.equal(build(ok, { CF_PAGES: '1', CF_PAGES_BRANCH: 'main' }).status, 0);
  writeFileSync(join(ok, 'wrangler.jsonc'), '{}');
  assert.match(build(ok, { CF_PAGES: '1', CF_PAGES_BRANCH: 'main' }).stderr, /Apague wrangler\.jsonc/);
  rmSync(ok, { recursive: true });
  const semDeps = copiaDoRepositorio({ idReal: true });
  assert.match(build(semDeps, { CF_PAGES: '1', CF_PAGES_BRANCH: 'main' }).stderr, /Dependências não instaladas/);
  rmSync(semDeps, { recursive: true });
});

test('Functions: importações resolvem, sem módulos do Node, só pacotes declarados', () => {
  const r = verificarImportacoes(RAIZ);
  assert.deepEqual(r.erros, []);
  assert.ok(r.arquivos.includes('functions/api/[[rota]].js') && r.arquivos.includes('src/app.js'));
  assert.deepEqual(r.pacotes, ['@simplewebauthn/server']);
});

test('ponto de entrada functions/api/[[rota]].js: produção desligada; prévia instala o banco e funciona', async () => {
  const dir = copiaDoRepositorio({ comDubleDaBiblioteca: true });
  const { onRequest } = await import(pathToFileURL(join(dir, 'functions/api/[[rota]].js')).href);
  const pedir = (url, env, init = {}) => onRequest({ request: new Request(url, init), env });
  // produção (variáveis do topo do wrangler.toml, sem banco)
  const prod = { MODO: 'desligado', ORIGEM: 'https://saaranailstudio.pages.dev', RP_ID: 'saaranailstudio.pages.dev' };
  const s = await (await pedir('https://saaranailstudio.pages.dev/api/saude', prod)).json();
  assert.deepEqual(s, { ok: true, modo: 'desligado', banco: 'não ligado', configuracao: 'completa', reservasReais: false });
  for (const p of ['/api/reservas', '/api/horarios', '/api/auth/login/opcoes', '/api/teste/alvo'])
    assert.equal((await pedir(`https://saaranailstudio.pages.dev${p}`, prod, { method: p.includes('horarios') || p.includes('alvo') ? 'GET' : 'POST',
      headers: { Origin: prod.ORIGEM, 'Content-Type': 'application/json' }, body: p.includes('horarios') || p.includes('alvo') ? undefined : '{}' })).status, 404, p);
  // prévia sem o banco ligado: erro explicativo, não erro interno
  const semDb = { MODO: 'teste-passkey', ORIGEM: 'https://teste-passkey.saaranailstudio.pages.dev', RP_ID: 'teste-passkey.saaranailstudio.pages.dev' };
  const r0 = await pedir(`${semDb.ORIGEM}/api/admin/eu`, semDb);
  assert.deepEqual([r0.status, (await r0.json()).erro], [503, 'banco_nao_ligado']);
  // prévia com banco vazio: instala em 2 pedidos, depois regra normal
  const prev = { ...semDb, DB: new D1Local() };
  const r1 = await pedir(`${prev.ORIGEM}/api/admin/eu`, prev);
  assert.equal(r1.status, 503);
  const r2 = await pedir(`${prev.ORIGEM}/api/admin/eu`, prev);
  assert.equal(r2.status, 401);
  assert.equal(r2.headers.get('x-frame-options'), 'DENY');
  const r3 = await pedir(`${prev.ORIGEM}/api/saude`, prev);
  assert.equal((await r3.json()).banco, 'ligado');
  rmSync(dir, { recursive: true });
});

test('banco preparado com "wrangler d1 migrations apply" é reconhecido (não aplica de novo)', async () => {
  const db = new D1Local();
  db.db.exec('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)');
  for (const m of MIGRACOES) {
    for (const c of dividirSql(m.sql)) db.db.exec(c);
    db.db.prepare('INSERT INTO d1_migrations (name, applied_at) VALUES (?, ?)').run(`${m.nome}.sql`, 'agora');
  }
  const { criarApp } = await import('../src/app.js');
  const { verificadorTeste } = await import('./autenticador-falso.mjs');
  const app = criarApp({ verif: verificadorTeste });
  const env = { DB: db, MODO: 'teste-passkey', ORIGEM: 'https://x.pages.dev', RP_ID: 'x.pages.dev' };
  assert.equal((await app(new Request('https://x.pages.dev/api/admin/eu'), env)).status, 401);
  assert.equal(db.db.prepare('SELECT COUNT(*) n FROM servicos').get().n, 3, 'dados iniciais não duplicados');
});

test('pagamentos: nenhum código confirma pagamento sozinho; reservas reais só no modo "completo", que nenhuma configuração usa', async () => {
  const fontes = [];
  const andar = d => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); f.isDirectory() ? andar(p) : /\.(m?js)$/.test(f.name) && fontes.push(p); } };
  for (const d of ['src', 'functions', 'worker-cron']) andar(join(RAIZ, d));
  for (const f of fontes.filter(x => !x.endsWith('migracoes.gerado.js'))) { // o esquema contém a REGRA (CHECK), não uma gravação
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /status\s*=\s*'confirmado'|'confirmado'\s*,\s*\?|VALUES[^;]*'confirmado'/i, `${f} grava pagamento confirmado`);
    assert.doesNotMatch(t, /MODO\s*[:=]\s*['"]completo/, `${f} liga o modo completo`);
  }
  const { ROTAS } = await import('../src/app.js');
  for (const p of ['/api/reservas', '/api/horarios']) assert.deepEqual(ROTAS.find(r => r.p === p).modos, ['completo'], p);
  for (const f of ['wrangler.toml', 'worker-cron/wrangler.toml']) assert.doesNotMatch(readFileSync(join(RAIZ, f), 'utf8'), /MODO\s*=\s*"completo"/, f);
});
