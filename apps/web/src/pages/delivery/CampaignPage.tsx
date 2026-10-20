import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CAMPAIGN_MODE_LABEL,
  CAMPAIGN_STATUSES,
  casesOf,
  testSummary,
  type CampaignMode,
  type CampaignStatus,
} from '@board/shared';
import { delivery, useDelivery } from '../../model/delivery';
import { useWorkspace } from '../../model/store';
import { EditableText } from '../../ui/EditableText';
import { PdfButton } from '../../ui/PdfButton';
import page from '../Page.module.css';
import { assigneeName } from './fields';
import { DeliveryGate } from './parts';
import { StatusTag, StoryBlock, TestBar, useRecetteRights } from './RecetteParts';
import styles from './Recette.module.css';

/**
 * Fiche d'une campagne de recette : version, mode, statut, dates, signataires, périmètre ; puis les
 * cas de test par US, avec résultat, constat, bug et verdict du client selon le mode.
 */
export function CampaignPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const { releases, campaigns } = useDelivery();
  const [filter, setFilter] = useState<'all' | 'todo' | 'issues'>('all');
  const [adding, setAdding] = useState('');
  const campaign = campaigns.find(x => x.id === id);
  const rights = useRecetteRights(campaign ?? ({ mode: 'internal' } as never));
  if (!campaign)
    return (
      <DeliveryGate>
        <div className={page.page}>
          Campagne introuvable. <Link to="/realisation/recette">Retour à la recette</Link>
        </div>
      </DeliveryGate>
    );
  const set = (patch: Parameters<typeof delivery.updateCampaign>[1]) =>
    delivery.updateCampaign(campaign.id, patch);
  const byId = new Map(ws.stories.map(s => [s.id, s]));
  const summary = testSummary(casesOf(campaign, ws.stories).map(x => x.result?.status ?? ''));
  const candidates = ws.stories.filter(s => !campaign.scope.includes(s.id) && s.status !== 'Écartée');
  const signable = ws.parties.filter(
    p => (p.type === 'person' || p.type === 'role') && !campaign.signatories.includes(p.id),
  );
  const field = (label: string, node: ReactNode) => (
    <div style={{ display: 'contents' }}>
      <span className={page.propLabel}>{label}</span>
      <div className={page.propValue}>{node}</div>
    </div>
  );
  const addStory = () => {
    const sid = adding.split(' ')[0].trim();
    if (byId.has(sid) && !campaign.scope.includes(sid)) set({ scope: [...campaign.scope, sid] });
    setAdding('');
  };

  return (
    <DeliveryGate>
      <div className={`${page.page} ${page.wide}`}>
        <nav className={page.crumbs} aria-label="Fil d’Ariane">
          <Link to="/realisation/recette">Recette</Link> / <span>{campaign.id}</span>
          <span className={page.actions}>
            <PdfButton
              path={`/pdf/recette/${campaign.id}`}
              title="Procès-verbal de recette, avec bloc de signatures"
            >
              ⤓ PV de recette
            </PdfButton>
            {rights.manage ? (
              <button
                type="button"
                className={`${page.ghost} ${page.danger}`}
                onClick={async () => {
                  if (
                    !confirm(`Supprimer ${campaign.name} et ses résultats ? Les bugs ouverts sont conservés.`)
                  )
                    return;
                  await delivery.deleteCampaign(campaign.id);
                  navigate('/realisation/recette');
                }}
              >
                Supprimer
              </button>
            ) : null}
          </span>
        </nav>
        <p className={page.kicker}>
          {campaign.id} · <StatusTag status={campaign.status} />
        </p>
        <EditableText
          variant="title"
          value={campaign.name}
          label="Nom de la campagne"
          multiline={false}
          onChange={name => set({ name })}
        />
        <div className={page.props}>
          {field(
            'Version',
            <select
              className={styles.select}
              value={campaign.release}
              disabled={!rights.manage}
              onChange={e => set({ release: e.target.value })}
            >
              <option value="">Aucune</option>
              {releases.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>,
          )}
          {field(
            'Mode',
            <select
              className={styles.select}
              value={campaign.mode}
              disabled={!rights.manage}
              onChange={e => set({ mode: e.target.value as CampaignMode })}
            >
              {Object.entries(CAMPAIGN_MODE_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>,
          )}
          {field(
            'Statut',
            <select
              className={styles.select}
              value={campaign.status}
              disabled={!rights.manage}
              onChange={e => set({ status: e.target.value as CampaignStatus })}
            >
              {CAMPAIGN_STATUSES.map(s => (
                <option key={s}>{s}</option>
              ))}
            </select>,
          )}
          {field(
            'Dates',
            <span className={styles.inline}>
              <input
                type="date"
                className={styles.select}
                value={campaign.start ?? ''}
                disabled={!rights.manage}
                aria-label="Début"
                onChange={e => set({ start: e.target.value || null })}
              />
              <span className={styles.nowrap}>
                →
                <input
                  type="date"
                  className={styles.select}
                  value={campaign.end ?? ''}
                  disabled={!rights.manage}
                  aria-label="Fin"
                  onChange={e => set({ end: e.target.value || null })}
                />
              </span>
            </span>,
          )}
          {field(
            'Signataires du PV',
            <span className={styles.inline}>
              {campaign.signatories.map(sid => (
                <span key={sid} className={styles.chip}>
                  {assigneeName(ws.parties, sid)}
                  {rights.manage ? (
                    <button
                      type="button"
                      aria-label="Retirer"
                      onClick={() => set({ signatories: campaign.signatories.filter(x => x !== sid) })}
                    >
                      ✕
                    </button>
                  ) : null}
                </span>
              ))}
              {rights.manage ? (
                <select
                  className={styles.select}
                  value=""
                  aria-label="Ajouter un signataire"
                  onChange={e =>
                    e.target.value && set({ signatories: [...campaign.signatories, e.target.value] })
                  }
                >
                  <option value="">+ Signataire</option>
                  {signable.map(p => (
                    <option key={p.id} value={p.id}>
                      {assigneeName(ws.parties, p.id)}
                    </option>
                  ))}
                </select>
              ) : null}
            </span>,
          )}
          {field(
            'Périmètre',
            <span className={styles.inline}>
              {campaign.scope.length} US · {summary.total} cas de test
              {rights.manage && campaign.release ? (
                <button
                  type="button"
                  className={page.ghost}
                  onClick={() => void delivery.refreshScope(campaign.id)}
                >
                  + US de la version
                </button>
              ) : null}
            </span>,
          )}
        </div>

        <div className={styles.progress}>
          <TestBar summary={summary} />
          <span>
            {summary.ok} OK · {summary.ko} KO · {summary.reserve} réserve{summary.reserve > 1 ? 's' : ''} ·{' '}
            {summary.na} N.A. · <strong>{summary.todo} à passer</strong>
          </span>
        </div>
        <div className={styles.toolbar}>
          {(
            [
              ['all', 'Tous les cas'],
              ['todo', 'À passer'],
              ['issues', 'KO et réserves'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={styles.filter}
              data-on={filter === k || undefined}
              onClick={() => setFilter(k)}
            >
              {label}
            </button>
          ))}
          {rights.manage ? (
            <form
              className={styles.add}
              onSubmit={e => {
                e.preventDefault();
                addStory();
              }}
            >
              <input
                list="campaign-stories"
                value={adding}
                placeholder="Ajouter une US au périmètre"
                aria-label="Ajouter une US"
                onChange={e => setAdding(e.target.value)}
              />
              <datalist id="campaign-stories">
                {candidates.map(s => (
                  <option key={s.id} value={`${s.id} · ${s.title}`} />
                ))}
              </datalist>
            </form>
          ) : null}
        </div>

        {campaign.scope.map(sid => (
          <StoryBlock key={sid} campaign={campaign} story={byId.get(sid)} filter={filter} />
        ))}
        {!campaign.scope.length ? (
          <p className={page.faint}>
            Périmètre vide. Choisissez la version puis « + US de la version », ou ajoutez des US une à une.
          </p>
        ) : null}
      </div>
    </DeliveryGate>
  );
}
