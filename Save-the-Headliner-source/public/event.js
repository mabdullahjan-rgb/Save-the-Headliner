const eventDialog = byId('event-dialog');
const eventImport = byId('event-import');
const eventRescue = byId('event-rescue');
const eventError = byId('event-error');
const eventNotice = byId('event-notice');
const eventState = byId('event-state');
const eventSchedule = byId('event-schedule');
const eventSteps = byId('event-steps');
let loadedEvent;

function readPdf(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read the venue PDF.'));
    reader.readAsDataURL(file);
  });
}

async function postEvent(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw new Error(result?.error || 'Event import needs the latest server. Restart the launcher and try again.');
  }
  return result;
}

function renderEvent(result) {
  eventSchedule.replaceChildren();
  for (const room of result.stages) {
    const section = document.createElement('section');
    section.className = 'event-stage';
    const title = document.createElement('h3');
    title.textContent = room.name;
    const hours = document.createElement('small');
    hours.textContent = `${formatTime(room.opens)} – ${formatTime(room.closes)}`;
    title.append(hours);
    const list = document.createElement('ul');
    const slots = result.schedule.filter((slot) => slot.stage === room.id).sort((a, b) => a.start.localeCompare(b.start));
    for (const slot of slots) {
      const row = document.createElement('li');
      const original = loadedEvent.original.schedule.find((entry) => entry.id === slot.id);
      if (original && (original.stage !== slot.stage || original.start !== slot.start || original.end !== slot.end)) {
        row.dataset.moved = '';
      }
      const name = document.createElement('strong');
      name.textContent = slot.name || original?.name || slot.id;
      const times = document.createElement('time');
      times.textContent = `${formatTime(slot.start)} – ${formatTime(slot.end)}`;
      row.append(name, times);
      list.append(row);
    }
    if (!slots.length) {
      const row = document.createElement('li');
      row.textContent = 'No sessions scheduled';
      list.append(row);
    }
    section.append(title, list);
    eventSchedule.append(section);
  }
}

byId('event-open').addEventListener('click', () => {
  eventError.textContent = '';
  eventDialog.showModal();
});
byId('event-close').addEventListener('click', () => eventDialog.close());
byId('event-exit').addEventListener('click', () => {
  byId('event-workspace').hidden = true;
  byId('festival-workspace').hidden = false;
  byId('event-exit').hidden = true;
  byId('event-open').focus();
});

eventImport.addEventListener('submit', async (event) => {
  event.preventDefault();
  const csv = byId('event-csv').files[0];
  const pdf = byId('event-pdf').files[0];
  if (!csv) return;
  const submit = event.submitter;
  submit.disabled = true;
  eventError.textContent = 'Loading your schedule…';
  try {
    if (csv.size > 48 * 1024) throw new Error('Use a CSV under 12,000 characters.');
    if (pdf && pdf.size > 2 * 1024 * 1024) throw new Error('Use a PDF of 2 MB or smaller.');
    const payload = { csv: await csv.text() };
    if (payload.csv.length > 12000) throw new Error("Use a CSV under 12,000 characters.");
    if (pdf) payload.venuePdf = await readPdf(pdf);
    const original = await postEvent('/api/import-event', payload);
    const name = byId('event-name').value.trim() || csv.name.replace(/\.csv$/i, '');
    loadedEvent = { payload, original, current: original, name };
    byId('loaded-event').textContent = name;
    renderEvent(original);
    eventState.textContent = 'Original schedule';
    delete eventState.dataset.state;
    eventNotice.textContent = original.venuePdfAttached && !original.integrations?.ndi
      ? 'Venue PDFs need live mode. To rehearse, import the CSV on its own.'
      : 'Waiting for a disruption.';
    eventSteps.replaceChildren();
    eventRescue.reset();
    byId('event-workspace').hidden = false;
    byId('festival-workspace').hidden = true;
    byId('event-exit').hidden = false;
    eventDialog.close();
    byId('event-incident').focus();
  } catch (error) {
    eventError.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

eventRescue.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!loadedEvent) return;
  const input = byId('event-incident');
  const incident = input.value.trim();
  if (!incident) return;
  const current = loadedEvent;
  const submit = event.submitter;
  submit.disabled = input.disabled = true;
  eventNotice.textContent = 'The crew is reviewing your schedule…';
  eventSteps.replaceChildren();
  try {
    const result = await postEvent('/api/event-rescue', { ...current.payload, incident });
    if (loadedEvent !== current) return;
    setMode(result, true);
    current.current = result;
    renderEvent(result);
    const labels = { recovered: 'Schedule approved', partial: 'Partial recovery', review: 'Needs review' };
    eventState.textContent = labels[result.outcome] || 'Crew response';
    eventState.dataset.state = result.outcome;
    const planned = new Set(result.schedule.map((slot) => slot.id));
    const missing = current.original.schedule.filter((slot) => !planned.has(slot.id)).map((slot) => slot.name);
    eventNotice.textContent = result.outcome === 'review' ? 'The crew needs more information or approval.'
      : `${result.schedule.length} sessions scheduled.${missing.length ? ` Off the schedule: ${missing.join(', ')}.` : ''}`;
    for (const step of result.steps) {
      const entry = document.createElement('li');
      const label = document.createElement('span');
      label.className = 'step-label';
      label.textContent = `${step.role} · ${statusLabels[step.status] ?? step.status}`;
      const content = document.createElement('p');
      content.textContent = step.decision;
      entry.append(label, content);
      if (step.evidence) {
        const quote = document.createElement('blockquote');
        quote.textContent = step.evidence;
        entry.append(quote);
      }
      eventSteps.append(entry);
    }
  } catch (error) {
    if (loadedEvent === current) eventNotice.textContent = error.message;
  } finally {
    submit.disabled = input.disabled = false;
  }
});
