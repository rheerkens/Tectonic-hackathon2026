import type { Step, TimelineEvent, Rect } from './types.ts';

/** Monotonic clock anchored at the moment video capture started. */
export class Clock {
  private readonly origin: number;
  constructor(origin = performance.now()) {
    this.origin = origin;
  }
  now(): number {
    return Number(((performance.now() - this.origin) / 1000).toFixed(3));
  }
}

export class Timeline {
  readonly events: TimelineEvent[] = [];
  readonly chapters: Array<{ seconds: number; title: string }> = [];

  begin(step: Step, seconds: number): TimelineEvent {
    const event: TimelineEvent = {
      id: step.id,
      chapter: step.chapter,
      kind: step.kind,
      startSeconds: seconds,
      actionSeconds: null,
      endSeconds: seconds,
      caption: step.caption,
      title: step.title ?? null,
      input: step.input ?? null,
      actor: step.actor ?? null,
      offscreen: step.offscreen ?? null,
      target: null,
      expected: step.expected ?? null,
      screenshot: null,
    };
    // The first chapter always starts at 0: the video begins with the opening scene.
    if (!this.chapters.some((c) => c.title === step.chapter)) this.chapters.push({ seconds: this.chapters.length === 0 ? 0 : seconds, title: step.chapter });
    this.events.push(event);
    return event;
  }

  setTarget(event: TimelineEvent, rect: Rect | null) {
    event.target = rect ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } : null;
  }
}

const fmt = (s: number | null) => (s === null ? '—' : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`);

/** Editable review table generated from the actual timeline (skill template columns). */
export function renderScript(opts: { title: string; audience: string; language: string; baseUrl: string; runId: string; rehearsal: boolean; events: TimelineEvent[]; duration: number | null; notes: string[] }): string {
  const rows = opts.events.map((e) =>
    [
      e.id,
      `${e.chapter} / ${fmt(e.startSeconds)}–${fmt(e.endSeconds)}${e.actionSeconds !== null ? ` (action ${fmt(e.actionSeconds)})` : ''}`,
      `${e.kind}${e.title ? `: **${e.title}**` : ''} — ${e.caption}`,
      [e.target ? `target ${e.target.width}×${e.target.height} @ ${e.target.x},${e.target.y}` : 'no target', e.input ? `input \`${e.input}\`` : null].filter(Boolean).join('; '),
      [e.actor, e.offscreen].filter(Boolean).join(' — ') || '—',
      e.expected ?? '—',
      e.screenshot ? `frames/${e.screenshot}` : '—',
    ]
      .map((cell) => String(cell).replace(/\|/g, '\\|'))
      .join(' | '),
  );
  return `# ${opts.title} — recording script

Status: ${opts.rehearsal ? 'rehearsal' : 'recorded'}. Audience: ${opts.audience}. UI language: ${opts.language}. Caption language: ${opts.language}. Duration: ${opts.duration === null ? 'unknown' : `${opts.duration.toFixed(1)}s`}.

## Scope and evidence

Scenario source: \`tools/video/scenarios/${opts.runId.split('-')[0]}.ts\` (edit captions, inputs and steps there; this table is generated from the actual timeline).
Demo environment: ${opts.baseUrl} (isolated \`video\` profile, freshly seeded synthetic data, demo identities only).

## Actual timeline

| Step ID | Chapter / actual time | Scene and exact caption | Target / action / exact input | Off-screen action and actor | Expected visible result | Evidence |
|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r} |`).join('\n')}

## Review and feedback

| Step ID / timestamp | Finding | Evidence | Resolution | Rechecked artifact |
|---|---|---|---|---|

## Notes

${opts.notes.map((n) => `- ${n}`).join('\n') || '- none'}
`;
}
