import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Stamped at build time so the nav shows which deploy is live.
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
})
