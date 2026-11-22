// Página de teste: usa a API do navegador (WebAuthn) diretamente, sem bibliotecas externas.
const $ = id => document.getElementById(id);
const saida = (titulo, dados, ok = true) => {
  $('saida').innerHTML = '';
  const h = document.createElement('div'); h.className = ok ? 'ok' : 'erro'; h.textContent = titulo;
  const p = document.createElement('div'); p.textContent = typeof dados === 'string' ? dados : JSON.stringify(dados, null, 2);
  $('saida').append(h, p);
};
const b64uParaBuf = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); const b = atob(s + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)).buffer; };
const bufParaB64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function api(caminho, corpo, metodo = 'POST', tentativa = 0) {
  const r = await fetch(caminho, { method: metodo, credentials: 'same-origin',
    headers: metodo === 'GET' ? {} : { 'Content-Type': 'application/json' }, body: metodo === 'GET' ? undefined : JSON.stringify(corpo || {}) });
  const dados = await r.json().catch(() => ({}));
  if (r.status === 503 && dados.erro === 'instalando_banco' && tentativa < 4) {
    await new Promise(ok => setTimeout(ok, 800)); return api(caminho, corpo, metodo, tentativa + 1);
  }
  if (!r.ok) throw Object.assign(new Error(dados.erro || `erro ${r.status}`), { dados });
  return dados;
}
function paraCriacao(o) {
  return { ...o, challenge: b64uParaBuf(o.challenge), user: { ...o.user, id: b64uParaBuf(o.user.id) },
           excludeCredentials: (o.excludeCredentials || []).map(c => ({ ...c, id: b64uParaBuf(c.id) })) };
}
function paraUso(o) {
  return { ...o, challenge: b64uParaBuf(o.challenge), allowCredentials: (o.allowCredentials || []).map(c => ({ ...c, id: b64uParaBuf(c.id) })) };
}
function credParaJson(c) {
  const r = c.response, j = { id: c.id, rawId: bufParaB64u(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults(),
    authenticatorAttachment: c.authenticatorAttachment ?? undefined, response: { clientDataJSON: bufParaB64u(r.clientDataJSON) } };
  if (r.attestationObject) { j.response.attestationObject = bufParaB64u(r.attestationObject); j.response.transports = r.getTransports ? r.getTransports() : []; }
  if (r.authenticatorData) { j.response.authenticatorData = bufParaB64u(r.authenticatorData); j.response.signature = bufParaB64u(r.signature);
                             if (r.userHandle) j.response.userHandle = bufParaB64u(r.userHandle); }
  return j;
}
const acao = (id, fn) => $(id).addEventListener('click', async () => {
  const t0 = performance.now();
  try { const d = await fn(); saida(`OK (${Math.round(performance.now() - t0)} ms no total)`, d); }
  catch (e) { saida(`Falhou: ${e.message}`, e.dados || String(e), false); }
});

acao('bCadastrar', async () => {
  const convite = $('convite').value.trim();
  const o = await api('/api/auth/convite/opcoes', { convite });
  const c = await navigator.credentials.create({ publicKey: paraCriacao(o.opcoes) });
  const r = await api('/api/auth/convite/concluir', { convite, desafioId: o.desafioId, resposta: credParaJson(c) });
  $('convite').value = '';
  return r.codigosRecuperacao ? { mensagem: 'Passkey criada. Anote os códigos de recuperação (teste):', codigos: r.codigosRecuperacao } : r;
});
acao('bEntrar', async () => {
  const o = await api('/api/auth/login/opcoes');
  const c = await navigator.credentials.get({ publicKey: paraUso(o.opcoes), mediation: 'optional' });
  await api('/api/auth/login/concluir', { desafioId: o.desafioId, resposta: credParaJson(c) });
  return api('/api/admin/eu', null, 'GET');
});
acao('bEu', () => api('/api/admin/eu', null, 'GET'));
acao('bSair', () => api('/api/admin/sair'));
acao('bReaut', async () => {
  const o = await api('/api/admin/reautenticar/opcoes');
  const c = await navigator.credentials.get({ publicKey: paraUso(o.opcoes) });
  return api('/api/admin/reautenticar/concluir', { desafioId: o.desafioId, resposta: credParaJson(c) });
});
acao('bAud', () => api('/api/admin/auditoria', null, 'GET'));
acao('bSessoes', () => api('/api/admin/sessoes', null, 'GET'));
acao('bPasskeys', () => api('/api/admin/passkeys', null, 'GET'));
acao('bConvOutra', async () => {
  const eu = await api('/api/admin/eu', null, 'GET');
  return api('/api/admin/convites', { para: eu.id === 'saara' ? 'julianny' : 'saara' });
});
acao('bCodigos', () => api('/api/admin/recuperacao/novos-codigos'));
acao('bRecuperar', async () => { const r = await api('/api/auth/recuperar', { codigo: $('codigo').value }); $('codigo').value = '';
  return { mensagem: 'Convite de recuperação gerado. Cole no campo 1 para cadastrar este aparelho.', convite: r.conviteToken }; });

acao('bInstalar', async () => { const r = await api('/api/instalacao/convites', { segredo: $('segredo').value }); $('segredo').value = '';
  return { mensagem: 'Convites de primeiro acesso (uso único, valem 24 h). Cada uma cola o seu no campo 1, no próprio celular.', ...r }; });

const hora = ms => new Date(ms).toLocaleTimeString('pt-BR', { timeZone: 'America/Fortaleza' });
acao('b50', async () => {
  const alvo = await api('/api/teste/alvo', null, 'GET');
  const t0 = performance.now();
  const r = await Promise.all(Array.from({ length: 50 }, () =>
    fetch('/api/teste/reserva-ficticia', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(alvo) })
      .then(async x => ({ status: x.status, erro: (await x.json().catch(() => ({}))).erro }))));
  const gravaram = r.filter(x => x.status === 200).length, ocupado = r.filter(x => x.erro === 'horario_ocupado').length;
  const sit = await api('/api/teste/situacao', null, 'GET');
  return { resultado: gravaram === 1 && ocupado === 49 && sit.sobreposicoes === 0 ? 'APROVADO' : 'REPROVADO: avise o Claude',
           horario: `${alvo.dia} ${String(alvo.inicio / 60 | 0).padStart(2, '0')}:${String(alvo.inicio % 60).padStart(2, '0')}`,
           gravaram, horarioOcupado: ocupado, outros: r.filter(x => x.status !== 200 && x.erro !== 'horario_ocupado'),
           sobreposicoesNoBanco: sit.sobreposicoes, tempoMs: Math.round(performance.now() - t0) };
});
acao('bUma', async () => {
  const alvo = await api('/api/teste/alvo', null, 'GET');
  const r = await api('/api/teste/reserva-ficticia', alvo);
  $('codReserva').value = r.codigo;
  return { codigo: r.codigo, criadaAs: hora(r.criadaEm), clienteVeriaAte: hora(r.prazoVisivelEm), servidorAceitaAte: hora(r.prazoFinalEm) };
});
acao('bComp', () => api('/api/teste/comprovante-ficticio', { codigo: $('codReserva').value.trim() }));
acao('bSit', () => api('/api/teste/situacao', null, 'GET'));
