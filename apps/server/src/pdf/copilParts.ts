import { burndown, type GroupProgress } from '@board/shared';
import type { Content, TableCell } from 'pdfmake/interfaces';
import { shortDate } from './format';
import { GREY, h2, layout } from './render';

/** Briques du rapport COPIL : cellules, tableaux, sections, courbe du burndown. */
export const th = (text: string, right = false): TableCell => ({
  text,
  bold: true,
  fontSize: 7.5,
  color: GREY.label,
  alignment: right ? 'right' : undefined,
});
export const num = (text: string | number): TableCell => ({ text: String(text), alignment: 'right' });
export const pct = (done: number, total: number) => (total ? `${Math.round((done / total) * 100)} %` : '—');
export const none = (text: string): Content => ({ text, color: GREY.light, margin: [0, 0, 0, 2] });
export const table = (widths: (number | string)[], head: TableCell[], rows: TableCell[][]): Content =>
  rows.length
    ? {
        table: { headerRows: 1, keepWithHeaderRows: 1, dontBreakRows: true, widths, body: [head, ...rows] },
        layout: layout({ header: true, pad: 3 }),
      }
    : none('Rien à signaler.');
/** Titre et contenu : un contenu court reste sur la page de son titre. */
export const section = (title: string, body: Content, short = true): Content =>
  short ? { unbreakable: true, stack: [h2(title), body] } : { stack: [h2(title), body] };
export const dm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

/** Courbe du burndown : droite idéale en pointillés, périmètre en gris clair, reste à faire en noir. */
export function chart(b: NonNullable<ReturnType<typeof burndown>>, width: number, unit: string): Content {
  const h = 110;
  const n = b.points.length;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * width : 0);
  const y = (v: number) => h - (v / b.max) * h;
  const line = (pick: (p: (typeof b.points)[number]) => number | null) =>
    b.points.flatMap((p, i) => (pick(p) === null ? [] : [{ x: x(i), y: y(pick(p)!) }]));
  const remaining = line(p => p.remaining);
  const scope = line(p => p.scope);
  return {
    unbreakable: true,
    stack: [
      {
        text: `${b.max.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${unit}`.trim(),
        fontSize: 7,
        color: GREY.light,
        margin: [0, 0, 0, 2],
      },
      {
        canvas: [
          { type: 'line', x1: 0, y1: h, x2: width, y2: h, lineWidth: 0.5, lineColor: '#999' },
          { type: 'line', x1: 0, y1: 0, x2: 0, y2: h, lineWidth: 0.5, lineColor: '#999' },
          {
            type: 'line',
            x1: 0,
            y1: y(b.start),
            x2: width,
            y2: h,
            lineWidth: 0.6,
            lineColor: '#999',
            dash: { length: 3 },
          },
          ...(scope.length > 1
            ? [{ type: 'polyline' as const, points: scope, lineWidth: 0.8, lineColor: '#bbb' }]
            : []),
          ...(remaining.length > 1
            ? [{ type: 'polyline' as const, points: remaining, lineWidth: 1.4, lineColor: '#1a1a1a' }]
            : []),
          ...remaining.map(p => ({
            type: 'ellipse' as const,
            x: p.x,
            y: p.y,
            r1: 1.6,
            r2: 1.6,
            color: '#1a1a1a',
          })),
        ],
      },
      {
        columns: [
          { text: shortDate(b.points[0].day), fontSize: 7, color: GREY.light },
          {
            text: 'Reste à faire (trait plein), périmètre (gris), rythme idéal (pointillés)',
            fontSize: 7,
            color: GREY.muted,
            alignment: 'center',
          },
          { text: shortDate(b.points.at(-1)!.day), fontSize: 7, color: GREY.light, alignment: 'right' },
        ],
        margin: [0, 2, 0, 0],
      },
    ],
  };
}

/** Regroupements en mouvement : US validées ou en réalisation ; les autres sont seulement dénombrés. */
export const moving = (rows: GroupProgress[]) => rows.filter(r => r.stories && (r.validated || r.started));
export const groupRows = (rows: GroupProgress[], unit: (n: number) => string, count: boolean) =>
  moving(rows).map(r => [
    r.label,
    num(r.stories),
    num(r.validated),
    num(r.started),
    num(r.finished),
    num(count ? `${r.ticketsDone}/${r.tickets}` : `${unit(r.done)} / ${unit(r.total)}`),
    num(count ? pct(r.ticketsDone, r.tickets) : pct(r.done, r.total)),
  ]);
