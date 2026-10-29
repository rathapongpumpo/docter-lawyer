import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// Hostnames of EXTRA_TRUSTED_ORIGINS may load dev-only assets/HMR (next dev blocks non-localhost origins by default)
const extraOriginHosts = (process.env.EXTRA_TRUSTED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
  .map((o) => new URL(o).hostname);

const nextConfig: NextConfig = {
  allowedDevOrigins: extraOriginHosts,
  output: 'standalone',
  // Caddy compresses responses; Next must not gzip the SSE stream (docs/03-technical-spec.md §1.4.3)
  compress: false,
  poweredByHeader: false,
  reactStrictMode: true,
  // contract uploads (CONTRACT_MAX_MB = 20) pass through proxy.ts, which buffers request bodies (default limit 10 MB)
  experimental: { proxyClientMaxBodySize: '25mb' },
};

export default withNextIntl(nextConfig);
