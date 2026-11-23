import { readFileSync, existsSync } from 'node:fs';
import { verificarConfiguracao, verificarImportacoes } from './verificar-pages.mjs';
const raiz = process.cwd();
const config = readFileSync('wrangler.toml','utf8');
const build = readFileSync('scripts/build.mjs','utf8');
const checks = [
  ['Configuração sintática do projeto', verificarConfiguracao(raiz,{exigirId:false}).length===0],
  ['Importações das Functions', verificarImportacoes(raiz).erros.length===0],
  ['ID real do banco D1 configurado', !config.includes('COLE_AQUI_O_DATABASE_ID')],
  ['ID real do KV configurado', !config.includes('COLE_AQUI_O_ID_DO_KV')],
  ['Interface real integrada ao build', !build.includes("cpSync('public', 'dist'") || !existsSync('prototipo/index.html')],
  ['Produção com agendamentos liberados', /^MODO\s*=\s*"completo"/m.test(config)],
];
console.log('\nSAARA NAIL STUDIO — PRÉ-VALIDAÇÃO DE LANÇAMENTO\n');
for (const [nome, ok] of checks) console.log(`${ok?'OK':'PENDENTE'} — ${nome}`);
console.log('\nATENÇÃO: mesmo com todos os itens OK, testes reais de Cloudflare, D1, KV, WebAuthn e Pix continuam obrigatórios.');
if (checks.some(([,ok])=>!ok)) process.exitCode=1;
