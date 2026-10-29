'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Trash2, UserMinus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { cardClass, dangerBtn, errorClass, inputClass, noticeClass, primaryBtn, secondaryBtn } from '@/components/account/styles';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/client/api';
import { hardNavigate } from '@/lib/client/nav';

type OrgSummary = {
  org: { id: string; name: string; slug: string; business_type: string | null; province_code: string | null; status: string; deletion_scheduled_at: string | null };
  my_role: string;
  settings: { seat_limit: number; contract_retention_days: number | null } | null;
  counsel: { user_id: number; name: string }[];
};
type Member = { id: string; role: string; userId: string; user: { name: string; email: string } };
type Invitation = { id: string; email: string; role: string; status: string; expiresAt: string };

const ROLES = ['org_owner', 'org_admin', 'org_member', 'org_counsel'] as const;
const INVITE_ROLES = ['org_admin', 'org_member', 'org_counsel'] as const;

export function OrgSettingsView({ orgId, meId, mailLive }: { orgId: string; meId: string; mailLive: boolean }) {
  const qc = useQueryClient();
  const { data: sum } = useQuery({ queryKey: ['org', orgId], queryFn: () => apiFetch<OrgSummary>(`/api/v1/orgs/${orgId}`) });
  const { data: full } = useQuery({
    queryKey: ['org-full', orgId],
    queryFn: async () => {
      const r = await authClient.organization.getFullOrganization({ query: { organizationId: orgId } });
      return { members: (r.data?.members ?? []) as unknown as Member[], invitations: ((r.data?.invitations ?? []) as unknown as Invitation[]).filter((i) => i.status === 'pending') };
    },
  });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['org', orgId] }), qc.invalidateQueries({ queryKey: ['org-full', orgId] })]);
  if (!sum) return <p className="p-6 text-muted">…</p>;

  const { org, my_role: myRole } = sum;
  const manager = myRole === 'org_owner' || myRole === 'org_admin';
  const pendingDeletion = org.status === 'pending_deletion';

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
        <h1 className="font-serif text-2xl font-bold">{org.name}</h1>
        {pendingDeletion && <DeletionBanner orgId={orgId} date={org.deletion_scheduled_at!} owner={myRole === 'org_owner'} onDone={() => hardNavigate('/org/settings')} />}
        {manager && !pendingDeletion && <General orgId={orgId} sum={sum} onSaved={refresh} />}
        <Members orgId={orgId} meId={meId} mailLive={mailLive} myRole={myRole} members={full?.members ?? []} invitations={full?.invitations ?? []} manager={manager && !pendingDeletion} seats={sum.settings?.seat_limit} onChanged={refresh} />
        {manager && !pendingDeletion && <Retention orgId={orgId} value={sum.settings?.contract_retention_days ?? null} onSaved={refresh} />}
        <Danger orgId={orgId} name={org.name} myRole={myRole} pendingDeletion={pendingDeletion} />
      </div>
    </div>
  );
}

function General({ orgId, sum, onSaved }: { orgId: string; sum: OrgSummary; onSaved: () => void }) {
  const t = useTranslations('org.general');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await apiFetch(`/api/v1/orgs/${orgId}`, { method: 'PATCH', body: JSON.stringify({
        name: String(f.get('name')).trim(), business_type: String(f.get('business_type')).trim() || null, province_code: String(f.get('province')).trim() || null }) });
      setMsg({ ok: true, text: t('saved') });
      onSaved();
    } catch {
      setMsg({ ok: false, text: t('error') });
    }
  }
  return (
    <section className={cardClass} aria-labelledby="org-general">
      <h2 id="org-general" className="text-lg font-bold">{t('title')}</h2>
      <form onSubmit={save} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">{t('name')}<input name="name" defaultValue={sum.org.name} required minLength={2} maxLength={120} className={inputClass} /></label>
        <div className="text-sm"><span className="font-medium">{t('slug')}: </span><span className="font-mono">{sum.org.slug}</span></div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">{t('businessType')}<input name="business_type" defaultValue={sum.org.business_type ?? ''} maxLength={80} className={inputClass} /></label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">{t('province')}<input name="province" defaultValue={sum.org.province_code ?? ''} inputMode="numeric" pattern="[0-9]{2}" maxLength={2} placeholder="10" className={`${inputClass} max-w-32`} /><span className="text-xs font-normal text-muted">{t('provinceHint')}</span></label>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? noticeClass : errorClass}>{msg.text}</p>}
        <div><button type="submit" className={primaryBtn}>{t('save')}</button></div>
      </form>
    </section>
  );
}

