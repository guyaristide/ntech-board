import { useState, type DragEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { amount, isReady, SPRINT_STATUS_LABEL, stepOf, type Sprint, type Ticket } from '@board/shared';
import { delivery, useDelivery } from '../../model/delivery';
import { useCanEdit, useSeesDelivery, useWorkspace } from '../../model/store';
import { EditableText } from '../../ui/EditableText';
import { Popover } from '../../ui/Popover';
import { Tag } from '../../ui/Tag';
import page from '../Page.module.css';
import styles from './Delivery.module.css';

/** « lun. 19 oct. » */
export const shortDay = (iso: string | null) =>
  iso
    ? new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : '—';
export const period = (s: { start: string | null; end: string | null }) =>
  s.start || s.end ? `${shortDay(s.start)} → ${shortDay(s.end)}` : 'Dates à fixer';

/** Sprint en cours d'abord, puis les sprints prévus par date ; les sprints clos à la fin. */
export const sprintOrder = (a: Sprint, b: Sprint) => {
  const rank = { active: 0, planned: 1, closed: 2 };
  // Prévus : le plus proche d'abord ; clos : le plus récent d'abord.
  const byDate = (a.start ?? '9').localeCompare(b.start ?? '9');
  return rank[a.status] - rank[b.status] || (a.status === 'closed' ? -byDate : byDate);
};

export const SprintTag = ({ sprint }: { sprint: Sprint }) => (
  <Tag
    value={SPRINT_STATUS_LABEL[sprint.status]}
    tone={sprint.status === 'active' ? 'blue' : sprint.status === 'closed' ? 'green' : 'gray'}
  />
);

/** Partie réservée : message pour qui ne la voit pas (réglages du projet). */
export function DeliveryGate({ children }: { children: ReactNode }) {
  const sees = useSeesDelivery();
  const enabled = useWorkspace(s => s.settings.delivery.enabled);
  if (sees) return <>{children}</>;
  return (
    <div className={page.page}>
      <h1 className={page.h1}>Réalisation</h1>
      <p className={page.lead}>
        {enabled
          ? 'Cette partie n’est pas ouverte à votre profil. Un administrateur du projet peut vous y donner accès dans les réglages.'
          : 'La partie Réalisation n’est pas activée pour ce projet. Un administrateur peut l’activer dans Projet › Réglages.'}
      </p>
    </div>
  );
}

/** Charge par rapport à une capacité : « 18 / 20 pts », barre rouge au-delà. */
export function LoadBar({ value, max, label }: { value: number; max: number | null; label: string }) {
  const settings = useWorkspace(s => s.settings);
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className={styles.load} title={label}>
      <span className={styles.loadText}>
        {amount(value, settings)}
        {max ? ` / ${amount(max, settings)}` : ''}
      </span>
      {max ? (
        <span className={styles.bar} data-over={value > max || undefined}>
          <span style={{ width: `${pct}%` }} />
        </span>
      ) : null}
    </span>
  );
}

/** Critères « prêt » d'un ticket : pastille, et la liste à cocher au clic. */
export function Ready({ ticket }: { ticket: Ticket }) {
  const { settings } = useDelivery();
  const canEdit = useCanEdit();
  const [open, setOpen] = useState(false);
  const checks = settings.delivery.readiness;
  const done = checks.filter(c => ticket.ready.includes(c.id)).length;
  const ready = isReady(settings, ticket);
  return (
    <span className={styles.readyRoot}>
      <button
        type="button"
        className={styles.ready}
        data-ready={ready || undefined}
        title={ready ? 'Prêt pour un sprint' : 'Critères « prêt » cochés'}
        onClick={() => setOpen(o => !o)}
      >
        {ready ? 'Prêt' : `${done}/${checks.length}`}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} align="end" width={280}>
        <div className={styles.checklist}>
          {checks.map(c => (
            <label key={c.id}>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={ticket.ready.includes(c.id)}
                onChange={e =>
                  delivery.updateTicket(ticket.id, {
                    ready: e.target.checked ? [...ticket.ready, c.id] : ticket.ready.filter(x => x !== c.id),
                  })
                }
              />
              {c.name}
            </label>
          ))}
          {settings.delivery.estimation !== 'none' ? (
            <p className={ticket.estimate === null ? styles.missing : page.faint}>
              {ticket.estimate === null ? 'À estimer' : `Estimé : ${amount(ticket.estimate, settings)}`}
            </p>
          ) : null}
        </div>
      </Popover>
    </span>
  );
}

