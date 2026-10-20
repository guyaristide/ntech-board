import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LINK_LABEL, LINK_TYPES, targetLabel, type Story } from '@board/shared';
import { useDrawer } from '../model/drawer';
import { useWorkspace } from '../model/store';
import { Markdown } from './Markdown';
import { Tag } from './Tag';
import styles from './StoryDrawer.module.css';

/** Aperçu d'une US dans le tiroir : en-tête, récit, description, critères, plateformes, liaisons. */
function Preview({ story }: { story: Story }) {
  const stories = useWorkspace(s => s.stories);
  const epic = useWorkspace(s => s.epics.find(e => e.id === story.epic));
  const show = useDrawer(s => s.show);
  const byId = new Map(stories.map(s => [s.id, s]));
  return (
    <article className={styles.preview}>
      <p className={styles.kicker}>
        {story.id}
        {epic ? (
          <>
            {' · '}
            <Link to={`/epic/${epic.id}`}>
              {epic.id} {epic.title}
            </Link>
          </>
        ) : null}
      </p>
      <h2 className={styles.title}>{story.title || 'Sans titre'}</h2>
      <p className={styles.tags}>
        <Tag value={story.status} />
        <Tag value={story.version} />
        <Tag value={story.priority} />
        {story.actor ? <Tag value={story.actor} /> : null}
      </p>
      {story.asA || story.iWant ? (
        <p className={styles.story}>
          En tant que <strong>{story.asA || '…'}</strong>, je veux {story.iWant || '…'}
          {story.soThat ? `, afin de ${story.soThat}` : ''}.
        </p>
      ) : null}
      {story.description ? <Markdown text={story.description} className={styles.description} /> : null}
      {story.acceptance.length ? (
        <>
          <h3 className={styles.h3}>Critères d’acceptation</h3>
          <ul className={styles.criteria}>
            {story.acceptance.map(c => (
              <li key={c.id} data-done={c.done || undefined}>
                {c.text}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {(story.targets ?? []).length ? (
        <>
          <h3 className={styles.h3}>Plateformes</h3>
          <p className={styles.tags}>
            {story.targets.map(t => (
              <span key={targetLabel(t)} className={styles.chip}>
                {targetLabel(t)}
              </span>
            ))}
          </p>
        </>
      ) : null}
      {story.links.length ? (
        <>
          <h3 className={styles.h3}>Ses liaisons</h3>
          <ul className={styles.links}>
            {story.links.map(l => (
              <li key={l.story}>
                <span className={styles.linkType}>{LINK_LABEL[l.type]}</span>
                <button type="button" className={styles.linkButton} onClick={() => show(l.story)}>
                  <span className={styles.code}>{l.story}</span> {byId.get(l.story)?.title || 'US supprimée'}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}

/**
 * Tiroir latéral : aperçu des US liées sans quitter la page. En tête, les liaisons de l'US
 * d'origine ; en dessous, l'US choisie. Échap ou un clic à côté le ferment.
 */
export function StoryDrawer() {
  const { origin, stack, show, back, close } = useDrawer();
  const stories = useWorkspace(s => s.stories);
  const location = useLocation();
  const panel = useRef<HTMLDivElement>(null);
  const current = stack.at(-1);
  // Changer de page ferme le tiroir.
  useEffect(() => close(), [location.pathname, close]);
  useEffect(() => {
    if (!origin) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [origin, close]);
  if (!origin || !current) return null;
  const from = stories.find(s => s.id === origin);
  const story = stories.find(s => s.id === current);
  const links = from ? LINK_TYPES.flatMap(t => from.links.filter(l => l.type === t)) : [];
  return (
    <>
      <button type="button" className={styles.scrim} aria-label="Fermer l’aperçu" onClick={close} />
      <div
        ref={panel}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={`Aperçu de ${current}`}
        tabIndex={-1}
      >
        <header className={styles.head}>
          {stack.length > 1 ? (
            <button
              type="button"
              className={styles.icon}
              onClick={back}
              aria-label="Revenir à l’US précédente"
            >
              ←
            </button>
          ) : null}
          <span className={styles.headTitle}>Liaisons de {origin}</span>
          <Link to={`/us/${current}`} className={styles.open}>
            Ouvrir la fiche ↗
          </Link>
          <button type="button" className={styles.icon} onClick={close} aria-label="Fermer">
            ✕
          </button>
        </header>
        {links.length > 1 ? (
          <nav className={styles.tabs} aria-label="US liées">
            {links.map(l => (
              <button
                key={l.story}
                type="button"
                className={styles.tab}
                data-on={l.story === current || undefined}
                title={`${LINK_LABEL[l.type]} · ${stories.find(s => s.id === l.story)?.title ?? ''}`}
                onClick={() => show(l.story)}
              >
                <span className={styles.tabType}>{LINK_LABEL[l.type]}</span> {l.story}
              </button>
            ))}
          </nav>
        ) : null}
        <div className={styles.body}>
          {story ? <Preview story={story} /> : <p className={styles.missing}>Cette US a été supprimée.</p>}
        </div>
      </div>
    </>
  );
}
