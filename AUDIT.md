# NorScan — CTO audit & test report
_Reviewer: acting CTO / senior engineer · Date: 2026-07-10 · Build: www/index.html (single-file PWA) + Capacitor APK pipeline_

## 1. Verdict (ship-readiness by path)

| Path | Reliability | Verdict |
|---|---|---|
| **Existing box via QR** (your 302 products) | ~99%, instant, fully offline | ✅ **Production-ready** |
| **New box _with_ a readable QR** | Item ID ~99%, qty ~100%, **dims ~76%**, Arabic name = assist+verify | 🟢 **Usable** with the built-in confirm step |
| **New box _without_ a QR** | Item ID **~58%** under realistic OCR noise | 🟠 **Best-effort only** — always human-confirm |

Bottom line: the architecture is sound and the QR-first strategy is the right call. The app is safe to pilot now for your existing catalog. The "read any brand-new box" goal works well **when a QR is present**; without a QR it should be treated as a smart draft that a person confirms — which the UI already enforces.

---

## 2. Automated test results

Method: the real parser/matcher logic was run against a simulated label for **every one of the 302 products** (Arabic name + ITEM/QTY/G.W./MEAS lines), in four conditions. "Noisy" injects real OCR confusions (`0↔O`, `1↔l`, `S↔5`), randomly drops the G.W./MEAS line, and adds boilerplate like "HANDLE WITH CARE". 3 noisy trials per product.

| Condition | Item match | Qty | G.W. | Dimensions |
|---|---|---|---|---|
| Clean label, **no QR** | 98.0% | 100% | 100% | 100% |
| Clean label, **with QR** | 99.0% | — | — | — |
| **Noisy OCR, with QR** | **99.0%** | 100% | — | **76.4%** |
| **Noisy OCR, no QR** | **57.7%** | — | — | — |

Adversarial inputs (empty, pure garbage, emoji, two item numbers, huge qty, malformed QR, comma-decimals): **no crashes**, all produced sane output or a clean "NEW" fallback.

**Key takeaways**
- The **QR is what makes this reliable** — it lifts noisy item-ID from 58% → 99%.
- **Dimensions are the weakest field** (76% under noise): many digits + `X` separators compound errors.
- Qty and G.W. are robust because they're short and single-valued.

> Caveat: camera, image-preprocessing and the Tesseract OCR engine can't run in this test harness, so these numbers measure the **parsing/matching layer**. Real end-to-end Arabic-name accuracy on damaged labels will be lower than the simulation — which is exactly why the design treats the Arabic name as "assist + verify," not authoritative.

---

## 3. Data / key-integrity audit (found on your real 302-item DB)

- **6 QR codes map to two different items** — e.g. `100002` → `S-2` **and** `X-2`; `100124` → `S-373` **and** `S-124`; `100645` → `S-644`/`S-645`; `100818` → `S-818`/`S-818 C`; `1003832` → `SL-3832`/`SL3832`. Cause: the synthesized `100+number` code isn't guaranteed unique, plus source item-number reuse/variants. **Risk: a scan resolves to the wrong twin.**
- **1 near-duplicate product**: `SL-3832` vs `SL3832` (same item, two OCR spellings) — should be merged.
- **27 of 302 items (~9%) are not `S-`-prefixed** (`SL-`, `BL-`, `X-`, `NBS-`, `Sk-`, plain numeric like `5110`, `1081`, `3643`). The new-box fallback that guesses an `S-` prefix from the QR would mislabel these.

---

## 4. Findings by severity (code review)

### Critical
- **C1 — No-QR new boxes are unreliable (~58% ID).** The core "read any new box" goal degrades badly without a QR. _Action:_ keep QR as the primary key; when absent, present OCR as a draft and require confirmation (already done) — and add multi-frame voting (see E2) to push this up.
- **C2 — QR scanner runs concurrently with OCR capture.** While auto-capturing/OCR-ing an unknown box, the live ZXing loop re-reads the same QR every 2.5 s and can **restart the capture or re-open the form while the user is editing it.** _Fix:_ pause QR decoding during capture and while the "new product" form is open. _(Quick, safe.)_
- **C3 — Capture loop can hang in very dark/shaky conditions.** The 7 s timeout only fires if a "best frame" was already stored; if the frame never gets steady/sharp enough, none is stored and the loop spins. _Fix:_ absolute 5 s fallback that grabs the current frame regardless. _(Quick, safe.)_