function Members({ orgId, meId, mailLive, myRole, members, invitations, manager, seats, onChanged }: {
  orgId: string; meId: string; mailLive: boolean; myRole: string; members: Member[]; invitations: Invitation[]; manager: boolean; seats?: number; onChanged: () => void;
}) {
  const t = useTranslations('org.members');
  const roleT = useTranslations('org.roles');
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
  const errText = (code?: string) => (code === 'SEAT_LIMIT_REACHED' ? t('seatLimit') : code === 'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION' ? t('alreadyMember') : t('error'));

  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setError(null);
    setSent(null);
    const email = String(f.get('email')).trim().toLowerCase();
    const r = await authClient.organization.inviteMember({ email, role: String(f.get('role')) as (typeof INVITE_ROLES)[number], organizationId: orgId, resend: true });
    if (r.error) return setError(errText(r.error.code));
    form.reset();
    setSent(email);
    onChanged();
  }
  async function setRole(m: Member, role: string) {
    setError(null);
    const r = await authClient.organization.updateMemberRole({ memberId: m.id, role: role as (typeof ROLES)[number], organizationId: orgId });
    if (r.error) setError(t('roleDenied'));
    onChanged();
  }
  async function remove(m: Member) {
    if (!window.confirm(t('removeConfirm', { name: m.user.name }))) return;
    setError(null);
    const r = await authClient.organization.removeMember({ memberIdOrEmail: m.id, organizationId: orgId });
    if (r.error) setError(t('error'));
    onChanged();
  }

  return (
    <section className={cardClass} aria-labelledby="org-members">
      <h2 id="org-members" className="text-lg font-bold">{t('title')} <span className="text-sm font-normal text-muted">({members.length}{seats ? `/${seats}` : ''})</span></h2>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {members.map((m) => {
          const isMe = m.userId === meId;
          const locked = !manager || isMe || (myRole === 'org_admin' && m.role === 'org_owner');
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{m.user.name}{isMe && <span className="ml-2 text-xs text-muted">{t('you')}</span>}</span>
                <span className="block truncate text-sm text-muted">{m.user.email}</span>
              </span>
              {locked ? <span className="rounded-full bg-surface-2 px-3 py-1 text-sm">{roleT(m.role as never)}</span> : (
                <select aria-label={t('roleOf', { name: m.user.name })} value={m.role} onChange={(e) => void setRole(m, e.target.value)} className="h-10 rounded-lg border border-border-strong bg-surface px-2 text-sm">
                  {ROLES.filter((r) => r !== 'org_owner' || myRole === 'org_owner').map((r) => <option key={r} value={r}>{roleT(r)}</option>)}
                </select>
              )}
              {manager && !isMe && !(myRole === 'org_admin' && m.role === 'org_owner') && (
                <button type="button" onClick={() => void remove(m)} aria-label={t('remove', { name: m.user.name })} className="flex size-10 items-center justify-center rounded-lg text-danger hover:bg-danger-050">
                  <UserMinus className="size-[18px]" aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className={errorClass}>{error}</p>}

      {manager && (
        <>
          {mailLive && <form onSubmit={invite} className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="flex items-center gap-2 font-semibold"><Mail className="size-4" aria-hidden="true" />{t('inviteTitle')}</h3>
            <div className="flex flex-wrap gap-2">
              <input name="email" type="email" required placeholder={t('emailPlaceholder')} aria-label={t('email')} className={`${inputClass} min-w-56 flex-1`} />
              <select name="role" defaultValue="org_member" aria-label={t('role')} className="h-11 rounded-[10px] border border-border-strong bg-surface px-2">
                {INVITE_ROLES.map((r) => <option key={r} value={r}>{roleT(r)}</option>)}
              </select>
              <button type="submit" className={primaryBtn}>{t('send')}</button>
            </div>
            <p className="text-xs text-muted">{t('inviteHint')}</p>
            {sent && <p role="status" className={noticeClass}>{t('sent', { email: sent })}</p>}
          </form>}
          {invitations.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold">{t('pending')}</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
                    <span>{i.email} · {roleT(i.role as never)}</span>
                    <span className="flex items-center gap-3 text-muted">
                      {t('expires', { date: fmt(i.expiresAt) })}
                      <button type="button" className="text-danger hover:underline" onClick={async () => { await authClient.organization.cancelInvitation({ invitationId: i.id }); onChanged(); }}>{t('cancel')}</button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Retention({ orgId, value, onSaved }: { orgId: string; value: number | null; onSaved: () => void }) {
  const t = useTranslations('org.retention');
  const [msg, setMsg] = useState<string | null>(null);
  const options: (number | null)[] = [30, 90, 180, 365, null];
  async function change(v: number | null) {
    await apiFetch(`/api/v1/orgs/${orgId}`, { method: 'PATCH', body: JSON.stringify({ contract_retention_days: v }) });
    setMsg(t('saved'));
    onSaved();
  }
  return (
    <section className={cardClass} aria-labelledby="org-ret">
      <h2 id="org-ret" className="text-lg font-bold">{t('title')}</h2>
      <p className="text-sm text-muted">{t('text')}</p>
      <div role="radiogroup" aria-labelledby="org-ret" className="flex flex-wrap gap-1 rounded-[10px] bg-surface-2 p-1">
        {options.map((o) => (
          <button key={String(o)} type="button" role="radio" aria-checked={value === o} onClick={() => void change(o)}
            className={`min-h-9 flex-1 rounded-lg px-3 text-sm ${value === o ? 'bg-surface font-semibold shadow-sm' : 'text-muted hover:text-text'}`}>
            {o === null ? t('forever') : t('days', { n: o })}
          </button>
        ))}
      </div>
      {msg && <p role="status" className={noticeClass}>{msg}</p>}
    </section>
  );
}

function DeletionBanner({ orgId, date, owner, onDone }: { orgId: string; date: string; owner: boolean; onDone: () => void }) {
  const t = useTranslations('org.danger');
  const locale = useLocale();
  const d = new Date(date).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-warning-050 px-4 py-3 text-warning">
      <Trash2 className="size-5 shrink-0" aria-hidden="true" />
      <span className="flex-1">{t('scheduled', { date: d })}</span>
      {owner && <button type="button" className={secondaryBtn} onClick={async () => { await apiFetch(`/api/v1/orgs/${orgId}/deletion`, { method: 'DELETE' }); onDone(); }}>{t('cancelDeletion')}</button>}
    </div>
  );
}

function Danger({ orgId, name, myRole, pendingDeletion }: { orgId: string; name: string; myRole: string; pendingDeletion: boolean }) {
  const t = useTranslations('org.danger');
  const [step, setStep] = useState<'idle' | 'delete'>('idle');
  const [error, setError] = useState<string | null>(null);
  async function leave() {
    if (!window.confirm(t('leaveConfirm', { org: name }))) return;
    try {
      await apiFetch(`/api/v1/orgs/${orgId}/leave`, { method: 'POST' });
      await authClient.organization.setActive({ organizationId: null });
      hardNavigate('/chat');
    } catch (err) {
      setError((err as Error).message === 'conflict' ? t('lastOwner') : t('error'));
    }
  }
  async function del(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await apiFetch(`/api/v1/orgs/${orgId}/deletion`, { method: 'POST', body: JSON.stringify({ confirm_name: String(new FormData(e.currentTarget).get('confirm')) }) });
      hardNavigate('/org/settings');
    } catch (err) {
      setError((err as Error).message === 'invalid_input' ? t('nameMismatch') : t('error'));
    }
  }
  return (
    <section className={cardClass} aria-labelledby="org-danger">
      <h2 id="org-danger" className="text-lg font-bold text-danger">{t('title')}</h2>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">{t('leaveText')}</p>
        <div><button type="button" onClick={() => void leave()} className={secondaryBtn}>{t('leave')}</button></div>
      </div>
      {myRole === 'org_owner' && !pendingDeletion && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-sm text-muted">{t('deleteText')}</p>
          {step === 'idle' ? (
            <div><button type="button" onClick={() => setStep('delete')} className={dangerBtn}>{t('delete')}</button></div>
          ) : (
            <form onSubmit={del} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">{t('typeName', { name })}<input name="confirm" required autoComplete="off" className={inputClass} /></label>
              <div className="flex gap-2"><button type="submit" className={dangerBtn}>{t('deleteConfirm')}</button><button type="button" className={secondaryBtn} onClick={() => setStep('idle')}>{t('cancel')}</button></div>
            </form>
          )}
        </div>
      )}
      {error && <p role="alert" className={errorClass}>{error}</p>}
    </section>
  );
}
