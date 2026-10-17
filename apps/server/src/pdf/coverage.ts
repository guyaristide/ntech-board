import type { Epic, Session, Story, Workshop } from '@board/shared';
import type { Content, TableCell } from 'pdfmake/interfaces';
import { capitalize, dayLabel, describeWeek, fileName, today, weeksOf } from './format';
import { code, eyebrow, GREY, h2, layout, meta, renderPdf, usable } from './render';

/** Une journée où le sujet est traité, avec les séquences qui le citent. */
interface Occurrence {
  w: Workshop;
  week: string;
  sessions: Session[];
}

export interface CoverageRow {
  epic: Epic;
  stories: number;
  /** Journées de la période demandée (toutes si aucune). */
  occ: Occurrence[];
  /** Journées hors de la période demandée. */
  elsewhere: Occurrence[];
  /** « Oui » si traité dans une semaine datée, sinon la période plus tardive (« Après les sprints… ») ou « Non ». */
  status: string;
}

/** « UC03 » cite aussi « UC 03 » ; les autres sujets sont cités par leur identifiant. */
function cites(epic: string) {
  const uc = epic.match(/^UC\s?(\d+)$/i);
  const re = new RegExp(uc ? `UC\\s?${uc[1]}(?!\\d)` : epic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return (s: Session) =>
    re.test([s.cdc, s.title, s.content, s.outcome, ...s.steps.map(st => st.title)].join(' \n '));
}

/**
 * Couverture des sujets du backlog (UC, exigences) par les ateliers : un sujet est traité dans une
 * journée quand l'épique la désigne ou qu'une de ses séquences le cite. Classement par première journée ;
 * avec `phase`, seuls les sujets traités dans cette période.
 */
export function coverage(epics: Epic[], stories: Story[], workshops: Workshop[], phase?: string) {
  const rank = new Map(workshops.map((w, i) => [w.id, i]));
  const dated = new Set(workshops.filter(w => w.date).map(w => w.phase));
  const titleOf = new Map(
    weeksOf(workshops).map(p => [
      p,
      describeWeek(
        p,
        workshops.filter(w => w.phase === p),
      ).title,
    ]),
  );
  const rows: CoverageRow[] = epics.map(epic => {
    const match = cites(epic.id);
    const occ = workshops
      .map(w => ({ w, week: titleOf.get(w.phase) ?? w.phase, sessions: w.sessions.filter(match) }))
      .filter(o => o.sessions.length || epic.workshops.includes(o.w.id));
    const later = occ.find(o => !dated.has(o.w.phase));
    return {
      epic,
      stories: stories.filter(s => s.epic === epic.id).length,
      occ: phase ? occ.filter(o => o.w.phase === phase) : occ,
      elsewhere: phase ? occ.filter(o => o.w.phase !== phase) : [],
      status: occ.some(o => dated.has(o.w.phase)) ? 'Oui' : later ? later.week : 'Non',
    };
  });
  const first = (r: CoverageRow) => (r.occ.length ? (rank.get(r.occ[0].w.id) ?? 0) : Infinity);
  return rows
    .filter(r => !phase || r.occ.length)
    .sort((a, b) => first(a) - first(b) || a.epic.id.localeCompare(b.epic.id));
}

const day = (o: Occurrence) => (o.w.date ? capitalize(dayLabel(o.w.date)) : 'À planifier');
const th = (text: string, right = false): TableCell => ({
  text,
  bold: true,
  fontSize: 7,
  color: GREY.label,
  alignment: right ? 'right' : undefined,
});

/**
 * Tableau des sujets : une ligne par sujet, et dans sa partie droite une ligne par journée où il est
 * traité (sous-tableau aux colonnes alignées sur l'en-tête). Un sujet ne se coupe jamais entre deux pages.
 */
function table(rows: CoverageRow[], week: boolean): Content {
  const left = week ? [38, 130, 78, 18] : [38, 120, 70, 18, 52];
  const right = week ? 110 : 0;
  const pad = 6 * (left.length + 1 + (week ? 1 : 0));
  const inner = usable(true) - left.reduce((a, b) => a + b, 0) - right - pad;
  const days = week ? [74, 150] : [52, 84, 126];
  const sub = (body: TableCell[][], header = false): TableCell => ({
    table: { widths: [...days, inner - days.reduce((a, b) => a + b, 0) - 6 * days.length], body },
    layout: layout({ pad: header ? 0 : 1.5 }),
  });
  const header = [
    th('Réf.'),
    th('Intitulé'),
    th('Version'),
    th('US', true),
    ...(week ? [] : [th('Couvert')]),
    sub([[...(week ? [] : [th('Semaine')]), th('Journée'), th('Atelier'), th('Séquences')]], true),
    ...(week ? [th('Repris ensuite')] : []),
  ];
  const body = rows.map(r => {
    const occ = r.occ.map(o => [
      ...(week ? [] : [o.week]),
      { text: day(o), color: o.w.date ? undefined : GREY.muted },
      { text: [code(o.w.id), ` ${o.w.title}`] },
      o.sessions.length
        ? { stack: o.sessions.map(s => ({ text: [code(s.code), ` ${s.title}`] })) }
        : { text: 'Sans séquence dédiée', color: GREY.muted },
    ]);
    return [
      { text: r.epic.id, bold: true },
      { text: r.epic.title, bold: true },
      { text: r.epic.version, color: GREY.muted },
      { text: String(r.stories), alignment: 'right' as const },
      ...(week ? [] : [{ text: r.status, color: r.status === 'Oui' ? undefined : GREY.muted }]),
      occ.length ? sub(occ) : { text: 'Aucun atelier prévu', color: GREY.muted },
      ...(week
        ? [
            {
              color: GREY.muted,
              stack: r.elsewhere.length
                ? r.elsewhere.map(o => `${o.w.id} · ${o.w.date ? day(o) : o.week}`)
                : ['—'],
            },
          ]
        : []),
    ] as TableCell[];
  });
  return {
    table: { headerRows: 1, dontBreakRows: true, widths: [...left, inner, ...(week ? [right] : [])], body: [header, ...body] },
    layout: layout({ header: true, lines: new Set(body.map((_, i) => i + 2)), pad: 4 }),
  };
}

/**
 * Couverture des cas d'usage par les ateliers, en A4 paysage : tout le programme, ou la semaine de
 * rang `n` (à partir de 1) avec les reprises ensuite. Null si la semaine n'existe pas.
 */
export async function coveragePdf(
  project: string,
  data: { epics: Epic[]; stories: Story[]; workshops: Workshop[] },
  n?: number,
) {
  const phase = n ? weeksOf(data.workshops)[n - 1] : undefined;
  if (n && !phase) return null;
  const week = phase
    ? describeWeek(
        phase,
        data.workshops.filter(w => w.phase === phase),
      )
    : undefined;
  const rows = coverage(data.epics, data.stories, data.workshops, phase);
  const uc = rows.filter(r => /^UC/i.test(r.epic.id));
  const other = rows.filter(r => !/^UC/i.test(r.epic.id));
  const title = week ? `Cas d’usage traités en ${week.title.toLowerCase()}` : 'Couverture des cas d’usage';
  const summary = (rs: CoverageRow[]) => {
    if (week)
      return `${rs.length} traités en ${week.title.toLowerCase()}, dont ${rs.filter(r => r.elsewhere.length).length} repris ensuite`;
    const yes = rs.filter(r => r.status === 'Oui').length;
    const none = rs.filter(r => r.status === 'Non').length;
    return `${rs.length} au total : ${yes} traités pendant les semaines d’ateliers, ${rs.length - yes - none} plus tard, ${none} sans atelier`;
  };
  const pdf = await renderPdf({
    title,
    footer: [project, 'Couverture des cas d’usage', week?.label].filter(Boolean).join(' · '),
    landscape: true,
    content: [
      eyebrow(project),
      { text: title, fontSize: 18, bold: true, margin: [0, 3, 0, 1] },
      { text: week ? week.label : 'Programme des ateliers', fontSize: 10.5, color: GREY.label, margin: [0, 0, 0, 10] },
      meta([
        ['Cas d’usage', summary(uc)],
        ...(other.length ? [['Exigences', summary(other)] as [string, string]] : []),
        [
          'Lecture',
          'Une ligne par journée où le sujet est traité, dans l’ordre du planning ; les sujets sont classés par ' +
            'première journée. « US » : nombre de user stories du backlog.' +
            (week ? ' « Repris ensuite » : autres ateliers sur le même sujet.' : ''),
        ],
        ['Version', `Document de travail du ${today()}`],
      ]),
      h2('Cas d’usage du cahier des charges'),
      table(uc, !!week),
      ...(other.length
        ? [{ ...(h2('Exigences complémentaires', 0) as object), pageBreak: 'before' } as Content, table(other, !!week)]
        : []),
    ],
  });
  return { pdf, file: fileName('Couverture_UC', ...(week ? [week.title] : [])) };
}
