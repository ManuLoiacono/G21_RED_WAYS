import { requestPlan, SERVICE_URL } from "./api";
import { calculationKey, toPlanRequest } from "./request";
import type { PlanResponse } from "./response";
import { onLanguageChange, t } from "../i18n";
import { esc, fmtNumber } from "../ui/format";
import { infoButton } from "../provenance/sources";
import { defaultProfile, relabelState, stateFromTemplate, templateDescription, templateLabel, TEMPLATES } from "./templates";
import { poiTitle } from "./pois";
import { TEMPLATE_IDS, type MissionState, type Poi, type PlanRequest, type TemplateId } from "./types";

/**
 * "Plan mission" panel (P1-02).
 * Everything edited here travels in the `plan_request` sent to POST /plan.
 * The screen shows minutes and hours; state and request use seconds (SI).
 */

/** Detail of the `plan-response` event the panel emits when a response arrives. */
export interface PlanResponseEvent {
  response: PlanResponse;
  simulated: boolean;
}

export interface MissionPanel {
  /** Picks a destination (for example, from a map click). Returns a reason if it cannot. */
  selectDestination(poiId: string): string | null;
  onDestinationChange(cb: (poiId: string) => void): void;
  /** Runs after every change to the mission (and once on registration) with the current state. */
  onChange(cb: (state: Readonly<MissionState>) => void): void;
  /** Runs when the shown result no longer matches the form (any calculation-relevant edit). */
  onStale(cb: () => void): void;
  getRequest(): PlanRequest;
  setCollapsed(value: boolean): void;
}

const MIN = 60;
const HOUR = 3600;

