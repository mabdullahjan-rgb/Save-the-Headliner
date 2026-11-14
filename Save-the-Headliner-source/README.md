# Save the Headliner

A Drexathon Swarm Intelligence demo for a fictional music festival. The headliner misses their outdoor slot, and the booker, venue manager, and artist rep work through proposed changes.

## Run locally

From the project directory, run:

```sh
python3 server.py
```

Open http://127.0.0.1:8000. No packages are required. Without a Nace key, the page labels the run **Rehearsal** and uses simulated agent choices.

- **9:10 PM arrival.** The venue vetoes a late outdoor set because of the 9 PM cutoff. The crew approves a swap. DJ Nova moves outdoors at 8:30 PM and the headliner moves indoors at 9:15 PM.
- **9:55 PM arrival.** The headliner cannot fit a full set before either stage closes. The crew hands the schedule to a human.
- **Stage outage.** At 6 PM the indoor stage loses power. The crew must fit four sets outdoors before the curfew. Moving sets outdoors at their existing times breaks the schedule, so the crew can pull two sets forward.
- **Write your own.** In Intern live mode, the booking analyst reads the whole report and returns constraints for the planner. For example, “The indoor stage opens at 9 PM, and DJ Nova needs a 20-minute indoor set that ends before 9:45.” The planner searches for feasible lineups, and the Drex-powered crew votes on the options. If a full lineup is impossible, the crew can propose the largest lineup that fits and flag the affected acts for confirmation. Rehearsal uses a smaller rule-based parser.

## Connect Drex and NDI

Create a key in the [Nace Console](https://console.nace.ai/dashboard/api-keys). Set `NACE_API_KEY` privately in your shell before starting the server. The server keeps the key out of the browser.

When a key is configured, NDI reads the two sample PDFs and Drex makes the agent choices. To parse the PDFs before going onstage, start the server and run this in another terminal:

```sh
curl -fsS -X POST http://127.0.0.1:8000/api/prepare
```

Allow time for the first parse. Restart the process if you change either PDF. Provider errors appear on the screen.

## Run with Intern

Use Python 3.12 or newer. Install the official package in this project's virtual environment.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install 'intern-agent @ git+https://github.com/nace-ai/intern'
```

In your terminal, set `NACE_API_KEY` and `DEEPINFRA_API_KEY` privately. Then launch the demo with the model from the event quickstart.

```sh
INTERN_SYSTEM2=deepinfra/Qwen/Qwen3.8-27B .venv/bin/python server.py
```

The app opens an Intern session for each run and uses its System 1 interface to ask Drex for every crew decision. Our app handles the negotiation and validates the resulting schedule. Intern binds the configured System 2 provider at startup. All crew decisions are typed System 1 calls. The demo shows **Live · Drex + NDI + Intern** after a successful run. See the [official Intern usage guide](https://github.com/nace-ai/intern/blob/main/docs/usage.md).

## Add the poster

Save the teammate's Adobe Express export as `public/poster.png` and refresh. The two fictional source PDFs are in `public/docs/`.

## Import your own event

Click **Import your event**. Download the example CSV or export your schedule from Excel or Google Sheets. The required columns are `act,stage,start,end`. Use 24-hour `HH:MM` times and unique session names. This prototype supports up to six sessions across three rooms. Add `stage_open,stage_close,ready` to specify room hours and the earliest time each act can start.

In live mode, you can also attach a venue PDF. After loading the schedule, report an incident using the room or session's name, such as “Panel canceled and Studio is closed.” The board shows the revised running order and highlights moved sessions.
