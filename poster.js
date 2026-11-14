const posterCreateDialog = byId('poster-create-dialog');
const posterEventName = byId('poster-event-name');
const posterBrief = byId('poster-brief');
const posterCreateStatus = byId('poster-create-status');
let posterDetails;

function writePosterBrief() {
  const name = posterEventName.value.trim() || posterDetails.name;
  posterBrief.value = [
    `Design a vertical poster for ${name}, a ${posterDetails.kind}.`,
    'Use a black background, lime accents, and bold condensed type.',
    'Set the event name as the headline, then list this running order with room or stage names and exact times. Use only the details below.',
    ...posterDetails.lines,
  ].join('\n');
}

byId('poster-create').addEventListener('click', () => {
  const imported = !byId('event-workspace').hidden ? loadedEvent : null;
  const result = imported?.current;
  const schedule = result?.schedule ?? approvedFanSchedule ?? initialLineup;
  const stageNames = result
    ? Object.fromEntries(result.stages.map((stage) => [stage.id, stage.name]))
    : { indoor: 'Indoor stage', outdoor: 'Outdoor stage' };
  posterDetails = {
    name: imported?.name ?? 'Night Shift Festival',
    kind: imported ? 'live event' : 'music festival',
    lines: [...schedule].sort((a, b) => a.start.localeCompare(b.start)).map((slot) =>
      `${slot.name || acts[slot.id] || slot.id} · ${stageNames[slot.stage]} · ${formatTime(slot.start)}–${formatTime(slot.end)}`
    ),
  };
  posterEventName.value = posterDetails.name;
  writePosterBrief();
  posterCreateStatus.textContent = '';
  posterCreateDialog.showModal();
});

posterEventName.addEventListener('change', writePosterBrief);
byId('poster-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(posterBrief.value);
    posterCreateStatus.textContent = 'Copied. Paste the brief into Generate template in Adobe Express.';
  } catch {
    posterBrief.focus();
    posterBrief.select();
    posterCreateStatus.textContent = 'Press ⌘C or Ctrl+C to copy the selected brief.';
  }
});

byId('poster-use-export').addEventListener('click', () => {
  posterCreateDialog.close();
  byId('poster-file').click();
});
