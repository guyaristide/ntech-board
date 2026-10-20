import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  hasVerdicts,
  TEST_STATUS_LABEL,
  testSummary,
  VERDICT_LABEL,
  type Campaign,
  type Story,
  type TestStatus,
  type VerdictStatus,
} from '@board/shared';
import { ApiError } from '../../model/api';
import { delivery } from '../../model/delivery';
import { useCanEdit, useWorkspace } from '../../model/store';
import { Tag } from '../../ui/Tag';
import page from '../Page.module.css';
import styles from './Recette.module.css';

const RESULTS: Exclude<TestStatus, ''>[] = ['ok', 'ko', 'reserve', 'na'];
const SHORT: Record<Exclude<TestStatus, ''>, string> = { ok: 'OK', ko: 'KO', reserve: 'Rés.', na: 'N.A.' };

/** Qui peut saisir dans une campagne : l'équipe ; le client aussi en mode « client » ; verdicts en modes client et mixte. */
export function useRecetteRights(campaign: Campaign) {
  const canEdit = useCanEdit();
  const role = useWorkspace(s => s.session?.role);
  return {
    results: canEdit || (role === 'viewer' && campaign.mode === 'client'),
    verdicts: hasVerdicts(campaign.mode) && !!role,
    manage: canEdit,
  };
}
const useMe = () => useWorkspace(s => s.session?.user?.name || s.session?.user?.email || '');
const when = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Commentaire saisi localement, envoyé à chaque frappe (regroupé par le store). */
function Comment({
  value,
  disabled,
  placeholder,
  onChange,
}: {
  value: string;
  disabled: boolean;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={styles.comment}
      value={draft}
      disabled={disabled}
      placeholder={disabled ? '' : placeholder}
      aria-label={placeholder}
      onChange={e => {
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}

/** Cas de test : critère, résultat, constat, bug. */
function CaseRow({
  campaign,
  storyId,
  criterion,
}: {
  campaign: Campaign;
  storyId: string;
  criterion: { id: string; text: string };
}) {
  const rights = useRecetteRights(campaign);
  const me = useMe();
  const [error, setError] = useState('');
  const key = `${storyId}:${criterion.id}`;
  const r = campaign.results[key];
  const status = r?.status ?? '';
  const set = (next: TestStatus, comment = r?.comment ?? '') =>
    delivery.setResult(campaign.id, key, next, comment, me);
  return (
    <div className={styles.case} data-status={status || undefined}>
      <span className={styles.criterion}>{criterion.text}</span>
      <span className={styles.results} role="group" aria-label="Résultat">
        {RESULTS.map(s => (
          <button
            key={s}
            type="button"
            className={styles.result}
            data-value={s}
            aria-pressed={status === s}
            title={TEST_STATUS_LABEL[s]}
            disabled={!rights.results}
            onClick={() => set(status === s ? '' : s)}
          >
            {SHORT[s]}
          </button>
        ))}
      </span>
      <Comment
        value={r?.comment ?? ''}
        disabled={!rights.results}
        placeholder="Constat"
        onChange={c => set(status, c)}
      />
      <span className={styles.follow}>
        {r?.bug ? (
          <Link to={`/realisation/ticket/${r.bug}`}>{r.bug}</Link>
        ) : (status === 'ko' || status === 'reserve') && rights.manage ? (
          <button
            type="button"
            className={page.ghost}
            onClick={() =>
              void delivery
                .openBug(campaign.id, key)
                .catch(e => setError(e instanceof ApiError ? (e.message ?? e.code) : 'Erreur'))
            }
          >
            + Bug
          </button>
        ) : null}
        {error ? <span className={styles.error}>{error}</span> : null}
        {r?.by ? (
          <span className={page.faint} title={`${r.by}, ${when(r.at)}`}>
            {r.by.split(' ')[0]}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** Une US du périmètre : ses cas de test, et le verdict du client selon le mode. */
export function StoryBlock({
  campaign,
  story,
  filter,
}: {
  campaign: Campaign;
  story: Story | undefined;
  filter: 'all' | 'todo' | 'issues';
}) {
  const rights = useRecetteRights(campaign);
  const me = useMe();
  const id = story?.id ?? '';
  const criteria = (story?.acceptance ?? []).filter(c => {
    const s = campaign.results[`${id}:${c.id}`]?.status ?? '';
    return filter === 'all' || (filter === 'todo' ? s === '' : s === 'ko' || s === 'reserve');
  });
  const sum = testSummary(
    (story?.acceptance ?? []).map(c => campaign.results[`${id}:${c.id}`]?.status ?? ''),
  );
  const verdict = campaign.verdicts[id];
  if (!story || (filter !== 'all' && !criteria.length)) return null;
  return (
    <section className={styles.story}>
      <header className={styles.storyHead}>
        <Link to={`/us/${story.id}`} className={styles.storyKey}>
          {story.id}
        </Link>
        <strong className={styles.storyTitle}>{story.title}</strong>
        <span className={page.faint}>
          {sum.ok}/{sum.total} OK{sum.ko ? ` · ${sum.ko} KO` : ''}
          {sum.reserve ? ` · ${sum.reserve} rés.` : ''}
        </span>
        {hasVerdicts(campaign.mode) ? (
          <span className={styles.verdict}>
            <select
              className={styles.select}
              value={verdict?.status ?? ''}
              disabled={!rights.verdicts}
              aria-label={`Verdict du client sur ${story.id}`}
              data-value={verdict?.status || undefined}
              onChange={e =>
                delivery.setVerdict(
                  campaign.id,
                  story.id,
                  e.target.value as VerdictStatus,
                  verdict?.comment ?? '',
                  me,
                )
              }
            >
              <option value="">Verdict du client</option>
              {Object.entries(VERDICT_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            {verdict?.status ? (
              <Comment
                value={verdict.comment}
                disabled={!rights.verdicts}
                placeholder="Motif ou réserve du client"
                onChange={c => delivery.setVerdict(campaign.id, story.id, verdict.status, c, me)}
              />
            ) : null}
          </span>
        ) : null}
        {rights.manage ? (
          <button
            type="button"
            className={`${page.ghost} ${page.danger}`}
            title="Retirer du périmètre"
            aria-label={`Retirer ${story.id} du périmètre`}
            onClick={() =>
              delivery.updateCampaign(campaign.id, { scope: campaign.scope.filter(s => s !== story.id) })
            }
          >
            ✕
          </button>
        ) : null}
      </header>
      {criteria.map(c => (
        <CaseRow key={c.id} campaign={campaign} storyId={story.id} criterion={c} />
      ))}
      {!story.acceptance.length ? (
        <p className={styles.empty}>Aucun critère d’acceptation : rien à tester pour cette US.</p>
      ) : null}
    </section>
  );
}

/** Barre d'avancement : OK, réserves, KO, non applicables, le reste à passer. */
export function TestBar({ summary }: { summary: ReturnType<typeof testSummary> }) {
  const pct = (n: number) => (summary.total ? (n / summary.total) * 100 : 0);
  return (
    <span
      className={styles.testBar}
      aria-label={`${summary.ok} OK, ${summary.ko} KO, ${summary.reserve} réserves, ${summary.todo} à passer`}
    >
      {(['ok', 'reserve', 'ko', 'na'] as const).map(k => (
        <span key={k} data-value={k} style={{ width: `${pct(summary[k])}%` }} />
      ))}
    </span>
  );
}

export const StatusTag = ({ status }: { status: Campaign['status'] }) => (
  <Tag value={status} tone={status === 'Terminée' ? 'green' : status === 'En cours' ? 'blue' : 'gray'} />
);
