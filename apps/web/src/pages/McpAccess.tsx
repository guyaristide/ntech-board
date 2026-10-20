import { useEffect, useState } from 'react';
import { api, ApiError } from '../model/api';
import { canUseMcp } from '@board/shared';
import { useCanEdit, useSeesDelivery, useWorkspace } from '../model/store';
import page from './Page.module.css';
import styles from './McpAccess.module.css';

interface Token {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const PLACEHOLDER = 'brd_VOTRE_JETON';

/** Configuration à coller dans chaque client, avec l'adresse du tableau et le jeton. */
function configs(url: string, name: string, token: string) {
  return {
    'Claude Code': `claude mcp add --transport http ${name} ${url} \\\n  --header "Authorization: Bearer ${token}"`,
    Cursor: JSON.stringify(
      { mcpServers: { [name]: { url, headers: { Authorization: `Bearer ${token}` } } } },
      null,
      2,
    ),
    'Claude Desktop': JSON.stringify(
      {
        mcpServers: {
          [name]: {
            command: 'npx',
            args: ['-y', 'mcp-remote@0.14.3', url, '--header', 'Authorization:${AUTH}'],
            env: { AUTH: `Bearer ${token}` },
          },
        },
      },
      null,
      2,
    ),
  };
}
const WHERE: Record<string, string> = {
  'Claude Code': 'Dans un terminal :',
  Cursor: 'Dans ~/.cursor/mcp.json (ou .cursor/mcp.json du dépôt) :',
  'Claude Desktop':
    'Dans Réglages › Développeur › Modifier la configuration (claude_desktop_config.json), puis redémarrer Claude Desktop :',
};

function Code({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.code}>
      <pre>{text}</pre>
      <button
        type="button"
        className={page.ghost}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? 'Copié' : 'Copier'}
      </button>
    </div>
  );
}

/**
 * Accès MCP : jetons personnels pour connecter un assistant (Claude Code, Claude Desktop, Cursor)
 * au tableau, avec les droits du membre.
 */
