import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineOperation, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/envelope';
import { db } from '@/lib/db/client';
import { getOrgSettings, ORG_MANAGERS, orgAudit, requireOrgMember } from '@/lib/org';

// operationId get_org — summary for the organization pages. Members see who the counsel are (to send matters to them).
export const GET = defineOperation({ operationId: 'get_org', role: 'member' }, async ({ req, session, params }) => {
  const userId = Number(session.user.id);
  const role = await requireOrgMember(userId, params.orgId!, undefined, req, true);
  const [org] = (await db.execute<{ id: string; name: string; slug: string; business_type: string | null; province_code: string | null; status: string; deletion_scheduled_at: string | null }>(
    sql`SELECT id, name, slug::text AS slug, business_type, province_code, status, deletion_scheduled_at::text FROM app.organizations WHERE id = ${params.orgId}`)).rows;
  if (!org) throw new ApiError('not_found', 'not found');
  // while an organization waits for deletion only its owners can still see it (to cancel); for everyone else it is gone
  if (org.status !== 'active' && role !== 'org_owner') throw new ApiError('not_found', 'not found');
  const counsel = (await db.execute<{ user_id: number; name: string }>(
    sql`SELECT m.user_id, u.display_name AS name FROM app.members m JOIN app.users u ON u.id = m.user_id
        WHERE m.organization_id = ${params.orgId} AND m.role = 'org_counsel' AND m.user_id <> ${userId} ORDER BY u.display_name`)).rows;
  const isManager = ORG_MANAGERS.includes(role);
  return ok({ org, my_role: role, settings: isManager ? await getOrgSettings(params.orgId!) : null, counsel });
});

const Patch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  business_type: z.string().trim().max(80).nullable().optional(),
  province_code: z.string().trim().regex(/^[0-9]{2}$/).nullable().optional(),
  contract_retention_days: z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(365), z.null()]).optional(),
});

// operationId update_org — profile + contract retention (FR-ORG-009); every change is audited without values that identify people
export const PATCH = defineOperation(
  { operationId: 'update_org', role: 'member', input: Patch },
  async ({ req, session, params, input }) => {
    const userId = Number(session.user.id);
    await requireOrgMember(userId, params.orgId!, ORG_MANAGERS, req);
    const changed: string[] = [];
    if (input.name !== undefined || input.business_type !== undefined || input.province_code !== undefined) {
      await db.execute(sql`UPDATE app.organizations SET
        name = COALESCE(${input.name ?? null}, name),
        business_type = CASE WHEN ${input.business_type !== undefined} THEN ${input.business_type ?? null} ELSE business_type END,
        province_code = CASE WHEN ${input.province_code !== undefined} THEN ${input.province_code ?? null} ELSE province_code END,
        updated_at = now() WHERE id = ${params.orgId}`);
      changed.push('profile');
    }
    if (input.contract_retention_days !== undefined) {
      await db.execute(sql`INSERT INTO app.org_settings (organization_id, contract_retention_days, updated_by)
        VALUES (${params.orgId}, ${input.contract_retention_days}, ${userId})
        ON CONFLICT (organization_id) DO UPDATE SET contract_retention_days = EXCLUDED.contract_retention_days, updated_by = EXCLUDED.updated_by, updated_at = now()`);
      changed.push('retention');
    }
    if (changed.length) {
      await orgAudit('org.settings_changed', {
        orgId: params.orgId!, actorId: userId, request: req,
        meta: { fields: changed.join(','), retention_days: input.contract_retention_days === undefined ? null : (input.contract_retention_days ?? 0) },
      });
    }
    return ok({ changed });
  },
);
