import ExcelJS from 'exceljs';
import {
  RISK_STATUSES,
  RISK_VALIDATIONS,
  type Block,
  type Cotation,
  type Phase,
  type RaciActor,
  type RaciRow,
  type RaciValue,
  type Risk,
  type RiskAction,
  type RiskReview,
} from '@board/shared';
import { uid } from '../merge';
import { clean, iso, rowsOf } from './planning';

/**
 * Lecture des classeurs de gouvernance : matrice RACI (onglet « RACI ») et matrice des risques
 * (onglets « REGISTRE CONSOLIDE » et « PLAN ACTIONS »). Les classeurs ne sont jamais modifiés.
 */
export interface RawRaci {
  source: string;
  phases: Phase[];
}
export interface RawRisks {
  source: string;
  risks: Risk[];
}

type Row = (string | Date | number | null)[];

async function workbook(buffer: ArrayBuffer | Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  return (name: string) => wb.worksheets.find(w => clean(w.name).toUpperCase() === name.toUpperCase());
}

/** Lignes de données sous l'en-tête (repéré par sa première cellule), lues par nom de colonne. */
function table(rows: Row[], first: string) {
  const at = rows.findIndex(r => clean(r[0]) === first);
  if (at < 0) return { header: [] as string[], rows: [] as Row[] };
  return { header: rows[at].map(clean), rows: rows.slice(at + 1) };
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

const raciValue = (v: unknown): RaciValue => {
  const s = clean(v).toUpperCase().replace(/\s/g, '');
  if (s === 'A/R' || s === 'R/A' || s === 'AR') return 'A/R';
  return (['R', 'A', 'C', 'I'] as const).find(x => x === s) ?? '';
};

/** Matrice RACI : chaque section numérotée (« 2. Cadrage (13 au 23 octobre) ») devient une phase. */
export async function parseRaci(buffer: ArrayBuffer | Buffer, source: string): Promise<RawRaci> {
  const sheet = await workbook(buffer);
  if (!sheet('RACI')) throw new Error('Onglet « RACI » introuvable dans le classeur.');
  const all = rowsOf(sheet('RACI'), 40);
  const { header, rows } = table(all, 'N°');
  if (header[1] !== 'Activité') throw new Error('En-tête « N° | Activité | Livrable » introuvable.');
  const end = header.findIndex((h, i) => i > 2 && (h === 'Contrôle' || h === ''));
  const actors: RaciActor[] = header.slice(3, end < 0 ? undefined : end).map(name => ({
    id: slug(name),
    name: name.replace(/\s*\(.*?\)\s*/g, ' ').trim(),
  }));
  const phases: Phase[] = [];
  for (const r of rows) {
    const head = clean(r[0]).match(/^(\d+)\.\s*(.+)$/);
    if (head && !clean(r[1])) {
      const [, n, label] = head;
      const detail = label.match(/^(.*?)\s*\((.*)\)\s*$/);
      phases.push({
        id: `P${n}`,
        title: detail ? detail[1] : label,
        summary: detail ? detail[2] : '',
        start: null,
        end: null,
        status: 'À venir',
        actors,
        raci: [],
        notes: [],
        comments: [],
      });
      continue;
    }
    if (typeof r[0] !== 'number' || !phases.length) continue;
    const cells = Object.fromEntries(
      actors.map((a, i) => [a.id, raciValue(r[3 + i])]).filter(([, v]) => v),
    ) as RaciRow['cells'];
    phases[phases.length - 1].raci.push({
      id: `L${String(r[0]).padStart(2, '0')}`,
      activity: clean(r[1]),
      deliverable: clean(r[2]),
      cells,
    });
  }
  if (!phases.length) throw new Error('Aucune section numérotée (« 1. … ») trouvée dans l’onglet RACI.');
  return { source, phases };
}

const level = (v: unknown) => (typeof v === 'number' && v >= 1 && v <= 5 ? Math.round(v) : null);
const due = (v: unknown) => iso(v) ?? (['', 'À définir'].includes(clean(v)) ? '' : clean(v));
const pick = <T extends string>(values: readonly T[], v: unknown, fallback: T) =>
  values.find(x => x === clean(v)) ?? fallback;

/** Registre consolidé des risques et plan d'actions. Les revues sont rattachées à la phase en cours à l'import. */
export async function parseRisks(buffer: ArrayBuffer | Buffer, source: string): Promise<RawRisks> {
  const sheet = await workbook(buffer);
  const register = sheet('REGISTRE CONSOLIDE') ?? sheet('REGISTRE');
  if (!register) throw new Error('Onglet « REGISTRE CONSOLIDE » introuvable dans le classeur.');

  const plan = table(rowsOf(sheet('PLAN ACTIONS'), 12), 'ID action');
  const col = (h: string[], name: string) => h.findIndex(x => x.toLowerCase().startsWith(name.toLowerCase()));
  const actionsOf = new Map<string, RiskAction[]>();
  for (const r of plan.rows) {
    const get = (name: string) => r[col(plan.header, name)];
    const risk = clean(get('Risque lié'));
    if (!risk || !clean(get('Action'))) continue;
    actionsOf.set(risk, [
      ...(actionsOf.get(risk) ?? []),
      {
        id: clean(get('ID action')) || uid(),
        text: clean(get('Action')),
        nature: pick(['Préventive', 'Corrective', 'Contingence'] as const, get('Nature'), 'Préventive'),
        owner: clean(get('Responsable')),
        due: due(get('Échéance')),
        status: pick(
          ['À planifier', 'En cours', 'Réalisée', 'Abandonnée'] as const,
          get('Statut'),
          'À planifier',
        ),
        evidence: clean(get('Preuve')),
      },
    ]);
  }

  const reg = table(rowsOf(register, 40), 'ID');
  const risks: Risk[] = [];
  for (const r of reg.rows) {
    const get = (name: string) => r[col(reg.header, name)];
    const id = clean(get('ID'));
    if (!/^R/.test(id) || !clean(get('Risque'))) continue;
    const initial: Cotation = { p: level(get('P initiale')), i: level(get('I initial')) };
    const residual: Cotation = { p: level(get('P résiduelle')), i: level(get('I résiduel')) };
    const status = pick(RISK_STATUSES, get('Statut'), 'Ouvert');
    const reviewed = iso(get('Dernière revue'));
    const reviews: RiskReview[] =
      reviewed && initial.p
        ? [
            {
              id: uid(),
              at: reviewed,
              phase: '',
              initial,
              residual,
              status,
              comment: `Cotation reprise de ${source}.`,
              author: 'Import',
            },
          ]
        : [];
    const followUp = clean(get('Commentaires'));
    const notes: Block[] =
      followUp && followUp !== 'À évaluer' ? [{ id: uid(), type: 'p', text: followUp }] : [];
    risks.push({
      id,
      scope: clean(get('Périmètre')),
      category: clean(get('Catégorie')),
      title: clean(get('Risque')),
      cause: clean(get('Cause')),
      consequence: clean(get('Conséquence')),
      initial,
      residual,
      mitigation: clean(get('Mitigation')),
      contingency: clean(get('Contingence')),
      owner: clean(get('Propriétaire')),
      actionOwner: clean(get('Responsable action')),
      authority: clean(get('Autorité')),
      due: due(get('Échéance')),
      indicator: ['', 'À définir'].includes(clean(get('Indicateur'))) ? '' : clean(get('Indicateur')),
      status,
      validation: pick(RISK_VALIDATIONS, get('Validation'), 'À valider'),
      source: clean(get('Source')) || source,
      actions: actionsOf.get(id) ?? [],
      reviews,
      notes,
      comments: [],
    });
  }
  if (!risks.length) throw new Error('Aucun risque trouvé dans le registre.');
  return { source, risks };
}
