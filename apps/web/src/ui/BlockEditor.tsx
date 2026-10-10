import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { uid } from '../model/ids';
import type { Block, BlockType } from '@board/shared';
import { useCanEdit } from '../model/store';
import { useAutosize } from './useAutosize';
import styles from './BlockEditor.module.css';

const TYPES: { type: BlockType; label: string; hint: string; icon: string }[] = [
  { type: 'p', label: 'Texte', hint: 'Paragraphe simple', icon: 'Aa' },
  { type: 'h2', label: 'Titre', hint: 'Raccourci : #', icon: 'H1' },
  { type: 'h3', label: 'Sous-titre', hint: 'Raccourci : ##', icon: 'H2' },
  { type: 'bullet', label: 'Liste à puces', hint: 'Raccourci : -', icon: '•' },
  { type: 'todo', label: 'Case à cocher', hint: 'Raccourci : []', icon: '☐' },
  { type: 'quote', label: 'Citation', hint: 'Raccourci : >', icon: '❝' },
  { type: 'callout', label: 'Encadré', hint: 'Raccourci : !', icon: '💡' },
];
const SHORTCUTS: [string, BlockType][] = [
  ['## ', 'h3'],
  ['# ', 'h2'],
  ['- ', 'bullet'],
  ['* ', 'bullet'],
  ['[] ', 'todo'],
  ['> ', 'quote'],
  ['! ', 'callout'],
];
/** Les listes se poursuivent sur Entrée ; les autres blocs repartent en texte. */
const CONTINUES: BlockType[] = ['bullet', 'todo'];

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  placeholder?: string;
}

