// Pages Functions: toda chamada /api/* passa pelo roteador (src/app.js).
import { criarApp } from '../../src/app.js';
import { verificadorProducao } from '../../src/webauthn.js';

const app = criarApp({ verif: verificadorProducao });
export const onRequest = ({ request, env }) => app(request, env);
