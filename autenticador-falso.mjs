// SÓ PARA TESTES. Um "celular de mentira" que cria passkeys ES256 de verdade (WebCrypto) e um verificador
// que confere o que importa: desafio, origem, RP ID, presença + verificação do usuário, assinatura e contador.
// Em produção o verificador é o @simplewebauthn/server (src/webauthn.js), testado no GitHub Actions e no
// servidor temporário com aparelhos reais.
import { b64u, deB64u, aleatorio } from '../src/util.js';

const te = new TextEncoder(), td = new TextDecoder();
const sha = async b => new Uint8Array(await crypto.subtle.digest('SHA-256', typeof b === 'string' ? te.encode(b) : b));
const junta = (...xs) => { const o = new Uint8Array(xs.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of xs) { o.set(x, i); i += x.length; } return o; };

/* CBOR mínimo (só o necessário para attestationObject 'none' e chave COSE EC2). */
function cborEnc(v) {
  const cab = (mt, n) => n < 24 ? [mt << 5 | n] : n < 256 ? [mt << 5 | 24, n] : [mt << 5 | 25, n >> 8, n & 255];
  if (typeof v === 'number') return Uint8Array.from(v >= 0 ? cab(0, v) : cab(1, -1 - v));
  if (typeof v === 'string') { const b = te.encode(v); return junta(Uint8Array.from(cab(3, b.length)), b); }
  if (v instanceof Uint8Array) return junta(Uint8Array.from(cab(2, v.length)), v);
  if (v instanceof Map) return junta(Uint8Array.from(cab(5, v.size)), ...[...v].flatMap(([k, x]) => [cborEnc(k), cborEnc(x)]));
  throw new Error('cbor');
}
function cborDec(buf) {
  let i = 0;
  const n = ai => ai < 24 ? ai : ai === 24 ? buf[i++] : ai === 25 ? (buf[i++] << 8 | buf[i++]) : (() => { throw new Error('cbor') })();
  const rd = () => {
    const b = buf[i++], mt = b >> 5, len = n(b & 31);
    if (mt === 0) return len; if (mt === 1) return -1 - len;
    if (mt === 2) { const o = buf.slice(i, i + len); i += len; return o; }
    if (mt === 3) { const o = td.decode(buf.slice(i, i + len)); i += len; return o; }
    if (mt === 4) return Array.from({ length: len }, rd);
    if (mt === 5) { const m = new Map(); for (let k = 0; k < len; k++) m.set(rd(), rd()); return m; }
    throw new Error('cbor');
  };
  const v = rd(); return { v, fim: i };
}
function derParaBruto(der) {
  let i = 2; const parte = () => { i++; const l = der[i++]; let x = der.slice(i, i + l); i += l; while (x.length > 32 && x[0] === 0) x = x.slice(1); const o = new Uint8Array(32); o.set(x, 32 - x.length); return o; };
  return junta(parte(), parte());
}
function brutoParaDer(raw) {
  const int = x => { let i = 0; while (i < 31 && x[i] === 0) i++; x = x.slice(i); if (x[0] & 0x80) x = junta(Uint8Array.of(0), x); return junta(Uint8Array.of(2, x.length), x); };
  const r = int(raw.slice(0, 32)), s = int(raw.slice(32));
  return junta(Uint8Array.of(0x30, r.length + s.length), r, s);
}

