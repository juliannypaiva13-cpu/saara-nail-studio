// Acesso de Saara e Julianny: passkeys, convites, sessões, recuperação e reautenticação.
// Sem senha. O CPF nunca é usado. Segredos (tokens, códigos, cookies) só existem em claro no momento em que
// são entregues; no banco fica apenas o resumo SHA-256.
import { afirmar, lote, ErroBanco } from './db.js';
import { novoId, tokenSecreto, sha256Hex, codigoRecuperacao, b64u, deB64u, iguaisSeguro } from './util.js';
import { comandoAuditoria } from './auditoria.js';

export const CONVITE_VALIDADE_MS = 24 * 3600e3;
export const DESAFIO_VALIDADE_MS = 5 * 60e3;
export const SESSAO_OCIOSA_MS = 12 * 3600e3;
export const SESSAO_MAXIMA_MS = 7 * 24 * 3600e3;
export const REAUTENTICACAO_VALIDA_MS = 5 * 60e3;
export const QTD_CODIGOS = 10;

export class ErroAcesso extends Error {
  constructor(codigo, status = 401) { super(codigo); this.codigo = codigo; this.status = status; }
}

async function admin(db, id) {
  const a = await db.prepare('SELECT * FROM administradoras WHERE id = ? AND ativa = 1').bind(id).first();
  if (!a) throw new ErroAcesso('administradora_inexistente', 403);
  return a;
}

