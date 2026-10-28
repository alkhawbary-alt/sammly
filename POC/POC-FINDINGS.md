# POC Findings: PSD / Image / SVG to HTML/CSS Pipeline

## 1. Executive Summary

This Proof of Concept (POC) evaluated the feasibility of the conversion pipeline:
```text
PSD / PNG / JPG / SVG → Normalized JSON → HTML/CSS → Live Preview → PNG/PDF (Chromium)
```

**Verdict: Feasible with Hybrid Representation.**
Using Normalized JSON as the single source of truth and HTML/CSS as the universal rendering format is viable. With basic shapes and text converted into CSS/HTML and complex Photoshop effects backed by automatic raster fallback, visual fidelity reached **97.59% match** against the original Photoshop composite in automated pixel-difference testing.

---

## 2. What Worked

1. **Normalized JSON as Universal Representation:**
   - Single schema (validated with Zod) successfully describes text, images, shapes, groups, rasters, and SVG.
   - Clean decoupling: Importers only produce Normalized JSON; renderers only consume Normalized JSON.
2. **Unified Rendering Engine:**
   - The exact same HTML/CSS generator powers both the browser Live Preview (iframe) and headless Playwright Chromium (PNG/PDF exports).
   - Pixel dimensions and aspect ratios remain 100% consistent across web and exports.
3. **Editable Text Layers:**
   - Extracted text strings, font families, font sizes, colors, and paragraph alignment from `ag-psd` text layers.
   - Text layers remain directly editable in JSON and re-render instantly without quality degradation.
4. **Basic Shapes & Solid Fills:**
   - Rectangles, cards, and solid fills convert cleanly into pure CSS (`background-color`, `border`, `border-radius`).
5. **Hierarchical Groups:**
   - Photoshop layer groups cleanly map to nested HTML container elements with relative z-indexes.
6. **Automatic Raster Fallback:**
   - Any layer with non-reproducible Photoshop features (gradients, complex blend modes, masks, filters) extracts its layer canvas as a transparent PNG asset.
   - Zero visual content loss.
7. **Vector SVG & Bitmap Import:**
   - SVG preserved as scalable vector layers.
   - PNG, JPG, JPEG, and WEBP automatically wrapped into single-layer Normalized Design Documents.
8. **Automated Visual Difference Validation:**
   - Automated pixel-match comparison between Photoshop original composite and Playwright rendered PNG yielded only **2.41% pixel difference**.

---

## 3. What Did Not Work / Required Raster Fallback

| Feature | Editable in HTML/CSS? | Outcome / Strategy Used |
| :--- | :--- | :--- |
| **Point Text Coordinates** | Partial | `ag-psd` often outputs `NaN` for `left`/`top` on point text. Solved by calculating coordinates from `layer.transform` matrix and text baseline correction. |
| **Photoshop Layer Effects** (Bevel & Emboss, Satin, Inner Glow, Pattern Overlay) | No | **Raster fallback**. CSS cannot replicate Photoshop's proprietary raster effect algorithms without visual distortion. |
| **Adjustment Layers** (Curves, Levels, Hue/Saturation, Color Balance) | No | Photoshop adjustment layers affect underlying layer stacks globally. Without Photoshop's color engine, they must be merged or rasterized. |
| **Complex Vector Paths & Masks** | Partial | Simple rectangles and pills convert to CSS. Non-standard Bézier paths and clipping masks require SVG path translation or raster extraction. |
| **Local / Missing Fonts** | Partial | PSD files reference local desktop fonts (e.g., Helvetica Neue, Proxima Nova, Adobe fonts). When missing on the host or browser, CSS falls back to generic font stacks, causing minor typographic shifts. |

---

## 4. Major Limitations

1. **Text Layout Metrics Difference:**
   - Photoshop uses proprietary font metrics, fractional kerning, and tracking algorithms. Browser text rendering (Blink / FreeType / DirectWrite) renders text with slightly different line-wrapping and letter spacing, which accounts for the ~2.4% visual variance.
2. **Layer Blend Modes:**
   - CSS `mix-blend-mode` supports basic blend modes (`multiply`, `screen`, `overlay`), but advanced Photoshop blend modes (`vivid light`, `pin light`, `linear burn`) behave differently or are unsupported in browser CSS.
3. **Headless Canvas Setup:**
   - In Node.js, `ag-psd` requires a canvas shim for pixel decoding. Using `@napi-rs/canvas` proved fast, reliable, and precompiled across Windows, macOS, and Linux without native C++ build toolchains.

---

## 5. Feasibility Assessment for Next Phase

### Is HTML/CSS technically viable as the target representation?
**YES.**
- Standard HTML/CSS is expressive enough for marketing banners, social media cards, certificates, posters, and presentation decks.
- It provides universal portability: editable in browsers, printable via PDF, and exportable via headless Chromium.
- The hybrid strategy (editable text + CSS shapes + raster fallback for complex FX) strikes the right balance between editability and visual fidelity.

### Recommended Next Steps for Full Implementation:
1. **Font Upload & Webfont Injection:** Allow users to upload `.ttf`/`.woff2` fonts alongside PSD imports to achieve near 100% typographic parity.
2. **Text Area Wrapping Engine:** Improve text bounding box estimation for point text layers.
3. **SVG Path Exporter for Vector Masks:** Convert Photoshop vector masks into SVG path definitions rather than raster fallbacks.
4. **Selective Rasterization Toggle:** In the UI, allow users to toggle between "Editable Text" and "Raster Perfect" per layer.

---

## 6. Evaluation of Alternative Community Repositories

During the POC, we benchmarked and evaluated three alternative open-source approaches:

### A. `psdjs` (`psd.js` v3.4.0)
* **Status:** Mostly unmaintained since 2017; written in CoffeeScript.
* **Findings:**
  - **No CSS Shape Detection:** Detects `0` shape layers, treating all rectangles, cards, and vector layers as opaque raster images.
  - **Missing Modern Typography:** Often extracts placeholder tokens (e.g. `AdobeInvisFont`) and misses tracking/kerning matrices.
  - **Verdict:** Inferior to `ag-psd` for modern PSD parsing and hybrid representation.

### B. `node-psd-to-html`
* **Status:** Direct PSD-to-DOM converter powered by `psd.js`.
* **Findings:**
  - Directly slices PSD layers into PNG files and generates static `<div>` tags with hard-coded inline CSS `background-image` rules.
  - **No Normalized JSON model:** Without an intermediate schema, downstream editing, validation, and multi-target rendering (e.g., Fabric.js, PDF, responsive HTML) are impossible.
  - **Verdict:** Rigid and fragile compared to the decoupled `PSD -> Normalized JSON -> HTML/CSS` architecture.

### C. `psd2fabric` & Fabric.js Integration
* **Status:** Converts PSD layers into Fabric.js Canvas JSON objects.
* **Findings:**
  - **Implemented in POC:** We built a dedicated `generateFabricJson()` module (`src/generator/fabricGenerator.ts`) and integrated it into the UI and API.
  - **Verdict:** Fabric.js JSON is useful if the target application is a canvas-based design tool. However, for universal headless rendering, vector PDF export, and crisp multi-device display, **Normalized JSON -> HTML/CSS** remains significantly superior.

