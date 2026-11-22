# Déploiement sur Coolify

Ce guide met NTECH Board en production sur le serveur Coolify de NTECH SARL. Il couvre :

- le DNS ;
- la ressource Docker Compose ;
- les variables d'environnement ;
- les domaines ;
- les volumes persistants et leurs droits ;
- le premier projet ;
- les sauvegardes.

Le déploiement comporte deux services (`docker-compose.yml`) :

| Service | Image | Rôle | Volume |
|---|---|---|---|
| `app` | construite depuis `Dockerfile` | API, front, temps réel (port interne 3000) | `board-storage` monté sur `/app/storage` |
| `db` | `postgres:17-alpine` | base de données | `board-db` monté sur `/var/lib/postgresql/data` ; `board-backups` monté sur `/backups` |

Seul `app` est exposé, et uniquement à travers le proxy de Coolify. La base n'a aucun port ouvert sur l'extérieur.

## 1. DNS

Créez un enregistrement par projet, pointant vers l'adresse IP du serveur Coolify :

```
etourisme-board.neiba-technologies.com.   A   <IP du serveur Coolify>
pfo-board.neiba-technologies.com.         A   <IP du serveur Coolify>
```

Pourquoi des enregistrements explicites plutôt qu'un joker :

- un joker `*.neiba-technologies.com` capterait aussi tous les autres sous-domaines de l'entreprise ;
- un joker partiel comme `*-board` n'existe pas en DNS ;
- Coolify obtient alors un certificat Let's Encrypt pour chaque domaine, par défi HTTP, sans configuration DNS supplémentaire.

## 2. Ressource Coolify

1. Poussez le dépôt `ntech-board` sur votre forge (GitHub, GitLab…).
2. Dans Coolify : **Projects**, votre projet, **+ New**, puis **Private Repository**, avec GitHub App ou clé de déploiement.
3. Sélectionnez le dépôt et la branche `main`.
4. **Build Pack : Docker Compose**, fichier `/docker-compose.yml`.
5. Enregistrez. Coolify détecte les deux services `app` et `db`.

## 3. Variables d'environnement

Ouvrez l'onglet **Environment Variables** de la ressource. Coolify y liste les variables trouvées dans `docker-compose.yml`. Les obligatoires sont marquées `:?`.

