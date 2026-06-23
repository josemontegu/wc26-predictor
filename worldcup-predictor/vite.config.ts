import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the build works at any path on GitHub Pages
// (e.g. https://<user>.github.io/<repo>/). Combined with HashRouter,
// this avoids 404s on refresh and broken asset paths.
export default defineConfig({
  base: './',
  plugins: [react()],
})
