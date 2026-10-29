// Client-safe copy of the section paths (lib/admin.ts is server-only).
export const SECTION_PATH_CLIENT: Record<string, string> = {
  review: '/admin/review', content: '/admin/content', laws: '/admin/laws', feedback: '/admin/feedback', guardrails: '/admin/guardrails', users: '/admin/users',
  audit: '/admin/audit', dsr: '/admin/dsr', usage: '/admin/usage', announcement: '/admin/announcement', orgs: '/admin/orgs', system: '/admin/system',
};
