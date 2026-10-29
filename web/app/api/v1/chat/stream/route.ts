import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { defineOperation, fail, roleOf } from '@/lib/api/handler';
import { assertChatAccess } from '@/lib/chats';
import { env } from '@/lib/env';
import { chatBlocked, getKillSwitch } from '@/lib/ops';
import { tryConsumeMessage } from '@/lib/quota';
import { metrics } from '@/lib/metrics';
import { limits, rateLimit } from '@/lib/rate-limit';
import { formatEvent, type ChatEvent } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ChatStreamRequest = z.object({
  message: z.string().trim().min(1).max(4000),
  chat_id: z.uuid().nullish(),
  regenerate: z.union([z.literal(0), z.literal(1)]).default(0),
  scope: z.union([z.literal('auto'), z.array(z.string().regex(/^[A-Z]+(\.[A-Z0-9_]+)?$/)).max(18)]).default('auto'),
  context: z
    .object({
      source_type: z.enum(['article', 'law_section', 'guide', 'template']),
      source_id: z.string().max(200),
    })
    .optional(),
});

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-store, no-transform',
  'x-accel-buffering': 'no',
  connection: 'keep-alive',
};

// streams currently running per user (this process; the staging/pilot deployment is a single web instance)
const MAX_PARALLEL_STREAMS = 3;
const streams = ((globalThis as { lcStreams?: Map<number, number> }).lcStreams ??= new Map<number, number>());
function trackStream(userId: number, body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  streams.set(userId, (streams.get(userId) ?? 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const n = (streams.get(userId) ?? 1) - 1;
    if (n <= 0) streams.delete(userId);
    else streams.set(userId, n);
  };
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) { release(); controller.close(); } else controller.enqueue(value);
      } catch (err) { release(); controller.error(err); }
    },
    cancel(reason) { release(); return reader.cancel(reason); },
  });
}

function sseOnce(events: ChatEvent[]): Response {
  return new Response(events.map(formatEvent).join(''), { headers: SSE_HEADERS });
}

// operationId chat_stream — auth gate + byte proxy to the AI service (docs/03-technical-spec.md §1.4)
export const POST = defineOperation(
  { operationId: 'chat_stream', role: 'guest', csrf: true, input: ChatStreamRequest },
  async ({ req, session, input }) => {
    if (input.regenerate && !input.chat_id) return fail('invalid_input', 'regenerate needs a chat');
    if (input.chat_id) await assertChatAccess(session, input.chat_id);

    // at most MAX_PARALLEL_STREAMS answers at a time per user (FR-CHAT-025 AC3) — checked before a message is counted
    const userId = Number(session.user.id);
    if ((streams.get(userId) ?? 0) >= MAX_PARALLEL_STREAMS) {
      return sseOnce([{ event: 'error', data: { error: 'too_many_streams' } }, { event: 'complete', data: { status: 'completed', message_id: null } }]);
    }

    // kill switch (incident): checked before anything is counted or sent to the AI service
    const kill = await getKillSwitch();
    if (chatBlocked(kill, roleOf(session) === 'guest')) {
      metrics().chatStops.inc({ reason: 'kill_switch' });
      const t = await getTranslations('chat');
      return sseOnce([
        { event: 'guardrail', data: { kind: 'maintenance', stage: 'kill_switch', title: t('maintenanceTitle'), text: kill.note || t('maintenanceText'), reason: null } },
        { event: 'complete', data: { status: 'completed', message_id: null } },
      ]);
    }
    const perMin = await rateLimit('chat', `u:${userId}`, roleOf(session) === 'guest' ? limits.guestChatPerMin : limits.chatPerMin, 60);
    if (!perMin.ok) {
      metrics().chatStops.inc({ reason: 'rate_limit' });
      const t = await getTranslations('chat');
      return sseOnce([
        { event: 'guardrail', data: { kind: 'rate_limit', stage: 'rate_limit', title: t('quotaTitle'), text: t('rateLimited'), reason: null } },
        { event: 'complete', data: { status: 'completed', message_id: null } },
      ]);
    }

    const quota = await tryConsumeMessage(session);
    if (!quota.ok) {
      metrics().chatStops.inc({ reason: 'quota' });
      const t = await getTranslations('chat');
      return sseOnce([
        {
          event: 'guardrail',
          data: {
            kind: 'quota',
            stage: 'quota',
            title: t('quotaTitle'),
            text: t('quotaText', { limit: quota.limit }),
            reason: null,
          },
        },
        { event: 'complete', data: { status: 'completed', message_id: null } },
      ]);
    }

    const user = session.user as { id: string; isAnonymous?: boolean };
    const lcUser = {
      user_id: String(user.id),
      role: roleOf(session),
      is_anonymous: !!user.isAnonymous,
      locale: req.headers.get('x-lc-locale') === 'en' ? 'en' : 'th',
      // verified membership (quota scope) — the AI service trusts this header, so never pass a stale session value
      org_id: quota.orgId,
    };

    const upstream = await fetch(`${env.aiServiceUrl}/v1/chat/stream`, {
      method: 'POST',
      signal: req.signal,
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        'x-service-token': env.aiServiceToken,
        'x-lc-user': JSON.stringify(lcUser),
        'x-request-id': crypto.randomUUID(),
      },
      body: JSON.stringify(input),
    }).catch(() => null);

    if (!upstream?.ok || !upstream.body) {
      return sseOnce([
        { event: 'error', data: { error: 'ai_unavailable' } },
        { event: 'complete', data: { status: 'completed', message_id: null } },
      ]);
    }
    return new Response(trackStream(userId, upstream.body), { headers: SSE_HEADERS });
  },
);
