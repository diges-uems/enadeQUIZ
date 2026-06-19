# UEMS Votação — Guia de Deploy em Produção

Guia completo para hospedar o sistema de votação ENADE em uma VM
(Ubuntu 22.04 LTS ou superior). Este documento cobre desde a compra/
provisionamento da VM até backups diários e procedimentos de atualização.

---

## Sumário

1. [Requisitos da VM](#1-requisitos-da-vm)
2. [Instalação das ferramentas](#2-instalação-das-ferramentas)
3. [Upload do projeto](#3-upload-do-projeto)
4. [Configuração do ambiente (.env)](#4-configuração-do-ambiente-env)
5. [Configuração das chaves (ADMIN + PRESENTER)](#5-configuração-das-chaves-admin--presenter)
6. [Banco de dados (SQLite + Prisma)](#6-banco-de-dados-sqlite--prisma)
7. [Build do Next.js](#7-build-do-nextjs)
8. [Início dos serviços com PM2](#8-início-dos-serviços-com-pm2)
9. [Caddy + DNS + HTTPS](#9-caddy--dns--https)
10. [Firewall (ufw)](#10-firewall-ufw)
11. [Estratégia de backup](#11-estratégia-de-backup)
12. [Procedimento de atualização](#12-procedimento-de-atualização)
13. [Monitoramento](#13-monitoramento)
14. [Renovação do certificado SSL](#14-renovação-do-certificado-ssl)
15. [Troubleshooting comum](#15-troubleshooting-comum)

---

## 1. Requisitos da VM

| Recurso        | Mínimo      | Recomendado  | Observação                                |
|----------------|-------------|--------------|-------------------------------------------|
| SO             | Ubuntu 22.04| Ubuntu 24.04 | Debian 12 também funciona                 |
| RAM            | 2 GB        | 4 GB         | Next build com 2 GB é apertado — veja §7  |
| Disco          | 10 GB       | 20 GB        | Backups + logs + DB crescendo             |
| CPU            | 1 vCPU      | 2 vCPU       | Build do Next é CPU-intensivo             |
| Largura de banda| 1 Mbps    | 10 Mbps      | Sobe com nº de alunos simultâneos         |
| Portas públicas| 22, 80, 443 | 22, 80, 443 | Não exponha 3000/3003/3004 direto         |

A VM precisa ter um IP público (ou estar atrás de um proxy que tenha)
e o domínio apontando para esse IP via registro A (e AAAA se IPv6).

---

## 2. Instalação das ferramentas

Rode como **root** (`sudo -i`) ou prefixe cada comando com `sudo`.

### 2.1 Atualização do sistema
```bash
apt update && apt upgrade -y
apt install -y curl ca-certificates gnupg sqlite3 build-essential \
  ufw unattended-upgrades
```

### 2.2 Node.js 20 LTS (via NodeSource)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version    # v20.x.x
npm --version
```

### 2.3 Bun (runtime dos mini-serviços)
```bash
curl -fsSL https://bun.sh/install | bash
# Carregue o bun no PATH:
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
bun --version     # 1.x.x
```

### 2.4 PM2 (gerenciador de processos)
```bash
npm install -g pm2
pm2 --version
# Gere o script de inicialização no boot:
pm2 startup systemd -u root --hp /root
# (execute o comando `systemctl enable…` que ele imprimir)
```

### 2.5 Caddy (reverse proxy + HTTPS automático)
```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy
caddy version
```

### 2.6 Git
```bash
apt install -y git
git --version
```

---

## 3. Upload do projeto

Você tem duas opções: **git clone** (recomendado) ou **scp**.

### Opção A — git clone
```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/sua-org/uems-votacao.git
cd uems-votacao
```

### Opção B — scp a partir da sua máquina local
```bash
# Na sua máquina local:
cd /caminho/para/uems-votacao
tar --exclude='node_modules' --exclude='.next' --exclude='dev.log' \
    --exclude='server.log' -czf uems.tar.gz .
scp uems.tar.gz root@IP_DA_VM:/tmp/

# Na VM:
mkdir -p /var/www/uems-votacao
tar -xzf /tmp/uems.tar.gz -C /var/www/uems-votacao
rm /tmp/uems.tar.gz
cd /var/www/uems-votacao
```

> **Permissões**: o Caddy roda como `caddy:caddy` e o PM2 como root neste
> guia. Se preferir rodar como um usuário não-root (recomendado em
> produção), crie um usuário `uems`, ajuste o dono de `/var/www/uems-votacao`
> e rode `pm2 startup systemd -u uems --hp /home/uems`.

---

## 4. Configuração do ambiente (.env)

```bash
cd /var/www/uems-votacao
cp .env.example .env
nano .env       # ou vim, ou seu editor favorito
```

Edite **todos** os campos com placeholders. Em particular:

| Variável              | Como gerar                                  |
|-----------------------|---------------------------------------------|
| `ADMIN_SECRET_KEY`    | `openssl rand -hex 24`                      |
| `PRESENTER_KEY`       | `openssl rand -hex 24`                      |
| `NEXTAUTH_SECRET`     | `openssl rand -base64 32`                   |
| `NEXTAUTH_URL`        | `https://seu-dominio.com.br`                |
| `NEXT_PUBLIC_APP_URL` | `https://seu-dominio.com.br`                |
| `DATABASE_URL`        | Manter `file:./prisma/dev.db` (SQLite)      |

> ⚠️ **NUNCA** faça commit do `.env`. Ele já está no `.gitignore`.

---

## 5. Configuração das chaves (ADMIN + PRESENTER)

Esta é a parte mais sensível — Leia com atenção.

### 5.1 `ADMIN_SECRET_KEY`
Usada pelo formulário de login em `/admin`. O valor precisa bater entre:
- O arquivo `.env` lido pelo servidor Next.js (em produção via PM2)
- A página `/admin` faz POST para `/api/admin/auth` enviando a senha
  digitada pelo operador — o servidor compara em tempo constante

**Para mudar:** edite `.env`, reinicie o PM2:
```bash
pm2 restart uems-next --update-env
```
A senha que o operador digita no `/admin` passa a ser a nova.

### 5.2 `PRESENTER_KEY`
Usada pelo serviço Socket.io (porta 3003) para autorizar comandos
privilegiados (`activate-question`, `reveal-answer`, etc.).

⚠️ **Importante**: no estado atual do código, a chave do presenter está
**hardcoded** nas páginas cliente como `'presenter-default-key-2025'` em:
- `src/app/admin/page.tsx` (linha ~1060 e ~331, pesquisar por `presenterKey`)
- `src/app/apresentacao/[codigo]/page.tsx` (linha ~235, `join-session`)

Para usar uma chave real em produção:

1. Defina `PRESENTER_KEY` no `.env` (lido pelo socket service via PM2).
2. **Atualize as duas páginas cliente** com a mesma chave — faça isso
   rodando um `sed` antes do build:

```bash
KEY_NOVA="$(grep '^PRESENTER_KEY=' .env | cut -d= -f2 | tr -d '"')"
sed -i "s/presenter-default-key-2025/${KEY_NOVA}/g" \
  src/app/admin/page.tsx \
  src/app/apresentacao/\[codigo\]/page.tsx
```

3. Rebuild: `bunx next build`
4. Reinicie: `pm2 restart uems-socket uems-next --update-env`

> 🔒 **Aviso de segurança**: como a chave viaja no bundle JS do browser,
> qualquer usuário pode extraí-la. Isso é uma camada **soft-auth** que
> impede clientes aleatórios de disparar comandos — não substitui auth
> real. Para hardening completo, mova os comandos privilegiados para
> uma API route HTTP autenticada com token admin (já existe
> `verifyAdminAuth` em `src/lib/api-auth.ts`).

---

## 6. Banco de dados (SQLite + Prisma)

O schema está em `prisma/schema.prisma`. O arquivo SQLite fica em
`prisma/dev.db` (caminho relativo à raiz do projeto).

```bash
cd /var/www/uems-votacao

# Gera o client Prisma (necessário antes do build)
bunx prisma generate

# Cria o arquivo dev.db + aplica o schema (idempotente)
bun run db:push
```

Para popular com dados iniciais (sessão + questões de exemplo):
```bash
bun run db:seed
```

> ⚠️ O `db:push` **não** cria migrations — é ideal para SQLite local
> mas perde histórico. Se você for alterar o schema em produção,
> considere migrar para `prisma migrate` e um banco Postgres.

---

## 7. Build do Next.js

O `next.config.ts` está configurado com `output: 'standalone'`, o que
gera um bundle autossuficiente em `.next/standalone/` (inclui o
`server.js` e apenas as deps necessárias, ~150 MB em vez de ~1.5 GB).

```bash
cd /var/www/uems-votacao
bun install --production   # deps de runtime
bun install                # também devDeps (precisa do next, prisma CLI)

# Build com limite de memória (2 GB) para evitar OOM em VMs pequenas
NODE_OPTIONS="--max-old-space-size=2048" bunx next build
```

Após o build, copie `public/`, `prisma/`, `.next/static/` para dentro
do bundle standalone (o Next não os inclui automaticamente):

```bash
STANDALONE=.next/standalone
cp -rT public      $STANDALONE/public
cp -rT prisma      $STANDALONE/prisma
cp -rT .next/static $STANDALONE/.next/static
cp .env $STANDALONE/.env
```

> 💡 **Atalho**: o script `deploy/deploy.sh` já faz tudo isso. Pule direto
> para o §8 depois de rodar:
> ```bash
> bash /var/www/uems-votacao/deploy/deploy.sh
> ```

---

## 8. Início dos serviços com PM2

O arquivo `ecosystem.config.cjs` (na raiz do projeto) define 3 apps:

| Nome          | Porta | Runtime | Função                          |
|---------------|-------|---------|---------------------------------|
| `uems-next`   | 3000  | Node    | App Next.js (standalone)        |
| `uems-socket` | 3003  | Bun     | Socket.io real-time             |
| `uems-stress` | 3004  | Bun     | Serviço de teste de carga       |

```bash
cd /var/www/uems-votacao
pm2 start ecosystem.config.cjs
pm2 save                 # persiste a lista de processos
pm2 list
```

Para garantir que os serviços reiniciem após reboot:
```bash
pm2 startup systemd      # siga as instruções impressas
pm2 save
```

### Comandos úteis
```bash
pm2 logs                       # tail de todos os logs
pm2 logs uems-socket --lines 100
pm2 restart uems-next          # reinicia só o Next
pm2 reload ecosystem.config.cjs --update-env   # zero-downtime reload
pm2 monit                      # TUI com CPU/memória em tempo real
pm2 flush                      # limpa os arquivos de log
```

---

## 9. Caddy + DNS + HTTPS

### 9.1 Aponte o DNS
Crie um registro **A** (e **AAAA** se tiver IPv6) apontando o seu domínio
para o IP público da VM. Aguarde a propagação (use `dig seu-dominio.com.br`
para checar).

### 9.2 Instale o Caddyfile de produção
```bash
cp /var/www/uems-votacao/deploy/Caddyfile.production /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile
# Substitua TODAS as ocorrências de:
#   uems-votacao.example.edu.br  →  seu-dominio.com.br
#   admin@example.edu.br         →  seu-email@uems.edu.br
```

Atalho para substituir em uma linha:
```bash
DOMINIO="votacao.uems.edu.br"
EMAIL="ti@uems.edu.br"
sed -i "s/uems-votacao.example.edu.br/${DOMINIO}/g; s/admin@example.edu.br/${EMAIL}/g" \
  /etc/caddy/Caddyfile
```

### 9.3 Valide e recarregue
```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
systemctl status caddy
```

Caddy vai automaticamente:
1. Provisionar um certificado Let's Encrypt para o seu domínio
2. Renová-lo a cada ~30 dias (validade 90 dias)
3. Redirecionar HTTP → HTTPS
4. Aplicar os headers de segurança e gzip

### 9.4 Rotas que o Caddy configura
| URL                                                | Upstream             |
|----------------------------------------------------|----------------------|
| `https://dominio/` (qualquer path normal)          | `127.0.0.1:3000`     |
| `https://dominio/?XTransformPort=3003&*`           | `127.0.0.1:3003`     |
| `https://dominio/socket.io/*` (futuro)             | `127.0.0.1:3003`     |
| `https://dominio/?XTransformPort=3004&*`           | `127.0.0.1:3004`     |

> As rotas via `XTransformPort` são exigidas pelo código cliente atual
> (que chama `io('/?XTransformPort=3003', …)`). A rota `/socket.io/*`
> fica pronta para quando você padronizar o socket.io para o path
> convencional.

---

## 10. Firewall (ufw)

Bloqueie acesso direto às portas 3000/3003/3004 — só o Caddy (80/443)
e SSH devem estar abertos para a internet.

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp        # SSH
ufw allow 80/tcp        # HTTP (redireciona p/ HTTPS)
ufw allow 443/tcp       # HTTPS
ufw enable
ufw status verbose
```

> 🔒 **Dica**: restrinja SSH a um IP específico se acessar sempre do
> mesmo lugar: `ufw allow from 200.100.50.1 to any port 22`.

---

## 11. Estratégia de backup

### 11.1 Backup diário do SQLite (automático)
Já existe um script pronto em `deploy/backup.sh`. Ele:
- Copia `prisma/dev.db` para `/var/backups/uems/dev-<TIMESTAMP>.db`
- Usa `sqlite3 .backup` (não trava escritores) quando disponível
- Comprime com gzip
- Mantém apenas os últimos 30 dias

Instale o cron job:
```bash
# Crie o diretório de destino (com permissões restritas):
mkdir -p /var/backups/uems
chmod 750 /var/backups/uems

# Torne o script executável:
chmod +x /var/www/uems-votacao/deploy/backup.sh

# Adicione ao crontab do root:
crontab -e
# Adicione a linha:
0 3 * * * /var/www/uems-votacao/deploy/backup.sh >> /var/log/uems-backup.log 2>&1
```

### 11.2 Restaurar um backup
```bash
pm2 stop uems-next       # para não gravar enquanto restaura
cp /var/backups/uems/dev-2025-06-19T030001.db.gz /tmp/
gunzip /tmp/dev-2025-06-19T030001.db.gz
cp /tmp/dev-2025-06-19T030001.db /var/www/uems-votacao/prisma/dev.db
pm2 start uems-next
```

### 11.3 Backup offsite (recomendado)
Os backups em `/var/backups/uems/` morrem junto com a VM. Configure
rsync para outro servidor:
```bash
# No crontab de outra máquina:
0 4 * * * rsync -avz root@IP_DA_VM:/var/backups/uems/ /backup/uems-vm/
```

---

## 12. Procedimento de atualização

Quando você fizer `git push` de mudanças no repositório, faça na VM:

```bash
cd /var/www/uems-votacao

# 1. Puxe as mudanças
git pull --ff-only

# 2. Reinstale deps (caso package.json tenha mudado)
bun install --production

# 3. Aplique mudanças no schema se houver
bunx prisma generate
bun run db:push

# 4. Rebuild
NODE_OPTIONS="--max-old-space-size=2048" bunx next build

# 5. Copie assets para o standalone
STANDALONE=.next/standalone
cp -rT public      $STANDALONE/public
cp -rT prisma      $STANDALONE/prisma
cp -rT .next/static $STANDALONE/.next/static
cp .env $STANDALONE/.env

# 6. Restart (zero-downtime)
pm2 reload ecosystem.config.cjs --update-env

# 7. Health check
bash deploy/healthcheck.sh
```

> 💡 **Atalho**: `bash deploy/deploy.sh` faz tudo isso de forma
> idempotente. Único cuidado: ele faz `git pull` que pode falhar se
> você editou arquivos localmente (ex.: ajustou o `PRESENTER_KEY` via
> `sed`). O script stash automático, mas verifique com `git stash list`.

---

## 13. Monitoramento

### 13.1 Health check automatizado
O script `deploy/healthcheck.sh` faz curl nos 3 serviços e imprime um
status legível. Exemplo de uso em cron (a cada minuto):

```bash
crontab -e
# Adicione:
* * * * * /var/www/uems-votacao/deploy/healthcheck.sh >> /var/log/uems-health.log 2>&1
```

Integração com **Uptime Kuma**:
- Tipo: HTTP(s) - Json Query
- URL: `https://seu-dominio.com.br/`
- Esperado: status 200

### 13.2 Logs do PM2
```bash
pm2 logs                              # todos os serviços, tempo real
pm2 logs uems-next --lines 200        # últimas 200 linhas do Next
pm2 logs uems-socket --err --lines 50 # só erros do socket
ls -lh ~/.pm2/logs/                   # arquivos de log (rotacionam por tamanho)
```

### 13.3 Logs do Caddy
```bash
journalctl -u caddy -f                # logs de sistema do Caddy
tail -f /var/log/caddy/uems-votacao.access.log   # access log (JSON)
```

### 13.4 Métricas em tempo real
```bash
pm2 monit              # TUI com CPU/RAM de cada processo
htop                   # visão geral do sistema
df -h                  # espaço em disco
free -h                # memória
ss -tlnp               # portas abertas
```

### 13.5 Alertas
Recomendado configurar:
- Alerta de RAM > 80% (via node_exporter + Prometheus + Alertmanager)
- Alerta de disco < 20% livre
- Alerta se `uems-next` reiniciar > 3x em 1h (signo de crash loop)
- Alerta se healthcheck falhar 3x seguidas (Uptime Kuma nativo)

---

## 14. Renovação do certificado SSL

O Caddy **renova automaticamente** os certificados Let's Encrypt:
- Validade: 90 dias
- Renovação disparada faltando 30 dias para expirar
- Sem intervenção manual necessária

Para verificar o status:
```bash
caddy list-modules | grep tls
echo | openssl s_client -connect seu-dominio.com.br:443 -servername seu-dominio.com.br 2>/dev/null \
  | openssl x509 -noout -dates
# notBefore=Jun 19 00:00:00 2025 GMT
# notAfter=Sep 17 00:00:00 2025 GMT
```

Se a renovação falhar (ex.: DNS mudou, porta 443 bloqueada), o Caddy
loga no `journalctl -u caddy`. Resolva antes do vencimento.

---

## 15. Troubleshooting comum

### 15.1 Build do Next.js estoura memória (OOM)
**Sintoma**: `Killed` ou exit code 137 durante `next build`.

**Causa**: VM com ≤ 2 GB RAM não aguenta o build do Next 16 + React 19.

**Soluções**:
1. Aumente o limite: `NODE_OPTIONS="--max-old-space-size=3072" bunx next build`
2. Adicione swap:
   ```bash
   fallocate -l 4G /swapfile
   chmod 600 /swapfile
   mkswap /swapfile
   swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   ```
3. Faça o build em outra máquina (com mais RAM) e faça upload do
   `.next/standalone/` pronto para a VM.

### 15.2 Conflito de porta (EADDRINUSE)
**Sintoma**: `Error: listen EADDRINUSE: address already in use :::3000`

**Diagnóstico**:
```bash
ss -tlnp | grep -E '3000|3003|3004'
pm2 list
```

**Solução**: mate o processo conflitante ou pare o PM2 antes:
```bash
pm2 stop all
# ou:
kill -9 $(lsof -t -i:3000)
pm2 restart ecosystem.config.cjs
```

### 15.3 Socket.io não conecta no cliente
**Sintoma**: admin/apresentação mostra "Desconectado" permanentemente.

**Diagnóstico**:
1. Verifique se o serviço Bun está rodando:
   ```bash
   pm2 status uems-socket
   curl http://127.0.0.1:3003/    # deve responder 400 (engine.io esperado)
   ```
2. Verifique o Caddy: o `XTransformPort=3003` precisa estar roteando.
   Abra o DevTools → Network → filtre por `?XTransformPort=3003` → veja
   se retorna 101 (Upgrade: websocket) ou 200 (polling).
3. Verifique se `PRESENTER_KEY` bate entre `.env` e as páginas cliente
   (ver §5.2). Se não bater, o socket conecta mas o `join-session`
   com `role: 'presenter'` é rejeitado.
4. Verifique o firewall: `ufw status` — portas 3003/3004 **não**
   devem estar abertas externamente, mas precisam ser acessíveis via
   Caddy (loopback).

### 15.4 Admin não consegue logar
**Sintoma**: form de login retorna "Credenciais inválidas".

**Causas**:
- `.env` com `ADMIN_SECRET_KEY` errado ou vazio
- PM2 não recarregou as env vars: rode `pm2 restart uems-next --update-env`
- O `.env` não está no diretório esperado: o standalone server lê do
  `cwd` do PM2 (`/var/www/uems-votacao`), não do `.next/standalone/`

### 15.5 Votos não aparecem na apresentação
**Sintoma**: aluno vota, tela de apresentação não atualiza.

**Diagnóstico**:
1. `pm2 logs uems-socket --lines 50` — veja se chegou o `submit-vote`
2. Verifique se a questão está ativa (admin → "Iniciar sessão")
3. Verifique se o admin/apresentação estão na mesma sala socket.io
   (mesmo `sessionCode`)
4. Se o socket caiu, a apresentação tem fallback de polling a cada 3s
   após 5s de desconexão (implementado na Task 5-a)

### 15.6 SQLite locked
**Sintoma**: `SQLITE_BUSY: database is locked` nos logs.

**Causa**: SQLite só suporta um escritor por vez. Em alta carga pode
haver contenção.

**Soluções**:
- Aumente o timeout no schema:
  ```prisma
  datasource db {
    provider = "sqlite"
    url      = env("DATABASE_URL")
    + // Prisma não suporta diretamente, mas via query:
  }
  ```
- Para produção com 5000+ alunos simultâneos, migre para Postgres:
  ```bash
  apt install -y postgresql
  sudo -u postgres createuser -P uems
  sudo -u postgres createdb -O uems uems_votacao
  ```
  Atualize `DATABASE_URL="postgresql://uems:senha@localhost:5432/uems_votacao"`,
  rode `bunx prisma migrate dev --name init`, ajuste o `backup.sh`.

### 15.7 Caddy não emite certificado
**Sintoma**: `caddy` logs mostram erro ACME, HTTPS não funciona.

**Causas comuns**:
- DNS ainda não propagou: `dig seu-dominio.com.br` deve retornar o IP da VM
- Porta 443 bloqueada: `ufw allow 443/tcp`
- Rate limit Let's Encrypt (5 falhas/hora): espere 1h e tente de novo
- Domínio já tem um certificado válido em outro servidor: remova-o antes

---

## Checklist final ✅

Antes de declarar "em produção":

- [ ] VM com ≥ 2 GB RAM, ≥ 10 GB disco, Ubuntu 22.04+
- [ ] bun, node 20, pm2, caddy, git, sqlite3 instalados
- [ ] Projeto em `/var/www/uems-votacao` (via git clone ou scp)
- [ ] `.env` preenchido com chaves fortes (NÃO defaults)
- [ ] `PRESENTER_KEY` igual no `.env` e nas páginas cliente (via `sed`)
- [ ] `bunx prisma generate` + `bun run db:push` rodaram sem erro
- [ ] `bunx next build` completou com `output: 'standalone'`
- [ ] `.next/standalone/` contém `public/`, `prisma/`, `.next/static/`, `.env`
- [ ] `pm2 start ecosystem.config.cjs` + `pm2 save` + `pm2 startup`
- [ ] Caddy configurado com domínio real + email real
- [ ] DNS aponta para a VM (`dig` retorna o IP correto)
- [ ] `ufw` configurado (22, 80, 443 abertos; 3000/3003/3004 bloqueados)
- [ ] `deploy/backup.sh` no cron diário
- [ ] `deploy/healthcheck.sh` retornando "All services healthy"
- [ ] Teste manual: criar sessão → aluno vota → apresentação mostra resultado
- [ ] Backup offsite configurado (rsync para outro servidor)

---

**Em caso de dúvida**, consulte o `worklog.md` na raiz do projeto para
o histórico de decisões de implementação (incluindo as tasks 5-a, 5-b,
5-c que endureceram socket, API e testes de carga).
