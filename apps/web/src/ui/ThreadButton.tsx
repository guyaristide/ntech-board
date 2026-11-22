import { commentCount } from '@board/shared';
import { useWorkspace } from '../model/store';
import { useThreadDrawer, type ThreadTarget } from '../model/threadDrawer';
import styles from './Thread.module.css';

/** « 💬 3 » : nombre de messages d'un élément ; ouvre son fil dans le tiroir. */
export function ThreadButton({
  always,
  labelled,
  ...target
}: ThreadTarget & { always?: boolean; labelled?: boolean }) {
  const count = useWorkspace(s => commentCount(s.comments, target.kind, target.id));
  const files = useWorkspace(s =>
    target.files
      ? s.attachments.filter(a => a.owner.kind === target.kind && a.owner.id === target.id).length
      : 0,
  );
  const open = useThreadDrawer(s => s.open);
  if (!count && !always) return null;
  return (
    <button
      type="button"
      className={styles.open}
      data-count={count || undefined}
      title={
        target.files
          ? 'Pièces jointes et discussion'
          : count
            ? `Discussion : ${count} message${count > 1 ? 's' : ''}`
            : 'Ouvrir une discussion'
      }
      aria-label={`Discussion sur ${target.title}${count ? ` (${count} message${count > 1 ? 's' : ''})` : ''}`}
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        open(target);
      }}
    >
      💬{labelled ? ` Discussion${count ? ` (${count})` : ''}` : count ? ` ${count}` : ''}
      {files ? ` · 📎 ${files}` : ''}
    </button>
  );
}
