/**
 * Forma Link — Guided Onboarding Tour
 *
 * HOW TO EDIT STEPS:
 *   Update the STEPS array below. Each step object supports:
 *     title        {string}   — tooltip heading
 *     body         {string}   — tooltip body (HTML allowed)
 *     targetId     {string}   — element ID to highlight (null for center/finish)
 *     targetSel    {string}   — CSS selector (used when targetId is absent)
 *     placement    {string}   — 'right'|'left'|'top'|'bottom'|'center'
 *     beforeShow   {Function} — optional hook; called before the step renders
 *     waitForClick {boolean}  — hide Next until tourActionFired() is called
 *     actionHint   {string}   — pulsing text shown while waiting for click
 *     isFinish     {boolean}  — marks the final congratulation step
 */

// ─── Step Definitions ────────────────────────────────────────────────────────

const STEPS = [
  // ── Step 1 ──────────────────────────────────────────────────────────────
  {
    title: 'Step 1 — Select a Building Element',
    body:  'Click any part of the 3D building model. This inspects that object and unlocks the chatbot, colour, and digital twin tools for it.',
    targetId:     'cadViewer',
    placement:    'right',
    waitForClick: true,
    actionHint:   '👆 Click any element in the model to continue…',
  },

  // ── Step 2 ──────────────────────────────────────────────────────────────
  {
    title: 'Step 2 — Object Inspector',
    body:  'After selecting, the <b>Object Inspector</b> shows BIM properties — category, family, level, IFC GUID, and dimensions. Use the colour picker to change the element\'s appearance.',
    targetId:  'cadModeObject',
    placement: 'left',
    beforeShow() {
      activateTab('object');
    },
  },

  // ── Step 3 ──────────────────────────────────────────────────────────────
  {
    title: 'Step 3 — AI Chatbot',
    body:  'Ask the chatbot to control or explain the selected element. Try:<ul><li>"Change this element color to blue."</li><li>"Rotate the selected element 90°."</li><li>"Scale this element larger."</li><li>"What is this object?"</li></ul>',
    targetId:  'chatTabButton',
    placement: 'bottom',
    beforeShow() {
      const btn = document.getElementById('chatTabButton');
      if (btn && !btn.classList.contains('active')) btn.click();
    },
  },

  // ── Step 4 ──────────────────────────────────────────────────────────────
  {
    title: 'Step 4 — Link Documents & URLs',
    body:  'Connect maintenance records, product data sheets, or reference links to any selected BIM element. Paste a URL, click <b>Save URL</b>, and open it anytime with <b>Open ↗</b>.',
    targetId:  'cadModeObject',
    placement: 'left',
    beforeShow() {
      // Chat hides the sidebar-workspace, so close it first before switching tabs
      const chatBtn = document.getElementById('chatTabButton');
      if (chatBtn && chatBtn.classList.contains('active')) chatBtn.click();
      activateTab('object');
    },
  },

  // ── Step 5 ──────────────────────────────────────────────────────────────
  {
    title: 'Step 5 — Digital Twin Layers',
    body:  'Visualise live building performance on the model:<br><b>Energy</b> — usage by zone or system.<br><b>Occupancy</b> — activity by floor or room.<br><b>Maintenance</b> — elements needing service or inspection.',
    targetSel: '.digital-twin-actions',
    placement: 'left',
    beforeShow() {
      const chatBtn = document.getElementById('chatTabButton');
      if (chatBtn && chatBtn.classList.contains('active')) chatBtn.click();
      activateTab('layers');
    },
  },

  // ── Step 6 ──────────────────────────────────────────────────────────────
  {
    title: 'Step 6 — Live Weather Data',
    body:  'Outdoor conditions are integrated with the digital twin to support energy analysis and operational decisions. Data updates automatically; a cached fallback is used when the live source is unavailable.',
    targetSel: '.digital-twin-values',
    placement: 'left',
    beforeShow() {
      const chatBtn = document.getElementById('chatTabButton');
      if (chatBtn && chatBtn.classList.contains('active')) chatBtn.click();
      activateTab('layers');
    },
  },

  // ── Step 7 ──────────────────────────────────────────────────────────────
  {
    title: 'Step 7 — Level & Structure Filters',
    body:  'Use the <b>Level Filter</b> dropdown to isolate a specific floor. Switch between <b>Ghost</b> (dim other levels) or <b>Hide</b> mode to reduce visual clutter in large BIM models.',
    targetSel: '.digital-twin-level-filter',
    placement: 'left',
    beforeShow() {
      const chatBtn = document.getElementById('chatTabButton');
      if (chatBtn && chatBtn.classList.contains('active')) chatBtn.click();
      activateTab('layers');
    },
  },

  // ── Step 8 ──────────────────────────────────────────────────────────────
  {
    title: 'Step 8 — View Controls',
    body:  'Jump to standard camera angles with <b>Top / Front / Right / Iso</b>. Press <b>Fit</b> to frame the full model. Use <b>Structure</b> in the toolbar to highlight IFC categories.',
    targetId:  'viewToolbar',
    placement: 'top',
  },

  // ── Step 9 — Finish ─────────────────────────────────────────────────────
  {
    title: "You're all set! 🎉",
    body:  'Start by selecting a building element, then explore its BIM data, attach documents, control it with the chatbot, and activate digital twin layers to visualise building performance.<br><br>You can replay this guide anytime from the <b>Guide</b> button in the bottom-right corner.',
    targetId:  null,
    placement: 'center',
    isFinish:  true,
  },
];

