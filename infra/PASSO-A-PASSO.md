# Passo a passo: GitHub, Cloudflare e servidor temporário de teste

Regras desta fase:
- Nada é aberto para clientes.
- Nenhum serviço pago é criado e nenhum cartão é necessário.
- Nenhuma senha, token ou chave vai para o repositório ou para o chat.

O Cloudflare lê o código do GitHub por uma conexão autorizada. Assim, **nenhuma chave do Cloudflare precisa ficar no GitHub**.

---

## 1. Enviar o código para o repositório privado `saara-nail-studio`

1. Descompacte `saara-nail-studio.zip` e abra a pasta `saara-nail-studio`.
2. No GitHub, abra o repositório, clique em **Add file**, depois em **Upload files**.
3. Arraste **o conteúdo** da pasta (não a pasta em si). Escreva uma mensagem como "Fase 2" e clique em **Commit changes**.
4. Confira se apareceram as pastas `.github` e `src` e o arquivo `.gitignore`.
   - Pastas e arquivos que começam com ponto às vezes ficam ocultos e não são enviados.
   - Se `.github` não aparecer, clique em **Add file**, depois em **Create new file**, e digite o caminho `.github/workflows/testes.yml`.
   - Cole o conteúdo do arquivo de mesmo nome e faça o commit.
5. Abra a aba **Actions**. O fluxo **testes** roda sozinho e deve ficar verde. Ele não usa segredo nenhum e não publica nada.

Alternativa: o programa **GitHub Desktop** envia a pasta inteira, com os arquivos ocultos.

## 2. Ver se o endereço `saaranailstudio.pages.dev` está livre

1. **Antes de criar**, abra `https://saaranailstudio.pages.dev` no navegador.
   - Se aparecer um site, o nome já é de outra pessoa. **Pare aqui e me avise.**
   - Se aparecer erro de "site não encontrado", o nome provavelmente está livre. A confirmação de verdade vem no passo 3.
2. **Depois de criar** o projeto (passo 3), o painel mostra o endereço no topo do projeto.
   - Ele precisa ser **exatamente** `saaranailstudio.pages.dev`.
   - Se aparecer com algo a mais (por exemplo `saaranailstudio-4xk.pages.dev`), o nome estava ocupado. Apague o projeto em **Settings**, depois **General**, depois **Delete project**, e me avise.
   - **Não use o endereço alternativo** sem a sua autorização.

## 3. Conectar o GitHub ao Cloudflare Pages

1. No Cloudflare, abra **Workers & Pages** e clique em **Create**.
2. Na aba **Pages**, escolha **Import an existing Git repository** (ou **Connect to Git**).
3. Autorize o app **Cloudflare Workers and Pages** no GitHub.
   - Escolha **Only select repositories** e marque só `saara-nail-studio`.
   - O app recebe leitura do código e permissão para marcar o resultado das publicações. Ele não acessa outros repositórios.
4. Selecione o repositório e preencha:

| Campo | Valor |
|---|---|
| Project name | `saaranailstudio` |
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm install --no-audit --no-fund && npm run build` |
| Build output directory | `dist` |
| Root directory | (vazio) |
| Variável de build | `NODE_VERSION` = `22` |

5. Clique em **Save and Deploy**.
   - O Cloudflare faz uma primeira publicação do ramo `main`.
   - Ela contém **só** a página "Sistema em preparação", que orienta a agendar pelo WhatsApp.
   - A API dessa publicação fica em modo **desligado**: só responde `/api/saude` e não tem banco.
6. Confira o endereço (passo 2.2).

## 4. Impedir publicações automáticas da produção

Em **Settings**, depois **Builds**, depois **Branch control**:

- Desmarque **Enable automatic production branch deployments**. Assim, nada novo vai para `saaranailstudio.pages.dev` sem você mandar.
- Em **Preview branch**, escolha **Custom branches** e inclua só `teste-passkey`.

## 5. Criar o banco de teste (D1, grátis)

1. Abra **Storage & Databases**, depois **D1 SQL Database**, depois **Create**.
2. Nome: `saara-teste-passkey`. Localização: automática.
3. Não precisa criar tabelas. O sistema cria sozinho no primeiro acesso.

## 6. Ligações, variáveis e segredo (só no painel do Cloudflare)

No projeto `saaranailstudio`, abra **Settings**. Escolha o ambiente **Preview** (é o do teste).

**Bindings**: clique em **Add**, depois **D1 database**.
- Variable name: `DB`
- Banco: `saara-teste-passkey`
- Ambiente: **Preview apenas**. Não ligue banco na Production.

**Variables and Secrets** (ambiente Preview):

| Nome | Tipo | Valor |
|---|---|---|
| `MODO` | Text | `teste-passkey` |
| `ORIGEM` | Text | `https://teste-passkey.saaranailstudio.pages.dev` |
| `RP_ID` | Text | `teste-passkey.saaranailstudio.pages.dev` |
| `INSTALACAO_SEGREDO` | **Secret** | Senha longa e aleatória, com 32 caracteres ou mais |

Para criar o segredo de instalação:
- Gere a senha no gerenciador de senhas do celular (Chaves do iCloud, Gerenciador de Senhas do Google ou Bitwarden) e guarde-a lá.
- Não mande essa senha no chat.
- Ela serve só para gerar os convites de primeiro acesso. Quando Saara e Julianny tiverem passkey, ela deixa de funcionar.

**Variables and Secrets** (ambiente Production): nada é obrigatório. Opcionalmente, `MODO` = `desligado`. Sem essa variável, o sistema já fica desligado.

**Runtime** (os dois ambientes):
- Compatibility date: `2026-11-01`
- Compatibility flags: `nodejs_compat`

## 7. Publicar o servidor temporário

1. No GitHub, abra o seletor de ramos (**main**), digite `teste-passkey` e clique em **Create branch teste-passkey from main**.
2. O Cloudflare publica sozinho em `https://teste-passkey.saaranailstudio.pages.dev`.
3. Se você mudar variáveis depois, abra **Deployments**, escolha a publicação do ramo e clique em **Retry deployment**. As mudanças só valem em publicações novas.
4. Confira:
   - `https://teste-passkey.saaranailstudio.pages.dev/api/saude` mostra `"modo":"teste-passkey"`.
   - `https://saaranailstudio.pages.dev/api/saude` mostra `"modo":"desligado"`.

Siga então o roteiro `infra/ROTEIRO-DE-TESTES.md`.

## 8. Desligar o servidor temporário (ao final da avaliação)

1. No GitHub, apague o ramo `teste-passkey`. Isso impede novas publicações.
2. No Cloudflare, abra **Deployments**. Apague as publicações de Preview no menu "…", opção **Delete**.
3. Em **Settings**, depois **Bindings** (Preview), remova `DB`. Em **Variables and Secrets** (Preview), remova `INSTALACAO_SEGREDO`.
4. Em **D1**, abra `saara-teste-passkey`, depois **Settings**, depois **Delete**.
5. O projeto `saaranailstudio` continua existindo, só para garantir o endereço, com a produção desligada.

## Permissões, em resumo

| Quem | Acesso |
|---|---|
| App Cloudflare no GitHub | Só o repositório `saara-nail-studio` (leitura do código e status das publicações) |
| GitHub Actions | Só lê o código para rodar os testes. Nenhum segredo |
| Painel Cloudflare | Guarda as variáveis e o segredo de instalação (criptografado) |
| Claude (opcional) | Ver a resposta no chat sobre como conectar o GitHub |
