// Inline images are raster-only; SVG diagrams use a separate trusted renderer.
export const imageLimit = 5 * 1024 * 1024;
export function rasterDataURL(value: string): boolean {
  return (
    value.length <= Math.ceil((imageLimit * 4) / 3) + 100 &&
    /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}
