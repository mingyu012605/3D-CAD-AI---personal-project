# Phase 1 Refactor Design — Code Structure Cleanup

**Date:** 2026-05-01
**Project:** AI VR CAD Editor (3D-CAD-AI personal project)
**Scope:** Phase 1 only — file organization and maintainability. No new features, no UI changes.
**Approach chosen:** ES Modules with shared `state.js` object (no bundler)

---

## 1. Problem Statement

`index.html` is a 482KB / ~10,400-line file containing four distinct layers all tangled together:

| Layer | Approx. lines |
|---|---|
| HTML structure (upload page, editor page) | ~120 |
| CSS styles (including commented-out blocks) | ~700 |
| JavaScript — core logic | ~7,000 |
| JavaScript — dead/debug code | ~2,600 |

This makes the app:
- Unsafe to change (any edit risks breaking unrelated things)
- Hard to navigate (functions are scattered without grouping)
- Impossible to test in isolation
- Difficult to migrate to a bundler later

**Phase 1 goal:** Split `index.html` into named modules with clear responsibilities.
The app must behave identically before and after every step.

---

## 2. Constraints (Non-Negotiable)

1. **No new features.** Phase 1 is structural cleanup only.
2. **No UI redesign.** HTML structure and CSS are preserved verbatim.
3. **No new dependencies.** No npm packages added to the frontend.
4. **No build tool.** No Vite, Webpack, Rollup, or any bundler.
5. **No framework.** No React, Vue, Svelte, or TypeScript.
6. **Three.js stays on CDN.** Do not change or remove the five CDN `<script>` tags.
7. **ES modules only for our own files.** Three.js and its addons stay as global CDN scripts and are accessed via `window.THREE`, `window.THREE.OrbitControls`, etc.

---

## 3. Chosen Approach: ES Modules + Shared State Object

**Why this approach:**
- The project already uses an import map for Three.js, so ES modules are already supported.
- ES `import`/`export` with relative paths works in all modern browsers without a build step.
- A shared `state.js` plain object solves module-to-module state sharing cleanly.
- This is the direct path to Vite later — adding Vite will require zero structural changes beyond replacing CDN tags with npm imports.

**How it works:**
- `index.html` loads one entry point: `<script type="module" src="js/main.js">`.
- All other `.js` files use `import`/`export` with relative paths (`./state.js`, `./utils.js`, etc.).
- Shared mutable state (scene, camera, loadedModels, etc.) lives as properties of a single plain object exported from `js/state.js`.
- Functions still needed by HTML `onclick` attributes are re-exposed on `window` in `main.js` only.

---

## 4. Target File Structure

```
project/
├── index.html                   (HTML structure + CDN scripts only; no <style>, no <script> logic)
├── css/
│   └── styles.css               (extracted verbatim from <style> block — zero style changes)
├── js/
│   ├── main.js                  (entry point — imports all modules, window.onload bootstrap)
│   ├── state.js                 (single shared mutable state object)
│   ├── utils.js                 (addMessageToLog, indexScene, findObjectsByClass, makeTextSprite)
│   ├── scene.js                 (initScene, renderer, camera, lights, grid, animate loop, viewAxes)
│   ├── selection.js             (raycasting, selectObject, clearSelection, material highlights)
│   ├── transform.js             (transformControls setup, setTransformMode, mode helpers)
│   ├── primitives.js            (createPrimitive — all geometry types)
│   ├── loader.js                (GLTFLoader, drag-drop, fileInput, random models, validateFile)
│   ├── history.js               (undoStack, redoStack, undo, redo, state save/restore)
│   ├── ai.js                    (sendAICommand, handleAIResponse, action dispatcher, disambiguation)
│   ├── voice.js                 (SpeechRecognition, speakResponse, mic button toggle)
│   ├── faceEdit.js              (faceEditState, buildFaceGroups, enter/exit, extrude UI)
│   ├── navigation.js            (goToEditor, goBack, page transitions)
│   └── ui.js                    (all remaining DOM event listeners, tabs, keyboard shortcuts)
├── legacy/
│   └── main.js                  (old v3 OpenAI backend — moved here, not deleted immediately)
├── server.js                    (unchanged)
└── package.json                 (unchanged)
```

