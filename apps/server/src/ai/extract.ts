import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import {
  changedFields,
  quoteFound,
  type Confidence,
  type ProjectSettings,
  type Proposal,
  type Reference,
  type ReferenceFields,
  type SourceItem,
} from '@board/shared';
import { env } from '../env';

/**
 * Analyse d'un échange par Claude : ce qui, dans la conversation, précise, complète ou contredit les
 * fiches Références du projet. Le résultat est une liste de propositions ; rien n'est écrit ici.
 */

const Extraction = z.object({
  proposals: z.array(
    z.object({
      action: z.enum(['create', 'update']),
      target: z.string().describe('Identifiant de la fiche visée pour « update » ; vide pour « create »'),
      subject: z.string().describe('Sujet de la fiche ; vide pour le garder inchangé'),
      says: z
        .array(z.string())
        .describe('Contenu complet de la fiche après changement, un point par élément ; vide pour le garder'),
      where: z
        .string()
        .describe('Où le lire : la source et le moment (« Réunion du 12/11, M. X ») ; vide sinon'),
      gaps: z.string().describe('Écart ou point à trancher soulevé par l’échange ; vide sinon'),
      quote: z
        .string()
        .describe('Citation exacte, mot pour mot, du passage de l’échange qui justifie la proposition'),
      rationale: z.string().describe('Pourquoi ce changement, en une ou deux phrases'),
      confidence: z.enum(['high', 'medium', 'low']),
    }),
  ),
});
type Raw = z.infer<typeof Extraction>['proposals'][number];

const SYSTEM = `Tu aides une équipe projet à tenir à jour ses fiches « Références » : chaque fiche dit, sujet par sujet, ce que prévoit le document de référence du projet, où le lire, et les écarts à trancher.

On te donne les fiches actuelles et un échange (réunion transcrite, fil de discussion, compte rendu). Repère dans l'échange les informations qui précisent, complètent ou contredisent une fiche, ou qui méritent une fiche nouvelle : exigence, règle de gestion, décision, contrainte, chiffre, écart avec le document.

Règles :
- Préfère mettre à jour une fiche existante quand le sujet est le même ; ne crée une fiche que pour un sujet absent.
- Pour une mise à jour, « says » contient la liste complète après changement (reprends les points actuels à garder), ou reste vide si seul un autre champ change.
- Une contradiction avec la fiche, ou une question laissée ouverte, va dans « gaps », sans réécrire « says ».
- « quote » est recopiée mot pour mot de l'échange, sans reformulation ; une proposition sans citation exacte sera écartée.
- Ignore les politesses, la logistique de réunion et ce qui ne concerne pas le contenu du projet.
- N'invente rien : seulement ce que dit l'échange. Une affirmation incertaine ou provisoire a une confiance basse.
- Écris en français, dans le ton sobre des fiches existantes.
- Aucune proposition n'est une réponse valable si l'échange n'apporte rien.`;

/** Un client par clé : chaque projet appelle Claude avec sa propre clé. */
const clients = new Map<string, Anthropic>();
const anthropic = (apiKey: string) => {
  let client = clients.get(apiKey);
  if (!client) clients.set(apiKey, (client = new Anthropic({ apiKey })));
  return client;
};

/** Vérifie qu'une clé est acceptée et donne accès au modèle configuré, sans consommer de jetons. */
export async function checkKey(apiKey: string) {
  try {
    await anthropic(apiKey).models.retrieve(env.ai.model);
    return { ok: true as const };
  } catch (e) {
    clients.delete(apiKey);
    return { ok: false as const, message: explain(e) };
  }
}

/** Message lisible pour une erreur de l'API Claude. */
export function explain(e: unknown) {
  if (e instanceof Anthropic.AuthenticationError)
    return 'Clé Claude refusée par Anthropic : vérifiez-la ou remplacez-la.';
  if (e instanceof Anthropic.PermissionDeniedError)
    return 'Cette clé Claude n’a pas accès à ce service : vérifiez ses droits dans la console Anthropic.';
  if (e instanceof Anthropic.NotFoundError)
    return `Le modèle ${env.ai.model} n’est pas accessible avec cette clé.`;
  if (e instanceof Anthropic.RateLimitError)
    return 'Limite ou crédit Anthropic atteint pour cette clé : réessayez plus tard ou vérifiez le compte.';
  if (e instanceof Anthropic.APIConnectionError) return 'Anthropic injoignable, réessayez dans un moment.';
  if (e instanceof Anthropic.APIError && e.status === 400 && /credit/i.test(e.message))
    return 'Crédit Anthropic épuisé pour cette clé : rechargez le compte.';
  return e instanceof Error ? e.message : 'Analyse impossible, réessayez.';
}

const context = (settings: ProjectSettings, references: Reference[], source: SourceItem) =>
  [
    `Document de référence du projet : ${settings.referenceDocument}.`,
    '',
    `Fiches actuelles (${references.length}) :`,
    JSON.stringify(
      references.map(r => ({ id: r.id, subject: r.subject, says: r.says, where: r.where, gaps: r.gaps })),
    ),
    '',
    `Échange à analyser : « ${source.title} »${source.occurredAt ? `, du ${source.occurredAt}` : ''}${
      source.participants ? `, participants : ${source.participants}` : ''
    }.`,
    '<echange>',
    source.text,
    '</echange>',
  ].join('\n');

export type Draft = Pick<Proposal, 'kind' | 'target' | 'fields' | 'quote' | 'rationale' | 'confidence'>;

/** Garde les propositions vérifiables : citation retrouvée, fiche visée existante, changement réel. */
export function keep(raw: Raw[], references: Reference[], text: string): Draft[] {
  const seen = new Set<string>();
  const out: Draft[] = [];
  for (const p of raw) {
    if (!quoteFound(text, p.quote)) continue;
    const target = p.action === 'update' ? references.find(r => r.id === p.target.trim()) : undefined;
    if (p.action === 'update' && !target) continue;
    const wanted: ReferenceFields = { subject: p.subject, says: p.says, where: p.where, gaps: p.gaps };
    const fields = changedFields(target ?? null, wanted);
    if (!Object.keys(fields).length || (!target && !fields.subject)) continue;
    const key = `${target?.id ?? ''}|${JSON.stringify(fields)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind: target ? 'reference.update' : 'reference.create',
      target: target?.id ?? '',
      fields,
      quote: p.quote.trim(),
      rationale: p.rationale.trim(),
      confidence: p.confidence as Confidence,
    });
  }
  return out;
}

/** Appelle Claude et renvoie les propositions retenues ; lève une erreur lisible en cas d'échec. */
export async function extract(
  apiKey: string,
  settings: ProjectSettings,
  references: Reference[],
  source: SourceItem,
) {
  const response = await anthropic(apiKey).beta.messages.parse({
    model: env.ai.model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: env.ai.effort, format: betaZodOutputFormat(Extraction) },
    system: SYSTEM,
    messages: [{ role: 'user', content: context(settings, references, source) }],
  });
  if (response.stop_reason === 'refusal')
    throw new Error(
      `Analyse refusée par le modèle${response.stop_details?.category ? ` (${response.stop_details.category})` : ''}.`,
    );
  if (response.stop_reason === 'max_tokens')
    throw new Error('Réponse trop longue : découpez l’échange et relancez.');
  if (!response.parsed_output) throw new Error('Réponse de l’IA illisible, relancez l’analyse.');
  const raw = response.parsed_output.proposals;
  return { drafts: keep(raw, references, source.text), proposed: raw.length };
}
