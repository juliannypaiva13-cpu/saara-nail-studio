// Monta a pasta dist/ que o Cloudflare Pages publica. O Cloudflare informa o ramo em CF_PAGES_BRANCH.
//  - ramo "teste-passkey": página de teste de passkeys (servidor temporário, sem dados reais);
//  - qualquer outro ramo (inclusive main/produção): só a página "Sistema em preparação".
// O protótipo (pasta prototipo/) NUNCA entra no dist: fica no repositório só como referência aprovada.
import { rmSync, mkdirSync, cpSync, readdirSync } from 'node:fs';

const ramo = process.env.CF_PAGES_BRANCH || 'local';
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
cpSync('public', 'dist', { recursive: true });
if (ramo === 'teste-passkey') cpSync('teste-passkey', 'dist', { recursive: true });
console.log(`ramo: ${ramo} · dist: ${readdirSync('dist').join(', ')}`);
