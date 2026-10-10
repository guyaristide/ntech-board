import ExcelJS from 'exceljs';
import type { Reference } from '@board/shared';

/**
 * Lecture du planning des ateliers (classeur Excel, onglets « Planning », « Suivi des PV »
 * et « Références CdC »). Le classeur n'est jamais modifié.
 */
export interface RawStep {
  start: string | null;
  end: string | null;
  title: string;
  minutes: number | null;
}
export interface RawSession {
  code: string;
  atelier: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  title: string;
  content: string;
  owner: string;
  outcome: string;
  questions: string[];
  added: boolean;
  cdc: string;
  refs: string[];
  steps: RawStep[];
}
export type RawAgenda =
  | { kind: 'session'; code: string }
  | { kind: 'break'; start: string | null; end: string | null; title: string };
export interface RawWorkshop {
  id: string;
  title: string;
  phase: string;
  objectives: string[];
  questionnaire: string;
  raci: string[];
  risks: string[];
  deliverable: string;
  pv: string;
  sessions: RawSession[];
  agenda: RawAgenda[];
  prep: { tab: string; due: string | null; questions: number; status: string }[];
  date: string | null;
  pvDue: string | null;
  deliverableDue: string | null;
  validationDue: string | null;
  pvStatus: string;
}
export interface RawPlanning {
  source: string;
  references: Reference[];
  workshops: RawWorkshop[];
}

type Cell = ExcelJS.CellValue;

/** Valeur lisible d'une cellule : texte riche, lien, formule (résultat) ou date. */
const raw = (v: Cell): string | Date | number | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return String(v);
  if ('richText' in v) return v.richText.map(r => r.text).join('');
  if ('text' in v && typeof v.text === 'string') return v.text;
  if ('result' in v) return raw(v.result as Cell);
  return null;
};

export const clean = (s: unknown) =>
  s === null || s === undefined
    ? ''
    : String(s)
        .replace(/[–—]/g, '-')
        .replace(/ /g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();

const bullets = (s: unknown) =>
  String(s ?? '')
    .split('\n')
    .map(l => clean(l.replace(/^\s*[•-]\s*/, '')))
    .filter(Boolean);

const times = (s: string): [string | null, string | null] => {
  const m = [...(s ?? '').matchAll(/(\d{2}):(\d{2})/g)];
  return m.length >= 2 ? [`${m[0][1]}:${m[0][2]}`, `${m[1][1]}:${m[1][2]}`] : [null, null];
};

const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : null);

/** Lignes d'une feuille, sous forme de tableaux de valeurs (colonne A à l'indice 0). */
function rowsOf(sheet: ExcelJS.Worksheet | undefined, width: number) {
  const out: (string | Date | number | null)[][] = [];
  sheet?.eachRow({ includeEmpty: false }, row => {
    const cells: (string | Date | number | null)[] = [];
    for (let i = 1; i <= width; i++) {
      const cell = row.getCell(i);
      // Une cellule fusionnée renvoie la valeur de la cellule maîtresse : on ne garde que celle-ci.
      cells.push(cell.isMerged && cell.master.address !== cell.address ? null : raw(cell.value));
    }
    out.push(cells);
  });
  return out;
}

const CODE = /^((J\d+)\.\d+|(C\d))\s+([\s\S]*)$/;

