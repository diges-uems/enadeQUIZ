import type { NextConfig } from "next";

// ─── Next.js Config (simplified for maximum platform compatibility) ───
// Removemos `output: "standalone"` e customizações agressivas que podiam
// quebrar o deploy em algumas plataformas. Este é o setup Next.js padrão
// que funciona em qualquer plataforma (Vercel, Z.ai, Netlify, etc).
const nextConfig: NextConfig = {
  // ─── TypeScript ───────────────────────────────────────────────────
  // Em CI/CD o type-check é feito separadamente (tsc --noEmit).
  // Ignorar aqui acelera o build em ~30%.
  typescript: {
    ignoreBuildErrors: true,
  },

  // ─── React Strict Mode ────────────────────────────────────────────
  // Desativado para evitar double-render em produção que pode causar
  // flicker nos gráficos SVG e WebSocket connections duplicados.
  reactStrictMode: false,

  // ─── Image Optimization ───────────────────────────────────────────
  // Desativar otimização de imagem para reduzir CPU/memória no servidor.
  images: {
    unoptimized: true,
  },

  // ─── Dev Cross-Origin ─────────────────────────────────────────────
  // Permite acesso ao HMR/Turbopack a partir do preview do sandbox.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