### High
- **H1 — Dimensions accuracy (~76%).** _Fix:_ OCR the MEAS value with a digit+`X` whitelist, validate it parses to exactly three numbers, and vote across frames; otherwise flag amber (already flaggable).
- **H2 — QR-code collisions (6).** _Fix:_ prefer the **actually decoded** QR string over the synthesized one; when a code is known-ambiguous, show both candidates and ask. Merge `SL-3832`/`SL3832`.
- **H3 — Prefix guessing hard-codes `S-`.** _Fix:_ take the prefix from OCR even at low confidence; if unknown, show the number and let the user pick the prefix — don't assume `S-`.
- **H4 — Self-XSS / render breakage.** `showProduct`, `renderCatalog`, `refreshHistory` inject DB/user text into `innerHTML` **without escaping** (only `showUnknown` escapes). An OCR-captured name containing `<` or `&` can break layout or inject markup. _Fix:_ reuse the existing `esc()` helper everywhere. _(Quick, safe.)_
- **H5 — Reconciliation can fabricate an item number** when the QR is malformed/variant (adversarial test produced `S-101024`). _Fix:_ prefer whichever candidate (OCR item vs QR-derived) actually exists in the DB before fabricating.

### Medium
- **M1 — Capture thresholds are uncalibrated magic numbers** (`focus>900`, `motion<9`, `/22`). They depend on resolution/lighting and may trigger too early/late on real phones. _Fix:_ normalize focus by frame size, use relative improvement, calibrate on a device, expose a sensitivity slider.
- **M2 — Latency:** up to ~6 OCR passes/new box → **8–20 s on mid/low phones**, no Cancel, coarse progress. _Fix:_ use OSD or a single orientation pass, add Cancel, show stage labels.
- **M3 — Preprocessing order:** upscaling **after** binarization adds no real detail; upscale the grayscale **before** Sauvola. Global auto-invert for the Arabic band can misfire on mixed crops — decide per-band (Otsu bimodality).
- **M4 — Offline first-run:** if the OCR data isn't vendored into the build, the first new-box scan silently downloads ~11 MB (eng+ara) + core wasm. _Fix:_ a one-time visible "preparing offline OCR…" warm-up; ship a non-SIMD core fallback for old devices.
- **M5 — No torch / low-light control.** Warehouses are dim → blur. _Fix:_ torch toggle, continuous-focus, higher-res video constraints.
- **M6 — Service-worker fallback** returns `index.html` for **any** failed request (including scripts/wasm), which can serve HTML as JS. _Fix:_ only fall back to `index.html` for navigation requests.
- **M7 — Data durability:** new products live only in device IndexedDB — no backup/sync; clearing browser data or losing the phone loses them, and multiple staff each keep separate catalogs. _Fix:_ export/import the new-products file; optional shared/cloud catalog.
- **M8 — No counting model:** scanning the same carton twice makes two rows. _Fix:_ modes — "log every scan" vs "unique items + increment quantity" — with a duplicate warning.

### Low
- **L1** `fixNum` turns `1,500` → `1.500` → `parseInt` = 1 in totals (thousands separators). Harmless on current data.
- **L2** CSV/Excel **formula injection** not neutralized (values starting `= + - @`). Low risk here.
- **L3** `allowMixedContent: true` in Capacitor config is unnecessary — tighten.
- **L4** UI is English-only for an Arabic user — add an Arabic/RTL option.
- **L5** No app version stamp or opt-in error logging to diagnose field issues.
- **L6** Accessibility: tap-target sizes, contrast, and screen-reader labels are minimal.
- **L7** The APK workflow's artifact path is hard-coded; if the Gradle output path changes with a future AGP version, the upload step fails — add a `find` fallback.

