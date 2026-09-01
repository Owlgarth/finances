import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [react()],
    server: {
      ...(env.VITE_PORT ? { port: parseInt(env.VITE_PORT, 10) } : {}),
      fs: {
        // The UI imports the language registry from
        // backend/common/languages.json (one file, two consumers). Allow the
        // dev server to serve from the repo root, one level above frontend/.
        allow: [path.resolve(process.cwd(), '..')],
      },
    },
  }
})
