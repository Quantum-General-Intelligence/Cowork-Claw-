import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

export default defineConfig({
  output: 'static',
  integrations: [react()],
  server: { port: 4321, host: '0.0.0.0' },
  vite: {
    css: {
      postcss: './postcss.config.mjs',
    },
  },
})
