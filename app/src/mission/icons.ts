/** Inline SVG icons for the mission wizard (currentColor, decorative: aria-hidden). */
const svg = (body: string, view = "0 0 48 48") =>
  `<svg viewBox="${view}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  astronaut: svg(`<circle cx="24" cy="17" r="10"/><path d="M17 16.5a7 6 0 0 1 14 0v2a7 4 0 0 1-14 0z" fill="currentColor" fill-opacity=".25"/>
    <path d="M12 44v-8a12 9 0 0 1 24 0v8"/><rect x="19" y="32" width="10" height="6" rx="1.5"/><path d="M34 12h3v9h-3"/>`),
  rover: svg(`<rect x="8" y="18" width="30" height="10" rx="2"/><path d="M14 18v-5h10v5M30 18l4-7h4"/><circle cx="38" cy="10" r="2"/>
    <circle cx="13" cy="34" r="4"/><circle cx="24" cy="34" r="4"/><circle cx="35" cy="34" r="4"/><path d="M13 28v2M24 28v2M35 28v2"/>`),
  transport: svg(`<rect x="4" y="14" width="36" height="14" rx="2"/><path d="M40 20h4v8h-4M10 14v-4h14v4"/>
    <circle cx="10" cy="34" r="4"/><circle cx="20" cy="34" r="4"/><circle cx="30" cy="34" r="4"/><circle cx="40" cy="34" r="4" opacity=".5"/>`),
  geological_observation: svg(`<path d="M6 40l10-16 7 9 6-11 13 18z" fill="currentColor" fill-opacity=".18"/><circle cx="31" cy="15" r="7"/><path d="M36 20l6 6"/>`),
  topographic_exploration: svg(`<path d="M6 34c6-6 10 2 16-4s10-2 20-8"/><path d="M6 26c6-6 10 2 16-4s10-2 20-8" opacity=".7"/><path d="M6 42c6-6 10 2 16-4s10-2 20-8" opacity=".45"/><path d="M38 6v8M34 10h8"/>`),
  reconnaissance: svg(`<circle cx="15" cy="28" r="8"/><circle cx="33" cy="28" r="8"/><path d="M23 28h2M11 20l4-8h4l2 8M37 20l-4-8h-4l-2 8"/>`),
  environmental_measurement: svg(`<path d="M20 30V10a4 4 0 0 1 8 0v20a7 7 0 1 1-8 0z"/><circle cx="24" cy="36" r="3" fill="currentColor"/><path d="M24 33V18M34 12h6M34 18h4M34 24h6"/>`),
  check: svg(`<path d="M12 25l8 8 16-17"/>`),
  pencil: svg(`<path d="M30 10l8 8-20 20H10v-8z"/><path d="M26 14l8 8"/>`, "0 0 48 48"),
  route: svg(`<circle cx="10" cy="36" r="4"/><circle cx="38" cy="12" r="4"/><path d="M14 34c10-2 6-14 14-18 3-1.5 5-2 6-2" stroke-dasharray="3 4"/>`),
  clock: svg(`<circle cx="24" cy="24" r="16"/><path d="M24 14v10l7 5"/>`),
  tasks: svg(`<path d="M18 14h20M18 24h20M18 34h20"/><path d="M8 13l2 2 4-4M8 23l2 2 4-4M8 33l2 2 4-4"/>`),
  team: svg(`<circle cx="17" cy="17" r="6"/><circle cx="33" cy="19" r="5"/><path d="M6 38a11 9 0 0 1 22 0M27 38a8 7 0 0 1 16 0"/>`),
} as const;

export function memberIcon(kind: "human" | "robot", profileId: string): string {
  if (kind === "human") return ICONS.astronaut;
  return profileId.includes("transport") ? ICONS.transport : ICONS.rover;
}

export function familyIcon(templateId: string): string {
  return (ICONS as Record<string, string>)[templateId] ?? ICONS.route;
}
