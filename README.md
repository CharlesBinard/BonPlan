<div align="center">

<img src="packages/frontend/public/favicon.svg" width="80" height="80" alt="BonPlan logo" />

# BonPlan

**Trouve les meilleures affaires sur LeBonCoin, automatiquement.**

Plateforme de veille intelligente qui scrape, analyse et score les annonces en temps reel grace a l'IA.

[![CI](https://github.com/CharlesBinard/BonPlan/actions/workflows/ci.yml/badge.svg)](https://github.com/CharlesBinard/BonPlan/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3-f9f1e1?logo=bun&logoColor=black)](https://bun.sh/)
[![Hono](https://img.shields.io/badge/Hono-OpenAPI-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/CharlesBinard/BonPlan/pulls)

</div>

---

## Comment ca marche

```mermaid
graph LR
    U((Utilisateur)) -->|recherche| FE[Frontend React]
    FE <-->|REST + WebSocket| GW[Gateway Hono]

    GW -->|SearchCreated| ORCH[Orchestrator]
    ORCH -->|IA mapping| AI[AI Provider]
    ORCH -->|SearchTrigger| SCR[Scraper]

    SCR -->|CDP| CHR[Chrome Stealth]
    CHR -->|VPN| GLU[Gluetun ProtonVPN]
    SCR -->|ListingsFound| ANA[Analyzer]

    ANA -->|scoring IA| AI
    ANA -->|recherche prix| SRX[SearXNG]
    ANA -->|ListingAnalyzed| NOT[Notifier]

    NOT -->|alerte| DISC[Discord]
    NOT -->|webhook| WH[Webhook]

    GW & ORCH & SCR & ANA & NOT <-->|events| RED[(Redis Streams)]
    GW & ORCH & SCR & ANA & NOT <-->|data| PG[(PostgreSQL)]

    style U fill:#6366f1,stroke:none,color:#fff
    style FE fill:#3b82f6,stroke:none,color:#fff
    style GW fill:#f97316,stroke:none,color:#fff
    style ORCH fill:#8b5cf6,stroke:none,color:#fff
    style SCR fill:#10b981,stroke:none,color:#fff
    style ANA fill:#ec4899,stroke:none,color:#fff
    style NOT fill:#f59e0b,stroke:none,color:#fff
    style AI fill:#6366f1,stroke:none,color:#fff
    style RED fill:#dc2626,stroke:none,color:#fff
    style PG fill:#336791,stroke:none,color:#fff
    style CHR fill:#4285f4,stroke:none,color:#fff
    style GLU fill:#22c55e,stroke:none,color:#fff
    style SRX fill:#0ea5e9,stroke:none,color:#fff
    style DISC fill:#5865F2,stroke:none,color:#fff
    style WH fill:#6b7280,stroke:none,color:#fff
```

## Fonctionnalites

- **Recherche intelligente** — Decris ce que tu cherches en langage naturel, l'IA genere les bons mots-cles et criteres de jugement
- **Scraping stealth** — Chrome reel en mode headed derriere un VPN, indistinguable d'un vrai utilisateur
- **Scoring IA** — Chaque annonce est analysee et notee de 0 a 100 avec estimation du prix marche
- **Alertes temps reel** — Notifications Discord et webhooks des qu'une bonne affaire est detectee
- **Multi-provider IA** — Claude, OpenAI, Gemini ou Minimax selon ta preference
- **Dashboard** — Interface React moderne avec suivi des recherches, favoris et historique

## Architecture

Monorepo event-driven avec 8 packages communiquant via Redis Streams :

| Package | Role | Runtime |
|---------|------|---------|
| **[gateway](packages/gateway)** | API REST OpenAPI + WebSocket + static frontend | Bun |
| **[orchestrator](packages/orchestrator)** | Mapping IA des recherches + scheduling | Bun |
| **[scraper](packages/scraper)** | Scraping LeBonCoin via Patchright/CDP | Node |
| **[analyzer](packages/analyzer)** | Scoring IA + recherche de prix marche | Bun |
| **[notifier](packages/notifier)** | Discord bot + webhooks | Bun |
| **[frontend](packages/frontend)** | SPA React + TanStack Router | Vite |
| **[shared](packages/shared)** | Schema DB, events Redis, types, crypto | Bun |
| **[ai](packages/ai)** | Wrapper Vercel AI SDK multi-provider | Bun |

## Stack technique

<table>
<tr>
<td align="center" width="140"><strong>Runtime</strong></td>
<td>

![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

</td>
</tr>
<tr>
<td align="center"><strong>Backend</strong></td>
<td>

![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle_ORM-C5F74F?logo=drizzle&logoColor=black)
![Zod](https://img.shields.io/badge/Zod-3E67B1?logo=zod&logoColor=white)

</td>
</tr>
<tr>
<td align="center"><strong>Frontend</strong></td>
<td>

![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![TanStack](https://img.shields.io/badge/TanStack_Router-FF4154?logo=reactquery&logoColor=white)

</td>
</tr>
<tr>
<td align="center"><strong>Data</strong></td>
<td>

![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?logo=redis&logoColor=white)

</td>
</tr>
<tr>
<td align="center"><strong>IA</strong></td>
<td>

![Anthropic](https://img.shields.io/badge/Claude-D4A574?logo=anthropic&logoColor=black)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?logo=openai&logoColor=white)
![Google](https://img.shields.io/badge/Gemini-8E75B2?logo=googlegemini&logoColor=white)

</td>
</tr>
<tr>
<td align="center"><strong>Infra</strong></td>
<td>

![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare_Tunnel-F38020?logo=cloudflare&logoColor=white)
![ProtonVPN](https://img.shields.io/badge/ProtonVPN-6D4AFF?logo=protonvpn&logoColor=white)

</td>
</tr>
</table>

## Demarrage rapide

### Prerequis

- [Bun](https://bun.sh/) >= 1.3
- [Docker](https://docs.docker.com/get-docker/) + Docker Compose
- Une cle API IA (Claude, OpenAI, ou Gemini)

### Installation

```bash
# Cloner le repo
git clone https://github.com/CharlesBinard/BonPlan.git
cd BonPlan

# Installer les dependances
bun install

# Configurer l'environnement
cp .env.example .env
# Editer .env avec tes secrets (voir .env.example pour les instructions)

# Lancer l'infrastructure (Postgres, Redis, Chrome, SearXNG)
docker compose up -d

# Lancer les migrations DB
bun run db:migrate

# Lancer tous les services en dev
bun run dev
```

L'app est accessible sur `http://localhost:5173` (frontend) et `http://localhost:3000` (API).

### Commandes utiles

```bash
bun run dev              # Tous les services via mprocs (TUI)
bun run dev:frontend     # Frontend seul
bun run dev:backend      # Backend services seuls
bun run check            # Biome lint + format
bun run check:fix        # Auto-fix lint + format
bun run test             # Tests (Bun test runner)
bun run typecheck        # TypeScript strict
bun run db:generate      # Generer une migration Drizzle
bun run db:migrate       # Appliquer les migrations
bun run db:studio        # Drizzle Studio (GUI)
bun run infra:up         # Docker compose up
bun run infra:down       # Docker compose down
```

## Deploiement

Le projet inclut un `docker-compose.prod.yml` et des Dockerfiles par service dans `docker/`. Compatible avec [Coolify](https://coolify.io/), Portainer, ou tout orchestrateur Docker.

```bash
# Production avec Cloudflare Tunnel
docker compose -f docker-compose.prod.yml up -d
```

Variables requises : voir [`.env.example`](.env.example).

## Contribuer

Les contributions sont les bienvenues ! Voir les [issues ouvertes](https://github.com/CharlesBinard/BonPlan/issues) pour les taches disponibles.

1. Fork le repo
2. Cree ta branche (`git checkout -b feat/ma-feature`)
3. Commit tes changements (`git commit -m 'feat: ajout de ma feature'`)
4. Push (`git push origin feat/ma-feature`)
5. Ouvre une Pull Request

Le CI verifie automatiquement : typecheck, lint (Biome), tests, et build frontend.

## License

Distribue sous licence MIT. Voir [`LICENSE`](LICENSE) pour plus d'informations.

---

<div align="center">

Fait avec :coffee: par [Charles Binard](https://github.com/CharlesBinard)

</div>
