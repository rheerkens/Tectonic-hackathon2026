import { useEffect, useState } from 'react';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * A scene is a script of discrete steps, not a CSS timeline: the scene decides what each step looks
 * like and CSS transitions smooth the change. `cycle` bumps when the loop restarts (use it as a key).
 * With reduced motion the clock stays on the last step, so the finished state is shown statically.
 */
export function useSceneClock(totalSteps: number, stepMs: number, paused = false) {
  const reduced = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduced || paused) return;
    const id = setInterval(() => setTick((t) => t + 1), stepMs);
    return () => clearInterval(id);
  }, [reduced, paused, stepMs]);
  if (reduced) return { cycle: 0, step: totalSteps - 2, reduced };
  return { cycle: Math.floor(tick / totalSteps), step: tick % totalSteps, reduced };
}

/** Types `text` out over `durationMs`, restarting whenever `resetKey` changes. */
export function useTypewriter(text: string, durationMs: number, resetKey: number, instant: boolean): string {
  const [chars, setChars] = useState(0);
  useEffect(() => {
    if (instant) return;
    setChars(0);
    const started = performance.now();
    const id = setInterval(() => {
      const progress = Math.min(1, (performance.now() - started) / durationMs);
      setChars(Math.round(progress * text.length));
      if (progress >= 1) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [text, durationMs, resetKey, instant]);
  return instant ? text : text.slice(0, chars);
}
