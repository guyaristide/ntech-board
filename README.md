# NTECH Board

Espace collaboratif de cadrage, édité par **NTECH SARL** (Neiba Technologies). Chaque projet client a son tableau, à son adresse :

- `etourisme-board.neiba-technologies.com`
- `pfo-board.neiba-technologies.com`
- …

Un tableau réunit :

- le **backlog des user stories**, en tableau ou en Kanban, filtrable par plateforme et par module. Chaque US se modifie sur sa page : description, plateformes visées (« PMS › Réservations »), récit, critères d'acceptation, liaisons avec les autres US, notes et commentaires ;
- les **diligences** issues des ateliers : ce que chaque partie doit produire, étudier, trancher ou fournir, ce dont cela dépend, et les US, ateliers et risques concernés ;
- le **programme des ateliers**, importé d'un planning Excel. On y retrouve les séquences et leur déroulé, les points à trancher avec leur réponse, et les notes de séance. Le planning de chaque semaine se télécharge en PDF, en synthèse ou avec le déroulé de chaque journée, de même que la couverture des cas d'usage par les ateliers (tout le programme ou une semaine). Les PDF sont construits par le serveur et téléchargés ;
- les **références au cahier des charges**, reliées aux séquences et aux épiques ;
- le **référentiel des parties prenantes** : organisations, personnes et rôles, que le RACI, les risques, les diligences et les séquences citent. Un onglet rapproche les noms déjà saisis en texte, sans les modifier.

La **partie Réalisation**, activée projet par projet, suit la livraison : les US validées passent en tickets, classés par priorité dans un backlog de réalisation, estimés, marqués « prêts », planifiés dans des sprints (capacité, démarrage, clôture avec vélocité et report des tickets non terminés, revue et rétrospective) et rangés dans des versions (feuille de route et frise). Chaque ticket a sa fiche (responsable, sous-tâches, liaisons « bloque / bloqué par », commentaires, historique) ; le tableau du sprint fait avancer les tickets d'étape en étape, et « Mes tickets » rassemble ceux qui vous sont attribués. Elle n'est envoyée qu'aux membres qui la voient.

Les **réglages du projet** (administrateurs) la paramètrent : activation, clé des tickets, durée des sprints, estimation, étapes et types de tickets, critères « prêt », et qui la voit (par rôle, par organisation ou membre par membre).

L'édition est collaborative et en temps réel : on voit les modifications des autres sans recharger, et qui consulte la même page. La connexion se fait par un lien envoyé par e-mail, sur invitation, avec trois rôles : administrateur, éditeur, lecteur.

## Démarrage en local

Prérequis : Node 22, Docker.

```bash
npm install
cp .env.example .env            # puis adapter (voir « .env de développement » ci-dessous)
npm run dev:db                  # PostgreSQL 17 sur le port 55433
npm run cli -- project:create etourisme --title "Cadrage eTourisme" --admin vous@exemple.com
npm run cli -- import:stories etourisme seeds/etourisme/stories.json
npm run cli -- import:planning etourisme seeds/etourisme/workshops.json
npm run cli -- import:raci etourisme seeds/etourisme/raci.json
npm run cli -- import:risks etourisme seeds/etourisme/risks.json
npm run cli -- import:cadrage etourisme "$PWD/seeds/etourisme/cadrage-2026-10-17.json"
npm run cli -- import:cadrage etourisme "$PWD/seeds/etourisme/parties.json"
npm run dev                     # API sur :3000, front sur :5190
```

Ouvrir ensuite <http://etourisme-board.localhost:5190>. Le navigateur résout `*.localhost` vers la machine.

En local, sans `SMTP_HOST`, le lien de connexion n'est pas envoyé : il s'affiche dans la console du serveur.

`.env` de développement :

```dotenv
DATABASE_URL=postgres://board:board@localhost:55433/board
PROJECT_HOSTS={slug}-board.localhost
DEFAULT_PROJECT=etourisme
SUPERADMIN_EMAILS=vous@exemple.com
STORAGE_DIR=./storage
COOKIE_SECURE=false
```

## Structure du dépôt

```
apps/web/          Front React (Vite) : pages, éditeur de blocs, temps réel
apps/server/       API Node (Hono) : authentification, données, temps réel, imports, CLI
  migrations/      Schéma PostgreSQL, appliqué au démarrage
packages/shared/   Types et contrats partagés entre le front et l'API
seeds/etourisme/   Contenu de départ du projet eTourisme (backlog, programme, phases et RACI, risques, cadrage du 17/10, parties prenantes)
deploy/            Scripts serveur : préparation des volumes, sauvegarde
docs/              Architecture, déploiement Coolify, exploitation
Dockerfile         Image unique (API + front)
docker-compose.yml Déploiement : application + PostgreSQL + volumes
```

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | API et front en mode développement |
| `npm run dev:db` | Base PostgreSQL locale (Docker) |
| `npm run build` | Construit le front et le serveur |
| `npm run typecheck` | Vérification TypeScript des trois paquets |
| `npm test` | Tests du serveur (sous-domaines, règles d'import) |
| `npm run cli -- <commande>` | Administration : projets, membres, imports (voir [docs/EXPLOITATION.md](docs/EXPLOITATION.md)) |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : choix techniques, modèle de données, temps réel, sécurité.
- [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) : mise en production sur Coolify, pas à pas (DNS, variables, paramètres SMTP Brevo, domaines, volumes, sauvegardes, **ajout d'un projet**).
- [docs/EXPLOITATION.md](docs/EXPLOITATION.md) : nouveau projet, membres, imports, sauvegarde et restauration, mises à jour, dépannage.
