// Comprovantes de Pix: armazenamento privado (Workers KV, binding COMPROVANTES — sem endereço público, sem cartão).
// Fluxo: 1) a cliente pede autorização (só dentro do prazo de 17 min) → token de uso único que vale 2 min, preso
// ao tipo e ao tamanho declarados; 2) envia o arquivo (já comprimido no navegador) com o token; 3) o servidor confere
// tipo real pelos primeiros bytes, tamanho e conteúdo perigoso, guarda no KV e registra no banco no mesmo passo.
// O comprovante NUNCA confirma o pagamento: só coloca "em análise" até uma administradora conferir no banco.
import { afirmar, lote } from './db.js';
import { registrarComprovante } from './reservas.js';
import { ErroRegra, VALIDADE_ENVIO_MS } from './regras.js';
import { novoId, tokenSecreto, sha256Hex } from './util.js';

export const TAMANHO_MAXIMO = 5 * 1024 * 1024;
const ASSINATURAS = {
  'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': b => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x),
  'image/webp': b => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
  'application/pdf': b => String.fromCharCode(...b.slice(0, 5)) === '%PDF-'
};
export const TIPOS_ACEITOS = Object.keys(ASSINATURAS);
// PDFs com ações automáticas, scripts ou arquivos embutidos são recusados (comprovante bancário não precisa disso).
const PDF_PERIGOSO = /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA|AA)\b/;

export async function autorizarEnvio(db, { codigo, tipo, tamanho, agoraMs }) {
  if (!TIPOS_ACEITOS.includes(tipo)) throw new ErroRegra('tipo_de_arquivo_nao_aceito');
  const t = Number(tamanho);
  if (!Number.isInteger(t) || t <= 0 || t > TAMANHO_MAXIMO) throw new ErroRegra('arquivo_grande_demais');
  const a = await db.prepare('SELECT id, status, prazo_final_em FROM agendamentos WHERE codigo = ?').bind(String(codigo || '').toUpperCase().trim()).first();
  if (!a) throw new ErroRegra('agendamento_inexistente');
  if (a.status !== 'aguardando_comprovante' || agoraMs > a.prazo_final_em) throw new ErroRegra('prazo_encerrado');
  const n = (await db.prepare('SELECT COUNT(*) n FROM autorizacoes_envio WHERE agendamento_id = ?').bind(a.id).first()).n;
  if (n >= 5) throw new ErroRegra('tentativas_de_envio_esgotadas');
  const token = tokenSecreto();
  await db.prepare(`INSERT INTO autorizacoes_envio (token_hash, agendamento_id, tipo, tamanho_max, emitida_em, expira_em) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(await sha256Hex(token), a.id, tipo, t, agoraMs, agoraMs + VALIDADE_ENVIO_MS).run();
  return { token, expiraEm: agoraMs + VALIDADE_ENVIO_MS };
}

/** Confere o arquivo. Devolve o motivo da recusa ou null. */
export function conferirArquivo(bytes, tipo) {
  if (!bytes.length) return 'arquivo_vazio';
  if (bytes.length > TAMANHO_MAXIMO) return 'arquivo_grande_demais';
  if (!ASSINATURAS[tipo] || !ASSINATURAS[tipo](bytes)) return 'conteudo_nao_confere_com_o_tipo';
  if (tipo === 'application/pdf') {
    const texto = new TextDecoder('latin1').decode(bytes);
    if (PDF_PERIGOSO.test(texto)) return 'pdf_com_conteudo_ativo';
  }
  return null;
}

export async function receberEnvio(db, kv, { token, tipo, corpo, agoraMs }) {
  if (!kv) throw new ErroRegra('armazenamento_nao_ligado');
  const hash = await sha256Hex(String(token || ''));
  const au = await db.prepare('SELECT * FROM autorizacoes_envio WHERE token_hash = ?').bind(hash).first();
  if (!au || au.usada_em || au.expira_em < agoraMs) throw new ErroRegra('autorizacao_invalida');
  if (tipo !== au.tipo) throw new ErroRegra('tipo_diferente_do_autorizado');
  const bytes = new Uint8Array(corpo);
  if (bytes.length > au.tamanho_max) throw new ErroRegra('arquivo_maior_que_o_autorizado');
  const recusa = conferirArquivo(bytes, au.tipo);
  if (recusa) throw new ErroRegra(recusa);
  const etag = await sha256Hex(bytes);
  const objeto = `comprovantes/${au.agendamento_id}/${novoId('arq')}`;
  // Mesmo arquivo já usado em OUTRO agendamento: não recusa (a decisão é humana), mas avisa as administradoras.
  const repetido = await db.prepare(`SELECT a.codigo FROM comprovantes c JOIN agendamentos a ON a.id = c.agendamento_id
                                     WHERE c.etag = ? AND c.agendamento_id <> ? LIMIT 1`).bind(etag, au.agendamento_id).first();
  await kv.put(objeto, bytes, { metadata: { tipo: au.tipo } });
  const extras = [
    afirmar(db, 'EXISTS (SELECT 1 FROM autorizacoes_envio WHERE token_hash = ? AND usada_em IS NULL AND expira_em >= ?)', hash, agoraMs),
    db.prepare('UPDATE autorizacoes_envio SET usada_em = ? WHERE token_hash = ?').bind(agoraMs, hash)
  ];
  if (repetido) extras.push(db.prepare(`INSERT OR IGNORE INTO notificacoes (id, tipo, referencia, texto, nivel, criada_em)
                                        VALUES (?, 'comprovante_repetido', ?, ?, 0, ?)`)
    .bind(novoId('nt'), au.agendamento_id, `Atenção: o mesmo arquivo de comprovante já foi enviado no agendamento ${repetido.codigo}`, agoraMs));
  try {
    const r = await registrarComprovante(db, { agendamentoId: au.agendamento_id, objeto, etag, tipo: au.tipo, tamanho: bytes.length,
                                               recebidoEmMs: agoraMs, agoraMs, emitidaEmMs: au.emitida_em, extras });
    return { ...r, repetido: !!repetido };
  } catch (e) {
    await kv.delete(objeto).catch(() => {}); // nada registrado → nada guardado
    if (e.codigo === 'condicao_mudou' || e.codigo === 'prazo_encerrado') throw new ErroRegra('prazo_encerrado');
    throw e;
  }
}

/** Entrega o arquivo só para administradoras, sem permitir que ele rode nada no navegador. */
export async function abrirComprovante(db, kv, { id }) {
  const c = await db.prepare('SELECT * FROM comprovantes WHERE id = ?').bind(String(id || '')).first();
  if (!c) throw new ErroRegra('comprovante_inexistente');
  if (!kv) throw new ErroRegra('armazenamento_nao_ligado');
  const dados = await kv.get(c.objeto, { type: 'arrayBuffer' });
  if (!dados) throw new ErroRegra('arquivo_nao_encontrado');
  return new Response(dados, { headers: {
    'Content-Type': c.tipo, 'Content-Length': String(dados.byteLength), 'Cache-Control': 'private, no-store',
    'Content-Disposition': `${c.tipo === 'application/pdf' ? 'attachment' : 'inline'}; filename="comprovante-${c.id}.${c.tipo.split('/')[1]}"`,
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', 'Referrer-Policy': 'no-referrer'
  } });
}
