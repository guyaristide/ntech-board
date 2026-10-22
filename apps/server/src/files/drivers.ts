import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v2 as cloudinary } from 'cloudinary';
import { extensionOf } from '@board/shared';
import { storageRoot } from '../storage';

/**
 * Pilotes de stockage : même contrat pour le serveur local, Cloudinary et tout service compatible S3
 * (MinIO, Amazon S3, Scaleway, OVH…). Un fichier est désigné par sa clé (et, pour Cloudinary, son type
 * de ressource) ; le pilote ne connaît ni le projet ni les droits, vérifiés avant lui.
 */

export interface StoredFile {
  key: string;
  resource?: string;
}

export interface Driver {
  put(folder: string, name: string, body: Buffer, mime: string): Promise<StoredFile>;
  /** Contenu, pour le téléchargement par le serveur et les transferts entre stockages. */
  get(file: StoredFile): Promise<ReadableStream<Uint8Array>>;
  /** Lien direct signé, valable quelques minutes, si le stockage en propose. */
  link?(file: StoredFile, opts: { name: string; mime: string; inline: boolean }): Promise<string>;
  remove(file: StoredFile): Promise<void>;
}

const LINK_SECONDS = 300;
const unique = () => Math.random().toString(36).slice(2, 10);
const disposition = (name: string, inline: boolean) =>
  `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

// --- Serveur local (volume STORAGE_DIR/files) --------------------------------------------------

export function localDriver(): Driver {
  const base = () => resolve(storageRoot(), 'files');
  const pathOf = (key: string) => {
    const path = resolve(base(), key);
    if (!path.startsWith(base() + sep)) throw new Error('chemin invalide');
    return path;
  };
  return {
    async put(folder, name, body) {
      const key = join(folder, `${unique()}-${name}`).split(sep).join('/');
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body, { flag: 'wx' });
      return { key };
    },
    async get(file) {
      const path = pathOf(file.key);
      await stat(path);
      return Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
    },
    async remove(file) {
      await rm(pathOf(file.key), { force: true });
    },
  };
}

// --- Services compatibles S3 (MinIO, Amazon S3…) ---------------------------------------------

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathStyle: boolean;
}

export function s3Driver(cfg: S3Config): Driver {
  const client = new S3Client({
    region: cfg.region || 'us-east-1',
    endpoint: cfg.endpoint || undefined,
    forcePathStyle: cfg.pathStyle,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return {
    async put(folder, name, body, mime) {
      const key = `${folder}/${unique()}-${name}`;
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: body,
          ContentType: mime,
          ContentLength: body.length,
        }),
      );
      return { key };
    },
    async get(file) {
      const out = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: file.key }));
      if (!out.Body) throw new Error('fichier vide');
      return out.Body.transformToWebStream() as ReadableStream<Uint8Array>;
    },
    link(file, { name, mime, inline }) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: cfg.bucket,
          Key: file.key,
          ResponseContentDisposition: disposition(name, inline),
          ResponseContentType: mime,
        }),
        { expiresIn: LINK_SECONDS },
      );
    },
    async remove(file) {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: file.key }));
    },
  };
}

// --- Cloudinary ------------------------------------------------------------------------------

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/** Type de ressource Cloudinary : images, vidéos (et sons), tout le reste en « raw » (fichier tel quel). */
const resourceOf = (mime: string) =>
  /^image\/(png|jpe?g|gif|webp|avif|bmp|heic|heif)$/.test(mime)
    ? 'image'
    : /^(video|audio)\//.test(mime)
      ? 'video'
      : 'raw';

export function cloudinaryDriver(cfg: CloudinaryConfig): Driver {
  const auth = { cloud_name: cfg.cloudName, api_key: cfg.apiKey, api_secret: cfg.apiSecret };
  // Fichiers privés : jamais servis sans lien signé.
  const type = 'private';
  const download = (file: StoredFile, attachment: boolean) => {
    const raw = file.resource === 'raw';
    const ext = raw ? '' : extensionOf(file.key) || '';
    const publicId = raw ? file.key : file.key.replace(/\.[^./]+$/, '');
    return cloudinary.utils.private_download_url(publicId, ext, {
      ...auth,
      resource_type: file.resource ?? 'raw',
      type,
      attachment,
      expires_at: Math.floor(Date.now() / 1000) + LINK_SECONDS,
    });
  };
  return {
    put(folder, name, body, mime) {
      const resource = resourceOf(mime);
      const ext = extensionOf(name);
      const base = `${unique()}-${name.replace(/\.[^.]+$/, '')}`;
      return new Promise((ok, ko) => {
        cloudinary.uploader
          .upload_stream(
            {
              ...auth,
              resource_type: resource as 'image' | 'video' | 'raw',
              type,
              folder,
              // « raw » : l'extension fait partie de l'identifiant ; sinon Cloudinary la garde comme format.
              public_id: resource === 'raw' && ext ? `${base}.${ext}` : base,
              use_filename: false,
              unique_filename: false,
              overwrite: false,
            },
            (err, res) => {
              if (err || !res) return ko(new Error(err?.message ?? 'envoi refusé par Cloudinary'));
              // La clé garde l'extension, pour reconstruire le format au téléchargement.
              ok({
                key: resource === 'raw' || !res.format ? res.public_id : `${res.public_id}.${res.format}`,
                resource,
              });
            },
          )
          .end(body);
      });
    },
    async get(file) {
      const res = await fetch(download(file, false));
      if (!res.ok || !res.body) throw new Error(`Cloudinary : ${res.status}`);
      return res.body;
    },
    async link(file, { inline }) {
      return download(file, !inline);
    },
    async remove(file) {
      const raw = file.resource === 'raw';
      await cloudinary.uploader.destroy(raw ? file.key : file.key.replace(/\.[^./]+$/, ''), {
        ...auth,
        resource_type: file.resource ?? 'raw',
        type,
        invalidate: true,
      });
    },
  };
}
