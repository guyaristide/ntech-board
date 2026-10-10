import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En développement, l'API tourne à part (port 3000) : Vite la sert sous /api.
// On garde l'en-tête Host pour que le serveur reconnaisse le projet (etourisme-board.localhost:5190).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5190,
    host: true,
    allowedHosts: ['.localhost'],
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
});
