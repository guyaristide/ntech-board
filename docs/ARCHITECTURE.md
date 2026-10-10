# Architecture

## Vue d'ensemble

```
 Navigateur (React)                       Serveur Coolify
 ┌──────────────────────┐   HTTPS   ┌───────────────────────────────────────────┐
 │ etourisme-board.…    │──────────▶│ Traefik (proxy Coolify, certificats TLS)  │
 │ pfo-board.…          │           └───────────────┬───────────────────────────┘
 └──────────────────────┘                           │ Host conservé
        ▲    │ REST /api/*                          ▼
        │    │ SSE  /api/events         ┌─────────────────────────┐
        │    └─────────────────────────▶│ app (Node 22, Hono)     │
        └───── entités à jour, présence │  · API + front statique │
                                        │  · LISTEN board_events  │
                                        └──────┬──────────▲───────┘
                                   SQL, NOTIFY │          │ notifications
                                               ▼          │
                                        ┌─────────────────┴───────┐
                                        │ db (PostgreSQL 17)      │
                                        └─────────────────────────┘
        volumes : board-db (données), board-storage (fichiers importés), board-backups (sauvegardes)
```

On déploie un seul dépôt, qui produit une seule image et sert tous les projets. Le projet servi est déduit du **sous-domaine** : `etourisme-board.neiba-technologies.com` sert le projet `etourisme`. Créer un projet ne demande donc aucun nouveau déploiement. Il suffit d'une ligne en base, d'un enregistrement DNS et d'un domaine de plus dans Coolify.

## Pourquoi PostgreSQL

- **Les données sont relationnelles :** projets, membres, rôles, sessions, et contenus rattachés à un projet.
- **Les contenus restent souples :** US, ateliers et blocs de notes sont stockés en **JSONB**. Le front et l'API partagent les mêmes types (`packages/shared`).
- **Les modifications simultanées sont sûres :** chaque écriture se fait dans une transaction, avec un verrou sur la ligne (`SELECT … FOR UPDATE`). Si deux personnes changent deux champs différents d'une même US au même moment, les deux changements sont conservés.
- **Le temps réel est intégré :** `LISTEN/NOTIFY` diffuse les changements, sans broker supplémentaire.
- **Coolify le gère nativement**, et les outils de sauvegarde sont standards (`pg_dump`, `pg_restore`).

MongoDB n'apporterait rien ici. Il faudrait recoder à la main les garanties de transaction et de cohérence entre projets, membres et contenus.

## Isolation des projets (multi-tenant)

