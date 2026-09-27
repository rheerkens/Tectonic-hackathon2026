import type { BrowserContext, Locator, Page } from 'playwright';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StepContext {
  /** The recorded browser page (the "presenter", Ada). */
  page: Page;
  context: BrowserContext;
  /** A second, unrecorded browser session (Grace) for cross-session demonstrations. */
  helper: Page;
  helperContext: BrowserContext;
  baseUrl: string;
  rehearsal: boolean;
  /** Reading hold, shortened during rehearsal. */
  hold(ms: number): Promise<void>;
  /** Moves the visible cursor to the target and performs a real click. */
  click(target: Locator): Promise<void>;
  /** Focuses a real input and types visibly. */
  type(target: Locator, text: string): Promise<void>;
  log(message: string): void;
}

export type StepKind =
  /** App fully visible, no overlay. */
  | 'view'
  /** Full-screen announcement slide (chapter start or closing). */
  | 'slide'
  /** Explanation card; no interaction. */
  | 'note'
  /** Explanation card, then a real highlighted interaction, then an expectation. */
  | 'action';

export interface Step {
  /** Stable id used in the timeline, review frames and feedback. */
  id: string;
  chapter: string;
  kind: StepKind;
  /** Slide heading or note heading. */
  title?: string;
  /** Exact caption shown to the viewer. */
  caption: string;
  /** Exact synthetic input displayed in the input bar (and typed by `act` when relevant). */
  input?: string;
  /** Element to highlight. Measured live after layout settles. */
  target?: (ctx: StepContext) => Locator;
  /** Reading hold in ms before the action / next step. */
  holdMs?: number;
  /** The real interaction. The note is removed first; the target outline stays visible. */
  act?: (ctx: StepContext) => Promise<void>;
  /** Readiness assertion after `act`, using bounded waits (never a fixed sleep). */
  expect?: (ctx: StepContext) => Promise<void>;
  /** Documentation for the script table. */
  actor?: string;
  offscreen?: string;
  expected?: string;
  /** Marks the closing slide (different styling). */
  closing?: boolean;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  audience: string;
  language: string;
  viewport: { width: number; height: number };
  /** Query-string identity for the recorded session and the helper session. */
  presenter: string;
  helperIdentity: string;
  steps: Step[];
}

export interface TimelineEvent {
  id: string;
  chapter: string;
  kind: StepKind;
  startSeconds: number;
  actionSeconds: number | null;
  endSeconds: number;
  caption: string;
  title: string | null;
  input: string | null;
  actor: string | null;
  offscreen: string | null;
  target: Rect | null;
  expected: string | null;
  screenshot: string | null;
}

export interface RecordingManifest {
  runId: string;
  scenario: string;
  rehearsal: boolean;
  recordedAt: string;
  viewport: { width: number; height: number };
  baseUrl: string;
  video: { webm: string; mp4: string | null; durationSeconds: number | null; expectedSeconds: number; driftSeconds: number | null };
  chapters: Array<{ seconds: number; title: string }>;
  events: TimelineEvent[];
  player: string | null;
  notes: string[];
}
