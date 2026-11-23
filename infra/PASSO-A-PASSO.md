# Passo a passo: Cloudflare Pages + D1 (repositório `juliannypaiva13-cpu/saara-nail-studio`)

Regras desta fase:
- Nenhuma reserva real é liberada.
- Nenhum serviço pago é criado.
- Nenhuma senha, token ou chave vai para o repositório ou para o chat.

## 0. Por que a implantação anterior não funcionou

O projeto foi criado como **Worker** (Create, Workers, Import a repository, com o comando `npx wrangler deploy`). Um Worker que só tem arquivos estáticos não aceita ligação com banco. Este sistema é um projeto **Pages**:
- a pasta `functions/` vira a API `/api/*`;
- a pasta `dist/` vira o site;
- o `wrangler.toml` tem `pages_build_output_dir`, que é a marca de projeto Pages.

O Pages não tem "Deploy command". Só tem Build command e Build output directory.

### 0.1 Remover o Worker criado por engano

1. **Antes de apagar, veja o que ele publicou.**
   - Abra **Workers & Pages** e clique no Worker. O endereço `…workers.dev` aparece no topo.
   - Abra no navegador esse endereço e também `/prototipo/index.html`, `/src/app.js` e `/infra/PASSO-A-PASSO.md`.
   - Se algum abrir, arquivos do repositório ficaram públicos. Isso não expõe senhas, porque não há nenhuma no código. Mesmo assim, apague o Worker já.
2. Abra o Worker, depois **Settings** (ou **Manage**), e clique em **Delete**. Isso também desliga a ligação automática dele com o GitHub.
3. No GitHub, procure um *pull request* aberto pelo Cloudflare (por exemplo "Add Wrangler configuration") e **feche sem aceitar**. Se o repositório tiver `wrangler.json` ou `wrangler.jsonc`, apague. O build recusa os dois de propósito.

## 1. Atualizar o repositório

Envie o conteúdo de `saara-nail-studio.zip` para o ramo `main`, substituindo os arquivos (no GitHub: **Add file**, depois **Upload files**).

Confira se estes itens aparecem no repositório:
- `wrangler.toml` na raiz;
- a pasta `.github/workflows`;
- o arquivo `.gitignore`.

## 2. Banco D1 `saara-nail-studio-db`

1. Abra **Storage & Databases**, depois **D1 SQL Database**.
   - Se o banco `saara-nail-studio-db` ainda não existir, clique em **Create** e use esse nome. Localização: automática.
2. Abra o banco e copie o **Database ID**. É um código no formato `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.
3. No GitHub, abra `wrangler.toml` e clique no lápis para editar.
   - Troque `COLE_AQUI_O_DATABASE_ID` pelo ID copiado e faça o commit no `main`.
   - O ID é um identificador, não uma senha: ninguém acessa o banco só com ele.
   - **Sem isso, o build no Cloudflare para** com a mensagem "database_id … não é um ID de D1".
4. **Não crie tabelas no Console.** O sistema cria as tabelas sozinho no primeiro acesso ao servidor de teste.
   - Se alguém já usou `wrangler d1 migrations apply`, tudo bem: o sistema reconhece.
   - Criar tabelas à mão no Console pode deixar o banco incompleto.

Binding exigido pelo código: **`DB`**. O código usa `env.DB` em `src/app.js`, e o binding já está declarado no `wrangler.toml`.

### 2.1 Armazenamento privado dos comprovantes (Workers KV, grátis, sem cartão)

O R2 pede forma de pagamento na ativação. Por isso, os comprovantes ficam no **KV**: é privado (só o sistema acessa, não há endereço público) e o plano gratuito basta para o estúdio.

1. Abra **Storage & Databases**, depois **KV**, depois **Create** (ou **Create namespace**). Nome: `saara-comprovantes`.
2. Copie o **ID**: 32 letras e números.
3. No `wrangler.toml`, troque `COLE_AQUI_O_ID_DO_KV` por esse ID e faça o commit.

Binding exigido: **`COMPROVANTES`** (o código usa `env.COMPROVANTES` em `src/comprovantes.js`).

## 3. Criar o projeto Pages e conectar o GitHub

1. Abra **Workers & Pages** e clique em **Create**. Escolha a aba **Pages** e depois **Import an existing Git repository** (ou **Connect to Git**).
   - Não use a aba Workers.
   - Se a tela só oferecer Worker, procure o link "Looking to deploy Pages? Get started".
2. Autorize o app **Cloudflare Workers and Pages** no GitHub com **Only select repositories** e marque só `saara-nail-studio`.
3. Escolha `juliannypaiva13-cpu/saara-nail-studio` e preencha:

| Campo | Valor |
|---|---|
| **Project name** | **`saaranailstudio`** (troque o nome sugerido `saara-nail-studio`, que geraria outro endereço) |
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | (vazio) |

4. Clique em **Save and Deploy**.
   - O Pages instala as dependências do `package.json` sozinho e roda `npm run build`.
   - No log deve aparecer `✔ ramo: main · dist: _headers, _routes.json, index.html`.
5. **Confira o endereço** no topo do projeto. Ele precisa ser exatamente `saaranailstudio.pages.dev`.
   - Se vier com algo a mais (por exemplo `saaranailstudio-4xk.pages.dev`), o nome estava ocupado.
   - Nesse caso, apague o projeto (**Settings**, depois **Delete project**) e me avise. Não use outro endereço sem autorização.
6. Abra `https://saaranailstudio.pages.dev/api/saude`. O esperado é:
   `{"ok":true,"modo":"vitrine","banco":"não ligado","configuracao":"completa","reservasReais":false}`
   E `https://saaranailstudio.pages.dev` mostra "Sistema em preparação".