/** Éditeur de blocs : Entrée crée un bloc, « / » change son type, raccourcis Markdown en début de ligne. */
export function BlockEditor({
  blocks,
  onChange,
  placeholder = 'Écrivez, ou tapez « / » pour choisir un bloc',
}: Props) {
  const canEdit = useCanEdit();
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const [focus, setFocus] = useState<{ id: string; caret: 'start' | 'end' } | null>(null);
  const [menu, setMenu] = useState<{ id: string; active: number } | null>(null);

  useEffect(() => {
    if (!focus) return;
    const el = refs.current.get(focus.id);
    if (!el) return;
    el.focus();
    const pos = focus.caret === 'start' ? 0 : el.value.length;
    el.setSelectionRange(pos, pos);
    setFocus(null);
  }, [focus, blocks]);

  const update = (id: string, patch: Partial<Block>) =>
    onChange(blocks.map(b => (b.id === id ? { ...b, ...patch } : b)));
  const insertAfter = (index: number, block: Block) => {
    const next = [...blocks];
    next.splice(index + 1, 0, block);
    onChange(next);
    setFocus({ id: block.id, caret: 'start' });
  };

  const setText = (block: Block, text: string) => {
    if (block.type === 'p' && text === '/') {
      setMenu({ id: block.id, active: 0 });
    } else if (menu?.id === block.id && !text.startsWith('/')) {
      setMenu(null);
    }
    const shortcut = block.type === 'p' ? SHORTCUTS.find(([prefix]) => text.startsWith(prefix)) : undefined;
    if (shortcut) update(block.id, { type: shortcut[1], text: text.slice(shortcut[0].length) });
    else update(block.id, { text });
  };

  const choose = (block: Block, type: BlockType) => {
    update(block.id, { type, text: block.text.replace(/^\/\S*/, '') });
    setMenu(null);
    setFocus({ id: block.id, caret: 'end' });
  };

  const menuItems = (block: Block) => {
    const q = block.text.slice(1).toLowerCase();
    return TYPES.filter(t => t.label.toLowerCase().includes(q));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, block: Block, index: number) => {
    if (menu?.id === block.id) {
      const items = menuItems(block);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        setMenu({ id: block.id, active: (menu.active + delta + items.length) % Math.max(items.length, 1) });
        return;
      }
      if (e.key === 'Enter' && items[menu.active]) {
        e.preventDefault();
        choose(block, items[menu.active].type);
        return;
      }
      if (e.key === 'Escape') {
        setMenu(null);
        return;
      }
    }
    const el = e.currentTarget;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Entrée sur une puce vide : on sort de la liste.
      if (!block.text && block.type !== 'p') {
        update(block.id, { type: 'p' });
        return;
      }
      const before = block.text.slice(0, el.selectionStart);
      const after = block.text.slice(el.selectionEnd);
      const created: Block = {
        id: uid(),
        type: CONTINUES.includes(block.type) ? block.type : 'p',
        text: after,
      };
      const next = blocks.map(b => (b.id === block.id ? { ...b, text: before } : b));
      next.splice(index + 1, 0, created);
      onChange(next);
      setFocus({ id: created.id, caret: 'start' });
    } else if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (block.type !== 'p') {
        e.preventDefault();
        update(block.id, { type: 'p' });
      } else if (index > 0) {
        e.preventDefault();
        const prev = blocks[index - 1];
        const caretAt = prev.text.length;
        onChange(
          blocks
            .filter(b => b.id !== block.id)
            .map(b => (b.id === prev.id ? { ...b, text: b.text + block.text } : b)),
        );
        requestAnimationFrame(() => {
          const p = refs.current.get(prev.id);
          if (p) {
            p.focus();
            p.setSelectionRange(caretAt, caretAt);
          }
        });
      }
    } else if (e.key === 'ArrowUp' && el.selectionStart === 0 && index > 0) {
      e.preventDefault();
      setFocus({ id: blocks[index - 1].id, caret: 'end' });
    } else if (e.key === 'ArrowDown' && el.selectionEnd === el.value.length && index < blocks.length - 1) {
      e.preventDefault();
      setFocus({ id: blocks[index + 1].id, caret: 'start' });
    }
  };

  return (
    <div className={styles.editor}>
      {blocks.map((block, index) => {
        return (
          <div key={block.id} className={styles.row} data-type={block.type}>
            {canEdit ? (
              <button
                type="button"
                className={styles.handle}
                aria-label="Supprimer le bloc"
                title="Supprimer le bloc"
                onClick={() => onChange(blocks.filter(b => b.id !== block.id))}
              >
                ×
              </button>
            ) : null}
            {block.type === 'bullet' ? <span className={styles.bullet}>•</span> : null}
            {block.type === 'todo' ? (
              <input
                type="checkbox"
                className={styles.todo}
                checked={!!block.checked}
                disabled={!canEdit}
                aria-label="Fait"
                onChange={e => update(block.id, { checked: e.target.checked })}
              />
            ) : null}
            {block.type === 'callout' ? <span className={styles.calloutIcon}>💡</span> : null}
            <BlockText
              block={block}
              readOnly={!canEdit}
              register={el => (el ? refs.current.set(block.id, el) : refs.current.delete(block.id))}
              placeholder={
                index === blocks.length - 1 && blocks.length === 1
                  ? placeholder
                  : TYPES.find(t => t.type === block.type)?.label
              }
              onText={text => setText(block, text)}
              onKeyDown={e => onKeyDown(e, block, index)}
            />
            {menu?.id === block.id ? (
              <ul className={styles.menu} role="listbox" aria-label="Type de bloc">
                {menuItems(block).map((t, i) => (
                  <li key={t.type} role="option" aria-selected={i === menu.active}>
                    <button
                      type="button"
                      data-active={i === menu.active || undefined}
                      onMouseDown={e => {
                        e.preventDefault();
                        choose(block, t.type);
                      }}
                    >
                      <span className={styles.menuIcon}>{t.icon}</span>
                      <span>
                        {t.label}
                        <small>{t.hint}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
      {canEdit ? (
        <button
          type="button"
          className={styles.add}
          onClick={() => insertAfter(blocks.length - 1, { id: uid(), type: 'p', text: '' })}
        >
          {blocks.length ? '+ Ajouter un bloc' : placeholder}
        </button>
      ) : !blocks.length ? (
        <p className={styles.empty}>Aucune note.</p>
      ) : null}
    </div>
  );
}

function BlockText({
  block,
  readOnly,
  register,
  placeholder,
  onText,
  onKeyDown,
}: {
  block: Block;
  readOnly: boolean;
  register: (el: HTMLTextAreaElement | null) => void;
  placeholder?: string;
  onText: (text: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useAutosize<HTMLTextAreaElement>(block.text);
  return (
    <textarea
      ref={el => {
        ref.current = el;
        register(el);
      }}
      rows={1}
      className={styles.text}
      data-done={(block.type === 'todo' && block.checked) || undefined}
      value={block.text}
      readOnly={readOnly}
      placeholder={placeholder}
      aria-label={placeholder ?? 'Bloc'}
      onChange={e => onText(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
