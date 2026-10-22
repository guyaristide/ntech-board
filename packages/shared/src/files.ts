/**
 * Pièces jointes : fichiers rattachés à un élément du tableau (US, atelier, risque, ticket…), rangés
 * dans le stockage choisi aux réglages du projet (serveur, Cloudinary, MinIO, Amazon S3…).
 */

/** Éléments qui peuvent recevoir des pièces jointes. */
export const ATTACHABLE_KINDS = [
  'story',
  'epic',
  'workshop',
  'reference',
  'phase',
  'risk',
  'diligence',
  'party',
  'release',
  'sprint',
  'ticket',
  'campaign',
] as const;
export type AttachableKind = (typeof ATTACHABLE_KINDS)[number];

export interface Attachment {
  id: string;
  owner: { kind: AttachableKind; id: string };
  name: string;
  mime: string;
  /** Taille en octets. */
  size: number;
  /** Stockage qui garde le fichier : « local » (serveur) ou identifiant d'un stockage configuré. */
  store: string;
  /** Emplacement du fichier dans ce stockage (clé d'objet, public_id Cloudinary, chemin). */
  key: string;
  /** Cloudinary : image, video ou raw. */
  resource?: string;
  by: string;
  byName: string;
  at: string;
}

/** Plafond absolu d'un fichier ; les réglages peuvent le baisser, pas le dépasser. */
export const MAX_FILE_MB = 5;

