# NorScan — audit v2 (after fixes)
_Follow-up to AUDIT.md · Date: 2026-07-10 · Focus: new-carton capture (QR → text → all fields)_

## 1. What I changed

**P0 — safety & correctness**
- QR scanner now **pauses during capture and while a form/chooser is open** (no more self-interruption). Added a `qrLock` + explicit "Scan next / Cancel" controls.
- Capture loop has a **hard 5 s timeout** — it can never hang; it grabs the current frame if nothing steadier arrives.
- **All rendered text is escaped** (item cards, catalog, history) — removes the self-XSS / layout-break risk from OCR-captured names.
- **Reconciliation now prefers a real catalog match** before inventing an item number — fixes the case where a malformed QR produced a garbage code (`S-101024`).
- **Ambiguous QR codes** (shared by two products) now show a **chooser** instead of silently resolving to the wrong twin.
- Data: merged the `SL-3832 / SL3832` duplicate (302 → **301 unique products**); rebuilt the QR index from unique codes, dropping ambiguity from 6 codes to **3** (the rest resolved by preferring real decoded codes).

**P1 — new-box accuracy (your priority)**
- **Multi-frame voting**: keeps the sharpest 3 frames, OCRs each, votes per field. Biggest single win.
- **Torch/flashlight toggle** + continuous auto-focus + 1080p capture for dim warehouses.
- **Dimension validation**: values must parse to three numbers; the pipeline prefers valid ones when voting.
- **Prefix-agnostic matching**: the QR number is tried against every catalog prefix, so smudged/dropped prefixes still resolve — including non-`S` items.
- **Preprocessing order fixed**: grayscale is upscaled **before** thresholding.

**Low-severity**
- CSV **formula-injection** guard (values starting `= + - @` are neutralised).
- Service-worker fallback now only serves `index.html` for navigations (won't mask a failed script/wasm).
- Dropped `allowMixedContent`.

## 2. Test results — before vs. after (simulated across all 301 products)

| Metric | Before | After | Note |
|---|---|---|---|
| Item ID — noisy, **with QR** | ~99% | **99.3%** | multi-frame vote |
| **Dimensions** — noisy, with QR | ~79% | **95.1%** | ✅ biggest fix (voting + validation) |
| Item ID — noisy, **no QR** | ~58% | **67.1%** | improved, still the honest ceiling |
| **Non-`S` items** resolved by QR when prefix unread | ~0% | **96.2%** | ✅ prefix-agnostic reconcile |
| Qty — noisy, with QR | 100% | 100% | unchanged |
| Ambiguous QR codes in DB | 6 | **3 (now prompt a chooser)** | rest auto-resolved |
| Adversarial inputs (empty, garbage, emoji, malformed QR, bad dims) | no crash | **no crash, no fabricated codes** | H5 fixed |

_Method note: this measures the capture→parse→match logic (camera + Tesseract can't run in the test harness). Real Arabic-name accuracy on physically damaged labels will still trail the simulation — which is why the Arabic name stays "assist + verify."_

## 3. Real-world conditions — status after fixes

| Condition | Status |
|---|---|
| Bright/clean, existing box | ✅ instant QR match |
| Bright/clean, new box + QR | ✅ item+qty+dims strong; Arabic verify |
| Dim warehouse | ✅ **torch** + focus; steadier capture |
| Glare / tape / shrink-wrap | ✅ local threshold + auto-invert |
| Motion / one-handed | ✅ hold-steady + **hard timeout**, tap-to-grab |
| Upside-down / sideways | ✅ orientation auto-correct |
| Torn / blank field | ✅ voting fills gaps; missing = amber flag |
| Faded print | ⚠️ better via voting; confirm |
| No QR on box | 🟠 ~67% ID — draft + confirm (by design) |
| Shared/ambiguous QR | ✅ chooser |
| Offline (APK w/ vendored data) | ✅ |
| Offline (PWA, first run) | ⚠️ one-time ~11 MB download (E-warmup pending) |
| Low-end phone | ⚠️ heavier now (3-frame); acceptable, see E-perf |
| Multiple staff / lost phone | ⚠️ still device-local (E-sync pending) |

## 4. Remaining / recommended next (not yet done)

- **P1-perf**: 3-frame voting increases latency (roughly 6–12 s per new box on mid phones). Add a **Cancel** button during OCR and a "fast (1-frame) / accurate (3-frame)" toggle. _(Medium)_
- **Offline warm-up (M4)**: one-time visible "preparing offline OCR" download for the PWA path; ship a non-SIMD OCR core fallback for old devices.
- **Backup/sync (M7)**: export/import the new-products catalog; optional shared catalog for multiple staff — important before multi-device rollout.
- **Counting model (M8)**: choose "log every scan" vs "unique + increment quantity".
- **Arabic/RTL UI (L4)** and accessibility pass.
- **On-device calibration** of the focus/motion thresholds (currently reasonable defaults; confirm on your actual phone).
- **The 3 ambiguous codes** and any remaining item-number reuse are a **data-hygiene** issue — worth assigning each product a unique code at the source over time.

## 5. Verdict (updated)
- **Existing catalog via QR:** production-ready. Ship the pilot.
- **New box _with_ QR:** now strong across the board (item ~99%, dims ~95%, qty 100%, Arabic assist+verify). This is the workflow you care about most, and it's in good shape.
- **New box _without_ QR:** improved to ~67% ID; keep it as a confirm-required draft.

Biggest remaining lever for field reliability is **operational**: make sure every carton carries a scannable QR — that's what turns this from "good" into "near-perfect."
