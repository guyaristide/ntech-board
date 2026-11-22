import { useState } from 'react';
import {
  fileSize,
  ROLE_LABEL,
  SLUG_PATTERN,
  type PlatformProject,
  type PlatformProjectDetail,
  type Role,
} from '@board/shared';
import { platform, type ImportKind } from '../../model/platform';
import { confirmDialog } from '../../ui/Confirm';
import page from '../Page.module.css';
import { day, message } from './format';
import { slugOf } from './NewProject';
import { Facts, State } from './parts';
import styles from './Platform.module.css';

const ESTIMATION: Record<string, string> = {
  points: 'Points',
  days: 'Jours',
  hours: 'Heures',
  none: 'Aucune',
};

/** Réglages du projet, lus d'un coup d'œil ; ce qui se change d'ici, et le reste dans le projet. */
export function ProjectSettingsView({
  d,
  projects,
  onChanged,
}: {
  d: PlatformProjectDetail;
  projects: PlatformProject[];
  onChanged: () => void;
}) {
  const { slug, title } = d.project;
  const s = d.settings;
  const [from, setFrom] = useState('');
  const [note, setNote] = useState('');
  const act = (action: () => Promise<unknown>, done: string) =>
    action().then(
      () => {
        setNote(done);
        onChanged();
      },
      e => setNote(message(e)),
    );
  return (
    <>
      <section>
        <div className={styles.sectionHead}>
          <h2 className={page.h2}>Partie Réalisation</h2>
          <State ok={s.delivery}>{s.delivery ? 'Activée' : 'Désactivée'}</State>
        </div>
        <Facts
          rows={[
            ['Clé des tickets', s.ticketKey || '(par défaut, d’après le nom)'],
            ['Estimation', ESTIMATION[s.estimation] ?? s.estimation],
            ['Durée des sprints', `${s.sprintWeeks} semaine(s)`],
            ['Étapes', s.workflow.join(' → ')],
            ['Types de tickets', s.ticketTypes.join(', ')],
          ]}
        />
        <p>
          <button
            type="button"
            className={page.outline}
            onClick={async () => {
              const ok = await confirmDialog({
                title: `${s.delivery ? 'Désactiver' : 'Activer'} la Réalisation de ${title} ?`,
                message: s.delivery
                  ? 'Sprints, tickets et recette ne seront plus visibles ; rien n’est supprimé.'
                  : 'Sprints, tickets et recette deviennent visibles des membres autorisés.',
                confirmLabel: s.delivery ? 'Désactiver' : 'Activer',
                danger: s.delivery,
              });
              if (ok)
                void act(
                  () => platform.setDelivery(slug, !s.delivery),
                  `Réalisation ${s.delivery ? 'désactivée' : 'activée'}.`,
                );
            }}
          >
            {s.delivery ? 'Désactiver la Réalisation' : 'Activer la Réalisation'}
          </button>
        </p>
      </section>
      <section>
        <h2 className={page.h2}>Cadrage</h2>
        <Facts
          rows={[
            ['Document de référence', s.referenceDocument],
            ['Versions ou lots', s.versions.join(', ')],
            ['Acteurs des US', s.actors.join(', ')],
            ['Périmètres de risque', s.riskScopes.join(', ')],
          ]}
        />
      </section>
      <section>
        <h2 className={page.h2}>Fichiers et intégrations</h2>
        <Facts
          rows={[
            ['Stockage des nouveaux fichiers', s.fileStore],
            ['Taille maximale', `${s.fileMaxMb} Mo`],
            ['Types acceptés', s.fileCategories.join(', ')],
            [
              'Occupation',
              d.storage.length
                ? d.storage.map(x => `${x.store} : ${x.files} fichier(s), ${fileSize(x.bytes)}`).join(' · ')
                : 'Aucun fichier',
            ],
            [
              'Stockages externes',
              d.backends.length ? d.backends.map(b => `${b.name} (${b.provider})`).join(', ') : 'Aucun',
            ],
            [
              'Clé Claude',
              d.aiKey.configured
                ? `Enregistrée (…${d.aiKey.hint})${d.aiKey.updatedBy ? `, par ${d.aiKey.updatedBy}` : ''}${d.aiKey.updatedAt ? ` le ${day(d.aiKey.updatedAt)}` : ''}`
                : 'Aucune : les échanges ne sont pas analysés',
            ],
            [
              'Accès MCP',
              `${s.mcpRoles.map(r => ROLE_LABEL[r as Role] ?? r).join(', ') || 'aucun rôle'} · suppressions ${s.mcpDeletions ? 'autorisées' : 'interdites'}`,
            ],
          ]}
        />
        <p className={page.faint}>
          Les clés (stockages, Claude) et le détail des réglages se modifient dans le projet : « Ouvrir le
          tableau », puis Réglages du projet.
        </p>
      </section>
      <section>
        <h2 className={page.h2}>Reprendre les réglages d’un autre projet</h2>
        <p className={page.faint}>
          Remplace les versions, acteurs, périmètres de risque, types d’organisations, étapes et types de
          tickets par ceux du projet choisi. Le contenu, la clé des tickets et les accès nominatifs ne
          changent pas.
        </p>
        <p className={styles.inline}>
          <select value={from} aria-label="Projet modèle" onChange={e => setFrom(e.target.value)}>
            <option value="">Choisir un projet…</option>
            {projects
              .filter(p => p.slug !== slug)
              .map(p => (
                <option key={p.slug} value={p.slug}>
                  {p.title}
                </option>
              ))}
          </select>
          <button
            type="button"
            className={page.outline}
            disabled={!from}
            onClick={async () => {
              const source = projects.find(p => p.slug === from);
              const ok = await confirmDialog({
                title: `Remplacer les réglages de ${title} par ceux de ${source?.title} ?`,
                confirmLabel: 'Remplacer',
                danger: true,
              });
              if (ok)
                void act(() => platform.copySettings(slug, from), `Réglages repris de ${source?.title}.`);
            }}
          >
            Reprendre ses réglages
          </button>
        </p>
      </section>
      {note ? (
        <p className={styles.note} role="status">
          {note}
        </p>
      ) : null}
    </>
  );
}

