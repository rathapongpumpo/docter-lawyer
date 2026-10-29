import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { buildSearchIndex, cleanResult, ManualInvalidError, menuAnchor, parseManual, prepareSteps, resolveRoleMenus, roleNeighbors, searchManual, slugify, taskAnchor } from '@/lib/manual-core';

vi.mock('server-only', () => ({}));

// Tiny inline sample in the fixed content schema (the real content lives in web/content/manual/manual.th.json)
const sample = () => ({
  version: '2026-10-02',
  roles: [
    {
      id: 'guest', title: 'ผู้ใช้ทดลอง', who: 'ยังไม่สมัครสมาชิก', can: ['ถามแชท'], cannot: ['บันทึกแชท'],
      menus: [{ id: 'chat', title: 'ถามกฎหมาย', purpose: 'ถามคำถาม', tasks: ['ask', 'register'] }],
    },
    {
      id: 'member', title: 'สมาชิก', who: 'สมัครแล้ว', can: [], cannot: [],
      menus: [
        { id: 'chat', title: 'ถามกฎหมาย', purpose: '', tasks: ['ask'] },
        { id: 'again', title: 'ซ้ำ', purpose: '', tasks: ['ask'] },
      ],
    },
  ],
  tasks: {
    ask: {
      title: 'ถามคำถามกฎหมาย', goal: 'ได้คำตอบพร้อมอ้างอิง', needs: null,
      steps: [
        { text: 'พิมพ์คำถามในช่องแชท', image: 'chat-ask.jpg', alt: 'ช่องพิมพ์คำถาม', result: 'จะเห็น: คำตอบทยอยขึ้น' },
        { text: 'กดส่ง', result: null },
      ],
      tips: ['ใส่ชื่อกฎหมายจะได้ผลดี'], warnings: [],
    },
    register: { title: 'สมัครสมาชิก', goal: '', needs: 'อีเมล', steps: [{ text: 'กดสมัคร' }], tips: [], warnings: ['อย่าใช้รหัสผ่านซ้ำ'] },
  },
});

describe('parseManual', () => {
  it('accepts content in the fixed schema', () => {
    const m = parseManual(sample());
    expect(m.roles).toHaveLength(2);
    expect(m.tasks.ask?.steps[1]?.result).toBeNull();
  });
  it('rejects a wrong shape with a readable path', () => {
    const bad = sample() as unknown as { tasks: { ask: { steps: unknown } } };
    bad.tasks.ask.steps = 'x';
    expect(() => parseManual(bad)).toThrow(ManualInvalidError);
    expect(() => parseManual(bad)).toThrow(/tasks\.ask\.steps/);
  });
  it('rejects an unknown role id, an unknown task reference, a duplicate role and an image that is not a plain file name', () => {
    const a = sample(); (a.roles[0] as { id: string }).id = 'boss';
    expect(() => parseManual(a)).toThrow(/roles\.0\.id/);
    const b = sample(); b.roles[0]!.menus[0]!.tasks.push('nope');
    expect(() => parseManual(b)).toThrow(/unknown task "nope"/);
    const c = sample(); (c.roles[1] as { id: string }).id = 'guest';
    expect(() => parseManual(c)).toThrow(/more than once/);
    const d = sample(); d.tasks.ask.steps[0]!.image = '../../etc/passwd';
    expect(() => parseManual(d)).toThrow(/image/);
  });
});

describe('anchors', () => {
  it('makes URL-safe ids and keeps Thai letters', () => {
    expect(slugify('Create Org / step 1')).toBe('create-org-step-1');
    expect(slugify('สมัคร สมาชิก')).toBe('สมัคร-สมาชิก');
    expect(slugify('///')).toBe('x');
    expect(taskAnchor('login')).toBe('login');
    expect(menuAnchor('chat')).toBe('menu-chat');
  });
});

describe('prepareSteps', () => {
  it('numbers steps from 1, builds the image URL and falls back to the step text for alt', () => {
    const steps = prepareSteps(parseManual(sample()).tasks.ask!.steps);
    expect(steps.map((s) => s.number)).toEqual([1, 2]);
    expect(steps[0]).toMatchObject({ imageSrc: '/manual/img/chat-ask.jpg', alt: 'ช่องพิมพ์คำถาม', result: 'คำตอบทยอยขึ้น' });
    expect(steps[1]).toMatchObject({ imageSrc: null, alt: 'กดส่ง', result: null });
  });
  it('drops a duplicate leading "จะเห็น" from a result', () => {
    expect(cleanResult('จะเห็น หน้าแรก')).toBe('หน้าแรก');
    expect(cleanResult('  ')).toBeNull();
    expect(cleanResult(undefined)).toBeNull();
    expect(cleanResult('หน้าแรกจะเห็นปุ่ม')).toBe('หน้าแรกจะเห็นปุ่ม');
  });
});

