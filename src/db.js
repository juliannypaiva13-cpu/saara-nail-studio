// Ajudantes para o D1. O D1 executa um lote (batch) como uma transação: tudo grava ou nada grava.
// Não existe transação interativa (ler, decidir e gravar com o banco travado), então:
//  - conflitos de horário são barrados pela chave única de casas_ocupadas;
//  - condições lidas antes viram "afirmações" dentro do lote, que derrubam o lote se deixarem de valer.

export class ErroBanco extends Error {
  constructor(codigo, original) { super(codigo); this.codigo = codigo; this.original = original; }
}

/** Classifica o erro do SQLite/D1 num código que o resto do sistema entende. */
export function classificar(err) {
  const m = String(err && (err.message || err));
  if (/UNIQUE constraint failed: casas_ocupadas|casas_ocupadas\.dia/.test(m)) return 'horario_ocupado';
  if (/afirmacoes\.ok/.test(m)) return 'condicao_mudou';
  if (/UNIQUE constraint failed: comprovantes/.test(m)) return 'comprovante_repetido';
  if (/pag_um_confirmado|UNIQUE constraint failed: pagamentos/.test(m)) return 'pagamento_ja_confirmado';
  if (/solic_uma_pendente|UNIQUE constraint failed: solicitacoes/.test(m)) return 'solicitacao_ja_pendente';
  if (/reembolso_maior_que_pago/.test(m)) return 'reembolso_maior_que_pago';
  if (/somente_inclusao/.test(m)) return 'registro_imutavel';
  return 'erro_banco';
}

/** Afirmação: o lote só segue se a consulta SQL devolver verdadeiro. */
export function afirmar(db, condicaoSql, ...params) {
  return db.prepare(`INSERT INTO afirmacoes (ok) SELECT CASE WHEN (${condicaoSql}) THEN 1 END`).bind(...params);
}
export function limparAfirmacoes(db) { return db.prepare('DELETE FROM afirmacoes'); }

/** Executa um lote atômico; converte falhas em ErroBanco com código. */
export async function lote(db, comandos) {
  try {
    return await db.batch([...comandos, limparAfirmacoes(db)]);
  } catch (err) {
    throw new ErroBanco(classificar(err), err);
  }
}
