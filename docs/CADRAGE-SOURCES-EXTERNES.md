# Cadrage — Alimentation du board par des sources externes

Version du 18/11/2026 · Statut : proposition à valider

## 1. Contexte et objectif

Le board doit se nourrir des échanges du projet (Slack, enregistrements Plaud, comptes rendus Fireflies) au lieu d'une saisie manuelle. Nous proposons de transformer chaque échange en **propositions relues par un humain** avant toute écriture dans le board.

Aujourd'hui, une Référence décrit ce que dit le document de référence sur un sujet : sujet, contenu, où le lire, écarts à trancher, séquences d'atelier. Elle est importée du planning ou saisie à la main. Les décisions et précisions prises en réunion ou sur Slack n'y arrivent pas, ou arrivent tard et sans trace de leur origine.

**Objectif :** une information utile dite dans un échange arrive dans le board en moins d'un jour ouvré, avec un lien vers l'échange qui la justifie.

## 2. Périmètre

La première version alimente les Références. Les autres entités suivent une fois le circuit éprouvé.

| | Inclus | Exclu ou reporté |
| --- | --- | --- |
| Entités | Références (création, mise à jour, écarts à trancher) | Décisions, diligences, risques, points à trancher, US : étape 3 |
| Sources | Dépôt manuel, Fireflies, Slack, e-mail entrant (dont Plaud) | Teams, Google Meet, WhatsApp : à la demande |
| Écriture | Après validation humaine | Écriture automatique sans relecture |
| Projets | Tous les projets du board, eTourisme en pilote | Aucun code propre à un projet |

## 3. Principes directeurs

1. **Rien n'est écrit sans relecture.** Une phrase d'un échange peut être fausse, provisoire ou contredite le lendemain. L'IA propose, un éditeur du projet valide.
2. **Toute information garde sa source.** Chaque proposition, puis chaque fiche validée, porte la citation exacte, l'auteur, la date et le lien vers l'échange.
3. **Le document de référence et les échanges restent distingués.** Une Référence peut venir du document (« le CdC dit ») ou d'un échange (« décidé en réunion du 12/11 »). Ce n'est pas la même valeur.
4. **Générique.** Les connecteurs, le modèle et les consignes d'extraction ne contiennent rien de propre à un projet. Le vocabulaire vient des réglages du projet.
5. **Un seul chemin d'écriture.** Une proposition acceptée passe par l'API existante : mêmes contrôles, même historique, même temps réel que la saisie à l'écran ou le MCP.

## 4. Architecture cible

```
 Sources                  Ingestion              Extraction IA            Relecture              Board
┌───────────────┐      ┌──────────────┐      ┌──────────────────┐     ┌────────────────┐    ┌──────────────┐
│ Fireflies     │─────▶│              │      │ découpage        │     │ Boîte de       │    │ Références   │
│ Slack         │─────▶│  Élément     │─────▶│ repérage         │────▶│ réception      │───▶│ (+ sources)  │
│ E-mail (Plaud)│─────▶│  source      │      │ rapprochement    │     │ accepter       │    │ puis autres  │
│ Dépôt fichier │─────▶│  normalisé   │      │ propositions     │     │ corriger       │    │ entités      │
│ MCP           │─────▶│              │      │ + citations      │     │ rejeter        │    │              │
└───────────────┘      └──────────────┘      └──────────────────┘     └────────────────┘    └──────────────┘
                                                                         │ rejet
                                                                         ▼
                                                                    archivé, motif gardé
```

1. **Connecteurs.** Chaque outil a un petit connecteur qui dépose un « élément source » au format commun. Ajouter un outil ne touche pas au reste.
2. **Extraction par IA.** Elle transforme un élément en propositions typées, rattachées aux fiches existantes, chacune avec sa citation.
3. **Boîte de réception.** Un éditeur accepte, corrige ou rejette, une par une ou par lot.
4. **Écriture et traçabilité.** La proposition acceptée devient une création ou une modification de fiche, avec sa provenance.

## 5. Sources et connecteurs

