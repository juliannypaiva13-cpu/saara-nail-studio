// Imitação local do D1 sobre node:sqlite (o mesmo SQLite do D1), só para testes.
// Mesma interface: prepare().bind().first()/all()/run(), batch() atômico e exec().
// Cada await devolve o controle, então pedidos "simultâneos" se intercalam como no Worker real.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

class Comando {
  constructor(banco, sql, params = []) { this.banco = banco; this.sql = sql; this.params = params; }
  bind(...p) { return new Comando(this.banco, this.sql, p.map(v => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v))); }
  _exec() {
    const st = this.banco.db.prepare(this.sql);
    if (/^\s*(SELECT|WITH)/i.test(this.sql) && !/^\s*WITH[\s\S]*\b(INSERT|UPDATE|DELETE)\b/i.test(this.sql)) {
      return { results: st.all(...this.params), meta: { changes: 0 } };
    }
    if (/\bRETURNING\b/i.test(this.sql)) { const rows = st.all(...this.params); return { results: rows, meta: { changes: rows.length } }; }
    const r = st.run(...this.params);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async first(col) { await tique(); const r = this._exec().results[0] ?? null; return col ? r?.[col] ?? null : r; }
  async all() { await tique(); return { success: true, ...this._exec() }; }
  async run() { await tique(); return { success: true, ...this._exec() }; }
}
const tique = () => new Promise(r => setImmediate(r));

export class D1Local {
  constructor(caminho = ':memory:') {
    this.db = new DatabaseSync(caminho);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    this.consultas = 0;
  }
  prepare(sql) { this.consultas++; return new Comando(this, sql); }
  async batch(comandos) {
    await tique();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = comandos.map(c => ({ success: true, ...c._exec() }));
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  async exec(sql) { this.db.exec(sql); }
  migrar(...arquivos) { for (const a of arquivos) this.db.exec(readFileSync(a, 'utf8')); return this; }
}

export function bancoDeTeste(caminho) {
  const d = new D1Local(caminho);
  const base = new URL('../migrations/', import.meta.url);
  d.db.exec('CREATE TABLE migracoes_aplicadas (nome TEXT PRIMARY KEY, aplicada_em INTEGER NOT NULL)');
  for (const f of readdirSync(base).filter(f => /^\d{4}_.+\.sql$/.test(f)).sort()) {
    d.db.exec(readFileSync(new URL(f, base), 'utf8'));
    d.db.prepare('INSERT INTO migracoes_aplicadas VALUES (?, 0)').run(f.replace(/\.sql$/, ''));
  }
  return d;
}
