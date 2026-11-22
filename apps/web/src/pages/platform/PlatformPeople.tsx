import { useEffect, useState } from 'react';
import { ROLE_LABEL, type PlatformAdmin, type PlatformUser, type Role } from '@board/shared';
import { platform } from '../../model/platform';
import { confirmDialog } from '../../ui/Confirm';
import page from '../Page.module.css';
import backlog from '../backlog/Backlog.module.css';
import { day, message } from './format';
import styles from './Platform.module.css';

/** Tous les comptes de la plateforme, avec leurs projets et leurs rôles. */
export function PlatformUsers() {
  const [users, setUsers] = useState<PlatformUser[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    platform.users().then(setUsers, e => setError(message(e)));
  }, []);
  const shown = (users ?? []).filter(u =>
    `${u.email} ${u.name} ${u.projects.map(p => p.title).join(' ')}`
      .toLowerCase()
      .includes(q.trim().toLowerCase()),
  );
  return (
    <section>
      <h2 className={page.h2}>Comptes{users ? ` (${users.length})` : ''}</h2>
      <p className={page.faint}>
        Un compte est une adresse e-mail ; il peut être membre de plusieurs projets, avec un rôle dans chacun.
        Les rôles se changent dans le projet (Projets, Gérer).
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
          placeholder="Rechercher un compte ou un projet"
          aria-label="Rechercher un compte"
          onChange={e => setQ(e.target.value)}
        />
      </div>
      <div className={backlog.tableWrap}>
        <table className={backlog.table} style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Compte</th>
              <th>Projets</th>
              <th style={{ width: 150 }}>Dernière connexion</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(u => (
              <tr key={u.userId}>
                <td>
                  <strong className={styles.name}>{u.name || u.email}</strong>
                  <span className={styles.sub}>
                    {u.name ? u.email : null}
                    {u.superadmin ? <span className={styles.flagInk}>Super-administrateur</span> : null}
                  </span>
                </td>
                <td>
                  <span className={styles.chips}>
                    {u.projects.length
                      ? u.projects.map(p => (
                          <span key={p.slug} className={styles.flag} title={p.slug}>
                            {p.title} · {ROLE_LABEL[p.role as Role] ?? p.role}
                          </span>
                        ))
                      : '—'}
                  </span>
                </td>
                <td>{u.lastLoginAt ? day(u.lastLoginAt) : 'Jamais'}</td>
              </tr>
            ))}
            {users && !shown.length ? (
              <tr>
                <td colSpan={3} className={backlog.empty}>
                  Aucun compte ne correspond.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Qui accède à la console : ceux de la configuration du serveur (verrouillés) et ceux désignés ici. */
export function PlatformAdmins({ me }: { me: string }) {
  const [admins, setAdmins] = useState<PlatformAdmin[] | null>(null);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    platform.admins().then(setAdmins, e => setNote(message(e)));
  }, []);
  const run = (action: () => Promise<PlatformAdmin[]>, done: string) =>
    action().then(
      list => {
        setAdmins(list);
        setNote(done);
      },
      e => setNote(message(e)),
    );
  return (
    <section>
      <h2 className={page.h2}>Super-administrateurs</h2>
      <p className={page.faint}>
        Un super-administrateur accède à cette console et administre tous les projets. Ceux de la variable
        SUPERADMIN_EMAILS viennent de la configuration du serveur : ils ne se retirent pas d’ici.
      </p>
      <ul className={styles.members}>
        {(admins ?? []).map(a => (
          <li key={a.email}>
            <span className={styles.memberText}>
              <strong>{a.email}</strong>
              <small>
                {a.locked
                  ? 'Configuration du serveur (SUPERADMIN_EMAILS)'
                  : `Désigné par ${a.addedBy || 'un super-administrateur'} le ${day(a.addedAt)}`}
              </small>
            </span>
            {a.locked ? (
              <span className={styles.flagInk}>Verrouillé</span>
            ) : (
              <button
                type="button"
                className={`${page.ghost} ${page.danger}`}
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: `Retirer ${a.email} des super-administrateurs ?`,
                    message:
                      a.email === me.toLowerCase()
                        ? 'C’est votre propre accès : vous serez déconnecté de la console tout de suite.'
                        : 'Cette personne perd l’accès à la console et à l’administration de tous les projets.',
                    confirmLabel: 'Retirer',
                    danger: true,
                  });
                  if (ok) void run(() => platform.removeAdmin(a.email), 'Super-administrateur retiré.');
                }}
              >
                Retirer
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className={styles.invite}
        onSubmit={async e => {
          e.preventDefault();
          const ok = await confirmDialog({
            title: `Désigner ${email} super-administrateur ?`,
            message:
              'Cette personne pourra ouvrir, administrer, exporter et supprimer tous les projets, et désigner d’autres super-administrateurs.',
            confirmLabel: 'Désigner',
            danger: true,
          });
          if (!ok) return;
          await run(() => platform.addAdmin(email), 'Super-administrateur désigné.');
          setEmail('');
        }}
      >
        <input
          type="email"
          required
          value={email}
          placeholder="Adresse e-mail"
          aria-label="Adresse e-mail du super-administrateur"
          onChange={e => setEmail(e.target.value)}
        />
        <button type="submit" className={page.primary}>
          Désigner
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
