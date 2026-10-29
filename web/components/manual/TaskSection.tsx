import { Lightbulb, TriangleAlert } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { prepareSteps, type RoleTask } from '@/lib/manual-core';
import { imageSize } from '@/lib/manual';
import { ZoomImage } from './ZoomImage';

// Screenshots are user-visible content, not UI chrome: plain <img> (the jpgs are served as-is from /public/manual/img),
// zoomed in a modal (ZoomImage).
export async function TaskSection({ item }: { item: RoleTask }) {
  const t = await getTranslations('manual');
  const { task, anchor } = item;
  const steps = prepareSteps(task.steps);
  const headingId = `${anchor}-h`;
  return (
    <section id={anchor} aria-labelledby={headingId} className="scroll-mt-6 rounded-2xl border border-border bg-surface p-5 sm:p-7 print:rounded-none print:border-0 print:p-0">
      <h3 id={headingId} className="font-serif text-[1.375rem] leading-snug font-bold text-navy dark:text-text">{task.title}</h3>
      {task.goal && (
        <p className="mt-2 text-[1.0625rem] leading-relaxed">
          <span className="font-semibold">{t('goal')}:</span> {task.goal}
        </p>
      )}
      {task.needs && (
        <div className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-[1.0625rem] leading-relaxed">
          <p className="text-sm font-semibold text-muted">{t('needs')}</p>
          <p className="whitespace-pre-line">{task.needs}</p>
        </div>
      )}
      {steps.length > 0 && (
        <ol role="list" aria-label={t('stepsLabel', { title: task.title })} className="mt-6 flex list-none flex-col gap-8 p-0">
          {steps.map((s) => (
            <li key={s.number} className="flex gap-4 print:break-inside-avoid">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-white">
                <span className="sr-only">{t('stepWord')} </span>
                {s.number}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <p className="pt-1 text-[1.0625rem] leading-relaxed whitespace-pre-line">{s.text}</p>
                {s.imageSrc && (() => {
                  const { width, height } = imageSize(s.imageSrc);
                  return (
                  <figure className="m-0">
                    <ZoomImage src={s.imageSrc} alt={s.alt} width={width} height={height} />
                    <figcaption className="mt-1.5 text-sm text-muted">{t('figure', { n: s.number })}</figcaption>
                  </figure>
                  );
                })()}
                {s.result && (
                  <p className="rounded-lg border-l-4 border-success bg-success-050 px-3 py-2 text-base leading-relaxed">
                    <strong className="text-success">{t('resultLabel')}</strong> {s.result}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {task.tips.length > 0 && (
        <div className="mt-6 rounded-xl border border-primary/30 bg-primary-050 p-4 print:break-inside-avoid">
          <p className="flex items-center gap-2 font-semibold text-primary-700">
            <Lightbulb className="size-[18px]" aria-hidden="true" />
            {t('tips')}
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-6 leading-relaxed">
            {task.tips.map((tip, i) => <li key={i}>{tip}</li>)}
          </ul>
        </div>
      )}
      {task.warnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-warning/40 bg-warning-050 p-4 print:break-inside-avoid">
          <p className="flex items-center gap-2 font-semibold text-warning">
            <TriangleAlert className="size-[18px]" aria-hidden="true" />
            {t('warnings')}
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-6 leading-relaxed">
            {task.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