| Variable | Valeur | Obligatoire |
|---|---|---|
| `POSTGRES_PASSWORD` | Mot de passe fort de la base, par exemple généré par `openssl rand -hex 24`. **Il ne doit plus changer ensuite** : PostgreSQL ne le lit qu'à la création du volume | oui |
| `SUPERADMIN_EMAILS` | E-mails NTECH administrateurs de tous les projets, séparés par des virgules | oui |
| `SMTP_PASSWORD` | Clé SMTP Brevo de `contact@neiba-technologies.com` | oui |
| `SMTP_HOST` | `smtp-relay.brevo.com` (valeur par défaut) | non |
| `SMTP_PORT` | `587` (STARTTLS, valeur par défaut) | non |
| `SMTP_SECURE` | `false` pour STARTTLS sur 587 ; `true` seulement pour du SSL direct sur 465 | non |
| `SMTP_USER` | `contact@neiba-technologies.com` (valeur par défaut) | non |
| `SMTP_FROM` | `NTECH Board <contact@neiba-technologies.com>` (valeur par défaut) | non |
| `PROJECT_HOSTS` | Laisser **vide** : le modèle par défaut est `{slug}-board.neiba-technologies.com`. Si vous le renseignez, il doit contenir `{slug}`, et **jamais** un domaine complet comme `etourisme-board.neiba-technologies.com` | non |
| `DEFAULT_PROJECT` | Vide. À renseigner uniquement pour une instance dédiée à un seul projet | non |
| `SESSION_DAYS` | `30` | non |
| `LOGIN_TOKEN_MINUTES` | `20` | non |
| `COOKIE_SECURE` | `auto` : cookies `Secure` en HTTPS, d'après `X-Forwarded-Proto` | non |
| `SECRETS_KEY` | Clé de chiffrement des clés de stockage (Cloudinary, MinIO, S3) et de la clé Claude saisies dans les réglages, par exemple `openssl rand -base64 32`. Sans elle, les pièces jointes restent sur le serveur (volume `board-storage`). **Ne plus la changer ensuite** : les clés déjà enregistrées deviendraient illisibles, il faudrait les ressaisir | non, mais nécessaire pour Cloudinary, MinIO, S3 et l’analyse par Claude |
| `AI_MODEL`, `AI_EFFORT` | Modèle Claude et niveau d’effort de l’analyse des échanges (écran « À relire »), communs à tous les projets (`low`, `medium`, `high`, `xhigh`, `max`) ; la clé Claude, elle, est saisie par chaque projet dans ses Réglages et chiffrée avec `SECRETS_KEY`. Par défaut `claude-opus-5-5` et `medium` | non |
| `PLATFORM_HOST` | Hôte de la console de la plateforme, réservée aux super-administrateurs (voir « Console de la plateforme »). Par défaut `boards.neiba-technologies.com` | non |
| `PUBLIC_ORIGIN` | Adresse publique d’un projet dans les liens des e-mails de notification, `{slug}` étant le projet. Vide : le premier modèle de `PROJECT_HOSTS`, en https (`https://{slug}-board.neiba-technologies.com`). À renseigner seulement si l’adresse publique diffère | non |
| `NOTIFY_QUIET_MINUTES`, `NOTIFY_DIGEST_HOUR` | Notifications par e-mail : minutes de calme avant d’envoyer un e-mail « tout de suite » (des changements en rafale n’en font qu’un ; 5 par défaut), et heure du serveur pour le récapitulatif quotidien et les rappels d’échéance (8 par défaut). Les e-mails partent par le même SMTP que les liens de connexion | non |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notifications système (téléphone, ordinateur), même tableau fermé. Créez la paire une fois avec `npx web-push generate-vapid-keys` ; `VAPID_SUBJECT` est une adresse de contact (`mailto:…`). Sans elles, les notifications restent dans le tableau et par e-mail. **Ne plus changer la paire ensuite** : les abonnements des appareils deviendraient invalides | non, mais nécessaire pour les notifications système |

Marquez `POSTGRES_PASSWORD`, `SMTP_PASSWORD`, `SECRETS_KEY` et `VAPID_PRIVATE_KEY` comme secrets dans Coolify (option **Is Secret** ou **Locked**, selon la version).

### Paramètres SMTP (Brevo)

**Où les saisir.** En production, dans l'onglet **Environment Variables** de la ressource Coolify. En local, dans le fichier `.env` à la racine du dépôt, qui n'est pas versionné. Le code ne contient aucun paramètre SMTP.

**Obtenir le mot de passe (`SMTP_PASSWORD`).** Ce n'est pas le mot de passe du compte Brevo, mais une **clé SMTP** :

1. Brevo, menu du compte, puis **SMTP & API**, onglet **SMTP**.
2. **Générer une nouvelle clé SMTP**, et la copier aussitôt : elle ne s'affiche qu'une fois.
3. Sur la même page, relever le **Login** SMTP et le mettre dans `SMTP_USER`. Selon l'ancienneté du compte, Brevo affiche l'adresse du compte (`contact@neiba-technologies.com`) ou un identifiant du type `xxxxxx@smtp-brevo.com`. L'expéditeur vu par les destinataires reste celui de `SMTP_FROM`.

**Délivrabilité.** Côté Brevo, l'expéditeur `contact@neiba-technologies.com` doit être validé (menu **Expéditeurs**) et le domaine `neiba-technologies.com` authentifié (menu **Domaines**, enregistrements DNS SPF et DKIM). Sans cela, les liens de connexion risquent d'arriver en indésirables.

**Appliquer une modification.** Après avoir modifié une variable SMTP, faites **Restart** de la ressource : les variables sont lues au démarrage, aucune reconstruction n'est nécessaire.

**En local**, ajouter au `.env` :

```dotenv
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=contact@neiba-technologies.com
SMTP_PASSWORD=la-clé-smtp-brevo
SMTP_FROM=NTECH Board <contact@neiba-technologies.com>
```

