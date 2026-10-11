import { Hono } from 'hono';
import { z } from 'zod';
import { ROLE_LABEL, ROLES } from '@board/shared';
import { originOf, requireRole, type AppEnv } from '../auth';
import { importPhases, importPlanning, importRisks, importStories } from '../imports';
import { parseRaci, parseRisks, type RawRaci, type RawRisks } from '../importers/governance';
import { parsePlanning } from '../importers/planning';
import { sendInvitation } from '../mail';
import type { RawStories } from '../merge';
import { addMember, adminCount, listMembers, removeMember, setRole, updateProject } from '../projects';
import { getWorkspace } from '../repo';
import { saveUpload } from '../storage';

/** Administration d'un projet : membres, invitations, imports, export. */
export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('*', requireRole('admin'));

adminRoutes.get('/members', async c => c.json(await listMembers(c.get('project').id)));

const Invite = z.object({
  email: z.email().max(200),
  name: z.string().trim().max(80).default(''),
  role: z.enum(ROLES),
  notify: z.boolean().default(true),
});

adminRoutes.post('/members', async c => {
  const input = Invite.safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: 'invalid' }, 400);
  const p = c.get('project');
  const user = c.get('user')!;
  await addMember(p.id, input.data.email, input.data.role, input.data.name, user.id);
  if (input.data.notify) {
    try {
      await sendInvitation(
        input.data.email,
        p.title,
        user.name || user.email,
        ROLE_LABEL[input.data.role],
        originOf(c),
        originOf(c),
      );
    } catch (e) {
      console.error(`Invitation non envoyée (${input.data.email}) : ${(e as Error).message}`);
      return c.json(
        { error: 'mail_failed', message: 'Membre ajouté, mais l’e-mail d’invitation n’a pas pu partir.' },
        502,
      );
    }
  }
  return c.json(await listMembers(p.id), 201);
});

adminRoutes.patch('/members/:userId', async c => {
  const input = z.object({ role: z.enum(ROLES) }).safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: 'invalid' }, 400);
  const p = c.get('project');
  const userId = c.req.param('userId');
  const members = await listMembers(p.id);
  if (
    members.find(m => m.userId === userId)?.role === 'admin' &&
    input.data.role !== 'admin' &&
    (await adminCount(p.id)) <= 1
  )
    return c.json({ error: 'last_admin' }, 409);
  await setRole(p.id, userId, input.data.role);
  return c.json(await listMembers(p.id));
});

adminRoutes.delete('/members/:userId', async c => {
  const p = c.get('project');
  const userId = c.req.param('userId');
  const members = await listMembers(p.id);
  if (members.find(m => m.userId === userId)?.role === 'admin' && (await adminCount(p.id)) <= 1)
    return c.json({ error: 'last_admin' }, 409);
  await removeMember(p.id, userId);
  return c.json(await listMembers(p.id));
});

adminRoutes.patch('/project', async c => {
  const input = z
    .object({ title: z.string().trim().min(1).max(120), subtitle: z.string().trim().max(300) })
    .partial()
    .safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: 'invalid' }, 400);
  const p = c.get('project');
  await updateProject(p.id, p.slug, input.data);
  return c.json({ ok: true });
});

const MAX_UPLOAD = 15 * 1024 * 1024;

/** Import d'un planning d'ateliers (.xlsx) ; le fichier est conservé dans le stockage du projet. */
adminRoutes.post('/import/planning', async c => {
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx'))
    return c.json({ error: 'xlsx_required' }, 400);
  if (file.size > MAX_UPLOAD) return c.json({ error: 'too_large' }, 413);
  const buffer = Buffer.from(await file.arrayBuffer());
  const p = c.get('project');
  await saveUpload(p.slug, file.name, buffer);
  try {
    const planning = await parsePlanning(buffer, file.name);
    return c.json(await importPlanning(p.id, planning, c.get('user')!.id));
  } catch (e) {
    return c.json({ error: 'parse_failed', message: (e as Error).message }, 422);
  }
});

/** Import du backlog (JSON { epics, stories }). */
adminRoutes.post('/import/stories', async c => {
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) return c.json({ error: 'file_required' }, 400);
  if (file.size > MAX_UPLOAD) return c.json({ error: 'too_large' }, 413);
  const text = await file.text();
  const p = c.get('project');
  await saveUpload(p.slug, file.name, Buffer.from(text));
  try {
    return c.json(await importStories(p.id, JSON.parse(text) as RawStories, c.get('user')!.id));
  } catch (e) {
    return c.json({ error: 'parse_failed', message: (e as Error).message }, 422);
  }
});

/** Import de la matrice RACI (phases) ou de la matrice des risques : classeur .xlsx ou JSON. */
adminRoutes.post('/import/:what{raci|risks}', async c => {
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) return c.json({ error: 'file_required' }, 400);
  if (file.size > MAX_UPLOAD) return c.json({ error: 'too_large' }, 413);
  const buffer = Buffer.from(await file.arrayBuffer());
  const p = c.get('project');
  const userId = c.get('user')!.id;
  const json = file.name.toLowerCase().endsWith('.json');
  await saveUpload(p.slug, file.name, buffer);
  try {
    if (c.req.param('what') === 'raci') {
      const raw = json
        ? (JSON.parse(buffer.toString('utf8')) as RawRaci)
        : await parseRaci(buffer, file.name);
      return c.json(await importPhases(p.id, raw, userId));
    }
    const raw = json
      ? (JSON.parse(buffer.toString('utf8')) as RawRisks)
      : await parseRisks(buffer, file.name);
    return c.json(await importRisks(p.id, raw, userId));
  } catch (e) {
    return c.json({ error: 'parse_failed', message: (e as Error).message }, 422);
  }
});

adminRoutes.get('/export', async c => {
  const p = c.get('project');
  const data = await getWorkspace(p.id, p.planning);
  c.header(
    'Content-Disposition',
    `attachment; filename="${p.slug}-${new Date().toISOString().slice(0, 10)}.json"`,
  );
  return c.json({ project: { slug: p.slug, title: p.title, subtitle: p.subtitle }, ...data });
});
