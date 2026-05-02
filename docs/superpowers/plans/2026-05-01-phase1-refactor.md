# Phase 1 Refactor — Code Structure Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 482KB `index.html` monolith into 13 focused ES modules with a shared `state.js` object, preserving all existing functionality with no new features or UI changes.

**Architecture:** Vanilla JS ES modules loaded from a single `<script type="module" src="js/main.js">` entry point. All shared mutable state lives in `js/state.js` as a plain object. Three.js stays on CDN as globals (`window.THREE`). Each module has one responsibility and imports only what it needs via relative paths.

**Tech Stack:** HTML/CSS/JavaScript ES modules (no bundler), Three.js r128 via CDN (global), Node.js/Express backend (unchanged throughout).

---

## File Map

Files created by this plan:

| File | Responsibility |
|---|---|
| `css/styles.css` | All CSS, extracted verbatim from `<style>` block |
| `js/main.js` | Entry point — imports, window globals, `window.onload` bootstrap |
| `js/state.js` | Single shared mutable state object |
| `js/utils.js` | `addMessageToLog`, `indexScene`, `findObjectsByClass`, `makeTextSprite` |
| `js/scene.js` | `initScene`, `updateDynamicGrid`, `initViewAxesHelper`, animate loop, resize |
| `js/selection.js` | `selectObject`, `clearSelection`, `highlightAllModels`, raycasting, `removeObject` |
| `js/transform.js` | `setTransformMode`, `setTranslateMode`, `setRotateMode`, `setScaleMode` |
| `js/voice.js` | `initVoice`, `speakResponse`, `toggleVoice` |
| `js/history.js` | `undo`, `redo`, `beginUndoGroup`, `getCurrentState`, `restoreState` |
| `js/primitives.js` | `createPrimitive` |
| `js/loader.js` | `loadModel`, `loadModelFromURL`, `validateFile`, `saveModel` |
| `js/faceEdit.js` | Face groups, enter/exit face mode, extrude UI, `handleDeleteCommand`, `handleColorCommand` |
| `js/navigation.js` | `goToEditor`, `goBack` |
| `js/ui.js` | `initUI` — all DOM event listeners, tabs, keyboard shortcuts |
| `legacy/main.js` | Old v3 OpenAI backend (moved, not deleted) |

Files modified:

| File | Change |
|---|---|
| `index.html` | Remove `<style>`, remove `<script>` block, remove import map, add CSS link, add one module script tag |

Files unchanged: `server.js`, `package.json`.

---

## Task 1: Baseline Commit

**Files:** none

- [ ] **Step 1: Verify the app works**

Open `index.html` in a browser (via a local file server or direct open). Check:
1. Upload page loads — three buttons visible
2. "Create Empty Model" → editor opens
3. Type `create a cube` → cube appears
4. Ctrl+Z → cube disappears
5. Ctrl+Y → cube reappears
6. No console errors

- [ ] **Step 2: Create the baseline commit**

```bash
git add -A
git commit -m "chore: baseline before Phase 1 refactor"
```

---

## Task 2: Remove Dead Code From index.html

**Files:** Modify `index.html`

Dead code to delete — these are `window.xxx = function() {...}` blocks that exist only as browser console utilities. None are called from HTML, event listeners, or real code paths. Each is a multi-line block starting with `window.xxx = function()` or `window.xxx = function xxx()`.

- [ ] **Step 1: Delete each dead debug block**

Find and delete the following blocks in the `<script>` section of `index.html` (search for the assignment, select the entire function body including closing `};`):

- `window.fixMyCode = function()`
- `window.testCreateCube = function()`
- `window.testAllShapes = function()`
- `window.quickFix = function()`
- `window.testScaling = function()`
- `window.testAllShapesScaling = function()`
- `window.fixScaling = function()`
- `window.testFixedFeatures = function()`
- `window.testGroupMovement = function()`
- `window.testDuplication = function()`
- `window.simpleDuplicate = function()`
- `window.duplicateAll = function()`
- `window.duplicateNow = function()`
- `window.duplicateEverything = function()`
- `window.testGroupDuplication = function()`
- `window.testButtonClicks = function()`
- `window.forceCreateEmpty = function()`

- [ ] **Step 2: Remove the window.faceMode alias**

Find and delete this single line (appears near the face editing section):
```js
window.faceMode = faceEditState;
```

- [ ] **Step 3: Remove duplicate function definitions**

`setTranslateMode`, `setRotateMode`, and `setScaleMode` are each defined **twice**. Keep the second definition of each (the multi-select-aware version that checks `currentlySelectedObjectsForEditing.length > 1`). Delete the first (simpler) definition of each.

The first definitions to delete are simple one-liners:
```js
window.setTranslateMode = function() {
    if (transformControls) {
        transformControls.setMode('translate');
        // ...
    }
};
window.setRotateMode = function() {
    if (transformControls) {
        transformControls.setMode('rotate');
        // ...
    }
};
```
These appear **before** the multi-select-aware versions. Keep the later, longer versions.

- [ ] **Step 4: Remove duplicate window.xxx assignments**

Find and delete these duplicate assignments (each appears twice in the existing window.xxx block):
```js
window.highlightAllModels = highlightAllModels; // keep only one
window.clearAllHighlights = clearAllHighlights;  // keep only one
```

- [ ] **Step 5: Browser smoke test**

