import { useEffect, useState, type FormEvent } from 'react';
import { ROLE_LABEL, ROLES, type ImportReport, type Member, type Role } from '@board/shared';
import { api, ApiError } from '../model/api';
import { useIsAdmin, useWorkspace } from '../model/store';
import { Avatar } from '../ui/Presence';
import page from './Page.module.css';
import styles from './Admin.module.css';

const ERRORS: Record<string, string> = {
  last_admin: 'Le projet doit garder au moins un administrateur.',
  invalid: 'Saisie invalide.',
  xlsx_required: 'Choisissez un classeur Excel (.xlsx).',
  too_large: 'Fichier trop volumineux (15 Mo au plus).',
};
const message = (e: unknown) =>
  e instanceof ApiError ? (ERRORS[e.code] ?? e.message ?? 'Erreur') : 'Erreur réseau, réessayez.';
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Jamais';

/** Administration du projet : membres et invitations, informations, imports et export. */
export function Admin() {
  const admin = useIsAdmin();
  const session = useWorkspace(s => s.session);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState({ email: '', name: '', role: 'editor' as Role, notify: true });
  const [project, setProject] = useState({
    title: session?.project.title ?? '',
    subtitle: session?.project.subtitle ?? '',
  });
  const [report, setReport] = useState<{ kind: string; text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (admin) api.get<Member[]>('/admin/members').then(setMembers, e => setError(message(e)));
  }, [admin]);
  if (!admin) return <div className={page.page}>Réservé aux administrateurs du projet.</div>;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy('');
    }
  };
  const submitInvite = (e: FormEvent) => {
    e.preventDefault();
    void run('invite', async () => {
      setMembers(await api.post<Member[]>('/admin/members', invite));
      setInvite(i => ({ ...i, email: '', name: '' }));
    });
  };
  const upload = (kind: 'planning' | 'stories' | 'raci' | 'risks' | 'cadrage', file: File | undefined) => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    void run(kind, async () => {
      try {
        const r = await api.post<ImportReport>(`/admin/import/${kind}`, form);
        setReport({ kind, ok: true, text: r.details.join(' ') });
      } catch (e) {
        setReport({ kind, ok: false, text: message(e) });
      }
    });
  };

  return (
    <div className={page.page}>
      <span className={page.icon} aria-hidden="true">
        ⚙️
      </span>
      <h1 className={page.h1}>Administration</h1>
      <p className={page.lead}>
        Projet <code>{session?.project.slug}</code> : membres, informations, imports et export.
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <h2 className={page.h2}>Membres ({members.length})</h2>
      <p className={page.faint}>
        Administrateur : gère les membres et les imports. Éditeur : modifie les US et les ateliers. Lecteur :
        consulte.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Membre</th>
              <th>Rôle</th>
              <th>Dernière connexion</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.userId}>
                <td>
                  <span className={styles.member}>
                    <Avatar name={m.name || m.email} />
                    <span>
                      <strong>{m.name || m.email}</strong>
                      {m.name ? <small>{m.email}</small> : null}
                    </span>
                  </span>
                </td>
                <td>
                  <select
                    aria-label={`Rôle de ${m.email}`}
                    value={m.role}
                    onChange={e =>
                      void run('role', async () =>
                        setMembers(
                          await api.patch<Member[]>(`/admin/members/${m.userId}`, { role: e.target.value }),
                        ),
                      )
                    }
                  >
                    {ROLES.map(r => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{when(m.lastLoginAt)}</td>
                <td>
                  <button
                    type="button"
                    className={`${page.ghost} ${page.danger}`}
                    onClick={() =>
                      confirm(`Retirer ${m.email} du projet ?`) &&
                      void run('remove', async () =>
                        setMembers(await api.delete<Member[]>(`/admin/members/${m.userId}`)),
                      )
                    }
                  >
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className={styles.invite} onSubmit={submitInvite}>
        <input
          type="email"
          required
          placeholder="Adresse e-mail"
          aria-label="Adresse e-mail"
          value={invite.email}
          onChange={e => setInvite(i => ({ ...i, email: e.target.value }))}
        />
        <input
          placeholder="Nom (facultatif)"
          aria-label="Nom"
          value={invite.name}
          onChange={e => setInvite(i => ({ ...i, name: e.target.value }))}
        />
        <select
          aria-label="Rôle"
          value={invite.role}
          onChange={e => setInvite(i => ({ ...i, role: e.target.value as Role }))}
        >
          {ROLES.map(r => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={invite.notify}
            onChange={e => setInvite(i => ({ ...i, notify: e.target.checked }))}
          />
          Envoyer l’invitation par e-mail
        </label>
        <button type="submit" className={page.primary} disabled={busy === 'invite'}>
          {busy === 'invite' ? 'Invitation…' : 'Inviter'}
        </button>
      </form>

      <h2 className={page.h2}>Projet</h2>
      <form
        className={styles.projectForm}
        onSubmit={e => {
          e.preventDefault();
          void run('project', async () => {
            await api.patch('/admin/project', project);
            await useWorkspace.getState().init();
          });
        }}
      >
        <label>
          Nom du tableau
          <input
            value={project.title}
            required
            onChange={e => setProject(p => ({ ...p, title: e.target.value }))}
          />
        </label>
        <label>
          Sous-titre
          <input
            value={project.subtitle}
            onChange={e => setProject(p => ({ ...p, subtitle: e.target.value }))}
          />
        </label>
        <button type="submit" className={page.primary} disabled={busy === 'project'}>
          Enregistrer
        </button>
      </form>

      <h2 className={page.h2}>Imports</h2>
      <p className={page.faint}>
        Un nouvel import ne supprime rien de ce qui a été saisi : réponses, notes, commentaires et US
        modifiées sont conservées, de même que les phases, les risques et les diligences modifiés dans
        l’outil. Les fichiers importés sont archivés sur le serveur.
      </p>
      <div className={styles.imports}>
        <label className={styles.drop}>
          <strong>Planning des ateliers</strong>
          <span>Classeur Excel (.xlsx) : onglets Planning, Suivi des PV, Références CdC</span>
          <input type="file" accept=".xlsx" onChange={e => upload('planning', e.target.files?.[0])} />
          {session?.project.planning ? <small>Actuel : {session.project.planning}</small> : null}
        </label>
        <label className={styles.drop}>
          <strong>Backlog des user stories</strong>
          <span>Fichier JSON {'{ epics, stories }'}</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={e => upload('stories', e.target.files?.[0])}
          />
        </label>
        <label className={styles.drop}>
          <strong>Matrice RACI</strong>
          <span>Classeur .xlsx (onglet RACI, une section numérotée par phase) ou JSON {'{ phases }'}</span>
          <input
            type="file"
            accept=".xlsx,.json,application/json"
            onChange={e => upload('raci', e.target.files?.[0])}
          />
        </label>
        <label className={styles.drop}>
          <strong>Matrice des risques</strong>
          <span>
            Classeur .xlsx (onglets REGISTRE CONSOLIDE et PLAN ACTIONS) ou JSON {'{ risks }'}. Les revues
            importées sont rattachées à la phase en cours.
          </span>
          <input
            type="file"
            accept=".xlsx,.json,application/json"
            onChange={e => upload('risks', e.target.files?.[0])}
          />
        </label>
        <label className={styles.drop}>
          <strong>Compléments de cadrage</strong>
          <span>
            JSON {'{ parties, diligences, stories }'} : parties prenantes, diligences issues des ateliers ;
            description, plateformes et liaisons des US, posées seulement là où rien n’a encore été saisi.
          </span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={e => upload('cadrage', e.target.files?.[0])}
          />
        </label>
      </div>
      {busy ? <p className={page.faint}>Import en cours…</p> : null}
      {report ? (
        <p className={report.ok ? styles.success : styles.error} role="status">
          {report.text}
        </p>
      ) : null}

      <h2 className={page.h2}>Export</h2>
      <p>
        <a className={page.ghost} href="/api/admin/export">
          ↧ Télécharger tout le contenu du projet (JSON)
        </a>
      </p>
    </div>
  );
}