Sans `SMTP_HOST`, aucun e-mail ne part : le lien de connexion s'affiche dans la console du serveur.

**Vérifier.** Demandez un lien depuis la page de connexion. Si l'envoi échoue, la page affiche « L'envoi a échoué, réessayez dans un instant ». Les logs du service **app** contiennent alors la cause, sur une ligne `Envoi du lien de connexion impossible (...)`. Une réponse `535 Authentication failed` signale un mauvais `SMTP_USER` ou une mauvaise clé.

### Console de la plateforme

La console est l'espace au-dessus de tous les projets, réservé aux super-administrateurs. Elle est
servie par la même application, sur un hôte qui ne correspond à aucun projet. On y trouve :

- **Projets** : la liste et l'activité de chacun, la création, l'ouverture sans se reconnecter, et une
  page par projet (vue d'ensemble chiffrée, membres, sessions et jetons MCP, réglages, export, imports,
  restauration, duplication, journal des modifications, changement d'adresse, suppression) ;
- **Comptes** : tous les utilisateurs, leurs projets et leurs rôles ;
- **Super-administrateurs** : qui accède à la console ;
- **État** : services (test de la connexion SMTP, e-mail d'essai), exécution, base de données (tables,
  migrations), activité, files d'attente, configuration lue au démarrage, sans aucun secret ;
- **Journal** : chaque action faite depuis la console, avec son auteur.

**Mise en service**

1. **DNS** : un enregistrement pour `boards.neiba-technologies.com` vers le serveur (inutile si un
   enregistrement générique `*.neiba-technologies.com` existe déjà).
2. **Coolify** : ajoutez `https://boards.neiba-technologies.com` aux domaines de la ressource `app`,
   à côté des domaines des projets (section 4), puis redéployez pour obtenir le certificat.
3. **Variable** `PLATFORM_HOST` : à renseigner seulement si l'hôte diffère de la valeur par défaut.
4. **Accès** : ouvrez `https://boards.neiba-technologies.com` et demandez un lien de connexion avec une
   adresse de `SUPERADMIN_EMAILS`. Toute autre adresse est ignorée, sans message d'erreur (les logs,
   eux, le disent : catégorie `[console]`).

**Qui est super-administrateur**

- Les adresses de `SUPERADMIN_EMAILS` : définies dans Coolify, elles ne se retirent pas depuis la
  console. Gardez-en au moins une que vous contrôlez.
- Celles désignées dans la console (rubrique Super-administrateurs) : ajoutables et retirables par
  n'importe quel super-administrateur. Retirer quelqu'un ferme ses sessions de console tout de suite.

Un super-administrateur est administrateur de fait de tous les projets ; désignez-en peu.

**À savoir**

- La session de la console est distincte de celle des projets : une session de projet n'ouvre pas la
  console, et inversement. « Ouvrir » un projet depuis la console crée un lien d'entrée à usage unique,
  valable deux minutes.
- **Changer l'adresse d'un projet** change son sous-domaine : ajoutez le nouveau domaine dans Coolify
  (et le DNS) avant, retirez l'ancien après. Les membres sont déconnectés et doivent réactiver leurs
  notifications système.
- **Supprimer un projet** est définitif : contenu, membres, réglages, historique, fichiers. La console
  demande de saisir l'adresse du projet. Téléchargez l'export complet avant ; il se restaure dans un
  projet vide (Gérer, Données, « Restaurer un export complet »).
- Toutes les actions de la console sont tracées : dans son onglet Journal (table `platform_audit`),
  et dans les logs de `app`, catégorie `[console]`, avec l'adresse de qui les a faites.
- **Dupliquer un projet** copie les réglages et, au choix, le contenu ; pas les membres, les fichiers
  joints, les discussions ni l'historique.
- L'état affiche la version déployée si la variable `SOURCE_COMMIT` est fournie (Coolify la donne).

### Notifications système (clés VAPID)

