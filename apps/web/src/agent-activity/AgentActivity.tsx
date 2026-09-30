import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './clock.ts';
import { LOOP_MS, SCENES, type SceneDef } from './scenes.ts';
import './agent-activity.css';

export interface AgentActivityProps { source: string; paused?: boolean }
export function AgentActivity({ source, paused = false }: AgentActivityProps) {
  const def = SCENES.find((s) => s.id === source);
  return def ? <Player key={source} def={def} paused={paused} /> : null;
}

function Player({ def, paused }: { def: SceneDef; paused: boolean }) {
  const reduced = usePrefersReducedMotion();
  const elapsed = useRef(0);
  const [ms, setMs] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (paused || reduced || !loaded) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      elapsed.current = (elapsed.current + now - previous) % LOOP_MS;
      previous = now;
      setMs(elapsed.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused, reduced, loaded]);

  const time = reduced ? 10_000 : ms;
  const slot = (time - 1000) / 2000;
  const index = Math.min(3, Math.max(0, Math.floor(slot)));
  const fraction = Math.max(0, slot - index);
  const target = def.targets[index]!;
  const prior = def.targets[Math.max(0, index - 1)]!;
  const ease = 1 - (1 - Math.min(1, fraction / 0.22)) ** 4;
  const rect = target.rect.map((v, i) => prior.rect[i]! + (v - prior.rect[i]!) * ease);
  const [x, y, w, h] = rect as [number, number, number, number];
  const visible = time < 1000 ? 0 : time > 10_400 ? Math.max(0, 1 - (time - 10_400) / 400) : Math.min(1, (time - 1000) / 240);
  const view = def.crop ?? [0, 0, ...def.size];
  const unit = view[2]! / 1440;
  const done = time >= 9000 && time < 10_800;
  const sweep = Math.min(1, Math.max(0, (fraction - 0.18) / 0.65));

  return (
    <div className="aa" role="img" aria-label={`${def.status}. Animatie op een originele Microsoft-screenshot.`} data-loop-ms={LOOP_MS} data-ready={loaded}>
      <div className="aa-screen" aria-hidden="true">
        <svg viewBox={view.join(' ')} preserveAspectRatio="xMidYMid meet">
          <image href={def.image} width={def.size[0]} height={def.size[1]} onLoad={() => setLoaded(true)} />
          <g opacity={visible}>
            <rect x={x} y={y} width={w} height={h} rx={5 * unit} fill="#6554c0" fillOpacity=".075" stroke="#6554c0" strokeWidth={2 * unit} />
            {!done && <line x1={x + 4 * unit} x2={x + w - 4 * unit} y1={y + h * sweep} y2={y + h * sweep} stroke="#6554c0" strokeWidth={2 * unit} opacity=".6" />}
            <g transform={`translate(${x + w - 20 * unit} ${y + h - 7 * unit}) scale(${unit})`}>
              <path d="M0 0 L0 27 L7 20 L13 33 L19 30 L13 18 L24 18 Z" fill="#6554c0" stroke="#faf9ff" strokeWidth="2" strokeLinejoin="round" />
              <rect x="24" y="23" width="58" height="25" rx="6" fill="#6554c0" />
              <text x="53" y="40" textAnchor="middle" fill="#faf9ff" fontSize="13" fontFamily="Segoe UI, sans-serif" fontWeight="600">Agent</text>
            </g>
          </g>
        </svg>
      </div>
      <div className="aa-footer" aria-hidden="true">
        <span className="aa-brand">SD Trust <span className="aa-divider">/</span> {def.app}</span>
        <span className="aa-reading"><i className={done ? 'aa-dot aa-dot-done' : 'aa-dot'} />{time < 1000 || time >= 10_800 ? def.status : done ? 'Bron bekeken' : target.label}</span>
      </div>
    </div>
  );
}
