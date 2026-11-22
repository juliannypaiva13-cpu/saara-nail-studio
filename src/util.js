// Utilidades sem dependências externas (WebCrypto, disponível no Worker e no Node).
const te = new TextEncoder();

export function b64u(bytes) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function deB64u(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
export function aleatorio(n = 32) { return crypto.getRandomValues(new Uint8Array(n)); }
export function novoId(prefixo) { return `${prefixo}_${b64u(aleatorio(12))}`; }
export function tokenSecreto() { return b64u(aleatorio(32)); }

export async function sha256Hex(texto) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', typeof texto === 'string' ? te.encode(texto) : texto));
  return [...d].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Código público do agendamento: 8 caracteres sem letras ambíguas (sem 0/O, 1/I/L). ~40 bits.
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function codigoAgendamento() {
  const b = aleatorio(8);
  const c = [...b].map(x => ALFABETO[x % ALFABETO.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}
// Códigos de recuperação: 10 grupos legíveis, impressos uma única vez.
export function codigoRecuperacao() {
  const b = aleatorio(10);
  const c = [...b].map(x => ALFABETO[x % ALFABETO.length]).join('');
  return `${c.slice(0, 5)}-${c.slice(5)}`;
}

/** Comparação em tempo constante para textos de mesmo tamanho. */
export function iguaisSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