Les notifications système s'affichent sur le téléphone ou l'ordinateur même quand le tableau est fermé.
Le navigateur n'accepte de s'y abonner que si le serveur prouve son identité avec une paire de clés,
dite VAPID : une clé publique, donnée aux navigateurs, et une clé privée, qui signe chaque envoi. Sans
cette paire, tout le reste fonctionne (notifications dans le tableau et par e-mail) ; seules les
notifications système sont absentes, et le bouton « Activer les notifications » n'apparaît pas.

**1. Créer la paire, une seule fois pour la plateforme.** Sur un poste où Node.js est installé :

```bash
npx web-push generate-vapid-keys
```

ou, sans rien installer, dans le conteneur de l'application déjà déployée (terminal Coolify de `app`) :

```bash
node node_modules/web-push/src/cli.js generate-vapid-keys
```

La commande affiche les deux clés :

```
=======================================
Public Key:
BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U

Private Key:
UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls
=======================================
```

(Ces valeurs sont un exemple : n'utilisez que celles que la commande vous donne.)

**2. Les renseigner dans Coolify**, onglet **Environment Variables** de la ressource :

| Variable | Valeur |
|---|---|
| `VAPID_PUBLIC_KEY` | la ligne sous `Public Key:` (87 caractères, commence en général par `B`) |
| `VAPID_PRIVATE_KEY` | la ligne sous `Private Key:` (43 caractères), à marquer comme secret |
| `VAPID_SUBJECT` | une adresse de contact, sous la forme `mailto:contact@neiba-technologies.com` ; les services de push s'en servent pour joindre l'exploitant en cas de problème |

Copiez chaque clé sur une seule ligne, sans espace ni guillemets.

**3. Redéployer**, puis vérifier dans les logs de `app` la ligne :

```
[push] Notifications système actives (clés VAPID présentes).
```

Si vous lisez « inactives : VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY non renseignées », l'une des deux
variables est vide ou mal nommée.

**4. Côté utilisateur**, chacun active les notifications sur chacun de ses appareils : cloche du menu,
onglet **Préférences**, **Activer les notifications**, puis accepter la demande du navigateur. Les cases
à cocher choisissent ensuite les familles de notifications voulues sur l'appareil.

À savoir :

- **La même paire sert à tous les projets** de la plateforme : elle se crée une fois, pas par projet.
- **Ne changez plus la paire une fois en service.** Les abonnements des appareils sont liés à la clé
  publique : avec une nouvelle paire, plus aucune notification système n'arrive, et chaque personne doit
  désactiver puis réactiver les notifications sur chaque appareil. Gardez une copie des deux clés avec
  vos autres secrets (gestionnaire de mots de passe) : elles ne sont affichées qu'à la création.
- **La clé privée ne se partage pas** : qui la détient peut envoyer des notifications au nom du tableau.
- **HTTPS est obligatoire** (c'est le cas derrière Coolify) ; en local, `http://localhost` est accepté.
- **iPhone et iPad** : les notifications système demandent iOS 16.4 ou plus, et d'installer d'abord le
  tableau sur l'écran d'accueil (Safari, bouton Partager, « Sur l'écran d'accueil »), puis de les
  activer depuis l'application installée.
- **Anti-rafale** : une notification système ne part que pour une notification nouvelle, pas à chaque
  changement regroupé, et pas si la personne a déjà le tableau ouvert.
- Un appareil dont l'abonnement a expiré (navigateur réinitialisé, autorisation retirée) est retiré
  automatiquement au premier envoi refusé.

## 4. Domaines

Dans la ressource, ouvrez le service **app**, champ **Domains**. Saisissez les domaines des projets avec le port interne `:3000`, séparés par des virgules :

```
https://etourisme-board.neiba-technologies.com:3000,https://pfo-board.neiba-technologies.com:3000
```

Le suffixe `:3000` indique à Coolify (Traefik) vers quel port du conteneur router : il n'apparaît pas dans l'URL publique. Laissez le service **db** sans domaine.

## 5. Volumes persistants et droits

### Option A, recommandée : volumes nommés

`docker-compose.yml` déclare trois volumes nommés : `board-db`, `board-storage` et `board-backups`. Coolify les crée au premier déploiement, en préfixant leur nom par l'identifiant de la ressource. Ils survivent aux redéploiements. Les droits sont corrects d'office :

- `board-db` est initialisé par l'image PostgreSQL : propriétaire `postgres`, uid 70, mode `700` ;
- `board-storage` hérite des droits préparés dans l'image : propriétaire `node`, uid 1000, mode `750`, avec les sous-dossiers `imports/` et `backups/` ;
- `board-backups` est écrit par la tâche de sauvegarde, qui s'exécute dans le conteneur `db`.

Pour les retrouver sur le serveur : `docker volume ls | grep board`.

### Option B : dossiers de l'hôte

Cette option sert si vous voulez des chemins fixes, pour les sauvegarder avec d'autres outils.

1. Sur le serveur, préparez les dossiers avec les bons propriétaires :

   ```bash
   sudo sh deploy/prepare-host.sh /data/ntech-board
   ```

   Le script crée :

   | Dossier | Propriétaire | Mode |
   |---|---|---|
   | `/data/ntech-board/postgres` | uid 70 | `700` |
   | `/data/ntech-board/backups` | uid 70 | `750` |
   | `/data/ntech-board/storage` (avec `imports/` et `backups/`) | uid 1000 | `750` |

2. Dans Coolify, onglet **Persistent Storage** de chaque service, remplacez les volumes par ces chemins :

   | Service | Chemin hôte | Chemin conteneur |
   |---|---|---|
   | db | `/data/ntech-board/postgres` | `/var/lib/postgresql/data` |
   | db | `/data/ntech-board/backups` | `/backups` |
   | app | `/data/ntech-board/storage` | `/app/storage` |

   Vous pouvez aussi modifier les lignes `volumes:` du compose en conséquence.

Si les droits sont faux, PostgreSQL refuse de démarrer : `data directory has wrong ownership`. Relancez alors le script.

## 6. Premier déploiement

1. Cliquez sur **Deploy**. Coolify construit l'image (deux à trois minutes), démarre `db`, attend qu'elle soit saine, puis démarre `app`.
2. Au démarrage, `app` applique les migrations, puis affiche `NTECH Board à l'écoute sur le port 3000` dans **Logs**.
3. La sonde `GET /api/health` doit répondre `{"ok":true}`. Coolify affiche alors le service comme *healthy*.

## 7. Créer le premier projet

Ouvrez le **Terminal** du service **app** dans Coolify, ou lancez `docker exec -it <conteneur app> sh` sur le serveur :

```bash
node apps/server/dist/cli.js project:create etourisme \
  --title "Cadrage eTourisme" \
  --subtitle "Plateforme nationale eTourisme, programme SGAT" \
  --admin k.neiba@neiba-technologies.com

# Contenu de départ, livré dans l'image (dossier seeds/)
node apps/server/dist/cli.js import:stories  etourisme seeds/etourisme/stories.json
node apps/server/dist/cli.js import:planning etourisme seeds/etourisme/workshops.json
node apps/server/dist/cli.js import:raci     etourisme seeds/etourisme/raci.json
node apps/server/dist/cli.js import:risks    etourisme seeds/etourisme/risks.json
```

Ouvrez ensuite <https://etourisme-board.neiba-technologies.com>, saisissez votre e-mail, puis cliquez sur le lien reçu. Les membres s'invitent ensuite depuis **Administration**. C'est aussi là que se font les imports suivants : nouveau planning `.xlsx`, nouveau backlog `.json`.

## 8. Sauvegardes

Dans la ressource, ouvrez **Scheduled Tasks**, puis **+ Add** :

- **Name** : `sauvegarde-base`
- **Container** : `db`
- **Frequency** : `0 2 * * *` (chaque nuit à 2 h)
- **Command** :

  ```sh
  sh -c 'pg_dump -U board -d board -Fc -f /backups/board-$(date +%Y%m%d-%H%M).dump && find /backups -name "board-*.dump" -mtime +14 -delete'
  ```

La commande fait la même chose que `deploy/backup.sh` : un fichier par nuit, 14 jours de conservation, dans le volume `board-backups`. Copiez régulièrement ce volume hors du serveur, vers un stockage S3, un autre serveur ou un NAS. Une sauvegarde qui reste sur la même machine ne protège pas contre la perte du serveur. Le volume `board-storage` contient les fichiers importés et les pièces jointes gardées sur le serveur (dossier `files/`) : sauvegardez-le aussi. Les pièces jointes rangées dans Cloudinary, MinIO ou S3 relèvent des sauvegardes de ce service.

La restauration est décrite dans [EXPLOITATION.md](EXPLOITATION.md#restaurer-une-sauvegarde).

## 9. Ajouter un projet (nouveau tenant)

Un tenant est un projet, servi à l'adresse `<slug>-board.neiba-technologies.com`. L'ajouter ne demande ni reconstruction ni modification du code. Exemple avec le projet `pfo` :

1. **DNS.** Créez l'enregistrement du sous-domaine vers le serveur Coolify :

   ```
   pfo-board.neiba-technologies.com.   A   <IP du serveur Coolify>
   ```

2. **Domaine dans Coolify.** Dans le service **app**, champ **Domains**, ajoutez le domaine à la suite des autres, séparé par une virgule :

   ```
   https://etourisme-board.neiba-technologies.com:3000,https://pfo-board.neiba-technologies.com:3000
   ```

   Enregistrez puis faites **Redeploy** : le proxy prend en compte le domaine et Coolify obtient le certificat HTTPS.

3. **Créer le projet.** Dans le **Terminal** du service **app** :

   ```bash
   node apps/server/dist/cli.js project:create pfo \
     --title "Cadrage PFO" \
     --subtitle "Description courte du projet" \
     --admin vous@neiba-technologies.com \
     --from etourisme
   ```

   `--from` (facultatif) reprend les réglages et référentiels d'un projet existant : versions, acteurs, document de référence, périmètres de risque, types d'organisations, étapes et types de tickets. Le contenu n'est pas copié. Sans `--from`, le projet part des réglages par défaut. Les réglages se reprennent aussi plus tard, dans **Administration** › **Membres et imports** › **Réglages d'un autre projet**.

   Le slug (`pfo`) doit être **exactement** le début du sous-domaine (`pfo-board…`) : 2 à 41 caractères, minuscules, chiffres et tirets. `--admin` désigne le premier administrateur du projet. Les adresses de `SUPERADMIN_EMAILS` sont de toute façon administratrices de tous les projets.

4. **Remplir et inviter.** Ouvrez `https://pfo-board.neiba-technologies.com` et connectez-vous par le lien reçu. Puis :
   - **Administration** › **Réglages du projet** : versions ou lots, acteurs, document de référence, périmètres de risque ;
   - construisez le cadrage dans l'outil (**Programme des ateliers** › **+ Atelier**, **Backlog** › **Nouvelle US** › **+ Nouvelle épique**, **Références** › **+ Référence**), ou importez-le dans **Administration** › **Membres et imports** : planning des ateliers (`.xlsx`), backlog des US (`.json` au format `{ epics, stories }`) ;
   - **Administration** › **Membres et imports** : invitez les participants, avec leur e-mail et leur rôle.

   Un assistant connecté au MCP avec un jeton administrateur peut tout faire sans accès au serveur, imports compris (voir [EXPLOITATION.md](EXPLOITATION.md#serveur-mcp)). Ces opérations existent aussi en ligne de commande : `import:planning`, `import:stories`, `import:raci`, `import:risks`, `member:add` (voir [EXPLOITATION.md](EXPLOITATION.md#ligne-de-commande)).

5. **Vérifier.** `node apps/server/dist/cli.js project:list` liste les projets avec leurs membres et leurs US. Si l'adresse affiche « Tableau introuvable », le slug ne correspond pas au sous-domaine, ou le domaine n'est pas encore pris en compte par Coolify.

## 10. Mises à jour

Poussez sur `main`, puis lancez **Redeploy** dans Coolify, ou activez le déploiement automatique par webhook. Les migrations s'appliquent au démarrage, et les volumes ne sont pas touchés. Pendant le redémarrage, les navigateurs ouverts se reconnectent seuls au flux temps réel et rechargent les données.
