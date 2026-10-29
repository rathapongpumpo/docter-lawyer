// Liveness: the process is up and can answer. No auth, no dependencies (docs/03-technical-spec.md §7.13).
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ status: 'ok', build: process.env.APP_BUILD ?? 'dev' });
}