// ─── Constants ───────────────────────────────────────────────────────────────

const LS_KEY = 'forma-link-tour-v1';

// ─── State ───────────────────────────────────────────────────────────────────

let _step   = -1;
let _active = false;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function $id(id) { return document.getElementById(id); }

function activateTab(mode) {
  const btn = document.querySelector(`[data-cad-mode="${mode}"]`);
  if (btn && !btn.classList.contains('active')) btn.click();
}

function getTarget(step) {
  if (step.targetId)  return $id(step.targetId);
  if (step.targetSel) return document.querySelector(step.targetSel);
  return null;
}

// ─── DOM Construction (idempotent) ────────────────────────────────────────────

function buildDOM() {
  if ($id('tourOverlay')) return;

  document.body.insertAdjacentHTML('beforeend', `
    <!-- Tour overlay — added by tour.js -->
    <div id="tourOverlay" role="dialog" aria-modal="false" aria-label="Guided tour">

      <!-- Dim backdrop for center (finish) step -->
      <div id="tourBackdrop"></div>

      <!-- Orange highlight ring positioned over the target element -->
      <div id="tourHighlight" aria-hidden="true"></div>

      <!-- Animated pointer/finger icon (shown while waiting for user click) -->
      <div id="tourPointer" aria-hidden="true">
        <svg viewBox="0 0 36 36" fill="none">
          <circle cx="18" cy="18" r="16" fill="rgba(245,158,11,0.15)" stroke="#f59e0b" stroke-width="2"/>
          <path d="M18 10v12M12 18l6 6 6-6" stroke="#f59e0b" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>

      <!-- Tooltip card -->
      <div id="tourTooltip">
        <div class="tour-tt-header">
          <span id="tourStepPill"></span>
          <button id="tourSkipBtn" title="Skip guide">Skip</button>
        </div>
        <h3 id="tourTitle"></h3>
        <div id="tourBody"></div>
        <div id="tourActionHint"></div>
        <div class="tour-tt-footer">
          <button id="tourBackBtn"  class="tour-btn-ghost"   style="display:none">← Back</button>
          <button id="tourNextBtn"  class="tour-btn-primary"                     >Next →</button>
          <button id="tourDoneBtn"  class="tour-btn-primary" style="display:none">Get Started</button>
        </div>
      </div>
    </div>

    <!-- Persistent "replay guide" button (shown in editor) -->
    <button id="tourStartBtn" title="Replay guide" aria-label="Start guide">
      <svg viewBox="0 0 20 20" fill="none" width="15" height="15">
        <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.8"/>
        <path d="M10 6v4l2.5 2.5" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round"/>
      </svg>
      Guide
    </button>
  `);

  $id('tourSkipBtn') .addEventListener('click', endTour);
  $id('tourNextBtn') .addEventListener('click', nextStep);
  $id('tourBackBtn') .addEventListener('click', prevStep);
  $id('tourDoneBtn') .addEventListener('click', endTour);
  $id('tourStartBtn').addEventListener('click', startTour);
}

// ─── Highlight positioning ────────────────────────────────────────────────────

function positionHighlight(target, step) {
  const hl = $id('tourHighlight');
  const overlay = $id('tourOverlay');

  if (!target || step.placement === 'center') {
    hl.classList.add('hl-hidden');
    overlay.classList.add('tour-center');
    return;
  }

  overlay.classList.remove('tour-center');
  const r   = target.getBoundingClientRect();
  const pad = 7;
  hl.style.left   = (r.left - pad) + 'px';
  hl.style.top    = (r.top  - pad) + 'px';
  hl.style.width  = (r.width  + pad * 2) + 'px';
  hl.style.height = (r.height + pad * 2) + 'px';
  hl.classList.remove('hl-hidden');
}

// ─── Tooltip positioning ──────────────────────────────────────────────────────

