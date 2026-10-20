import { Hono } from 'hono';
import { requireRole, type AppEnv } from '../auth';
import { fail } from '../log';
import { requireDelivery } from '../access';
import { copilPdf } from '../pdf/copil';
import { coveragePdf } from '../pdf/coverage';
import { sprintDays } from '../pilotage';
import { recettePdf } from '../pdf/recette';
import { weekPdf } from '../pdf/week';
import { programmeOrder } from '@board/shared';
import { getWorkspace } from '../repo';

/** Exports PDF construits par le serveur et livrés en téléchargement. */
export const pdfRoutes = new Hono<AppEnv>();

const read = requireRole('viewer');

const send = (doc: { pdf: Buffer; file: string }) =>
  new Response(new Uint8Array(doc.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${doc.file}"`,
      'Cache-Control': 'no-store',
    },
  });

pdfRoutes.onError((err, c) => {
  fail('pdf', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
  return c.json({ error: 'server_error' }, 500);
});

/** Planning de la semaine n : `?deroule=1` pour le détail de chaque journée. */
pdfRoutes.get('/pdf/semaine/:n', read, async c => {
  const p = c.get('project');
  const ws = await getWorkspace(p.id, p.planning);
  const doc = await weekPdf(
    p.title,
    programmeOrder(ws.workshops),
    Number(c.req.param('n')),
    c.req.query('deroule') === '1',
  );
  return doc ? send(doc) : c.json({ error: 'not_found' }, 404);
});

/** Couverture des cas d'usage : tout le programme, ou `?semaine=n`. */
pdfRoutes.get('/pdf/couverture', read, async c => {
  const p = c.get('project');
  const ws = await getWorkspace(p.id, p.planning);
  const n = Number(c.req.query('semaine')) || undefined;
  const doc = await coveragePdf(p.title, { ...ws, workshops: programmeOrder(ws.workshops) }, n);
  return doc ? send(doc) : c.json({ error: 'not_found' }, 404);
});

/** PV de recette d'une campagne (partie Réalisation). */
pdfRoutes.get('/pdf/recette/:id', read, requireDelivery, async c => {
  const p = c.get('project');
  const ws = await getWorkspace(p.id, p.planning);
  const campaign = ws.campaigns.find(x => x.id === c.req.param('id'));
  return campaign ? send(await recettePdf(p.title, campaign, ws)) : c.json({ error: 'not_found' }, 404);
});

/** Rapport de pilotage (COPIL) : tout le projet, ou `?organisation=ORG-01` pour la vue d'une organisation. */
pdfRoutes.get('/pdf/copil', read, requireDelivery, async c => {
  const p = c.get('project');
  const ws = await getWorkspace(p.id, p.planning);
  const active = ws.sprints.find(s => s.status === 'active');
  const days = active ? await sprintDays(p.id, active.id) : [];
  return send(await copilPdf(p.title, ws, days, c.req.query('organisation') ?? ''));
});
