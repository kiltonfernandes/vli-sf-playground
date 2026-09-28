import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    tanstackStart({
      // Redireciona o server entry padrão do TanStack Start para src/server.ts
      // (nosso wrapper de SSR com tratamento de erros).
      server: { entry: "server" },
    }),
    // Nitro compila o servidor para o runtime da Vercel (deploy automático a
    // cada push na main; a Vercel detecta o preset sozinha no build dela).
    nitro(),
    viteReact(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
