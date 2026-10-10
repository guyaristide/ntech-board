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
| `PROJECT_HOSTS` | `{slug}-board.neiba-technologies.com` (valeur par défaut) | non |
| `DEFAULT_PROJECT` | Vide. À renseigner uniquement pour une instance dédiée à un seul projet | non |
| `SESSION_DAYS` | `30` | non |
| `LOGIN_TOKEN_MINUTES` | `20` | non |
| `COOKIE_SECURE` | `auto` : cookies `Secure` en HTTPS, d'après `X-Forwarded-Proto` | non |

Marquez `POSTGRES_PASSWORD` et `SMTP_PASSWORD` comme secrets dans Coolify (option **Is Secret** ou **Locked**, selon la version).

Côté Brevo, l'adresse d'expédition `contact@neiba-technologies.com` doit être validée, et le domaine authentifié (SPF, DKIM). Sans cela, les liens de connexion risquent d'arriver en indésirables.

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
  --admin tech@mstudio.vc

# Contenu de départ, livré dans l'image (dossier seeds/)
node apps/server/dist/cli.js import:stories  etourisme seeds/etourisme/stories.json
node apps/server/dist/cli.js import:planning etourisme seeds/etourisme/workshops.json
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

La commande fait la même chose que `deploy/backup.sh` : un fichier par nuit, 14 jours de conservation, dans le volume `board-backups`. Copiez régulièrement ce volume hors du serveur, vers un stockage S3, un autre serveur ou un NAS. Une sauvegarde qui reste sur la même machine ne protège pas contre la perte du serveur. Le volume `board-storage` contient les fichiers importés : sauvegardez-le aussi.

La restauration est décrite dans [EXPLOITATION.md](EXPLOITATION.md#restaurer-une-sauvegarde).

## 9. Ajouter un projet

Il n'y a rien à reconstruire :

1. **DNS :** ajoutez `nouveau-board.neiba-technologies.com`, enregistrement A vers le serveur.
2. **Coolify :** dans le service **app**, champ **Domains**, ajoutez `https://nouveau-board.neiba-technologies.com:3000`, puis **Redeploy** pour que le proxy prenne le domaine.
3. **Terminal :** lancez `node apps/server/dist/cli.js project:create nouveau --title "…" --admin …`.
4. **Contenu :** importez le backlog et le planning, depuis l'écran **Administration** du nouveau tableau ou en ligne de commande.

## 10. Mises à jour

Poussez sur `main`, puis lancez **Redeploy** dans Coolify, ou activez le déploiement automatique par webhook. Les migrations s'appliquent au démarrage, et les volumes ne sont pas touchés. Pendant le redémarrage, les navigateurs ouverts se reconnectent seuls au flux temps réel et rechargent les données.
