# Samimle: Design Conversion Pipeline (PSD / Image / SVG → HTML/CSS)

A high-performance pipeline and interactive workbench for converting PSD files, SVG graphics, and raster images into Normalized JSON, editable HTML/CSS, Fabric.js interactive canvases, and high-fidelity PNG/PDF exports.

---

## ⚡ Quick Start on Another Machine

For full details, prerequisites, and troubleshooting, see **[REQUIREMENTS.md](file:///c:/Users/hussain/Desktop/samimle/REQUIREMENTS.md)**.

### 1. Prerequisites
- **Node.js** `v20.0.0` or higher (`v22 LTS` recommended)
- **npm** `v10.0.0` or higher

### 2. Setup
```bash
# 1. Clone or extract the project on your device
cd samimle

# 2. Install dependencies (DO NOT copy node_modules from another OS)
npm install

# 3. Install Playwright Chromium browser
npx playwright install chromium
```
*(On Ubuntu/Debian Linux, also run: `npx playwright install-deps chromium`)*

### 3. Run Development Server
```bash
npm run dev
```

- **Web Studio UI:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:3001](http://localhost:3001)

### 4. Run Automated Tests
```bash
npm test
```

---

## 📦 Available Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Runs both backend Fastify server and frontend Vite app concurrently |
| `npm run dev:server` | Runs backend in development mode with watch auto-reload |
| `npm run dev:client` | Starts Vite React client dev server on port `5173` |
| `npm run build` | Compiles production assets into `dist/client/` |
| `npm run server` | Runs the production backend (serves API and compiled client on `http://localhost:3001`) |
| `npm test` | Runs unit, visual comparison, and E2E Playwright tests |

---

## 🏗 Core Workflow & Features

1. **Upload File → Converted to Normalized JSON:**
   - Upload any PSD, SVG, PNG, JPG, or WebP.
   - The backend parses layers and generates a single source of truth **Normalized Design Document JSON** (validated via Zod).
   - View, copy, or download the converted JSON file anytime.

2. **Interactive Live Canvas Preview:**
   - Renders the uploaded design faithfully in real time.
   - Interactive zoom controls (Zoom In, Zoom Out, 100%, Fit to Screen).
   - Text bounding boxes toggle and customizable canvas background (transparent checkered, white, dark).

3. **Text Editor Sidebar (Edit Text Only):**
   - Automatically extracts and lists all text layers found in the design.
   - Edit text content live: every keystroke instantly re-renders on the canvas with zero lag.
   - Customize typography: font size, font family, color picker with preset swatches, font weight, italic style, text alignment.
   - Quick tools: Reset individual layer, Reset All text, case transform (UPPERCASE, lowercase, Title Case), or add new text layers.

4. **Multi-Format Exports:**
   - Export high-resolution PNG & PDF via headless Chromium Playwright.
   - Export responsive HTML/CSS.
   - Export Fabric.js 5.x JSON.
   - Automated visual pixel difference comparison against Photoshop original composite.

