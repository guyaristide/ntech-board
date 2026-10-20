import type { Dispatch, SetStateAction } from 'react';
import { OUT_OF_SCOPE, riskScopesOf, type ProjectSettings } from '@board/shared';
import { useWorkspace } from '../../model/store';
import page from '../Page.module.css';
import { EditableList } from './EditableList';
import styles from './Parties.module.css';

type Props = { draft: ProjectSettings; setDraft: Dispatch<SetStateAction<ProjectSettings>> };

/** Liste de libellés : clés stables par position, pour que la saisie ne perde pas le focus. */
const asItems = (list: string[]) => list.map((name, i) => ({ id: String(i), name }));
const names = (items: { name: string }[]) => items.map(x => x.name).filter(x => x.trim());

/**
 * Réglages du cadrage, propres à chaque projet : versions ou lots, acteurs des US, document de
 * référence, périmètres de risque, types d'organisations.
 */
export function SettingsCadrage({ draft, setDraft }: Props) {
  const risks = useWorkspace(s => s.risks);
  const set = (patch: Partial<ProjectSettings>) => setDraft(s => ({ ...s, ...patch }));
  // Les périmètres déjà utilisés par le registre restent proposés même s'ils ne sont pas réglés.
  const derived = riskScopesOf({ ...draft, riskScopes: [] }, risks).filter(
    s => !draft.riskScopes.some(r => r.prefix === s.prefix),
  );
  return (
    <>
      <section className={styles.section}>
        <h2 className={page.h2}>Cadrage</h2>
        <div className={styles.fields}>
          <label htmlFor="reference-document">Document de référence</label>
          <div>
            <input
              id="reference-document"
              type="text"
              value={draft.referenceDocument}
              onChange={e => set({ referenceDocument: e.target.value })}
            />
            <p className={styles.hint}>
              Ce que résument les fiches Références : cahier des charges, expression de besoin…
            </p>
          </div>
        </div>
        <h3 className={page.h3}>Versions ou lots</h3>
        <EditableList
          items={asItems(draft.versions.filter(v => v !== OUT_OF_SCOPE))}
          onChange={list => set({ versions: names(list) })}
          add={name => ({ id: String(Date.now()), name })}
        />
        <p className={styles.hint}>
          Dans l’ordre de livraison. « {OUT_OF_SCOPE} » s’ajoute toujours en dernier, pour les US écartées.
        </p>
        <h3 className={page.h3}>Acteurs des US</h3>
        <EditableList
          items={asItems(draft.actors)}
          onChange={list => set({ actors: names(list) })}
          add={name => ({ id: String(Date.now()), name })}
        />
        <p className={styles.hint}>
          Proposés en premier dans les US ; les acteurs déjà saisis restent proposés. Le premier est celui
          d’une nouvelle US.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={page.h2}>Périmètres de risque</h2>
        <EditableList
          items={draft.riskScopes.map((s, i) => ({ id: String(i), name: s.name, prefix: s.prefix }))}
          onChange={list =>
            set({
              riskScopes: list.filter(x => x.name.trim()).map(x => ({ name: x.name, prefix: x.prefix })),
            })
          }
          extra={(item, patch) => (
            <input
              type="text"
              className={styles.prefix}
              value={item.prefix}
              aria-label="Préfixe des identifiants"
              title="Préfixe des identifiants : R → R12, RG- → RG-04"
              onChange={e =>
                patch({
                  prefix: e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z-]/g, '')
                    .slice(0, 5),
                })
              }
            />
          )}
          add={name => ({ id: String(Date.now()), name, prefix: name.slice(0, 1).toUpperCase() || 'R' })}
        />
        <p className={styles.hint}>
          Chaque périmètre a son bouton de création et sa série d’identifiants.
          {derived.length
            ? ` Déjà présents dans le registre : ${derived.map(s => `${s.name} (${s.prefix})`).join(', ')}.`
            : ''}
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={page.h2}>Types d’organisations</h2>
        <EditableList
          items={asItems(draft.organizationTypes)}
          onChange={list => set({ organizationTypes: names(list) })}
          add={name => ({ id: String(Date.now()), name })}
        />
      </section>
    </>
  );
}
