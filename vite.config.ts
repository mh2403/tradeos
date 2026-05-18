import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Use relative asset paths so GitHub Pages project sites work out-of-the-box.
export default defineConfig({
  base: './',
  plugins: [react()],
})
