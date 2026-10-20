import { useState } from 'react';
import { Link } from 'react-router-dom';
import { featureGroup, LINK_LABEL, LINK_TYPES, type LinkType, type Story } from '@board/shared';
import { useDrawer } from '../model/drawer';
import { similarStories } from '../model/similar';
import { useCanEdit, useWorkspace } from '../model/store';
import { StoryPicker } from '../ui/StoryPicker';
import { Tag } from '../ui/Tag';
import page from './Page.module.css';
import styles from '../ui/Relations.module.css';

/** Une US citée dans une liste : identifiant et titre ouvrent son aperçu dans le tiroir, statut. */
function StoryRef({ story, id, from }: { story?: Story; id: string; from: string }) {
  const open = useDrawer(s => s.open);
  return (
    <>
      <button type="button" className={styles.refOpen} title="Voir l’US liée" onClick={() => open(from, id)}>
        <span className={styles.code}>{id}</span>
        <span className={styles.refTitle}>{story ? story.title || 'Sans titre' : 'US supprimée'}</span>
      </button>
      <Link
        to={`/us/${id}`}
        className={styles.refGo}
        title="Ouvrir la fiche"
        aria-label={`Ouvrir la fiche ${id}`}
      >
        ↗
      </Link>
      {story ? <Tag value={story.status} /> : null}
    </>
  );
}

/**
 * Liaisons d'une US avec les autres : même fonctionnalité, doublon, dépendances, voir aussi.
 * Les US de même fonctionnalité forment un groupe, de proche en proche ; des US ressemblantes
 * sont proposées pour repérer les recoupements entre cas d'usage (UC) et exigences (EX).
 */
export function StoryLinks({ story }: { story: Story }) {
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const [type, setType] = useState<LinkType>('same');
  const byId = new Map(ws.stories.map(s => [s.id, s]));
  const direct = new Set(story.links.map(l => l.story));
  const group = featureGroup(ws.stories, story.id).filter(id => !direct.has(id));
  const suggestions = canEdit ? similarStories(ws.stories, story) : [];
  const link = (other: string, t: LinkType) => void ws.linkStories(story.id, other, t);

  return (
    <section aria-labelledby="links-title">
      <h2 id="links-title" className={page.h2}>
        Liaisons {story.links.length ? `(${story.links.length})` : ''}
      </h2>
      {LINK_TYPES.filter(t => story.links.some(l => l.type === t)).map(t => (
        <div key={t} className={styles.linkGroup}>
          <p className={styles.linkType}>{LINK_LABEL[t]}</p>
          <ul className={styles.refs}>
            {story.links
              .filter(l => l.type === t)
              .map(l => (
                <li key={l.story}>
                  <StoryRef id={l.story} story={byId.get(l.story)} from={story.id} />
                  {canEdit ? (
                    <span className={styles.rowActions}>
                      <select
                        aria-label={`Nature de la liaison avec ${l.story}`}
                        value={l.type}
                        onChange={e => link(l.story, e.target.value as LinkType)}
                      >
                        {LINK_TYPES.map(x => (
                          <option key={x} value={x}>
                            {LINK_LABEL[x]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={styles.remove}
                        aria-label={`Retirer la liaison avec ${l.story}`}
                        onClick={() => void ws.unlinkStories(story.id, l.story)}
                      >
                        ×
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
          </ul>
        </div>
      ))}
      {group.length ? (
        <div className={styles.linkGroup}>
          <p className={styles.linkType} title="Liées à une US de même fonctionnalité que celle-ci">
            Même fonctionnalité, par ricochet
          </p>
          <ul className={styles.refs}>
            {group.map(id => (
              <li key={id}>
                <StoryRef id={id} story={byId.get(id)} from={story.id} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!story.links.length && !group.length ? (
        <p className={page.faint}>Aucune liaison avec une autre US.</p>
      ) : null}

      {canEdit ? (
        <div className={styles.linkForm}>
          <select
            aria-label="Nature de la liaison"
            value={type}
            onChange={e => setType(e.target.value as LinkType)}
          >
            {LINK_TYPES.map(t => (
              <option key={t} value={t}>
                {LINK_LABEL[t]}
              </option>
            ))}
          </select>
          <StoryPicker label="Lier une US" exclude={[story.id, ...direct]} onPick={s => link(s.id, type)} />
        </div>
      ) : null}

      {suggestions.length ? (
        <div className={styles.suggestions}>
          <p className={styles.linkType}>US qui lui ressemblent</p>
          <ul className={styles.refs}>
            {suggestions.map(({ story: s, score }) => (
              <li key={s.id}>
                <StoryRef id={s.id} story={s} from={story.id} />
                <span className={styles.score} title="Part des mots du titre et du besoin en commun">
                  {Math.round(score * 100)} %
                </span>
                <span className={styles.rowActions}>
                  <button type="button" className={page.ghost} onClick={() => link(s.id, 'same')}>
                    Même fonctionnalité
                  </button>
                  <button type="button" className={page.ghost} onClick={() => link(s.id, 'related')}>
                    Voir aussi
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