export async function parsePlanning(buffer: ArrayBuffer | Buffer, source: string): Promise<RawPlanning> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  const sheet = (name: string) => wb.worksheets.find(w => w.name.trim() === name);
  if (!sheet('Planning')) throw new Error('Onglet « Planning » introuvable dans le classeur.');

  const references: Reference[] = rowsOf(sheet('Références CdC'), 6)
    .filter(r => /^R\d+$/.test(clean(r[0])))
    .map(r => ({
      id: clean(r[0]),
      subject: clean(r[1]),
      says: bullets(r[2]),
      where: clean(r[3]),
      gaps: ['', '-'].includes(clean(r[4])) ? '' : clean(r[4]),
      sessions: clean(r[5]).match(/\b(?:J\d+\.\d+|C\d)\b/g) ?? [],
    }));

  interface Block {
    header: string;
    phase: string;
    objectives: string[];
    questionnaire: string;
    raci: string[];
    risks: string[];
    deliverable: string;
    pv: string;
    sessions: RawSession[];
    agenda: RawAgenda[];
  }
  const blocks: Block[] = [];
  let block: Block | null = null;
  let session: RawSession | null = null;
  let phase = '';

  for (const r of rowsOf(sheet('Planning'), 7)) {
    const [a, b, c, d, e, f, g] = r;
    const A = clean(a);
    const B = clean(b);
    if (A === 'Horaire' || r.every(x => x === null)) continue;
    if (b === null && c === null && a !== null) {
      const text = String(a);
      const first = clean(text.split('\n')[0]);
      if (/^(SEMAINE|Après)/.test(first)) phase = first;
      else if (!block && !/^(J\d+|C\d)/.test(first)) continue;
      else if (text.startsWith('Objectifs')) block!.objectives = bullets(text.split(':').slice(1).join(':'));
      else if (/^(Questionnaire|RACI|Risques)/.test(text)) {
        for (const line of text.split('\n').map(clean)) {
          if (line.startsWith('Questionnaire'))
            block!.questionnaire = line.split(':').slice(1).join(':').trim();
          else if (line.startsWith('RACI')) block!.raci.push(line.split('·').slice(1).join('·').trim());
          else if (line.startsWith('Risques'))
            block!.risks = line.split(':').slice(1).join(':').split('·').map(clean);
        }
      } else if (text.startsWith('Livrable')) block!.deliverable = clean(text.split(':').slice(1).join(':'));
      else if (/^(PV |Un PV)/.test(text)) block!.pv = clean(text);
      else {
        block = {
          header: first,
          phase,
          objectives: [],
          questionnaire: '',
          raci: [],
          risks: [],
          deliverable: '',
          pv: '',
          sessions: [],
          agenda: [],
        };
        blocks.push(block);
      }
      continue;
    }
    if (!block) continue;
    if (B.startsWith('›')) {
      const [start, end] = times(A);
      const m = /\((\d+) min\)\s*$/.exec(B);
      session?.steps.push({
        start,
        end,
        title: clean(B.slice(1).replace(/\(\d+ min\)\s*$/, '')),
        minutes: m ? Number(m[1]) : null,
      });
      continue;
    }
    const [start, end] = times(A);
    const m = CODE.exec(B);
    if (m) {
      session = {
        code: m[1],
        atelier: m[2] ?? m[3],
        start,
        end,
        allDay: A.includes('Journée'),
        title: clean(m[4].replace('Séquence ajoutée', '')),
        content: clean(c),
        owner: clean(d),
        outcome: clean(e),
        questions: bullets(f),
        added: m[4].includes('Séquence ajoutée'),
        cdc: clean(g).replace(/^→\s*/, ''),
        refs: [],
        steps: [],
      };
      block.sessions.push(session);
      block.agenda.push({ kind: 'session', code: session.code });
    } else if (B) {
      block.agenda.push({ kind: 'break', start, end, title: B });
    }
  }
  for (const blk of blocks)
    for (const s of blk.sessions) s.refs = references.filter(r => r.sessions.includes(s.code)).map(r => r.id);

  // Dates, thèmes et questionnaires : onglet « Suivi des PV ».
  const pv = new Map<
    string,
    Pick<RawWorkshop, 'date' | 'pvDue' | 'deliverableDue' | 'validationDue' | 'pvStatus'> & { theme: string }
  >();
  const prep = new Map<string, RawWorkshop['prep']>();
  for (const r of rowsOf(sheet('Suivi des PV'), 7)) {
    const k = clean(r[0]);
    const second = clean(r[1]);
    if (
      /^(J\d+|C\d)$/.test(k) &&
      !pv.has(k) &&
      !/^A\d/.test(second) &&
      (r[2] === null || r[2] instanceof Date)
    ) {
      pv.set(k, {
        theme: second,
        date: iso(r[2]),
        pvDue: iso(r[3]),
        deliverableDue: iso(r[4]),
        validationDue: iso(r[5]),
        pvStatus: clean(r[6]) || 'À faire',
      });
    } else if (k && /^A\d/.test(second) && r[2] instanceof Date) {
      for (const key of k.match(/J\d+/g) ?? [])
        prep.set(key, [
          ...(prep.get(key) ?? []),
          { tab: second, due: iso(r[2]), questions: Number(r[3] ?? 0), status: clean(r[6]) },
        ]);
    }
  }
  const dates = (id: string) => {
    const { theme: _theme, ...rest } = pv.get(id) ?? {
      theme: '',
      date: null,
      pvDue: null,
      deliverableDue: null,
      validationDue: null,
      pvStatus: 'À faire',
    };
    return rest;
  };

  const workshops: RawWorkshop[] = [];
  for (const blk of blocks) {
    if (!blk.sessions.length) continue;
    if (blk.sessions[0].atelier.startsWith('C')) {
      blk.sessions.forEach((s, i) =>
        workshops.push({
          id: s.atelier,
          title: pv.get(s.atelier)?.theme || s.title,
          phase: blk.phase || blk.header,
          objectives: i === 0 ? blk.objectives : [],
          questionnaire: '',
          raci: blk.raci,
          risks: [],
          deliverable: blk.deliverable,
          pv: blk.pv,
          sessions: [s],
          agenda: [{ kind: 'session', code: s.code }],
          prep: [],
          ...dates(s.atelier),
        }),
      );
      continue;
    }
    const id = blk.sessions[0].atelier;
    workshops.push({
      id,
      title: pv.get(id)?.theme || blk.header,
      phase: blk.phase,
      objectives: blk.objectives,
      questionnaire: blk.questionnaire,
      raci: blk.raci,
      risks: blk.risks,
      deliverable: blk.deliverable,
      pv: blk.pv,
      sessions: blk.sessions,
      agenda: blk.agenda,
      prep: prep.get(id) ?? [],
      ...dates(id),
    });
  }
  const rank = (id: string) => (id.startsWith('C') ? 1000 : 0) + Number(id.slice(1));
  workshops.sort((x, y) => rank(x.id) - rank(y.id));
  return { source, references, workshops };
}
