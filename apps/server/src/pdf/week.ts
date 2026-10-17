import type { Workshop } from '@board/shared';
import type { Content } from 'pdfmake/interfaces';
import {
  agendaOf,
  capitalize,
  dayLabel,
  describeWeek,
  fileName,
  hours,
  shortDate,
  slot,
  today,
  weeksOf,
} from './format';
import { code, eyebrow, GREY, h2, layout, meta, renderPdf, rule, usable } from './render';

const WIDTH = usable(false);
const bullets = (xs: string[]): Content => ({ ul: xs, margin: [0, 0, 0, 2] });

/** Page de garde et vue d'ensemble de la semaine. */
function cover(project: string, week: ReturnType<typeof describeWeek>, workshops: Workshop[]): Content[] {
  const span = hours(workshops);
  return [
    eyebrow(project),
    { text: 'Planning des ateliers', fontSize: 20, bold: true, margin: [0, 3, 0, 1] },
    { text: week.label, fontSize: 11, color: GREY.label, margin: [0, 0, 0, 12] },
    meta([
      ...(week.details ? [['Modalités', capitalize(week.details)] as [string, string]] : []),
      [
        'Ateliers',
        `${workshops.length} journée${workshops.length > 1 ? 's' : ''}${span ? `, de ${span}` : ''}`,
      ],
      ['Version', `Document de travail du ${today()}`],
    ]),
    h2('Vue d’ensemble', 16),
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: [80, 130, '*', 48, 48],
        body: [
          ['Date', 'Atelier', 'Livrable attendu', 'PV', 'Livrable'].map((t, i) => ({
            text: t,
            bold: true,
            fontSize: 7.5,
            color: GREY.label,
            alignment: i > 2 ? ('right' as const) : undefined,
          })),
          ...workshops.map(w => [
            { stack: [capitalize(dayLabel(w.date)), code(w.id)] },
            { text: w.title, bold: true },
            w.deliverable,
            { text: shortDate(w.pvDue), alignment: 'right' as const },
            { text: shortDate(w.deliverableDue), alignment: 'right' as const },
          ]),
        ],
      },
      layout: layout({ header: true, pad: 5 }),
    },
  ];
}

/** Version courte : l'ordre du jour de chaque journée. */
function agendas(workshops: Workshop[]): Content[] {
  return [
    { ...(h2('Ordre du jour', 0) as object), pageBreak: 'before' } as Content,
    ...workshops.map(
      (w): Content => ({
        unbreakable: true,
        margin: [0, 0, 0, 12],
        stack: [
          { text: `${capitalize(dayLabel(w.date))} · ${w.id} · ${w.title}`, bold: true, fontSize: 10, margin: [0, 0, 0, 3] },
          {
            table: {
              widths: [80, '*', 150],
              body: agendaOf(w).map(it =>
                it.kind === 'break'
                  ? [
                      { text: slot(it), color: GREY.code, italics: true },
                      { text: it.title, colSpan: 2, color: GREY.code, italics: true },
                      '',
                    ]
                  : [slot(it.s), it.s.title, { text: it.s.owner, color: GREY.muted }],
              ),
            },
            layout: layout({ pad: 1.5 }),
          },
        ],
      }),
    ),
  ];
}

/** Version complète : une partie par journée, avec le déroulé de chaque séquence. */
function day(w: Workshop): Content[] {
  const fact = (label: string, text: string) => ({
    text: [{ text: `${label}  `, color: GREY.light }, text],
    fontSize: 8.5,
  });
  const slots = agendaOf(w).map((it): Content => {
    if (it.kind === 'break')
      return {
        columns: [
          { width: 88, text: slot(it) },
          { width: '*', text: it.title },
        ],
        color: GREY.code,
        italics: true,
        margin: [0, 1, 0, 3],
      };
    const s = it.s;
    const open = s.questions.filter(q => q.status !== 'Tranché');
    const decided = s.questions.filter(q => q.status === 'Tranché');
    return {
      unbreakable: true,
      margin: [0, 3, 0, 6],
      columns: [
        { width: 88, text: slot(s), color: GREY.label },
        {
          width: '*',
          stack: [
            { text: [{ text: s.title, bold: true }, '  ', code(s.code)] },
            ...(s.content ? [{ text: s.content, color: GREY.muted }] : []),
            ...(s.steps.length
              ? [
                  {
                    margin: [0, 3, 0, 3] as [number, number, number, number],
                    fontSize: 8.5,
                    stack: s.steps.map(st => ({
                      columns: [
                        { width: 45, text: slot({ start: st.start, end: null }), color: GREY.light },
                        { width: '*', text: st.title, color: '#333' },
                      ],
                    })),
                  },
                ]
              : []),
            ...(s.owner ? [fact('Porteur', s.owner)] : []),
            ...(s.outcome ? [fact('Résultat attendu', s.outcome)] : []),
            ...(open.length ? [fact('Questions à trancher', open.map(q => q.text).join(' · '))] : []),
            ...decided.map(q => fact('Décision', q.text + (q.answer ? ` : ${q.answer}` : ''))),
          ],
        },
      ],
    };
  });
  return [
    { ...(eyebrow(`${capitalize(dayLabel(w.date))} · Atelier ${w.id}`) as object), pageBreak: 'before' } as Content,
    { text: w.title, fontSize: 15, bold: true, margin: [0, 3, 0, 4] },
    {
      columns: [
        { width: '*', stack: [h2('Objectifs', 8), bullets(w.objectives)] },
        {
          width: '*',
          stack: [
            ...(w.raci.length ? [h2('Responsabilités', 8), bullets(w.raci)] : []),
            ...(w.risks.length ? [h2('Risques suivis', 8), { text: w.risks.join(', ') }] : []),
          ],
        },
      ],
      columnGap: 28,
    },
    h2('Déroulé'),
    ...slots,
    {
      unbreakable: true,
      margin: [0, 6, 0, 0],
      stack: [
        rule(WIDTH),
        h2('Livrable et engagement', 6),
        ...(w.deliverable ? [{ text: w.deliverable, margin: [0, 0, 0, 2] } as Content] : []),
        ...(w.pv ? [{ text: w.pv, margin: [0, 0, 0, 2] } as Content] : []),
        {
          text: `PV attendu le ${shortDate(w.pvDue)} · livrable le ${shortDate(w.deliverableDue)} · validation le ${shortDate(w.validationDue)}`,
          color: GREY.muted,
        },
      ],
    },
  ];
}

/**
 * Planning d'une semaine d'ateliers (rang `n` dans le programme, à partir de 1), en synthèse
 * (ordre du jour) ou avec le déroulé de chaque journée. Null si la semaine n'existe pas.
 */
export async function weekPdf(project: string, all: Workshop[], n: number, detail: boolean) {
  const phase = weeksOf(all)[n - 1];
  if (!phase) return null;
  const workshops = all.filter(w => w.phase === phase);
  const week = describeWeek(phase, workshops);
  const pdf = await renderPdf({
    title: `Planning des ateliers · ${week.title}`,
    footer: [project, 'Planning des ateliers', week.label].filter(Boolean).join(' · '),
    content: [...cover(project, week, workshops), ...(detail ? workshops.flatMap(day) : agendas(workshops))],
  });
  return { pdf, file: fileName('Planning_ateliers', week.title, ...(detail ? ['deroule'] : [])) };
}