---

## 5. The `state.js` Object

All shared mutable state is properties of one exported plain object. Any module that needs to read or write state imports this object and accesses properties directly.

```js
// js/state.js
export const state = {
  // Three.js core
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  transformControls: null,

  // Scene content
  loadedModels: [],

  // Selection
  selectedObject: null,
  currentlySelectedObjectsForEditing: [],
  originalMaterialProperties: new Map(),
  allHighlightsOriginalMaterials: new Map(),

  // Raycasting
  raycaster: null,
  mouse: null,

  // Grid
  currentGridHelper: null,
  currentGridLabels: [],

  // View axes helper
  viewAxesScene: null,
  viewAxesCamera: null,
  viewAxesRenderer: null,
  viewAxesHelper: null,
  viewAxesSceneRendered: false,

  // Undo/Redo
  undoStack: [],
  redoStack: [],
  currentUndoGroup: null,

  // Face editing
  faceEditState: {
    targetMesh: null,
    groups: [],
    selectedGroupId: null,
    isActive: false,
    multiSelect: false,
    selectedFaceIds: new Set(),
  },

  // Extrude UI
  extrudeUI: {
    active: false,
    faceIds: [],
    targetMesh: null,
    arrow: null,
    previewMeshes: [],
    depth: 0,
    drag: { on: false, startPt: null, plane: null },
  },

  // Voice / AI
  recognition: null,
  synth: null,
  isVoiceAssistActive: false,
  pendingDisambiguation: null,

  // File upload
  uploadedFile: null,
  droppedFileBlobs: new Map(),

  // Debug sphere (raycast visualizer)
  raycastDebugSphere: null,
};
```

**Usage in any module:**
```js
import { state } from './state.js';
state.scene.add(mesh);         // write
const objs = state.loadedModels; // read
```

---

## 6. Module Responsibilities and Dependency Map

| Module | Single responsibility | Imports from |
|---|---|---|
| `state.js` | Shared mutable state container | nothing |
| `utils.js` | DOM helpers, scene indexing, text sprites | `state` |
| `scene.js` | Three.js scene/renderer/camera/lights/grid/viewAxes/animate | `state`, `utils` |
| `selection.js` | Raycasting, object selection, material highlights, multi-select | `state`, `utils` |
| `transform.js` | TransformControls setup, mode switching (translate/rotate/scale) | `state`, `utils` |
| `primitives.js` | `createPrimitive` geometry factory | `state`, `utils`, `history` |
| `loader.js` | GLTF file loading, validateFile, loadModel, loadModelFromURL | `state`, `utils`, `scene` |
| `history.js` | Undo/redo stacks, state snapshot, save/restore | `state`, `utils`, `selection` |
| `ai.js` | OpenAI API calls, action dispatcher, NL response handler | `state`, `utils`, `selection`, `transform`, `primitives`, `history`, `scene`, `voice` |
| `voice.js` | SpeechRecognition setup, `speakResponse`, mic button toggle | `state`, `utils` |
| `faceEdit.js` | Face group detection, face editing mode, extrude UI | `state`, `utils`, `transform` |
| `navigation.js` | Page transitions (upload ↔ editor), goToEditor, goBack | `state`, `utils`, `scene` |
| `ui.js` | All DOM event listeners, drop zone, tab system, keyboard shortcuts, color picker — orchestrates loader + navigation together | `state`, `utils`, all functional modules |
| `main.js` | Entry point: imports all modules, calls init functions, exposes window globals | everything |

**No circular dependencies** in this graph. Two specific circulars from the original design were eliminated:

- **`ai.js` ↔ `voice.js` eliminated:** `voice.js` exports `speakResponse` and sets up recognition, but does NOT import from `ai.js`. The wiring "when recognition fires → call sendAICommand" is done in `ui.js`, which imports both modules. `ai.js` imports `speakResponse` from `voice.js` (one direction only).

