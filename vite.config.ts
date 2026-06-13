import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Auto-seed a safe fallback descriptor if cloned on GitHub without physical config
const configPath = path.resolve(__dirname, 'firebase-applet-config.json')
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      projectId: "your-firebase-project-id",
      appId: "1:000000000000:web:0000000000000000000000",
      apiKey: "AIzaSyPlaceholderKeyForLocalBuildsOnly",
      authDomain: "your-firebase-project-id.firebaseapp.com",
      firestoreDatabaseId: "your-database-id",
      storageBucket: "your-firebase-project-id.firebasestorage.app",
      messagingSenderId: "000000000000",
      measurementId: ""
    }, null, 2)
  )
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/Goal-Milma-Goal/',
  plugins: [
    react(),
    tailwindcss()
  ]
})
