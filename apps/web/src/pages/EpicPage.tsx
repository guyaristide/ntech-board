import { Link, useNavigate, useParams } from 'react-router-dom';
import { programmeOrder, STATUSES, VERSIONS } from '@board/shared';
import { ApiError } from '../model/api';
import { programme } from '../model/programme';
import { useCanEdit, useWorkspace } from '../model/store';
import { BlockEditor } from '../ui/BlockEditor';
import { EditableText } from '../ui/EditableText';
import { ReferenceCard } from '../ui/ReferenceCard';
import { Tag } from '../ui/Tag';
import { StoryList } from './backlog/Backlog';
import page from './Page.module.css';
import styles from './Overview.module.css';

/** Page d'une épique (cas d'usage du CDC) : résumé, points à cadrer, US rattachées, notes. */
export function EpicPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const epic = ws.epics.find(e => e.id === id);
  if (!epic) {
    return (
      <div className={page.page}>
        <h1 className={page.h1}>Épique introuvable</h1>
        <Link to="/backlog">Retour au backlog</Link>
      </div>
    );
  }
  const stories = ws.stories.filter(s => s.epic === epic.id);
  const validated = stories.filter(s => s.status === 'Validée').length;
  // UC01 correspond à la fiche « UC 01 · … » de l'onglet Références CdC.
  const reference = ws.references.find(r => r.subject.startsWith(`UC ${epic.id.slice(2)} `));
  const set = (patch: Parameters<typeof ws.updateEpic>[1]) => ws.updateEpic(epic.id, patch);
  const free = programmeOrder(ws.workshops).filter(w => !epic.workshops.includes(w.id));
  const remove = async () => {
    if (!confirm(`Supprimer l’épique ${epic.id} ?`)) return;
    try {
      await programme.deleteEpic(epic.id);
      navigate('/backlog');
    } catch (e) {
      alert(e instanceof ApiError ? (e.message ?? e.code) : 'Suppression impossible.');
    }
  };
  return (
    <div className={`${page.page} ${page.wide}`}>
      <nav className={page.crumbs} aria-label="Fil d’Ariane">
        <Link to="/backlog">Backlog</Link> / <span>{epic.id}</span>
        {canEdit ? (
          <span className={page.actions}>
            <button
              type="button"
              className={`${page.ghost} ${page.danger}`}
              disabled={stories.length > 0}
              title={stories.length ? 'Déplacez ou supprimez d’abord ses US' : 'Supprimer l’épique'}
              onClick={() => void remove()}
            >
              Supprimer
            </button>
          </span>
        ) : null}
      </nav>
      <p className={page.kicker}>{epic.id}</p>
      <EditableText
        variant="title"
        multiline={false}
        value={epic.title}
        label="Titre de l’épique"
        placeholder="Titre de l’épique"
        onChange={title => set({ title })}
      />
      <EditableText
        value={epic.summary}
        label="Résumé"
        placeholder="Ce que couvre l’épique, en deux ou trois phrases"
        onChange={summary => set({ summary })}
      />
      <div className={page.props}>
        <span className={page.propLabel}>
          <span aria-hidden="true">⬢</span> Version
        </span>
        <div className={page.propValue}>
          {canEdit ? (
            <select
              value={epic.version}
              aria-label="Version"
              onChange={e => set({ version: e.target.value })}
            >
              {[...new Set([...VERSIONS, epic.version])].map(v => (
                <option key={v}>{v}</option>
              ))}
            </select>
          ) : (
            <Tag value={epic.version} />
          )}
        </div>
        <span className={page.propLabel}>
          <span aria-hidden="true">▦</span> Ateliers
        </span>
        <div className={`${page.propValue} ${styles.inline}`}>
          {epic.workshops.map(w => (
            <span key={w} className={styles.chip}>
              <Link to={`/atelier/${w}`}>
                {w} · {ws.workshops.find(x => x.id === w)?.title ?? 'atelier supprimé'}
              </Link>
              {canEdit ? (
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`Retirer ${w}`}
                  onClick={() => set({ workshops: epic.workshops.filter(x => x !== w) })}
                >
                  ✕
                </button>
              ) : null}
            </span>
          ))}
          {canEdit && free.length ? (
            <select
              value=""
              style={{ maxWidth: 260 }}
              aria-label="Ajouter un atelier"
              onChange={e => e.target.value && set({ workshops: [...epic.workshops, e.target.value] })}
            >
              <option value="">+ Atelier</option>
              {free.map(w => (
                <option key={w.id} value={w.id}>
                  {w.id} · {w.title}
                </option>
              ))}
            </select>
          ) : null}
          {!epic.workshops.length && !canEdit ? <span className={page.faint}>À définir</span> : null}
        </div>
        <span className={page.propLabel}>
          <span aria-hidden="true">§</span> Source
        </span>
        <div className={page.propValue}>
          <EditableText
            variant="inline"
            multiline={false}
            value={epic.source}
            label="Source"
            placeholder="Document et section d’origine"
            onChange={source => set({ source })}
          />
        </div>
        <span className={page.propLabel}>
          <span aria-hidden="true">◉</span> Avancement
        </span>
        <div className={`${page.propText} ${styles.inline}`}>
          {STATUSES.map(st => {
            const n = stories.filter(s => s.status === st).length;
            return n ? <Tag key={st} value={st}>{`${st} · ${n}`}</Tag> : null;
          })}
          <span className={page.faint}>
            {validated}/{stories.length} validées
          </span>
        </div>
      </div>

      {reference ? (
        <>
          <h2 className={page.h2}>Ce que dit le cahier des charges</h2>
          <ReferenceCard reference={reference} showSessions />
        </>
      ) : null}

      {epic.toFrame.length || canEdit ? (
        <>
          <h2 className={page.h2}>Points à cadrer en atelier</h2>
          {canEdit ? (
            <EditableText
              value={epic.toFrame.map(p => `- ${p}`).join('\n')}
              label="Points à cadrer"
              placeholder="Un point par ligne"
              onChange={v =>
                set({
                  toFrame: v
                    .split('\n')
                    .map(l => l.replace(/^\s*[-*•]\s*/, '').trim())
                    .filter(Boolean),
                })
              }
            />
          ) : (
            <ul className={page.list}>
              {epic.toFrame.map(p => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      <div className={styles.sectionHead}>
        <h2 className={page.h2}>User stories ({stories.length})</h2>
        {canEdit ? (
          <button
            type="button"
            className={page.primary}
            onClick={async () => navigate(`/us/${await ws.createStory(epic.id)}?nouvelle=1`)}
          >
            Nouvelle US
          </button>
        ) : null}
      </div>
      <StoryList stories={stories} />

      <h2 className={page.h2}>Notes de l’épique</h2>
      <BlockEditor blocks={epic.body} onChange={body => ws.updateEpic(epic.id, { body })} />
    </div>
  );
}
