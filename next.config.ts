import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ─── Standalone Output ────────────────────────────────────────────
  // Gera um build autossuficiente em .next/standalone/ que não precisa
  // de node_modules completo — reduz imagem Docker de ~1.5GB para ~150MB.
  // O server.js gerado já inclui um servidor Node.js mínimo.
  output: "standalone",

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

  // ─── Headers de Cache Agressivo ───────────────────────────────────
  // Assets estáticos (_next/static/) têm hash no nome — podem ser
  // cacheados para sempre pelo CDN/Browser. Páginas públicas usam ISR.
  async headers() {
    return [
      {
        // Assets com hash: cache imutável de 1 ano
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Fonts do Next.js: cache de 1 ano
        source: "/_next/font/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Imagens otimizadas pelo next/image: cache de 1 dia
        source: "/_next/image/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        // Uploads: cache de 1 hora, revalida em background
        source: "/uploads/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        // Logo e assets públicos: cache de 1 dia
        source: "/logo.svg",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        // API routes: SEM cache — sempre dinâmico
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        ],
      },
    ];
  },

  // ─── Image Optimization ───────────────────────────────────────────
  // Desativar otimização de imagem para reduzir CPU/memória no servidor.
  // Em produção, use um CDN/Proxy (nginx/CloudFront) para otimizar.
  images: {
    unoptimized: true,
  },

  // ─── Compressão ───────────────────────────────────────────────────
  // Desativada aqui porque o nginx/Ingress faz gzip melhor.
  // Ativar ambos causa double-compression e desperdiça CPU.
  compress: false,

  // ─── Dev Cross-Origin ─────────────────────────────────────────────
  // Permite acesso ao HMR/Turbopack a partir do preview do sandbox.
  allowedDevOrigins: [
    /\.space-z\.ai$/,
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