/** Familles de fichiers acceptées, par extension. Ni HTML, ni SVG, ni exécutables. */
export const FILE_CATEGORIES = {
  images: {
    label: 'Images et captures',
    ext: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp', 'avif'],
  },
  pdf: { label: 'PDF', ext: ['pdf'] },
  office: {
    label: 'Bureautique (Word, Excel, PowerPoint, CSV, texte)',
    ext: [
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'odt',
      'ods',
      'odp',
      'csv',
      'txt',
      'md',
      'rtf',
      'json',
      'xml',
    ],
  },
  video: { label: 'Vidéos', ext: ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'] },
  audio: { label: 'Audio', ext: ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac', 'opus', 'weba'] },
  archives: { label: 'Archives', ext: ['zip', '7z', 'rar', 'gz', 'tar'] },
} as const;
export type FileCategory = keyof typeof FILE_CATEGORIES;
export const FILE_CATEGORY_KEYS = Object.keys(FILE_CATEGORIES) as FileCategory[];

export const extensionOf = (name: string) => (name.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? '').toLowerCase();

export const categoryOf = (name: string): FileCategory | null =>
  FILE_CATEGORY_KEYS.find(c => (FILE_CATEGORIES[c].ext as readonly string[]).includes(extensionOf(name))) ??
  null;

/** Rangement des fichiers dans le stockage. */
export type FolderStrategy = 'element' | 'type' | 'date' | 'flat' | 'custom';
export const FOLDER_STRATEGIES: Record<
  Exclude<FolderStrategy, 'custom'>,
  { label: string; template: string }
> = {
  element: { label: 'Un dossier par élément', template: '{projet}/{type}/{element}' },
  type: { label: 'Un dossier par type d’élément', template: '{projet}/{type}' },
  date: { label: 'Par année et par mois', template: '{projet}/{annee}/{mois}' },
  flat: { label: 'Tout dans le dossier du projet', template: '{projet}' },
};
export const FOLDER_PLACEHOLDERS = [
  '{projet}',
  '{type}',
  '{element}',
  '{annee}',
  '{mois}',
  '{jour}',
  '{auteur}',
];

/** Dossier de chaque type d'élément. */
export const KIND_FOLDER: Record<AttachableKind, string> = {
  story: 'us',
  epic: 'epiques',
  workshop: 'ateliers',
  reference: 'references',
  phase: 'phases',
  risk: 'risques',
  diligence: 'diligences',
  party: 'parties',
  release: 'versions',
  sprint: 'sprints',
  ticket: 'tickets',
  campaign: 'recette',
};

/** Réglages des pièces jointes (Réglages du projet › Fichiers). Les clés d'accès n'y figurent pas. */
export interface FileSettings {
  /** Stockage des nouveaux fichiers : « local » ou identifiant d'un stockage configuré. */
  store: string;
  /** Dossier racine dans le stockage (préfixe de tous les fichiers du projet). */
  root: string;
  folders: FolderStrategy;
  /** Modèle de dossier quand `folders` vaut « custom ». */
  template: string;
  /** Taille maximale d'un fichier, en Mo (au plus MAX_FILE_MB). */
  maxMb: number;
  categories: FileCategory[];
}

export const DEFAULT_FILE_SETTINGS: FileSettings = {
  store: 'local',
  root: 'ntech-board',
  folders: 'element',
  template: '{projet}/{type}/{annee}',
  maxMb: MAX_FILE_MB,
  categories: [...FILE_CATEGORY_KEYS],
};

const clean = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');

/** Nom de fichier sûr pour un stockage (sans accents ni caractères spéciaux), extension gardée. */
export const safeFileName = (name: string) => clean(name).slice(-100) || 'fichier';

/** Dossier d'un fichier selon la stratégie de rangement, racine comprise, sans « / » final. */
export function folderFor(
  settings: FileSettings,
  ctx: { project: string; kind: AttachableKind; id: string; author: string; date?: Date },
) {
  const d = ctx.date ?? new Date();
  const template =
    settings.folders === 'custom'
      ? settings.template || '{projet}'
      : FOLDER_STRATEGIES[settings.folders].template;
  const values: Record<string, string> = {
    projet: ctx.project,
    type: KIND_FOLDER[ctx.kind],
    element: ctx.id,
    annee: String(d.getUTCFullYear()),
    mois: String(d.getUTCMonth() + 1).padStart(2, '0'),
    jour: String(d.getUTCDate()).padStart(2, '0'),
    auteur: ctx.author,
  };
  const path = template.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
  return [settings.root, ...path.split('/')]
    .map(part => clean(part ?? ''))
    .filter(Boolean)
    .join('/');
}

/** Le fichier peut-il être affiché dans le navigateur (aperçu) plutôt que téléchargé ? */
export const previewable = (mime: string) =>
  /^(image\/(png|jpe?g|gif|webp|avif|bmp)|application\/pdf|video\/|audio\/)/.test(mime);

/** Taille lisible : « 820 Ko », « 3,4 Mo ». */
export const fileSize = (bytes: number) =>
  bytes < 1024
    ? `${bytes} o`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} Ko`
      : `${(bytes / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;

/** Fournisseurs de stockage configurables (le serveur local est toujours disponible). */
export type StorageProvider = 'cloudinary' | 's3';

/** Préréglages proposés à la création d'un stockage S3. */
export const S3_FLAVORS = {
  minio: { label: 'MinIO', pathStyle: true, region: 'us-east-1' },
  aws: { label: 'Amazon S3', pathStyle: false, region: 'eu-west-3' },
  other: { label: 'Autre service compatible S3', pathStyle: true, region: 'us-east-1' },
} as const;
export type S3Flavor = keyof typeof S3_FLAVORS;

/** Stockage configuré, tel que l'API le montre : les secrets n'en sortent jamais, seulement leur présence. */
export interface StorageBackendView {
  id: string;
  provider: StorageProvider;
  name: string;
  /** Cloudinary : cloudName, apiKey. S3 : flavor, endpoint, region, bucket, accessKeyId, pathStyle. */
  config: Record<string, string | boolean>;
  hasSecret: boolean;
  /** Téléchargement : par le serveur (toujours possible) ou lien direct signé vers le stockage. */
  delivery: 'proxy' | 'direct';
  files: number;
  bytes: number;
}
