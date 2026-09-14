import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' : le site fonctionne quel que soit le nom du repo GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: './',
})
