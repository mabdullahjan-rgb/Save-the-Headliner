"""Generate feasible festival schedules from act and stage constraints."""

from functools import lru_cache
from itertools import combinations, permutations, product


GATES_OPEN = 18 * 60
MAX_CANDIDATES = 4
MAX_SET_MINUTES = 240
PERFORMER_READY = {
    "echo": 19 * 60 + 45,
    "static": 18 * 60 + 15,
    "headliner": 20 * 60 + 30,
    "nova": 19 * 60,
}


def _minutes(mark):
    hour, minute = map(int, mark.split(":"))
    if not 0 <= hour < 24 or not 0 <= minute < 60:
        raise ValueError("Expected a time on the festival day.")
    return hour * 60 + minute


def _clock(value):
    return f"{value // 60:02d}:{value % 60:02d}"


def plan(issues, initial, rules, *, allow_drop=False):
    """Return up to four feasible, minimally disruptive lineups."""
    acts = {slot["id"]: slot for slot in initial}
    starts = {act: _minutes(slot["start"]) for act, slot in acts.items()}
    original_durations = {act: _minutes(slot["end"]) - starts[act] for act, slot in acts.items()}
    durations = original_durations.copy()
    rider_duration = rules["duration"]
    if "headliner" in durations:
        durations["headliner"] = max(durations["headliner"], rider_duration)
    stage_end = dict(rules["stage_end"])
    gates_open = rules.get("gates_open", GATES_OPEN)
    stage_open = {**dict.fromkeys(stage_end, gates_open), **rules.get("stage_open", {})}
    readiness = rules.get("ready")
    if readiness is None:
        readiness = {act: min(starts[act], PERFORMER_READY.get(act, starts[act])) for act in acts}
    ready = {act: max(gates_open, readiness.get(act, starts[act])) for act in acts}
    deadlines = dict.fromkeys(acts, max(stage_end.values()))
    allowed_stages = {act: set(stage_end) for act in acts}
    requested_durations = {}
    cancelled = set()
    closed = set()
    blocked = {stage: [] for stage in stage_end}
    for issue in issues:
        kind = issue["type"]
        if kind == "delay" and issue["act"] in acts:
            act = issue["act"]
            ready[act] = max(ready[act], _minutes(issue["time"]))
        elif kind == "cancel" and issue["act"] in acts:
            cancelled.add(issue["act"])
        elif kind == "close" and issue["stage"] in stage_end:
            closed.add(issue["stage"])
        elif kind == "outage" and issue["stage"] in blocked:
            start, end = _minutes(issue["start"]), _minutes(issue["end"])
            if start >= end:
                raise ValueError("A room outage must end after it starts.")
            blocked[issue["stage"]].append((start, end))
        elif kind == "curfew" and issue["stage"] in stage_end:
            stage = issue["stage"]
            stage_end[stage] = min(stage_end[stage], _minutes(issue["time"]))
        elif kind == "open" and issue["stage"] in stage_open:
            stage = issue["stage"]
            stage_open[stage] = max(stage_open[stage], _minutes(issue["time"]))
        elif kind == "stage" and issue["act"] in acts and issue["stage"] in stage_end:
            allowed_stages[issue["act"]].intersection_update({issue["stage"]})
        elif kind == "deadline" and issue["act"] in acts:
            act = issue["act"]
            deadlines[act] = min(deadlines[act], _minutes(issue["time"]))
        elif kind == "duration" and issue["act"] in acts:
            act = issue["act"]
            duration = issue["minutes"]
            if type(duration) is not int or not 1 <= duration <= MAX_SET_MINUTES:
                raise ValueError("Set length must be a whole number from 1 to 240 minutes.")
            if (act == "headliner" and duration < rider_duration) or (
                act in requested_durations and requested_durations[act] != duration
            ):
                allowed_stages[act].clear()
            requested_durations[act] = duration
            durations[act] = duration
        else:
            raise ValueError("Unsupported act or stage constraint.")

    @lru_cache(maxsize=None)
    def best_stage(stage, order):
        # At each finish time, preserve the cheapest compatible prefix. A minute
        # grid lets the planner adapt to an arrival that falls between set times.
        if not order:
            return (0, 0, 0), ()
        if stage in closed or ("headliner" in order and stage == "indoor" and not rules["equipment_ok"]):
            return None
        previous = {stage_open[stage]: ((0, 0, 0), ())}
        for act in order:
            if stage not in allowed_stages[act]:
                return None
            duration = durations[act]
            duration_changed = duration != original_durations[act]
            stage_changed = stage != acts[act]["stage"]
            states = {}
            best = None
            latest_finish = min(stage_end[stage], deadlines[act])
            for start in range(stage_open[stage], latest_finish - duration + 1):
                prefix = previous.get(start)
                if prefix is not None and (best is None or prefix < best):
                    best = prefix
                if best is None or start < ready[act]:
                    continue
                if any(start < end and start + duration > begins for begins, end in blocked[stage]):
                    continue
                changed, movement, changes_of_stage = best[0]
                difference = abs(start - starts[act])
                cost = changed + bool(difference or stage_changed or duration_changed), movement + difference, changes_of_stage + stage_changed
                states[start + duration] = cost, best[1] + (start,)
            if not states:
                return None
            previous = states
        return min(previous.values())

    def stage_options(stage, group):
        for order in permutations(group):
            result = best_stage(stage, order)
            if result is not None:
                cost, times = result
                slots = tuple((start, stage, act, start + durations[act]) for act, start in zip(order, times))
                yield cost, slots

    active = tuple(act for act in acts if act not in cancelled)
    stages = tuple(stage_end)
    minimum = 1 if allow_drop and active else len(active)
    for keep in range(len(active), minimum - 1, -1):
        candidates = set()
        for selected in combinations(active, keep):
            choices = [tuple(stage for stage in stages if stage in allowed_stages[act] and stage not in closed) for act in selected]
            for assignment in product(*choices):
                groups = tuple(tuple(act for act, chosen in zip(selected, assignment) if chosen == stage) for stage in stages)
                for lineups in product(*(stage_options(stage, group) for stage, group in zip(stages, groups))):
                    costs, slots = zip(*lineups)
                    cost = tuple(sum(values) for values in zip(*costs))
                    candidates.add((cost, tuple(sorted(slot for lineup in slots for slot in lineup))))
        if candidates:
            return [
                [
                    {"id": act, "stage": stage, "start": _clock(start), "end": _clock(end)}
                    for start, stage, act, end in slots
                ]
                for _, slots in sorted(candidates)[:MAX_CANDIDATES]
            ]
    return []
