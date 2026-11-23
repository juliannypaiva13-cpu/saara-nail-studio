# Backup e restauração (D1 `saara-nail-studio-db` e KV `saara-comprovantes`)

## O que já existe sem fazer nada
- **D1 Time Travel:** o Cloudflare guarda o histórico do banco dos **últimos 7 dias** (plano gratuito). Ele permite voltar o banco a qualquer minuto desse período.
- **Registros que não se apagam:** o histórico de cada agendamento e a auditoria das administradoras só aceitam inclusão. O banco recusa alterar ou apagar, então essas trilhas continuam lá mesmo depois de um erro.

## Restaurar o banco para um momento anterior
**Atenção:** isso desfaz tudo o que aconteceu depois do momento escolhido (reservas, pagamentos, decisões). Antes, anote o que precisa ser refeito.

1. No painel, abra **Storage & Databases**, depois **D1**, depois `saara-nail-studio-db`, depois **Time Travel**. Confira os pontos disponíveis.
2. A restauração em si é feita com o comando:
   `npx wrangler d1 time-travel restore saara-nail-studio-db --timestamp=AAAA-MM-DDTHH:MM:SS-03:00`
   - Ele precisa de login no Cloudflare num computador.
   - Posso preparar isso como um botão no GitHub Actions. Para isso, seria preciso um token do Cloudflare guardado nos segredos do repositório, com permissão só de **D1: Editar**.

## Cópia fora do Cloudflare (recomendada antes de abrir para clientes)
- O comando `npx wrangler d1 export saara-nail-studio-db --remote --output=backup.sql` gera um arquivo com todo o banco.
- O arquivo contém dados pessoais de clientes: guarde **criptografado** (por exemplo, num zip com senha forte), nunca no repositório.
- Frequência sugerida: semanal, e sempre antes de qualquer migração nova.
- Teste de restauração: uma vez por mês, importe a cópia num banco de teste e confira as contagens:
  `SELECT COUNT(*) FROM agendamentos;`

## Comprovantes (KV)
- O KV não tem histórico de versões. O banco guarda, para cada comprovante, o tipo, o tamanho, a impressão digital (SHA-256) e a chave do arquivo.
- Definir com a Saara quanto tempo os comprovantes devem ser guardados (LGPD: só o necessário) antes da produção.

## Migrações
- Toda migração deste projeto só **acrescenta** tabelas e índices. Nenhuma apaga ou altera dados.
- Cada migração entra inteira ou não entra (lote atômico). Se uma falhar, a API responde `falha_na_migracao` com o nome dela, e nada fica aplicado pela metade.
- Antes de qualquer migração que apague ou altere dados, o impacto será apresentado e só será aplicado com autorização.
