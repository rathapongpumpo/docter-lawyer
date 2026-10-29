import { defineConfig } from 'drizzle-kit';

// db/migrations/*.sql is the source of truth (docs/03-technical-spec.md §2.7).
// `pnpm db:pull` regenerates lib/db/schema.ts from the migrated database; never hand-edit it.
export default defineConfig({
  dialect: 'postgresql',
  out: './lib/db/generated',
  schemaFilter: ['app', 'kb'],
  dbCredentials: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 55432),
    user: process.env.DB_ADMIN_USER ?? 'lc_owner',
    password: process.env.DB_ADMIN_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'legal_consult',
    ssl: false,
  },
});
