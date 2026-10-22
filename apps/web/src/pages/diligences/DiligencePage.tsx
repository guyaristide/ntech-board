import type { ReactNode } from 'react';
import { Attachments } from '../../ui/Attachments';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DILIGENCE_KIND_HINT, DILIGENCE_KINDS, DILIGENCE_STATUSES, type Diligence } from '@board/shared';
import { useCanEdit, useWorkspace } from '../../model/store';
import { BlockEditor } from '../../ui/BlockEditor';
import { Comments } from '../../ui/Comments';
import { EditableText } from '../../ui/EditableText';
import { History } from '../../ui/History';
import { PropertySelect } from '../../ui/PropertySelect';
import { StoryPicker } from '../../ui/StoryPicker';
import { Tag } from '../../ui/Tag';
import page from '../Page.module.css';
import relations from '../../ui/Relations.module.css';
import { partiesOf } from './Diligences';
import styles from './Diligences.module.css';

/** Identifiants rattachés (ateliers, risques) : étiquettes cliquables, retirables, ajout par liste. */
function IdChips({
  label,
  values,
  options,
  to,
  onChange,
}: {
  label: string;
  values: string[];
  options: { id: string; title: string }[];
  to: (id: string) => string;
  onChange: (next: string[]) => void;
}) {
  const canEdit = useCanEdit();
  const title = (id: string) => options.find(o => o.id === id)?.title ?? '';
  return (
    <div className={styles.links}>
      {values.map(id => (
        <span key={id} className={styles.chip}>
          <Link to={to(id)} title={title(id)}>
            <Tag value={id} />
          </Link>
          {canEdit ? (
            <button
              type="button"
              className={relations.remove}
              aria-label={`Retirer ${id}`}
              onClick={() => onChange(values.filter(v => v !== id))}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
      {canEdit ? (
        <select
          className={styles.select}
          aria-label={`Ajouter : ${label}`}
          value=""
          onChange={e => e.target.value && onChange([...values, e.target.value])}
        >
          <option value="">+ {label}</option>
          {options
            .filter(o => !values.includes(o.id))
            .map(o => (
              <option key={o.id} value={o.id}>
                {o.id} · {o.title}
              </option>
            ))}
        </select>
      ) : !values.length ? (
        <Tag value="" />
      ) : null}
    </div>
  );
}

/**
 * Fiche d'une diligence : ce qui est attendu, de qui, ce dont cela dépend, les US qu'elle
 * conditionne, le résultat obtenu, les notes et l'historique.
 */
export function DiligencePage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const d = ws.diligences.find(x => x.id === id);
  if (!d) {
    return (
      <div className={page.page}>
        <h1 className={page.h1}>Diligence introuvable</h1>
        <Link to="/diligences">Retour aux diligences</Link>
      </div>
    );
  }
  const set = (patch: Partial<Diligence>) => ws.updateDiligence(d.id, patch);
  const byId = new Map(ws.stories.map(s => [s.id, s]));
  const text = (value: string, label: string, placeholder: string, key: keyof Diligence) => (
    <EditableText
      variant="inline"
      multiline={false}
      value={value}
      label={label}
      placeholder={placeholder}
      onChange={v => set({ [key]: v })}
    />
  );

  const props: [string, string, ReactNode][] = [
    [
      '◉',
      'Statut',
      <PropertySelect
        label="Statut"
        value={d.status}
        options={DILIGENCE_STATUSES}
        onChange={v => v && set({ status: v as Diligence['status'] })}
      />,
    ],
    [
      '◆',
      'Type',
      <PropertySelect
        label="Type"
        value={d.kind}
        options={DILIGENCE_KINDS}
        render={v => `${v} · ${DILIGENCE_KIND_HINT[v as Diligence['kind']] ?? ''}`}
        onChange={v => v && set({ kind: v as Diligence['kind'] })}
      />,
    ],
    [
      '👤',
      'Responsable',
      <PropertySelect
        label="Responsable"
        value={d.owner}
        options={partiesOf(ws.diligences, ws.parties)}
        creatable
        onChange={owner => set({ owner })}
      />,
    ],
    [
      '⊕',
      'Avec',
      text(d.partners, 'Parties associées', 'Parties associées, séparées par des virgules', 'partners'),
    ],
    [
      '⇢',
      'Dépend de',
      text(d.dependency, 'Dépendance', 'Validation, accès, information attendue', 'dependency'),
    ],
    ['◷', 'Échéance', text(d.due, 'Échéance', 'AAAA-MM-JJ ou « Pendant les ateliers »', 'due')],
    [
      '▦',
      'Ateliers',
      <IdChips
        label="Atelier"
        values={d.workshops}
        options={ws.workshops.map(w => ({ id: w.id, title: w.title }))}
        to={w => `/atelier/${w}`}
        onChange={workshops => set({ workshops })}
      />,
    ],
    [
      '⚠',
      'Risques',
      <IdChips
        label="Risque"
        values={d.risks}
        options={ws.risks.map(r => ({ id: r.id, title: r.title }))}
        to={r => `/risque/${r}`}
        onChange={risks => set({ risks })}
      />,
    ],
    ['§', 'Source', text(d.source, 'Source', 'Compte rendu, PV, atelier', 'source')],
  ];

  return (
    <div className={page.page}>
      <nav className={page.crumbs} aria-label="Fil d’Ariane">
        <Link to="/diligences">Diligences</Link> / <span>{d.id}</span>
        {canEdit ? (
          <span className={page.actions}>
            <button
              type="button"
              className={`${page.ghost} ${page.danger}`}
              onClick={async () => {
                if (confirm(`Supprimer la diligence ${d.id} ?`)) {
                  await ws.deleteDiligence(d.id);
                  navigate('/diligences');
                }
              }}
            >
              Supprimer
            </button>
          </span>
        ) : null}
      </nav>

      <p className={page.kicker}>{d.id}</p>
      <EditableText
        variant="title"
        value={d.title}
        placeholder="Sans titre"
        label="Intitulé de la diligence"
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

      <h2 className={page.h2}>Ce qui est attendu</h2>
      <div className={styles.detail}>
        <EditableText
          value={d.detail}
          label="Détail de la diligence"
          placeholder="Contenu attendu, périmètre, critère de fin"
          onChange={detail => set({ detail })}
        />
      </div>

      <h2 className={page.h2}>US concernées ({d.stories.length})</h2>
      <ul className={relations.refs}>
        {d.stories.map(sid => {
          const s = byId.get(sid);
          return (
            <li key={sid}>
              <Link to={`/us/${sid}`} className={relations.code}>
                {sid}
              </Link>
              <span className={relations.refTitle}>{s ? s.title || 'Sans titre' : 'US supprimée'}</span>
              {s ? <Tag value={s.status} /> : null}
              {canEdit ? (
                <button
                  type="button"
                  className={relations.remove}
                  aria-label={`Retirer ${sid}`}
                  onClick={() => set({ stories: d.stories.filter(x => x !== sid) })}
                >
                  ×
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!d.stories.length ? <p className={page.faint}>Aucune US rattachée.</p> : null}
      {canEdit ? (
        <StoryPicker
          label="Rattacher une US"
          exclude={d.stories}
          onPick={s => set({ stories: [...d.stories, s.id] })}
        />
      ) : null}

      <h2 className={page.h2}>Résultat</h2>
      <EditableText
        value={d.outcome}
        label="Résultat"
        placeholder="Livrable remis, décision prise, lien vers le document"
        onChange={outcome => set({ outcome })}
      />

      <h2 className={page.h2}>Notes</h2>
      <BlockEditor
        blocks={d.notes}
        onChange={notes => set({ notes })}
        placeholder="Avancement, échanges avec les parties… Tapez « / » pour choisir un bloc"
      />

      <h2 className={page.h2}>Pièces jointes</h2>
      <Attachments kind="diligence" id={d.id} />
      <h2 className={page.h2}>Commentaires</h2>
      <Comments items={d.comments} onAdd={t => void ws.commentDiligence(d.id, t)} />
      <History kind="diligence" id={d.id} stamp={`${d.status}-${d.comments.length}-${d.stories.length}`} />
    </div>
  );
}