/** Aparelho de mentira. Guarda as chaves privadas; uv=false simula "sem biometria/PIN". */
export class AparelhoFalso {
  constructor({ origem, rpId }) { this.origem = origem; this.rpId = rpId; this.chaves = new Map(); }
  async criar(opcoes, { uv = true, origem = this.origem, rpId = this.rpId } = {}) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    const id = aleatorio(16), idTxt = b64u(id);
    this.chaves.set(idTxt, { kp, contador: 0 });
    const cose = cborEnc(new Map([[1, 2], [3, -7], [-1, 1], [-2, raw.slice(1, 33)], [-3, raw.slice(33)]]));
    const authData = junta(await sha(rpId), Uint8Array.of(0x01 | (uv ? 0x04 : 0) | 0x40), new Uint8Array(4),
                           new Uint8Array(16), Uint8Array.of(0, 16), id, cose);
    const clientData = te.encode(JSON.stringify({ type: 'webauthn.create', challenge: opcoes.challenge, origin: origem }));
    const att = cborEnc(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
    return { id: idTxt, rawId: idTxt, type: 'public-key',
             response: { clientDataJSON: b64u(clientData), attestationObject: b64u(att), transports: ['internal'] },
             clientExtensionResults: {}, authenticatorAttachment: 'platform' };
  }
  async usar(opcoes, { uv = true, origem = this.origem, rpId = this.rpId, credId } = {}) {
    const idTxt = credId ?? [...this.chaves.keys()][0];
    const k = this.chaves.get(idTxt);
    k.contador++;
    const authData = junta(await sha(rpId), Uint8Array.of(0x01 | (uv ? 0x04 : 0)),
                           Uint8Array.of(k.contador >>> 24, k.contador >>> 16 & 255, k.contador >>> 8 & 255, k.contador & 255));
    const clientData = te.encode(JSON.stringify({ type: 'webauthn.get', challenge: opcoes.challenge, origin: origem }));
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k.kp.privateKey, junta(authData, await sha(clientData))));
    return { id: idTxt, rawId: idTxt, type: 'public-key',
             response: { clientDataJSON: b64u(clientData), authenticatorData: b64u(authData), signature: b64u(brutoParaDer(sig)) },
             clientExtensionResults: {}, authenticatorAttachment: 'platform' };
  }
}

async function conferirComum(clientDataB64, authData, { tipo, desafio, origem, rpId }) {
  const cd = JSON.parse(td.decode(deB64u(clientDataB64)));
  if (cd.type !== tipo) throw new Error('tipo');
  if (cd.challenge !== desafio) throw new Error('desafio');
  if (cd.origin !== origem) throw new Error('origem');
  const h = await sha(rpId);
  if (!h.every((b, i) => b === authData[i])) throw new Error('rp_id');
  const flags = authData[32];
  if (!(flags & 0x01)) throw new Error('sem_presenca');
  if (!(flags & 0x04)) throw new Error('sem_verificacao_usuario');
  return { contador: (authData[33] << 24 | authData[34] << 16 | authData[35] << 8 | authData[36]) >>> 0 };
}

/** Verificador de teste com a mesma interface do adaptador de produção. */
export const verificadorTeste = {
  async opcoesCadastro({ rpId, rpNome, userId, userName, excluir }) {
    return { challenge: b64u(aleatorio(32)), rp: { id: rpId, name: rpNome }, user: { id: b64u(te.encode(userId)), name: userName },
             excludeCredentials: excluir.map(e => ({ id: e.id, type: 'public-key' })) };
  },
  async verificarCadastro({ resposta, desafio, origem, rpId }) {
    const att = cborDec(deB64u(resposta.response.attestationObject)).v;
    if (att.get('fmt') !== 'none') throw new Error('formato');
    const ad = att.get('authData');
    const { contador } = await conferirComum(resposta.response.clientDataJSON, ad, { tipo: 'webauthn.create', desafio, origem, rpId });
    if (!(ad[32] & 0x40)) throw new Error('sem_credencial');
    const idLen = ad[53] << 8 | ad[54], credId = b64u(ad.slice(55, 55 + idLen));
    if (credId !== resposta.id) throw new Error('id');
    const cose = ad.slice(55 + idLen);
    const k = cborDec(cose).v;
    if (k.get(3) !== -7) throw new Error('algoritmo');
    return { credId, chavePublica: cose, contador, transportes: resposta.response.transports };
  },
  async opcoesLogin({ rpId, permitir }) {
    return { challenge: b64u(aleatorio(32)), rpId, userVerification: 'required', allowCredentials: permitir.map(p => ({ id: p.id, type: 'public-key' })) };
  },
  async verificarLogin({ resposta, desafio, origem, rpId, credencial }) {
    const ad = deB64u(resposta.response.authenticatorData);
    const { contador } = await conferirComum(resposta.response.clientDataJSON, ad, { tipo: 'webauthn.get', desafio, origem, rpId });
    const k = cborDec(credencial.chavePublica).v;
    const pub = await crypto.subtle.importKey('raw', junta(Uint8Array.of(4), k.get(-2), k.get(-3)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, derParaBruto(deB64u(resposta.response.signature)),
                                          junta(ad, await sha(deB64u(resposta.response.clientDataJSON))));
    if (!ok) throw new Error('assinatura');
    if ((contador !== 0 || credencial.contador !== 0) && contador <= credencial.contador) throw new Error('contador_clonado');
    return { novoContador: contador };
  }
};
