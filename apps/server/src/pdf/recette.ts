import {
  CAMPAIGN_MODE_LABEL,
  casesOf,
  hasVerdicts,
  testSummary,
  VERDICT_LABEL,
  type Campaign,
  type Party,
  type Release,
  type Story,
} from '@board/shared';
import type { Content, TableCell } from 'pdfmake/interfaces';
import { fileName, shortDate, today } from './format';
import { code, eyebrow, GREY, h2, layout, meta, renderPdf, usable } from './render';

const th = (text: string, right = false): TableCell => ({
  text,
  bold: true,
  fontSize: 7.5,
  color: GREY.label,
  alignment: right ? 'right' : undefined,
});
const n = (v: number): TableCell => ({ text: v ? String(v) : '—', alignment: 'right', color: v ? undefined : GREY.light });

/** Nom, qualité et organisation d'un signataire du référentiel. */
function signatory(parties: Party[], id: string) {
  const p = parties.find(x => x.id === id);
  if (!p) return { name: id, quality: '' };
  const org = parties.find(x => x.id === p.organization)?.name ?? '';
  const holder = p.type === 'role' && p.holder ? parties.find(x => x.id === p.holder)?.name : '';
  const name = p.type === 'role' ? holder || '' : p.name;
  const quality = [p.type === 'role' ? p.name : p.function, org].filter(Boolean).join(', ');
  return { name, quality };
}

/**
 * Procès-verbal de recette d'une campagne : périmètre, bilan des cas de test, résultat par US (et
 * verdict du client), réserves et anomalies, prononcé et signatures.
 */
export async function recettePdf(
  project: string,
  campaign: Campaign,
  data: { stories: Story[]; releases: Release[]; parties: Party[] },
) {
  const width = usable(false);
  const release = data.releases.find(r => r.id === campaign.release);
  const cases = casesOf(campaign, data.stories);
  const all = testSummary(cases.map(x => x.result?.status ?? ''));
  const verdicts = hasVerdicts(campaign.mode);
  const byStory = new Map(data.stories.map(s => [s.id, s]));
  const accepted = campaign.scope.filter(s => campaign.verdicts[s]?.status === 'accepted').length;
  const refused = campaign.scope.filter(s => campaign.verdicts[s]?.status === 'refused').length;
  const issues = cases.filter(x => x.result?.status === 'ko' || x.result?.status === 'reserve');

  const perStory: TableCell[][] = campaign.scope.map(id => {
    const s = testSummary(cases.filter(x => x.story === id).map(x => x.result?.status ?? ''));
    const v = campaign.verdicts[id];
    return [
      { stack: [{ text: byStory.get(id)?.title ?? 'US supprimée' }, code(id)] },
      n(s.total),
      n(s.ok),
      n(s.ko),
      n(s.reserve),
      n(s.na),
      n(s.todo),
      ...(verdicts ? [{ text: v?.status ? VERDICT_LABEL[v.status] : '—', color: v?.status === 'refused' ? '#b42318' : undefined }] : []),
    ];
  });

  const sign = (campaign.signatories.length ? campaign.signatories : ['', '']).map(id =>
    id ? signatory(data.parties, id) : { name: '', quality: '' },
  );
  const content: Content[] = [
    eyebrow(project),
    { text: 'Procès-verbal de recette', fontSize: 20, bold: true, margin: [0, 3, 0, 1] },
    { text: [campaign.name, release?.name].filter(Boolean).join(' · '), fontSize: 11, color: GREY.label, margin: [0, 0, 0, 12] },
    meta([
      ['Version', release ? `${release.name}${release.end ? `, livraison visée le ${shortDate(release.end)}` : ''}` : '—'],
      ['Mode', CAMPAIGN_MODE_LABEL[campaign.mode]],
      ['Période', campaign.start || campaign.end ? `du ${shortDate(campaign.start)} au ${shortDate(campaign.end)}` : '—'],
      ['Périmètre', `${campaign.scope.length} US, ${all.total} cas de test (critères d’acceptation)`],
      ['Statut', campaign.status],
      ['Version du PV', `Établi le ${today()}`],
    ]),
    h2('Bilan', 16),
    {
      table: {
        widths: Array(verdicts ? 8 : 5).fill('*'),
        body: [
          [th('OK', true), th('KO', true), th('Réserves', true), th('Non applicables', true), th('Non passés', true), ...(verdicts ? [th('US acceptées', true), th('US refusées', true), th('Sans verdict', true)] : [])],
          [n(all.ok), n(all.ko), n(all.reserve), n(all.na), n(all.todo), ...(verdicts ? [n(accepted), n(refused), n(campaign.scope.length - accepted - refused)] : [])],
        ],
      },
      layout: layout({ header: true, pad: 4 }),
    },
    h2('Résultat par US'),
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ['*', 30, 30, 30, 34, 30, 40, ...(verdicts ? [60] : [])],
        body: [
          [th('US'), th('Cas', true), th('OK', true), th('KO', true), th('Rés.', true), th('N.A.', true), th('À passer', true), ...(verdicts ? [th('Client')] : [])],
          ...perStory,
        ],
      },
      layout: layout({ header: true, pad: 3 }),
    },
  ];
  if (issues.length)
    content.push(h2('Réserves et anomalies'), {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: [70, '*', '*', 50],
        body: [
          [th('US'), th('Critère'), th('Constat'), th('Suivi')],
          ...issues.map(x => [
            { stack: [{ text: x.result?.status === 'ko' ? 'KO' : 'Réserve', bold: true, color: x.result?.status === 'ko' ? '#b42318' : '#b54708' }, code(x.story)] },
            x.criterion.text,
            { text: x.result?.comment || '—', color: x.result?.comment ? undefined : GREY.light },
            { text: x.result?.bug || '—' },
          ]),
        ],
      },
      layout: layout({ header: true, pad: 3 }),
    });
  content.push(
    {
      unbreakable: true,
      stack: [
        h2('Prononcé de la recette'),
        {
          columns: ['Recette prononcée sans réserve', 'Recette prononcée avec réserves', 'Recette refusée'].map(label => ({
            width: 'auto' as const,
            columns: [
              { width: 12, canvas: [{ type: 'rect' as const, x: 0, y: 1.5, w: 8, h: 8, lineWidth: 0.6, lineColor: '#555' }] },
              { width: 'auto' as const, text: label },
            ],
          })),
          columnGap: 22,
          margin: [0, 2, 0, 4],
        },
        { text: 'Observations :', color: GREY.muted, margin: [0, 6, 0, 30] },
        // Le prononcé et les signatures restent sur la même page.
        h2('Signatures'),
        {
          table: {
            widths: sign.map(() => (width - 6 * sign.length) / sign.length),
            body: [
              sign.map(s => ({ stack: [{ text: s.name || 'Nom :', bold: !!s.name, color: s.name ? undefined : GREY.light }, { text: s.quality, color: GREY.muted, fontSize: 8 }] })),
              sign.map(() => ({ text: 'Date :', color: GREY.light, fontSize: 8 })),
              sign.map(() => ({ text: 'Signature', color: GREY.light, fontSize: 8, margin: [0, 0, 0, 46] as [number, number, number, number] })),
            ],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#bbb',
            vLineColor: () => '#bbb',
            paddingLeft: () => 5,
            paddingRight: () => 5,
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
        },
      ],
    },
  );
  const pdf = await renderPdf({
    title: `PV de recette · ${campaign.name}`,
    footer: [project, 'PV de recette', campaign.name].filter(Boolean).join(' · '),
    content,
  });
  return { pdf, file: fileName('PV_recette', campaign.name) };
}