export function McpAccess() {
  const project = useWorkspace(s => s.session?.project);
  const canEdit = useCanEdit();
  const delivery = useSeesDelivery();
  const allowed = useWorkspace(s => canUseMcp(s.settings, s.session?.role ?? null));
  const [tokens, setTokens] = useState<Token[]>([]);
  const [name, setName] = useState('');
  const [days, setDays] = useState('90');
  const [fresh, setFresh] = useState<string | null>(null);
  const [client, setClient] = useState('Claude Code');
  const [error, setError] = useState('');
  const url = `${window.location.origin}/api/mcp`;
  const server = `ntech-${project?.slug ?? 'board'}`;
  const load = () => api.get<Token[]>('/tokens').then(setTokens, () => setTokens([]));
  useEffect(() => void load(), []);

  const create = async () => {
    setError('');
    try {
      const t = await api.post<Token & { token: string }>('/tokens', {
        name: name.trim(),
        days: days ? Number(days) : null,
      });
      setFresh(t.token);
      setName('');
      void load();
    } catch (e) {
      setError(e instanceof ApiError ? (e.message ?? e.code) : 'Création impossible.');
    }
  };
  const revoke = async (t: Token) => {
    if (!confirm(`Révoquer « ${t.name} » ? Les assistants qui l’utilisent perdront l’accès.`)) return;
    await api.delete(`/tokens/${t.id}`);
    void load();
  };
  const shown = configs(url, server, fresh ?? PLACEHOLDER);

  if (!allowed)
    return (
      <div className={page.page}>
        <h1 className={page.h1}>Accès MCP</h1>
        <div className={page.emptyState}>
          <strong>L’accès MCP n’est pas ouvert à votre rôle</strong>
          <p>Un administrateur du projet peut l’ouvrir dans Réglages du projet, section Accès MCP.</p>
        </div>
        {tokens.length ? (
          <p className={page.faint}>
            Vos {tokens.length} jeton(s) existant(s) sont inactifs ; vous pouvez les révoquer ci-dessous.
          </p>
        ) : null}
        {tokens.map(t => (
          <p key={t.id} className={page.faint}>
            {t.name} ({t.prefix}…){' '}
            <button type="button" className={`${page.ghost} ${page.danger}`} onClick={() => void revoke(t)}>
              Révoquer
            </button>
          </p>
        ))}
      </div>
    );
  return (
    <div className={page.page}>
      <span className={page.icon} aria-hidden="true">
        🔌
      </span>
      <h1 className={page.h1}>Accès MCP</h1>
      <p className={page.lead}>
        Connectez un assistant (Claude Code, Claude Desktop, Cursor) à ce tableau par le protocole MCP. Il
        consulte le projet et{' '}
        {canEdit
          ? 'agit pour vous : commentaires, US, points à trancher'
          : 'le consulte en lecture seule, comme votre rôle'}
        {canEdit && delivery ? ', tickets et recette' : ''}. Chaque modification est signée de votre nom. Le
        jeton vaut votre accès : ne le partagez pas, révoquez-le s’il a pu fuiter.
      </p>

      <h2 className={page.h2}>Nouveau jeton</h2>
      <form
        className={styles.create}
        onSubmit={e => {
          e.preventDefault();
          if (name.trim()) void create();
        }}
      >
        <input
          value={name}
          placeholder="Nom du jeton (ex. : Claude Code, portable)"
          aria-label="Nom du jeton"
          maxLength={80}
          onChange={e => setName(e.target.value)}
        />
        <select value={days} aria-label="Durée de validité" onChange={e => setDays(e.target.value)}>
          <option value="30">30 jours</option>
          <option value="90">90 jours</option>
          <option value="365">1 an</option>
          <option value="">Sans expiration</option>
        </select>
        <button type="submit" className={page.primary} disabled={!name.trim()}>
          Créer le jeton
        </button>
        {error ? <span className={styles.error}>{error}</span> : null}
      </form>
      {fresh ? (
        <div className={styles.secret}>
          <p>
            <strong>Copiez ce jeton maintenant :</strong> il ne sera plus affiché. Les configurations
            ci-dessous le contiennent déjà.
          </p>
          <Code text={fresh} />
        </div>
      ) : null}

      <h2 className={page.h2}>Configurer le client</h2>
      <p className={page.faint}>Adresse du serveur : {url}</p>
      <div className={styles.tabs}>
        {Object.keys(shown).map(k => (
          <button
            key={k}
            type="button"
            className={styles.tab}
            data-on={client === k || undefined}
            onClick={() => setClient(k)}
          >
            {k}
          </button>
        ))}
      </div>
      <p className={page.faint}>
        {fresh ? null : (
          <>
            Remplacez <code className={styles.inlineCode}>{PLACEHOLDER}</code> par votre jeton.{' '}
          </>
        )}
        {WHERE[client]}
      </p>
      <Code text={shown[client as keyof typeof shown]} />

      <h2 className={page.h2}>Mes jetons</h2>
      {tokens.length ? (
        <div className={styles.wrap}>
          <table className={styles.tokens}>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Début</th>
                <th>Créé le</th>
                <th>Dernière utilisation</th>
                <th>Expire le</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tokens.map(t => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className={styles.mono}>{t.prefix}…</td>
                  <td>{day(t.createdAt)}</td>
                  <td>{t.lastUsedAt ? day(t.lastUsedAt) : 'Jamais'}</td>
                  <td>{t.expiresAt ? day(t.expiresAt) : 'Jamais'}</td>
                  <td>
                    <button
                      type="button"
                      className={`${page.ghost} ${page.danger}`}
                      onClick={() => void revoke(t)}
                    >
                      Révoquer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={page.faint}>Aucun jeton.</p>
      )}
    </div>
  );
}