export function Estimate({ ticket }: { ticket: Ticket }) {
  const canEdit = useCanEdit();
  const { settings } = useDelivery();
  if (settings.delivery.estimation === 'none') return null;
  return (
    <input
      className={styles.estimate}
      type="number"
      min={0}
      step={settings.delivery.estimation === 'points' ? 1 : 0.5}
      disabled={!canEdit}
      aria-label={`Estimation de ${ticket.id}`}
      placeholder="?"
      value={ticket.estimate ?? ''}
      onChange={e =>
        delivery.updateTicket(ticket.id, { estimate: e.target.value === '' ? null : Number(e.target.value) })
      }
    />
  );
}

/** Ligne de ticket : déplaçable, champs modifiables sur place. */
export function TicketRow({
  ticket,
  onDragStart,
  onDrop,
  selected,
  onSelect,
}: {
  ticket: Ticket;
  onDragStart?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  /** Sélection pour les actions groupées : une case à la place de la poignée. */
  selected?: boolean;
  onSelect?: (on: boolean) => void;
}) {
  const ws = useWorkspace();
  const { settings, releases, sprints, tickets } = useDelivery();
  const canEdit = useCanEdit();
  const [over, setOver] = useState(false);
  const children = tickets.filter(t => t.parent === ticket.id);
  const subtasks = children.length
    ? `${children.filter(t => stepOf(settings, t.status)?.category === 'done').length}/${children.length}`
    : '';
  const story = ticket.story ? ws.stories.find(s => s.id === ticket.story) : undefined;
  const type = settings.delivery.ticketTypes.find(t => t.id === ticket.type);
  const step = stepOf(settings, ticket.status);
  return (
    <div
      className={styles.row}
      data-over={over || undefined}
      data-done={step?.category === 'done' || undefined}
      data-selected={selected || undefined}
      draggable={canEdit}
      onDragStart={onDragStart}
      onDragOver={e => {
        if (!onDrop) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        setOver(false);
        onDrop?.(e);
      }}
    >
      {onSelect ? (
        <input
          type="checkbox"
          className={styles.pick}
          checked={!!selected}
          aria-label={`Sélectionner ${ticket.id}`}
          onChange={e => onSelect(e.target.checked)}
        />
      ) : (
        <span className={styles.handle} aria-hidden="true">
          {canEdit ? '⋮⋮' : ''}
        </span>
      )}
      <Link to={`/realisation/ticket/${ticket.id}`} className={styles.key}>
        {ticket.id}
      </Link>
      <span className={styles.type}>{type?.name ?? ticket.type}</span>
      <span className={styles.title}>
        <EditableText
          variant="inline"
          multiline={false}
          value={ticket.title}
          label={`Intitulé de ${ticket.id}`}
          placeholder="Sans titre"
          onChange={title => delivery.updateTicket(ticket.id, { title })}
        />
        {subtasks ? (
          <span className={styles.storyLink} title="Sous-tâches terminées">
            ↳ {subtasks}
          </span>
        ) : null}
        {story ? (
          <Link to={`/us/${story.id}`} className={styles.storyLink} title={story.title}>
            {story.id}
          </Link>
        ) : null}
      </span>
      <select
        className={`${styles.select} ${styles.release}`}
        value={ticket.release}
        disabled={!canEdit}
        aria-label={`Version de ${ticket.id}`}
        onChange={e => delivery.updateTicket(ticket.id, { release: e.target.value })}
      >
        <option value="">Sans version</option>
        {releases.map(r => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <Estimate ticket={ticket} />
      <Ready ticket={ticket} />
      <select
        className={`${styles.select} ${styles.status}`}
        value={step?.id}
        disabled={!canEdit}
        data-category={step?.category}
        aria-label={`Étape de ${ticket.id}`}
        onChange={e => delivery.updateTicket(ticket.id, { status: e.target.value })}
      >
        {settings.delivery.workflow.map(s => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select
        className={`${styles.select} ${styles.sprintSel}`}
        value={ticket.sprint}
        disabled={!canEdit}
        aria-label={`Sprint de ${ticket.id}`}
        onChange={e => delivery.updateTicket(ticket.id, { sprint: e.target.value })}
      >
        <option value="">Backlog</option>
        {sprints
          .filter(s => s.status !== 'closed' || s.id === ticket.sprint)
          .sort(sprintOrder)
          .map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </select>
    </div>
  );
}