/* ---------- Convites ---------- */
export async function comandosConvite(db, { adminId, motivo, emitidoPor, agoraMs }) {
  const token = tokenSecreto(), id = novoId('cv');
  return {
    token, id,
    cmds: [db.prepare(`INSERT INTO convites (id, admin_id, token_hash, motivo, emitido_por, criado_em, expira_em)
                       VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, adminId, await sha256Hex(token), motivo, emitidoPor, agoraMs, agoraMs + CONVITE_VALIDADE_MS)]
  };
}
/** Usado só na instalação (linha de comando), para o primeiro acesso de cada uma. */
export async function emitirConviteInicial(db, { adminId, agoraMs }) {
  await admin(db, adminId);
  const { token, cmds } = await comandosConvite(db, { adminId, motivo: 'primeiro_acesso', emitidoPor: 'instalacao', agoraMs });
  await lote(db, [...cmds, ...await comandoAuditoria(db, { quando: agoraMs, acao: 'convite_inicial', entidade: adminId })]);
  return token;
}
async function conviteValido(db, token, agoraMs) {
  const c = await db.prepare('SELECT * FROM convites WHERE token_hash = ?').bind(await sha256Hex(String(token || ''))).first();
  if (!c || c.usado_em || c.expira_em < agoraMs) throw new ErroAcesso('convite_invalido');
  return c;
}

/**
 * Convites de primeiro acesso SEM linha de comando: quem sabe o segredo de instalação (guardado só no
 * Cloudflare, como "Secret") recebe um convite para cada administradora que ainda não tem passkey.
 * Quando as duas já têm passkey, esta porta se fecha sozinha. Convites anteriores não usados são anulados.
 */
export async function convitesInstalacao(db, { segredoInformado, segredoConfigurado, agoraMs }) {
  if (typeof segredoConfigurado !== 'string' || segredoConfigurado.length < 32) throw new ErroAcesso('instalacao_nao_configurada', 503);
  if (!iguaisSeguro(await sha256Hex(String(segredoInformado || '')), await sha256Hex(segredoConfigurado))) throw new ErroAcesso('segredo_incorreto');
  const { results } = await db.prepare(`SELECT a.id, a.nome FROM administradoras a WHERE a.ativa = 1 AND NOT EXISTS
      (SELECT 1 FROM passkeys p WHERE p.admin_id = a.id AND p.desativada_em IS NULL) ORDER BY a.id`).all();
  if (!results.length) throw new ErroAcesso('instalacao_concluida', 409);
  const convites = {}, cmds = [];
  for (const a of results) {
    cmds.push(db.prepare(`UPDATE convites SET usado_em = ? WHERE admin_id = ? AND motivo = 'primeiro_acesso' AND usado_em IS NULL`).bind(agoraMs, a.id));
    const c = await comandosConvite(db, { adminId: a.id, motivo: 'primeiro_acesso', emitidoPor: 'instalacao', agoraMs });
    convites[a.id] = c.token; cmds.push(...c.cmds);
  }
  cmds.push(...await comandoAuditoria(db, { quando: agoraMs, acao: 'convites_instalacao', dados: { para: Object.keys(convites) } }));
  await lote(db, cmds);
  return { convites, validadeHoras: CONVITE_VALIDADE_MS / 3600e3 };
}

/* ---------- Sessões ---------- */
async function comandosSessao(db, { adminId, agoraMs, aparelho, reautenticada = false }) {
  const token = tokenSecreto();
  return {
    token,
    cmd: db.prepare(`INSERT INTO sessoes (id_hash, admin_id, criada_em, ultimo_uso, expira_em, reautenticada_em, aparelho)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(await sha256Hex(token), adminId, agoraMs, agoraMs, agoraMs + SESSAO_MAXIMA_MS, reautenticada ? agoraMs : null, aparelho ?? null)
  };
}
export async function validarSessao(db, token, agoraMs) {
  if (!token) throw new ErroAcesso('sem_sessao');
  const idHash = await sha256Hex(token);
  const s = await db.prepare(`SELECT s.*, a.nome FROM sessoes s JOIN administradoras a ON a.id = s.admin_id
                              WHERE s.id_hash = ? AND a.ativa = 1`).bind(idHash).first();
  if (!s || s.encerrada_em) throw new ErroAcesso('sessao_invalida');
  if (s.expira_em < agoraMs || s.ultimo_uso + SESSAO_OCIOSA_MS < agoraMs) throw new ErroAcesso('sessao_expirada');
  if (agoraMs - s.ultimo_uso > 60e3) await db.prepare('UPDATE sessoes SET ultimo_uso = ? WHERE id_hash = ?').bind(agoraMs, idHash).run();
  return { idHash, adminId: s.admin_id, nome: s.nome, reautenticadaEm: s.reautenticada_em };
}
export function exigirReautenticacao(sessao, agoraMs) {
  if (!sessao.reautenticadaEm || agoraMs - sessao.reautenticadaEm > REAUTENTICACAO_VALIDA_MS) throw new ErroAcesso('reautenticacao_necessaria', 403);
}
export async function encerrarSessao(db, { sessao, alvoHash, agoraMs }) {
  const hash = alvoHash || sessao.idHash;
  const r = await lote(db, [
    db.prepare('UPDATE sessoes SET encerrada_em = ? WHERE id_hash = ? AND admin_id = ? AND encerrada_em IS NULL').bind(agoraMs, hash, sessao.adminId),
    ...await comandoAuditoria(db, { quando: agoraMs, adminId: sessao.adminId, acao: 'encerrar_sessao' })
  ]);
  return r[0].meta.changes;
}

/* ---------- Desafios ---------- */
async function guardarDesafio(db, { tipo, adminId = null, conviteId = null, desafio, agoraMs }) {
  const id = novoId('df');
  await db.prepare('INSERT INTO desafios (id, tipo, admin_id, convite_id, desafio, expira_em) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, tipo, adminId, conviteId, desafio, agoraMs + DESAFIO_VALIDADE_MS).run();
  return id;
}
async function desafioValido(db, id, tipo, agoraMs) {
  const d = await db.prepare('SELECT * FROM desafios WHERE id = ? AND tipo = ?').bind(id, tipo).first();
  if (!d || d.usado_em || d.expira_em < agoraMs) throw new ErroAcesso('desafio_invalido');
  return d;
}
const marcarDesafio = (db, id, agoraMs) => [
  afirmar(db, 'EXISTS (SELECT 1 FROM desafios WHERE id = ? AND usado_em IS NULL)', id),
  db.prepare('UPDATE desafios SET usado_em = ? WHERE id = ?').bind(agoraMs, id)
];

/* ---------- Cadastro de passkey (com convite) ---------- */
export async function opcoesCadastro(db, verif, cfg, { token, agoraMs }) {
  const c = await conviteValido(db, token, agoraMs);
  const a = await admin(db, c.admin_id);
  const existentes = (await db.prepare('SELECT id, transportes FROM passkeys WHERE admin_id = ? AND desativada_em IS NULL')
    .bind(a.id).all()).results.map(p => ({ id: p.id, transportes: p.transportes ? JSON.parse(p.transportes) : [] }));
  const opcoes = await verif.opcoesCadastro({ rpId: cfg.rpId, rpNome: cfg.rpNome, userId: a.id, userName: a.nome, excluir: existentes });
  const desafioId = await guardarDesafio(db, { tipo: 'cadastro', adminId: a.id, conviteId: c.id, desafio: opcoes.challenge, agoraMs });
  return { desafioId, opcoes };
}

export async function concluirCadastro(db, verif, cfg, { token, desafioId, resposta, aparelho, agoraMs }) {
  const c = await conviteValido(db, token, agoraMs);
  const d = await desafioValido(db, desafioId, 'cadastro', agoraMs);
  if (d.convite_id !== c.id) throw new ErroAcesso('desafio_invalido');
  let v;
  try { v = await verif.verificarCadastro({ resposta, desafio: d.desafio, origem: cfg.origem, rpId: cfg.rpId }); }
  catch { throw new ErroAcesso('passkey_recusada'); }
  const temCodigos = await db.prepare('SELECT COUNT(*) n FROM codigos_recuperacao WHERE admin_id = ? AND usado_em IS NULL').bind(c.admin_id).first();
  const codigos = temCodigos.n > 0 ? null : Array.from({ length: QTD_CODIGOS }, codigoRecuperacao);
  const sessao = await comandosSessao(db, { adminId: c.admin_id, agoraMs, aparelho });
  const cmds = [
    ...marcarDesafio(db, d.id, agoraMs),
    afirmar(db, 'EXISTS (SELECT 1 FROM convites WHERE id = ? AND usado_em IS NULL AND expira_em >= ?)', c.id, agoraMs),
    db.prepare('UPDATE convites SET usado_em = ? WHERE id = ?').bind(agoraMs, c.id),
    db.prepare(`INSERT INTO passkeys (id, admin_id, chave_publica, contador, transportes, aparelho, criada_em)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(v.credId, c.admin_id, b64u(v.chavePublica), v.contador, JSON.stringify(v.transportes || []), aparelho ?? null, agoraMs),
    sessao.cmd,
    ...await comandoAuditoria(db, { quando: agoraMs, adminId: c.admin_id, acao: 'passkey_cadastrada', entidade: v.credId.slice(0, 12),
                                    dados: { motivo: c.motivo, aparelho: aparelho ?? null } })
  ];
  if (codigos) for (const k of codigos)
    cmds.push(db.prepare('INSERT INTO codigos_recuperacao (id, admin_id, codigo_hash, criado_em) VALUES (?, ?, ?, ?)')
      .bind(novoId('cr'), c.admin_id, await sha256Hex(k), agoraMs));
  try { await lote(db, cmds); }
  catch (e) { if (e instanceof ErroBanco && e.codigo === 'condicao_mudou') throw new ErroAcesso('convite_invalido'); throw e; }
  return { sessaoToken: sessao.token, adminId: c.admin_id, codigosRecuperacao: codigos };
}

/* ---------- Entrada e reautenticação ---------- */
export async function opcoesLogin(db, verif, cfg, { agoraMs, sessao = null }) {
  const permitir = sessao
    ? (await db.prepare('SELECT id, transportes FROM passkeys WHERE admin_id = ? AND desativada_em IS NULL').bind(sessao.adminId).all())
        .results.map(p => ({ id: p.id, transportes: p.transportes ? JSON.parse(p.transportes) : [] }))
    : [];
  const opcoes = await verif.opcoesLogin({ rpId: cfg.rpId, permitir });
  const desafioId = await guardarDesafio(db, { tipo: sessao ? 'reautenticacao' : 'login', adminId: sessao?.adminId ?? null,
                                               desafio: opcoes.challenge, agoraMs });
  return { desafioId, opcoes };
}

export async function concluirLogin(db, verif, cfg, { desafioId, resposta, aparelho, agoraMs, sessao = null }) {
  const d = await desafioValido(db, desafioId, sessao ? 'reautenticacao' : 'login', agoraMs);
  const pk = await db.prepare(`SELECT p.* FROM passkeys p JOIN administradoras a ON a.id = p.admin_id
                               WHERE p.id = ? AND p.desativada_em IS NULL AND a.ativa = 1`).bind(String(resposta?.id || '')).first();
  if (!pk) throw new ErroAcesso('passkey_desconhecida');
  if (sessao && pk.admin_id !== sessao.adminId) throw new ErroAcesso('passkey_de_outra_conta', 403);
  let v;
  try {
    v = await verif.verificarLogin({ resposta, desafio: d.desafio, origem: cfg.origem, rpId: cfg.rpId,
      credencial: { id: pk.id, chavePublica: deB64u(pk.chave_publica), contador: pk.contador,
                    transportes: pk.transportes ? JSON.parse(pk.transportes) : [] } });
  } catch { throw new ErroAcesso('passkey_recusada'); }
  const cmds = [
    ...marcarDesafio(db, d.id, agoraMs),
    afirmar(db, 'EXISTS (SELECT 1 FROM passkeys WHERE id = ? AND contador = ? AND desativada_em IS NULL)', pk.id, pk.contador),
    db.prepare('UPDATE passkeys SET contador = ?, ultimo_uso = ? WHERE id = ?').bind(v.novoContador, agoraMs, pk.id)
  ];
  let novaSessao = null;
  if (sessao) cmds.push(db.prepare('UPDATE sessoes SET reautenticada_em = ? WHERE id_hash = ?').bind(agoraMs, sessao.idHash));
  else { novaSessao = await comandosSessao(db, { adminId: pk.admin_id, agoraMs, aparelho }); cmds.push(novaSessao.cmd); }
  cmds.push(...await comandoAuditoria(db, { quando: agoraMs, adminId: pk.admin_id, acao: sessao ? 'reautenticacao' : 'entrada' }));
  try { await lote(db, cmds); }
  catch (e) { if (e instanceof ErroBanco && e.codigo === 'condicao_mudou') throw new ErroAcesso('desafio_invalido'); throw e; }
  return { adminId: pk.admin_id, sessaoToken: novaSessao?.token ?? null };
}

/* ---------- Recuperação ---------- */
/** Código impresso → convite de recuperação para cadastrar um aparelho novo. A outra administradora é avisada. */
export async function recuperarComCodigo(db, { codigo, agoraMs }) {
  const norm = String(codigo || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const fmtCod = `${norm.slice(0, 5)}-${norm.slice(5)}`;
  const c = await db.prepare('SELECT * FROM codigos_recuperacao WHERE codigo_hash = ?').bind(await sha256Hex(fmtCod)).first();
  if (!c || c.usado_em) throw new ErroAcesso('codigo_invalido');
  const conv = await comandosConvite(db, { adminId: c.admin_id, motivo: 'recuperacao', emitidoPor: 'codigo_recuperacao', agoraMs });
  try {
    await lote(db, [
      afirmar(db, 'EXISTS (SELECT 1 FROM codigos_recuperacao WHERE id = ? AND usado_em IS NULL)', c.id),
      db.prepare('UPDATE codigos_recuperacao SET usado_em = ? WHERE id = ?').bind(agoraMs, c.id),
      ...conv.cmds,
      db.prepare(`INSERT INTO notificacoes (id, tipo, referencia, texto, nivel, criada_em) VALUES (?, 'seguranca', ?, ?, 0, ?)`)
        .bind(novoId('nt'), c.id, 'Um código de recuperação foi usado para cadastrar um aparelho novo', agoraMs),
      ...await comandoAuditoria(db, { quando: agoraMs, adminId: c.admin_id, acao: 'codigo_recuperacao_usado' })
    ]);
  } catch (e) { if (e instanceof ErroBanco && e.codigo === 'condicao_mudou') throw new ErroAcesso('codigo_invalido'); throw e; }
  return { conviteToken: conv.token };
}

/** Uma administradora emite convite de recuperação para a outra (exige passkey confirmada há pouco). */
export async function conviteParaOutra(db, { sessao, alvoId, agoraMs }) {
  exigirReautenticacao(sessao, agoraMs);
  if (alvoId === sessao.adminId) throw new ErroAcesso('use_codigo_ou_outro_aparelho', 403);
  await admin(db, alvoId);
  const conv = await comandosConvite(db, { adminId: alvoId, motivo: 'recuperacao', emitidoPor: sessao.adminId, agoraMs });
  await lote(db, [
    ...conv.cmds,
    db.prepare(`INSERT INTO notificacoes (id, tipo, referencia, texto, nivel, criada_em) VALUES (?, 'seguranca', ?, ?, 0, ?)`)
      .bind(novoId('nt'), conv.id, `${sessao.nome} emitiu um convite de recuperação de acesso`, agoraMs),
    ...await comandoAuditoria(db, { quando: agoraMs, adminId: sessao.adminId, acao: 'convite_recuperacao', entidade: alvoId })
  ]);
  return { conviteToken: conv.token };
}

/** Gera 10 códigos novos e invalida os antigos ainda não usados (exige passkey confirmada há pouco). */
export async function novosCodigos(db, { sessao, agoraMs }) {
  exigirReautenticacao(sessao, agoraMs);
  const codigos = Array.from({ length: QTD_CODIGOS }, codigoRecuperacao);
  const cmds = [db.prepare('UPDATE codigos_recuperacao SET usado_em = ? WHERE admin_id = ? AND usado_em IS NULL').bind(agoraMs, sessao.adminId)];
  for (const k of codigos) cmds.push(db.prepare('INSERT INTO codigos_recuperacao (id, admin_id, codigo_hash, criado_em) VALUES (?, ?, ?, ?)')
    .bind(novoId('cr'), sessao.adminId, await sha256Hex(k), agoraMs));
  cmds.push(...await comandoAuditoria(db, { quando: agoraMs, adminId: sessao.adminId, acao: 'novos_codigos_recuperacao' }));
  await lote(db, cmds);
  return codigos;
}

/** Desliga um aparelho (ex.: celular perdido). Não deixa a conta sem nenhuma passkey ativa. */
export async function desativarPasskey(db, { sessao, passkeyId, agoraMs }) {
  exigirReautenticacao(sessao, agoraMs);
  const pk = await db.prepare('SELECT * FROM passkeys WHERE id = ? AND desativada_em IS NULL').bind(passkeyId).first();
  if (!pk || pk.admin_id !== sessao.adminId) throw new ErroAcesso('passkey_desconhecida', 404);
  await lote(db, [
    afirmar(db, '(SELECT COUNT(*) FROM passkeys WHERE admin_id = ? AND desativada_em IS NULL) > 1', sessao.adminId),
    db.prepare('UPDATE passkeys SET desativada_em = ? WHERE id = ?').bind(agoraMs, passkeyId),
    ...await comandoAuditoria(db, { quando: agoraMs, adminId: sessao.adminId, acao: 'passkey_desativada', entidade: passkeyId.slice(0, 12) })
  ]).catch(e => { if (e.codigo === 'condicao_mudou') throw new ErroAcesso('ultima_passkey', 409); throw e; });
}
