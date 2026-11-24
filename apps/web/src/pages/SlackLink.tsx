import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { SlackLinkRequest } from '@board/shared';
import { ApiError } from '../model/api';
import { slack } from '../model/slack';
import { useWorkspace } from '../model/store';
import page from './Page.module.css';

/** Page ouverte depuis Slack : le membre connecté relie son compte Slack à son compte du tableau. */
export function SlackLink() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const user = useWorkspace(s => s.session?.user);
  const [request, setRequest] = useState<SlackLinkRequest | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? (e.message ?? e.code) : 'Erreur réseau, réessayez.');
  useEffect(() => {
    slack.linkRequest(token).then(setRequest, fail);
  }, [token]);
  return (
    <div className={page.page}>
      <h1 className={page.h1}>Relier Slack</h1>
      {done ? (
        <>
          <p>
            C’est fait : le compte Slack <strong>@{request?.slackName}</strong> agit maintenant en votre nom
            dans {request?.project}. Retournez dans Slack et tapez <code>/board aide</code>.
          </p>
          <p className={page.actions}>
            <Link to="/" className={page.outline}>
              Aller au tableau
            </Link>
          </p>
        </>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : request ? (
        <>
          <p>
            Relier le compte Slack <strong>@{request.slackName}</strong> à votre compte{' '}
            <strong>{user?.name || user?.email}</strong> ({user?.email}) dans {request.project} ?
          </p>
          <p className={page.faint}>
            Les commandes <code>/board</code> tapées depuis ce compte Slack se feront en votre nom, avec votre
            rôle. Vous pourrez le détacher à tout moment avec <code>/board delier</code>.
          </p>
          <p className={page.actions}>
            <button
              type="button"
              className={page.primary}
              disabled={busy}
              onClick={() => {
                setBusy(true);
                slack.confirmLink(token).then(() => setDone(true), fail);
              }}
            >
              Relier mon compte
            </button>
            <Link to="/" className={page.ghost}>
              Annuler
            </Link>
          </p>
        </>
      ) : (
        <p className={page.faint}>Chargement…</p>
      )}
    </div>
  );
}
