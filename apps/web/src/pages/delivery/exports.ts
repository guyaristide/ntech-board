import {
  amount,
  CAMPAIGN_MODE_LABEL,
  casesOf,
  hasVerdicts,
  TEST_STATUS_LABEL,
  testSummary,
  VERDICT_LABEL,
  type Campaign,
  type Story,
  type VerdictStatus,
  isBlocked,
  isReady,
  progress,
  SPRINT_STATUS_LABEL,
  stepOf,
  type Release,
  type Sprint,
  type Ticket,
} from '@board/shared';
import { useDelivery } from '../../model/delivery';
import { useWorkspace } from '../../model/store';
import type { Column } from '../../ui/ExportButton';
import { assigneeName } from './fields';

/** Exports CSV de la partie Réalisation : mêmes libellés et valeurs qu'à l'écran. */

/** Date au format français (« 21/10/2026 »), vide sans date. */
export const day = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR') : '';

/** Colonnes d'un ticket : clé, titre, type, étape, estimation, responsable, sprint, version, US. */
export function useTicketColumns(): Column<Ticket>[] {
  const parties = useWorkspace(s => s.parties);
  const stories = useWorkspace(s => s.stories);
  const { settings, sprints, releases, tickets } = useDelivery();
  const estimated = settings.delivery.estimation !== 'none';
  const columns: (Column<Ticket> | null)[] = [
    ['Clé', t => t.id],
    ['Titre', t => t.title],
    ['Type', t => settings.delivery.ticketTypes.find(x => x.id === t.type)?.name ?? t.type],
    ['Étape', t => stepOf(settings, t.status)?.name ?? t.status],
    estimated ? ['Estimation', t => (t.estimate === null ? '' : amount(t.estimate, settings))] : null,
    ['Responsable', t => assigneeName(parties, t.assignee)],
    ['Sprint', t => sprints.find(s => s.id === t.sprint)?.name ?? ''],
    ['Version', t => releases.find(r => r.id === t.release)?.name ?? ''],
    ['US', t => t.story],
    ['Intitulé de l’US', t => stories.find(s => s.id === t.story)?.title ?? ''],
    ['Ticket parent', t => t.parent],
    ['Prêt', t => isReady(settings, t)],
    ['Bloqué', t => isBlocked(settings, tickets, t)],
    ['Mis à jour', t => day(t.updatedAt?.slice(0, 10) ?? null)],
  ];
  return columns.filter((c): c is Column<Ticket> => !!c);
}

/** Colonnes d'un sprint : dates, version, capacité, charge, avancement, vélocité. */
export function useSprintColumns(): Column<Sprint>[] {
  const { settings, releases, tickets } = useDelivery();
  const of = (s: Sprint) =>
    progress(
      settings,
      tickets.filter(t => t.sprint === s.id),
    );
  return [
    ['Sprint', s => s.name],
    ['Statut', s => SPRINT_STATUS_LABEL[s.status]],
    ['Début', s => day(s.start)],
    ['Fin', s => day(s.end)],
    ['Version', s => releases.find(r => r.id === s.release)?.name ?? ''],
    ['Objectif', s => s.goal],
    ['Capacité', s => (s.capacity === null ? '' : amount(s.capacity, settings))],
    ['Charge', s => amount(of(s).total, settings)],
    ['Tickets terminés', s => of(s).doneCount],
    ['Tickets', s => of(s).count],
    ['Vélocité', s => (s.velocity === null ? '' : amount(s.velocity, settings))],
    ['Reportés', s => s.carried.length || ''],
  ];
}

