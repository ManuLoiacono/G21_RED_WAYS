import { requestPlan, SERVICE_URL } from "./api";
import { toPlanRequest } from "./request";
import type { PlanResponse } from "./response";
import { esc } from "../ui/format";
import { DEFAULT_PROFILE, stateFromTemplate, TEMPLATES } from "./templates";
import { TEMPLATE_IDS, type MissionState, type Poi, type PlanRequest, type TemplateId } from "./types";

/**
 * Panel «Preparar misión» (P1-02).
 * Todo lo que se edita acá viaja en el `plan_request` que se envía a POST /plan.
 * En pantalla se usan minutos y horas; el estado y el pedido van en segundos (SI).
 */

/** Detalle del evento `plan-response` que emite el panel al recibir una respuesta. */
export interface PlanResponseEvent {
  response: PlanResponse;
  simulated: boolean;
}

export interface MissionPanel {
  /** Elige un destino (por ejemplo, desde un clic en el mapa). Devuelve un motivo si no se puede. */
  selectDestination(poiId: string): string | null;
  onDestinationChange(cb: (poiId: string) => void): void;
  getRequest(): PlanRequest;
  setCollapsed(value: boolean): void;
}

const MIN = 60;
const HOUR = 3600;

const fmt = (n: number, digits = 2) => String(Number(n.toFixed(digits)));

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
  if (!maybeBase) throw new Error("No hay base entre los puntos de interés.");
  const base: Poi = maybeBase;
  const destinations = pois.filter((p) => p.role === "destino");

  const compatible = (id: TemplateId) => destinations.filter((d) => d.families.includes(id));
  const firstTemplate: TemplateId = "observacion_geologica";

  let state: MissionState = stateFromTemplate(firstTemplate, base.id, compatible(firstTemplate)[0]?.id ?? "");
  let collapsed = false;
  let customTaskCount = 0;
  const invalid = new Set<string>();
  const destListeners: ((id: string) => void)[] = [];

  const notifyDestination = () => destListeners.forEach((cb) => cb(state.destination_poi));

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render() {
    const tpl = TEMPLATES[state.template_id];
    const dests = compatible(state.template_id);
    const usesFixture = pois.some((p) => p.fixture);
    const src = state.profile.parameter_sources;

    root.classList.toggle("collapsed", collapsed);
    root.innerHTML = `
      <header class="mp-head">
        <h2>Preparar misión</h2>
        <button type="button" class="mp-collapse" data-act="collapse" aria-expanded="${!collapsed}"
          aria-label="${collapsed ? "Mostrar" : "Ocultar"} panel">${collapsed ? "+" : "−"}</button>
      </header>
      <form class="mp-body" novalidate>
        ${usesFixture ? `<p class="mp-note">Base y destinos <strong>de prueba</strong> (fixture), no son destinos científicos reales.</p>` : ""}

        <fieldset>
          <legend>Misión</legend>
          <label>Familia
            <select name="template">
              ${TEMPLATE_IDS.map((id) => `<option value="${id}" ${id === state.template_id ? "selected" : ""}>${esc(TEMPLATES[id].label)}</option>`).join("")}
            </select>
          </label>
          <p class="mp-hint">${esc(tpl.description)}</p>
          <label>Salida desde
            <input type="text" value="${esc(base.title)}" readonly />
          </label>
          <label>Destino
            <select name="destination" ${dests.length ? "" : "disabled"}>
              ${
                dests.length
                  ? dests
                      .map((d) => `<option value="${d.id}" ${d.id === state.destination_poi ? "selected" : ""}>${esc(d.title)}${d.hypothetical ? " (hipotético)" : ""}</option>`)
                      .join("")
                  : `<option>Ningún destino admite esta familia</option>`
              }
            </select>
          </label>
          <p class="mp-hint">También podés elegir el destino con un clic en el mapa.</p>
        </fieldset>

        <fieldset>
          <legend>Tareas en el destino</legend>
          <ul class="mp-tasks">
            ${state.tasks
              .map(
                (t, i) => `
              <li>
                <input type="text" name="task-label" data-i="${i}" value="${esc(t.label)}" aria-label="Nombre de la tarea ${i + 1}" />
                <input type="number" name="task-min" data-i="${i}" min="1" step="1" value="${fmt(t.duration_s / MIN, 1)}" aria-label="Duración de la tarea ${i + 1} en minutos" />
                <span class="mp-unit">min</span>
                <button type="button" data-act="remove-task" data-i="${i}" aria-label="Quitar tarea ${i + 1}" ${state.tasks.length <= 1 ? "disabled" : ""}>×</button>
              </li>`,
              )
              .join("")}
          </ul>
          <button type="button" class="mp-link" data-act="add-task">+ Agregar tarea</button>
        </fieldset>

        <fieldset>
          <legend>Horario y presupuesto</legend>
          <div class="mp-grid">
            <label>Sol (REMS)
              <input type="number" name="sol" min="1" step="1" value="${state.sol}" />
            </label>
            <label>Hora de salida
              <input type="time" name="departure" value="${state.departure_local}" />
            </label>
            <label>Reserva
              <span class="mp-inline"><input type="number" name="reserve-min" min="0" step="5" value="${fmt(state.reserve_s / MIN, 1)}" /><span class="mp-unit">min</span></span>
            </label>
            <label>Tiempo máximo fuera de la base
              <span class="mp-inline"><input type="number" name="budget-h" min="0.5" step="0.5" value="${fmt(state.time_budget_s / HOUR)}" /><span class="mp-unit">h</span></span>
            </label>
          </div>
          <p class="mp-hint">El sol elige el amanecer y el atardecer medidos por Curiosity ese día (observación histórica, no pronóstico). La hora es solar local.</p>
        </fieldset>

        <fieldset>
          <legend>Perfil del explorador</legend>
          <label>Modo
            <select name="mode">
              <option value="a_pie" selected>A pie</option>
              <option value="con_robot" disabled>Con robot de apoyo (próximamente)</option>
            </select>
          </label>
          <div class="mp-grid">
            <label>Pendiente máxima
              <span class="mp-inline"><input type="number" name="max-slope" min="1" max="45" step="0.1" value="${fmt(state.profile.max_slope_deg, 1)}" /><span class="mp-unit">°</span></span>
            </label>
            <label>Velocidad en llano
              <span class="mp-inline"><input type="number" name="speed" min="0.05" max="3" step="0.01" value="${fmt(state.profile.flat_speed_m_s)}" /><span class="mp-unit">m/s</span></span>
            </label>
          </div>
          <p class="mp-hint" data-role="speed-kmh">≈ ${fmt(state.profile.flat_speed_m_s * 3.6, 1)} km/h</p>
          <details class="mp-sources">
            <summary>¿De dónde salen estos valores?</summary>
            <p>Son valores de referencia, editables. No son límites operativos para Marte (otra gravedad, traje y terreno).</p>
            <ul>
              <li><strong>Pendiente:</strong> ${esc(src.max_slope_deg ?? DEFAULT_PROFILE.parameter_sources.max_slope_deg)}</li>
              <li><strong>Velocidad:</strong> ${esc(src.flat_speed_m_s ?? DEFAULT_PROFILE.parameter_sources.flat_speed_m_s)}</li>
              <li>Tareas, reserva y tiempo máximo: supuestos de la plantilla.</li>
            </ul>
          </details>
        </fieldset>

        <fieldset>
          <legend>Preferencias</legend>
          ${prefRow("time", "Tiempo", "Llegar y volver rápido")}
          ${prefRow("effort", "Esfuerzo", "Evitar subidas y pendientes")}
          ${prefRow("comm", "Enlace con la base", "Mantener visibilidad con la base (próximamente)")}
          <p class="mp-hint">Las preferencias ordenan las alternativas; nunca compensan una restricción incumplida.</p>
        </fieldset>

        <div class="mp-actions">
          <button type="button" data-act="reset">Restaurar valores</button>
          <button type="submit" class="mp-primary">Calcular rutas</button>
        </div>
        <p class="mp-status" role="status" aria-live="polite"></p>

        <details class="mp-json">
          <summary>Ver pedido enviado al motor</summary>
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
        <span>${label} <output data-pref-out="${key}">${fmt(v, 1)}</output></span>
        <input type="range" name="pref-${key}" min="0" max="1" step="0.1" value="${v}" title="${esc(hint)}" />
        <small>${esc(hint)}</small>
      </label>`;
  }

  // -------------------------------------------------------------------------
  // Estado ← formulario
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
        const t = state.tasks[i];
        t.label = el.value;
        // Las tareas agregadas a mano toman su id del nombre; las de la plantilla lo conservan.
        if (!(t.id in taskIdsOfTemplate())) t.id = slugify(el.value) || `tarea_${i + 1}`;
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
          if (kmh) kmh.textContent = `≈ ${fmt(v * 3.6, 1)} km/h`;
        }
        break;
      }
      case "pref-time":
      case "pref-effort":
      case "pref-comm": {
        const key = el.name.slice(5) as keyof MissionState["preferences"];
        state.preferences[key] = Number(el.value);
        const out = root.querySelector<HTMLOutputElement>(`[data-pref-out="${key}"]`);
        if (out) out.value = fmt(state.preferences[key], 1);
        break;
      }
      case "mode":
        state.mode = el.value as MissionState["mode"];
        break;
    }
    updatePreview();
  }

  /** IDs de tareas propias de la plantilla actual (no se renombran al editar la etiqueta). */
  function taskIdsOfTemplate(): Record<string, true> {
    return Object.fromEntries(TEMPLATES[state.template_id].tasks.map((t) => [t.id, true]));
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
        state.tasks.push({ id: `tarea_${customTaskCount}`, label: `Tarea ${customTaskCount}`, duration_s: 15 * MIN });
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
        setStatus("Valores de la plantilla restaurados.");
        break;
      }
    }
  }

  async function onSubmit(e: Event) {
    e.preventDefault();
    if (invalid.size) {
      setStatus("Hay valores fuera de rango (marcados en rojo). Corregilos antes de calcular.", "error");
      return;
    }
    if (!state.destination_poi) {
      setStatus("Elegí un destino.", "error");
      return;
    }
    const req = getRequest();
    const submit = root.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;
    setStatus("Calculando…");
    const res = await requestPlan(req);
    if (submit) submit.disabled = false;
    if (res.ok) {
      setStatus(
        res.simulated
          ? `El servicio de rutas (${SERVICE_URL}) no responde: se muestra una respuesta simulada.`
          : "Respuesta recibida del motor.",
        res.simulated ? "error" : "info",
      );
      Object.assign(window, { lastPlanResponse: res.data });
      root.dispatchEvent(new CustomEvent<PlanResponseEvent>("plan-response", { detail: { response: res.data, simulated: res.simulated }, bubbles: true }));
    } else {
      setStatus(res.error, "error");
    }
  }

  // -------------------------------------------------------------------------
  // Salida
  // -------------------------------------------------------------------------
  function getRequest(): PlanRequest {
    return toPlanRequest(state, parcelId);
  }

  function updatePreview() {
    const pre = root.querySelector(".mp-json pre");
    const req = getRequest();
    if (pre) pre.textContent = JSON.stringify(req, null, 2);
    Object.assign(window, { lastPlanRequest: req });
  }

  function setStatus(msg: string, kind: "info" | "error" = "info") {
    const el = root.querySelector<HTMLElement>(".mp-status");
    if (!el) return;
    el.textContent = msg;
    el.dataset.kind = kind;
  }

  root.addEventListener("input", onInput);
  root.addEventListener("change", (e) => {
    // Los <select> y el campo de hora disparan solo "change" en algunos navegadores.
    const el = e.target as HTMLElement;
    if (el.tagName === "SELECT" || (el as HTMLInputElement).type === "time") onInput(e);
  });
  root.addEventListener("click", onClick);
  root.addEventListener("submit", onSubmit);
  render();

  const api: MissionPanel = {
    selectDestination(poiId) {
      const poi = destinations.find((d) => d.id === poiId);
      if (!poi) return "Ese punto no es un destino.";
      if (!poi.families.includes(state.template_id)) {
        const msg = `«${poi.title}» no admite la familia «${TEMPLATES[state.template_id].label}».`;
        setStatus(msg, "error");
        return msg;
      }
      state.destination_poi = poiId;
      const sel = root.querySelector<HTMLSelectElement>('select[name="destination"]');
      if (sel) sel.value = poiId;
      setStatus(`Destino: ${poi.title}.`);
      updatePreview();
      notifyDestination();
      return null;
    },
    onDestinationChange(cb) {
      destListeners.push(cb);
      cb(state.destination_poi);
    },
    getRequest,
    setCollapsed(value) {
      if (collapsed === value) return;
      // Plegar no re-renderiza el formulario: así no se pierde el estado de los campos ni el mensaje.
      collapsed = value;
      root.classList.toggle("collapsed", collapsed);
      const btn = root.querySelector<HTMLButtonElement>('[data-act="collapse"]');
      if (btn) {
        btn.textContent = collapsed ? "+" : "−";
        btn.setAttribute("aria-expanded", String(!collapsed));
        btn.setAttribute("aria-label", `${collapsed ? "Mostrar" : "Ocultar"} panel`);
      }
    },
  };
  return api;
}
