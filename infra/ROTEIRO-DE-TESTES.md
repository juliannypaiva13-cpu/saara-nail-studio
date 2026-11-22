# Roteiro de testes reais: servidor temporário

Endereço: `https://teste-passkey.saaranailstudio.pages.dev`. Só dados de teste: reservas "TESTE FICTÍCIO", sem nome, telefone, comprovante ou valor de verdade.
Anote **APROVADO** ou **FALHOU** em cada item e me envie o resultado (pode ser um print da área "Resultado"). **Nunca envie convites, códigos de recuperação nem o segredo de instalação.**

## A. Passkeys (Saara e Julianny, cada uma no próprio celular)

| # | Passo | Esperado |
|---|---|---|
| A1 | Uma delas: seção 0, colar o segredo de instalação, **Gerar convites** | Aparecem 2 convites |
| A2 | Cada uma, no **próprio** celular: colar o seu convite na seção 1, **Criar passkey** e usar biometria ou PIN | "Passkey criada" e 10 códigos de recuperação. Anote os códigos no papel; são de teste |
| A3 | Repetir o mesmo convite | Recusa `convite_invalido` |
| A4 | **Sair** e depois **Entrar com passkey** | Entra e mostra o próprio nome |
| A5 | **Confirmar passkey de novo** e depois **Ver auditoria** | Lista as ações e `corrente.ok: true` |
| A6 | Esperar mais de 5 min e clicar em **Ver auditoria** | Recusa `reautenticacao_necessaria` |
| A7 | **Convite de recuperação para a outra** (depois de confirmar a passkey) | Gera convite. A outra pode usá-lo num 2º aparelho |
| A8 | Na seção 4, usar um código de recuperação. Usar o mesmo código de novo | O 1º gera convite; o 2º é recusado |
| A9 | Gerar convites de novo depois que as duas criaram passkey | Recusa `instalacao_concluida` |
| A10 | Testar em iPhone (Safari) e em Android (Chrome), se possível | Funciona nos dois |

## B. Persistência dos dados

| # | Passo | Esperado |
|---|---|---|
| B1 | Na seção 5, **Ver situação do banco** e anotar as contagens | Passkeys = 2 (ou mais) |
| B2 | No dia seguinte, abrir o endereço, **Entrar** e **Ver situação** | As mesmas passkeys, reservas fictícias e auditoria continuam lá |
| B3 | Cloudflare: D1, `saara-teste-passkey`, **Console**, rodar `SELECT COUNT(*) FROM passkeys;` | Mesmo número da página |
| B4 | No D1, aba **Time Travel** | Há pontos de restauração dos últimos dias |
| B5 | Depois de um **Retry deployment**, **Ver situação** | Os dados continuam: publicar não apaga o banco |

## C. Proteção dos agendamentos (dados fictícios)

| # | Passo | Esperado |
|---|---|---|
| C1 | **50 reservas no mesmo horário ao mesmo tempo** | `APROVADO`: 1 gravou, 49 "horário ocupado", 0 sobreposições |
| C2 | Repetir C1 umas 3 vezes | Sempre `APROVADO` (cada vez usa outro horário) |
| C3 | **Criar 1 reserva fictícia** e anotar o código e a hora. Aos **16 min**, **Enviar comprovante fictício** | `status: em_analise` |
| C4 | Criar outra reserva fictícia. Aos **18 min**, enviar o comprovante | Recusa `prazo_encerrado` |
| C5 | Aos 20 min, **Ver situação** | A de C3 está `em_analise` com 11 casas; a de C4 está `expirado` com 0 casas |
| C6 | Mais de 30 min depois de C3, **Ver situação** | Na reserva de C3, `alerta_nivel` = 1 (aviso de 30 min). Nada foi liberado |

## D. Desempenho e limites (Cloudflare)

- No projeto Pages, abra **Functions** ou **Metrics** e anote o **CPU time** mediano e o máximo. O limite grátis é 10 ms por pedido.
- Em **Workers & Pages**, veja o **Usage** do dia. Deve ficar muito longe de 100 mil pedidos.

## E. Ao terminar

Siga a seção 8 do `PASSO-A-PASSO.md` para desligar o servidor temporário.
