/** Shared by the renderer and native view so their edges stay aligned. */
export function browserLayout(windowWidth: number, preferred?: number) {
  const sidebar = windowWidth <= 1050 ? 215 : 248;
  const min = 320;
  const max = Math.max(min, windowWidth - sidebar - 360);
  const fallback = Math.max(min, Math.min(480, windowWidth - sidebar - 380));
  return { min, max, width: Math.round(Math.max(min, Math.min(max, preferred ?? fallback))) };
}
