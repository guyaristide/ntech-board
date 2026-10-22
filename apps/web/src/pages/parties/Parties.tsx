import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { mentionsOf, PARTY_LABEL, type Member, type Party, type PartyType } from '@board/shared';
import { api } from '../../model/api';
import { useCanEdit, useIsAdmin, useWorkspace } from '../../model/store';
import { EditableText } from '../../ui/EditableText';
import { ExportButton, type Column } from '../../ui/ExportButton';
import { PropertySelect } from '../../ui/PropertySelect';
import page from '../Page.module.css';
import backlog from '../backlog/Backlog.module.css';
import { Mentions } from './Mentions';
import styles from './Parties.module.css';

type Tab = PartyType | 'reprise';
const TABS: [Tab, string][] = [
  ['organization', 'Organisations'],
  ['person', 'Personnes'],
  ['role', 'Rôles'],
  ['reprise', 'Reprise de l’existant'],
];

/** Alias saisis séparés par des virgules. */
const aliasList = (text: string) => [
  ...new Set(
    text
      .split(',')
      .map(a => a.trim())
      .filter(Boolean),
  ),
];

/** Cellule de texte modifiable sur place. */
function Cell({ party, field, label }: { party: Party; field: keyof Party; label: string }) {
  const ws = useWorkspace();
  return (
    <EditableText
      variant="inline"
      multiline={false}
      value={String(party[field] ?? '')}
      label={label}
      placeholder="—"
      onChange={v => ws.updateParty(party.id, { [field]: v.trim() })}
    />
  );
}

function Aliases({ party }: { party: Party }) {
  const ws = useWorkspace();
  return (
    <EditableText
      variant="inline"
      multiline={false}
      value={party.aliases.join(', ')}
      label="Autres écritures, séparées par des virgules"
      placeholder="—"
      onChange={v => ws.updateParty(party.id, { aliases: aliasList(v) })}
    />
  );
}

/** Liste de choix d'une partie (organisation, personne) par identifiant. */
function PartyRef({
  party,
  field,
  of,
  label,
}: {
  party: Party;
  field: 'organization' | 'holder';
  of: PartyType;
  label: string;
}) {
  const ws = useWorkspace();
  const choices = ws.parties.filter(p => p.type === of);
  const name = (id: string) => choices.find(p => p.id === id)?.name || id;
  return (
    <PropertySelect
      label={label}
      value={party[field]}
      options={['', ...choices.map(p => p.id)]}
      render={id => (id ? name(id) : 'Aucune')}
      onChange={v => ws.updateParty(party.id, { [field]: v })}
    />
  );
}

function Remove({ party }: { party: Party }) {
  const ws = useWorkspace();
  const used = ws.parties.filter(p => p.organization === party.id || p.holder === party.id).length;
  return (
    <button
      type="button"
      className={`${page.ghost} ${page.danger}`}
      title="Supprimer"
      aria-label={`Supprimer ${party.name || party.id}`}
      onClick={() =>
        confirm(
          `Supprimer « ${party.name || party.id} » du référentiel ?${used ? ` ${used} fiche(s) y sont rattachées.` : ''} Les textes déjà saisis ailleurs ne changent pas.`,
        ) && void ws.deleteParty(party.id)
      }
    >
      ✕
    </button>
  );
}

