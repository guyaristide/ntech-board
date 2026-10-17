# Conception de NTECH Board

Ce document raconte comment l'outil a été pensé et construit, et pourquoi il a cette forme. Le fonctionnement technique détaillé est dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), la mise en production dans [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

## Le besoin de départ

Le point de départ est le cadrage du projet eTourisme SGAT (Côte d'Ivoire), pour lequel NTECH pilote les ateliers avec le client. Il fallait :

- transformer le cahier des charges v2.1 en backlog exploitable : **418 user stories réparties en 36 épiques** ;
- suivre un **programme d'ateliers** tenu dans un classeur Excel (planning, suivi des PV, références au cahier des charges) qui continue d'évoluer pendant le cadrage ;
- noter en séance les réponses aux points à trancher, sans retaper ensuite dans trois documents différents ;
- partager tout cela avec le client et l'équipe, chacun avec les bons droits.

Un Notion ou un Jira auraient pu faire une partie du travail, mais aucun ne savait relire le planning Excel à chaque nouvelle version sans écraser ce qui avait été saisi en atelier. C'est ce point qui a justifié un outil maison.

## Quatre étapes

### 1. Un mini Notion local

La première version tournait uniquement sur le poste, servie par Vite. Les données vivaient dans un fichier `data/workspace.json`, écrit par un petit plugin du serveur de développement.

Elle posait déjà les écrans qui sont restés :

- le **backlog** en tableau ou en Kanban, avec filtres et recherche ;
- une **page par US et par épique** : récit, critères d'acceptation, notes en blocs, commentaires ;
- le **programme des ateliers** : séquences, déroulé, points à trancher et réponses, notes de séance ;
- les **références au cahier des charges**, reliées aux séquences et aux épiques ;
- une recherche rapide (⌘K) sur tout le contenu.

Cette étape a servi à valider l'usage avant d'investir dans un serveur. Elle a aussi fixé la règle la plus importante de l'outil (voir plus bas) : un import ne perd jamais ce qui a été saisi.

### 2. L'identité NTECH

Le tableau a pris le logo et les couleurs de Neiba Technologies, avec la mention « un outil NTECH SARL ». Le nom du tableau est devenu un paramètre, pour pouvoir resservir l'outil sur d'autres projets que eTourisme.

### 3. Collaboratif et multi-projets

Une fois l'usage validé, il fallait que plusieurs personnes travaillent en même temps, depuis Abidjan et ailleurs, et que l'outil serve plusieurs clients. Le code a été réorganisé en monorepo :

```
apps/web/          front React
apps/server/       API Node (Hono), imports, temps réel, ligne de commande
packages/shared/   types communs au front et à l'API
```

Le front et l'API partagent les mêmes types : une US a la même forme partout, du fichier d'import jusqu'à l'écran.

### 4. Après les ateliers d'échange

Les ateliers du 13 au 16 octobre ont produit trois besoins que le backlog seul ne couvrait pas :

- **suivre les diligences** : chaque compte rendu se termine par une liste de qui doit produire, étudier, trancher ou fournir quoi, et de ce dont cela dépend. Elles sont devenues un contenu à part entière, relié aux US, aux ateliers et aux risques ;
- **relier les US** : beaucoup d'US d'exigence (EX) répètent une US de cas d'usage (UC), ou décrivent la même fonctionnalité sous un autre angle. Une liaison typée, posée des deux côtés, les regroupe ; des US ressemblantes sont proposées pour accélérer le repérage ;
- **savoir où vit chaque US** : portail, application mobile, PMS, PMS Light, back-office, socle et API, et surtout quel module de chacune. Les plateformes sont des données du projet, pas des listes du code, pour que l'outil serve aussi à d'autres clients.

Une description en clair complète le récit de chaque US ; les commentaires d'atelier peuvent y être repris d'un clic.

## Les choix et leurs raisons

### Un projet par sous-domaine

Chaque client a son adresse : `etourisme-board.neiba-technologies.com`, `pfo-board.neiba-technologies.com`. Le serveur lit le sous-domaine, en déduit le projet, et n'interroge jamais que celui-là.

Pourquoi ce choix plutôt qu'une instance par client :

- **une seule image et un seul déploiement** servent tous les projets. Ouvrir un nouveau projet, c'est une ligne en base, un enregistrement DNS et un domaine dans Coolify, sans reconstruire quoi que ce soit ;
- le cookie de session n'est valable que sur son sous-domaine : une connexion à eTourisme ne donne aucun accès à un autre client ;
- un client qui exige d'être hébergé à part reste possible : on déploie la même image avec sa propre base et `DEFAULT_PROJECT`.

### PostgreSQL plutôt que MongoDB

Les données sont à moitié relationnelles (projets, membres, rôles, sessions) et à moitié documentaires (US, ateliers, blocs de notes). PostgreSQL couvre les deux : tables classiques pour l'accès, colonnes JSONB pour les contenus. Il apporte aussi les transactions, le verrou de ligne pour les modifications simultanées et `LISTEN/NOTIFY` pour le temps réel, sans brique supplémentaire. MongoDB aurait demandé de recoder ces garanties à la main.

### Un temps réel simple

Le besoin réel est l'atelier : une dizaine de personnes sur le même backlog, rarement sur le même paragraphe au même moment. Le mécanisme retenu est donc volontairement simple :

1. le navigateur affiche la modification tout de suite et envoie seulement les champs changés, regroupés toutes les 400 ms ;
2. le serveur fusionne sous verrou, journalise la modification, puis notifie PostgreSQL ;
3. chaque instance relaie la nouvelle version aux navigateurs du projet par Server-Sent Events ;
4. un texte en cours de saisie n'est jamais remplacé sous les doigts.

Deux personnes qui modifient deux champs différents d'une même US gardent toutes les deux leur modification. Sur un même champ, la dernière écriture l'emporte. Une édition à plusieurs dans le même paragraphe, façon Google Docs, demanderait un CRDT (Yjs) : c'est écarté tant que l'usage ne le réclame pas.

La présence (« X consulte aussi cette page ») complète le dispositif, pour éviter les collisions avant qu'elles arrivent.

### Pas de mot de passe

La connexion se fait par un lien envoyé par e-mail (SMTP Brevo, depuis `contact@neiba-technologies.com`). Les participants aux ateliers sont des invités ponctuels, côté client comme côté partenaires : leur faire créer et retenir un mot de passe n'apporterait que des réinitialisations. L'accès se fait sur invitation, avec trois rôles :

- **lecteur** : consulte ;
- **éditeur** : modifie les US et les ateliers, commente ;
- **administrateur** : gère en plus les membres, le projet et les imports.

Les droits sont vérifiés côté serveur sur chaque route ; l'interface passe en lecture seule pour un lecteur, mais ce n'est qu'un confort. Le serveur répond la même chose à toute demande de lien, pour ne pas révéler qui fait partie du projet.

### Un import ne perd rien

C'est la règle centrale, héritée de la première version. Le planning Excel et le backlog sont réimportés plusieurs fois pendant le cadrage, alors que l'équipe les a déjà enrichis dans l'outil. Les règles :

- chaque contenu porte un numéro de révision. À `0`, il n'a jamais été touché dans l'outil, et un import peut le remplacer ; sinon, ce qui a été saisi est conservé ;
- les réponses et les points ajoutés à la main restent rattachés à leur séquence ;
- un atelier enrichi qui disparaît du planning est gardé sous `ancien-Jx` au lieu d'être supprimé ;
- le classeur source n'est jamais modifié.

Ces règles vivent dans un seul fichier sans base de données (`apps/server/src/merge.ts`), ce qui permet de les tester directement (`apps/server/test/merge.test.ts`).

### Une exploitation sans surprise

Le dernier lot de travail est venu du premier déploiement réel, quand la connexion ne marchait pas et qu'on ne voyait pas pourquoi. Il en est sorti :

- un **journal lisible dans Coolify**, une ligne par événement, catégorisée (`[http]`, `[connexion]`, `[mail]`, `[temps-réel]`, `[démarrage]`, `[erreur]`) ;
- une **vérification SMTP au démarrage**, et une ligne par demande de lien : envoyé, adresse non membre, limite atteinte ou refus du serveur mail ;
- un **diagnostic d'hôte** quand le projet n'est pas trouvé : hôte reçu et projet déduit, pour repérer tout de suite une erreur de `PROJECT_HOSTS` ;
- des routes d'API inconnues qui répondent en 404 JSON au lieu de renvoyer la page d'accueil.

L'administration courante (créer un projet, ajouter un membre, importer) passe par l'écran d'administration ou par une ligne de commande, utilisable aussi dans le conteneur.

## Ce qui a été écarté

| Option | Pourquoi non |
|---|---|
| Notion ou Jira | Pas de réimport du planning Excel sans écraser les saisies d'atelier |
| Une instance par client | Un déploiement et une base de plus à chaque projet |
| MongoDB | Garanties de transaction et de cohérence à recoder |
| Broker de messages (Redis, NATS) | `LISTEN/NOTIFY` suffit au volume d'un atelier |
| WebSocket | Le flux est surtout descendant ; SSE passe mieux les proxys et se reconnecte seul |
| CRDT (Yjs) | Coût élevé pour un cas rare, l'édition simultanée d'un même paragraphe |
| Mots de passe | Invités ponctuels, réinitialisations à gérer |
| Joker DNS `*.neiba-technologies.com` | Capterait tous les autres sous-domaines de l'entreprise |

## Limites connues et suites possibles

- **Une seule réplique** de l'application : la présence est tenue en mémoire. Les données et les notifications supporteraient plusieurs répliques ; il faudrait déplacer la présence dans PostgreSQL pour en ajouter.
- **Conflit sur un même champ** : la dernière écriture l'emporte. Un CRDT viendra si l'usage le demande.
- **Imports** limités au format du planning eTourisme (onglets Planning, Suivi des PV, Références CdC) et au backlog JSON. Un autre projet avec un autre classeur demandera un nouvel importeur dans `apps/server/src/importers/`.
