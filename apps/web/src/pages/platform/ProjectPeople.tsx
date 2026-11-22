import { useEffect, useState } from 'react';
import {
  ROLE_LABEL,
  ROLES,
  type Member,
  type PlatformEvent,
  type PlatformProject,
  type PlatformProjectDetail,
  type Role,
} from '@board/shared';
import { platform } from '../../model/platform';
import { confirmDialog } from '../../ui/Confirm';
import page from '../Page.module.css';
import backlog from '../backlog/Backlog.module.css';
import { day, message } from './format';
import { dateTime, Facts } from './parts';
import styles from './Platform.module.css';

/** Membres du projet : rôle, nom, invitation, retrait. */
export function ProjectMembers({ project, onChanged }: { project: PlatformProject; onChanged: () => void }) {
  const { slug } = project;
  const [members, setMembers] = useState<Member[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState({ email: '', name: '', role: 'editor' as Role, notify: true });
  useEffect(() => {
    platform.members(slug).then(setMembers, e => setNote(message(e)));
  }, [slug]);
  const run = async (action: () => Promise<Member[]>, done = '') => {
    setBusy(true);
    setNote('');
    try {
      setMembers(await action());
      setNote(done);
      onChanged();
    } catch (e) {
      setNote(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h2 className={page.h2}>Membres{members ? ` (${members.length})` : ''}</h2>
      <p className={page.faint}>
        Le dernier administrateur d’un projet ne peut être ni retiré ni rétrogradé. Le nom se modifie en
        cliquant dessus ; il vaut pour tous les projets de la personne.
      </p>
      <div className={backlog.tableWrap}>
        <table className={backlog.table} style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>Membre</th>
              <th style={{ width: 170 }}>Rôle</th>
              <th style={{ width: 130 }}>Invité le</th>
              <th style={{ width: 150 }}>Dernière connexion</th>
              <th style={{ width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map(m => (
              <tr key={m.userId}>
                <td>
                  <input
                    key={m.name}
                    className={styles.inlineName}
                    defaultValue={m.name}
                    placeholder="Nom à afficher"
                    aria-label={`Nom de ${m.email}`}
                    maxLength={120}
                    onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                    onBlur={e => {
                      const name = e.target.value.trim();
                      if (!name || name === m.name) return void (e.target.value = m.name);
                      void run(() => platform.renameMember(slug, m.userId, name), 'Nom modifié.');
                    }}
                  />
                  <span className={styles.sub}>{m.email}</span>
                </td>
                <td>
                  <select
                    value={m.role}
                    aria-label={`Rôle de ${m.email}`}
                    disabled={busy}
                    onChange={async e => {
                      const role = e.target.value as Role;
                      const ok = await confirmDialog({
                        title: `Passer ${m.name || m.email} de ${ROLE_LABEL[m.role]} à ${ROLE_LABEL[role]} ?`,
                        confirmLabel: 'Changer le rôle',
                        danger: m.role === 'admin',
                      });
                      if (ok) void run(() => platform.setRole(slug, m.userId, role), 'Rôle modifié.');
                    }}
                  >
                    {ROLES.map(r => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{day(m.invitedAt ?? null)}</td>
                <td>{m.lastLoginAt ? day(m.lastLoginAt) : 'Jamais'}</td>
                <td className={styles.rowActions}>
                  <button
                    type="button"
                    className={`${page.ghost} ${page.danger}`}
                    disabled={busy}
                    onClick={async () => {
                      if (await confirmDialog(`Retirer ${m.email} de ${project.title} ?`))
                        void run(() => platform.removeMember(slug, m.userId), 'Membre retiré.');
                    }}
                  >
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className={styles.h3}>Ajouter un membre</h3>
      <form
        className={styles.invite}
        onSubmit={e => {
          e.preventDefault();
          void run(
            () => platform.addMember(slug, invite),
            invite.notify ? 'Membre ajouté, invitation envoyée.' : 'Membre ajouté, sans invitation.',
          ).then(() => setInvite(i => ({ ...i, email: '', name: '' })));
        }}
      >
        <input
          type="email"
          required
          value={invite.email}
          placeholder="Adresse e-mail"
          aria-label="Adresse e-mail"
          onChange={e => setInvite(i => ({ ...i, email: e.target.value }))}
        />
        <input
          value={invite.name}
          placeholder="Nom (facultatif)"
          aria-label="Nom"
          onChange={e => setInvite(i => ({ ...i, name: e.target.value }))}
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
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={invite.notify}
            onChange={e => setInvite(i => ({ ...i, notify: e.target.checked }))}
          />
          Envoyer l’invitation par e-mail
        </label>
        <button type="submit" className={page.primary} disabled={busy}>
          Ajouter
        </button>
      </form>
      {note ? (
        <p className={styles.note} role="status">
          {note}
        </p>
      ) : null}
    </section>
  );
}

/** Accès au projet : sessions ouvertes, jetons MCP, appareils abonnés. */
export function ProjectAccess({ d, onChanged }: { d: PlatformProjectDetail; onChanged: () => void }) {
  const { slug, title } = d.project;
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
          <h2 className={page.h2}>Sessions ouvertes ({d.sessions.length})</h2>
          <button
            type="button"
            className={page.outline}
            disabled={!d.sessions.length}
            onClick={async () => {
              const ok = await confirmDialog({
                title: `Déconnecter tout le monde de ${title} ?`,
                message: 'Chaque membre devra redemander un lien de connexion.',
                confirmLabel: 'Déconnecter',
                danger: true,
              });
              if (ok) void act(() => platform.revokeSessions(slug), 'Toutes les sessions sont fermées.');
            }}
          >
            Fermer toutes les sessions
          </button>
        </div>
        <p className={page.faint}>Une session par navigateur connecté. La fermer oblige à se reconnecter.</p>
        <div className={backlog.tableWrap}>
          <table className={backlog.table} style={{ minWidth: 620 }}>
            <thead>
              <tr>
                <th>Membre</th>
                <th style={{ width: 160 }}>Ouverte le</th>
                <th style={{ width: 160 }}>Vue pour la dernière fois</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {d.sessions.map(s => (
                <tr key={s.id}>
                  <td>
                    <strong className={styles.name}>{s.name || s.email}</strong>
                    {s.name ? <span className={styles.sub}>{s.email}</span> : null}
                  </td>
                  <td>{dateTime(s.createdAt)}</td>
                  <td>{dateTime(s.lastSeenAt)}</td>
                  <td className={styles.rowActions}>
                    <button
                      type="button"
                      className={`${page.ghost} ${page.danger}`}
                      onClick={() => void act(() => platform.closeSession(slug, s.id), 'Session fermée.')}
                    >
                      Fermer
                    </button>
                  </td>
                </tr>
              ))}
              {!d.sessions.length ? (
                <tr>
                  <td colSpan={4} className={backlog.empty}>
                    Personne n’est connecté.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className={page.h2}>Jetons MCP ({d.tokens.length})</h2>
        <p className={page.faint}>
          Accès des assistants au tableau, au nom d’un membre. Rôles autorisés :{' '}
          {d.settings.mcpRoles.map(r => ROLE_LABEL[r as Role] ?? r).join(', ') || 'aucun'} · suppressions{' '}
          {d.settings.mcpDeletions ? 'autorisées' : 'interdites'}.
        </p>
        <div className={backlog.tableWrap}>
          <table className={backlog.table} style={{ minWidth: 620 }}>
            <thead>
              <tr>
                <th>Jeton</th>
                <th style={{ width: 200 }}>Membre</th>
                <th style={{ width: 150 }}>Dernier usage</th>
                <th style={{ width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {d.tokens.map(t => (
                <tr key={t.id}>
                  <td>
                    <strong className={styles.name}>{t.name}</strong>
                    <span className={styles.sub}>
                      <span className={styles.mono}>{t.prefix}…</span> créé le {day(t.createdAt)}
                      {t.expiresAt ? ` · expire le ${day(t.expiresAt)}` : ''}
                    </span>
                  </td>
                  <td>{t.email}</td>
                  <td>{t.lastUsedAt ? dateTime(t.lastUsedAt) : 'Jamais'}</td>
                  <td className={styles.rowActions}>
                    <button
                      type="button"
                      className={`${page.ghost} ${page.danger}`}
                      onClick={async () => {
                        if (
                          await confirmDialog(
                            `Révoquer « ${t.name} » ? Les assistants qui l’utilisent perdront l’accès.`,
                          )
                        )
                          void act(() => platform.revokeToken(slug, t.id), 'Jeton révoqué.');
                      }}
                    >
                      Révoquer
                    </button>
                  </td>
                </tr>
              ))}
              {!d.tokens.length ? (
                <tr>
                  <td colSpan={4} className={backlog.empty}>
                    Aucun jeton MCP.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className={page.h2}>Notifications</h2>
        <Facts
          rows={[
            ['Appareils abonnés aux notifications système', d.notifications.devices],
            ['Abonnements à des éléments (« Suivi »)', d.notifications.followers],
            ['Notifications émises', `${d.notifications.total}, dont ${d.notifications.unread} non lue(s)`],
            ['En attente d’envoi par e-mail', d.notifications.unsent],
          ]}
        />
      </section>
      {note ? (
        <p className={styles.note} role="status">
          {note}
        </p>
      ) : null}
    </>
  );
}

const ACTION: Record<string, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  comment: 'Commentaire',
  resolve: 'Fil résolu',
  reopen: 'Fil rouvert',
  close: 'Clôture',
  start: 'Démarrage',
  carry: 'Report',
  settings: 'Réglages',
  move: 'Transfert',
  edit: 'Message modifié',
};

/** Journal du projet : ses 200 dernières modifications. */
export function ProjectJournal({ slug }: { slug: string }) {
  const [rows, setRows] = useState<PlatformEvent[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    platform.events(slug).then(setRows, e => setError(message(e)));
  }, [slug]);
  const shown = (rows ?? []).filter(r =>
    `${r.by} ${r.kind} ${r.entityId} ${r.action} ${ACTION[r.action] ?? ''}`
      .toLowerCase()
      .includes(q.trim().toLowerCase()),
  );
  return (
    <section>
      <h2 className={page.h2}>Journal du projet</h2>
      <p className={page.faint}>
        Les 200 dernières modifications, toutes origines confondues (interface, MCP, imports).
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.toolbar}>
        <input
          type="search"
          value={q}
          placeholder="Filtrer par personne, type ou identifiant"
          aria-label="Filtrer le journal"
          onChange={e => setQ(e.target.value)}
        />
      </div>
      <div className={backlog.tableWrap}>
        <table className={backlog.table} style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ width: 160 }}>Date</th>
              <th style={{ width: 200 }}>Par</th>
              <th style={{ width: 150 }}>Action</th>
              <th>Élément</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.at}-${i}`}>
                <td>{dateTime(r.at)}</td>
                <td>{r.by}</td>
                <td>{ACTION[r.action] ?? r.action}</td>
                <td>
                  <span className={styles.flag}>{r.kind}</span>{' '}
                  <span className={styles.mono}>{r.entityId}</span>
                </td>
              </tr>
            ))}
            {rows && !shown.length ? (
              <tr>
                <td colSpan={4} className={backlog.empty}>
                  {q ? 'Aucune modification ne correspond.' : 'Aucune modification enregistrée.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