/** Tableau d'un type de partie, colonnes selon le type. */
function PartyTable({ type, members }: { type: PartyType; members: Member[] | null }) {
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const rows = ws.parties.filter(p => p.type === type);
  const orgName = (id: string) => ws.parties.find(p => p.id === id)?.name ?? '';
  const columns: [string, number | undefined, (p: Party) => ReactNode][] =
    type === 'organization'
      ? [
          ['Sigle', 90, p => <Cell party={p} field="short" label="Sigle" />],
          ['Nom', undefined, p => <Cell party={p} field="name" label="Nom" />],
          [
            'Type',
            170,
            p => (
              <PropertySelect
                label="Type d’organisation"
                value={p.category}
                options={ws.settings.organizationTypes}
                creatable
                onChange={category => ws.updateParty(p.id, { category })}
              />
            ),
          ],
          [
            'Rattachés',
            90,
            p =>
              ws.parties.filter(x => x.organization === p.id).length || <span className={page.faint}>—</span>,
          ],
        ]
      : type === 'person'
        ? [
            ['Nom', 170, p => <Cell party={p} field="name" label="Nom" />],
            ['Fonction', undefined, p => <Cell party={p} field="function" label="Fonction" />],
            [
              'Organisation',
              170,
              p => <PartyRef party={p} field="organization" of="organization" label="Organisation" />,
            ],
            ['E-mail', 180, p => <Cell party={p} field="email" label="E-mail" />],
            ['Téléphone', 130, p => <Cell party={p} field="phone" label="Téléphone" />],
            ...(members
              ? ([
                  [
                    'Compte',
                    160,
                    p => (
                      <PropertySelect
                        label="Compte du tableau"
                        value={p.userId ?? ''}
                        options={['', ...members.map(m => m.userId)]}
                        render={id => (id ? (members.find(m => m.userId === id)?.email ?? id) : 'Aucun')}
                        onChange={v => ws.updateParty(p.id, { userId: v || null })}
                      />
                    ),
                  ],
                ] as typeof columns)
              : []),
          ]
        : [
            ['Rôle', undefined, p => <Cell party={p} field="name" label="Rôle" />],
            [
              'Organisation',
              190,
              p => <PartyRef party={p} field="organization" of="organization" label="Organisation" />,
            ],
            ['Tenu par', 190, p => <PartyRef party={p} field="holder" of="person" label="Tenu par" />],
          ];
  return (
    <div className={backlog.tableWrap}>
      <table className={backlog.table}>
        <colgroup>
          <col style={{ width: 70 }} />
          {columns.map(([title, w]) => (
            <col key={title} style={w ? { width: w } : undefined} />
          ))}
          <col style={{ width: 200 }} />
          {canEdit ? <col style={{ width: 40 }} /> : null}
        </colgroup>
        <thead>
          <tr>
            <th>ID</th>
            {columns.map(([title]) => (
              <th key={title}>{title}</th>
            ))}
            <th title="Autres écritures reconnues comme ce nom">Alias</th>
            {canEdit ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr
              key={p.id}
              title={type !== 'organization' && p.organization ? orgName(p.organization) : undefined}
            >
              <td className={backlog.mono}>{p.id}</td>
              {columns.map(([title, , render]) => (
                <td key={title}>{render(p)}</td>
              ))}
              <td>
                <Aliases party={p} />
              </td>
              {canEdit ? (
                <td>
                  <Remove party={p} />
                </td>
              ) : null}
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={columns.length + 3} className={backlog.empty}>
                Aucune {PARTY_LABEL[type].toLowerCase()} pour le moment.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/** Colonnes d'export d'un type de partie, avec les noms à la place des identifiants. */
function exportColumns(type: PartyType, parties: Party[], members: Member[] | null): Column<Party>[] {
  const name = (id: string) => parties.find(p => p.id === id)?.name ?? id;
  const aliases: Column<Party> = ['Alias', p => p.aliases.join(', ')];
  if (type === 'organization')
    return [
      ['ID', p => p.id],
      ['Sigle', p => p.short],
      ['Nom', p => p.name],
      ['Type', p => p.category],
      ['Rattachés', p => parties.filter(x => x.organization === p.id).length],
      aliases,
    ];
  if (type === 'person')
    return [
      ['ID', p => p.id],
      ['Nom', p => p.name],
      ['Fonction', p => p.function],
      ['Organisation', p => name(p.organization)],
      ['E-mail', p => p.email],
      ['Téléphone', p => p.phone],
      ...(members
        ? [['Compte', p => members.find(m => m.userId === p.userId)?.email ?? ''] as Column<Party>]
        : []),
      aliases,
    ];
  return [
    ['ID', p => p.id],
    ['Rôle', p => p.name],
    ['Organisation', p => name(p.organization)],
    ['Tenu par', p => name(p.holder)],
    aliases,
  ];
}

const EXPORT_NAME: Record<PartyType, [string, string]> = {
  organization: ['organisations', 'organisations'],
  person: ['personnes', 'personnes'],
  role: ['roles', 'rôles'],
};

/**
 * Référentiel des parties prenantes du projet : organisations, personnes et rôles, auxquels
 * renvoient le RACI, les risques, les diligences et les séquences d'atelier.
 */
export function Parties() {
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const admin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([t]) => t === params.get('vue'))?.[0] ?? 'organization') as Tab;
  const [members, setMembers] = useState<Member[] | null>(null);
  useEffect(() => {
    if (admin) api.get<Member[]>('/admin/members').then(setMembers, () => setMembers(null));
  }, [admin]);
  const pending = mentionsOf(ws, ws.parties).filter(m => !m.party).length;
  const count = (t: Tab) => (t === 'reprise' ? pending : ws.parties.filter(p => p.type === t).length);

  return (
    <div className={`${page.page} ${page.wide}`}>
      <span className={page.icon} aria-hidden="true">
        👥
      </span>
      <h1 className={page.h1}>Parties prenantes</h1>
      <p className={page.lead}>
        Organisations, personnes et rôles du projet. Le RACI, les risques, les diligences et les séquences
        d’atelier y renvoient : un nom, un sigle ou un alias suffit à les reconnaître.
      </p>
      <div className={backlog.toolbar}>
        <div className={backlog.views} role="tablist" aria-label="Vue">
          {TABS.map(([t, label]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={backlog.view}
              onClick={() => setParams(t === 'organization' ? {} : { vue: t })}
            >
              {label} <span className={styles.count}>{count(t)}</span>
            </button>
          ))}
        </div>
        {tab !== 'reprise' ? (
          <span className={page.actions}>
            <ExportButton
              name={`parties-${EXPORT_NAME[tab][0]}`}
              rows={ws.parties.filter(p => p.type === tab)}
              columns={exportColumns(tab, ws.parties, members)}
              noun={EXPORT_NAME[tab][1]}
            />
            {canEdit ? (
              <button
                type="button"
                className={page.primary}
                onClick={() => void ws.createParty(tab, { name: '' })}
              >
                + {PARTY_LABEL[tab]}
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {tab === 'reprise' ? <Mentions /> : <PartyTable type={tab} members={members} />}
    </div>
  );
}
