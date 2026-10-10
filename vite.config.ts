import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { workspacePlugin } from './server/workspacePlugin';

export default defineConfig({
  plugins: [react(), workspacePlugin()],
  server: { port: 5190 },
  preview: { port: 5190 },
});