- **`loader.js` ↔ `navigation.js` eliminated:** `loader.js` exposes `loadModel`/`loadModelFromURL` without calling `goToEditor`. `navigation.js` exposes `goToEditor`/`goBack` without calling `loadModel`. `ui.js` calls both in sequence (e.g., on drop: `loadModel(file)` then `goToEditor()`).

`state.js` is the only shared root with no upstream imports.

---

## 7. `window` Globals for HTML onclick Attributes

Some functions are called directly from `onclick` attributes in the HTML:

```html
<button onclick="window.goBack()">...</button>
```

During Phase 1, these are re-exposed on `window` in `main.js`:

```js
// js/main.js — temporary window exposure for HTML onclick compatibility
window.goBack = goBack;
window.removeObject = removeObject;
window.resetView = resetView;
window.showDesignInfo = showDesignInfo;
window.selectPartByName = selectPartByName;
window.setTransformMode = setTransformMode;
window.listParts = listParts;
window.saveModel = saveModel;
window.highlightAllModels = highlightAllModels;
window.clearAllHighlights = clearAllHighlights;
window.duplicateSelectedObject = duplicateSelectedObject;
window.undo = undo;
window.redo = redo;
window.createPrimitive = createPrimitive;
window.selectObject = selectObject;
window.clearSelection = clearSelection;
```

**Rule:** Expose the minimum needed. The final goal is fewer globals, but do not break buttons during Phase 1. Migrating onclick attributes to proper `addEventListener` calls is a Phase 2 concern.

---

## 8. Dead Code to Remove

The following are confirmed dead code — they exist only for browser console debugging during development. They are not called from any HTML, event listener, or functional code path.

| Symbol | Reason it is dead |
|---|---|
| `window.fixMyCode` | Console debugging utility, not wired to UI |
| `window.testCreateCube` | Console test |
| `window.testAllShapes` | Console test |
| `window.quickFix` | Console patch utility |
| `window.testScaling` | Console test |
| `window.testAllShapesScaling` | Console test |
| `window.fixScaling` | Console patch utility |
| `window.testFixedFeatures` | Console test |
| `window.testGroupMovement` | Console test |
| `window.testDuplication` | Console test |
| `window.simpleDuplicate` | Console utility, superseded by `duplicateSelectedObject` |
| `window.duplicateAll` | Console utility |
| `window.duplicateNow` | Console utility |
| `window.duplicateEverything` | Console utility |
| `window.testGroupDuplication` | Console test |
| `window.testButtonClicks` | Console test |
| `window.forceCreateEmpty` | Console patch |
| `setTranslateMode` (first definition ~line 1253) | Duplicate — simple version superseded by multi-select-aware version |
| `setRotateMode` (first definition ~line 1261) | Duplicate — same reason |
| `window.faceMode` alias | Redundant alias for `faceEditState`, not used in real code paths |
| Root `main.js` | Old OpenAI v3 backend, replaced by `server.js`. Never called. |

**Safety rule:** Move root `main.js` to `legacy/main.js` before deletion. Remove the console test functions only after confirming the app opens and all three upload page buttons work.

---

## 9. Duplicate Functions to Resolve

`setTranslateMode`, `setRotateMode`, and `setScaleMode` are each defined **twice** in the current file:

- First definitions (~lines 1253–1338): Simple one-liners that just call `transformControls.setMode(...)`.
- Second definitions (~lines 1321–1338): Multi-select-aware versions that check `currentlySelectedObjectsForEditing.length`.

**Resolution:** Keep the second (multi-select-aware) definitions. Delete the first ones.

---

## 10. Safety Rules

### Rule 1 — No Permanent Deletions Without Confirmation

- Move root `main.js` to `legacy/main.js` first. Delete only after confirming `server.js` handles all AI requests correctly.
- Remove dead `window.testXxx` functions only after the app opens and all buttons work in the browser.
- If unsure whether a function is dead, search the entire file for its name before removing.

### Rule 2 — Each Step Must Be Independently Testable

Every extraction step ends with a working app. The browser test checklist for each step is:

