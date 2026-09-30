/** One offline HTML file, including all videos, posters, source links and playback controls. */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SCENES } from '../../../apps/web/src/agent-activity/scenes.ts';
const DIR = resolve(import.meta.dir, '../output/snippets');
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const cards = await Promise.all(SCENES.map(async (scene) => {
  const video = (await readFile(join(DIR, `${scene.id}.mp4`))).toString('base64');
  const poster = (await readFile(join(DIR, `${scene.id}.jpg`))).toString('base64');
  return `<figure id="${scene.id}">
    <video aria-label="${escape(scene.status)}" src="data:video/mp4;base64,${video}" poster="data:image/jpeg;base64,${poster}" loop muted playsinline controls preload="metadata"></video>
    <figcaption><div><h2>${escape(scene.app)}</h2><p>${escape(scene.status)}</p></div><a class="download" download="${scene.id}.mp4">MP4 ↓</a></figcaption>
    <a class="source" href="${escape(scene.source)}" target="_blank" rel="noreferrer">Originele Microsoft-screenshot ↗</a>
  </figure>`;
}));
const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SD Trust · Agent-activiteit</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f6f6f8;color:#25242c;font:15px/1.5 'Segoe UI',system-ui,sans-serif}main{max-width:1520px;margin:auto;padding:40px 28px 64px}header{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:32px}h1{font-size:30px;letter-spacing:-.7px;margin:0 0 8px}p{color:#6c6675;margin:0;max-width:72ch}button,.download{background:#f9f8fc;border:1px solid #c9c4d8;color:#50438c;border-radius:6px;padding:9px 15px;font:inherit;text-decoration:none;cursor:pointer;white-space:nowrap}button:focus-visible,a:focus-visible{outline:3px solid #6554c0;outline-offset:3px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:36px 24px}figure{margin:0;min-width:0}video{width:100%;display:block;background:#f3f4f6;aspect-ratio:8/5;border:1px solid #dfdce5;border-radius:6px}figcaption{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0 5px}h2{font-size:17px;margin:0 0 3px}.source{font-size:12px;color:#655a82}.download{font-size:12px;padding:6px 10px}footer{margin-top:42px;padding-top:20px;border-top:1px solid #dedbe5;font-size:12px;color:#77717e}footer p{max-width:100ch}.meta{font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#746b88;margin-bottom:10px}@media(max-width:780px){main{padding:24px 16px}.grid{grid-template-columns:1fr}header{align-items:flex-start;flex-direction:column}h1{font-size:26px}}
</style></head><body><main>
<header><div><div class="meta">SD Trust / Motion studies</div><h1>De agent aan het werk</h1><p>Teams, Outlook en SharePoint zoals ze er echt uitzien. Originele Microsoft-screenshots, met een geanimeerde cursor en leesmarkeringen.</p></div><button id="toggle">Alles pauzeren</button></header>
<div class="grid">${cards.join('\n')}</div>
<footer><p>6 stille loops · 12 seconden per clip · Werkt offline · Gebruik de videobediening voor volledig scherm.</p><p>Illustratieve agentactiviteit op openbare productbeelden. De screenshotinhoud komt van Microsoft; er worden geen live accounts doorzocht. Microsoft-interfacebeelden en merken blijven eigendom van Microsoft. Bronlinks staan bij iedere clip.</p></footer>
</main><script>
const videos=Array.from(document.querySelectorAll('video'));
const button=document.querySelector('#toggle');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let paused=reduced.matches;
function update(){button.textContent=paused?'Alles afspelen':'Alles pauzeren';videos.forEach(v=>{if(paused)v.pause();else v.play().catch(()=>{});});}
document.querySelectorAll('figure').forEach(f=>f.querySelector('.download').href=f.querySelector('video').src);
button.addEventListener('click',()=>{paused=!paused;update();});
reduced.addEventListener('change',()=>{paused=reduced.matches;update();});
update();
</script></body></html>`;
await writeFile(join(DIR, 'index.html'), html);
await writeFile(join(DIR, 'sources.json'), JSON.stringify(SCENES.map(({id,app,source,asset,crop})=>({id,app,source,asset,crop})),null,2));
console.log(`6 clips -> ${join(DIR, 'index.html')} (${(Buffer.byteLength(html)/1e6).toFixed(1)} MB)`);
