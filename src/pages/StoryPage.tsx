import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { storyMarkdown } from '../model/exporters';
import { PRIORITIES, SCENARIO_LABEL, SCENARIOS, STATUSES, VERSIONS } from '../model/options';
import { useWorkspace } from '../model/store';
import type { Story } from '../model/types';
import { BlockEditor } from '../ui/BlockEditor';
import { Checklist } from '../ui/Checklist';
import { Comments } from '../ui/Comments';
import { EditableText } from '../ui/EditableText';
import { PropertySelect } from '../ui/PropertySelect';
import page from './Page.module.css';

const BASE_ACTORS = [
  'Touriste',
  'Touriste diaspora',
  'Touriste international',
  'Touriste corporate',
  'Opérateur',
  'Hébergeur',
  'Restaurateur',
  'Guide',
  'Complexe multiservice',
  'Artisan',
  'Fournisseur B2B',
  'Agence / tour-opérateur',
  'Livreur',
  'Ministère',
  'SIVIS',
  'Administrateur régional',
  'Partenaire institutionnel',
  'Agent de support',
  'Administrateur plateforme',
  'Système',
];

const updated = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Page d'une user story : propriétés, récit, critères d'acceptation, notes libres et commentaires. */
export function StoryPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const story = ws.stories.find(s => s.id === id);
  const [copied, setCopied] = useState(false);
  if (!story) {
    return (
      <div className={page.page}>
        <h1 className={page.h1}>US introuvable</h1>
        <p className={page.muted}>
          <Link to="/backlog">Retour au backlog</Link>
        </p>
      </div>
    );
  }
  const epic = ws.epics.find(e => e.id === story.epic);
  const workshop = ws.workshops.find(w => w.id === story.workshop);
  const set = (patch: Partial<Story>) => ws.updateStory(story.id, patch);
  const actors = [...new Set([...BASE_ACTORS, ...ws.stories.map(s => s.actor)])].filter(Boolean);
  const siblings = ws.stories.filter(s => s.epic === story.epic);
  const pos = siblings.findIndex(s => s.id === story.id);
  const copy = async () => {
    await navigator.clipboard.writeText(storyMarkdown(story));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const props: [string, string, ReactNode][] = [
    [
      '◉',
      'Statut',
      <PropertySelect
        label="Statut"
        value={story.status}
        options={STATUSES}
        onChange={v => set({ status: v as Story['status'] })}
      />,
    ],
    [
      '👤',
      'Acteur',
      <PropertySelect
        label="Acteur"
        value={story.actor}
        options={actors}
        creatable
        onChange={v => set({ actor: v })}
      />,
    ],
    [
      '◆',
      'Épique',
      <PropertySelect
        label="Épique"
        value={story.epic}
        options={ws.epics.map(e => e.id)}
        render={v => `${v} · ${ws.epics.find(e => e.id === v)?.title ?? ''}`}
        onChange={v => v && set({ epic: v })}
      />,
    ],
    [
      '⬢',
      'Version',
      <PropertySelect
        label="Version"
        value={story.version}
        options={VERSIONS}
        onChange={v => set({ version: v as Story['version'] })}
      />,
    ],
    [
      '▦',
      'Atelier',
      <PropertySelect
        label="Atelier"
        value={story.workshop}
        options={ws.workshops.map(w => w.id)}
        render={v => `${v} · ${ws.workshops.find(w => w.id === v)?.title ?? ''}`}
        onChange={v => set({ workshop: v })}
      />,
    ],
    [
      '!',
      'Priorité',
      <PropertySelect
        label="Priorité"
        value={story.priority}
        options={PRIORITIES}
        onChange={v => set({ priority: v as Story['priority'] })}
      />,
    ],
    [
      '↳',
      'Scénario',
      <PropertySelect
        label="Scénario"
        value={story.scenario}
        options={SCENARIOS}
        render={v => SCENARIO_LABEL[v as Story['scenario']] ?? v}
        onChange={v => v && set({ scenario: v as Story['scenario'] })}
      />,
    ],
    [
      '§',
      'Source',
      <EditableText
        variant="inline"
        value={story.source}
        placeholder="Référence CDC (section, page)"
        multiline={false}
        onChange={source => set({ source })}
      />,
    ],
  ];

  return (
    <div className={page.page}>
      <nav className={page.crumbs} aria-label="Fil d’Ariane">
        <Link to="/backlog">Backlog</Link> /
        <Link to={`/epic/${story.epic}`}>{epic ? `${epic.id} ${epic.title}` : story.epic}</Link> /
        <span>{story.id}</span>
        <span className={page.actions}>
          {pos > 0 ? (
            <button
              type="button"
              className={page.ghost}
              onClick={() => navigate(`/us/${siblings[pos - 1].id}`)}
              title="US précédente"
            >
              ↑
            </button>
          ) : null}
          {pos < siblings.length - 1 ? (
            <button
              type="button"
              className={page.ghost}
              onClick={() => navigate(`/us/${siblings[pos + 1].id}`)}
              title="US suivante"
            >
              ↓
            </button>
          ) : null}
          <button type="button" className={page.ghost} onClick={copy}>
            {copied ? 'Copié' : 'Copier en Markdown'}
          </button>
          <button
            type="button"
            className={page.ghost}
            onClick={() => {
              const copyId = ws.duplicateStory(story.id);
              if (copyId) navigate(`/us/${copyId}`);
            }}
          >
            Dupliquer
          </button>
          <button
            type="button"
            className={`${page.ghost} ${page.danger}`}
            onClick={() => {
              if (confirm(`Supprimer ${story.id} ?`)) {
                ws.deleteStory(story.id);
                navigate(`/epic/${story.epic}`);
              }
            }}
          >
            Supprimer
          </button>
        </span>
      </nav>

      <p className={page.kicker}>
        {story.id}
        {story.derived ? ' · déduite du CDC' : ''}
      </p>
      <EditableText
        variant="title"
        value={story.title}
        placeholder="Sans titre"
        label="Titre de l’US"
        multiline={false}
        autoFocus={params.has('nouvelle')}
        onChange={title => set({ title })}
      />

      <div className={page.props}>
        {props.map(([icon, label, value]) => (
          <div key={label} style={{ display: 'contents' }}>
            <span className={page.propLabel}>
              <span aria-hidden="true">{icon}</span> {label}
            </span>
            <div className={page.propValue}>{value}</div>
          </div>
        ))}
      </div>

      <Comments items={story.comments} onAdd={text => ws.commentStory(story.id, text)} />

      <h2 className={page.h2}>Récit</h2>
      <div className={page.story}>
        <span>En tant que</span>
        <EditableText value={story.asA} placeholder="profil utilisateur" onChange={asA => set({ asA })} />
        <span>je veux</span>
        <EditableText value={story.iWant} placeholder="le besoin" onChange={iWant => set({ iWant })} />
        <span>afin de</span>
        <EditableText
          value={story.soThat}
          placeholder="le bénéfice attendu"
          onChange={soThat => set({ soThat })}
        />
      </div>

      <h2 className={page.h2}>Critères d’acceptation</h2>
      <Checklist items={story.acceptance} onChange={acceptance => set({ acceptance })} />

      <h2 className={page.h2}>Notes et enrichissements</h2>
      <BlockEditor
        blocks={story.body}
        onChange={body => set({ body })}
        placeholder="Notes d’atelier, règles de gestion, maquettes à prévoir… Tapez « / » pour choisir un bloc"
      />

      <hr className={page.divider} />
      <p className={page.faint}>
        {workshop ? (
          <>
            Cadrée en{' '}
            <Link to={`/atelier/${workshop.id}`}>
              {workshop.id} · {workshop.title}
            </Link>
            .{' '}
          </>
        ) : null}
        Modifiée le {updated(story.updatedAt)}.
      </p>
    </div>
  );
}
