// Node-only helpers (Playwright, sharp). Not exported from the package root so the
// admin bundle never pulls them in.
export { ASSET_ORIGIN, renderPage, type LoadedAsset, type RenderPageOptions, type RenderPageResult } from './render';
export { compareImages, type ImageDiff } from './diff';
