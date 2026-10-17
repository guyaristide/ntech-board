import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pdfmake from 'pdfmake';
import type { Content, CustomTableLayout, TDocumentDefinitions } from 'pdfmake/interfaces';

/**
 * Socle des documents PDF, construits par le serveur avec pdfmake (sans navigateur) : police Roboto
 * embarquée, A4, sobre (noir et gris, peu de filets), pied de page avec le titre et la pagination.
 */
const fontDir = dirname(fileURLToPath(import.meta.resolve('pdfmake/fonts/Roboto/Roboto-Regular.ttf')));
pdfmake.setFonts({
  Roboto: {
    normal: join(fontDir, 'Roboto-Regular.ttf'),
    bold: join(fontDir, 'Roboto-Medium.ttf'),
    italics: join(fontDir, 'Roboto-Italic.ttf'),
    bolditalics: join(fontDir, 'Roboto-MediumItalic.ttf'),
  },
});
// Aucune ressource externe ; seuls les fichiers de la police sont lus.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(path => path.startsWith(fontDir));

const mm = (n: number) => (n * 72) / 25.4;
export const GREY = { text: '#1a1a1a', label: '#444', muted: '#555', light: '#777', code: '#888' };

/** Largeur utile de la page, en points. */
export const usable = (landscape: boolean) => (landscape ? 841.89 - 2 * mm(14) : 595.28 - 2 * mm(18));

export const eyebrow = (text: string): Content => ({
  text: text.toUpperCase(),
  fontSize: 7,
  characterSpacing: 1,
  color: '#666',
});
export const h2 = (text: string, top = 14): Content => ({
  text: text.toUpperCase(),
  fontSize: 7.5,
  bold: true,
  characterSpacing: 0.8,
  color: GREY.label,
  margin: [0, top, 0, 5],
});
export const rule = (width: number, color = '#bbb'): Content => ({
  canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.5, lineColor: color }],
});
export const code = (text: string) => ({ text, fontSize: 7.5, color: GREY.code });

/** Tableau sobre : un filet sous l'en-tête, d'autres filets fins aux lignes indiquées. */
export function layout(o: { header?: boolean; lines?: Set<number>; pad?: number } = {}): CustomTableLayout {
  const pad = o.pad ?? 4;
  return {
    hLineWidth: i => ((o.header && i === 1) || o.lines?.has(i) ? 0.5 : 0),
    hLineColor: i => (o.header && i === 1 ? '#999' : '#ddd'),
    vLineWidth: () => 0,
    paddingLeft: () => 0,
    paddingRight: () => 6,
    paddingTop: i => (o.header && i === 0 ? 0 : pad),
    paddingBottom: () => pad,
  };
}

/** Bloc « libellé : valeur » encadré de deux filets, sous le titre. */
export function meta(rows: [string, string][]): Content {
  return {
    table: {
      widths: [mm(28) - 6, '*'],
      body: rows.map(([k, v]) => [{ text: k, color: '#666' }, v]),
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.5 : 0),
      hLineColor: () => '#bbb',
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 6,
      paddingTop: i => (i === 0 ? 7 : 1.5),
      paddingBottom: (i, node) => (i === node.table.body.length - 1 ? 7 : 1.5),
    },
  };
}

/** Assemble et rend le document. */
export async function renderPdf(o: {
  title: string;
  footer: string;
  landscape?: boolean;
  content: Content[];
}): Promise<Buffer> {
  const side = mm(o.landscape ? 14 : 18);
  const def: TDocumentDefinitions = {
    pageSize: 'A4',
    pageOrientation: o.landscape ? 'landscape' : 'portrait',
    pageMargins: [side, side, side, mm(o.landscape ? 16 : 20)],
    info: { title: o.title, creator: 'NTECH Board', producer: 'NTECH Board' },
    defaultStyle: { font: 'Roboto', fontSize: o.landscape ? 8 : 9, lineHeight: 1.2, color: GREY.text },
    footer: (page, pages) => ({
      columns: [{ text: o.footer }, { text: `Page ${page} / ${pages}`, alignment: 'right', width: 'auto' }],
      margin: [side, mm(4), side, 0],
      fontSize: 7,
      color: GREY.light,
    }),
    content: o.content,
  };
  return (await pdfmake.createPdf(def).getBuffer()) as Buffer;
}
