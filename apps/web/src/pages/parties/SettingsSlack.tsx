import { useEffect, useState } from 'react';
import { SLACK_EVENT_GROUPS, SLACK_EVENT_LABEL, type SlackEventGroup, type SlackStatus } from '@board/shared';
import { ApiError } from '../../model/api';
import { slack } from '../../model/slack';
import { confirmDialog } from '../../ui/Confirm';
import page from '../Page.module.css';
import base from './Parties.module.css';
import own from './Storage.module.css';

const styles = { ...base, ...own };
const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Slack, dans les deux sens. Vers Slack : l'activité du projet est publiée dans un canal (webhook
 * entrant). Depuis Slack : la commande /board agit sur le projet, au nom du membre qui la tape.
 * Chaque partie s'enregistre tout de suite ; les secrets ne sont jamais réaffichés.
 */
export function SettingsSlack() {
  const [state, setState] = useState<SlackStatus | null>(null);
  const [webhook, setWebhook] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => void slack.status().then(setState, () => setState(null)), []);

  const run = async (call: () => Promise<string>) => {
    setBusy(true);
    setNote('');
    try {
      setNote(await call());
    } catch (e) {
      setNote(e instanceof ApiError ? (e.message ?? e.code) : 'Erreur réseau, réessayez.');
    } finally {
      setBusy(false);
    }
  };
  const toggle = (g: SlackEventGroup, on: boolean) =>
    run(async () => {
      const events = SLACK_EVENT_GROUPS.filter(x => (x === g ? on : state?.events.includes(x)));
      setState(await slack.save({ events }));
      return 'Événements publiés mis à jour.';
    });
  const removeWebhook = async () =>
    (await confirmDialog({
      title: 'Ne plus publier dans Slack ?',
      message: 'Le webhook est retiré : le canal ne recevra plus l’activité du projet.',
      confirmLabel: 'Retirer',
      danger: true,
    })) &&
    void run(async () => {
      setState(await slack.save({ webhook: '' }));
      return 'Webhook retiré.';
    });
  const removeSecret = async () =>
    (await confirmDialog({
      title: 'Désactiver la commande /board ?',
      message: 'Le secret de signature est retiré : les commandes tapées dans Slack seront refusées.',
      confirmLabel: 'Désactiver',
      danger: true,
    })) &&
    void run(async () => {
      setState(await slack.save({ signingSecret: '' }));
      return 'Commande désactivée.';
    });

  return (
    <section className={styles.section}>
      <h2 className={page.h2}>Slack</h2>
      <p className={styles.hint}>
        Dans un sens, l’activité du projet est publiée dans un canal Slack. Dans l’autre, la commande{' '}
        <code>/board</code> permet de créer un ticket, chercher, changer une étape ou commenter sans quitter
        Slack. Les deux se règlent dans une même application Slack, créée sur api.slack.com/apps.
      </p>
      {state && !state.canEncrypt ? (
        <p className={styles.warn}>
          Le serveur n’a pas de clé de chiffrement (variable SECRETS_KEY) : les secrets Slack ne peuvent pas
          être enregistrés.
        </p>
      ) : null}

      <h3 className={page.h3}>Du tableau vers Slack</h3>
      <div className={styles.fields}>
        <span className={styles.fieldLabel}>État</span>
        <span>
          {!state
            ? 'Chargement…'
            : state.webhook
              ? `Canal relié (webhook ${state.webhook})${state.lastSentAt ? `, dernier message le ${when(state.lastSentAt)}` : ''}`
              : 'Aucun canal relié.'}
          {state?.lastError ? <p className={styles.warn}>Dernier envoi refusé : {state.lastError}</p> : null}
        </span>
        <label htmlFor="slack-webhook">{state?.webhook ? 'Remplacer le webhook' : 'Webhook entrant'}</label>
        <span>
          <input
            id="slack-webhook"
            type="password"
            autoComplete="new-password"
            value={webhook}
            placeholder="https://hooks.slack.com/services/…"
            disabled={!state?.canEncrypt}
            onChange={e => setWebhook(e.target.value)}
          />
          <p className={styles.hint}>
            Dans l’application Slack : Incoming Webhooks, Add New Webhook, puis le canal. Un message de
            bienvenue y est envoyé pour vérifier l’adresse avant de l’enregistrer.
          </p>
        </span>
        <span className={styles.fieldLabel}>Événements publiés</span>
        <span>
          <span className={styles.checks}>
            {SLACK_EVENT_GROUPS.map(g => (
              <label key={g} title={SLACK_EVENT_LABEL[g].hint}>
                <input
                  type="checkbox"
                  checked={!!state?.events.includes(g)}
                  disabled={busy || !state}
                  onChange={e => void toggle(g, e.target.checked)}
                />
                {SLACK_EVENT_LABEL[g].name}
              </label>
            ))}
          </span>
          <p className={styles.hint}>
            Des changements en rafale ne font qu’un message : un ticket qui change trois fois d’étape en une
            minute est annoncé une fois, et pas du tout s’il revient à son étape de départ. Tout le canal voit
            ces messages, y compris ceux de la Réalisation.
          </p>
        </span>
      </div>
      <p className={page.actions}>
        <button
          type="button"
          className={page.primary}
          disabled={busy || !webhook.trim().startsWith('https://hooks.slack.com/services/')}
          onClick={() =>
            void run(async () => {
              setState(await slack.save({ webhook: webhook.trim() }));
              setWebhook('');
              return 'Webhook vérifié et enregistré : un message de bienvenue est dans le canal.';
            })
          }
        >
          {busy ? 'Vérification…' : 'Vérifier et enregistrer'}
        </button>
        {state?.webhook ? (
          <>
            <button
              type="button"
              className={page.outline}
              disabled={busy}
              onClick={() => void run(async () => (await slack.test()).message)}
            >
              Envoyer un message d’essai
            </button>
            <button
              type="button"
              className={`${page.ghost} ${page.danger}`}
              disabled={busy}
              onClick={removeWebhook}
            >
              Retirer
            </button>
          </>
        ) : null}
      </p>

      <h3 className={page.h3}>De Slack vers le tableau</h3>
      <div className={styles.fields}>
        <span className={styles.fieldLabel}>État</span>
        <span>
          {!state
            ? 'Chargement…'
            : state.commands
              ? `Commande /board active · ${state.linked.length} compte${state.linked.length > 1 ? 's' : ''} Slack relié${state.linked.length > 1 ? 's' : ''}`
              : 'Commande /board inactive.'}
          {state?.linked.length ? (
            <p className={styles.hint}>{state.linked.map(l => `${l.name} (@${l.slackName})`).join(' · ')}</p>
          ) : null}
        </span>
        <label htmlFor="slack-url">Adresse à donner à Slack (Request URL)</label>
        <span>
          <input
            id="slack-url"
            type="text"
            readOnly
            value={state?.commandUrl ?? ''}
            onFocus={e => e.target.select()}
          />
          <p className={styles.hint}>
            Dans l’application Slack : Slash Commands, Create New Command, commande <code>/board</code>, et
            cette adresse.
          </p>
        </span>
        <label htmlFor="slack-secret">
          {state?.commands ? 'Remplacer le secret de signature' : 'Secret de signature (Signing Secret)'}
        </label>
        <span>
          <input
            id="slack-secret"
            type="password"
            autoComplete="new-password"
            value={secret}
            placeholder="32 caractères"
            disabled={!state?.canEncrypt}
            onChange={e => setSecret(e.target.value)}
          />
          <p className={styles.hint}>
            Dans l’application Slack : Basic Information, App Credentials. Il prouve que la commande vient
            bien de votre espace Slack. Chacun relie ensuite son compte Slack à son compte du tableau, une
            fois, au premier <code>/board</code> : ses actions se font avec son propre rôle.
          </p>
        </span>
      </div>
      <p className={page.actions}>
        <button
          type="button"
          className={page.primary}
          disabled={busy || !/^[a-f0-9]{20,64}$/i.test(secret.trim())}
          onClick={() =>
            void run(async () => {
              setState(await slack.save({ signingSecret: secret.trim() }));
              setSecret('');
              return 'Secret enregistré : la commande /board est active.';
            })
          }
        >
          Enregistrer le secret
        </button>
        {state?.commands ? (
          <button
            type="button"
            className={`${page.ghost} ${page.danger}`}
            disabled={busy}
            onClick={removeSecret}
          >
            Désactiver
          </button>
        ) : null}
      </p>
      {note ? (
        <p className={page.faint} role="status">
          {note}
        </p>
      ) : null}
    </section>
  );
}