- Toutes les tables métier portent `project_id`. L'API résout le projet **avant** toute requête, d'après l'en-tête `Host` (`apps/server/src/hosts.ts`), et n'interroge jamais que ce projet.
- Les sessions sont liées à un projet. Le cookie `board_session` est posé sans attribut `Domain` : il ne vaut que pour le sous-domaine courant. Une session ouverte sur `etourisme-board` ne donne donc aucun accès à `pfo-board`.
- Les **super-administrateurs** (`SUPERADMIN_EMAILS`, l'équipe NTECH) sont administrateurs de tous les projets. Ils doivent tout de même se connecter sur chaque sous-domaine.
- Instance dédiée possible : pour un client qui exige d'être hébergé à part, on déploie la même image avec `DEFAULT_PROJECT=<slug>` et sa propre base.

## Modèle de données

Le schéma est dans `apps/server/migrations/001_init.sql`.

| Table | Contenu |
|---|---|
| `projects` | `slug` (sous-domaine), titre, sous-titre, dernier planning importé |
| `users` | e-mail (unique, insensible à la casse), nom, dernière connexion |
| `memberships` | rôle d'un utilisateur dans un projet : `admin`, `editor` ou `viewer` |
| `login_tokens` | liens de connexion. Seul le hash SHA-256 est stocké ; un lien expire au bout de 20 minutes et ne sert qu'une fois |
| `sessions` | sessions ouvertes (hash du jeton), 30 jours glissants |
| `entities` | contenus : `story`, `epic`, `workshop`, `reference`, en JSONB, avec `position` et `revision` |
| `events` | journal de chaque modification (qui, quoi, quand), qui alimente l'historique des pages |

`revision = 0` signifie qu'un contenu n'a jamais été modifié dans l'outil. Un nouvel import peut alors le remplacer ; sinon, ce qui a été saisi est conservé.

## Collaboration et temps réel

1. **Écriture.** Le front applique la modification tout de suite, à l'écran. Il regroupe les frappes pendant 400 ms, puis envoie un `PATCH` qui ne porte que les champs modifiés.
2. **Serveur.** Il ouvre une transaction et verrouille la ligne. Il fusionne les champs, incrémente `revision`, inscrit l'action dans `events`, puis exécute `pg_notify('board_events', …)`. La notification n'est délivrée qu'une fois la transaction validée.
3. **Diffusion.** Chaque instance écoute le canal. Elle relit l'entité et la pousse aux navigateurs du projet par **Server-Sent Events** (`GET /api/events`). Un battement toutes les 25 secondes empêche les proxys de couper la connexion.
4. **Réception.** Un navigateur remplace l'entité par la version reçue, sauf s'il a lui-même une écriture en cours dessus. Dans ce cas, la réponse du serveur, déjà fusionnée, lui sert de version à jour. Un texte en cours de saisie n'est jamais remplacé sous les doigts.
5. **Présence.** Chaque onglet signale la page consultée toutes les 30 secondes. Les autres voient « X consulte aussi cette page » et la liste des membres en ligne.

En cas de conflit sur **un même champ**, la dernière écriture l'emporte. Ce comportement suffit pour un usage en atelier. L'édition simultanée d'un même paragraphe, comme dans Google Docs, demanderait un CRDT (Yjs) et pourrait venir plus tard.

**Limite :** la présence est tenue en mémoire de l'instance. Il faut donc garder **une seule réplique** de `app`, ce qui est la configuration par défaut dans Coolify. Les données et les notifications, elles, supporteraient plusieurs répliques.

## Authentification et rôles

- **Pas de mot de passe :** l'utilisateur saisit son e-mail et reçoit un lien. Le serveur répond toujours la même chose, pour ne pas révéler qui a accès au projet. Chaque personne a droit au plus à 5 liens par quart d'heure.
- **Rôles :**
  - lecteur : consulte ;
  - éditeur : modifie les US et les ateliers et commente ;
  - administrateur : gère en plus les membres, le projet et les imports.
- **Contrôle côté serveur :** les droits sont vérifiés sur chaque route. Pour un lecteur, l'interface passe aussi en lecture seule.

## Sécurité

- Cookie de session `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS ; seuls des hashes de jetons sont stockés en base.
- Protection CSRF : en plus de `SameSite`, toute écriture dont l'en-tête `Origin` ne correspond pas à l'hôte est refusée.
- Toutes les entrées sont validées par des schémas (zod), avec des tailles maximales. Les fichiers importés sont limités à 15 Mo.
- En-têtes de sécurité : CSP restrictive, `frame-ancestors 'none'`, `nosniff`, etc.
- L'application tourne sous un utilisateur non root (`node`, uid 1000), avec `tini` comme processus d'initialisation.
- Les secrets (mot de passe de la base et du SMTP) ne vivent que dans les variables d'environnement de Coolify.

## Imports

- **Planning des ateliers (.xlsx) :** lu par `apps/server/src/importers/planning.ts` (onglets Planning, Suivi des PV et Références CdC). Le classeur n'est jamais modifié.
- **Backlog (.json `{ epics, stories }`) :** les US jamais modifiées sont mises à jour, les autres sont conservées.

Dans les deux cas, les règles de fusion sont dans `apps/server/src/merge.ts` et testées dans `apps/server/test/merge.test.ts`. Un import ne perd rien de ce qui a été saisi :

- les réponses et les points ajoutés à la main restent rattachés à leur séquence ;
- un atelier enrichi qui disparaît du planning est gardé sous `ancien-Jx`.
