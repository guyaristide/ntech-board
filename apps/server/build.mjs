// Construit le serveur et la CLI en deux fichiers ESM ; le paquet partagé est intégré, les dépendances restent externes.
import { build } from 'esbuild';

await build({
  entryPoints: { index: 'src/index.ts', cli: 'src/cli.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  packages: 'external',
  alias: { '@board/shared': '../../packages/shared/src/index.ts' },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
console.log('Serveur construit dans apps/server/dist');
