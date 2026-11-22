import { useEffect, useState, type FormEvent } from 'react';
import { ROLE_LABEL, ROLES, SLUG_PATTERN, type Member, type PlatformProject, type Role } from '@board/shared';
import { platform, type ImportKind } from '../../model/platform';
import { confirmDialog } from '../../ui/Confirm';
import drawer from '../../ui/StoryDrawer.module.css';
import page from '../Page.module.css';
import { day, message } from './format';
import styles from './Platform.module.css';

const slugOf = (title: string) =>
  title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/** Création d'un projet : son nom, son adresse, son premier administrateur, et un modèle de réglages. */
export function NewProject({
  projects,
  onClose,
  onCreated,
}: {
  projects: PlatformProject[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [subtitle, setSubtitle] = useState('');
  const [admin, setAdmin] = useState('');
  const [from, setFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const address = touched ? slug : slugOf(title);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await platform.create({
        slug: address,
        title: title.trim(),
        subtitle: subtitle.trim(),
        admin,
        from: from || undefined,
      });
      onCreated();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.backdrop} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Nouveau projet"
        onSubmit={submit}
      >
        <h2 className={styles.dialogTitle}>Nouveau projet</h2>
        <label className={styles.field}>
          Nom du tableau
          <input value={title} required autoFocus maxLength={120} onChange={e => setTitle(e.target.value)} />
        </label>
        <label className={styles.field}>
          Adresse
          <input
            value={address}
            required
            pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
            className={styles.mono}
            onChange={e => {
              setTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
          <small>
            Le tableau sera servi sur le sous-domaine de cette adresse. Minuscules, chiffres et tirets, 3 à 40
            caractères.
          </small>
        </label>
        <label className={styles.field}>
          Sous-titre
          <input
            value={subtitle}
            maxLength={200}
            placeholder="Facultatif"
            onChange={e => setSubtitle(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Premier administrateur
          <input
            type="email"
            value={admin}
            required
            placeholder="prenom.nom@exemple.com"
            onChange={e => setAdmin(e.target.value)}
          />
          <small>
            Il se connecte par lien e-mail à l’adresse du tableau ; aucune invitation n’est envoyée d’ici.
          </small>
        </label>
        <label className={styles.field}>
          Reprendre les réglages de
          <select value={from} onChange={e => setFrom(e.target.value)}>
            <option value="">Aucun projet (réglages par défaut)</option>
            {projects.map(p => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
          </select>
          <small>Étapes, types de tickets, versions, acteurs… Le contenu n’est pas copié.</small>
        </label>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <p className={styles.dialogActions}>
          <button type="button" className={page.outline} onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className={page.primary} disabled={busy || !SLUG_PATTERN.test(address)}>
            {busy ? 'Création…' : 'Créer le projet'}
          </button>
        </p>
      </form>
    </div>
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

type Tab = 'members' | 'data' | 'advanced';

/** Gestion d'un projet depuis la console, sans l'ouvrir : membres, données, opérations de bas niveau. */
export function ProjectDrawer({
  project,
  onClose,
  onChanged,
}: {
  project: PlatformProject;
  onClose: () => void;
  /** Le projet a changé (ou disparu : null) ; la liste est à relire. */
  onChanged: (slug: string | null) => void;
}) {
  const { slug } = project;
  const [tab, setTab] = useState<Tab>('members');
  const [members, setMembers] = useState<Member[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState({ email: '', role: 'admin' as Role });
  const [nextSlug, setNextSlug] = useState(slug);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    setMembers(null);
    setNextSlug(slug);
    setTyped('');
    setNote('');
    platform.members(slug).then(setMembers, e => setNote(message(e)));
  }, [slug]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const run = async (action: () => Promise<string | void>) => {
    setBusy(true);
    setNote('');
    try {
      setNote((await action()) ?? '');
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
    if (!ok) return;
    await run(async () => {
      const report = await platform.import(slug, kind, file);
      onChanged(slug);
      return report.details.join(' ') || 'Import terminé.';
    });
  };

  return (
    <>
      <button type="button" className={drawer.scrim} aria-label="Fermer" onClick={onClose} />
      <div
        className={`${drawer.drawer} ${styles.drawer}`}
        role="dialog"
        aria-modal="true"
        aria-label={project.title}
      >
        <header className={drawer.head}>
          <span className={styles.drawerTitle}>
            <strong>{project.title}</strong>
            <small>
              {slug} · créé le {day(project.createdAt)}
            </small>
          </span>
          <button type="button" className={drawer.icon} onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        <div className={styles.tabs} role="tablist">
          {(
            [
              ['members', 'Membres'],
              ['data', 'Données'],
              ['advanced', 'Avancé'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className={drawer.body}>
          {tab === 'members' ? (
            <>
              {members ? (
                <ul className={styles.members}>
                  {members.map(m => (
                    <li key={m.userId}>
                      <span className={styles.memberText}>
                        <strong>{m.name || m.email}</strong>
                        <small>
                          {m.email} · dernière connexion : {day(m.lastLoginAt)}
                        </small>
                      </span>
                      <select
                        value={m.role}
                        aria-label={`Rôle de ${m.email}`}
                        disabled={busy}
                        onChange={e => {
                          const role = e.target.value as Role;
                          void run(async () => setMembers(await platform.setRole(slug, m.userId, role)));
                        }}
                      >
                        {ROLES.map(r => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={`${page.ghost} ${page.danger}`}
                        disabled={busy}
                        onClick={async () => {
                          if (await confirmDialog(`Retirer ${m.email} de ${project.title} ?`))
                            void run(async () => {
                              setMembers(await platform.removeMember(slug, m.userId));
                              onChanged(slug);
                            });
                        }}
                      >
                        Retirer
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={page.faint}>Chargement…</p>
              )}
              <form
                className={styles.invite}
                onSubmit={e => {
                  e.preventDefault();
                  void run(async () => {
                    setMembers(await platform.addMember(slug, { ...invite, name: '', notify: false }));
                    setInvite(i => ({ ...i, email: '' }));
                    onChanged(slug);
                    return 'Membre ajouté. Il se connecte par lien e-mail à l’adresse du tableau.';
                  });
                }}
              >
                <input
                  type="email"
                  required
                  value={invite.email}
                  placeholder="Adresse e-mail"
                  aria-label="Adresse e-mail du membre"
                  onChange={e => setInvite(i => ({ ...i, email: e.target.value }))}
                />
                <select
                  value={invite.role}
                  aria-label="Rôle"
                  onChange={e => setInvite(i => ({ ...i, role: e.target.value as Role }))}
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <button type="submit" className={page.primary} disabled={busy}>
                  Ajouter
                </button>
              </form>
              <p className={page.faint}>
                Le dernier administrateur d’un projet ne peut être ni retiré ni rétrogradé.
              </p>
            </>
          ) : null}

          {tab === 'data' ? (
            <>
              <h3 className={styles.h3}>Export</h3>
              <p className={page.faint}>
                Tout le contenu du projet et ses réglages, dans un fichier JSON : sauvegarde, ou copie vers un
                autre projet.
              </p>
              <p>
                <a className={page.outline} href={platform.exportUrl(slug)}>
                  ↧ Télécharger l’export complet
                </a>
              </p>
              <h3 className={styles.h3}>Imports</h3>
              <p className={page.faint}>
                Un import ne supprime rien de ce qui a été saisi dans l’outil. La restauration d’un export,
                elle, n’est acceptée que dans un projet qui n’a pas encore d’US.
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
            </>
          ) : null}

          {tab === 'advanced' ? (
            <>
              <h3 className={styles.h3}>Adresse du projet</h3>
              <p className={page.faint}>
                Changer l’adresse change le sous-domaine du tableau : l’ancienne adresse cesse de répondre,
                tout le monde est déconnecté et doit réactiver ses notifications. Pensez au DNS et au domaine
                dans Coolify.
              </p>
              <p className={styles.inline}>
                <input
                  value={nextSlug}
                  className={styles.mono}
                  aria-label="Nouvelle adresse"
                  onChange={e => setNextSlug(e.target.value.toLowerCase())}
                />
                <button
                  type="button"
                  className={page.outline}
                  disabled={busy || nextSlug === slug || !SLUG_PATTERN.test(nextSlug)}
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: `Changer l’adresse de ${project.title} ?`,
                      message: `« ${slug} » devient « ${nextSlug} ». L’ancienne adresse cesse de répondre et tous les membres sont déconnectés.`,
                      confirmLabel: 'Changer l’adresse',
                      danger: true,
                    });
                    if (ok)
                      void run(async () => {
                        const r = await platform.rename(slug, nextSlug);
                        onChanged(r.slug);
                        return `Adresse changée : ${r.url}`;
                      });
                  }}
                >
                  Changer l’adresse
                </button>
              </p>
              <h3 className={styles.h3}>Sessions</h3>
              <p className={page.faint}>
                Déconnecte tous les membres du tableau, par exemple après un départ ou un doute sur un accès.
                Les jetons MCP, eux, se révoquent dans le projet.
              </p>
              <p>
                <button
                  type="button"
                  className={page.outline}
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirmDialog({
                        title: `Déconnecter tout le monde de ${project.title} ?`,
                        message: 'Chaque membre devra redemander un lien de connexion.',
                        confirmLabel: 'Déconnecter',
                        danger: true,
                      })
                    )
                      void run(
                        async () => `${(await platform.revokeSessions(slug)).closed} session(s) fermée(s).`,
                      );
                  }}
                >
                  Fermer toutes les sessions
                </button>
              </p>
              <h3 className={`${styles.h3} ${styles.dangerTitle}`}>Supprimer le projet</h3>
              <p className={page.faint}>
                Suppression définitive : {project.stories} US, {project.tickets} tickets, {project.files}{' '}
                fichier(s), les membres, les réglages et l’historique. Rien n’est récupérable ; téléchargez
                d’abord l’export (onglet Données).
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
                        onChanged(null);
                      });
                  }}
                >
                  Supprimer le projet
                </button>
              </p>
            </>
          ) : null}
          {note ? (
            <p className={styles.note} role="status">
              {note}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
