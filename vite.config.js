import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // Para GitHub Pages
  server: {
    port: 5173
  }
})
