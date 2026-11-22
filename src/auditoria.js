// Registro de ações administrativas, só de inclusão (o banco recusa alterar ou apagar).
// Cada registro guarda o resumo do anterior: mexer em qualquer linha quebra a corrente e isso é detectável.
import { sha256Hex } from './util.js';
import { afirmar } from './db.js';

async function calcularHash(anterior, r) {
  return sha256Hex(JSON.stringify([anterior, r.quando, r.admin_id, r.acao, r.entidade, r.dados]));
}

/** Monta o comando de auditoria para entrar no mesmo lote da ação (as duas gravam juntas ou nenhuma grava). */
export async function comandoAuditoria(db, { quando, adminId = null, acao, entidade = null, dados = null }) {
  const ultimo = await db.prepare('SELECT hash FROM auditoria ORDER BY id DESC LIMIT 1').first();
  const anterior = ultimo ? ultimo.hash : 'inicio';
  const registro = { quando, admin_id: adminId, acao, entidade, dados: dados == null ? null : JSON.stringify(dados) };
  const hash = await calcularHash(anterior, registro);
  // A afirmação de que "anterior" ainda é o último impede duas ações simultâneas de bifurcar a corrente:
  // se outra ação gravou antes, o lote inteiro (ação + auditoria) é desfeito e pode ser repetido.
  return [
    afirmar(db, `COALESCE((SELECT hash FROM auditoria ORDER BY id DESC LIMIT 1), 'inicio') = ?`, anterior),
    db.prepare(`INSERT INTO auditoria (quando, admin_id, acao, entidade, dados, hash_anterior, hash) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(registro.quando, registro.admin_id, acao, entidade, registro.dados, anterior, hash)
  ];
}

/** Confere a corrente inteira. Devolve { ok, quebraEm }. */
export async function verificarCorrente(db) {
  const { results } = await db.prepare('SELECT * FROM auditoria ORDER BY id').all();
  let anterior = 'inicio';
  for (const r of results) {
    if (r.hash_anterior !== anterior) return { ok: false, quebraEm: r.id };
    const h = await calcularHash(anterior, r);
    if (h !== r.hash) return { ok: false, quebraEm: r.id };
    anterior = r.hash;
  }
  return { ok: true, registros: results.length };
}
