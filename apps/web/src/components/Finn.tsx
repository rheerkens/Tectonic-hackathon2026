import { useCallback, useEffect, useRef, useState } from 'react';
import './finn.css';

export type FinnMood = 'welcome' | 'idle' | 'listening' | 'thinking' | 'answer' | 'verified' | 'uncertain' | 'retry';
interface Animation {
  id: FinnMood;
  src: string;
  poster: string;
  videoSrc?: string;
  loop: boolean;
  durationMs: number;
  nextState: FinnMood | null;
}

let manifest: Promise<Animation[]> | undefined;
let videoAlphaSupported: boolean | undefined;
const blobs = new Map<string, Promise<Blob>>();

function loadManifest() {
  return manifest ??= fetch('/mascots/finn/web-animations.json')
    .then(async (response) => {
      if (!response.ok) throw new Error('Finn animations unavailable');
      return (await response.json() as { animations: Animation[] }).animations;
    }).catch((error: unknown) => { manifest = undefined; throw error; });
}

function loadBlob(src: string) {
  // Only same-origin absolute paths ("/mascots/..."); anything else (other hosts, "//host") is refused.
  if (!/^\/(?!\/)/.test(src)) return Promise.reject(new Error('Finn animation unavailable'));
  if (!blobs.has(src)) blobs.set(src, fetch(src).then((response) => {
    if (!response.ok) throw new Error('Finn animation unavailable');
    return response.blob();
  }).catch((error: unknown) => { blobs.delete(src); throw error; }));
  return blobs.get(src)!;
}

function useMotionAllowed() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setAllowed(!preference.matches && !document.hidden);
    update();
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      preference.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return allowed;
}

/** Real app state selects the gesture. Completed result gestures return to a calm idle. */
export function Finn({ mood, replayKey = 0, className = '' }: { mood: FinnMood; replayKey?: string | number; className?: string }) {
  const [animations, setAnimations] = useState<Animation[]>([]);
  const [rested, setRested] = useState<string | null>(null);
  const motionAllowed = useMotionAllowed();
  const sequence = `${mood}:${replayKey}`;
  const currentMood = rested === sequence ? 'idle' : mood;
  const animation = animations.find((item) => item.id === currentMood);
  const complete = useCallback(() => {
    if (animation?.nextState === 'idle') setRested(sequence);
  }, [animation?.nextState, sequence]);

  useEffect(() => { setRested(null); }, [sequence]);

  useEffect(() => {
    let alive = true;
    void loadManifest().then((items) => { if (alive) setAnimations(items); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const poster = animation?.poster ?? `/mascots/finn/finn-${currentMood}.png`;
  return <span className={`finn-player ${className}`} data-animation={currentMood} aria-hidden="true">
    {motionAllowed && animation
      ? <FinnPlayback key={`${sequence}:${currentMood}`} animation={animation} onComplete={complete} />
      : <img className="finn-media" src={poster} alt="" />}
  </span>;
}

function FinnPlayback({ animation, onComplete }: { animation: Animation; onComplete: () => void }) {
  const [fallback, setFallback] = useState(videoAlphaSupported === false || !animation.videoSrc);
  const [ready, setReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const alive = useRef(true);
  const frame = useRef<number | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    const element = video.current;
    return () => {
      alive.current = false;
      if (frame.current !== undefined) element?.cancelVideoFrameCallback(frame.current);
      element?.pause();
    };
  }, []);

  async function play() {
    const element = video.current;
    if (!element || !alive.current) return;
    try {
      if (videoAlphaSupported === undefined) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Cannot check video transparency');
        context.drawImage(element, 0, 0);
        videoAlphaSupported = context.getImageData(0, 0, 1, 1).data[3] === 0;
      }
      if (!videoAlphaSupported) throw new Error('Video alpha unavailable');
      await element.play();
      if (!alive.current) return;
      if (element.requestVideoFrameCallback) {
        frame.current = element.requestVideoFrameCallback(() => { if (alive.current) setReady(true); });
      } else setReady(true);
    } catch {
      if (alive.current) { element.pause(); setFallback(true); }
    }
  }

  if (fallback) return <FinnImage animation={animation} onComplete={onComplete} />;
  return <>
    <video ref={video} className="finn-media" src={animation.videoSrc} muted playsInline autoPlay
      loop={animation.loop} preload="auto" onLoadedData={() => void play()}
      onError={() => setFallback(true)} onEnded={onComplete} />
    {!ready && <img className="finn-media finn-poster" src={animation.poster} alt="" />}
  </>;
}

function FinnImage({ animation, onComplete }: { animation: Animation; onComplete: () => void }) {
  const [src, setSrc] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    let url: string | undefined;
    void loadBlob(animation.src).then((blob) => {
      if (!alive) return;
      url = URL.createObjectURL(blob);
      setSrc(url);
    }).catch(() => {});
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [animation.src]);
  useEffect(() => {
    if (!loaded || animation.loop || animation.nextState !== 'idle') return;
    const timer = window.setTimeout(onComplete, animation.durationMs);
    return () => window.clearTimeout(timer);
  }, [loaded, animation.loop, animation.nextState, animation.durationMs, onComplete]);
  return <>
    {src && <img className="finn-media" src={src} alt="" onLoad={() => setLoaded(true)} />}
    {!loaded && <img className="finn-media finn-poster" src={animation.poster} alt="" />}
  </>;
}
