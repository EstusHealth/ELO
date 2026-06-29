import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Plain Vite + React config. No network plugins, no analytics.
export default defineConfig({
  plugins: [react()],
})
