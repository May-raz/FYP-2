import React, { useEffect } from 'react';

function capitalize(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function dominantFromTrend(trend) {
  if (!trend?.length) return 'Neutral';
  const sorted = [...trend].sort((a, b) => b.pct - a.pct);
  const top = sorted[0];
  if (top.label === 'neutral' && sorted.length > 1) {
    const alt = sorted.find((x) => x.label !== 'neutral' && x.pct > 0);
    if (alt) return capitalize(alt.label);
  }
  return capitalize(top.label);
}

function statValue(n, fallback) {
  if (typeof n === 'number' && !Number.isNaN(n)) return String(n);
  return fallback;
}

export function ChatEndModal({
  title = 'Chat summary',
  summary,
  improvements = [],
  messageCount,
  durationLabel,
  emotionTrend,
  onStartNewChat,
  onDownloadTranscript,
  onBackToDashboard,
}) {
  const titleId = React.useId();
  const dominant = dominantFromTrend(emotionTrend);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center p-5 sm:p-8 animate-chat-end-backdrop"
      style={{
        background: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-[90%] max-w-[560px] max-h-[min(92vh,880px)] overflow-y-auto rounded-[22px] bg-white shadow-chat-end animate-chat-end-card dark:bg-slate-900 dark:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45)]"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] rounded-t-[22px] bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-400 opacity-90"
          aria-hidden
        />
        <div className="px-8 pb-10 pt-9 sm:px-10 sm:pb-11 sm:pt-10">
          <p className="mb-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            Session complete
          </p>
          <h2
            id={titleId}
            className="mb-6 text-left text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-[1.65rem]"
          >
            {title}
          </h2>

          <div className="mb-8 space-y-6">
            <section className="text-left">
              <p className="max-w-prose text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
                {summary}
              </p>
            </section>

            <section aria-label="Session stats" className="text-left">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Session stats
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Messages</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                    {statValue(messageCount, '—')}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Duration</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">
                    {durationLabel && durationLabel.trim() ? durationLabel : '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Dominant tone</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">{dominant}</p>
                </div>
              </div>
            </section>

            {improvements.length > 0 && (
              <section className="text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Ideas for next time
                </p>
                <ul className="list-none space-y-2.5 pl-0 text-[14px] leading-snug text-slate-600 dark:text-slate-300">
                  {improvements.map((line, i) => (
                    <li
                      key={i}
                      className="relative pl-4 before:absolute before:left-0 before:top-[0.55em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-indigo-400"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onStartNewChat}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-indigo-600 text-[15px] font-semibold text-white shadow-md transition duration-200 hover:scale-[1.01] hover:bg-indigo-500 hover:shadow-lg active:scale-[0.99] dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              Start new chat
            </button>
            <button
              type="button"
              onClick={onDownloadTranscript}
              className="flex h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-[15px] font-semibold text-slate-800 shadow-sm transition duration-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow active:scale-[0.99] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:hover:border-slate-500"
            >
              Download transcript
            </button>
            {onBackToDashboard && (
              <button
                type="button"
                onClick={onBackToDashboard}
                className="flex h-12 w-full items-center justify-center rounded-xl text-[14px] font-medium text-slate-600 transition duration-200 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.99] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                Back to dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
