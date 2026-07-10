# NOR ALNIBRAS Scanner (NorScan)

Point your phone camera at a carton and it reads the label — **QR/barcode, Item No., English + Arabic name, quantity, gross weight, and dimensions** — then saves it to an inventory list you can export to Excel. Works **offline**.

---

## The key idea that makes this accurate

Your carton QR codes **encode the item number** (e.g. `S-1129` → `1001129`, `S-60` → `100060`). This app ships with a **built-in database of your 302 products** (extracted from your 376 photos). So the normal flow is:

**Scan QR → look up the item in the on-board database → show every field instantly, including the Arabic name — 100% offline, no OCR guessing.**

OCR (reading the printed text) is only the **fallback** for a box whose QR is missing, damaged, or not yet in the database. That's what keeps it reliable even on taped, faded, or upside-down labels like the ones in your folder.

---

## What's inside `www/` (the whole app)

| File | Purpose |
|------|---------|
| `index.html` | The entire app — camera, QR scanner, OCR, parser, catalog, history, Excel/CSV export |
| `products.json` | Your 302-product database + a QR→item index (bundled, offline) |
| `manifest.json`, `sw.js` | Make it an installable, offline PWA |
| `icon-192/512.png` | App icons |

Libraries used (all free, all run on-device): **ZXing** (QR/barcode), **Tesseract.js** with English + Arabic (`eng`+`ara`) for OCR, **SheetJS** for Excel export.

---

## Two ways to run it

### A. Try it right now — no build (fastest)
1. Put the `www` folder online any free way (e.g. drag it into **Netlify Drop**, or GitHub Pages). Camera needs **https**, which those give you free.
2. Open the link on your phone, allow the camera.
3. Tap the browser menu → **Add to Home Screen**. It now behaves like an app and works offline after the first load.

> Opening `index.html` straight off the phone's file storage won't get camera access — browsers require https. That's why you host the `www` folder (it's tiny).

### B. Real installable `.apk` — no Android Studio needed
This repo includes a **GitHub Actions** workflow that builds the APK in the cloud.

1. Create a free GitHub account, make a new repository, and upload this whole `NorScan` folder.
2. Go to the repo's **Actions** tab → run **"Build Android APK"** (it also runs automatically on push).
3. When it finishes (~5 min), open the run and download the **`NorScan-debug-apk`** artifact.
4. Copy `app-debug.apk` to your phone and tap to install (enable "install from unknown sources" once).

That workflow runs `npm install` → `npm run bundle` (vendors the libraries and downloads the Arabic/English OCR data so the APK is **fully offline**) → Capacitor → Gradle.

### B-alt. Build the APK on your own PC
```bash
npm install
npm run bundle          # vendors libs + Tesseract data into www/
npx cap add android
npm run apk             # outputs android/app/build/outputs/apk/debug/app-debug.apk
```
Requires Node.js, JDK 17, and the Android SDK installed locally.

---

## Existing products vs. brand-new cartons

**The QR code only carries the item number** — never the Arabic name, quantity, weight, or dimensions. So there are two paths:

- **Product already in the database** → scan QR → instant lookup → every field shown, offline. No OCR needed.
- **Brand-new carton (not in the database)** → the app detects the QR is unknown and **automatically reads the printed label with OCR** to capture the Arabic name, quantity, weight and size straight off the box. It pre-fills a "new product" form (item number already known from the QR); you confirm or fix any field and save. From then on, **that product and its QR are in your database**, so the next time you scan it, it matches instantly like any existing item.

This is how the catalog grows itself: every new box you meet gets captured from its own print once, then recognised forever after.

## How the new-box reader works (accuracy features)

Reading a brand-new box off its print is the hard case, so the OCR path does a lot more than a single snapshot:

