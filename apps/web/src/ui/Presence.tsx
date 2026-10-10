import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api, clientId } from '../model/api';
import { useWorkspace } from '../model/store';
import styles from './Presence.module.css';

const PALETTE = ['#2383e2', '#2f9e6a', '#9065b0', '#d9730d', '#c14c8a', '#64473a', '#cb912f', '#d44c47'];
const colorOf = (name: string) =>
  PALETTE[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % PALETTE.length];

export function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size, background: colorOf(name) }}
      title={name}
      aria-label={name}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Signale au serveur la page consultée (toutes les 30 s et à chaque navigation). */
export function usePresenceBeacon() {
  const { pathname } = useLocation();
  useEffect(() => {
    const ping = () =>
      void api.post(`/presence?client=${clientId}`, { path: pathname }).catch(() => undefined);
    ping();
    const t = setInterval(ping, 30_000);
    return () => clearInterval(t);
  }, [pathname]);
}

/** Les autres membres qui consultent la même page. */
export function PageViewers() {
  const { pathname } = useLocation();
  const me = useWorkspace(s => s.session?.user?.id);
  const viewers = [
    ...new Map(
      useWorkspace(s => s.presence)
        .filter(p => p.path === pathname && p.userId !== me)
        .map(p => [p.userId, p]),
    ).values(),
  ];
  if (!viewers.length) return null;
  return (
    <div className={styles.viewers} aria-label="Également sur cette page">
      {viewers.map(v => (
        <Avatar key={v.userId} name={v.name || v.email} size={26} />
      ))}
      <span className={styles.label}>
        {viewers.length === 1
          ? `${viewers[0].name || viewers[0].email} consulte aussi cette page`
          : `${viewers.length} membres sur cette page`}
      </span>
    </div>
  );
}
