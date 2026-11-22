import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  EMAIL_MODE_LABEL,
  EMAIL_MODES,
  NOTIFICATION_GROUPS,
  type AppNotification,
  type EmailMode,
  type FollowState,
  type NotificationGroup,
  type NotificationPrefs,
  type NotificationType,
} from '@board/shared';
import { follow, prefs as prefsApi, useNotifications } from '../model/notifications';
import { isIos, usePwa } from '../model/pwa';
import { Icon, type IconName } from './Icon';
import drawer from './StoryDrawer.module.css';
import styles from './Notifications.module.css';

const ICON: Record<NotificationType, IconName> = {
  mention: 'at',
  reply: 'message',
  comment: 'message',
  assigned: 'user',
  status: 'cycle',
  sprint: 'flag',
  proposal: 'inbox',
  member: 'users',
  risk: 'alert',
  due: 'calendar',
};

/** « à l'instant », « il y a 12 min », « hier », puis la date. */
function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  if (min < 60 * 24) return `il y a ${Math.round(min / 60)} h`;
  if (min < 60 * 48) return 'hier';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Entrée du menu : la cloche et le nombre de notifications non lues ; ouvre le panneau. */
export function NotificationBell({ className, iconClass }: { className: string; iconClass: string }) {
  const { unread, load, setOpen } = useNotifications();
  useEffect(() => void load(), [load]);
  // Le compteur se lit aussi dans l'onglet du navigateur.
  useEffect(() => {
    const bare = document.title.replace(/^\(\d+\+?\) /, '');
    document.title = unread ? `(${unread > 99 ? '99+' : unread}) ${bare}` : bare;
  }, [unread]);
  return (
    <button type="button" className={className} onClick={() => setOpen(true)}>
      <span className={iconClass}>
        <Icon name="bell" />
      </span>
      Notifications
      {unread ? (
        <span className={styles.badge} aria-label={`${unread} non lue${unread > 1 ? 's' : ''}`}>
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </button>
  );
}

function Item({ n, onOpen }: { n: AppNotification; onOpen: () => void }) {
  return (
    <li>
      <button type="button" className={styles.item} data-unread={!n.readAt || undefined} onClick={onOpen}>
        <span className={styles.itemIcon} aria-hidden="true">
          <Icon name={ICON[n.type] ?? 'bell'} />
        </span>
        <span className={styles.itemText}>
          <span className={styles.itemTitle}>{n.title}</span>
          {n.body ? <span className={styles.itemBody}>{n.body}</span> : null}
          <span className={styles.itemMeta}>
            {ago(n.updatedAt)}
            {n.count > 1 ? ` · ${n.count} changements regroupés` : ''}
          </span>
        </span>
        {!n.readAt ? <span className={styles.dot} role="img" aria-label="Non lue" /> : null}
      </button>
    </li>
  );
}

/**
 * Panneau des notifications : tiroir latéral, pour consulter sans quitter la page. Ouvrir une
 * notification la marque lue et mène à l'élément.
 */
export function NotificationPanel() {
  const { items, unread, open, setOpen, load, read } = useNotifications();
  const [only, setOnly] = useState<'unread' | 'all' | 'prefs'>('unread');
  const navigate = useNavigate();
  const location = useLocation();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [location.pathname, setOpen]);
  useEffect(() => {
    if (!open) return;
    void load();
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, load, setOpen]);
  if (!open) return null;
  const shown = only === 'unread' ? items.filter(n => !n.readAt) : items;
  const go = (n: AppNotification) => {
    if (!n.readAt) void read({ ids: [n.id] });
    setOpen(false);
    navigate(n.path);
  };
  return (
    <>
      <button
        type="button"
        className={drawer.scrim}
        aria-label="Fermer les notifications"
        onClick={() => setOpen(false)}
      />
      <div
        ref={panel}
        className={`${drawer.drawer} ${styles.panel}`}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        tabIndex={-1}
      >
        <header className={drawer.head}>
          <span className={styles.headTitle}>Notifications</span>
          <button
            type="button"
            className={styles.link}
            disabled={!unread}
            onClick={() => void read({ all: true })}
          >
            Tout marquer comme lu
          </button>
          <button type="button" className={drawer.icon} onClick={() => setOpen(false)} aria-label="Fermer">
            ✕
          </button>
        </header>
        <div className={styles.tabs} role="tablist" aria-label="Filtre">
          {(
            [
              ['unread', `Non lues${unread ? ` (${unread})` : ''}`],
              ['all', 'Toutes'],
              ['prefs', 'Préférences'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={only === k}
              className={styles.tab}
              onClick={() => setOnly(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.body}>
          {only === 'prefs' ? (
            <Preferences />
          ) : shown.length ? (
            <ul className={styles.list}>
              {shown.map(n => (
                <Item key={n.id} n={n} onOpen={() => go(n)} />
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>
              {only === 'unread'
                ? 'Vous êtes à jour : rien de nouveau.'
                : 'Aucune notification pour l’instant.'}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

const GROUP_HINT: Record<NotificationGroup, string> = {
  mentions: 'On vous mentionne dans un fil, ou on répond à votre message.',
  assigned: 'Un ticket vous est attribué, change d’étape, ou arrive à échéance.',
  following: 'Un message sur un élément que vous suivez.',
  project: 'Sprint démarré ou clos, propositions à relire, nouveau membre, risque critique.',
};

/** Cet appareil : installer l'application, recevoir les notifications système. */
function Device() {
  const { push, install, installed, refreshPush, enablePush, disablePush, promptInstall } = usePwa();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => void refreshPush(), [refreshPush]);
  const run = async (action: () => Promise<string | null | void>) => {
    setBusy(true);
    setNote('');
    try {
      setNote((await action()) ?? '');
    } catch {
      setNote('L’opération a échoué, réessayez.');
    } finally {
      setBusy(false);
    }
  };
  const iosNeedsInstall = push === 'unsupported' && isIos() && !installed;
  if (push === 'unsupported' && !iosNeedsInstall && !install && !installed) return null;
  return (
    <section className={styles.device} aria-label="Cet appareil">
      <strong>Sur cet appareil</strong>
      {push === 'on' ? (
        <p>
          Les notifications de l’appareil sont actives : vous êtes prévenu même quand le tableau est fermé.{' '}
          <button type="button" className={styles.link} disabled={busy} onClick={() => void run(disablePush)}>
            Désactiver
          </button>
        </p>
      ) : push === 'off' ? (
        <p>
          Recevez une notification de l’appareil même quand le tableau est fermé.
          <br />
          <button
            type="button"
            className={styles.action}
            disabled={busy}
            onClick={() => void run(enablePush)}
          >
            Activer les notifications
          </button>
        </p>
      ) : push === 'denied' ? (
        <p>
          Les notifications de ce site sont bloquées dans le navigateur : autorisez-les dans ses réglages pour
          les recevoir ici.
        </p>
      ) : iosNeedsInstall ? (
        <p>
          Sur iPhone et iPad, les notifications demandent d’installer l’application : bouton Partager de
          Safari, puis « Sur l’écran d’accueil ».
        </p>
      ) : push === 'disabled' ? (
        <p>Les notifications de l’appareil ne sont pas activées sur ce serveur.</p>
      ) : null}
      {install && !installed ? (
        <p>
          Installez le tableau comme une application : son icône, sa fenêtre, un démarrage rapide.
          <br />
          <button type="button" className={styles.action} onClick={() => void promptInstall()}>
            Installer l’application
          </button>
        </p>
      ) : installed ? (
        <p>L’application est installée sur cet appareil.</p>
      ) : null}
      {note ? <p role="status">{note}</p> : null}
    </section>
  );
}

/** Rythme des e-mails et notifications de l'appareil, famille par famille. Enregistré à chaque choix. */
function Preferences() {
  const [value, setValue] = useState<NotificationPrefs | null>(null);
  const [note, setNote] = useState('');
  const pushOn = usePwa(s => s.push === 'on');
  useEffect(() => {
    prefsApi.get().then(setValue, () => setNote('Préférences indisponibles, réessayez.'));
  }, []);
  if (!value) return <p className={styles.empty}>{note || 'Chargement…'}</p>;
  const save = (next: NotificationPrefs) => {
    setValue(next);
    setNote('');
    prefsApi.save(next).then(
      () => setNote('Préférences enregistrées.'),
      () => setNote('Enregistrement impossible, réessayez.'),
    );
  };
  return (
    <div className={styles.prefs}>
      <Device />
      <p className={styles.prefsLead}>
        Toutes les notifications s’affichent ici. Choisissez celles qui vous arrivent aussi par e-mail, et à
        quel rythme{pushOn ? ', ou en notification de l’appareil (case à cocher)' : ''}. Une notification déjà
        lue dans le tableau n’est pas envoyée par e-mail.
      </p>
      {(Object.keys(NOTIFICATION_GROUPS) as NotificationGroup[]).map(g => (
        <div key={g} className={styles.pref}>
          <span className={styles.prefText}>
            <strong>{NOTIFICATION_GROUPS[g].label}</strong>
            <span>{GROUP_HINT[g]}</span>
          </span>
          <select
            value={value.email[g]}
            aria-label={`E-mails : ${NOTIFICATION_GROUPS[g].label}`}
            onChange={e => save({ ...value, email: { ...value.email, [g]: e.target.value as EmailMode } })}
          >
            {EMAIL_MODES.map(m => (
              <option key={m} value={m}>
                {EMAIL_MODE_LABEL[m]}
              </option>
            ))}
          </select>
          {pushOn ? (
            <label className={styles.prefPush} title="Notification de l’appareil pour cette famille">
              <input
                type="checkbox"
                checked={value.push[g]}
                aria-label={`Notification de l’appareil : ${NOTIFICATION_GROUPS[g].label}`}
                onChange={e => save({ ...value, push: { ...value.push, [g]: e.target.checked } })}
              />
              <Icon name="bell" size={14} />
            </label>
          ) : null}
        </div>
      ))}
      <p className={styles.prefsNote} role="status">
        {note}
      </p>
    </div>
  );
}

/**
 * Suivre un élément : on est prévenu des messages et des changements. « Suivi » se coupe d'un clic
 * (mise en sourdine : seule une mention prévient encore).
 */
export function FollowButton({ kind, id }: { kind: string; id: string }) {
  const [state, setState] = useState<FollowState | null>(null);
  useEffect(() => {
    let live = true;
    setState(null);
    follow.get(kind, id).then(
      s => live && setState(s),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [kind, id]);
  if (state === null) return null;
  const on = state === 'following';
  return (
    <button
      type="button"
      className={styles.follow}
      aria-pressed={on}
      title={
        on
          ? 'Vous êtes prévenu des messages et des changements. Cliquer pour ne plus l’être.'
          : 'Être prévenu des messages et des changements sur cet élément'
      }
      onClick={() => void follow.set(kind, id, on ? 'muted' : 'following').then(setState, () => undefined)}
    >
      <Icon name="bell" size={14} />
      {on ? 'Suivi' : 'Suivre'}
    </button>
  );
}
