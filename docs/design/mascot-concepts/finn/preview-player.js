const data = JSON.parse(document.getElementById('finn-data').textContent);
const states = data.manifest.states;
const byId = Object.fromEntries(states.map(state => [state.id, state]));
const $ = id => document.getElementById(id);
const images = {};
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let selected = 'idle', current = byId.idle, frame = 0, step = 0;
let sequence = [], phase = 'action', pending = null;
let timer = null, playing = false, ready = false, atlasUrl = null;
$('reduced').checked = motionQuery.matches;

function cancel() { clearTimeout(timer); timer = null; }

function draw(target, state, index) {
  const ctx = target.getContext('2d');
  const source = state.frames[index];
  const [cx, cy] = source.cell;
  const [left, top, right, bottom] = source.bounds;
  const unit = target.width / 512;
  const scale = 424 / source.characterHeight;
  const [px, py] = source.pivot;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(images[state.id], cx+left, cy+top, right-left, bottom-top,
    (256+(left-px)*scale)*unit, (466+(top-py)*scale)*unit,
    (right-left)*scale*unit, (bottom-top)*scale*unit);
}

function update() {
  draw($('mainCanvas'), current, frame);
  draw($('miniCanvas'), current, frame);
  $('mainCanvas').setAttribute('aria-label', `Finn: ${current.name}, frame ${frame+1}`);
  $('frameStatus').textContent = `Frame ${frame+1} of ${current.frames.length}`;
  $('playStatus').textContent = $('reduced').checked ? 'Static: reduced motion'
    : phase === 'exit' ? 'Returning to rest'
    : playing && current.id === 'idle' && frame === 0 ? 'Playing · resting 6 seconds between blinks'
    : playing ? phase === 'loop' ? 'Looping' : 'Playing'
    : phase === 'hold' ? 'Pose held' : 'Paused';
  $('play').textContent = playing ? 'Pause' : 'Play';
  $('play').disabled = $('reduced').checked;
  $('replay').disabled = $('reduced').checked;
  document.querySelectorAll('.frame').forEach((button, index) => {
    button.setAttribute('aria-pressed', String(index === frame));
  });
}

function actionSequence(state) {
  return [...($('repeat').checked && !state.loop ? state.reviewSequence : state.sequence)];
}

function schedule() {
  cancel();
  if (!playing || $('reduced').checked || document.hidden) return;
  const duration = current.frameDurations[frame] / Number($('speed').value);
  timer = setTimeout(() => {
    step++;
    if (step >= sequence.length) {
      if (phase === 'exit' && pending) {
        const next = pending;
        pending = null;
        activateState(next, true);
        return;
      }
      if (current.loop) {
        sequence = [...(current.loopSequence || current.sequence)];
        phase = 'loop';
        step = 0;
      } else if ($('repeat').checked) {
        sequence = actionSequence(current);
        phase = 'action';
        step = 0;
      } else if (current.nextState) {
        activateState(current.nextState, true);
        return;
      } else {
        playing = false;
        phase = 'hold';
        update();
        return;
      }
    }
    frame = sequence[step];
    update();
    schedule();
  }, duration);
}

function renderFrames() {
  $('filmstrip').replaceChildren();
  current.frames.forEach((_, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'frame';
    button.setAttribute('aria-label', `Inspect frame ${index+1}`);
    button.setAttribute('aria-pressed', 'false');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 160;
    canvas.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = `Frame ${index+1}`;
    button.append(canvas, label);
    button.onclick = () => {
      cancel();
      pending = null;
      playing = false;
      phase = 'inspect';
      frame = index;
      sequence = [...current.reviewSequence];
      step = sequence.indexOf(index);
      update();
    };
    $('filmstrip').append(button);
    draw(canvas, current, index);
  });
}

function activateState(id, autoplay = true) {
  cancel();
  pending = null;
  current = byId[id];
  sequence = actionSequence(current);
  step = 0;
  phase = $('reduced').checked ? 'static' : 'action';
  frame = $('reduced').checked ? current.staticFrame : sequence[0];
  playing = autoplay && !$('reduced').checked;
  $('stateName').textContent = current.name;
  $('sample').textContent = current.sample;
  $('trigger').textContent = current.trigger;
  $('behavior').textContent = current.behavior;
  $('sheetDownload').href = data.images[id];
  $('sheetDownload').download = current.file;
  document.querySelectorAll('#states button').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.id === id));
  });
  renderFrames();
  update();
  schedule();
}

