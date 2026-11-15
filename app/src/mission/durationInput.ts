import { esc } from "../ui/format";
/** Segmented durations retain sub-minute seconds until the user deliberately edits them. */
export function durationFields(name: string, seconds: number, label: string): string {
  return `<span class="wz-duration"><input name="${name}-hours" data-duration="hours" maxlength="2" inputmode="numeric" pattern="[0-9]*" aria-label="${esc(label)} HH" value="${String(Math.floor(seconds / 3600)).padStart(2, "0")}" style="width:5em;display:inline-block" />:<input name="${name}-minutes" data-duration="minutes" inputmode="numeric" maxlength="2" pattern="[0-5][0-9]" aria-label="${esc(label)} MM" value="${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}" style="width:4em;display:inline-block" /></span>`;
}
export const validDurationPart = (value: string, minutes: boolean) => /^\d*$/.test(value) && value.length <= 2 && (!minutes || value === "" || Number(value) < 60);
export function constrainDuration(root: HTMLElement) {
  root.addEventListener("beforeinput", event => {
    const e = event as InputEvent, el = e.target as HTMLInputElement;
    if (!el.dataset.duration || !e.data) return;
    const next = el.value.slice(0, el.selectionStart ?? 0) + e.data + el.value.slice(el.selectionEnd ?? el.value.length);
    if (!validDurationPart(next, el.dataset.duration === "minutes")) e.preventDefault();
  });
  root.addEventListener("paste", event => {
    const el = event.target as HTMLInputElement;
    if (!el.dataset.duration) return;
    const value = event.clipboardData?.getData("text") ?? "";
    const next = el.value.slice(0, el.selectionStart ?? 0) + value + el.value.slice(el.selectionEnd ?? el.value.length);
    if (!validDurationPart(next, el.dataset.duration === "minutes")) event.preventDefault();
  });
}
