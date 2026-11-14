const initialLineup = [
  { id: 'echo', stage: 'outdoor', start: '19:45', end: '20:15' },
  { id: 'headliner', stage: 'outdoor', start: '20:30', end: '21:00' },
  { id: 'static', stage: 'indoor', start: '20:15', end: '20:45' },
  { id: 'nova', stage: 'indoor', start: '21:15', end: '21:45' },
];
const acts = {
  headliner: 'The Headliner',
  nova: 'DJ Nova',
  echo: 'Echo Club',
  static: 'Static Bloom',
};
const statusLabels = {
  proposed: 'Proposal',
  vetoed: 'Veto',
  approved: 'Approved',
  review: 'Needs review',
};
const byId = (id) => document.getElementById(id);
const rescue = byId('rescue');
const reset = byId('reset');
const arrival = byId('arrival');
const scenarioButtons = [...byId('scenario-options').querySelectorAll('button')];
const indoor = byId('indoor');
const indoorStatus = byId('indoor-status');
const outdoor = byId('outdoor');
const outdoorStatus = outdoor.querySelector('p');
const customIncident = byId('custom-incident');
const steps = byId('steps');
const notice = byId('notice');
const state = byId('state');
const mode = byId('mode');
const changes = byId('changes');
const poster = byId('poster');
const cards = new Map();
const resultStrip = byId('result-strip');
let approvedFanSchedule = null;
let posterUrl;
const fanButton = byId('show-fan-lineup');
const fanDialog = byId('fan-lineup');
let started = false;
let scenario = 'delay';
let outageAvailable = false;
let freeTextAvailable = false;

function showPoster() {
  poster.hidden = poster.naturalWidth === 0;
  byId('poster-placeholder').hidden = !poster.hidden;
  fanButton.hidden = poster.hidden || approvedFanSchedule === null;
}

poster.addEventListener('load', showPoster);
poster.addEventListener('error', showPoster);

byId('poster-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const status = byId('poster-status');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
    status.textContent = 'Choose a PNG, JPG, or WebP under 20 MB.';
    return;
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(url);
    status.textContent = 'Could not open that image.';
    return;
  }
  if (event.target.files[0] !== file) {
    URL.revokeObjectURL(url);
    return;
  }
  if (posterUrl) URL.revokeObjectURL(posterUrl);
  posterUrl = url;
  poster.src = url;
  status.textContent = 'Poster loaded for this tab.';
});

fanButton.addEventListener('click', () => {
  if (approvedFanSchedule === null || poster.hidden) return;
  byId('fan-poster').src = poster.currentSrc || poster.src;
  const sets = byId('fan-sets');
  sets.replaceChildren();
  for (const act of [...approvedFanSchedule].sort((a, b) => a.start.localeCompare(b.start))) {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = acts[act.id];
    const slot = document.createElement('span');
    slot.textContent = `${formatTime(act.start)} – ${formatTime(act.end)} · ${act.stage === 'indoor' ? 'Indoor' : 'Outdoor'} stage`;
    item.append(name, slot);
    sets.append(item);
  }
  fanDialog.showModal();
});
showPoster();