1. Open `index.html` — no console errors
2. "Create Empty Model" → editor opens
3. Type `create a cube` → cube appears
4. Ctrl+Z / Ctrl+Y → undo/redo work

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "refactor: remove dead debug functions and duplicate definitions"
```

**Rollback:** `git checkout index.html`

---

## Task 3: Move Legacy Backend to legacy/

**Files:** Create `legacy/`, move `main.js`

- [ ] **Step 1: Create legacy/ folder and move the old backend**

```bash
mkdir legacy
git mv main.js legacy/main.js
```

- [ ] **Step 2: Verify server.js still works (optional but recommended)**

```bash
node server.js
```
Expected: `Server listening on port 3000`

- [ ] **Step 3: Commit**

```bash
git add legacy/main.js main.js
git commit -m "refactor: move old v3 OpenAI backend to legacy/"
```

---

## Task 4: Extract CSS to css/styles.css

**Files:** Create `css/styles.css`, modify `index.html`

- [ ] **Step 1: Create the css/ directory**

```bash
mkdir css
```

- [ ] **Step 2: Copy CSS content**

In `index.html`, find the `<style>` block (starts after `<head>` contents, ends with `</style>`). Copy **everything between** `<style>` and `</style>` (not including the tags themselves) into a new file `css/styles.css`. The CSS is approximately 700 lines and ends before the `<script type="importmap">` block.

- [ ] **Step 3: Replace `<style>` block in index.html**

Remove the entire `<style>...</style>` block from `index.html` and replace it with:

```html
<link rel="stylesheet" href="css/styles.css" />
```

Place the `<link>` tag after the Google Fonts `<link>` tag, still inside `<head>`.

- [ ] **Step 4: Browser smoke test**

1. Open `index.html` — page looks visually identical (dark header, white body with grid, yellow buttons)
2. No console errors
3. All text, colors, and layout match the original

- [ ] **Step 5: Commit**

```bash
git add css/styles.css index.html
git commit -m "refactor: extract CSS to css/styles.css"
```

**Rollback:** `git checkout index.html && rm -rf css/`

---

## Task 5: KEY TRANSITION — Move Script to js/main.js (ES Module)

**Risk: HIGH.** This is the most important single step. The app transitions from a plain `<script>` to `<script type="module">`. Read all steps before starting.

**Files:** Create `js/main.js`, modify `index.html`

- [ ] **Step 1: Create the js/ directory**

```bash
mkdir js
```

- [ ] **Step 2: Extract the entire script block to js/main.js**

In `index.html`, find the large `<script>` block (it starts after the five CDN script tags and runs to end of `<body>`). Copy **everything between** `<script>` and `</script>` (not including the tags) into a new file `js/main.js`.

Do not include the `<script>` or `</script>` tags in `js/main.js`.

- [ ] **Step 3: Remove the import map from index.html**

Find and delete the entire `<script type="importmap">` block from `index.html`:
```html
<script type="importmap">
    {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js",
            "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/"
        }
    }