**Minimum smoke test (all steps):**
1. Open `index.html` in browser — page loads without console errors
2. Upload page shows three buttons: "Create Empty Model", "Edit Existing Model", "Load Random Model"
3. Click "Create Empty Model" → editor opens
4. Type "create a cube" in AI chat → cube appears in viewport
5. Click undo → cube disappears
6. Click redo → cube reappears

**Extended test (after scene.js, selection.js, transform.js extractions):**
7. Click an object → it highlights (selection works)
8. Drag transform handles → object moves (transform controls work)
9. Press G/R/S → mode switches (keyboard shortcuts work)

**Extended test (after loader.js extraction):**
10. Click "Load Random Model" → random GLTF loads in viewport

**Extended test (after faceEdit.js extraction):**
11. Select an object, double-click → face edit mode activates
12. Press Q → face edit mode exits

### Rule 3 — Preserve All Existing Behavior

The following must work identically after every step:
- Upload page → editor page navigation
- GLTF file drag-drop and file picker
- Random model loading
- Primitive creation (cube, sphere, cylinder, cone, pyramid, torus, plane)
- Object selection via click
- Transform controls (translate, rotate, scale)
- Multi-object selection
- Undo / Redo (Ctrl+Z / Ctrl+Y)
- AI chat commands (text and voice)
- Face editing mode and extrude
- Color picker
- View axes helper
- Back to upload navigation

### Rule 4 — HTML onclick Attribute Safety

Before removing any `window.xxx` assignment, verify the function name does not appear in any `onclick="..."` attribute or inline event handler in `index.html`. The `grep` pattern to check: `onclick.*functionName`.

Functions with confirmed HTML onclick usage that must stay on `window` throughout Phase 1:
- `window.goBack` (used in `onclick="window.goBack()"`)
- `window.cancelExtrude` (used in extrude panel button)
- `window.confirmExtrude` (used in extrude panel button)
- `window.updateExtrudeDistance` (used in extrude panel input)
- `window.handleExtrudeKeydown` (used in extrude panel input)

### Rule 5 — Three.js CDN Setup Unchanged

- Do not remove or modify the five CDN `<script>` tags.
- The existing `<script type="importmap">` block in `index.html` **must be removed** in the final state — it is redundant once we stop using ES module imports for Three.js. Removing it also avoids browser warnings about unused import maps.
- Do not add a new import map for Three.js.
- All Three.js references in module files use the global `THREE` (e.g., `new THREE.Scene()`).
- Three.js CDN scripts load before `<script type="module" src="js/main.js">`, so `THREE` is available on `window` when modules execute.

### Rule 6 — Git Checkpoints

Commit after each successfully tested extraction step. Suggested commit message format:
```
refactor: extract [module name] into js/[filename].js
```

If an extraction step breaks the app, rollback with:
```
git checkout index.html
```
(or `git checkout -- .` if multiple files are affected)
Then re-approach the step more carefully — typically a missing import or a function that was called before its module loaded.

---

## 11. `index.html` Before and After

**Before:** 482KB, contains HTML + `<style>` block + `<script>` block with all logic.

**After:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI VR CAD Editor</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <!-- ALL HTML STRUCTURE UNCHANGED -->

  <!-- Three.js CDN (unchanged — stays global) -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/webxr/VRButton.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/TransformControls.js"></script>

  <!-- Single entry point for all our code -->
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

Target `index.html` size: ~5KB (HTML structure only).

---

## 12. What This Phase Does NOT Do

- Does not add features
- Does not change any UI visuals
- Does not change CSS values
- Does not change Three.js version
- Does not change `server.js` or `package.json`
- Does not migrate onclick attributes to addEventListener
- Does not add error boundaries, loading spinners, or new UI states
- Does not set up TypeScript, linting, or testing infrastructure
- Does not deploy anywhere

These are all valid future improvements — they belong in later phases after the structure is stable.

---

## 13. Future Migration Path (Post Phase 1)

After Phase 1 completes, migrating to Vite requires only:
1. `npm install vite three` (and Three.js addons)
2. Replace CDN `<script>` tags with `import * as THREE from 'three'` at the top of `scene.js`
3. Add `vite.config.js`
4. Run `vite dev`

No structural changes to any module files. The import/export shape is already Vite-compatible.
