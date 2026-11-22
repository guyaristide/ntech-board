import { create } from 'zustand';
import { api } from './api';

/**
 * Application installable et notifications système : service worker, invitation à installer,
 * abonnement de l'appareil au push. Tout est facultatif : sans prise en charge du navigateur ou sans
 * clés sur le serveur, l'interface ne propose simplement rien.
 */

/** Invitation à installer, gardée par le navigateur jusqu'à ce qu'on la déclenche (Chrome, Edge). */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type PushState = 'unsupported' | 'disabled' | 'denied' | 'off' | 'on';

interface State {
  install: InstallPrompt | null;
  installed: boolean;
  push: PushState;
  refreshPush: () => Promise<void>;
  enablePush: () => Promise<string | null>;
  disablePush: () => Promise<void>;
  promptInstall: () => Promise<void>;
}

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhone et iPad : pas d'invitation automatique, l'installation passe par le menu Partager. */
export const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Clé VAPID (base64 pour adresse) en octets, comme l'attend le navigateur. */
function keyBytes(key: string) {
  const b64 = (key + '='.repeat((4 - (key.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

let serverKey: string | null | undefined;
const publicKey = async () =>
  (serverKey ??= await api.get<{ publicKey: string | null }>('/push/key').then(
    r => r.publicKey,
    () => null,
  ));

export const usePwa = create<State>((set, get) => ({
  install: null,
  installed: standalone(),
  push: 'unsupported',
  refreshPush: async () => {
    if (!supported()) return set({ push: 'unsupported' });
    if (!(await publicKey())) return set({ push: 'disabled' });
    if (Notification.permission === 'denied') return set({ push: 'denied' });
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    set({ push: sub && Notification.permission === 'granted' ? 'on' : 'off' });
  },
  /** Demande l'autorisation puis abonne l'appareil. Rend un message en cas d'échec, sinon null. */
  enablePush: async () => {
    const key = await publicKey();
    if (!supported() || !key) return 'Les notifications système ne sont pas disponibles ici.';
    if ((await Notification.requestPermission()) !== 'granted') {
      await get().refreshPush();
      return 'Autorisation refusée : réactivez les notifications de ce site dans les réglages du navigateur.';
    }
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
    const json = sub.toJSON();
    await api.post('/push/subscriptions', { endpoint: json.endpoint, keys: json.keys });
    set({ push: 'on' });
    return null;
  },
  disablePush: async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api.post('/push/subscriptions/remove', { endpoint: sub.endpoint }).catch(() => undefined);
      await sub.unsubscribe();
    }
    set({ push: 'off' });
  },
  promptInstall: async () => {
    const prompt = get().install;
    if (!prompt) return;
    await prompt.prompt();
    if ((await prompt.userChoice).outcome === 'accepted') set({ installed: true });
    set({ install: null });
  },
}));

/** À appeler une fois au démarrage : service worker (hors développement) et écoutes du navigateur. */
export function startPwa() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    usePwa.setState({ install: e as InstallPrompt });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ installed: true, install: null }));
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  void navigator.serviceWorker.register('/sw.js').then(() => usePwa.getState().refreshPush());
  // Clic sur une notification système : l'onglet déjà ouvert va sur l'élément, sans recharger.
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type !== 'open' || typeof e.data.path !== 'string') return;
    window.history.pushState({}, '', e.data.path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}