| Source | Mode d'entrée | Déclencheur | Points à vérifier |
| --- | --- | --- | --- |
| Dépôt manuel | Fichier .txt, .vtt, .srt, .docx, PDF ou texte collé dans le board | L'utilisateur | Aucun ; sert aussi de solution de secours pour tout outil |
| Fireflies | Webhook « transcription prête », puis lecture par son API GraphQL | Automatique en fin de réunion | Clé API par compte ; choix des réunions rattachées au projet (titre, participants, calendrier) |
| Slack | Application Slack : action « Envoyer au board » sur un message ou un fil ; option de canaux suivis par projet | L'utilisateur, ou automatique sur les canaux suivis | Installation par espace Slack ; droits de lecture limités aux canaux déclarés |
| Plaud | Export envoyé à une adresse e-mail propre au projet, ou dépôt manuel | L'utilisateur | Pas d'API publique connue à ce jour : à vérifier auprès de Plaud |
| E-mail entrant | Adresse par projet (ex. `projet+board@…`) ; corps et pièces jointes | Envoi d'un e-mail | Fournisseur d'e-mail entrant à choisir ; filtrage des expéditeurs autorisés |
| MCP | Outil `deposer_source` du MCP du board | Un assistant (Claude) connecté à Slack, à un outil de réunion ou à un drive | Déjà possible en partie avec les outils actuels |

**Rattachement au projet :** un élément source appartient à un projet. Il est déposé depuis le projet, envoyé à l'adresse du projet, ou rattaché selon une règle déclarée dans les réglages : canal Slack, mot du titre de la réunion, participant.

## 6. Modèle de données

Trois ajouts, stockés comme les autres entités (lignes JSONB, historique, notifications temps réel).

**Élément source** (`source`) — un échange reçu.

| Champ | Contenu |
| --- | --- |
| `id` | SRC-12 |
| `origin` | `upload`, `fireflies`, `slack`, `email`, `mcp` |
| `title`, `url` | Intitulé et lien vers l'original (fil Slack, réunion Fireflies) |
| `occurredAt` | Date de l'échange |
| `authors`, `participants` | Noms tels que fournis par la source |
| `text` | Texte normalisé, découpé en passages numérotés |
| `file` | Pièce jointe éventuelle, dans le stockage de fichiers existant |
| `status` | `reçu`, `analysé`, `en erreur`, `écarté` |
| `visibility` | `interne` ou `projet` (voir § 9) |

**Proposition** (`proposal`) — ce que l'IA suggère d'écrire.

| Champ | Contenu |
| --- | --- |
| `id` | PRO-40 |
| `source` | Élément source d'origine |
| `kind` | `reference.create`, `reference.update`, `reference.gap`, puis d'autres types à l'étape 3 |
| `target` | Fiche visée pour une mise à jour (REF-12) |
| `patch` | Champs proposés, au format de l'API |
| `quote` | Citation exacte et numéros de passages |
| `confidence` | `haute`, `moyenne`, `basse`, avec une phrase de justification |
| `status` | `à relire`, `acceptée`, `corrigée`, `rejetée` |
| `decidedBy`, `decidedAt`, `reason` | Qui a tranché, quand, et le motif d'un rejet |

**Référence** — un champ ajouté, facultatif :

```ts
sources: { source: string; quote: string; at: string }[]
```

Les fiches existantes restent valides sans ce champ, comme pour les étiquettes et les dates de tickets.

## 7. Extraction par IA

L'extraction tourne côté serveur avec l'API Claude, en tâche de fond, à la réception d'un élément.

1. **Découpage.** Le texte est coupé en passages numérotés (tours de parole, messages Slack).
2. **Repérage.** L'IA garde les passages qui touchent au projet : exigences, précisions, contradictions avec le document, décisions.
3. **Rapprochement.** Pour chaque sujet, elle cherche la Référence existante la plus proche (sujet, contenu, séquences). Elle propose une mise à jour de cette fiche plutôt qu'un doublon.
4. **Propositions.** Elle produit des propositions au format de l'API, en sortie structurée validée par les mêmes schémas que l'API. Une sortie invalide est rejetée et rejouée une fois.
5. **Citations obligatoires.** Une proposition sans citation exacte, retrouvée mot pour mot dans le texte, est écartée.

**Consignes construites à partir du projet :** nom du document de référence, liste des Références (identifiant, sujet), ateliers et séquences, épiques. Rien n'est écrit en dur pour un projet.

**Coût et volume :** un compte rendu d'une heure fait environ 10 000 à 15 000 mots. On le traite en un ou deux appels. Le coût par réunion est à mesurer à l'étape 0, avant de choisir le modèle.

## 8. Boîte de réception

Un nouvel écran « À relire » dans le menu du projet, visible des éditeurs.

1. **Liste** des propositions à relire, groupées par élément source. Filtres : source, type, fiche visée, confiance.
2. **Détail** d'une proposition :
   - à gauche, la citation dans son contexte, avec le lien vers l'original ;
   - à droite, la fiche telle qu'elle serait après acceptation, avec les changements surlignés pour une mise à jour.
