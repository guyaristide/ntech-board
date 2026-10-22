import type { Cotation, Risk, RiskAction } from '@board/shared';
import type { Column } from '../../ui/ExportButton';
import { frDate } from '../exportFormat';
import { levelOf, scoreOf } from './riskView';

/** Colonnes d'export du registre des risques et du plan d'actions. */

const pi = (c: Cotation) => (c.p && c.i ? `P${c.p} × I${c.i}` : '');

export const RISK_COLUMNS: Column<Risk>[] = [
  ['ID', r => r.id],
  ['Périmètre', r => r.scope],
  ['Catégorie', r => r.category],
  ['Risque', r => r.title],
  ['Cause', r => r.cause],
  ['Conséquence', r => r.consequence],
  ['Cotation initiale', r => pi(r.initial)],
  ['Score initial', r => scoreOf(r.initial)],
  ['Niveau initial', r => levelOf(r.initial) ?? 'À évaluer'],
  ['Cotation résiduelle', r => pi(r.residual)],
  ['Score résiduel', r => scoreOf(r.residual)],
  ['Niveau résiduel', r => levelOf(r.residual) ?? 'À évaluer'],
  ['Atténuation', r => r.mitigation],
  ['Contingence', r => r.contingency],
  ['Propriétaire', r => r.owner],
  ['Responsable de l’action', r => r.actionOwner],
  ['Autorité', r => r.authority],
  ['Échéance', r => frDate(r.due)],
  ['Indicateur', r => r.indicator],
  ['Statut', r => r.status],
  ['Validation', r => r.validation],
  ['Actions', r => r.actions.length],
  ['Source', r => r.source],
];

export const ACTION_COLUMNS: Column<{ r: Risk; a: RiskAction }>[] = [
  ['Risque', x => x.r.id],
  ['Intitulé du risque', x => x.r.title],
  ['Action', x => x.a.text],
  ['Nature', x => x.a.nature],
  ['Responsable', x => x.a.owner],
  ['Échéance', x => frDate(x.a.due)],
  ['Statut', x => x.a.status],
  ['Preuve', x => x.a.evidence],
];
