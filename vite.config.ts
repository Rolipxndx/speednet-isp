import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite" // <-- Importa el plugin
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()], // <-- Añádelo a los plugins
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})