3. **Actions :** Accepter, Corriger puis accepter, Rejeter avec motif, Rattacher à une autre fiche. Toutes disponibles par lot.
4. **Compteur** dans le menu (« À relire · 7 ») et notification facultative à l'éditeur responsable.

Une fiche alimentée par un échange affiche ses sources sous son contenu, avec la date et la citation.

## 9. Sécurité, confidentialité et droits

- **Consentement.** Les enregistrements Plaud et Fireflies supposent l'accord des participants. Le board ne traite que ce qu'on lui envoie ou ce qu'on a déclaré.
- **Traitement par l'IA.** Les textes partent vers l'API Claude. Il faut un contrat de traitement des données et l'information du client.
- **Visibilité.** Un élément source interne et ses propositions ne sont pas visibles du client. Une fiche validée suit les droits habituels.
- **Périmètre Slack.** Lecture limitée aux canaux déclarés ou aux messages envoyés explicitement.
- **Secrets.** Jetons Slack et Fireflies et clé Claude stockés chiffrés par projet, avec le mécanisme de secrets existant. Jamais dans le code ni dans les journaux.
- **Conservation.** Texte brut gardé 90 jours par défaut, réglable par projet. Citations et provenance gardées tant que la fiche existe.
- **Webhooks.** Signature vérifiée (Slack, Fireflies) ; rejet de tout appel non signé.

## 10. Plan de livraison

| Étape | Contenu | Durée indicative | Condition de passage |
| --- | --- | --- | --- |
| 0. Valider l'intérêt, sans code | Claude, avec les connecteurs Slack et réunions et le MCP du board, lit 3 à 5 échanges réels d'eTourisme, propose des fiches, simule (`executer_lot simuler=true`), puis applique ce qui est validé | 3 à 5 jours | Au moins une proposition sur deux jugée utile ; coût par réunion mesuré |
| 1. Socle | Entités `source` et `proposal`, champ `sources` des Références, dépôt manuel, extraction Claude, boîte de réception | 1 à 2 semaines | Une transcription déposée produit des propositions relues et appliquées de bout en bout |
| 2. Connecteurs | Fireflies (webhook), application Slack, e-mail entrant (Plaud), outil MCP `deposer_source` | 1 à 2 semaines | Une réunion Fireflies arrive seule dans la boîte de réception |
| 3. Élargissement | Doublons et fusion, notifications, autres entités (décisions, diligences, risques, points à trancher, US) | Ensuite, selon l'usage | Choix des entités selon les propositions rejetées faute de type adapté |

## 11. Risques et parades

| Risque | Parade |
| --- | --- |
| Propositions fausses ou inventées | Relecture obligatoire ; citation exacte vérifiée mot pour mot ; confiance affichée |
| Boîte de réception qui déborde et n'est plus relue | Seuil de confiance réglable ; regroupement par source ; actions par lot ; mesure du temps de relecture |
| Doublons de fiches | Rapprochement avec les fiches existantes avant toute création ; action « Rattacher à une autre fiche » |
| Fuite d'informations internes vers le client | Visibilité `interne` par défaut sur les éléments et propositions |
| Dépendance à une API d'outil tiers (Plaud, Fireflies) | Dépôt manuel et e-mail entrant toujours disponibles |
| Coût de l'IA | Mesure à l'étape 0 ; plafond mensuel par projet |

## 12. Décisions à prendre

| Décision | Options | Recommandation |
| --- | --- | --- |
| Relecture | Systématique, ou automatique au-delà d'un seuil de confiance | Systématique au départ |
| Périmètre initial | Références seules, ou aussi décisions et diligences | Références seules, élargir à l'étape 3 |
| Clé Claude | Une par client, saisie dans les Réglages du projet et chiffrée | Tranché : une clé par projet |
| Ordre des sources | — | Dépôt manuel, puis Fireflies, puis Slack, puis Plaud |
| Conservation du texte brut | 30, 90 jours ou illimité | 90 jours, réglable par projet |

## 13. Critères de succès

- Délai entre l'échange et la fiche à jour : moins d'un jour ouvré.
- Part des propositions acceptées, telles quelles ou corrigées : au moins 60 %.
- Temps moyen de relecture d'une proposition : moins d'une minute.
- Fiches validées avec au moins une source citée : 100 % de celles qui viennent d'un échange.
- Aucun élément interne visible du client.
