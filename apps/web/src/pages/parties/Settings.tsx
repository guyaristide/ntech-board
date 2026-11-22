import { useEffect, useState } from 'react';
import {
  ESTIMATION_LABEL,
  ROLE_LABEL,
  ROLES,
  STEP_CATEGORY_LABEL,
  type DeliverySettings,
  type Estimation,
  type Member,
  type ProjectSettings,
  type StepCategory,
} from '@board/shared';
import { api, ApiError } from '../../model/api';
import { useIsAdmin, useWorkspace } from '../../model/store';
import { SideTabs, sideTabsPage, useSideTab, type SideTab } from '../../ui/SideTabs';
import page from '../Page.module.css';
import styles from './Parties.module.css';
import { EditableList } from './EditableList';
import { SettingsCadrage } from './SettingsCadrage';
import { SettingsAi } from './SettingsAi';
import { SettingsFiles } from './SettingsFiles';
import { SettingsProject } from './SettingsProject';
import { SettingsTemplate } from '../SettingsTemplate';
import { confirmDialog } from '../../ui/Confirm';

/** Rubriques des réglages : une à la fois à l'écran, choisie dans le menu (et gardée dans l'adresse). */
const TABS = [
  { id: 'general', label: 'Général', hint: 'Nom du tableau, modèle', icon: 'sliders' },
  { id: 'delivery', label: 'Réalisation', hint: 'Sprints, tickets, visibilité', icon: 'cycle' },
  { id: 'scoping', label: 'Cadrage', hint: 'Versions, acteurs, risques', icon: 'list' },
  { id: 'files', label: 'Fichiers', hint: 'Pièces jointes, stockages', icon: 'folder' },
  { id: 'integrations', label: 'Intégrations', hint: 'Accès MCP, analyse Claude', icon: 'plug' },
] as const satisfies readonly SideTab[];
type TabId = (typeof TABS)[number]['id'];

/** Rubrique à laquelle appartient chaque réglage du brouillon (les autres relèvent du cadrage). */
const TAB_OF: Partial<Record<keyof ProjectSettings, TabId>> = {
  delivery: 'delivery',
  files: 'files',
  mcp: 'integrations',
};

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'etape';
const uniqueId = (name: string, taken: string[]) => {
  let id = slug(name);
  while (taken.includes(id)) id = `${id}-2`;
  return id;
};

/**
 * Réglages du projet, réservés aux administrateurs : partie Réalisation (activation, clé des tickets,
 * sprints, estimation, étapes, types, visibilité) et types d'organisations du référentiel.
 */