## 4. Travar a produção e liberar só o ramo de teste

Abra **Settings**, depois **Builds**, depois **Branch control**:
- Desmarque **Enable automatic production branch deployments**.
- Em **Preview branch**, escolha **Custom branches** e inclua só `teste-passkey`.

## 5. Variáveis e segredos

As variáveis comuns já estão no `wrangler.toml`. Os valores não são inventados: saem do endereço autorizado.

| Ambiente | Nome | Valor | Onde |
|---|---|---|---|
| Produção | `MODO` | `vitrine` (site no ar, agendamento fechado) | `wrangler.toml` |
| Produção | `ORIGEM` / `RP_ID` | `https://saaranailstudio.pages.dev` / `saaranailstudio.pages.dev` | `wrangler.toml` |
| Prévia | `MODO` | `homologacao` (sistema completo, só dados de teste) | `wrangler.toml` |
| Prévia | `ORIGEM` / `RP_ID` | `https://teste-passkey.saaranailstudio.pages.dev` / `teste-passkey.saaranailstudio.pages.dev` | `wrangler.toml` |
| Prévia | `DB` (banco) | `saara-nail-studio-db` + o seu Database ID | `wrangler.toml` |
| Prévia | `COMPROVANTES` (KV) | `saara-comprovantes` + o ID do KV | `wrangler.toml` |

**Cadastro manual no painel: só 1 segredo, e só na prévia.**

| Ambiente | Nome | Tipo | Valor |
|---|---|---|---|
| **Preview** | `INSTALACAO_SEGREDO` | **Secret** (criptografado) | Você mesma cria: senha aleatória com **32 caracteres ou mais** |

- Caminho: **Settings**, depois **Variables and Secrets**, ambiente **Preview**, **Add**, tipo **Secret**.
- Gere a senha no gerenciador de senhas do celular e guarde-a lá. Não mande no chat.
- Ela serve só para gerar os convites de primeiro acesso. Quando Saara e Julianny tiverem passkey, ela deixa de funcionar.
- Na produção, nenhum segredo é necessário.

Para eu checar sem você me mandar valores:
- Como o `wrangler.toml` é a fonte da verdade, as variáveis comuns aparecem no painel como gerenciadas pelo arquivo.
- Se o painel não deixar adicionar o segredo, me diga qual mensagem aparece.

## 6. Primeira implantação do servidor de teste

1. No GitHub, abra o seletor de ramos (**main**), digite `teste-passkey` e clique em **Create branch teste-passkey from main**.
2. O Pages publica em `https://teste-passkey.saaranailstudio.pages.dev`. No log deve aparecer `✔ ramo: teste-passkey · dist: …, teste.js`.
3. Abra `https://teste-passkey.saaranailstudio.pages.dev/api/saude`. O esperado é `"modo":"homologacao"`, `"banco":"ligado"` e `"reservasReais":false`.
   No primeiro acesso, o sistema cria as tabelas em três pedidos seguidos. Se aparecer `"instalando_banco"`, recarregue a página.
   Se aparecer `"falha_na_migracao"`, me mande a resposta inteira: nada foi aplicado pela metade.
   - Se aparecer `"banco":"não ligado"`, o `database_id` não foi salvo no `wrangler.toml` do ramo `teste-passkey`. Confira e faça um novo commit.
4. Se você criou o segredo depois da publicação, abra **Deployments** e clique em **Retry deployment** na publicação do ramo.
5. Siga `infra/ROTEIRO-DE-TESTES.md`.

## 7. O que continua desligado (de propósito)

- **Reservas reais:** a rota `/api/reservas` só existe no modo `completo`, que nenhuma configuração usa.
  - Produção: `desligado`. Prévia: `teste-passkey`, só com reservas "TESTE FICTÍCIO".
  - O build recusa `MODO = "completo"`.
- **Protótipo:** fica em `prototipo/` e nunca entra no `dist/`.
- **Rotinas automáticas:** o Pages não tem agenda própria. A liberação de reservas vencidas e os avisos de 30 min, 2 h e 12 h rodam sempre que o painel é aberto e a cada reserva ou consulta de horários. O `worker-cron/` é opcional e não precisa ser publicado.
- **Turnstile (proteção contra robôs):** obrigatório no modo `completo`, antes da liberação. Na homologação, sem a chave configurada, ele é dispensado.
- **Banco de produção:** o `saara-nail-studio-db` recebe só dados de teste. Antes da Fase 5, decidimos se ele é zerado ou se criamos um banco limpo para a produção.

## 8. Desligar o servidor de teste ao final

1. Apague o ramo `teste-passkey` no GitHub.
2. Apague as publicações de Preview em **Deployments**.
3. Remova `INSTALACAO_SEGREDO`.
4. Se não for reaproveitar o banco, apague `saara-nail-studio-db` (D1, depois **Settings**, depois **Delete**).

## Permissões, em resumo

| Quem | Acesso |
|---|---|
| App Cloudflare no GitHub | Só o repositório `saara-nail-studio` |
| GitHub Actions | Só roda os testes. Nenhum segredo |
| Painel Cloudflare | O segredo `INSTALACAO_SEGREDO` (criptografado) |
| Claude (opcional) | Para eu enviar o código direto: conectar o GitHub no claude.ai e dar ao app do Claude acesso só a esse repositório, com leitura e escrita de conteúdo |
