import { Link, useNavigate } from 'react-router-dom';
import { CAMPAIGN_MODE_LABEL, casesOf, hasVerdicts, testSummary } from '@board/shared';
import { delivery, useDelivery } from '../../model/delivery';
import { useCanEdit, useWorkspace } from '../../model/store';
import page from '../Page.module.css';
import { DeliveryGate, period } from './parts';
import { StatusTag, TestBar } from './RecetteParts';
import styles from './Recette.module.css';
import cards from './Delivery.module.css';

/** Campagnes de recette : une par version (ou par lot), avec leur avancement. */
export function Recette() {
  const stories = useWorkspace(s => s.stories);
  const { releases, campaigns } = useDelivery();
  const canEdit = useCanEdit();
  const navigate = useNavigate();
  const create = async () => {
    const release = releases.find(r => r.status === 'En cours') ?? releases.find(r => r.status === 'Prévue');
    navigate(
      `/realisation/recette/${await delivery.createCampaign(release ? { release: release.id, name: `Recette ${release.name}` } : undefined)}`,
    );
  };
  return (
    <DeliveryGate>
      <div className={`${page.page} ${page.wide}`}>
        <span className={page.icon} aria-hidden="true">
          ✅
        </span>
        <h1 className={page.h1}>Recette</h1>
        <p className={page.lead}>
          Les cas de test sont les critères d’acceptation des US. Chaque campagne choisit son mode : recette
          interne, par le client dans l’outil, PV seul, ou interne puis validation du client. Le PV se
          télécharge depuis la campagne.
        </p>
        {canEdit ? (
          <p className={page.actions}>
            <button type="button" className={page.primary} onClick={() => void create()}>
              + Campagne
            </button>
          </p>
        ) : null}
        <div className={cards.cards}>
          {campaigns.map(c => {
            const s = testSummary(casesOf(c, stories).map(x => x.result?.status ?? ''));
            const release = releases.find(r => r.id === c.release);
            const accepted = c.scope.filter(id => c.verdicts[id]?.status === 'accepted').length;
            return (
              <Link key={c.id} to={`/realisation/recette/${c.id}`} className={cards.card}>
                <span className={cards.cardHead}>
                  <strong>{c.name}</strong>
                  <StatusTag status={c.status} />
                </span>
                <span className={page.faint}>
                  {[release?.name, CAMPAIGN_MODE_LABEL[c.mode]].filter(Boolean).join(' · ')}
                </span>
                {c.start || c.end ? <span className={page.faint}>{period(c)}</span> : null}
                <TestBar summary={s} />
                <span className={styles.small}>
                  {c.scope.length} US · {s.ok}/{s.total} OK{s.ko ? ` · ${s.ko} KO` : ''}
                  {s.reserve ? ` · ${s.reserve} rés.` : ''}
                  {hasVerdicts(c.mode)
                    ? ` · ${accepted} acceptée${accepted > 1 ? 's' : ''} par le client`
                    : ''}
                </span>
              </Link>
            );
          })}
        </div>
        {!campaigns.length ? <p className={page.faint}>Aucune campagne de recette pour le moment.</p> : null}
      </div>
    </DeliveryGate>
  );
}
