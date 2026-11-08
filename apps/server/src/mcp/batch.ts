import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { lines, tool, toolsOf } from './context';

/**
 * Lot d'opérations : enchaîne des appels aux autres outils en une requête, pour construire un cadrage
 * entier d'un coup. Chaque opération est enregistrée à part : un lot n'est pas annulé en cas d'échec.
 * À déclarer après tous les autres outils.
 */
export function registerBatch(server: McpServer) {
  tool(
    server,
    'executer_lot',
    {
      title: 'Exécuter un lot d’opérations',
      description:
        'Enchaîne jusqu’à 1000 appels aux autres outils de ce serveur, dans l’ordre (épiques, puis US, puis tickets…). Avec simuler=true, vérifie seulement les champs de chaque opération, sans rien écrire. Sinon, s’arrête à la première erreur par défaut ; ce qui précède reste enregistré.',
      input: {
        operations: z
          .array(z.object({ outil: z.string(), arguments: z.record(z.string(), z.unknown()).default({}) }))
          .min(1)
          .max(1000),
        simuler: z.boolean().default(false),
        continuer_sur_erreur: z.boolean().default(false),
      },
      write: true,
    },
    async a => {
      const tools = toolsOf(server);
      const report: string[] = [];
      let [done, failed] = [0, 0];
      for (const [i, op] of a.operations.entries()) {
        const at = `${i + 1}. ${op.outil}`;
        const entry = op.outil === 'executer_lot' ? undefined : tools.get(op.outil);
        const parsed = entry && z.object(entry.shape).safeParse(op.arguments);
        let error = !entry ? 'outil inconnu ou non autorisé' : '';
        if (parsed && !parsed.success)
          error = parsed.error.issues.map(x => `${x.path.join('.')} : ${x.message}`).join(' ; ');
        if (!error && a.simuler) {
          done++;
          continue;
        }
        if (!error)
          try {
            report.push(`${at} : ${await entry!.run(parsed!.data as never)}`);
            done++;
            continue;
          } catch (err) {
            error = (err as Error).message;
          }
        failed++;
        report.push(`${at} : ÉCHEC, ${error}`);
        if (!a.simuler && !a.continuer_sur_erreur) break;
      }
      const skipped = a.operations.length - done - failed;
      return lines(
        a.simuler
          ? `Simulation : ${done} opération(s) valide(s), ${failed} en erreur. Rien n’a été écrit.`
          : `Lot : ${done} réussie(s), ${failed} en échec${skipped ? `, ${skipped} non exécutée(s)` : ''}.`,
        ...report,
      );
    },
  );
}
