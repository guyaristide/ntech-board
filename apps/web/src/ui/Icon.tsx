import type { ReactNode } from 'react';

/**
 * Icônes au trait de l'interface : une grille de 24, un trait de 1,6, bouts arrondis. Elles prennent
 * la couleur du texte (currentColor) et suivent donc le thème clair ou sombre.
 */
const PATHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
    </>
  ),
  list: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9.5h16M4 14.75h16M9.5 4v16M14.75 9.5V20" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5 21 19.5H3z" />
      <path d="M12 10.5v4M12 17h.01" />
    </>
  ),
  check: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8.5 12.3 2.5 2.5 4.7-5.3" />
    </>
  ),
  book: (
    <>
      <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13H6.5A1.5 1.5 0 0 0 5 18.5z" />
      <path d="M5 18.5A1.5 1.5 0 0 0 6.5 20H19v-3M9 8.5h6" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13.5 6.4 5.6A1 1 0 0 1 7.4 5h9.2a1 1 0 0 1 1 .7L20 13.5V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M4 13.5h4.5l1 2.5h5l1-2.5H20" />
    </>
  ),
  gauge: (
    <>
      <path d="M4.5 16a8 8 0 1 1 15 0" />
      <path d="m12 14 3.5-4.5M12 14h.01" />
      <path d="M7 19.5h10" />
    </>
  ),
  layers: (
    <>
      <path d="m12 4 8 4.2-8 4.2-8-4.2z" />
      <path d="m4 12.3 8 4.2 8-4.2M4 16.3l8 4.2 8-4.2" />
    </>
  ),
  columns: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9.5 4v16M14.5 4v16" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c.8-3.3 3.5-5 7-5s6.200 1.700 7 5" />
    </>
  ),
  cycle: (
    <>
      <path d="M19.500 12a7.500 7.500 0 0 1-13 5.100M4.500 12a7.500 7.500 0 0 1 13-5.100" />
      <path d="M17.500 3.500v3.400h-3.400M6.500 20.500v-3.400h3.400" />
    </>
  ),
  flag: (
    <>
      <path d="M6 20.500V4.500" />
      <path d="M6 5h11.500l-2.500 4 2.500 4H6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.800 19 6.500v5.300c0 4.200-2.900 7.200-7 8.400-4.100-1.200-7-4.200-7-8.400V6.500z" />
      <path d="m9 12 2.200 2.200 3.900-4.400" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.500" r="3" />
      <path d="M3.500 19c.6-2.900 2.700-4.500 5.500-4.500s4.900 1.600 5.500 4.500" />
      <path d="M15.500 5.800a3 3 0 0 1 0 5.400M17.500 14.800c1.600.6 2.700 2 3 4.200" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  team: (
    <>
      <rect x="4" y="4.500" width="16" height="15" rx="2" />
      <circle cx="12" cy="10.500" r="2.300" />
      <path d="M8 16.500c.6-1.700 2.100-2.500 4-2.500s3.400.8 4 2.500" />
    </>
  ),
  download: (
    <>
      <path d="M12 4.500v10M8 11l4 4 4-4" />
      <path d="M5 19.500h14" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3.500v4M15 3.500v4" />
      <path d="M6.500 7.500h11v3.500a5.500 5.500 0 0 1-11 0z" />
      <path d="M12 16.500v4" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4.500H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h4" />
      <path d="M14.500 8 19 12l-4.500 4M19 12H9.500" />
    </>
  ),
  folder: (
    <>
      <path d="M4 7a1 1 0 0 1 1-1h4.2l1.8 2H19a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
