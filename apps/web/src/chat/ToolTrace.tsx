import type { ChatToolCall, ChatToolName } from '@tectonic/shared';
import { Icon, Tick } from '../kennis/ui.tsx';

export const TOOL_LABELS: Record<ChatToolName, string> = {
  find_knowledge: 'Kennis zoeken',
  assess_trust: 'Vertrouwen beoordelen',
  get_source: 'Bron openen',
};

const duration = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toLocaleString('nl-BE', { maximumFractionDigits: 1 })} s`);

/** "Stappen (n)": what the assistant did to get to the answer, tool by tool. */
export function ToolTrace({ calls }: { calls: ChatToolCall[] }) {
  if (calls.length === 0) return null;
  const failed = calls.filter((c) => c.status === 'error').length;
  return (
    <details className="ch-fold ch-trace" data-testid="ch-trace">
      <summary>
        <Icon name="steps" size={16} /> Stappen ({calls.length})
        {failed > 0 && <span className="ch-flag"> · {failed} mislukt</span>}
      </summary>
      <ol className="ch-steps">
        {calls.map((call) => (
          <li key={call.id} className={`ch-step ch-step--${call.status}`}>
            <Tick tone={call.status === 'ok' ? 'good' : 'bad'} />
            <div className="ch-step-body">
              <div className="ch-step-head">
                <strong>{TOOL_LABELS[call.name]}</strong>
                <span className="ch-status-text">{call.status === 'ok' ? 'gelukt' : 'mislukt'}</span>
                <span className="kn-muted ch-step-time">{duration(call.durationMs)}</span>
              </div>
              <p className="ch-step-summary">{call.summary}</p>
              {call.error && <p className="ch-step-error">{call.error}</p>}
              <details className="ch-args">
                <summary>Argumenten</summary>
                <pre>{JSON.stringify(call.args, null, 2)}</pre>
              </details>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
