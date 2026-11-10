import { defineConfig } from "vite";

// Em desenvolvimento, o Vite serve o front-end e repassa /api para o servidor Express.
export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3001" },
  },
});
