// npm run build → pasta dist/ que o Cloudflare Pages publica. As Functions (functions/) o Pages compila sozinho.
// O Cloudflare informa o ramo em CF_PAGES_BRANCH e define CF_PAGES=1 durante o build.
//  - ramo "teste-passkey": página de teste de passkeys (servidor temporário, sem dados reais);
//  - qualquer outro ramo (inclusive main/produção): só a página "Sistema em preparação".
// O protótipo (pasta prototipo/) NUNCA entra no dist: fica no repositório só como referência aprovada.
import { rmSync, mkdirSync, cpSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { verificarConfiguracao, verificarImportacoes } from './verificar-pages.mjs';

const raiz = process.cwd();
const noCloudflare = process.env.CF_PAGES === '1';
const ramo = process.env.CF_PAGES_BRANCH || 'local';

const parar = (titulo, erros) => { console.error(`\n✖ ${titulo}\n${erros.map(e => `  - ${e}`).join('\n')}\n`); process.exit(1); };

// 1. Configuração de Pages (no Cloudflare o database_id precisa ser real; localmente aceita o marcador).
const cfg = verificarConfiguracao(raiz, { exigirId: noCloudflare });
if (cfg.length) parar('Configuração do Cloudflare Pages com problema:', cfg);

// 2. Functions: importações resolvem e não usam nada que o Pages não tenha.
const imp = verificarImportacoes(raiz);
if (imp.erros.length) parar('Functions incompatíveis com o Pages:', imp.erros);
if (noCloudflare && !existsSync('node_modules/@simplewebauthn/server'))
  parar('Dependências não instaladas:', ['O Pages instala sozinho quando há package.json. Confira se SKIP_DEPENDENCY_INSTALL não está ativado.']);

// 3. Arquivos estáticos.
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
cpSync('public', 'dist', { recursive: true });
if (ramo === 'teste-passkey') cpSync('teste-passkey', 'dist', { recursive: true });
// Só /api/* aciona as Functions; o resto é estático (não gasta pedidos do plano gratuito).
writeFileSync('dist/_routes.json', JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }, null, 2) + '\n');

const conteudo = readdirSync('dist');
if (conteudo.some(f => /prototipo|\.sql$|\.toml$/.test(f))) parar('dist/ com arquivo que não deve ser publicado:', conteudo);
console.log(`✔ ramo: ${ramo} · dist: ${conteudo.join(', ')} · functions: ${imp.arquivos.length} arquivos, pacotes: ${imp.pacotes.join(', ') || 'nenhum'}`);
