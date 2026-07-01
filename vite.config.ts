import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Set VITE_BASE_PATH in your environment or GitHub Actions to the repo name,
// e.g. /MiniMonee/ — leave empty for Docker (served at /)
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/',
  server: { port: 5173 },
});