function positionTooltip(target, step) {
  const tt = $id('tourTooltip');
  tt.classList.remove('tt-ready');
  tt.style.left = '';
  tt.style.top  = '';

  requestAnimationFrame(() => {
    const tw = tt.offsetWidth  || 310;
    const th = tt.offsetHeight || 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const M  = 18; // margin from target / viewport edge

    let left, top;

    if (!target || step.placement === 'center') {
      left = (vw - tw) / 2;
      top  = (vh - th) / 2;
    } else {
      const r = target.getBoundingClientRect();
      switch (step.placement) {
        case 'right':
          left = r.right + M;
          top  = r.top + (r.height - th) / 2;
          break;
        case 'left':
          left = r.left - tw - M;
          top  = r.top + (r.height - th) / 2;
          break;
        case 'bottom':
          left = r.left + (r.width - tw) / 2;
          top  = r.bottom + M;
          break;
        case 'top':
          left = r.left + (r.width - tw) / 2;
          top  = r.top - th - M;
          break;
        default:
          left = r.right + M;
          top  = r.top + (r.height - th) / 2;
      }
    }

    // Clamp to viewport
    left = Math.max(M, Math.min(left, vw - tw - M));
    top  = Math.max(M, Math.min(top,  vh - th - M));

    tt.style.left = left + 'px';
    tt.style.top  = top  + 'px';
    tt.classList.add('tt-ready');
  });
}

// ─── Pointer icon positioning ─────────────────────────────────────────────────

function positionPointer(target, step) {
  const ptr = $id('tourPointer');
  if (step.waitForClick && target) {
    const r = target.getBoundingClientRect();
    ptr.style.left    = (r.left + r.width  / 2 - 18) + 'px';
    ptr.style.top     = (r.top  + r.height / 2 - 18) + 'px';
    ptr.style.display = 'block';
  } else {
    ptr.style.display = 'none';
  }
}

// ─── Render a step ───────────────────────────────────────────────────────────

function showStep(index) {
  const step = STEPS[index];
  if (!step) { endTour(); return; }

  // Optional panel-open hook
  if (typeof step.beforeShow === 'function') {
    try { step.beforeShow(); } catch (_) { /* non-fatal */ }
  }

  // Populate text
  $id('tourTitle').textContent = step.title;
  $id('tourBody').innerHTML    = step.body;

  const total = STEPS.length - 1; // exclude finish step
  $id('tourStepPill').textContent = step.isFinish
    ? 'Complete'
    : `Step ${index + 1} of ${total}`;

  // Back / Next / Done buttons
  $id('tourBackBtn').style.display = (index === 0 ? 'none' : '');
  $id('tourNextBtn').style.display = (step.waitForClick || step.isFinish ? 'none' : '');
  $id('tourDoneBtn').style.display = (step.isFinish ? '' : 'none');

  // Action hint
  const hint = $id('tourActionHint');
  if (step.waitForClick) {
    hint.textContent   = step.actionHint || 'Complete the action to continue…';
    hint.style.display = 'block';
    hint.style.color   = '';
  } else {
    hint.style.display = 'none';
  }

  // Delay long enough for any CSS transitions (e.g. chat-close) to settle
  setTimeout(() => {
    const target = getTarget(step);
    positionHighlight(target, step);
    positionTooltip(target, step);
    positionPointer(target, step);
  }, 200);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Start the tour from step 0. */
export function startTour() {
  buildDOM();
  _step   = 0;
  _active = true;
  $id('tourOverlay').classList.remove('tour-hiding');
  $id('tourOverlay').classList.add('tour-visible');
  showStep(0);
}

/** Advance to the next step. */
export function nextStep() {
  if (!_active) return;
  _step++;
  showStep(_step);
}

/** Go back one step. */
function prevStep() {
  if (!_active || _step <= 0) return;
  _step--;
  showStep(_step);
}

/** End / dismiss the tour and store completion. */
export function endTour() {
  _active = false;
  _step   = -1;
  localStorage.setItem(LS_KEY, '1');

  const overlay = $id('tourOverlay');
  if (overlay) {
    overlay.classList.remove('tour-visible');
    overlay.classList.add('tour-hiding');
    setTimeout(() => overlay.classList.remove('tour-hiding'), 400);
  }
}

/**
 * Called by main.js inside onObjectSelected when the user clicks a BIM element.
 * Advances the tour if we're on the "waitForClick" step.
 */
export function tourOnElementSelected() {
  if (!_active) return;
  const step = STEPS[_step];
  if (!step || !step.waitForClick) return;

  const hint = $id('tourActionHint');
  if (hint) {
    hint.textContent = '✓ Element selected!';
    hint.style.color = '#22c55e';
  }
  setTimeout(() => nextStep(), 900);
}

/**
 * Show the guide automatically for first-time users.
 * Call this from main.js after transitioning to the editor page.
 */
export function startTourIfFirstTime() {
  buildDOM();
  // Show the replay button whenever we're in editor mode
  const replayBtn = $id('tourStartBtn');
  if (replayBtn) replayBtn.classList.add('tour-btn-show');

  if (!localStorage.getItem(LS_KEY)) {
    // Delay slightly so the canvas and model have a moment to initialise
    setTimeout(startTour, 1400);
  }
}

/** Hide the Guide button (call when leaving editor). */
export function hideTourBtn() {
  const btn = $id('tourStartBtn');
  if (btn) btn.classList.remove('tour-btn-show');
}
