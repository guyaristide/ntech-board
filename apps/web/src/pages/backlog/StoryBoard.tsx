import { useState } from 'react';
import { Link } from 'react-router-dom';
import { STATUSES, targetLabel } from '@board/shared';
import { useCanEdit, useWorkspace } from '../../model/store';
import type { Story, StoryStatus } from '@board/shared';
import { Tag } from '../../ui/Tag';
import styles from './Backlog.module.css';

/** Vue tableau Kanban par statut : glisser une carte change son statut. */
export function StoryBoard({ stories }: { stories: Story[] }) {
  const update = useWorkspace(s => s.updateStory);
  const canEdit = useCanEdit();
  const [over, setOver] = useState<StoryStatus | null>(null);
  return (
    <div className={styles.board}>
      {STATUSES.map(status => {
        const cards = stories.filter(s => s.status === status);
        return (
          <section
            key={status}
            className={styles.column}
            data-over={over === status || undefined}
            aria-label={status}
            onDragOver={e => {
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={() => setOver(o => (o === status ? null : o))}
            onDrop={e => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain');
              if (id) update(id, { status });
              setOver(null);
            }}
          >
            <header className={styles.columnHead}>
              <Tag value={status} /> <span className={styles.filterCount}>{cards.length}</span>
            </header>
            {cards.map(s => (
              <Link
                key={s.id}
                to={`/us/${s.id}`}
                className={styles.card}
                draggable={canEdit}
                onDragStart={e => e.dataTransfer.setData('text/plain', s.id)}
              >
                <strong>{s.title || 'Sans titre'}</strong>
                <span className={styles.cardMeta}>
                  <span className={styles.mono}>{s.id}</span>
                  <Tag value={s.version} />
                  <Tag value={s.priority} />
                </span>
                <span className={styles.cardActor}>{s.actor}</span>
                {s.targets.length ? (
                  <span className={styles.targets}>{s.targets.map(targetLabel).join(' · ')}</span>
                ) : null}
              </Link>
            ))}
          </section>
        );
      })}
    </div>
  );
}
