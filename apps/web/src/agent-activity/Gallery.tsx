import { useState } from 'react';
import { AgentActivity } from './AgentActivity.tsx';
import { SCENES } from './scenes.ts';
export function AgentActivityGallery() {
  const scene = new URLSearchParams(location.search).get('scene');
  const [paused, setPaused] = useState(false);
  if (scene) return <div className="aa-solo"><AgentActivity source={scene} /></div>;
  return (
    <main className="aa-gallery">
      <header>
        <div><h1>Agent-activiteit</h1><p>Originele Microsoft-screenshots met een geanimeerde agentlaag. Zes stille loops van 12 seconden.</p></div>
        <button onClick={() => setPaused(!paused)}>{paused ? 'Alles afspelen' : 'Alles pauzeren'}</button>
      </header>
      <div className="aa-gallery-grid">
        {SCENES.map((s) => (
          <section key={s.id}>
            <AgentActivity source={s.id} paused={paused} />
            <h2>{s.app}<code>?scene={s.id}</code></h2>
            <a href={s.source} target="_blank" rel="noreferrer">Originele screenshot en bron ↗</a>
          </section>
        ))}
      </div>
    </main>
  );
}
