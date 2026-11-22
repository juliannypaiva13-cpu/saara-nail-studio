# Saara Nail Studio: sistema de agendamento

Repositório **privado** `juliannypaiva13-cpu/saara-nail-studio`. Plataforma: **Cloudflare Pages** + banco **D1** (`saara-nail-studio-db`, binding `DB`). Fase 2: desenvolvimento e testes.
**Ainda não é para uso de clientes.** A abertura ao público só acontece depois da Fase 5 e da aprovação expressa da Saara.

| Pasta | O que tem |
|---|---|
| `src/` | Servidor: regras de agenda, reservas, passkeys, sessões, auditoria e instalação automática do banco |
| `functions/api/` | Ligação do servidor com o Cloudflare Pages (todas as rotas `/api/*`) |
| `migrations/` | Tabelas do banco D1. Depois de mudar: `npm run migracoes` |
| `public/` | Página "Sistema em preparação" (única coisa publicada na produção por enquanto) |
| `teste-passkey/` | Página do servidor temporário de teste (só no ramo `teste-passkey`) |
| `prototipo/` | Protótipo aprovado, só como referência (não é publicado) |
| `testes/` | Testes automáticos (`npm test`) |
| `worker-cron/` | Rotinas a cada 5 min (Fase 3; ainda não publicado) |
| `wrangler.toml` | Configuração do Pages (variáveis comuns e ligação `DB`). Sem segredos |
| `infra/` | Passo a passo do Cloudflare e roteiro de testes reais |

Build: `npm run build` → `dist`. Testes: `npm test` (Node 22.5 ou mais novo).

Nenhuma senha, token ou chave fica no repositório. As configurações e o segredo de instalação ficam só no painel do Cloudflare.
Veja `infra/PASSO-A-PASSO.md`.