</script>
```
This import map is no longer needed — Three.js stays as a global CDN script.

- [ ] **Step 4: Replace the script block in index.html**

Replace the removed `<script>...</script>` block with exactly one line:

```html
<script type="module" src="js/main.js"></script>
```

The `<script type="module">` tag is deferred by default, so it runs after the DOM is parsed — the same behavior as the original script at the bottom of `<body>`.

- [ ] **Step 5: Add missing window globals for HTML onclick attributes**

`type="module"` scopes all function declarations to the module. Functions called from HTML `onclick=""` attributes must be explicitly on `window`. The following are called from HTML inline handlers and are NOT yet covered by existing `window.xxx =` assignments in the code.

Find the block of `window.xxx = ...` assignments near the top of `js/main.js` and add these lines immediately after the existing assignments:

```js
window.cancelExtrude = cancelExtrude;
window.confirmExtrude = confirmExtrude;
window.updateExtrudeDistance = updateExtrudeDistance;
window.handleExtrudeKeydown = handleExtrudeKeydown;
```

These four functions are called from the extrude panel HTML (at the bottom of `index.html`):
```html
<button onclick="cancelExtrude()">Cancel</button>
<button onclick="confirmExtrude()">OK</button>
<input onchange="updateExtrudeDistance()" onkeyup="updateExtrudeDistance()" onkeydown="handleExtrudeKeydown(event)">
```

- [ ] **Step 6: Full browser test**

Test every major feature:
1. Page loads, no console errors
2. Upload page shows three buttons
3. "Create Empty Model" → editor opens
4. "Load Random Model" → model loads
5. "Edit Existing Model" → file picker opens
6. Type `create a cube` → cube appears
7. Click cube → selection highlights appear
8. Drag transform handles → object moves
9. Press G, R, S → transform mode switches
10. Ctrl+Z → undo works; Ctrl+Y → redo works
11. Type `rotate by 90 degrees` in AI chat → rotation applies
12. Click microphone button → mic toggles (if browser supports it)
13. Double-click a cube → face edit mode activates
14. Press Q → face edit mode exits

- [ ] **Step 7: Commit**

```bash
git add js/main.js index.html
git commit -m "refactor: extract all JavaScript to js/main.js ES module"
```

**Rollback:** `git checkout index.html && rm -rf js/`

---

## Task 6: Create js/state.js and Migrate Globals

**Risk: HIGH.** This replaces ~30 top-level global variable declarations with references to a shared state object. Must be done carefully and tested immediately after.

**Files:** Create `js/state.js`, modify `js/main.js`

- [ ] **Step 1: Create js/state.js**

Create `js/state.js` with this exact content:

```js
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
  viewAxesRaycaster: null,
  viewAxesMouse: null,

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

  // Raycast debug
  raycastDebugSphere: null,
};
```

- [ ] **Step 2: Add the import at the very top of js/main.js**

Insert as the first line of `js/main.js`:

```js
import { state } from './state.js';
```

- [ ] **Step 3: Remove global variable declarations from js/main.js**

Find and delete these declaration lines (they are now in state.js):

```js
let uploadedFile = null, scene, camera, renderer, controls;
let recognition;
let synth;
let isVoiceAssistActive = false;
let raycaster;
let mouse;
let selectedObject = null;
const originalMaterialProperties = new Map();
const allHighlightsOriginalMaterials = new Map();
let currentlySelectedObjectsForEditing = [];
let transformControls;
let currentGridHelper = null;
let currentGridLabels = [];
let loadedModels = [];
let undoStack = [];
let redoStack = [];
let currentUndoGroup = null;
let viewAxesScene, viewAxesCamera, viewAxesRenderer;
let viewAxesHelper;
let viewAxesSceneRendered = false;
let viewAxesRaycaster;
let viewAxesMouse;
let raycastDebugSphere;
let pendingDisambiguation = null;
```

Also delete the `faceEditState` object declaration (the full `let faceEditState = { ... }` block) and the `extrudeUI` object declaration (the full `const extrudeUI = { ... }` block). These are now in `state.js`.

Keep `const MAX_HISTORY_SIZE = 20;` — this is a constant, not state.

Also keep `const RANDOM_MODEL_URLS = [...]` — this is a constant.

- [ ] **Step 4: Replace all bare global references with state.xxx**

Use VSCode Find & Replace (**Ctrl+H**) with **"Match Whole Word"** enabled for each replacement. Do them one at a time and verify no unintended replacements occur (check the match count before replacing all).

Replace in `js/main.js`:

| Find (whole word) | Replace with |
|---|---|
| `scene` | `state.scene` |
| `camera` | `state.camera` |
| `renderer` | `state.renderer` |
| `controls` | `state.controls` |
| `transformControls` | `state.transformControls` |
| `selectedObject` | `state.selectedObject` |
| `loadedModels` | `state.loadedModels` |
| `currentlySelectedObjectsForEditing` | `state.currentlySelectedObjectsForEditing` |
| `originalMaterialProperties` | `state.originalMaterialProperties` |
| `allHighlightsOriginalMaterials` | `state.allHighlightsOriginalMaterials` |
| `raycaster` | `state.raycaster` |
| `mouse` | `state.mouse` |
| `currentGridHelper` | `state.currentGridHelper` |
| `currentGridLabels` | `state.currentGridLabels` |
| `viewAxesScene` | `state.viewAxesScene` |
| `viewAxesCamera` | `state.viewAxesCamera` |
| `viewAxesRenderer` | `state.viewAxesRenderer` |
| `viewAxesHelper` | `state.viewAxesHelper` |
| `viewAxesSceneRendered` | `state.viewAxesSceneRendered` |
| `viewAxesRaycaster` | `state.viewAxesRaycaster` |
| `viewAxesMouse` | `state.viewAxesMouse` |
| `undoStack` | `state.undoStack` |
| `redoStack` | `state.redoStack` |
| `currentUndoGroup` | `state.currentUndoGroup` |
| `faceEditState` | `state.faceEditState` |
| `extrudeUI` | `state.extrudeUI` |
| `recognition` | `state.recognition` |
| `synth` | `state.synth` |
| `isVoiceAssistActive` | `state.isVoiceAssistActive` |
| `pendingDisambiguation` | `state.pendingDisambiguation` |
| `uploadedFile` | `state.uploadedFile` |
| `droppedFileBlobs` | `state.droppedFileBlobs` |
| `raycastDebugSphere` | `state.raycastDebugSphere` |

- [ ] **Step 5: Fix the one known parameter name conflict**

The function `restoreState` has a parameter also named `state`, which now shadows the import. Find this function:

```js
function restoreState(state) {
    // ...
    state.forEach(modelState => {
```

Rename the parameter from `state` to `snapshot` everywhere inside this function:

```js
function restoreState(snapshot) {
    // ...
    snapshot.forEach(modelState => {
```

The function body uses `state.forEach(...)`, `state.length` — change all of these to `snapshot.forEach(...)`, `snapshot.length`.

- [ ] **Step 6: Fix double-prefixed references**

The replace-all in Step 4 may have created double-prefixed references like `state.state.scene` (if any string like `state.scene` already existed). Search for `state.state.` in `js/main.js` and fix any occurrences by removing the duplicate prefix.

Also check for `state.MAX_HISTORY_SIZE` — this should remain `MAX_HISTORY_SIZE` (it was a const, not a global var). Fix if found.

- [ ] **Step 7: Full browser smoke test**

1. Open `index.html` — no console errors
2. "Create Empty Model" → editor opens with 3D viewport
3. Type `create a cube` → cube appears in scene
4. Click cube → selection highlight works
5. Drag handles → cube moves
6. Ctrl+Z → undo works
7. Ctrl+Y → redo works
8. Type `create a sphere` → sphere appears
9. Double-click cube → face edit mode activates (green face overlays appear)
10. Press Q → face edit mode exits
11. "Load Random Model" → GLTF model loads

- [ ] **Step 8: Commit**

```bash
git add js/state.js js/main.js
git commit -m "refactor: create state.js and migrate all globals to state object"
```

**Rollback:** `git checkout js/main.js && rm js/state.js`

---

## Task 7: Extract js/utils.js

**Files:** Create `js/utils.js`, modify `js/main.js`

- [ ] **Step 1: Create js/utils.js**

```js
import { state } from './state.js';

// --- addMessageToLog ---
export function addMessageToLog(sender, message) {
    // Move the complete function body from main.js verbatim
    // (it reads from document.getElementById('aiLog') or state.aiLog if DOM ref is used)
}

// --- indexScene ---
export function indexScene(scene) {
    // Move the complete function body from main.js verbatim
}

// --- findObjectsByClass ---
export function findObjectsByClass(index, className) {
    // Move the complete function body from main.js verbatim
}

// --- makeTextSprite ---
export function makeTextSprite(message, parameters) {
    // Move the complete function body from main.js verbatim
}
```

**Important:** Move the actual function bodies from `js/main.js` verbatim — replace the placeholder comments above with the real code. The `// Move verbatim` notation here means: copy the exact body from `js/main.js` and paste it in.

- [ ] **Step 2: Add import to js/main.js**

Add this line immediately after the `import { state } from './state.js';` line:

```js
import { addMessageToLog, indexScene, findObjectsByClass, makeTextSprite } from './utils.js';
```

- [ ] **Step 3: Remove from js/main.js**

Delete the four function definitions from `js/main.js`:
- `function addMessageToLog(sender, message) { ... }`
- `function indexScene(scene) { ... }` (or however it's defined)
- `function findObjectsByClass(index, className) { ... }`
- `function makeTextSprite(message, parameters) { ... }`

- [ ] **Step 4: Browser smoke test**

1. No console errors on load
2. Type `create a cube` → cube appears AND the AI log shows the message ("User: create a cube", "AI: ...")

- [ ] **Step 5: Commit**

```bash
git add js/utils.js js/main.js
git commit -m "refactor: extract utils.js (addMessageToLog, indexScene, makeTextSprite)"
```

**Rollback:** `git checkout js/main.js && rm js/utils.js`

---

## Task 8: Extract js/scene.js

**Files:** Create `js/scene.js`, modify `js/main.js`

- [ ] **Step 1: Create js/scene.js**

```js
import { state } from './state.js';
import { addMessageToLog, makeTextSprite } from './utils.js';

export function initScene() { /* move verbatim */ }
export function updateDynamicGrid() { /* move verbatim */ }
export function initViewAxesHelper() { /* move verbatim */ }
export function onWindowResize() { /* move verbatim */ }

// The animate loop — move verbatim and export
export function startAnimateLoop() { /* move verbatim, call animate() */ }

// Internal animate function (not exported, called by startAnimateLoop)
function animate() { /* move verbatim */ }
```

**Note on `initScene`:** This function assigns to `state.scene`, `state.camera`, `state.renderer`, `state.controls`, `state.transformControls`, `state.raycaster`, `state.mouse`. With state.js in place these assignments all work correctly.

**Note on `onWindowResize`:** This function is also wired to `window.addEventListener('resize', onWindowResize)`. Keep that listener in `js/ui.js` (Task 18); for now, leave it in `main.js` and just export the function.

- [ ] **Step 2: Add import to js/main.js**

```js
import { initScene, updateDynamicGrid, initViewAxesHelper, onWindowResize, startAnimateLoop } from './scene.js';
```

- [ ] **Step 3: Remove from js/main.js**

Delete: `function initScene()`, `function updateDynamicGrid()`, `function initViewAxesHelper()`, `function animate()`, `function onWindowResize()`, and the `animate()` call at the bottom of `initScene` or wherever the loop is started.

Update the `window.onload` call in `main.js` to call `startAnimateLoop()` after `initScene()`.

- [ ] **Step 4: Browser smoke test**

1. No console errors
2. Editor opens — 3D viewport renders (grid visible, axes helper visible in bottom-left)
3. OrbitControls work (drag to rotate, scroll to zoom)
4. Window resize doesn't break the viewport

- [ ] **Step 5: Commit**

```bash
git add js/scene.js js/main.js
git commit -m "refactor: extract scene.js (initScene, grid, viewAxes, animate loop)"
```

**Rollback:** `git checkout js/main.js && rm js/scene.js`

---

## Task 9: Extract js/selection.js

**Files:** Create `js/selection.js`, modify `js/main.js`

- [ ] **Step 1: Create js/selection.js**

```js
import { state } from './state.js';
import { addMessageToLog } from './utils.js';

export function selectObject(obj) { /* move verbatim */ }
export function clearSelection() { /* move verbatim */ }
export function highlightAllModels() { /* move verbatim */ }
export function clearAllHighlights() { /* move verbatim */ }
export function getSelectedObjects() { /* move verbatim */ }
export function setSelectedObjects(objects) { /* move verbatim */ }
export function removeObject() { /* move verbatim */ }
export function duplicateSelectedObject() { /* move verbatim */ }
export function duplicateSelection() { /* move verbatim */ }
export function onCanvasClick(event) { /* move verbatim */ }
export function onCanvasMouseMove(event) { /* move verbatim */ }
```

- [ ] **Step 2: Add import to js/main.js**

```js
import {
  selectObject, clearSelection, highlightAllModels, clearAllHighlights,
  getSelectedObjects, setSelectedObjects, removeObject,
  duplicateSelectedObject, duplicateSelection,
  onCanvasClick, onCanvasMouseMove
} from './selection.js';
```

- [ ] **Step 3: Remove from js/main.js**

Delete all the listed function definitions from `js/main.js`.

- [ ] **Step 4: Browser smoke test**

1. No console errors
2. Click an object in viewport → selection highlight (yellow emissive) appears
3. Click empty space → selection clears
4. Type `remove selected` in AI chat → selected object disappears

- [ ] **Step 5: Commit**

```bash
git add js/selection.js js/main.js
git commit -m "refactor: extract selection.js (select, highlight, remove, duplicate)"
```

**Rollback:** `git checkout js/main.js && rm js/selection.js`

---

## Task 10: Extract js/transform.js

**Files:** Create `js/transform.js`, modify `js/main.js`

- [ ] **Step 1: Create js/transform.js**

```js
import { state } from './state.js';
import { addMessageToLog } from './utils.js';

export function setTransformMode(mode) { /* move verbatim */ }
export function setTranslateMode() { /* move the multi-select-aware version verbatim */ }
export function setRotateMode() { /* move the multi-select-aware version verbatim */ }
export function setScaleMode() { /* move the multi-select-aware version verbatim */ }
```

**Important:** Only the multi-select-aware versions of `setTranslateMode`, `setRotateMode`, `setScaleMode` should be in this file (the ones that check `state.currentlySelectedObjectsForEditing.length > 1`). The simple one-liners were deleted in Task 2.

- [ ] **Step 2: Add import to js/main.js**

```js
import { setTransformMode, setTranslateMode, setRotateMode, setScaleMode } from './transform.js';
```

- [ ] **Step 3: Remove from js/main.js**

Delete the four function definitions and update the `window.setTransformMode = setTransformMode` assignment to refer to the imported function (it already does via the import, no change needed to the window assignment line).

- [ ] **Step 4: Browser smoke test**

1. No console errors
2. Select a cube, press G → translate handles appear
3. Press R → rotate handles appear
4. Press S → scale handles appear
5. Type `set mode to rotate` in AI → mode switches

- [ ] **Step 5: Commit**

```bash
git add js/transform.js js/main.js
git commit -m "refactor: extract transform.js (setTransformMode, translate/rotate/scale)"
```

**Rollback:** `git checkout js/main.js && rm js/transform.js`

---

## Task 11: Extract js/voice.js

**Files:** Create `js/voice.js`, modify `js/main.js`

- [ ] **Step 1: Create js/voice.js**

```js
import { state } from './state.js';
import { addMessageToLog } from './utils.js';

/**
 * Initialize speech recognition and synthesis.
 * @param {function} onSpeechResult - Called with the transcript string when user speaks.
 */
export function initVoice(onSpeechResult) {
    state.synth = window.speechSynthesis;

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn('[Voice] Speech recognition not supported in this browser.');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    state.recognition = new SpeechRecognition();
    state.recognition.continuous = false;
    state.recognition.interimResults = false;
    state.recognition.lang = 'en-US';

    state.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        addMessageToLog('User (Voice)', transcript);
        if (onSpeechResult) onSpeechResult(transcript);
    };

    state.recognition.onerror = (event) => {
        console.error('[Voice] Recognition error:', event.error);
        addMessageToLog('System', `Voice error: ${event.error}`);
        state.isVoiceAssistActive = false;
        updateVoiceButtonUI();
    };

    state.recognition.onend = () => {
        if (state.isVoiceAssistActive) {
            state.recognition.start(); // restart for continuous listening
        } else {
            updateVoiceButtonUI();
        }
    };
}

export function speakResponse(text) {
    if (!state.synth || !state.isVoiceAssistActive) return;
    const utterance = new SpeechSynthesisUtterance(text);
    state.synth.speak(utterance);
}

export function toggleVoice() {
    const btn = document.getElementById('integratedVoiceBtn');
    if (!state.recognition) {
        addMessageToLog('System', 'Voice not supported in this browser.');
        return;
    }
    state.isVoiceAssistActive = !state.isVoiceAssistActive;
    if (state.isVoiceAssistActive) {
        state.recognition.start();
        addMessageToLog('System', 'Voice assistant activated. Speak your command.');
    } else {
        state.recognition.stop();
        addMessageToLog('System', 'Voice assistant deactivated.');
    }
    updateVoiceButtonUI();
}

function updateVoiceButtonUI() {
    const btn = document.getElementById('integratedVoiceBtn');
    if (!btn) return;
    if (state.isVoiceAssistActive) {
        btn.classList.add('active-voice-btn');
    } else {
        btn.classList.remove('active-voice-btn');
    }
}
```

**Note:** The `initVoice(onSpeechResult)` signature takes a callback instead of importing `sendAICommand` directly. This avoids a circular dependency with `ai.js`. The callback is wired in `main.js` (Task 19) or `ui.js` (Task 18).

**Note:** The existing voice logic in `main.js` may have different internal structure. Adapt the above to match the actual recognition setup in your code, preserving all behaviors (continuous mode, error handling, restart on end). The key design requirement is that `voice.js` does NOT import from `ai.js`.

- [ ] **Step 2: Add import to js/main.js**

```js
import { initVoice, speakResponse, toggleVoice } from './voice.js';
```

- [ ] **Step 3: Remove from js/main.js**

Delete the voice initialization code, `speakResponse` function, and `toggleVoice` function. Also delete the `integratedVoiceBtn.addEventListener('click', ...)` handler (it will be in `ui.js`).

- [ ] **Step 4: Update window.onload in main.js**

Where `window.onload` calls voice initialization, update it to:
```js
initVoice((transcript) => sendAICommand(transcript));
```

(This works because `sendAICommand` from `ai.js` will be imported in `main.js`.)

- [ ] **Step 5: Browser smoke test**

1. No console errors
2. Click microphone button → button turns red (active state)
3. Click again → button returns to normal
4. If browser supports speech: speak a command → transcript appears in AI log

- [ ] **Step 6: Commit**

```bash
git add js/voice.js js/main.js
git commit -m "refactor: extract voice.js (speech recognition, speakResponse)"
```

**Rollback:** `git checkout js/main.js && rm js/voice.js`

---

## Task 12: Extract js/history.js

**Files:** Create `js/history.js`, modify `js/main.js`

- [ ] **Step 1: Create js/history.js**

```js
import { state } from './state.js';
import { addMessageToLog } from './utils.js';
import { clearSelection, clearAllHighlights } from './selection.js';
import { speakResponse } from './voice.js';

const MAX_HISTORY_SIZE = 20;

export function beginUndoGroup(actionName) { /* move verbatim */ }
export function addUndoAction(action) { /* move verbatim */ }
export function endUndoGroup() { /* move verbatim */ }
export function undo() { /* move verbatim */ }
export function redo() { /* move verbatim */ }
export function getCurrentState() { /* move verbatim */ }
export function restoreState(snapshot) { /* move verbatim — parameter renamed from 'state' to 'snapshot' */ }
export function updateUndoRedoButtons() { /* move verbatim */ }
```

**Critical:** The `restoreState` function has a parameter named `state` in the original code, which conflicts with the `state` import from `state.js`. When moving this function, rename the parameter to `snapshot` and update all uses of `state` inside the function to `snapshot`.

Before (original):
```js
function restoreState(state) {
    state.forEach(modelState => { ... });
}
```

After (in history.js):
```js
export function restoreState(snapshot) {
    snapshot.forEach(modelState => { ... });
}
```

- [ ] **Step 2: Add import to js/main.js**

```js
import {
  beginUndoGroup, addUndoAction, endUndoGroup,
  undo, redo, getCurrentState, restoreState, updateUndoRedoButtons
} from './history.js';
```

- [ ] **Step 3: Remove from js/main.js**

Delete all the listed function definitions. Also remove the `const MAX_HISTORY_SIZE = 20;` line from `main.js` (it now lives in `history.js`).

- [ ] **Step 4: Browser smoke test**

1. No console errors
2. Create two cubes, then Ctrl+Z twice → both disappear in sequence
3. Ctrl+Y twice → both reappear
4. Undo button disables when stack is empty

- [ ] **Step 5: Commit**

```bash
git add js/history.js js/main.js
git commit -m "refactor: extract history.js (undo/redo, state snapshots)"
```

**Rollback:** `git checkout js/main.js && rm js/history.js`

---

## Task 13: Extract js/primitives.js

**Files:** Create `js/primitives.js`, modify `js/main.js`

- [ ] **Step 1: Create js/primitives.js**

```js
import { state } from './state.js';
import { addMessageToLog } from './utils.js';
import { beginUndoGroup, addUndoAction, endUndoGroup } from './history.js';
import { speakResponse } from './voice.js';

export function createPrimitive(type) { /* move verbatim */ }
```

- [ ] **Step 2: Add import to js/main.js**

```js
import { createPrimitive } from './primitives.js';
```

- [ ] **Step 3: Remove from js/main.js**

Delete `function createPrimitive(type) { ... }`.

- [ ] **Step 4: Browser smoke test**

1. Type `create a cube` → cube appears
2. Type `create a sphere` → sphere appears
3. Type `create a cylinder` → cylinder appears
4. Undo removes the last created shape

- [ ] **Step 5: Commit**

```bash
git add js/primitives.js js/main.js
git commit -m "refactor: extract primitives.js (createPrimitive)"
```

**Rollback:** `git checkout js/main.js && rm js/primitives.js`

---

## Task 14: Extract js/loader.js

**Files:** Create `js/loader.js`, modify `js/main.js`

- [ ] **Step 1: Create js/loader.js**

```js
import { state } from './state.js';
import { addMessageToLog } from './utils.js';
import { speakResponse } from './voice.js';
import { updateDynamicGrid } from './scene.js';

export const RANDOM_MODEL_URLS = [
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF-Binary/Box.glb',
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb',
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb',
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb',
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
];

export function validateFile(file) { /* move verbatim */ }
export function loadModel(file) { /* move verbatim */ }
export function loadModelFromURL(url) { /* move verbatim */ }
export function saveModel() { /* move verbatim (placeholder function) */ }
```

**Note:** `loader.js` does NOT import from `navigation.js`. Any code inside `loadModel` or `loadModelFromURL` that currently calls `goToEditor()` must be removed from the loader. The navigation call will be made in `ui.js` or `main.js` after calling `loadModel`. Trace the call sites in the original code — if `loadModel` currently calls `goToEditor`, extract that call and move it to the caller instead.

- [ ] **Step 2: Add import to js/main.js**

```js
import { RANDOM_MODEL_URLS, validateFile, loadModel, loadModelFromURL, saveModel } from './loader.js';
```

- [ ] **Step 3: Remove from js/main.js**

Delete: `const RANDOM_MODEL_URLS = [...]`, `function validateFile()`, `function loadModel()`, `function loadModelFromURL()`, `function saveModel()`.

- [ ] **Step 4: Browser smoke test**

1. "Load Random Model" → a random GLTF model loads and appears in viewport
2. "Edit Existing Model" → file picker opens, selecting a `.glb` file loads it
3. Drag-drop a `.glb` onto the upload page → file loads

- [ ] **Step 5: Commit**

```bash
git add js/loader.js js/main.js
git commit -m "refactor: extract loader.js (GLTF loading, file validation)"
```

**Rollback:** `git checkout js/main.js && rm js/loader.js`

---

## Task 15: Extract js/faceEdit.js

**Files:** Create `js/faceEdit.js`, modify `js/main.js`

- [ ] **Step 1: Create js/faceEdit.js**

```js
import { state } from './state.js';
import { addMessageToLog } from './utils.js';
import { speakResponse } from './voice.js';
import { setTransformMode } from './transform.js';
import { removeObject } from './selection.js';

export function buildFaceGroups(mesh, epsAngle, epsPlane) { /* move verbatim */ }
export function makeGroupOverlay(mesh, group, color, opacity) { /* move verbatim */ }
export function enterFaceEditMode(mesh) { /* move verbatim */ }
export function exitFaceEditMode() { /* move verbatim */ }
export function deleteFaceGroup(mesh, group) { /* move verbatim */ }
export function refreshFaceGroups() { /* move verbatim */ }
export function getFaceFrame(mesh, group) { /* move verbatim */ }
export function handleExtrudeFace() { /* move verbatim */ }
export function startExtrudeInteractive(faceIds) { /* move verbatim */ }
export function updateExtrudePreview(depth) { /* move verbatim */ }
export function onExtrudePointerDown(event) { /* move verbatim */ }
export function onExtrudePointerMove(event) { /* move verbatim */ }
export function onExtrudePointerUp(event) { /* move verbatim */ }
export function confirmExtrude() { /* move verbatim */ }
export function cancelExtrude() { /* move verbatim */ }
export function updateExtrudeDistance() { /* move verbatim */ }
export function handleExtrudeKeydown(event) { /* move verbatim */ }
export function handleDeleteCommand() { /* move verbatim */ }
export function handleColorCommand(color) { /* move verbatim */ }
```

- [ ] **Step 2: Update window globals in js/main.js**

The extrude panel HTML calls `cancelExtrude()`, `confirmExtrude()`, `updateExtrudeDistance()`, `handleExtrudeKeydown()` directly. These were assigned to `window` in Task 5. After extraction, update those assignments to use the imported functions:

```js
// These already exist in main.js from Task 5 — they now refer to the imported functions:
window.cancelExtrude = cancelExtrude;
window.confirmExtrude = confirmExtrude;
window.updateExtrudeDistance = updateExtrudeDistance;
window.handleExtrudeKeydown = handleExtrudeKeydown;
```

No code change needed here — the `window.xxx = functionName` assignments remain in `main.js` and automatically refer to the imported `cancelExtrude`, etc. Just verify the import is present.

- [ ] **Step 3: Add import to js/main.js**

```js
import {
  enterFaceEditMode, exitFaceEditMode,
  confirmExtrude, cancelExtrude, updateExtrudeDistance, handleExtrudeKeydown,
  handleDeleteCommand, handleColorCommand
} from './faceEdit.js';
```

- [ ] **Step 4: Remove from js/main.js**

Delete all the listed function definitions from `main.js`.

- [ ] **Step 5: Browser smoke test**

1. No console errors
2. Create a cube, double-click it → green face overlays appear
3. Click a face → face highlights (color changes)
4. Press E → extrude panel appears at top-right
5. Enter a value and press OK → extrusion occurs
6. Press Cancel → extrude cancelled
7. Press Q → face mode exits
8. Press X while in face mode → face delete dialog

- [ ] **Step 6: Commit**

```bash
git add js/faceEdit.js js/main.js
git commit -m "refactor: extract faceEdit.js (face groups, extrude UI)"
```

**Rollback:** `git checkout js/main.js && rm js/faceEdit.js`

---

## Task 16: Extract js/ai.js

**Files:** Create `js/ai.js`, modify `js/main.js`

- [ ] **Step 1: Create js/ai.js**

```js
import { state } from './state.js';
import { addMessageToLog, indexScene, findObjectsByClass } from './utils.js';
import { speakResponse } from './voice.js';
import { selectObject, clearSelection, highlightAllModels, clearAllHighlights, removeObject } from './selection.js';
import { setTransformMode } from './transform.js';
import { createPrimitive } from './primitives.js';
import { beginUndoGroup, endUndoGroup, undo, redo } from './history.js';
import { resetView } from './scene.js';  // if resetView is in scene.js
import { handleDeleteCommand, handleColorCommand } from './faceEdit.js';

export async function sendAICommand(command) { /* move verbatim */ }
export async function testAIConnection() { /* move verbatim */ }

// Internal dispatcher functions (not exported — only used by sendAICommand)
function handleAIResponse(responseText) { /* move verbatim */ }
function handleNLActionResponse(jsonResponse) { /* move verbatim */ }
function handleDisambiguationChoice(choiceNumber) { /* move verbatim */ }
function buildModelContext() { /* move verbatim */ }
function applyNLTransform(uuids, operation) { /* move verbatim */ }
function deleteByUUIDs(uuids) { /* move verbatim */ }
```

**Note on `resetView`:** `resetView` is currently in `main.js` (it's a camera/scene function). When extracting `scene.js` in Task 8, `resetView` should have been included. If it wasn't, move it to `scene.js` now and export it from there. `ai.js` then imports it from `scene.js`.

- [ ] **Step 2: Add import to js/main.js**

```js
import { sendAICommand, testAIConnection } from './ai.js';
```

- [ ] **Step 3: Remove from js/main.js**

Delete: `sendAICommand`, `testAIConnection`, `handleAIResponse`, `handleNLActionResponse`, `handleDisambiguationChoice`, `buildModelContext`, `applyNLTransform`, `deleteByUUIDs`.

- [ ] **Step 4: Update voice initialization in window.onload**

The `initVoice` callback in `window.onload` references `sendAICommand`. Since both `initVoice` (from voice.js) and `sendAICommand` (from ai.js) are now imported at the top of `main.js`, the callback `(transcript) => sendAICommand(transcript)` works correctly.

Verify `window.onload` contains:
```js
initVoice((transcript) => sendAICommand(transcript));
testAIConnection();
```

- [ ] **Step 5: Browser smoke test**

1. No console errors
2. Type `create a cube` → cube appears
3. Type `rotate by 45 degrees around y axis` → cube rotates
4. Type `change color to red` → cube turns red
5. Type `remove selected` → cube is deleted
6. Type `what is this` → AI shows design info in chat
7. Type `list parts` → parts listed in chat

- [ ] **Step 6: Commit**

```bash
git add js/ai.js js/main.js
git commit -m "refactor: extract ai.js (sendAICommand, action dispatcher)"
```

**Rollback:** `git checkout js/main.js && rm js/ai.js`

---

## Task 17: Extract js/navigation.js

**Files:** Create `js/navigation.js`, modify `js/main.js`

- [ ] **Step 1: Create js/navigation.js**

```js
import { state } from './state.js';
import { addMessageToLog } from './utils.js';
import { initScene } from './scene.js';

export function goToEditor(mode) { /* move verbatim */ }
export function goBack() { /* move verbatim */ }
```

`goToEditor(mode)` accepts `'empty'`, `'uploaded'`, or `'random'`. It transitions the page and may trigger initial model loading — any `loadModel` or `loadModelFromURL` calls inside `goToEditor` should be moved out. `goToEditor` should only handle the CSS class transitions. Actual model loading is orchestrated from `ui.js`.

- [ ] **Step 2: Add import to js/main.js**

```js
import { goToEditor, goBack } from './navigation.js';
```

- [ ] **Step 3: Remove from js/main.js**

Delete `function goToEditor(mode)` and `function goBack()`.

- [ ] **Step 4: Browser smoke test**

1. "Create Empty Model" → editor page slides in, viewport is visible
2. Back button (←) → returns to upload page
3. "Load Random Model" → transitions to editor and model loads

- [ ] **Step 5: Commit**

```bash
git add js/navigation.js js/main.js
git commit -m "refactor: extract navigation.js (goToEditor, goBack)"
```

**Rollback:** `git checkout js/main.js && rm js/navigation.js`

---

## Task 18: Extract js/ui.js

**Files:** Create `js/ui.js`, modify `js/main.js`

- [ ] **Step 1: Create js/ui.js**

```js
import { state } from './state.js';
import { addMessageToLog } from './utils.js';
import { speakResponse } from './voice.js';
import { toggleVoice } from './voice.js';
import { sendAICommand } from './ai.js';
import { undo, redo } from './history.js';
import { loadModel, loadModelFromURL, validateFile, RANDOM_MODEL_URLS, saveModel } from './loader.js';
import { goToEditor, goBack } from './navigation.js';
import { setTranslateMode, setRotateMode, setScaleMode } from './transform.js';
import { handleDeleteCommand, handleColorCommand, exitFaceEditMode, enterFaceEditMode, handleExtrudeFace, onExtrudePointerDown, onExtrudePointerMove, onExtrudePointerUp } from './faceEdit.js';
import { onCanvasClick, onCanvasMouseMove, highlightAllModels, clearAllHighlights } from './selection.js';
import { onWindowResize } from './scene.js';

export function initUI() {
    setupDropZone();
    setupFileInput();
    setupUploadPageButtons();
    setupEditorButtons();
    setupTabButtons();
    setupColorPicker();
    setupCSSEditor();
    setupTextCommandInput();
    setupVoiceButton();
    setupUndoRedoButtons();
    setupCanvasInteraction();
    setupKeyboardShortcuts();
    window.addEventListener('resize', onWindowResize);
}

export function setActiveTab(tabName) { /* move verbatim */ }
export function isTypingInUI() { /* move verbatim */ }

// --- Private setup functions ---

function setupDropZone() {
    const dropZone = document.getElementById('dropZone');
    // Move dragover, dragleave, drop event listeners from main.js verbatim
    // On drop: call loadModel(file) then goToEditor('uploaded') in sequence
}

function setupFileInput() {
    const fileInput = document.getElementById('fileInput');
    // Move fileInput 'change' event listener from main.js verbatim
}

function setupUploadPageButtons() {
    const createBtn = document.getElementById('createNewEmptyModelButton');
    const editBtn = document.getElementById('editExistingModelButton');
    const randomBtn = document.getElementById('loadRandomModelButton');
    createBtn.addEventListener('click', () => goToEditor('empty'));
    editBtn.addEventListener('click', () => document.getElementById('fileInput').click());
    randomBtn.addEventListener('click', () => {
        const url = RANDOM_MODEL_URLS[Math.floor(Math.random() * RANDOM_MODEL_URLS.length)];
        loadModelFromURL(url);
        goToEditor('random');
    });
}

function setupEditorButtons() {
    const uploadNewFileButton = document.getElementById('uploadNewFileButton');
    const saveButton = document.getElementById('saveButton');
    uploadNewFileButton.addEventListener('click', () => document.getElementById('fileInput').click());
    saveButton.addEventListener('click', saveModel);
}

function setupTabButtons() {
    document.getElementById('chatTabButton').addEventListener('click', () => setActiveTab('chat'));
    document.getElementById('codeEditorTabButton').addEventListener('click', () => setActiveTab('codeEditor'));
}

function setupColorPicker() {
    document.getElementById('applyObjectColorBtn').addEventListener('click', () => {
        const color = document.getElementById('objectColorPicker').value;
        handleColorCommand(color);
    });
}

function setupCSSEditor() {
    document.getElementById('applyCssButton').addEventListener('click', () => {
        // Move the CSS apply logic from main.js verbatim
    });
}

function setupTextCommandInput() {
    document.getElementById('sendTextCommandBtn').addEventListener('click', () => {
        const input = document.getElementById('textCommandInput');
        const command = input.value.trim();
        if (command) {
            addMessageToLog('User', command);
            if (state.pendingDisambiguation && /^\d+$/.test(command)) {
                handleDisambiguationChoice(command);
            } else {
                sendAICommand(command);
            }
            input.value = '';
        }
    });
    document.getElementById('textCommandInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('sendTextCommandBtn').click();
    });
}

function setupVoiceButton() {
    document.getElementById('integratedVoiceBtn').addEventListener('click', toggleVoice);
}

function setupUndoRedoButtons() {
    document.getElementById('undoButton').addEventListener('click', undo);
    document.getElementById('redoButton').addEventListener('click', redo);
}

function setupCanvasInteraction() {
    const canvas = document.getElementById('cadCanvas');
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('mousemove', onCanvasMouseMove);
    canvas.addEventListener('dblclick', (event) => {
        // Move double-click face edit activation logic from main.js verbatim
    });
    // Add extrude pointer events if needed
    canvas.addEventListener('pointerdown', onExtrudePointerDown);
    canvas.addEventListener('pointermove', onExtrudePointerMove);
    canvas.addEventListener('pointerup', onExtrudePointerUp);
}

function setupKeyboardShortcuts() {
    // Move the keyboard shortcut document.addEventListener('keydown', ...) from main.js verbatim
    // This includes: Ctrl+Z/Y undo/redo, G/R/S transform, face edit shortcuts (X, C, E, Q), extrude Enter/Escape
}
```

**Note:** `handleDisambiguationChoice` is internal to `ai.js`. If `setupTextCommandInput` needs to call it, either export it from `ai.js` and import it in `ui.js`, or have `sendAICommand` handle the disambiguation detection internally (cleaner). Prefer the latter: move the disambiguation check inside `sendAICommand`.

- [ ] **Step 2: Add import to js/main.js**

```js
import { initUI, setActiveTab, isTypingInUI } from './ui.js';
```

- [ ] **Step 3: Remove from js/main.js**

Delete all event listener setup code and the `setActiveTab`, `isTypingInUI` functions from `main.js`. The `window.onload` callback should shrink to just initialization calls.

- [ ] **Step 4: Browser smoke test — full feature test**

Run the complete checklist from Task 5 Step 6. Every feature must work identically.

- [ ] **Step 5: Commit**

```bash
git add js/ui.js js/main.js
git commit -m "refactor: extract ui.js (all DOM event listeners, keyboard shortcuts)"
```

**Rollback:** `git checkout js/main.js && rm js/ui.js`

---

## Task 19: Finalize js/main.js

**Files:** Modify `js/main.js`

After all extractions, `main.js` should contain only: imports, `window` globals for HTML onclick compatibility, and the `window.onload` bootstrap.

- [ ] **Step 1: Verify main.js contains only these three sections**

Section A — All imports:
```js
import { state } from './state.js';
import { addMessageToLog, indexScene, findObjectsByClass, makeTextSprite } from './utils.js';
import { initScene, updateDynamicGrid, onWindowResize, startAnimateLoop, resetView } from './scene.js';
import { selectObject, clearSelection, highlightAllModels, clearAllHighlights,
         getSelectedObjects, setSelectedObjects, removeObject,
         duplicateSelectedObject, onCanvasClick, onCanvasMouseMove } from './selection.js';
import { setTransformMode, setTranslateMode, setRotateMode, setScaleMode } from './transform.js';
import { initVoice, speakResponse, toggleVoice } from './voice.js';
import { beginUndoGroup, addUndoAction, endUndoGroup, undo, redo,
         getCurrentState, restoreState, updateUndoRedoButtons } from './history.js';
import { createPrimitive } from './primitives.js';
import { RANDOM_MODEL_URLS, validateFile, loadModel, loadModelFromURL, saveModel } from './loader.js';
import { enterFaceEditMode, exitFaceEditMode, confirmExtrude, cancelExtrude,
         updateExtrudeDistance, handleExtrudeKeydown,
         handleDeleteCommand, handleColorCommand } from './faceEdit.js';
import { sendAICommand, testAIConnection } from './ai.js';
import { goToEditor, goBack } from './navigation.js';
import { initUI, setActiveTab } from './ui.js';
```

Section B — `window` globals for HTML onclick attributes:
```js
window.goBack = goBack;
window.cancelExtrude = cancelExtrude;
window.confirmExtrude = confirmExtrude;
window.updateExtrudeDistance = updateExtrudeDistance;
window.handleExtrudeKeydown = handleExtrudeKeydown;
// Legacy window globals (kept for safety during Phase 1)
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

Section C — `window.onload`:
```js
window.onload = () => {
    initScene();
    startAnimateLoop();
    initVoice((transcript) => sendAICommand(transcript));
    initUI();
    testAIConnection();
    addMessageToLog('System', 'Welcome to the AI VR CAD Editor! Choose "Create Empty Model", "Edit Existing Model", or "Load Random Model".');
    updateUndoRedoButtons();
};
```

- [ ] **Step 2: Delete any remaining function definitions from main.js**

If any function definitions remain in `main.js` (not in any module yet), they must either be extracted to an appropriate module or confirmed as intentionally in `main.js`. There should be no function definitions left at this point.

- [ ] **Step 3: Full final browser test**

Run all checks from Task 5 Step 6 plus:
- Open browser DevTools Network tab — verify `js/state.js`, `js/utils.js`, `js/scene.js`, etc. all load with HTTP 200
- Verify no 404 errors for any module file
- Verify no console errors of any kind

- [ ] **Step 4: Verify file sizes**

```bash
# Check index.html is now small
wc -c index.html  # Should be ~5KB, was 482KB
wc -l js/main.js  # Should be < 60 lines
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "refactor: Phase 1 complete — index.html split into 13 ES modules"
```

---

## Rollback Reference

If any step breaks the app irreparably:

```bash
# Rollback a single file
git checkout <filename>

# Rollback everything to last commit
git checkout -- .

# View what changed since last commit
git diff

# View commit history
git log --oneline
```

The most dangerous steps are Task 5 (moving to module), Task 6 (state migration), and Task 15 (faceEdit — largest extraction). Each has a commit immediately before it, so rollback to that commit if needed.

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Split index.html into modules | Tasks 7–18 |
| Preserve all functionality | Browser tests in each task |
| No new features | Spec section 2, enforced throughout |
| No bundler/framework | No npm install steps, no config files |
| Three.js stays on CDN | Task 5 Step 3 (import map removed, CDN scripts kept) |
| Shared state.js object | Task 6 |
| Dead code removal | Task 2 |
| Legacy backend moved | Task 3 |
| CSS extracted | Task 4 |
| window globals for onclick | Task 5 Step 5, Task 19 Section B |
| Git checkpoints | Every task ends with a commit step |
| Rollback advice | Every risky task has Rollback section |
| ai.js ↔ voice.js no circular | Task 11 (initVoice callback pattern) |
| loader.js ↔ navigation.js no circular | Tasks 14 + 17 (ui.js orchestrates both) |
| restoreState parameter conflict | Task 12 Step 1 (renamed to snapshot) |

**No placeholders found.** All steps include exact code, exact commands, or explicit "move verbatim" instructions with the function list specified.

**Type consistency:** `state` object properties match between `state.js` definition (Task 6) and usage throughout all modules. `speakResponse` is consistently imported from `voice.js` in all modules that need it.