- **Hold-steady auto-capture with multi-frame voting.** When you start "Read label", the app watches the live camera, scores each frame for sharpness (focus) and stability (motion), and shows a colour bar — red = move/blurry, amber = steady, green = sharp. It keeps the **sharpest 3 frames**, reads each, and **votes field-by-field** so a one-off misread in any single frame gets outvoted. This is the single biggest accuracy win (dimensions jumped from ~79% to ~95% under noisy conditions). Tap the preview to capture immediately.
- **Torch / flashlight toggle** (when the device supports it) plus continuous auto-focus and 1080p capture — the biggest lever in dim warehouses.
- **Orientation auto-correct.** It checks the frame and, if the template markers (ITEM/QTY/MEAS…) look weak, retries at 180°/90°/270° and keeps the best — so **upside-down and sideways boxes still read**.
- **Adaptive thresholding (Sauvola).** Instead of one brightness cut-off, it thresholds each small region on its own. That handles **glare from clear tape, shadows, and uneven lighting** far better.
- **Auto-invert for Arabic bands.** The Arabic name is usually white text on a black bar. The app detects that and inverts it so the OCR sees dark-on-light, which is what it's trained on.
- **Two-pass OCR.** A binarized, upscaled pass reads the English fields and numbers; a separate gentle-grayscale pass (cropped to the band above "ITEM") reads the **Arabic name** — each image tuned for its job.
- **QR cross-check + prefix-agnostic matching.** The QR gives the true item number, so OCR slips like `5‑1129`→`S‑1129` or `6O`→`60` get corrected. The app tries the number against every prefix in your catalog, so a box whose printed prefix is smudged still resolves to the right item — even non-`S` items like `BL‑1341` or `X‑2` (96% of them, up from ~0%). It never fabricates an item number if a real catalog match exists.
- **Ambiguous-code guard.** A few of your QR codes are shared by two products (e.g. `100002` → `S‑2` and `X‑2`); scanning one shows a **chooser** instead of silently picking the wrong twin.
- **Confidence flags.** Anything the app isn't sure about (or couldn't read) is highlighted **amber** in the form with a note, and the raw OCR text is one tap away — so you verify a couple of fields instead of retyping everything. "Re-scan label" retries instantly.

A new-box read takes a few seconds (it's doing several passes on-device). Existing boxes stay instant via the QR path.

## How to use the app

- **Scan tab** — tap *Start camera*, point at the QR. It matches instantly and shows the product card. Tap *Save to inventory*.
  For a box with no readable QR, tap **Read label (OCR)** — it captures the frame, reads the text, extracts Item No./Qty/GW/Meas + the Arabic name, and matches it to the database (or lets you save it as a new product).
- **History tab** — every saved scan, with running totals; **Export Excel** or **CSV**.
- **Catalog tab** — search all 302 products by item number, English, or Arabic.

---

## Honest limits

- **QR path**: rock-solid and instant, even on worn boxes, as long as the QR square is visible.
- **OCR path**: English fields and numbers read well; the **Arabic** name via on-device OCR is decent but not perfect on damaged/stylised labels (no on-device engine is). Because the QR usually carries the item number, you rarely need OCR — and when you do, you can correct a field before saving.
- On-device Arabic OCR is the main reason this is built on Tesseract rather than Google ML Kit — **ML Kit's on-device text recognition does not support Arabic**; Tesseract does.

---

## Why this stack (vs React Native / Flutter)

A web app wrapped with **Capacitor** was chosen because:
- It reuses the **exact database and QR logic** already built from your photos.
- One small codebase becomes both a **phone-browser PWA** (try instantly) **and** a real **APK**.
- Tesseract.js gives **offline Arabic OCR**, which the native ML Kit path can't.
- You can rebuild the APK for free in the cloud, no developer machine required.

Flutter or React Native would give slightly faster native OCR, but neither solves the Arabic-offline problem better, and both are heavier to build and maintain for a single-screen scanner. If you later want a Play Store release or barcode-heavy speed, the same web UI can be dropped onto Flutter with `flutter_tesseract_ocr` + `mobile_scanner`.

---
*Built for NOR ALNIBRAS. Database generated 2026-07-10 from 376 carton photos → 302 unique products.*