function formatTime(value) {
  const [hour, minute] = value.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function showChanges(schedule) {
  const showSlot = ({ stage, start, end }) => `${stage} · ${formatTime(start)}–${formatTime(end)}`;
  changes.replaceChildren();
  for (const previous of initialLineup) {
    const act = schedule.find((slot) => slot.id === previous.id);
    if (act && previous.stage === act.stage && previous.start === act.start && previous.end === act.end) continue;
    const item = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = acts[previous.id];
    const detail = document.createElement('span');
    detail.textContent = `${showSlot(previous)} → ${act ? showSlot(act) : "No set scheduled"}`;
    item.append(name, detail);
    changes.append(item);
  }
  changes.hidden = changes.childElementCount === 0;
}

function timelinePercent(time) {
  const [hour, minute] = time.split(':').map(Number);
  return Math.max(0, Math.min(100, (hour * 60 + minute - 1080) / 2.4));
}

function renderLineup(schedule, { delay = '', closedStage = '', issues = [], animate = false } = {}) {
  const closed = new Set([closedStage, ...issues.filter((issue) => issue.type === 'close').map((issue) => issue.stage)]);
  for (const [stage, label, cutoff] of [['indoor', indoorStatus, '22:00'], ['outdoor', outdoorStatus, '21:00']]) {
    const curfews = issues.filter((issue) => issue.type === 'curfew' && issue.stage === stage).map((issue) => issue.time);
    const end = [cutoff, ...curfews].sort()[0];
    byId(`${stage}-track`).style.setProperty('--cutoff', `${closed.has(stage) ? 0 : timelinePercent(end)}%`);
    byId(stage).classList.toggle('offline', closed.has(stage));
    const outage = issues.find((issue) => issue.type === 'outage' && issue.stage === stage);
    label.textContent = outage ? `Unavailable ${formatTime(outage.start)}–${formatTime(outage.end)}` : closed.has(stage) ? 'Offline · Stage closed' : `Music ends at ${formatTime(end)}`;
  }
  const scheduled = new Set(schedule.map((act) => act.id));
  for (const [id, card] of cards) {
    if (!scheduled.has(id)) card.remove();
  }
  const positions = new Map();
  if (animate) {
    for (const [id, card] of cards) {
      positions.set(id, card.getBoundingClientRect());
    }
  }

  for (const act of [...schedule].sort((a, b) => a.start.localeCompare(b.start))) {
    if (!cards.has(act.id)) {
      const card = document.createElement('div');
      card.className = 'act';
      card.dataset.act = act.id;
      const name = document.createElement('strong');
      name.textContent = acts[act.id];
      card.append(name, document.createElement('span'));
      cards.set(act.id, card);
    }

    const card = cards.get(act.id);
    const original = initialLineup.find((entry) => entry.id === act.id);
    const changed = act.stage !== original.stage || act.start !== original.start || act.end !== original.end;
    card.classList.toggle('moved', changed);
    const late = issues.filter((issue) => issue.type === 'delay' && issue.act === act.id && issue.time > act.start)
      .map((issue) => issue.time).sort().pop() || (act.id === 'headliner' ? delay : '');
    const displaced = closed.has(act.stage) || issues.some((issue) => issue.type === 'outage'
      && issue.stage === act.stage && act.start < issue.end && act.end > issue.start) || issues.some((issue) => issue.type === 'cancel' && issue.act === act.id);
    card.classList.toggle('delayed', Boolean(late) || displaced);
    const slot = `${formatTime(act.start)} – ${formatTime(act.end)}`;
    const compactSlot = `${formatTime(act.start).replace(/ [AP]M$/, "")}–${formatTime(act.end).replace(/ [AP]M$/, "")}`;
    card.lastElementChild.textContent = late
      ? `Arrives ${formatTime(late)} · Misses set`
      : displaced ? `${slot} · Displaced` : compactSlot;
    const start = timelinePercent(act.start);
    card.style.setProperty('--start', `${start}%`);
    card.style.setProperty('--length', `${timelinePercent(act.end) - start}%`);
    card.title = `${acts[act.id]} · ${slot}${late ? ` · Arrives ${formatTime(late)}` : ''}`;
    byId(`${act.stage}-track`).append(card);
  }

  if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const [id, card] of cards) {
      const before = positions.get(id);
      if (!before) continue;
      const after = card.getBoundingClientRect();
      card.animate([
        { transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)`, zIndex: 1 },
        { transform: 'translate(0, 0)', zIndex: 1 },
      ], { duration: 540, easing: 'cubic-bezier(.22,.8,.26,1)' });
    }
  }
}

function setMode(result, verified = false) {
  const { integrations } = result;
  mode.dataset.mode = result.mode;
  if (result.mode === 'rehearsal') {
    mode.textContent = 'Rehearsal · simulated decisions';
    return;
  }

  const labels = ['Drex', 'NDI', 'Intern'].filter((label) => integrations?.[label.toLowerCase()]);
  mode.textContent = verified ? `Live · ${labels.join(' + ')}` : 'Nace configured';
}

function addStep(step) {
  const item = document.createElement('li');
  item.dataset.status = step.status;
  const label = document.createElement('span');
  label.className = 'step-label';
  label.textContent = `${step.role} · ${statusLabels[step.status] ?? step.status}`;
  const text = document.createElement('p');
  text.textContent = step.decision;
  item.append(label, text);
  if (step.evidence) {
    const quote = document.createElement('blockquote');
    quote.textContent = step.evidence;
    item.append(quote);
    const sources = {
      venue: ['/docs/venue-rules.pdf', 'Venue rules'],
      rider: ['/docs/headliner-rider.pdf', 'Artist rider'],
    };
    const source = sources[step.source];
    if (source) {
      const link = document.createElement('a');
      link.href = source[0];
      link.textContent = `${source[1]} · Page 1 ↗`;
      link.target = '_blank';
      link.rel = 'noopener';
      item.append(link);
    }
  }
  steps.append(item);
}

function restoreLineup() {
  approvedFanSchedule = null;
  fanButton.hidden = true;
  renderLineup(initialLineup);
  changes.hidden = true;
  resultStrip.hidden = true;
  steps.replaceChildren();
  state.textContent = 'Original lineup';
  delete state.dataset.state;
  notice.textContent = 'Waiting for a disruption.';
  reset.hidden = true;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

for (const button of scenarioButtons) {
  button.addEventListener('click', () => {
    scenario = button.dataset.scenario;
    for (const option of scenarioButtons) {
      option.setAttribute('aria-pressed', String(option === button));
    }
    const outage = scenario === 'outage';
    byId('arrival-field').hidden = scenario !== 'delay';
    byId('incident').hidden = !outage;
    byId('custom-field').hidden = scenario !== 'custom';
    const labels = { delay: 'Make the bus late', outage: 'Cut indoor stage power', custom: 'Send to the crew' };
    byId('rescue-label').textContent = labels[scenario];
    restoreLineup();
  });
}

function setRunning(running) {
  rescue.disabled = arrival.disabled = reset.disabled = running;
  customIncident.disabled = running;
  for (const option of scenarioButtons) {
    const unavailable = (option.dataset.scenario === 'outage' && !outageAvailable)
      || (option.dataset.scenario === 'custom' && !freeTextAvailable);
    option.disabled = running || unavailable;
  }
}

rescue.addEventListener('click', async () => {
  const incidentText = customIncident.value.trim();
  if (scenario === 'custom' && !incidentText) {
    notice.textContent = 'Describe what changed first.';
    customIncident.focus();
    return;
  }
  started = true;
  setRunning(true);
  const selectedArrival = arrival.value;
  let delay = scenario === 'delay' ? selectedArrival : '';
  let issues = [];
  let closedStage = scenario === 'outage' ? 'indoor' : '';
  restoreLineup();
  renderLineup(initialLineup, { delay, closedStage });
  state.textContent = 'Schedule at risk';
  state.dataset.state = 'review';
  notice.textContent = 'Waiting for the crew to respond…';

  try {
    const response = await fetch('/api/rescue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scenario === 'custom' ? { incident: incidentText } : { arrival: selectedArrival, scenario }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Crew request failed.');
    setMode(result, true);
    if (result.incident) {
      delay = result.incident.arrival || '';
      closedStage = result.incident.stage || '';
      issues = result.incident.issues || [];
      renderLineup(initialLineup, { delay, closedStage, issues });
    }
    notice.textContent = result.incident?.scenario === 'unsupported'
      ? 'The crew needs clarification.'
      : 'The crew is working through the options.';
    for (const step of result.steps) {
      addStep(step);
      await wait(360);
    }

    const recovered = result.outcome === 'recovered';
    const partial = result.outcome === 'partial';
    const revised = recovered || partial;
    renderLineup(result.schedule, { delay: revised ? '' : delay, closedStage, issues, animate: revised });
    state.dataset.state = result.outcome;
    state.textContent = recovered ? 'Lineup approved' : partial ? 'Partial recovery' : 'Needs a human';
    if (revised) {
      showChanges(result.schedule);
      if (recovered && result.schedule.length) {
        approvedFanSchedule = result.schedule;
        showPoster();
      }
      const count = result.schedule.length;
      byId('result-count').textContent = `${count}/${initialLineup.length}`;
      byId('result-caption').textContent = partial ? 'Sets can go ahead · confirmation needed' : 'Sets in the approved lineup';
      resultStrip.hidden = false;
      notice.textContent = partial
        ? `Revised lineup proposed. ${count} sets can go ahead. Confirm the acts without a slot.`
        : `New running order approved. ${count} sets can go ahead.`;
    } else {
      notice.textContent = 'The crew couldn’t approve a new running order. A human needs to step in.';
    }
  } catch (error) {
    state.textContent = 'Decision unavailable';
    notice.textContent = error.message;
  } finally {
    setRunning(false);
    reset.hidden = false;
  }
});

reset.addEventListener('click', () => {
  restoreLineup();
  rescue.focus();
});

restoreLineup();

fetch('/api/status')
  .then((response) => {
    if (!response.ok) throw new Error('Server unavailable');
    return response.json();
  })
  .then((result) => {
    outageAvailable = result.scenarios?.includes('outage') ?? false;
    freeTextAvailable = result.freeText === true;
    const hint = byId('incident-hint');
    if (result.incidentAnalysis !== 'intern') {
      hint.textContent = 'This server uses a limited parser. Open the restarted live demo for AI analysis.';
    }
    if (!started) {
      setMode(result);
      setRunning(false);
    }
  })
  .catch(() => {
    if (!started) {
      mode.dataset.mode = 'error';
      mode.textContent = 'Server unavailable';
    }
  });
