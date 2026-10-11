import type { Story, WorkspaceData } from '@board/shared';

const download = (name: string, type: string, content: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

const stamp = () => new Date().toISOString().slice(0, 10);

export const exportJson = (ws: WorkspaceData & { session: { project: { slug: string } } | null }) =>
  download(
    `${ws.session?.project.slug ?? 'board'}-${stamp()}.json`,
    'application/json',
    JSON.stringify(
      {
        planning: ws.planning,
        references: ws.references,
        epics: ws.epics,
        stories: ws.stories,
        workshops: ws.workshops,
        phases: ws.phases,
        risks: ws.risks,
      },
      null,
      2,
    ),
  );

const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** Backlog au format CSV (séparateur point-virgule, lisible par Excel en français). */
export function exportCsv(stories: Story[]) {
  const head = [
    'ID',
    'Épique',
    'Titre',
    'Acteur',
    'En tant que',
    'Je veux',
    'Afin de',
    "Critères d'acceptation",
    'Scénario',
    'Version',
    'Atelier',
    'Priorité',
    'Statut',
    'Source',
    'Notes',
  ];
  const rows = stories.map(s => [
    s.id,
    s.epic,
    s.title,
    s.actor,
    s.asA,
    s.iWant,
    s.soThat,
    s.acceptance.map(c => `${c.done ? '[x]' : '[ ]'} ${c.text}`).join('\n'),
    s.scenario,
    s.version,
    s.workshop,
    s.priority,
    s.status,
    s.source,
    s.body.map(b => b.text).join('\n'),
  ]);
  const csv = [head, ...rows].map(r => r.map(v => cell(String(v ?? ''))).join(';')).join('\r\n');
  download(`backlog-${stamp()}.csv`, 'text/csv;charset=utf-8', `﻿${csv}`);
}

/** Markdown d'une US, pour un copier-coller dans un PV ou un ticket. */
export const storyMarkdown = (s: Story) =>
  [
    `### ${s.id} · ${s.title}`,
    '',
    `En tant que ${s.asA}, je veux ${s.iWant}, afin de ${s.soThat}.`,
    '',
    `Version ${s.version} · atelier ${s.workshop || 'à définir'} · priorité ${s.priority} · statut ${s.status}`,
    '',
    "**Critères d'acceptation**",
    ...s.acceptance.map(c => `- [${c.done ? 'x' : ' '}] ${c.text}`),
    ...(s.body.length ? ['', '**Notes**', ...s.body.map(b => b.text)] : []),
    s.source ? `\nSource : ${s.source}` : '',
  ].join('\n');
