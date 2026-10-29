import { splitParagraphs } from '@/lib/kb-refs';

// Verbatim statute text, set like a printed code: serif, a gold rule and วรรค numbers in the margin.
// No hooks, so it renders in server pages (/law) and inside client components (source panel).
export function StatuteText({
  body,
  paragraphLabel,
  anchors = false,
  compact = false,
}: {
  body: string;
  paragraphLabel: (n: number) => string;
  anchors?: boolean;
  compact?: boolean;
}) {
  const paragraphs = splitParagraphs(body);
  return (
    <div className={`border-l-2 border-statute bg-statute-050 ${compact ? 'rounded-r-lg py-2 pr-3' : 'rounded-r-xl py-4 pr-5'}`}>
      {paragraphs.map((p, i) => (
        <div
          key={i}
          id={anchors ? `p${i + 1}` : undefined}
          className={`grid scroll-mt-24 grid-cols-[2.25rem_1fr] rounded-r-lg target:bg-primary-050 ${compact ? 'py-1' : 'py-1.5'}`}
        >
          {paragraphs.length > 1 ? (
            <span
              aria-label={paragraphLabel(i + 1)}
              title={paragraphLabel(i + 1)}
              className="pt-[0.3em] text-center font-serif text-xs font-bold text-statute"
            >
              {i + 1}
            </span>
          ) : (
            <span />
          )}
          <p
            className={`font-serif whitespace-pre-line text-text ${
              compact ? 'text-[0.875rem] leading-[1.75]' : 'text-[16.5px] leading-[1.95]'
            }`}
          >
            {p}
          </p>
        </div>
      ))}
    </div>
  );
}
