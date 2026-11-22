// Adaptador de produção: @simplewebauthn/server v13 (biblioteca mantida e auditada pela comunidade).
// A mesma interface do verificador de teste, para que auth.js não dependa da biblioteca.
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} from '@simplewebauthn/server';

const te = new TextEncoder();

export const verificadorProducao = {
  async opcoesCadastro({ rpId, rpNome, userId, userName, excluir }) {
    return generateRegistrationOptions({
      rpName: rpNome, rpID: rpId, userName, userDisplayName: userName, userID: te.encode(userId),
      attestationType: 'none',
      excludeCredentials: excluir.map(e => ({ id: e.id, transports: e.transportes })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      supportedAlgorithmIDs: [-7, -257]
    });
  },
  async verificarCadastro({ resposta, desafio, origem, rpId }) {
    const r = await verifyRegistrationResponse({ response: resposta, expectedChallenge: desafio, expectedOrigin: origem,
                                                 expectedRPID: rpId, requireUserVerification: true });
    if (!r.verified || !r.registrationInfo) throw new Error('nao_verificado');
    const c = r.registrationInfo.credential;
    return { credId: c.id, chavePublica: c.publicKey, contador: c.counter, transportes: c.transports ?? resposta.response?.transports ?? [] };
  },
  async opcoesLogin({ rpId, permitir }) {
    return generateAuthenticationOptions({ rpID: rpId, userVerification: 'required',
                                           allowCredentials: permitir.map(p => ({ id: p.id, transports: p.transportes })) });
  },
  async verificarLogin({ resposta, desafio, origem, rpId, credencial }) {
    const r = await verifyAuthenticationResponse({
      response: resposta, expectedChallenge: desafio, expectedOrigin: origem, expectedRPID: rpId, requireUserVerification: true,
      credential: { id: credencial.id, publicKey: credencial.chavePublica, counter: credencial.contador, transports: credencial.transportes }
    });
    if (!r.verified) throw new Error('nao_verificado');
    return { novoContador: r.authenticationInfo.newCounter };
  }
};
