import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const FILE = resolve(import.meta.dirname, '../data/workspace.json');
const ROUTE = '/api/workspace';

/**
 * Persistance locale : l'espace de travail est lu et écrit dans data/workspace.json,
 * fichier versionnable avec le reste du projet. Disponible en dev comme en preview.
 */
export function workspacePlugin(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith(ROUTE)) return next();
    if (req.method === 'GET') {
      // Pas encore de fichier : null, le client part du contenu d'origine.
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(existsSync(FILE) ? readFileSync(FILE, 'utf8') : 'null');
    }
    if (req.method === 'PUT') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          mkdirSync(dirname(FILE), { recursive: true });
          // Écriture atomique : un fichier temporaire puis un renommage.
          writeFileSync(`${FILE}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
          renameSync(`${FILE}.tmp`, FILE);
          res.statusCode = 204;
          res.end();
        } catch {
          res.statusCode = 400;
          res.end('JSON invalide');
        }
      });
      return;
    }
    res.statusCode = 405;
    res.end();
  };
  return {
    name: 'cadrage-workspace',
    configureServer: server => void server.middlewares.use(middleware),
    configurePreviewServer: server => void server.middlewares.use(middleware),
  };
}