---

## 5. Real-world "life circumstances" matrix

| Condition | Handled today | Gap / recommendation |
|---|---|---|
| Bright, flat, clean label | ✅ QR instant; OCR strong | — |
| Dim warehouse / shadows | ⚠️ Sauvola helps; blur likely | **Torch toggle (M5)**, warn on low sharpness |
| Glare from clear tape / shrink-wrap | ✅ Local threshold handles most | Add glare hint; ask to tilt |
| Motion / one-handed / fast pace | ✅ Hold-steady auto-capture | **C3 hard timeout**; tap-to-grab exists |
| Upside-down / sideways carton | ✅ Orientation auto-correct | Speed it up (M2) |
| Torn / taped-over field | ✅ Field flagged amber, QR still IDs | Multi-frame vote (E2) |
| Faded / worn print | ⚠️ Partial | Vote across frames; manual edit |
| Curved cardboard (perspective) | ⚠️ Not corrected | Optional de-warp (E-later) |
| Handwritten correction (e.g. X-4→X-3) | ⚠️ Reads printed value | Always confirm; QR authoritative |
| No QR on the box | 🟠 ~58% ID | Position as draft; **require confirm** (done) |
| No internet, phone offline | ✅ if data vendored in APK | **M4 warm-up** for PWA path |
| Low-end / old phone, 2 GB RAM | ⚠️ Two workers + wasm heavy | Lazy-load ara; non-SIMD core (M4) |
| Multiple staff, several phones | ⚠️ Separate local catalogs | **Shared catalog / sync (M7)** |
| Lost/reset phone | ⚠️ New products lost | **Export/import or cloud backup (M7)** |
| Same carton counted twice | ⚠️ Duplicate rows | **Counting modes (M8)** |
| Battery / long sessions | ✅ camera stops on tab away | Add idle auto-pause |

---

## 6. Enhancement roadmap (prioritized)

**P0 — reliability & safety (quick, low-risk; I can apply now)**
- E-C2 pause QR scanning during capture / while the form is open.
- E-C3 absolute capture timeout (never hang).
- E-H4 escape all interpolated text (kill self-XSS/breakage).
- E-H2 prefer decoded QR over synthesized; merge `SL-3832`/`SL3832`; flag the 6 ambiguous codes.
- E-H5 prefer a DB-existing candidate before fabricating an item number.

**P1 — new-box accuracy (the main goal)**
- E1 torch + continuous-focus + higher-res capture (biggest real-world accuracy lever).
- E2 multi-frame capture & **per-field voting** across 3 best frames (raises dims + Arabic).
- E3 dims validated to 3 numbers, digit-whitelisted MEAS pass.
- E4 smarter prefix inference (H3); confirm-before-save stays.
- E5 preprocessing order fix + per-band Otsu invert (M3).

**P2 — product & operations**
- E6 export/import new-products catalog; optional shared cloud catalog + multi-device sync.
- E7 counting modes + on-hand tallies; per-scan quantity.
- E8 Arabic/RTL UI; larger tap targets; accessibility pass.
- E9 one-time offline warm-up + non-SIMD OCR fallback; Cancel button; stage progress.
- E10 app version stamp + opt-in crash/OCR-failure log to improve the parser over time.

---

## 7. Security & privacy
- **Good:** fully on-device, no data leaves the phone; camera used only while active; no accounts.
- **To tighten:** escape rendered text (H4); neutralize CSV formula injection (L2); drop `allowMixedContent` (L3); scope the service-worker fallback (M6).

---

## 8. What I'd do next (recommended order)
1. Apply the **P0** fixes (½ day, low risk) — makes the current build robust.
2. Ship a **pilot** for the existing catalog (QR path is ready).
3. Add **torch + multi-frame voting** (P1) — the two changes that most improve real new-box reads.
4. Decide on **shared catalog/backup** (M7) before rolling out to multiple staff.
