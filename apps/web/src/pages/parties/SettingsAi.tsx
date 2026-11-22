import { useEffect, useState } from 'react';
import { ApiError } from '../../model/api';
import { aiKey, type AiState } from '../../model/sources';
import page from '../Page.module.css';
import base from './Parties.module.css';
import own from './Storage.module.css';
import { confirmDialog } from '../../ui/Confirm';

const styles = { ...base, ...own };

/**
 * Clé Claude du projet, pour l'analyse des échanges (écran « À relire ») : chaque client utilise sa
 * propre clé Anthropic. Enregistrée tout de suite, après un essai ; jamais réaffichée.
 */
export function SettingsAi() {
  const [state, setState] = useState<AiState | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const reload = () => aiKey.status().then(setState, () => setState(null));
  useEffect(() => void reload(), []);

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
  const save = () =>
    run(async () => {
      setState({ ...(await aiKey.save(key.trim())), canEncrypt: true, model: state?.model ?? '' });
      setKey('');
      return 'Clé vérifiée auprès d’Anthropic et enregistrée.';
    });
  const test = () =>
    run(async () => {
      const r = await aiKey.test();
      return r.ok ? 'La clé fonctionne.' : (r.message ?? 'La clé ne fonctionne pas.');
    });
  const remove = async () =>
    (await confirmDialog(
      'Retirer la clé Claude du projet ? Les échanges déposés ensuite ne seront plus analysés.',
    )) &&
    void run(async () => {
      await aiKey.remove();
      await reload();
      return 'Clé retirée.';
    });

  return (
    <section className={styles.section}>
      <h2 className={page.h2}>Analyse des échanges par Claude</h2>
      <p className={styles.hint}>
        Les échanges déposés dans « À relire » (réunions, fils Slack, comptes rendus) sont analysés avec la
        clé de l’API Claude de ce projet : la consommation est facturée sur le compte Anthropic qui la
        fournit. Sans clé, les échanges sont reçus mais pas analysés.
      </p>
      {state && !state.canEncrypt ? (
        <p className={styles.warn}>
          Le serveur n’a pas de clé de chiffrement (variable SECRETS_KEY) : la clé Claude ne peut pas être
          enregistrée.
        </p>
      ) : null}
      <div className={styles.fields}>
        <span className={styles.fieldLabel}>État</span>
        <span>
          {!state
            ? 'Chargement…'
            : state.configured
              ? `Clé enregistrée (…${state.hint})${state.updatedBy ? `, par ${state.updatedBy}` : ''}${
                  state.updatedAt ? ` le ${new Date(state.updatedAt).toLocaleDateString('fr-FR')}` : ''
                }`
              : 'Aucune clé : les échanges ne sont pas analysés.'}
          {state?.model ? <p className={styles.hint}>Modèle utilisé : {state.model}</p> : null}
        </span>
        <label htmlFor="ai-key">{state?.configured ? 'Remplacer la clé' : 'Clé de l’API Claude'}</label>
        <span>
          <input
            id="ai-key"
            type="password"
            autoComplete="new-password"
            value={key}
            placeholder="sk-ant-…"
            disabled={!state?.canEncrypt}
            onChange={e => setKey(e.target.value)}
          />
          <p className={styles.hint}>
            Créée dans la console Anthropic (console.anthropic.com, API Keys). Essayée avant d’être
            enregistrée, chiffrée sur le serveur, jamais réaffichée.
          </p>
        </span>
      </div>
      <p className={page.actions}>
        <button
          type="button"
          className={page.primary}
          disabled={busy || !key.trim().startsWith('sk-ant-')}
          onClick={() => void save()}
        >
          {busy ? 'Vérification…' : 'Vérifier et enregistrer'}
        </button>
        {state?.configured ? (
          <>
            <button type="button" className={page.outline} disabled={busy} onClick={() => void test()}>
              Tester la clé
            </button>
            <button type="button" className={`${page.ghost} ${page.danger}`} disabled={busy} onClick={remove}>
              Retirer
            </button>
          </>
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
