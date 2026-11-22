// Instala e atualiza as tabelas sozinho, sem linha de comando: cada pedido confere se falta alguma migração.
// No plano gratuito cada pedido pode fazer até 50 consultas ao D1, então aplicamos UMA migração por pedido,
// num lote atômico (ou entra inteira, ou nada entra). Enquanto falta alguma, a API responde 503 "instalando".
import { MIGRACOES } from './migracoes.gerado.js';

const prontos = new WeakSet(); // bancos já conferidos neste processo

/** Divide um arquivo SQL em comandos, respeitando textos entre aspas e gatilhos BEGIN … END. */
export function dividirSql(sql) {
  const semComentarios = sql.split('\n').map(l => {
    let dentro = false;
    for (let i = 0; i < l.length; i++) {
      if (l[i] === "'") dentro = !dentro;
      else if (!dentro && l[i] === '-' && l[i + 1] === '-') return l.slice(0, i);
    }
    return l;
  }).join('\n');
  const comandos = [];
  let atual = '', aspas = false;
  for (const c of semComentarios) {
    atual += c;
    if (c === "'") aspas = !aspas;
    if (c === ';' && !aspas) {
      const t = atual.trim();
      const gatilho = /^CREATE\s+TRIGGER/i.test(t);
      if (!gatilho || /\bEND\s*;$/i.test(t)) { comandos.push(t.replace(/;$/, '').trim()); atual = ''; }
    }
  }
  if (atual.trim()) comandos.push(atual.trim());
  return comandos.filter(Boolean);
}

/** Devolve true quando o banco está completo; false se ainda falta migração (aplicou uma e parou). */
export async function garantirEsquema(db, agoraMs = Date.now()) {
  if (prontos.has(db)) return true;
  await db.prepare('CREATE TABLE IF NOT EXISTS migracoes_aplicadas (nome TEXT PRIMARY KEY, aplicada_em INTEGER NOT NULL)').run();
  const feitas = new Set((await db.prepare('SELECT nome FROM migracoes_aplicadas').all()).results.map(r => r.nome));
  const pendentes = MIGRACOES.filter(m => !feitas.has(m.nome));
  if (!pendentes.length) { prontos.add(db); return true; }
  const m = pendentes[0];
  try {
    await db.batch([
      ...dividirSql(m.sql).map(s => db.prepare(s)),
      db.prepare('INSERT INTO migracoes_aplicadas (nome, aplicada_em) VALUES (?, ?)').bind(m.nome, agoraMs)
    ]);
  } catch (e) {
    // Outro pedido pode ter aplicado a mesma migração ao mesmo tempo: aí está tudo certo.
    const ja = await db.prepare('SELECT 1 ok FROM migracoes_aplicadas WHERE nome = ?').bind(m.nome).first();
    if (!ja) throw e;
  }
  if (pendentes.length === 1) { prontos.add(db); return true; }
  return false;
}