/** Value for an <input type="number"> (always a dot as decimal separator). */
const inputValue = (n: number, digits = 2) => String(Number(n.toFixed(digits)));

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function createMissionPanel(root: HTMLElement, pois: Poi[], parcelId: string): MissionPanel {
  const maybeBase = pois.find((p) => p.role === "base");
  if (!maybeBase) throw new Error("There is no base among the points of interest.");
  const base: Poi = maybeBase;
  const destinations = pois.filter((p) => p.role === "destino");

  const compatible = (id: TemplateId) => destinations.filter((d) => d.families.includes(id));
  const firstTemplate: TemplateId = "observacion_geologica";

  let state: MissionState = stateFromTemplate(firstTemplate, base.id, compatible(firstTemplate)[0]?.id ?? "");
  let collapsed = false;
  let customTaskCount = 0;
  const invalid = new Set<string>();
  /** Increases with every submit; a response for an older submit is discarded. */
  let submitSeq = 0;
  /** Calculation key of the result on screen (null when there is none or it is stale). */
  let shownKey: string | null = null;
  const staleListeners: (() => void)[] = [];
  const destinationListeners: ((id: string) => void)[] = [];
  const changeListeners: ((s: Readonly<MissionState>) => void)[] = [];

  const notifyDestination = () => destinationListeners.forEach((cb) => cb(state.destination_poi));

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render() {
    const dests = compatible(state.template_id);
    const usesFixture = pois.some((p) => p.fixture);
    const sources = state.profile.parameter_sources;
    const defaults = defaultProfile().parameter_sources;

    root.classList.toggle("collapsed", collapsed);
    root.innerHTML = `
      <header class="mp-head">
        <h2>${esc(t("mp.title"))}</h2>
        <button type="button" class="mp-collapse" data-act="collapse" aria-expanded="${!collapsed}"
          aria-label="${esc(t(collapsed ? "mp.show" : "mp.hide"))}">${collapsed ? "+" : "−"}</button>
      </header>
      <form class="mp-body" novalidate>
        ${usesFixture ? `<p class="mp-note">${t("mp.fixtureNote")} ${infoButton("fixture_pois", t("mp.fixtureNote.info"))}</p>` : ""}

        <fieldset>
          <legend>${esc(t("mp.mission"))} ${infoButton("mission_templates", t("mp.mission.info"))}</legend>
          <label>${esc(t("mp.family"))}
            <select name="template">
              ${TEMPLATE_IDS.map((id) => `<option value="${id}" ${id === state.template_id ? "selected" : ""}>${esc(templateLabel(id))}</option>`).join("")}
            </select>
          </label>
          <p class="mp-hint">${esc(templateDescription(state.template_id))}</p>
          <label>${esc(t("mp.departFrom"))}
            <input type="text" value="${esc(poiTitle(base))}" readonly />
          </label>
          <label>${esc(t("mp.destination"))}
            <select name="destination" ${dests.length ? "" : "disabled"}>
              ${
                dests.length
                  ? dests
                      .map(
                        (d) =>
                          `<option value="${d.id}" ${d.id === state.destination_poi ? "selected" : ""}>${esc(poiTitle(d))}${d.hypothetical ? esc(t("mp.hypothetical")) : ""}</option>`,
                      )
                      .join("")
                  : `<option>${esc(t("mp.noDestination"))}</option>`
              }
            </select>
          </label>
          <p class="mp-hint">${esc(t("mp.destination.hint"))}</p>
        </fieldset>

        <fieldset>
          <legend>${esc(t("mp.tasks"))} ${infoButton("mission_templates", t("mp.tasks.info"))}</legend>
          <ul class="mp-tasks">
            ${state.tasks
              .map(
                (task, i) => `
              <li>
                <input type="text" name="task-label" data-i="${i}" value="${esc(task.label)}" aria-label="${esc(t("mp.task.name", { n: i + 1 }))}" />
                <input type="number" name="task-min" data-i="${i}" min="1" step="1" value="${inputValue(task.duration_s / MIN, 1)}" aria-label="${esc(t("mp.task.duration", { n: i + 1 }))}" />
                <span class="mp-unit">min</span>
                <button type="button" data-act="remove-task" data-i="${i}" aria-label="${esc(t("mp.task.remove", { n: i + 1 }))}" ${state.tasks.length <= 1 ? "disabled" : ""}>×</button>
              </li>`,
              )
              .join("")}
          </ul>
          <button type="button" class="mp-link" data-act="add-task">${esc(t("mp.task.add"))}</button>
        </fieldset>

        <fieldset>
          <legend>${esc(t("mp.schedule"))} ${infoButton("rems", t("mp.schedule.info"))}</legend>
          <div class="mp-grid">
            <label>${esc(t("mp.sol"))}
              <input type="number" name="sol" min="1" step="1" value="${state.sol}" />
            </label>
            <label>${esc(t("mp.departure"))}
              <input type="time" name="departure" value="${state.departure_local}" />
            </label>
            <label>${esc(t("mp.reserve"))}
              <span class="mp-inline"><input type="number" name="reserve-min" min="0" step="5" value="${inputValue(state.reserve_s / MIN, 1)}" /><span class="mp-unit">min</span></span>
            </label>
            <label>${esc(t("mp.budget"))}
              <span class="mp-inline"><input type="number" name="budget-h" min="0.5" step="0.5" value="${inputValue(state.time_budget_s / HOUR)}" /><span class="mp-unit">h</span></span>
            </label>
          </div>
          <p class="mp-hint">${esc(t("mp.schedule.hint"))}</p>
        </fieldset>

        <fieldset>
          <legend>${esc(t("mp.profile"))} ${infoButton("human_profile", t("mp.profile.info"))}</legend>
          <label>${esc(t("mp.mode"))}
            <select name="mode">
              <option value="a_pie" selected>${esc(t("mp.mode.onFoot"))}</option>
              <option value="con_robot" disabled>${esc(t("mp.mode.robot"))}</option>
            </select>
          </label>
          <div class="mp-grid">
            <label>${esc(t("mp.maxSlope"))}
              <span class="mp-inline"><input type="number" name="max-slope" min="1" max="45" step="0.1" value="${inputValue(state.profile.max_slope_deg, 1)}" /><span class="mp-unit">°</span></span>
            </label>
            <label>${esc(t("mp.flatSpeed"))}
              <span class="mp-inline"><input type="number" name="speed" min="0.05" max="3" step="0.01" value="${inputValue(state.profile.flat_speed_m_s)}" /><span class="mp-unit">m/s</span></span>
            </label>
          </div>
          <p class="mp-hint" data-role="speed-kmh">≈ ${fmtNumber(state.profile.flat_speed_m_s * 3.6)} km/h</p>
          <details class="mp-sources">
            <summary>${esc(t("mp.values.summary"))}</summary>
            <p>${esc(t("mp.values.text"))}</p>
            <ul>
              <li><strong>${esc(t("mp.values.slope"))}</strong> ${esc(sources.max_slope_deg ?? defaults.max_slope_deg)}</li>
              <li><strong>${esc(t("mp.values.speed"))}</strong> ${esc(sources.flat_speed_m_s ?? defaults.flat_speed_m_s)}</li>
              <li>${esc(t("mp.values.assumptions"))}</li>
            </ul>
          </details>
        </fieldset>

        <fieldset>
          <legend>${esc(t("mp.prefs"))}</legend>
          ${prefRow("time", t("mp.pref.time"), t("mp.pref.time.hint"))}
          ${prefRow("effort", t("mp.pref.effort"), t("mp.pref.effort.hint"))}
          ${prefRow("comm", t("mp.pref.comm"), t("mp.pref.comm.hint"))}
          <p class="mp-hint">${esc(t("mp.prefs.hint"))}</p>
        </fieldset>

        <div class="mp-actions">
          <button type="button" data-act="reset">${esc(t("mp.reset"))}</button>
          <button type="submit" class="mp-primary">${esc(t("mp.submit"))}</button>
        </div>
        <p class="mp-status" role="status" aria-live="polite"></p>

        <details class="mp-json">
          <summary>${esc(t("mp.json"))}</summary>
          <pre></pre>
        </details>
      </form>
    `;
    invalid.clear();
    updatePreview();
  }

  function prefRow(key: keyof MissionState["preferences"], label: string, hint: string) {
    const v = state.preferences[key];
    return `
      <label class="mp-pref">
        <span>${esc(label)} <output data-pref-out="${key}">${fmtNumber(v)}</output></span>
        <input type="range" name="pref-${key}" min="0" max="1" step="0.1" value="${v}" title="${esc(hint)}" />
        <small>${esc(hint)}</small>
      </label>`;
  }

  // -------------------------------------------------------------------------
  // State ← form
  // -------------------------------------------------------------------------
  function readNumber(input: HTMLInputElement, min: number, max = Infinity): number | null {
    const v = input.valueAsNumber;
    const ok = Number.isFinite(v) && v >= min && v <= max;
    input.setAttribute("aria-invalid", String(!ok));
    const key = input.name + (input.dataset.i ?? "");
    if (ok) invalid.delete(key);
    else invalid.add(key);
    return ok ? v : null;
  }

  function onInput(e: Event) {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const i = Number((el as HTMLElement).dataset.i);
    switch (el.name) {
      case "template": {
        const id = el.value as TemplateId;
        const keep = compatible(id).some((d) => d.id === state.destination_poi);
        state = stateFromTemplate(id, state.origin_poi, keep ? state.destination_poi : (compatible(id)[0]?.id ?? ""));
        render();
        notifyDestination();
        return;
      }
      case "destination":
        state.destination_poi = el.value;
        notifyDestination();
        break;
      case "task-label": {
        const task = state.tasks[i];
        task.label = el.value;
        // Tasks added by hand take their id from the name; template tasks keep theirs.
        if (!(task.id in templateTaskIds())) task.id = slugify(el.value) || `task_${i + 1}`;
        break;
      }
      case "task-min": {
        const v = readNumber(el as HTMLInputElement, 1);
        if (v !== null) state.tasks[i].duration_s = Math.round(v * MIN);
        break;
      }
      case "sol": {
        const v = readNumber(el as HTMLInputElement, 1);
        if (v !== null) state.sol = Math.round(v);
        break;
      }
      case "departure":
        if (el.value) state.departure_local = el.value;
        break;
      case "reserve-min": {
        const v = readNumber(el as HTMLInputElement, 0);
        if (v !== null) state.reserve_s = Math.round(v * MIN);
        break;
      }
      case "budget-h": {
        const v = readNumber(el as HTMLInputElement, 0.5);
        if (v !== null) state.time_budget_s = Math.round(v * HOUR);
        break;
      }
      case "max-slope": {
        const v = readNumber(el as HTMLInputElement, 1, 45);
        if (v !== null) state.profile.max_slope_deg = v;
        break;
      }
      case "speed": {
        const v = readNumber(el as HTMLInputElement, 0.05, 3);
        if (v !== null) {
          state.profile.flat_speed_m_s = v;
          const kmh = root.querySelector<HTMLElement>('[data-role="speed-kmh"]');
          if (kmh) kmh.textContent = `≈ ${fmtNumber(v * 3.6)} km/h`;
        }
        break;
      }
      case "pref-time":
      case "pref-effort":
      case "pref-comm": {
        const key = el.name.slice(5) as keyof MissionState["preferences"];
        state.preferences[key] = Number(el.value);
        const out = root.querySelector<HTMLOutputElement>(`[data-pref-out="${key}"]`);
        if (out) out.value = fmtNumber(state.preferences[key]);
        break;
      }
      case "mode":
        state.mode = el.value as MissionState["mode"];
        break;
    }
    updatePreview();
  }

  /** Task ids that belong to the current template (not renamed when the label is edited). */
  function templateTaskIds(): Record<string, true> {
    return Object.fromEntries(TEMPLATES[state.template_id].tasks.map((task) => [task.id, true]));
  }

  function onClick(e: Event) {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
    if (!btn) return;
    switch (btn.dataset.act) {
      case "collapse":
        api.setCollapsed(!collapsed);
        break;
      case "add-task":
        customTaskCount += 1;
        state.tasks.push({ id: `task_${customTaskCount}`, label: t("mp.task.default", { n: customTaskCount }), duration_s: 15 * MIN });
        render();
        break;
      case "remove-task":
        state.tasks.splice(Number(btn.dataset.i), 1);
        render();
        break;
      case "reset": {
        const dest = state.destination_poi;
        state = stateFromTemplate(state.template_id, state.origin_poi, dest);
        render();
        setStatus(t("mp.status.reset"));
        break;
      }
    }
  }

  async function onSubmit(e: Event) {
    e.preventDefault();
    if (invalid.size) {
      setStatus(t("mp.status.invalid"), "error");
      return;
    }
    if (!state.destination_poi) {
      setStatus(t("mp.status.noDestination"), "error");
      return;
    }
    const req = getRequest();
    const key = calculationKey(req);
    const seq = ++submitSeq;
    const submit = root.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;
    setStatus(t("mp.status.calculating"));
    const res = await requestPlan(req);
    if (seq !== submitSeq) return; // a newer submit owns the status and the result
    if (submit) submit.disabled = false;
    // The form changed while waiting: this answer is for inputs that are no longer on screen.
    if (key !== calculationKey(getRequest())) {
      setStatus(t("mp.status.discarded"), "error");
      return;
    }
    if (res.ok) {
      shownKey = key;
      setStatus(
        res.simulated ? t("mp.status.simulated", { url: SERVICE_URL }) : t("mp.status.received"),
        res.simulated ? "error" : "info",
      );
      Object.assign(window, { lastPlanResponse: res.data });
      root.dispatchEvent(new CustomEvent<PlanResponseEvent>("plan-response", { detail: { response: res.data, simulated: res.simulated }, bubbles: true }));
    } else {
      setStatus(res.error, "error");
    }
  }

  // -------------------------------------------------------------------------
  // Output
  // -------------------------------------------------------------------------
  function getRequest(): PlanRequest {
    return toPlanRequest(state, parcelId);
  }

  function updatePreview() {
    const pre = root.querySelector(".mp-json pre");
    const req = getRequest();
    if (pre) pre.textContent = JSON.stringify(req, null, 2);
    Object.assign(window, { lastPlanRequest: req });
    if (shownKey !== null && calculationKey(req) !== shownKey) {
      shownKey = null;
      setStatus(t("mp.status.stale"));
      staleListeners.forEach((cb) => cb());
    }
    changeListeners.forEach((cb) => cb(state));
  }

  function setStatus(msg: string, kind: "info" | "error" = "info") {
    const el = root.querySelector<HTMLElement>(".mp-status");
    if (!el) return;
    el.textContent = msg;
    el.dataset.kind = kind;
  }

  root.addEventListener("input", onInput);
  root.addEventListener("change", (e) => {
    // <select> and the time field only fire "change" in some browsers.
    const el = e.target as HTMLElement;
    if (el.tagName === "SELECT" || (el as HTMLInputElement).type === "time") onInput(e);
  });
  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  render();

  // Language switch: re-render in place, keeping every value of the form. The last status
  // message is dropped (it was written in the other language).
  onLanguageChange(() => {
    relabelState(state);
    render();
  });

  const api: MissionPanel = {
    selectDestination(poiId) {
      const poi = destinations.find((d) => d.id === poiId);
      if (!poi) return t("mp.status.notDestination");
      if (!poi.families.includes(state.template_id)) {
        const msg = t("mp.status.familyNotAllowed", { poi: poiTitle(poi), family: templateLabel(state.template_id) });
        setStatus(msg, "error");
        return msg;
      }
      state.destination_poi = poiId;
      const sel = root.querySelector<HTMLSelectElement>('select[name="destination"]');
      if (sel) sel.value = poiId;
      setStatus(t("mp.status.destination", { poi: poiTitle(poi) }));
      updatePreview();
      notifyDestination();
      return null;
    },
    onDestinationChange(cb) {
      destinationListeners.push(cb);
      cb(state.destination_poi);
    },
    onChange(cb) {
      changeListeners.push(cb);
      cb(state);
    },
    onStale(cb) {
      staleListeners.push(cb);
    },
    getRequest,
    setCollapsed(value) {
      if (collapsed === value) return;
      // Collapsing does not re-render the form, so field state and the status message survive.
      collapsed = value;
      root.classList.toggle("collapsed", collapsed);
      const btn = root.querySelector<HTMLButtonElement>('[data-act="collapse"]');
      if (btn) {
        btn.textContent = collapsed ? "+" : "−";
        btn.setAttribute("aria-expanded", String(!collapsed));
        btn.setAttribute("aria-label", t(collapsed ? "mp.show" : "mp.hide"));
      }
    },
  };
  return api;
}
