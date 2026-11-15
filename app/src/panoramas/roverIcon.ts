/**
 * Rover icon (side view: mast with camera head, body, rocker-bogie and six wheels) used as the
 * clickable marker of each panorama. Drawn as SVG and passed to Cesium as a data URL.
 * The outline gives contrast on both light and dark terrain.
 */
export function roverIconUrl(fill: string, outline: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <g fill="${fill}" stroke="${outline}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke">
    <rect x="36" y="5" width="18" height="9" rx="2.5"/>
    <rect x="42" y="13" width="5" height="16"/>
    <path d="M6 28 h46 a3 3 0 0 1 3 3 v7 a3 3 0 0 1 -3 3 h-46 a3 3 0 0 1 -3 -3 v-7 a3 3 0 0 1 3 -3 z"/>
    <path d="M14 41 L24 48 L32 41 L40 48 L50 41" fill="none" stroke-width="7"/>
    <circle cx="12" cy="52" r="7"/>
    <circle cx="32" cy="52" r="7"/>
    <circle cx="52" cy="52" r="7"/>
  </g>
  <path d="M14 41 L24 48 L32 41 L40 48 L50 41" fill="none" stroke="${fill}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="12" cy="52" r="2.2" fill="${outline}"/>
  <circle cx="32" cy="52" r="2.2" fill="${outline}"/>
  <circle cx="52" cy="52" r="2.2" fill="${outline}"/>
  <circle cx="49" cy="9.5" r="2" fill="${outline}"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
