import { useCallback, useEffect, useState } from 'react';
import { fileSize, type PlatformAudit, type PlatformStatus } from '@board/shared';
import { platform } from '../../model/platform';
import page from '../Page.module.css';
import backlog from '../backlog/Backlog.module.css';
import { message } from './format';
import { dateTime, duration, Facts, Stat, State } from './parts';
import styles from './Platform.module.css';

/** État technique de la plateforme : services, exécution, base de données, activité, files, configuration. */
export function PlatformStatusView() {
  const [s, setS] = useState<PlatformStatus | null>(null);
  const [error, setError] = useState('');
  const [mail, setMail] = useState('');
  const [busy, setBusy] = useState('');
  const reload = useCallback(
    () =>
      platform.status().then(
        d => {
          setS(d);
          setError('');
        },
        e => setError(message(e)),
      ),
    [],
  );
  useEffect(() => void reload(), [reload]);
  const check = async (kind: 'verify' | 'test') => {
    setBusy(kind);
    setMail('');
    try {
      const r = kind === 'verify' ? await platform.verifyMail() : await platform.testMail();
      setMail(`${r.ok ? '✓' : '✗'} ${r.message}`);
    } catch (e) {
      setMail(message(e));
    } finally {
      setBusy('');
    }
  };
  if (!s) return <p className={page.faint}>{error || 'Chargement…'}</p>;
  const { services: v, runtime: r, database: db, activity: a, queues: q } = s;
  return (
    <>
      <section>
        <div className={styles.sectionHead}>
          <h2 className={page.h2}>État de la plateforme</h2>
          <button type="button" className={page.outline} onClick={() => void reload()}>
            Actualiser
          </button>
        </div>
        <p className={page.faint}>Relevé du {dateTime(r.now)}.</p>
        <div className={styles.kpis}>
          <Stat label="En ligne" value={a.onlineUsers} hint={`${a.onlineTabs} onglet(s) ouvert(s)`} />
          <Stat label="Modifications 24 h" value={a.events24h} hint={`${a.events7d} sur 7 jours`} />
          <Stat label="Actifs sur 7 j" value={a.activeUsers7d} hint={`${a.logins7d} connexion(s)`} />
          <Stat label="Sessions" value={a.sessionsProjects} hint={`${a.sessionsConsole} sur la console`} />
          <Stat label="Base" value={fileSize(db.bytes)} hint={`PostgreSQL ${db.version}`} />
        </div>
      </section>

      <section>
        <h2 className={page.h2}>Services</h2>
        <div className={styles.cards}>
          <article className={styles.card}>
            <header>
              <strong>E-mails (SMTP)</strong>
              <State ok={v.mail.configured}>{v.mail.configured ? 'En service' : 'À configurer'}</State>
            </header>
            <Facts
              rows={[
                [
                  'Relais',
                  v.mail.configured ? `${v.mail.host}:${v.mail.port}${v.mail.secure ? ' (TLS)' : ''}` : '',
                ],
                ['Compte', v.mail.user],
                ['Expéditeur', v.mail.from],
                ['En attente d’envoi', `${q.mailPending} notification(s)`],
              ]}
            />
            <p className={styles.cardActions}>
              <button
                type="button"
                className={page.outline}
                disabled={!!busy}
                onClick={() => void check('verify')}
              >
                {busy === 'verify' ? 'Test…' : 'Tester la connexion'}
              </button>
              <button
                type="button"
                className={page.outline}
                disabled={!!busy}
                onClick={() => void check('test')}
              >
                {busy === 'test' ? 'Envoi…' : 'M’envoyer un e-mail d’essai'}
              </button>
            </p>
            {mail ? (
              <p className={styles.note} role="status">
                {mail}
              </p>
            ) : null}
          </article>
          <article className={styles.card}>
            <header>
              <strong>Notifications système</strong>
              <State ok={v.push.enabled}>{v.push.enabled ? 'En service' : 'À configurer'}</State>
            </header>
            <Facts
              rows={[
                ['Clé publique', v.push.publicKey],
                ['Contact', v.push.subject],
                ['Appareils abonnés', v.push.devices],
                ['Notifications non lues', q.notificationsUnread],
              ]}
            />
          </article>
          <article className={styles.card}>
            <header>
              <strong>Chiffrement et Claude</strong>
              <State ok={v.secrets}>{v.secrets ? 'Clé présente' : 'SECRETS_KEY absente'}</State>
            </header>
            <Facts
              rows={[
                ['Secrets enregistrables', v.secrets ? 'Oui (stockages, clé Claude)' : 'Non'],
                ['Modèle d’analyse', `${v.ai.model} · effort ${v.ai.effort}`],
                ['Projets avec une clé Claude', v.ai.projectsWithKey],
              ]}
            />
          </article>
          <article className={styles.card}>
            <header>
              <strong>Fichiers</strong>
              <State ok={null}>{v.storage.backends} stockage(s) externe(s)</State>
            </header>
            <Facts
              rows={[
                ['Dossier du serveur', <code key="root">{v.storage.root}</code>],
                ...v.storage.stores.map((x): [string, string] => [
                  x.store,
                  `${x.files} fichier(s), ${fileSize(x.bytes)}`,
                ]),
              ]}
            />
          </article>
        </div>
      </section>

      <section>
        <h2 className={page.h2}>Exécution</h2>
        <Facts
          rows={[
            ['Version déployée', r.version || 'Inconnue (variable SOURCE_COMMIT non fournie)'],
            ['Démarré', `${dateTime(r.startedAt)} · en service depuis ${duration(r.uptimeSeconds)}`],
            ['Node.js', `${r.node} · ${r.platform} · processus ${r.pid}`],
            ['Mémoire', `${fileSize(r.memoryRss)} résidente, ${fileSize(r.memoryHeap)} de tas`],
            ['Fuseau du serveur', r.timezone],
            ['Liens de connexion valides', q.loginLinksValid],
            [
              'Tâches quotidiennes',
              q.jobs.length ? q.jobs.map(j => `${j.name} : ${j.ranOn}`).join(' · ') : 'Jamais exécutées',
            ],
          ]}
        />
      </section>

      <section>
        <h2 className={page.h2}>Base de données</h2>
        <Facts
          rows={[
            ['Taille', fileSize(db.bytes)],
            [
              'Connexions',
              `${db.pool.total} ouvertes, ${db.pool.idle} libres, ${db.pool.waiting} en attente`,
            ],
            ['Contenus', db.entities.map(e => `${e.kind} ${e.n}`).join(' · ')],
          ]}
        />
        <details className={styles.fold}>
          <summary>Tables ({db.tables.length})</summary>
          <div className={backlog.tableWrap}>
            <table className={backlog.table} style={{ minWidth: 420 }}>
              <thead>
                <tr>
                  <th>Table</th>
                  <th style={{ width: 120 }}>Lignes</th>
                  <th style={{ width: 120 }}>Taille</th>
                </tr>
              </thead>
              <tbody>
                {db.tables.map(t => (
                  <tr key={t.name}>
                    <td className={styles.mono}>{t.name}</td>
                    <td>{t.rows.toLocaleString('fr-FR')}</td>
                    <td>{fileSize(t.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <details className={styles.fold}>
          <summary>
            Migrations ({db.migrations.length}) · dernière : {db.migrations[0]?.name ?? 'aucune'}
          </summary>
          <ul className={styles.plain}>
            {db.migrations.map(m => (
              <li key={m.name}>
                <span className={styles.mono}>{m.name}</span> <small>{dateTime(m.appliedAt)}</small>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section>
        <h2 className={page.h2}>Configuration</h2>
        <p className={page.faint}>
          Variables d’environnement lues au démarrage. Les secrets (mots de passe, clés) ne sont jamais
          affichés.
        </p>
        <Facts rows={s.config.map((c): [string, string] => [c.key, c.value])} />
      </section>
    </>
  );
}

/** Journal de la console : chaque action d'un super-administrateur, la plus récente d'abord. */
export function PlatformJournal() {
  const [rows, setRows] = useState<PlatformAudit[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    platform.audit().then(setRows, e => setError(message(e)));
  }, []);
  const shown = (rows ?? []).filter(r =>
    `${r.actor} ${r.action} ${r.target} ${r.detail}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <section>
      <h2 className={page.h2}>Journal de la console</h2>
      <p className={page.faint}>
        Les 300 dernières actions faites depuis cette console : création, suppression, membres, imports,
        accès. Les modifications faites dans un projet sont dans son propre journal (Projets, Gérer).
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
          placeholder="Filtrer par personne, action ou projet"
          aria-label="Filtrer le journal"
          onChange={e => setQ(e.target.value)}
        />
      </div>
      <div className={backlog.tableWrap}>
        <table className={backlog.table} style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ width: 150 }}>Date</th>
              <th style={{ width: 210 }}>Par</th>
              <th>Action</th>
              <th style={{ width: 170 }}>Sur</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.at}-${i}`}>
                <td>{dateTime(r.at)}</td>
                <td>{r.actor}</td>
                <td>
                  <strong className={styles.name}>{r.action}</strong>
                  {r.detail ? <span className={styles.sub}>{r.detail}</span> : null}
                </td>
                <td className={styles.mono}>{r.target}</td>
              </tr>
            ))}
            {rows && !shown.length ? (
              <tr>
                <td colSpan={4} className={backlog.empty}>
                  {q ? 'Aucune action ne correspond.' : 'Aucune action enregistrée pour l’instant.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