const IMPORTS: { kind: ImportKind; label: string; hint: string; accept: string }[] = [
  { kind: 'planning', label: 'Planning des ateliers', hint: 'Classeur .xlsx ou JSON', accept: '.xlsx,.json' },
  { kind: 'stories', label: 'Backlog des user stories', hint: 'JSON { epics, stories }', accept: '.json' },
  { kind: 'raci', label: 'Matrice RACI', hint: 'Classeur .xlsx ou JSON', accept: '.xlsx,.json' },
  { kind: 'risks', label: 'Matrice des risques', hint: 'Classeur .xlsx ou JSON', accept: '.xlsx,.json' },
  {
    kind: 'cadrage',
    label: 'Compléments de cadrage',
    hint: 'JSON { parties, diligences, stories }',
    accept: '.json',
  },
  {
    kind: 'snapshot',
    label: 'Restaurer un export complet',
    hint: 'JSON d’un export ; seulement dans un projet sans US',
    accept: '.json',
  },
];

/** Données du projet : export complet, imports, restauration, duplication. */
export function ProjectData({ project, onChanged }: { project: PlatformProject; onChanged: () => void }) {
  const { slug } = project;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState({
    title: `${project.title} (copie)`,
    slug: '',
    admin: project.admins[0] ?? '',
    content: true,
  });
  const copySlug = copy.slug || slugOf(copy.title);
  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setNote('');
    try {
      setNote(await action());
      onChanged();
    } catch (e) {
      setNote(message(e));
    } finally {
      setBusy(false);
    }
  };
  const runImport = async (kind: ImportKind, input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    const label = IMPORTS.find(i => i.kind === kind)!.label;
    const ok = await confirmDialog({
      title: `${kind === 'snapshot' ? 'Restaurer cet export dans' : `Importer « ${label} » dans`} ${project.title} ?`,
      message: `Fichier : ${file.name}`,
      confirmLabel: kind === 'snapshot' ? 'Restaurer' : 'Importer',
    });
    input.value = '';
    if (ok)
      await run(async () => (await platform.import(slug, kind, file)).details.join(' ') || 'Import terminé.');
  };
  return (
    <>
      <section>
        <h2 className={page.h2}>Export</h2>
        <p className={page.faint}>
          Tout le contenu du projet et ses réglages dans un fichier JSON : sauvegarde avant une opération
          risquée, ou copie vers une autre instance. Les fichiers joints eux-mêmes et l’historique des
          modifications n’y figurent pas.
        </p>
        <p>
          <a className={page.outline} href={platform.exportUrl(slug)}>
            ↧ Télécharger l’export complet
          </a>
        </p>
      </section>
      <section>
        <h2 className={page.h2}>Imports</h2>
        <p className={page.faint}>
          Un import ne supprime rien de ce qui a été saisi dans l’outil. La restauration d’un export, elle,
          n’est acceptée que dans un projet qui n’a pas encore d’US.
        </p>
        <ul className={styles.imports}>
          {IMPORTS.map(i => (
            <li key={i.kind}>
              <label>
                <span>
                  <strong>{i.label}</strong>
                  <small>{i.hint}</small>
                </span>
                <input
                  type="file"
                  accept={i.accept}
                  disabled={busy}
                  onChange={e => void runImport(i.kind, e.currentTarget)}
                />
              </label>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className={page.h2}>Dupliquer le projet</h2>
        <p className={page.faint}>
          Crée un nouveau projet avec les mêmes réglages et, si vous le voulez, tout le contenu (US, ateliers,
          risques, tickets…) : pour un modèle, un bac à sable ou une reprise. Les membres, les fichiers
          joints, les discussions et l’historique ne sont pas copiés.
        </p>
        <form
          className={styles.form}
          onSubmit={async e => {
            e.preventDefault();
            const ok = await confirmDialog({
              title: `Dupliquer ${project.title} ?`,
              message: `Nouveau projet « ${copy.title} » à l’adresse « ${copySlug} », ${copy.content ? 'avec son contenu' : 'réglages seulement'}.`,
              confirmLabel: 'Dupliquer',
            });
            if (ok)
              await run(async () => {
                const r = await platform.duplicate(slug, { ...copy, slug: copySlug });
                window.dispatchEvent(new Event('platform:projects'));
                return `Projet créé : ${r.url} (${r.copied})`;
              });
          }}
        >
          <label className={styles.field}>
            Nom du nouveau tableau
            <input
              value={copy.title}
              required
              maxLength={120}
              onChange={e => setCopy(c => ({ ...c, title: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            Adresse
            <input
              value={copySlug}
              required
              className={styles.mono}
              onChange={e => setCopy(c => ({ ...c, slug: e.target.value.toLowerCase() }))}
            />
          </label>
          <label className={styles.field}>
            Administrateur
            <input
              type="email"
              value={copy.admin}
              required
              onChange={e => setCopy(c => ({ ...c, admin: e.target.value }))}
            />
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={copy.content}
              onChange={e => setCopy(c => ({ ...c, content: e.target.checked }))}
            />
            Copier aussi le contenu
          </label>
          <p>
            <button type="submit" className={page.primary} disabled={busy || !SLUG_PATTERN.test(copySlug)}>
              {busy ? 'Duplication…' : 'Dupliquer'}
            </button>
          </p>
        </form>
      </section>
      {note ? (
        <p className={styles.note} role="status">
          {note}
        </p>
      ) : null}
    </>
  );
}

/** Opérations de bas niveau : changer l'adresse du projet, le supprimer. */
export function ProjectAdvanced({
  project,
  onRenamed,
  onDeleted,
}: {
  project: PlatformProject;
  onRenamed: (slug: string) => void;
  onDeleted: () => void;
}) {
  const { slug } = project;
  const [next, setNext] = useState(slug);
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setNote('');
    try {
      await action();
    } catch (e) {
      setNote(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section>
        <h2 className={page.h2}>Adresse du projet</h2>
        <p className={page.faint}>
          Changer l’adresse change le sous-domaine du tableau : l’ancienne adresse cesse de répondre, tout le
          monde est déconnecté et doit réactiver ses notifications système. Ajoutez d’abord le nouveau domaine
          dans le DNS et dans Coolify.
        </p>
        <p className={styles.inline}>
          <input
            value={next}
            className={styles.mono}
            aria-label="Nouvelle adresse"
            onChange={e => setNext(e.target.value.toLowerCase())}
          />
          <button
            type="button"
            className={page.outline}
            disabled={busy || next === slug || !SLUG_PATTERN.test(next)}
            onClick={async () => {
              const ok = await confirmDialog({
                title: `Changer l’adresse de ${project.title} ?`,
                message: `« ${slug} » devient « ${next} ». L’ancienne adresse cesse de répondre et tous les membres sont déconnectés.`,
                confirmLabel: 'Changer l’adresse',
                danger: true,
              });
              if (ok) void run(async () => onRenamed((await platform.rename(slug, next)).slug));
            }}
          >
            Changer l’adresse
          </button>
        </p>
      </section>
      <section>
        <h2 className={`${page.h2} ${styles.dangerTitle}`}>Supprimer le projet</h2>
        <p className={page.faint}>
          Suppression définitive : {project.stories} US, {project.tickets} tickets, {project.files}{' '}
          fichier(s), les membres, les réglages et l’historique. Rien n’est récupérable ; téléchargez d’abord
          l’export (rubrique Données).
        </p>
        <p className={styles.inline}>
          <input
            value={typed}
            className={styles.mono}
            placeholder={`Saisissez « ${slug} » pour confirmer`}
            aria-label="Adresse du projet, pour confirmer la suppression"
            onChange={e => setTyped(e.target.value)}
          />
          <button
            type="button"
            className={styles.dangerButton}
            disabled={busy || typed !== slug}
            onClick={async () => {
              const ok = await confirmDialog({
                title: `Supprimer définitivement ${project.title} ?`,
                message: 'Tout son contenu disparaît, sans retour possible.',
                confirmLabel: 'Supprimer',
                danger: true,
              });
              if (ok)
                void run(async () => {
                  await platform.remove(slug, typed);
                  onDeleted();
                });
            }}
          >
            Supprimer le projet
          </button>
        </p>
      </section>
      {note ? (
        <p className={styles.error} role="alert">
          {note}
        </p>
      ) : null}
    </>
  );
}
