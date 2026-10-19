import {
  amount,
  attention,
  burndown,
  byCount,
  CAMPAIGN_MODE_LABEL,
  casesOf,
  delivered,
  forecast,
  hasVerdicts,
  isBlocked,
  isDone,
  mentionsOrganization,
  partiesOfOrganization,
  platformKeys,
  platformsOf,
  progressBy,
  releaseProgress,
  stepOf,
  testSummary,
  velocity,
  type GroupProgress,
  type SprintDay,
  type Ticket,
  type WorkspaceData,
} from '@board/shared';
import type { Content, TableCell } from 'pdfmake/interfaces';
import { chart, dm, groupRows, none, num, pct, section, table, th } from './copilParts';
import { fileName, shortDate, today } from './format';
import { code, eyebrow, GREY, h2, meta, renderPdf, usable } from './render';
/**
 * Rapport de pilotage pour le comité : sprint en cours et burndown, vélocité, versions et
 * prévisions, avancement par cas d'usage et par plateforme, recette, points d'attention. Avec une
 * organisation, les actions et points d'attention se limitent à ce qui la concerne.
 */
export async function copilPdf(project: string, ws: WorkspaceData, days: SprintDay[], org = '') {
  const s = ws.settings;
  const count = byCount(s);
  const unit = (n: number) => amount(n, s);
  const width = usable(false);
  const organization = ws.parties.find(p => p.id === org && p.type === 'organization');
  const members = organization ? partiesOfOrganization(ws.parties, organization.id) : null;
  const concerns = (text: string) => !organization || mentionsOrganization(ws.parties, organization.id, text);
  const ours = (t: Ticket) => !members || members.has(t.assignee);
  const who = (id: string) => ws.parties.find(p => p.id === id)?.name ?? '';

  const active = ws.sprints.find(x => x.status === 'active');
  const current =
    ws.releases.find(r => r.status === 'En cours') ?? ws.releases.find(r => r.status === 'Prévue');
  const v = velocity(ws.sprints, count);
  const sprintTickets = active ? ws.tickets.filter(t => t.sprint === active.id) : [];
  const sprintDone = sprintTickets.filter(t => isDone(s, t));
  const b = active ? burndown(s, active, days) : null;
  const blocked = ws.tickets.filter(t => !isDone(s, t) && isBlocked(s, ws.tickets, t) && ours(t));
  // Le sprint se lit en entier, même dans la vue d'une organisation.
  const stuck = sprintTickets.filter(t => !isDone(s, t) && isBlocked(s, ws.tickets, t));
  const watch = attention(ws);

  const content: Content[] = [
    eyebrow(project),
    { text: 'Rapport de pilotage', fontSize: 20, bold: true, margin: [0, 3, 0, 1] },
    {
      text: organization ? `Comité de pilotage · vue ${organization.name}` : 'Comité de pilotage',
      fontSize: 11,
      color: GREY.label,
      margin: [0, 0, 0, 12],
    },
    meta([
      ['Établi le', today()],
      [
        'Périmètre',
        organization
          ? `${organization.name} : ses tickets, diligences, risques et actions ; l’avancement reste celui du projet`
          : 'Tout le projet',
      ],
      [
        'Sprint en cours',
        active
          ? `${active.name}, du ${shortDate(active.start)} au ${shortDate(active.end)}${active.goal ? ` · ${active.goal}` : ''}`
          : 'Aucun',
      ],
      [
        'Version visée',
        current
          ? `${current.name}${current.end ? `, livraison le ${shortDate(current.end)}` : ''} (${current.status.toLowerCase()})`
          : 'Aucune',
      ],
      [
        'Vélocité moyenne',
        v.average === null
          ? 'Pas encore de sprint clos'
          : `${count ? `${v.average.toFixed(1)} tickets` : unit(v.average)} par sprint (${Math.min(v.closed.length, 3)} derniers sprints)`,
      ],
    ]),
  ];

  if (active) {
    const p = count
      ? [sprintDone.length, sprintTickets.length]
      : [
          sprintDone.reduce((n, t) => n + (t.estimate ?? 0), 0),
          sprintTickets.reduce((n, t) => n + (t.estimate ?? 0), 0),
        ];
    content.push({
      unbreakable: true,
      stack: [
        h2(`Sprint en cours · ${active.name}`, 16),
        {
          text: [
            { text: `${pct(p[0], p[1])} terminé`, bold: true },
            ` · ${count ? `${p[0]} tickets sur ${p[1]}` : `${unit(p[0])} sur ${unit(p[1])}`} · ${sprintTickets.filter(t => stepOf(s, t.status)?.category === 'doing').length} en cours`,
            stuck.length ? ` · ${stuck.length} bloqué${stuck.length > 1 ? 's' : ''}` : '',
            active.capacity ? ` · capacité ${unit(active.capacity)}` : '',
          ],
          margin: [0, 0, 0, 8],
        },
        b && days.length
          ? chart(b, width, count ? 'tickets' : unit(0).replace(/^0\s*/, ''))
          : none('Burndown disponible après le premier relevé du sprint.'),
      ],
    });
  }

  const small = (rows: unknown[]) => rows.length <= 14;
  const velocityRows = v.closed
    .slice(-6)
    .map(x => [
      x.name,
      `${dm(x.start)} – ${dm(x.end)}`,
      num(x.capacity === null ? '—' : unit(x.capacity)),
      num(
        delivered(x, count) === null ? '—' : count ? String(delivered(x, count)) : unit(delivered(x, count)!),
      ),
      num(x.carried.length),
    ]);
  const releaseRows = ws.releases
    .filter(r => r.status !== 'Abandonnée')
    .map(r => {
      const p = releaseProgress(s, r, ws.tickets);
      const f = forecast(s, r, ws.tickets, ws.sprints);
      const plural = (f.sprints ?? 0) > 1 ? 's' : '';
      const outlook: TableCell =
        r.status === 'Livrée'
          ? 'Livrée'
          : !p.count
            ? 'Aucun ticket'
            : f.remaining === 0
              ? 'Terminée'
              : f.date
                ? {
                    text: `${shortDate(f.date)} (${f.sprints} sprint${plural})${f.late ? ', en retard' : ''}`,
                    color: f.late ? '#b42318' : undefined,
                    bold: f.late,
                  }
                : 'Vélocité inconnue';
      return [
        { stack: [r.name, ...(r.goal ? [{ text: r.goal, color: GREY.muted, fontSize: 7.5 }] : [])] },
        shortDate(r.end),
        r.status,
        num(count ? `${p.doneCount}/${p.count} tickets` : `${unit(p.done)} / ${unit(p.total)}`),
        num(count ? pct(p.doneCount, p.count) : pct(p.done, p.total)),
        outlook,
      ];
    });
  content.push(
    section(
      'Vélocité',
      table(
        ['*', 80, 60, 60, 50],
        [th('Sprint'), th('Période'), th('Capacité', true), th('Livré', true), th('Reportés', true)],
        velocityRows,
      ),
    ),
    section(
      'Versions',
      table(
        ['*', 64, 54, 92, 34, 100],
        [
          th('Version'),
          th('Livraison visée'),
          th('Statut'),
          th('Avancement', true),
          th('', true),
          th('Prévision'),
        ],
        releaseRows,
      ),
      small(releaseRows),
    ),
  );

  const head = [
    th('Regroupement'),
    th('US', true),
    th('Validées', true),
    th('En réal.', true),
    th('Terminées', true),
    th(count ? 'Tickets' : 'Estimation', true),
    th('', true),
  ];
  const widths = ['*', 30, 40, 40, 46, 80, 34];
  const grouped = (title: string, rows: GroupProgress[], noun: string) => {
    const shown = groupRows(rows, unit, count);
    const rest = rows.filter(r => r.stories).length - shown.length;
    content.push(
      section(
        title,
        {
          stack: [
            shown.length ? table(widths, head, shown) : none(`Aucune US validée ou en réalisation.`),
            ...(rest > 0
              ? [
                  {
                    text: `${rest} autre${rest > 1 ? 's' : ''} ${noun} sans US validée ni en réalisation.`,
                    color: GREY.light,
                    fontSize: 7.5,
                    margin: [0, 3, 0, 0] as [number, number, number, number],
                  },
                ]
              : []),
          ],
        },
        small(shown),
      ),
    );
  };
  grouped(
    'Avancement par cas d’usage',
    progressBy(
      s,
      ws.stories,
      ws.tickets,
      ws.epics.map(e => ({ key: e.id, label: `${e.id} · ${e.title}` })),
      x => [x.epic],
    ),
    'cas d’usage',
  );
  const platforms = platformsOf(ws.stories);
  if (platforms.length)
    grouped(
      'Avancement par plateforme',
      progressBy(
        s,
        ws.stories,
        ws.tickets,
        platforms.map(p => ({ key: p, label: p })),
        platformKeys,
      ),
      'plateformes',
    );

  if (ws.campaigns.length) {
    const rows = ws.campaigns.map(c => {
      const t = testSummary(casesOf(c, ws.stories).map(x => x.result?.status ?? ''));
      return [
        { stack: [c.name, { text: c.status, color: GREY.muted, fontSize: 7.5 }] },
        CAMPAIGN_MODE_LABEL[c.mode],
        num(t.ok),
        num(t.ko),
        num(t.reserve),
        num(t.todo),
        num(
          hasVerdicts(c.mode)
            ? `${c.scope.filter(id => c.verdicts[id]?.status === 'accepted').length}/${c.scope.length}`
            : '—',
        ),
      ];
    });
    content.push(
      section(
        'Recette',
        table(
          ['*', 100, 34, 34, 34, 40, 50],
          [
            th('Campagne'),
            th('Mode'),
            th('OK', true),
            th('KO', true),
            th('Rés.', true),
            th('À passer', true),
            th('US acceptées', true),
          ],
          rows,
        ),
        small(rows),
      ),
    );
  }

  const due = (d: string) => (/^\d{4}-/.test(d) ? shortDate(d) : d || '—');
  if (organization) {
    const tickets = ws.tickets
      .filter(t => ours(t) && !isDone(s, t) && (t.sprint || t.release))
      .map(t => [
        code(t.id),
        t.title || '—',
        stepOf(s, t.status)?.name ?? t.status,
        ws.sprints.find(x => x.id === t.sprint)?.name ?? 'Backlog',
        who(t.assignee),
      ]);
    const diligences = ws.diligences
      .filter(
        d =>
          d.status !== 'Réalisée' && d.status !== 'Abandonnée' && (concerns(d.owner) || concerns(d.partners)),
      )
      .map(d => [code(d.id), d.title, due(d.due), d.status]);
    const actions = ws.risks.flatMap(r =>
      r.actions
        .filter(a => a.status !== 'Réalisée' && a.status !== 'Abandonnée' && concerns(a.owner))
        .map(a => [code(r.id), a.text, due(a.due), a.status]),
    );
    content.push(
      section(
        `Tickets confiés à ${organization.name}`,
        table(
          [52, '*', 70, 70, 90],
          [th('Ticket'), th('Titre'), th('Étape'), th('Sprint'), th('Responsable')],
          tickets,
        ),
        small(tickets),
      ),
      section(
        `Diligences de ${organization.name}`,
        table([40, '*', 60, 60], [th('Réf.'), th('Diligence'), th('Échéance'), th('Statut')], diligences),
        small(diligences),
      ),
      section(
        `Actions sur les risques confiées à ${organization.name}`,
        table([40, '*', 60, 60], [th('Risque'), th('Action'), th('Échéance'), th('Statut')], actions),
        small(actions),
      ),
    );
  }

  const risks = watch.risks.filter(
    r =>
      concerns(r.owner) ||
      concerns(r.actionOwner) ||
      concerns(r.authority) ||
      r.actions.some(a => concerns(a.owner)),
  );
  const late = watch.late.filter(d => concerns(d.owner) || concerns(d.partners));
  const sub = (text: string): Content => ({ text, bold: true, margin: [0, 6, 0, 3] });
  content.push(
    h2('Points d’attention'),
    {
      unbreakable: true,
      stack: [
        sub('Tickets bloqués'),
        table(
          [52, '*', 160],
          [th('Ticket'), th('Titre'), th('Bloqué par')],
          blocked.map(t => [
            code(t.id),
            t.title || '—',
            t.links
              .filter(l => l.type === 'blockedBy')
              .map(l => l.ticket)
              .join(', '),
          ]),
        ),
      ],
    },
    {
      unbreakable: small(risks),
      stack: [
        sub('Risques élevés ou critiques encore ouverts'),
        table(
          [40, '*', 90, 70],
          [th('Risque'), th('Intitulé'), th('Propriétaire'), th('Statut')],
          risks.map(r => [code(r.id), r.title, r.owner || '—', r.status]),
        ),
      ],
    },
    {
      unbreakable: small(late),
      stack: [
        sub('Diligences en retard'),
        table(
          [40, '*', 90, 60],
          [th('Réf.'), th('Diligence'), th('Responsable'), th('Échéance')],
          late.map(d => [code(d.id), d.title, d.owner || '—', shortDate(d.due)]),
        ),
      ],
    },
  );

  const pdf = await renderPdf({
    title: `Rapport de pilotage · ${project}`,
    footer: [project, 'Rapport de pilotage', organization?.name].filter(Boolean).join(' · '),
    content,
  });
  return {
    pdf,
    file: fileName(
      'Rapport_COPIL',
      ...(organization ? [organization.short || organization.name] : []),
      new Date().toISOString().slice(0, 10),
    ),
  };
}
