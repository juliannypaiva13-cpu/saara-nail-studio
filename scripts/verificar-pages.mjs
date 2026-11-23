// Conferências de compatibilidade com o Cloudflare Pages, rodadas no build (e nos testes).
// Falham cedo e com mensagem clara, em vez de um erro obscuro no meio da implantação.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** wrangler.toml: Pages (não Worker), binding DB, database_id real, produção sem modo "completo". */
export function verificarConfiguracao(raiz, { exigirId }) {
  const erros = [];
  for (const f of ['wrangler.json', 'wrangler.jsonc'])
    if (existsSync(join(raiz, f))) erros.push(`Apague ${f}: o projeto usa só wrangler.toml (dois arquivos de configuração entram em conflito).`);
  const caminho = join(raiz, 'wrangler.toml');
  if (!existsSync(caminho)) return [...erros, 'wrangler.toml não encontrado.'];
  const t = readFileSync(caminho, 'utf8').replace(/#.*$/gm, '');
  if (!/^\s*pages_build_output_dir\s*=\s*"\.?\/?dist"/m.test(t)) erros.push('wrangler.toml precisa de pages_build_output_dir = "./dist" (configuração de Pages).');
  if (/^\s*main\s*=/m.test(t) || /^\s*\[assets\]/m.test(t)) erros.push('wrangler.toml tem "main" ou "[assets]": isso é configuração de Worker, não de Pages.');
  if (/MODO\s*=\s*"completo"/.test(t)) erros.push('MODO = "completo" não é permitido antes da Fase 5 (abriria reservas reais).');
  const ids = [...t.matchAll(/database_id\s*=\s*"([^"]*)"/g)].map(m => m[1]);
  const binds = [...t.matchAll(/binding\s*=\s*"([^"]*)"/g)].map(m => m[1]);
  const kvIds = [...t.matchAll(/^\s*id\s*=\s*"([^"]*)"/gm)].map(m => m[1]);
  if (!binds.includes('DB')) erros.push('Falta a ligação do banco com binding = "DB".');
  if (!binds.includes('COMPROVANTES')) erros.push('Falta a ligação do armazenamento de comprovantes com binding = "COMPROVANTES" (KV).');
  if (exigirId) for (const id of ids) if (!UUID.test(id))
    erros.push(`database_id "${id}" não é um ID de D1. Copie o ID de saara-nail-studio-db no painel (D1) e cole no wrangler.toml.`);
  if (exigirId) for (const id of kvIds) if (!/^[0-9a-f]{32}$/i.test(id))
    erros.push(`id do KV "${id}" não é um ID de KV. Copie o ID de saara-comprovantes no painel (KV) e cole no wrangler.toml.`);
  return erros;
}

/** Percorre as importações a partir das Functions: só caminhos relativos existentes e pacotes declarados. */
export function verificarImportacoes(raiz) {
  const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));
  const permitidos = new Set(Object.keys(pkg.dependencies || {}));
  const entradas = [];
  const andar = d => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? andar(p) : /\.(m?js)$/.test(f) && entradas.push(p); } };
  andar(join(raiz, 'functions'));
  const vistos = new Set(), erros = [], pacotes = new Set();
  const visitar = arq => {
    if (vistos.has(arq)) return; vistos.add(arq);
    const fonte = readFileSync(arq, 'utf8');
    for (const m of fonte.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const alvo = m[1] || m[2];
      if (alvo.startsWith('.')) {
        const p = resolve(dirname(arq), alvo);
        if (!existsSync(p)) erros.push(`${relative(raiz, arq)} importa ${alvo}, que não existe.`); else visitar(p);
      } else if (alvo.startsWith('node:')) erros.push(`${relative(raiz, arq)} usa ${alvo}: módulo do Node não deve entrar nas Functions.`);
      else { const nome = alvo.startsWith('@') ? alvo.split('/').slice(0, 2).join('/') : alvo.split('/')[0];
             pacotes.add(nome); if (!permitidos.has(nome)) erros.push(`${relative(raiz, arq)} importa ${nome}, que não está em dependencies.`); }
    }
    if (/\bprocess\.env\b/.test(fonte.replace(/globalThis\.process\?\.env/g, ''))) erros.push(`${relative(raiz, arq)} usa process.env (não existe nas Functions; use env).`);
  };
  entradas.forEach(visitar);
  return { erros, arquivos: [...vistos].map(a => relative(raiz, a)).sort(), pacotes: [...pacotes] };
}
