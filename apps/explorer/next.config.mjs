import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@securedid/shared"],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "pino-pretty": false,
      "lokijs": false,
      "encoding": false,
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      "valtio/vanilla": require.resolve("valtio/vanilla"),
      "valtio/vanilla/utils": require.resolve("valtio/vanilla/utils"),
    };
    config.externals = [...(config.externals || []), "pino-pretty"];
    return config;
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: [
          "default-src 'self'",
          "connect-src 'self' https: wss:",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline' https:",
          "style-src 'self' 'unsafe-inline' https:",
          "img-src 'self' data: blob: https:",
          "font-src 'self' data: https:",
          "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org",
        ].join("; ") }
      ],
    }];
  },
};
export default nextConfig;
