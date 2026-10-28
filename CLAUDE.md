# CLAUDE.md — Fourier Borders

Build a website where a user searches for any place (country, state/province, city, town), and the site draws that place's border with Fourier epicycles, starting from 1 term and increasing to the number of terms needed to reach the accuracy target. A slider lets the user scrub through the convergence. The equation below the drawing updates with the slider.

Read this whole file before writing code. If something here turns out to be wrong or infeasible, stop and explain the problem and a proposed alternative rather than silently deviating.

---

## 1. Product spec

### Landing page
- Centered search bar with autocomplete dropdown (keyboard navigable: ↑/↓/Enter/Esc).
- "About" section: short explanation of Fourier series / epicycles, the accuracy metric, data sources and limitations (simplified data, islands filtered, holes ignored in v1).
- Button linking to the GitHub repo (URL in a single config constant).

### Place view (after a selection)
- **Top:** slider, continuous from 1 to N, with labeled snap markers at **1, 3, 10, 50, N**. Play/pause button. Small readout: current term count, current Hausdorff error (as % of the place's size), and "target reached ✓" when at N.
- **Middle:** canvas. Faint "ghost" of the true boundary behind the animation. Epicycles (circles + radius arms) tracing the reconstructed border in real time.
- **Bottom:** equation panel (see §7).
- On load the animation **auto-plays** through 1 → 3 → 10 → 50 → N, dwelling at each stage for one full trace, then stops at N. Grabbing the slider pauses auto-play.
- Shareable URL: `?place=<id>` reloads the same place.

### Out of scope for v1
Satellite imagery or map tiles (licensing, rate limits, adds nothing to the point). Holes/enclaves in polygons. User accounts. A backend server.

---

## 2. Tech stack — hybrid TypeScript + Rust/WebAssembly

The project is split at a clean boundary: **TypeScript owns the browser** (UI, search, network, projection, canvas), **Rust owns the math** (compiled to WebAssembly).

### TypeScript side
- **Vite + TypeScript**, no UI framework (vanilla TS + DOM is enough). If component state gets painful, raise it before adding a framework.
- **Canvas 2D** for rendering (devicePixelRatio-aware).
- **d3-geo** for projections (stays in TS; Rust projection crates don't build cleanly for WASM).
- **KaTeX** for the equation panel.
- **Web Worker** that loads the WASM module, so the UI never blocks.
- **Vitest** for TS unit tests.
- **mapshaper** (Node, build-time only) for data preprocessing.

### Rust side: `crates/fourier-core`
- Compiled with **wasm-pack** (`--target web`) and imported by the worker via `vite-plugin-wasm` (or the plain wasm-pack JS glue).
- Crates: **rustfft** (FFT), **wasm-bindgen** (JS bindings). Use the **geo** crate if it helps (it has a Hausdorff distance implementation), but a hand-written grid-accelerated Hausdorff is fine and easier to test.
- Responsibilities: arc-length resampling, FFT, coefficient sorting, reconstruction, normalized Hausdorff, findN (§5).
- Interface: input is a flat `Float64Array` of projected x,y pairs per ring plus parameters; output is plain typed arrays (coefficients as re/im/k arrays, N, error samples). No complex objects across the JS/WASM boundary.
- Tested with `cargo test` (native, fast) plus one wasm-bindgen-test smoke test.
- Keep the TS↔WASM boundary small and documented in `crates/fourier-core/README.md`.

### Fallback rule
If the WASM toolchain becomes a blocker (build or bundling problems that take more than a short effort to fix), stop and report rather than quietly rewriting the core in TypeScript.

Keep dependencies minimal. No paid APIs.

---

## 3. Data — two tiers

Natural Earth 1:110m is NOT usable: its admin-1 layer only covers US states, and 1:50m only adds Australia, Brazil and Canada. No Natural Earth scale has city boundaries (populated places are points).

### Tier 1: countries + states/provinces → Natural Earth 1:10m (static, bundled)
- Download `ne_10m_admin_0_countries` and `ne_10m_admin_1_states_provinces` in a build script (`scripts/build-data.ts`), not at runtime.
- Preprocess with mapshaper:
  - Convert to GeoJSON, keep only needed attributes (name, alternate names, ISO codes, admin parent, type).
  - Light simplification (e.g. Visvalingam, keep enough detail that coastlines stay recognizable; tune so total output is a reasonable size). The simplified geometry IS the ground truth for accuracy; say so in About.
  - Write **one file per feature**: `public/data/shapes/<id>.json`, so selecting a place loads only that place.
  - Write a **search index**: `public/data/index.json` with `{id, name, altNames, kind: "country"|"admin1", parent, countryCode}` for autocomplete.
- Natural Earth is public domain; still credit it in About.

### Tier 2: cities/towns → OpenStreetMap, on demand
- Autocomplete via **Photon** (`https://photon.komoot.io/api/?q=...`), NOT Nominatim. Nominatim's usage policy explicitly forbids client-side autocomplete.
- After the user picks a Photon result, fetch the polygon **once** from Nominatim's lookup endpoint with `polygon_geojson=1`, using the OSM type+id from the Photon result (e.g. `osm_ids=R12345`). Only relation (`R`) results normally have area boundaries.
- Nominatim rules to respect: max 1 request/second (enforce with a client-side queue), identify the app (Referer is sent by the browser; also pass `email=` param from config), cache results.
- Cache fetched polygons in IndexedDB keyed by OSM id (wrap all storage in try/catch; app must work without it).
- Many towns have only a point in OSM, no boundary. Show a clear "No boundary is mapped for this place" message, not an error.
- Attribution: "© OpenStreetMap contributors (ODbL)" and "Search by Photon / komoot" in the footer of the place view.

### Search behaviour
- Local index first (instant, prefix + simple fuzzy match on name/altNames). Show kind and parent in each suggestion ("Ontario — Province, Canada").
- If the query is ≥3 characters, also query Photon, debounced ~300 ms, with in-flight requests aborted on new input. Filter Photon results to place-like types (city, town, village, district, county, state) and drop anything that duplicates a local-index result.
- Results from local index appear first, then OSM results under a small divider.

---

## 4. Geometry pipeline (runs in the worker)

For a selected feature:

1. **Normalize** to MultiPolygon. Use **outer rings only** in v1 (ignore holes, documented in About).
2. **Antimeridian fix.** Russia, Fiji, the US (Aleutians), Kiribati etc. cross ±180°. Unwrap longitudes per ring (if a step jumps >180°, add/subtract 360°) before projecting. Test this explicitly.
3. **Project** with an equal-area projection centered on the feature (d3 `geoAzimuthalEqualArea` rotated to the feature centroid), so northern places aren't stretched. Work in projected kilometres.
4. **Island filter.** Compute each ring's area. Keep rings with area ≥ 0.5% of the total, cap at the 30 largest, always keep the largest. Record how many were dropped and show it ("+214 small islands not shown").
5. **Orientation.** Make every ring counter-clockwise.
6. **Resample** each ring uniformly by arc length to M points, M a power of two, scaled with perimeter: min 256, max 4096. Uniform resampling is required; raw vertices are unevenly spaced and give a bad transform.

---

## 5. Fourier core (worker)

For each kept ring, treat points as complex numbers z_j = x_j + i·y_j, j = 0..M−1.

- Compute the DFT with an FFT (write a small radix-2 FFT; verify against a naive DFT in tests). Coefficients c_k for k = −M/2 … M/2−1, each with frequency k, amplitude |c_k|, phase arg(c_k).
- The reconstruction is z(t) = Σ c_k · e^{i·k·t}, t ∈ [0, 2π).
- **Term ordering: by amplitude, largest first.** This converges visibly faster than ordering by frequency, and makes the middle of the slider interesting.
- **Term counting:** c_0 (the center) is always included and not counted. "n terms" = c_0 + the n largest-amplitude non-zero-frequency coefficients. So 1 term = one circle.

### Accuracy metric: normalized Hausdorff distance
- For n terms, reconstruct the curve at M sample points.
- Compute the symmetric discrete Hausdorff distance between the reconstruction and the resampled true ring.
- **Normalize by the bounding-box diagonal of the whole place** (all kept rings together), not each ring. This way tiny islands don't demand huge term counts.
- **Target: normalized Hausdorff ≤ 0.001 (0.1%)**. Put this in a config constant.
- **Finding N per ring:** Hausdorff is not strictly monotone in n, so: binary search to find a candidate, then step forward to the smallest n where the error stays under target for that n and the next few values. Cap N at M/2; if the target isn't reached, use the cap and report the achieved error honestly.
- Hausdorff is O(M²) naively; use a uniform grid or k-d tree for nearest-neighbour lookups so the search finishes in well under a second for typical places.
- Each ring gets its own N_i. The place's overall **N = max(N_i)**.

Worker returns, per ring: sorted coefficients (truncated to N_i), N_i, error curve samples for the slider readout, and the resampled true ring for the ghost outline.

---

## 6. Rendering and slider

- Slider value n ∈ [1, N], continuous, on a log-ish scale so 1–50 isn't squeezed into a sliver. Snap markers at 1, 3, 10, 50, N (dedupe if N ≤ 50).
- At slider value n, ring i draws min(n, N_i) terms.
- Canvas: fit all kept rings to the canvas with padding. Draw:
  - Ghost outline of the true rings (low-opacity stroke).
  - The traced reconstruction path.
  - Epicycle circles and arms. Only draw circles for the first ~50 terms of each ring (beyond that they're sub-pixel noise; the path still uses all n terms). For multi-ring places, draw full epicycles for the largest ring and lighter ones for the rest.
- One full trace ≈ 6–8 seconds regardless of n. Changing n restarts the trace cleanly.
- Theme: respect `prefers-color-scheme`; colors as CSS custom properties.
- `prefers-reduced-motion`: skip animation, show the finished reconstruction for the current n.
- Responsive: works at phone width (slider and equation panel stack; no horizontal scroll).

---

## 7. Equation panel

- Always show the general form: z(t) = c₀ + Σₖ cₖ e^{ikt}.
- Below it, the current reconstruction with real numbers: write out c₀ and the first 5 terms in polar form (r·e^{iφ}·e^{ikt}, r in km, φ in radians, 2–3 significant figures), then "+ … (n − 5 more terms)".
- For n ≤ 5, show all terms, no ellipsis.
- "Copy coefficients" button → copies all current terms as JSON (k, re, im, amplitude, phase).
- For multi-ring places, a dropdown chooses which ring's equation to show (default: largest, labeled "Main polygon", others "Island 2", etc.).
- Render with KaTeX; re-render throttled while the slider is dragged.

---

## 8. Project structure (suggested)

```
/scripts/build-data.ts      Natural Earth download + mapshaper preprocessing
/public/data/index.json      search index (generated)
/public/data/shapes/*.json   one file per feature (generated)
/src/main.ts
/src/search/                 local index search, Photon client, Nominatim client + rate-limit queue, cache
/src/geo/                    normalize, antimeridian unwrap, projection, island filter, resample
/crates/fourier-core/        Rust: resample, fft, reconstruct, hausdorff, findN (→ WASM)
/src/fourier/                thin TS wrapper around the WASM module + types
/src/worker.ts               runs geo (TS) then fourier-core (WASM)
/src/render/                 canvas renderer, epicycle animation
/src/ui/                     search bar, slider, equation panel, about, routing
/src/config.ts               all tunables (accuracy target, island threshold, caps, URLs, contact email)
/tests/
```

Generated data can be committed or built in CI; pick one and document it in the README.

---

## 9. Milestones — build in this order, verify each before moving on

0. **Toolchain spike.** Minimal Rust function compiled to WASM, called from a Web Worker in the Vite dev server and in a production build served under a subpath (§11). Prove this works before anything else.
1. **Math core + tests (Rust).** FFT, resampling, reconstruction, Hausdorff, findN, on synthetic shapes, via `cargo test`. No UI.
2. **Data pipeline.** Build script produces index + per-feature files. Check output size and a few shapes by eye.
3. **Renderer + slider** with a hard-coded country. Get the animation, ghost outline, snap markers and auto-play right.
4. **Search UI** over the local index; routing via `?place=`.
5. **OSM tier:** Photon autocomplete, Nominatim polygon fetch, rate-limit queue, cache, "no boundary" state.
6. **Equation panel, About, attribution, theming, reduced motion, mobile layout.**
7. **Deploy to the existing website (§11) and finish the portfolio repo (§12).**

---

## 10. Tests and acceptance checks

Unit tests (math in Rust via `cargo test`; geometry/UI in TS via Vitest):
- FFT matches naive DFT to 1e-9 on random input.
- Reconstruction with all M coefficients reproduces the input ring.
- A circle needs exactly 1 term to hit the target; a square needs many more (sanity check of Gibbs behaviour).
- Hausdorff: known values for simple shape pairs; symmetric.
- Arc-length resampling yields evenly spaced points.
- Antimeridian unwrap: a ring crossing 180° produces a continuous ring with no 360° jumps.
- Island filter keeps the largest ring and respects the cap.

Manual acceptance checks (run each in the browser and look):
- **Canada, Indonesia** — many islands filtered, count of dropped islands shown, still fast.
- **Russia, Fiji** — no antimeridian artifacts (no line across the whole map).
- **Colorado, Wyoming, Egypt** — straight borders converge slowly; visible ringing at corners at low n.
- **Italy** — mainland + Sicily + Sardinia as separate epicycle sets.
- **Lesotho** — renders as its own shape. **South Africa** — renders with outer ring only (documented).
- **A large city with an OSM boundary (e.g. Paris, Chicago)** — Photon suggestion → polygon → animation.
- **A small village with only a point in OSM** — friendly "no boundary" message.
- Network offline during an OSM lookup — graceful error, local places still work.
- Slider at 1 shows a single circle; at N the readout says target reached and error ≤ 0.1%.
- Phone-width layout usable; reduced-motion respected.

---

## 11. Hosting — the owner's existing website

This app will live on the owner's **existing personal website**, not on GitHub Pages. Project name / path: **locationtransform**.

**Ask the owner at the start of the session** (don't guess):
- What the existing site is built with and how it's deployed (static host, Netlify/Vercel, own server, a framework like Next/Astro, etc.).
- Whether this goes on a subpath (e.g. `example.com/locationtransform/`) or a subdomain (e.g. `locationtransform.example.com`).

Requirements regardless of the answer:
- The build output (`dist/`) must be a self-contained static bundle.
- Set Vite `base` from config so it works under a subpath. All asset, data (`/data/...`), worker and `.wasm` URLs must respect `base`; test with a subpath build locally (`vite preview` with base set).
- The host must serve `.wasm` with MIME type `application/wasm`. Check this and document it in the README.
- Data files and the WASM module should be cacheable (hashed filenames where possible).
- Keep deployment separate from the main site's code. Preferred: a GitHub Action in this repo that builds `dist/` and publishes it to wherever the main site expects it. Agree the method with the owner first.
- The GitHub repo button on the landing page and the README both link to the live URL and to each other.

---

## 12. Portfolio-quality repo and README

This is a portfolio project. The repo is part of the deliverable and should look like the work of a careful engineer.

### README.md (write it properly, not as an afterthought)
In this order:
1. **Title + one-line pitch.**
2. **Hero GIF** (≤ 10 MB) of a place converging from 1 term to N. Plus 2–3 still screenshots (e.g. Italy's islands, Colorado's ringing corners, a city). Store in `docs/media/`.
3. **Live demo link** (prominent) and badges: CI status, license, built with Rust + TypeScript.
4. **How it works:** short, readable explanation of Fourier series and epicycles, with the equation rendered in GitHub math (`$$ z(t) = \sum_k c_k e^{ikt} $$`). Explain the pipeline (boundary → projection → resampling → FFT → Hausdorff-guided term count) with a small Mermaid diagram.
5. **Interesting problems solved:** the engineering story, 1–3 sentences each: Nominatim's no-autocomplete policy → Photon; coastline paradox and why the accuracy target is relative to a fixed dataset; normalized Hausdorff vs energy-based accuracy; multi-polygon places; antimeridian crossings; Gibbs ringing on straight borders; the TS/Rust split and why. This section is what reviewers read; make it concrete.
6. **Tech stack** and **architecture** (folder map, TS↔WASM boundary).
7. **Running locally:** prerequisites (Node version, Rust toolchain, wasm-pack), exact commands, how to rebuild data.
8. **Data sources & attribution:** Natural Earth (public domain), OpenStreetMap (ODbL), Photon/komoot.
9. **Known limitations / roadmap:** holes ignored, filtered islands, towns without OSM boundaries.
10. **License** (MIT unless the owner prefers otherwise).

### Repo hygiene
- Clear commit history: small, descriptive commits (conventional-commit style, e.g. `feat(fourier): add normalized hausdorff`). One commit per logical change, not one giant commit.
- GitHub Actions CI: `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `tsc --noEmit`, ESLint + Prettier check, Vitest, and a production build. All must pass on main.
- `LICENSE`, `.gitignore`, `.editorconfig`, and a short `CONTRIBUTING.md` are optional but welcome.
- Code quality: typed everything (no `any`), doc comments on the Rust public API and key TS modules, no dead code or commented-out blocks, no leftover debug logging.
- Suggest a repo description and topics to the owner (e.g. `fourier`, `rust`, `webassembly`, `typescript`, `gis`, `visualization`).

---

## 13. Working rules for this session

- Keep tunables in `config.ts`, never hard-coded in logic.
- Never call Nominatim for autocomplete, and never exceed 1 request/second to it.
- Don't add a backend, map tiles, or paid services without asking.
- When a milestone is done, summarize what works, what doesn't, and anything that deviated from this document.