function selectState(id, autoplay = true, userSelected = true) {
  if (!ready) return;
  if (userSelected) selected = id;
  if ($('reduced').checked || !autoplay || current.id === id) {
    activateState(id, autoplay);
    return;
  }
  if (phase === 'exit') { pending = id; return; }
  const exits = current.exitSequence || [];
  const rest = current.restFrames || [0, current.frames.length-1];
  if (exits.length && !rest.includes(frame)) {
    pending = id;
    sequence = frame < 3 ? Array.from({length:frame}, (_, index) => frame-index-1) : [...exits];
    step = 0;
    frame = sequence[0];
    phase = 'exit';
    playing = true;
    update();
    schedule();
  } else activateState(id, autoplay);
}

for (const state of states) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.id = state.id;
  button.setAttribute('aria-pressed', 'false');
  const name = document.createElement('span');
  name.textContent = state.name;
  const tag = document.createElement('small');
  tag.textContent = state.loop ? 'loop' : 'once';
  button.append(name, tag);
  button.onclick = () => selectState(state.id);
  $('states').append(button);
  const row = document.createElement('tr');
  for (const value of [state.name, state.trigger, state.behavior]) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
  }
  $('stateTable').append(row);
}

$('play').onclick = () => {
  if (!ready) return;
  if (!playing && (phase === 'hold' || step >= sequence.length)) {
    activateState(current.id, true);
    return;
  }
  playing = !playing;
  update();
  schedule();
};
$('replay').onclick = () => selectState(selected, true);
$('speed').onchange = schedule;
$('repeat').onchange = () => activateState(current.id, !$('reduced').checked);
$('reduced').onchange = () => activateState(selected, !$('reduced').checked);
motionQuery.addEventListener('change', event => {
  $('reduced').checked = event.matches;
  if (ready) activateState(selected, !event.matches);
});
$('dark').onchange = () => $('stage').classList.toggle('dark', $('dark').checked);
document.addEventListener('visibilitychange', () => { cancel(); if (!document.hidden) schedule(); });
$('manifestDownload').href = URL.createObjectURL(new Blob([JSON.stringify(data.manifest, null, 2)], {type:'application/json'}));

$('atlasDownload').onclick = async event => {
  event.preventDefault();
  if (!ready) return;
  const link = event.currentTarget;
  link.textContent = 'Preparing atlas…';
  const atlas = document.createElement('canvas');
  const layout = data.manifest.exportAtlas;
  atlas.width = layout.width;
  atlas.height = layout.height;
  const ctx = atlas.getContext('2d');
  const cell = document.createElement('canvas');
  cell.width = cell.height = layout.frameSize;
  for (const state of states) {
    state.frames.forEach((source, index) => {
      draw(cell, state, index);
      ctx.drawImage(cell, source.atlasCell[0], source.atlasCell[1]);
    });
  }
  const blob = await new Promise(resolve => atlas.toBlob(resolve, 'image/png'));
  if (!blob) { link.textContent = 'Export failed; retry'; return; }
  if (atlasUrl) URL.revokeObjectURL(atlasUrl);
  atlasUrl = URL.createObjectURL(blob);
  const download = document.createElement('a');
  download.href = atlasUrl;
  download.download = `finn-atlas-${layout.frameCount}-frames-${layout.frameSize}px.png`;
  download.click();
  link.textContent = 'Export aligned atlas';
};

Promise.all(states.map(state => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => { images[state.id] = image; resolve(); };
  image.onerror = () => reject(new Error(`Could not load ${state.name}`));
  image.src = data.images[state.id];
}))).then(() => {
  ready = true;
  document.body.classList.remove('loading');
  $('loading').hidden = true;
  let greeted = false;
  try {
    greeted = sessionStorage.getItem('finn-preview-welcomed') === 'yes';
    sessionStorage.setItem('finn-preview-welcomed', 'yes');
  } catch {}
  selectState(greeted || $('reduced').checked ? 'idle' : 'welcome', true);
}).catch(error => { $('loading').textContent = error.message; $('loading').className = 'error'; });
