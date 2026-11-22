// Copia os arquivos migrations/*.sql para src/migracoes.gerado.js (o Pages não importa .sql diretamente).
// Rode depois de mudar qualquer migração: node scripts/gerar-migracoes.mjs  (um teste confere se está em dia).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

export function conteudoGerado() {
  const dir = new URL('../migrations/', import.meta.url);
  const lista = readdirSync(dir).filter(f => /^\d{4}_.+\.sql$/.test(f)).sort()
    .map(f => ({ nome: f.replace(/\.sql$/, ''), sql: readFileSync(new URL(f, dir), 'utf8') }));
  return '// GERADO por scripts/gerar-migracoes.mjs a partir de migrations/*.sql. Não edite à mão.\n' +
         `export const MIGRACOES = ${JSON.stringify(lista, null, 2)};\n`;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL('../src/migracoes.gerado.js', import.meta.url), conteudoGerado());
  console.log('src/migracoes.gerado.js atualizado');
}
