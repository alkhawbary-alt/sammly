# Project Requirements & Setup Guide

This guide contains everything required to set up and run the **Samimle (Design Conversion POC)** project on another computer (Windows, macOS, or Linux).

---

## 1. System Requirements & Prerequisites

Before running the project on a new device, ensure the following software is installed:

| Requirement | Minimum Version | Recommended Version | Download / Installation Link |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v20.0.0` or higher | `v22.x LTS` | [https://nodejs.org/](https://nodejs.org/) |
| **npm** | `v10.0.0` or higher | Comes bundled with Node.js | Installed automatically with Node.js |
| **Operating System** | Windows 10/11, macOS 12+, Ubuntu 20.04+ (or equivalent Linux distro) | Any modern OS | — |
| **Memory (RAM)** | 4 GB | 8 GB or higher (for PSD canvas decoding & headless browser rendering) | — |
| **Disk Space** | ~1.5 GB | Free space for `node_modules` and Playwright Chromium browser binary | — |

> **Verify your installation:**
> Open your terminal / command prompt and run:
> ```bash
> node -v
> npm -v
> ```
> *(Node version must be 20.0.0 or higher)*

---

## 2. Transferring the Project to Another Device

If you are copying the project folder (or extracting from `samimle.rar` / zip / git clone):

> [!WARNING]
> **DO NOT copy the `node_modules` folder across different devices!**
> Native binary modules such as `@napi-rs/canvas` and `sharp` are compiled for the specific operating system and architecture of the source computer. If you copy `node_modules` from Windows to Mac/Linux (or between different machines), native modules may fail to load.
> 
> **If you copied `node_modules`, delete it before proceeding:**
> - **Windows (PowerShell):** `Remove-Item -Recurse -Force node_modules`
> - **macOS / Linux:** `rm -rf node_modules`

---

## 3. Step-by-Step Installation

Follow these steps on the destination device:

### Step 3.1: Open the Project Directory
Open your terminal (PowerShell, Command Prompt, or Bash/Zsh) and navigate to the project root:
```bash
cd /path/to/samimle
```

### Step 3.2: Install NPM Dependencies
Install all required project packages:
```bash
npm install
```

### Step 3.3: Install Playwright Chromium Browser
The server uses **Playwright** for headless Chromium rendering (exporting designs to PNG/PDF and running end-to-end tests). You **must** download the Chromium browser binary:

```bash
npx playwright install chromium
```

> **For Linux users (Ubuntu / Debian):**
> If you are running on Linux, also install any required system GUI libraries by running:
> ```bash
> npx playwright install-deps chromium
> ```

---

## 4. How to Run the Project

You can run the project in development mode (with hot-reloading) or production mode.

### Option A: Development Mode (Recommended)
This runs both the **Fastify Backend API** and the **Vite React Frontend** concurrently in one terminal:

```bash
npm run dev
```

Once running:
- **Frontend Web UI:** [http://localhost:5173](http://localhost:5173)
- **Backend API Server:** [http://localhost:3001](http://localhost:3001)
- Open your browser and go to: **`http://localhost:5173`**

---

### Option B: Run Frontend and Backend in Separate Terminals
If you prefer dedicated terminal windows:

**Terminal 1 (Backend Server):**
```bash
npm run dev:server
```
*(Runs backend on `http://localhost:3001` with auto-reload on file changes)*

**Terminal 2 (Frontend Client):**
```bash
npm run dev:client
```
*(Runs Vite client on `http://localhost:5173`)*

---

### Option C: Production Build & Run
To test or deploy the production build:

1. **Build the client:**
   ```bash
   npm run build
   ```
2. **Start the server:**
   ```bash
   npm run server
   ```
3. Open **`http://localhost:3001`** in your browser. (The Fastify backend serves both API endpoints and the compiled React frontend).

---

## 5. Running Tests

To verify that all PSD parsers, HTML/CSS generation, and Playwright headless exports work correctly on the new machine:

```bash
npm test
```

This runs:
- `tests/poc.test.ts` (Core conversion pipeline, schema validation, visual diffing)
- `tests/e2e.test.ts` (Full end-to-end browser journey)

---

## 6. Ports & Network Configuration

| Port | Service | Description |
| :--- | :--- | :--- |
| **`3001`** | Fastify Backend | Handles PSD/SVG/Image uploads, rendering, visual diffing, and export APIs. |
| **`5173`** | Vite Dev Server | Interactive React UI; automatically proxies `/api`, `/assets`, and `/renders` requests to port `3001`. |

### Changing the Backend Port:
You can specify a custom port by setting the `PORT` environment variable:
- **Windows (PowerShell):** `$env:PORT="4000"; npm run dev:server`
- **macOS / Linux:** `PORT=4000 npm run dev:server`

---

## 7. Dependencies Overview

The project relies on the following key packages:

### Backend Engine & Conversion:
- **`fastify`** (`^5.12.5`): High-speed backend web server.
- **`@fastify/multipart`**: Handles large PSD and image uploads up to 100MB.
- **`@fastify/cors`**: Cross-Origin Resource Sharing.
- **`@fastify/static`**: Serves uploaded images and generated renders.
- **`@napi-rs/canvas`** (`^1.0.9`): Precompiled Node.js Canvas implementation for Photoshop rasterization.
- **`sharp`** (`^0.35.5`): High-performance image manipulation (PNG/JPEG/WebP).
- **`ag-psd`** (`^31.0.2`): Modern PSD parser for extracting layers, text styling, and layer hierarchies.
- **`psd`** (`^3.4.0`): Alternative PSD parser used in benchmarks.
- **`playwright`** (`^1.63.0`): Headless Chromium browser for high-fidelity exports to PNG/PDF.
- **`pixelmatch`** & **`pngjs`**: Automated visual pixel-diff comparison.
- **`zod`** (`^4.6.5`): Runtime schema validation for Normalized Design Documents.
- **`tsx`** (`^4.23.15`): TypeScript execution runtime for Node.js ESM.

### Frontend Client:
- **`react`** & **`react-dom`** (`^19.3.0`): User interface components.
- **`vite`** (`^8.3.1`): Next-generation frontend tooling and fast HMR dev server.
- **`lucide-react`**: UI icon set.
- **`concurrently`**: Runs frontend and backend in tandem.

---

## 8. Troubleshooting & Common Issues

### 1. `Executable doesn't exist at ... playwright`
- **Cause:** Chromium browser binary is missing on the new machine.
- **Solution:** Run `npx playwright install chromium`.

### 2. Native module error (`@napi-rs/canvas` or `sharp`)
- **Cause:** `node_modules` was copied directly from another machine or OS architecture.
- **Solution:** 
  ```bash
  # Delete existing node_modules and reinstall
  # Windows:
  Remove-Item -Recurse -Force node_modules
  npm install
  
  # macOS/Linux:
  rm -rf node_modules
  npm install
  ```

### 3. Port `3001` or `5173` already in use (`EADDRINUSE`)
- **Cause:** Another application or background instance is using the port.
- **Solution:**
  - On Windows: Find and terminate the process:
    ```powershell
    Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess | Stop-Process
    ```
  - On macOS/Linux:
    ```bash
    kill -9 $(lsof -t -i:3001)
    ```

### 4. Linux Missing Shared Libraries (`libasound.so`, etc.)
- **Cause:** Minimal Linux distributions lack system libraries needed by Chromium.
- **Solution:** Run:
  ```bash
  npx playwright install-deps chromium
  ```