describe('resolveRoleMenus / roleNeighbors', () => {
  it('resolves tasks and keeps anchors unique when a task is listed under two menus of one role', () => {
    const m = parseManual(sample());
    const menus = resolveRoleMenus(m, m.roles[1]!);
    expect(menus.map((x) => x.anchor)).toEqual(['menu-chat', 'menu-again']);
    expect(menus[0]!.tasks[0]!.anchor).toBe('ask');
    expect(menus[1]!.tasks[0]!.anchor).toBe('ask-2');
    expect(menus[0]!.tasks[0]!.task.title).toBe('ถามคำถามกฎหมาย');
  });
  it('a task shared by several roles resolves with the same content in each', () => {
    const m = parseManual(sample());
    expect(resolveRoleMenus(m, m.roles[0]!)[0]!.tasks[0]!.task).toBe(resolveRoleMenus(m, m.roles[1]!)[0]!.tasks[0]!.task);
  });
  it('finds previous and next roles', () => {
    const m = parseManual(sample());
    expect(roleNeighbors(m, 'guest')).toMatchObject({ prev: null, next: { id: 'member' } });
    expect(roleNeighbors(m, 'member')).toMatchObject({ prev: { id: 'guest' }, next: null });
    expect(roleNeighbors(m, 'admin')).toEqual({ prev: null, next: null });
  });
});

describe('search', () => {
  const index = buildSearchIndex(parseManual(sample()));
  it('has one entry per task, linked to the first role that lists it', () => {
    expect(index.map((e) => e.taskId).sort()).toEqual(['ask', 'register']);
    expect(index.find((e) => e.taskId === 'ask')).toMatchObject({ roleId: 'guest', rolesTitles: ['ผู้ใช้ทดลอง', 'สมาชิก'], anchor: 'ask' });
  });
  it('matches titles first, then goal, then step text; all words must match', () => {
    expect(searchManual(index, 'สมัคร').map((e) => e.taskId)).toEqual(['register']);
    expect(searchManual(index, 'ช่องแชท').map((e) => e.taskId)).toEqual(['ask']);
    expect(searchManual(index, 'อ้างอิง คำถาม').map((e) => e.taskId)).toEqual(['ask']);
    expect(searchManual(index, 'อ้างอิง สมัคร')).toEqual([]);
  });
  it('returns nothing for an empty or blank query', () => {
    expect(searchManual(index, '')).toEqual([]);
    expect(searchManual(index, '   ')).toEqual([]);
  });
});

describe('loadManual', () => {
  const dir = mkdtempSync(join(tmpdir(), 'manual-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  it('returns null while the content file does not exist', async () => {
    const { loadManual } = await import('@/lib/manual');
    expect(loadManual(join(dir, 'missing.json'))).toBeNull();
  });
  it('loads a valid file and throws a clear error for bad JSON or bad content', async () => {
    const { loadManual } = await import('@/lib/manual');
    const ok = join(dir, 'ok.json');
    writeFileSync(ok, JSON.stringify(sample()));
    expect(loadManual(ok)?.version).toBe('2026-10-02');
    const broken = join(dir, 'broken.json');
    writeFileSync(broken, '{ not json');
    expect(() => loadManual(broken)).toThrow(/not valid JSON/);
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ version: '1' }));
    expect(() => loadManual(bad)).toThrow(/Invalid user manual content/);
  });
});

describe('shipped manual content', () => {
  it('parses and every screenshot file exists', async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    const manual = parseManual(JSON.parse(readFileSync(join(process.cwd(), 'content/manual/manual.th.json'), 'utf8')));
    const missing = Object.values(manual.tasks).flatMap((t) => t.steps.map((s) => s.image)).filter((f): f is string => !!f && !existsSync(join(process.cwd(), 'public/manual/img', f)));
    expect(missing).toEqual([]);
  });
});