/** Colonnes d'une version de livraison : dates, versions du cadrage couvertes, sprints, avancement. */
export function useReleaseColumns(): Column<Release>[] {
  const { settings, sprints, tickets } = useDelivery();
  const of = (r: Release) =>
    progress(
      settings,
      tickets.filter(t => t.release === r.id),
    );
  const pct = (r: Release) => {
    const p = of(r);
    return p.total
      ? Math.round((p.done / p.total) * 100)
      : p.count
        ? Math.round((p.doneCount / p.count) * 100)
        : 0;
  };
  return [
    ['Version', r => r.name],
    ['Statut', r => r.status],
    ['Début', r => day(r.start)],
    ['Livraison', r => day(r.end)],
    ['Couvre', r => r.versions.join(', ')],
    ['Objectif', r => r.goal],
    [
      'Sprints',
      r =>
        sprints
          .filter(s => s.release === r.id)
          .map(s => s.name)
          .join(', '),
    ],
    ['Tickets terminés', r => of(r).doneCount],
    ['Tickets', r => of(r).count],
    [
      'Réalisé',
      r => (of(r).total ? `${amount(of(r).done, settings)} sur ${amount(of(r).total, settings)}` : ''),
    ],
    ['Avancement (%)', r => pct(r)],
  ];
}

/** Colonnes d'une campagne de recette : version, mode, statut, dates, bilan des cas et verdicts. */
export function useCampaignColumns(): Column<Campaign>[] {
  const stories = useWorkspace(s => s.stories);
  const { releases } = useDelivery();
  const sum = (c: Campaign) => testSummary(casesOf(c, stories).map(x => x.result?.status ?? ''));
  return [
    ['Campagne', c => c.name],
    ['Version', c => releases.find(r => r.id === c.release)?.name ?? ''],
    ['Mode', c => CAMPAIGN_MODE_LABEL[c.mode]],
    ['Statut', c => c.status],
    ['Début', c => day(c.start)],
    ['Fin', c => day(c.end)],
    ['US', c => c.scope.length],
    ['Cas de test', c => sum(c).total],
    ['OK', c => sum(c).ok],
    ['KO', c => sum(c).ko],
    ['Réserves', c => sum(c).reserve],
    ['Non applicables', c => sum(c).na],
    ['À passer', c => sum(c).todo],
    [
      'US acceptées par le client',
      c => (hasVerdicts(c.mode) ? c.scope.filter(id => c.verdicts[id]?.status === 'accepted').length : ''),
    ],
  ];
}

export type CaseFilter = 'all' | 'todo' | 'issues';
type CaseRow = ReturnType<typeof casesOf>[number] & { title: string };

/** Cas de test d'une campagne affichés selon le filtre (tous, à passer, KO et réserves). */
export function campaignCases(campaign: Campaign, stories: Story[], filter: CaseFilter): CaseRow[] {
  const byId = new Map(stories.map(s => [s.id, s]));
  return casesOf(campaign, stories)
    .filter(c => {
      const s = c.result?.status ?? '';
      return filter === 'all' || (filter === 'todo' ? s === '' : s === 'ko' || s === 'reserve');
    })
    .map(c => ({ ...c, title: byId.get(c.story)?.title ?? '' }));
}

/** Colonnes d'un cas de test : US, critère, résultat, constat, bug ; verdict du client selon le mode. */
export function caseColumns(campaign: Campaign): Column<CaseRow>[] {
  const verdict = (c: CaseRow) => campaign.verdicts[c.story];
  const columns: Column<CaseRow>[] = [
    ['US', c => c.story],
    ['Intitulé de l’US', c => c.title],
    ['Critère d’acceptation', c => c.criterion.text],
    ['Résultat', c => (c.result?.status ? TEST_STATUS_LABEL[c.result.status] : 'À passer')],
    ['Constat', c => c.result?.comment],
    ['Testé par', c => c.result?.by],
    ['Le', c => day(c.result?.at?.slice(0, 10) ?? null)],
    ['Bug', c => c.result?.bug],
  ];
  if (!hasVerdicts(campaign.mode)) return columns;
  return [
    ...columns,
    [
      'Verdict du client',
      c => (verdict(c)?.status ? VERDICT_LABEL[verdict(c)!.status as Exclude<VerdictStatus, ''>] : ''),
    ],
    ['Commentaire du client', c => verdict(c)?.comment],
  ];
}
