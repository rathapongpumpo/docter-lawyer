import { NextResponse, type NextRequest } from 'next/server';
import { CSRF_COOKIE } from '@/lib/csrf';

// Next.js 16 "proxy" (formerly middleware): security headers + per-request CSP nonce,
// Origin check for state-changing API calls, CSRF cookie issuance and an optimistic auth redirect.
// Authorization itself happens in route handlers / layouts (docs/03-technical-spec.md §1.2).

const SESSION_COOKIES = ['lc.session_token', '__Secure-lc.session_token'];
const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/two-factor', '/legal', '/share'];

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Style attributes from component libraries need 'unsafe-inline'; no inline scripts are allowed.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    // Only where TLS is guaranteed (prod behind Caddy); on http dev/staging it would break every asset load.
    ...(process.env.APP_ENV === 'prod' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

function applySecurityHeaders(res: NextResponse, csp?: string) {
  if (csp) res.headers.set('Content-Security-Policy', csp);
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=()');
  if (process.env.APP_ENV === 'prod') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

// Origins allowed to call the API: the page's own host, the configured public URL (APP_URL) and, on dev/staging, the extra
// origins that reach the app through a reverse proxy which does not pass the public Host header on (EXTRA_TRUSTED_ORIGINS).
function trustedOrigins(): Set<string> {
  const list = [process.env.APP_URL, ...(process.env.EXTRA_TRUSTED_ORIGINS ?? '').split(',')];
  return new Set(list.map((o) => o?.trim().replace(/\/$/, '')).filter((o): o is string => !!o));
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin fetches from older browsers omit Origin; CSRF token still required
  try {
    return new URL(origin).host === req.headers.get('host') || trustedOrigins().has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);

  if (isApi && mutating && !sameOrigin(req)) {
    return NextResponse.json(
      { success: false, error: 'cross-origin request blocked', error_code: 'forbidden' },
      { status: 403 },
    );
  }

  // Optimistic redirect for app pages without any session cookie (real check happens server-side).
  const hasSessionCookie = SESSION_COOKIES.some((name) => req.cookies.has(name));
  if (!isApi && !hasSessionCookie && !PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  let res: NextResponse;
  let csp: string | undefined;
  if (isApi) {
    res = NextResponse.next();
  } else {
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    csp = buildCsp(nonce);
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('x-pathname', `${pathname}${req.nextUrl.search}`);
    requestHeaders.set('Content-Security-Policy', csp);
    res = NextResponse.next({ request: { headers: requestHeaders } });
  }
  applySecurityHeaders(res, csp);

  if (!req.cookies.has(CSRF_COOKIE)) {
    res.cookies.set(CSRF_COOKIE, crypto.randomUUID().replaceAll('-', ''), {
      httpOnly: false, // must be readable so the browser can echo it in X-CSRF-Token
      sameSite: 'lax',
      secure: process.env.APP_ENV === 'prod',
      path: '/',
    });
  }
  return res;
}

export const config = {
  matcher: [
    {
      // icons and the manifest must load for logged-out visitors too (login page tab icon)
      source: '/((?!_next/static|_next/image|favicon.ico|icon.png|icon.svg|apple-icon.png|manifest.webmanifest|robots.txt|sitemap.xml|icons/|fonts/|theme/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