export function Settings() {
  const ws = useWorkspace();
  const admin = useIsAdmin();
  const [draft, setDraft] = useState<ProjectSettings>(ws.settings);
  const [members, setMembers] = useState<Member[]>([]);
  const [status, setStatus] = useState('');
  const [tab, selectTab] = useSideTab<TabId>(TABS);
  useEffect(() => setDraft(ws.settings), [ws.settings]);
  useEffect(() => {
    if (admin) api.get<Member[]>('/admin/members').then(setMembers, () => setMembers([]));
  }, [admin]);
  if (!admin) return <div className={page.page}>Réservé aux administrateurs du projet.</div>;

  const d = draft.delivery;
  const setD = (patch: Partial<DeliverySettings>) =>
    setDraft(s => ({ ...s, delivery: { ...s.delivery, ...patch } }));
  const v = d.visibility;
  const setV = (patch: Partial<DeliverySettings['visibility']>) => setD({ visibility: { ...v, ...patch } });
  const toggle = (list: string[], value: string, on: boolean) =>
    on ? [...new Set([...list, value])] : list.filter(x => x !== value);
  const dirty = JSON.stringify(draft) !== JSON.stringify(ws.settings);
  // Rubriques qui portent des modifications non enregistrées : signalées dans le menu.
  const changed = new Set<TabId>(
    (Object.keys(draft) as (keyof ProjectSettings)[])
      .filter(k => JSON.stringify(draft[k]) !== JSON.stringify(ws.settings[k]))
      .map(k => TAB_OF[k] ?? 'scoping'),
  );
  const orgs = ws.parties.filter(p => p.type === 'organization');
  /** Changements qui touchent des tickets existants ou masquent une partie du tableau. */
  const risks = () => {
    const before = ws.settings.delivery;
    const used = (key: 'status' | 'type', id: string) => ws.tickets.filter(t => t[key] === id).length;
    const gone = <T extends { id: string; name: string }>(old: T[], next: T[], key: 'status' | 'type') =>
      old
        .filter(x => !next.some(y => y.id === x.id))
        .map(x => ({ name: x.name, n: used(key, x.id) }))
        .filter(x => x.n);
    return [
      ...(before.enabled && !d.enabled
        ? ['La partie Réalisation est désactivée : sprints, tickets et recette ne seront plus visibles.']
        : []),
      ...gone(before.workflow, d.workflow, 'status').map(
        x =>
          `L’étape « ${x.name} » est retirée alors que ${x.n} ticket(s) y sont : ils reviendront à la première étape.`,
      ),
      ...gone(before.ticketTypes, d.ticketTypes, 'type').map(
        x => `Le type « ${x.name} » est retiré alors que ${x.n} ticket(s) le portent.`,
      ),
      ...(before.key !== d.key && ws.tickets.length
        ? [
            `La clé des tickets passe de ${before.key} à ${d.key} : les nouveaux tickets porteront la nouvelle clé.`,
          ]
        : []),
    ];
  };
  const save = async () => {
    const warnings = risks();
    if (
      warnings.length &&
      !(await confirmDialog({
        title: 'Enregistrer ces réglages ?',
        message: warnings.join('\n'),
        confirmLabel: 'Enregistrer',
        danger: true,
      }))
    )
      return;
    setStatus('');
    try {
      await ws.updateSettings(draft);
      setStatus('Réglages enregistrés.');
    } catch (e) {
      setStatus(e instanceof ApiError ? `Réglages refusés : ${e.message}` : 'Erreur réseau, réessayez.');
    }
  };

  return (
    <div className={`${page.page} ${sideTabsPage}`}>
      <span className={page.icon} aria-hidden="true">
        🛠️
      </span>
      <h1 className={page.h1}>Réglages du projet</h1>
      <p className={page.lead}>Ce qui varie d’un projet à l’autre, rangé par rubrique.</p>

      <SideTabs
        tabs={TABS}
        current={tab}
        onSelect={selectTab}
        label="Rubriques des réglages"
        flagged={changed}
      >
        {tab === 'general' ? (
          <>
            <SettingsProject />
            <SettingsTemplate />
          </>
        ) : null}
        {tab === 'delivery' ? (
          <>
            <section className={styles.section}>
              <h2 className={page.h2}>Partie Réalisation</h2>
              <div className={styles.fields}>
                <label htmlFor="delivery-on">Activée</label>
                <span className={styles.checks}>
                  <label>
                    <input
                      id="delivery-on"
                      type="checkbox"
                      checked={d.enabled}
                      onChange={e => setD({ enabled: e.target.checked })}
                    />
                    Suivi des sprints et des tickets dans ce tableau
                  </label>
                </span>
                <label htmlFor="delivery-key">Clé des tickets</label>
                <span>
                  <input
                    id="delivery-key"
                    type="text"
                    value={d.key}
                    maxLength={10}
                    placeholder="ETO"
                    onChange={e => setD({ key: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                  />
                  <p className={styles.hint}>
                    Préfixe des tickets : {d.key || 'ETO'}-1, {d.key || 'ETO'}-2…
                  </p>
                </span>
                <label htmlFor="delivery-weeks">Durée des sprints</label>
                <select
                  id="delivery-weeks"
                  value={d.sprintWeeks}
                  onChange={e => setD({ sprintWeeks: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                    <option key={n} value={n}>
                      {n} semaine{n > 1 ? 's' : ''} (modifiable sprint par sprint)
                    </option>
                  ))}
                </select>
                <label htmlFor="delivery-estimation">Estimation</label>
                <select
                  id="delivery-estimation"
                  value={d.estimation}
                  onChange={e => setD({ estimation: e.target.value as Estimation })}
                >
                  {Object.entries(ESTIMATION_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className={styles.section}>
              <h2 className={page.h2}>Qui voit la Réalisation</h2>
              <div className={styles.fields}>
                <label>Rôles</label>
                <span className={styles.checks}>
                  {ROLES.map(r => (
                    <label key={r}>
                      <input
                        type="checkbox"
                        checked={r === 'admin' || v.roles.includes(r)}
                        disabled={r === 'admin'}
                        onChange={e =>
                          setV({ roles: toggle(v.roles, r, e.target.checked) as typeof v.roles })
                        }
                      />
                      {ROLE_LABEL[r]}
                      {r === 'admin' ? ' (toujours)' : ''}
                    </label>
                  ))}
                </span>
                <label>Organisations</label>
                <span>
                  <span className={styles.checks}>
                    {orgs.map(o => (
                      <label key={o.id}>
                        <input
                          type="checkbox"
                          checked={v.organizations.includes(o.id)}
                          onChange={e =>
                            setV({ organizations: toggle(v.organizations, o.id, e.target.checked) })
                          }
                        />
                        {o.short || o.name}
                      </label>
                    ))}
                  </span>
                  <p className={styles.hint}>
                    {orgs.length
                      ? 'Membres rattachés à ces organisations par leur fiche de personne, quel que soit leur rôle.'
                      : 'Créez les organisations dans Parties prenantes pour régler la visibilité par organisation.'}
                  </p>
                </span>
                {members.map(m => (
                  <MemberRule key={m.userId} member={m} visibility={v} onChange={setV} />
                ))}
              </div>
            </section>

            <section className={styles.section}>
              <h2 className={page.h2}>Étapes des tickets</h2>
              <EditableList
                items={d.workflow}
                onChange={workflow => setD({ workflow })}
                add={name => ({
                  id: uniqueId(
                    name,
                    d.workflow.map(s => s.id),
                  ),
                  name,
                  category: 'doing' as StepCategory,
                })}
                extra={(step, set) => (
                  <select
                    value={step.category}
                    aria-label="Catégorie"
                    onChange={e => set({ category: e.target.value as StepCategory })}
                  >
                    {Object.entries(STEP_CATEGORY_LABEL).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              />
              <p className={styles.hint}>
                La catégorie sert aux indicateurs : ce qui reste à faire, en cours, terminé.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={page.h2}>Types de tickets</h2>
              <EditableList
                items={d.ticketTypes}
                onChange={ticketTypes => setD({ ticketTypes })}
                add={name => ({
                  id: uniqueId(
                    name,
                    d.ticketTypes.map(t => t.id),
                  ),
                  name,
                })}
              />
            </section>

            <section className={styles.section}>
              <h2 className={page.h2}>Critères « prêt »</h2>
              <EditableList
                items={d.readiness}
                onChange={readiness => setD({ readiness })}
                add={name => ({
                  id: uniqueId(
                    name,
                    d.readiness.map(c => c.id),
                  ),
                  name,
                })}
              />
              <p className={styles.hint}>
                Ce qu’un ticket doit remplir avant d’entrer dans un sprint ; il doit aussi être estimé si le
                projet estime.
              </p>
            </section>
          </>
        ) : null}
        {tab === 'scoping' ? <SettingsCadrage part="scoping" draft={draft} setDraft={setDraft} /> : null}
        {tab === 'files' ? <SettingsFiles draft={draft} setDraft={setDraft} /> : null}
        {tab === 'integrations' ? (
          <>
            <SettingsCadrage part="mcp" draft={draft} setDraft={setDraft} />
            <SettingsAi />
          </>
        ) : null}

        {/* La rubrique Général s'enregistre par son propre bouton : la barre n'y paraît que s'il reste
            des modifications à enregistrer dans une autre rubrique. */}
        {tab !== 'general' || dirty ? (
          <p className={styles.saveBar}>
            {dirty ? <span className={page.faint}>Modifications non enregistrées</span> : null}
            <button
              type="button"
              className={page.ghost}
              disabled={!dirty}
              onClick={() => setDraft(ws.settings)}
            >
              Annuler
            </button>
            <button type="button" className={page.primary} disabled={!dirty} onClick={() => void save()}>
              Enregistrer les réglages
            </button>
          </p>
        ) : null}
        {status ? <p className={page.faint}>{status}</p> : null}
      </SideTabs>
    </div>
  );
}

/** Règle d'un membre : selon son rôle et son organisation, toujours, ou jamais. */
function MemberRule({
  member,
  visibility,
  onChange,
}: {
  member: Member;
  visibility: DeliverySettings['visibility'];
  onChange: (patch: Partial<DeliverySettings['visibility']>) => void;
}) {
  const id = member.userId;
  const value = visibility.allow.includes(id) ? 'allow' : visibility.deny.includes(id) ? 'deny' : 'rules';
  return (
    <>
      <label htmlFor={`rule-${id}`}>{member.name || member.email}</label>
      <select
        id={`rule-${id}`}
        value={member.role === 'admin' ? 'allow' : value}
        disabled={member.role === 'admin'}
        onChange={e =>
          onChange({
            allow: [...visibility.allow.filter(x => x !== id), ...(e.target.value === 'allow' ? [id] : [])],
            deny: [...visibility.deny.filter(x => x !== id), ...(e.target.value === 'deny' ? [id] : [])],
          })
        }
      >
        <option value="rules">Selon le rôle ({ROLE_LABEL[member.role]}) et l’organisation</option>
        <option value="allow">Toujours</option>
        <option value="deny">Jamais</option>
      </select>
    </>
  );
}
