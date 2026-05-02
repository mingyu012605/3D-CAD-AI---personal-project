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
