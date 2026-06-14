import { state } from './state.js';
import { addMessageToLog } from './utils.js';
import { clearSelection, clearAllHighlights } from './selection.js';
import { createSerializableModelClones } from './exporter.js';
import { updateUndoRedoButtons } from './history.js';

const AUTOSAVE_KEY = 'ai-vr-cad-editor-autosave-v1';
let refreshTools = () => {};

function downloadText(text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function serializeProject() {
    const root = new THREE.Group();
    root.name = 'CAD Project Models';
    createSerializableModelClones().forEach(model => root.add(model));

    return {
        format: 'ai-vr-cad-project',
        version: 1,
        savedAt: new Date().toISOString(),
        models: root.toJSON(),
        camera: state.camera ? {
            position: state.camera.position.toArray(),
            rotation: state.camera.rotation.toArray(),
            target: state.controls?.target?.toArray() || [0, 0, 0],
        } : null,
        editor: {
            snapEnabled: document.getElementById('cadSnapEnabled')?.checked || false,
            snapSize: Number(document.getElementById('cadSnapSize')?.value) || 0.5,
            sectionEnabled: document.getElementById('cadSectionEnabled')?.checked || false,
            sectionAxis: document.getElementById('cadSectionAxis')?.value || 'Y',
            sectionInvert: document.getElementById('cadSectionInvert')?.checked || false,
            sectionOffset: Number(document.getElementById('cadSectionOffset')?.value) || 0,
        },
    };
}

function disposeModel(model) {
    model.traverse(object => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach(material => material?.dispose?.());
        else object.material?.dispose?.();
    });
}

function clearTransientEditingState() {
    state.faceEditState.groups.forEach(group => {
        if (group.overlay) state.scene.remove(group.overlay);
        if (group.outline) state.scene.remove(group.outline);
        group.overlay?.geometry?.dispose?.();
        group.overlay?.material?.dispose?.();
        group.outline?.geometry?.dispose?.();
        group.outline?.material?.dispose?.();
    });
    state.extrudeUI.previewMeshes.forEach(mesh => {
        state.scene.remove(mesh);
        mesh.geometry?.dispose?.();
        mesh.material?.dispose?.();
    });
    if (state.extrudeUI.arrow) state.scene.remove(state.extrudeUI.arrow);
    state.faceEditState = {
        targetMesh: null,
        groups: [],
        selectedGroupId: null,
        isActive: false,
        multiSelect: false,
        selectedFaceIds: new Set(),
    };
    state.extrudeUI = {
        active: false,
        faceIds: [],
        targetMesh: null,
        arrow: null,
        previewMeshes: [],
        depth: 0,
        drag: {
            on: false,
            axisOrigin: null,
            axisDirection: null,
            startClientX: 0,
            startClientY: 0,
            screenDirection: null,
            pixelsPerUnit: 1,
            startDepth: 0,
        },
    };
    if (state.controls) state.controls.enabled = true;
    state.transformControls?.detach();
    const extrudePanel = document.getElementById('extrudePanel');
    if (extrudePanel) extrudePanel.style.display = 'none';
}

function fitLoadedProjectView() {
    if (!state.camera || !state.controls || state.loadedModels.length === 0) return;

    const bounds = new THREE.Box3();
    state.loadedModels.forEach(model => bounds.expandByObject(model));
    if (bounds.isEmpty()) return;

    const center = bounds.getCenter(new THREE.Vector3());
    const maxDimension = Math.max(...bounds.getSize(new THREE.Vector3()).toArray(), 0.01);
    const fitDistance = maxDimension * 2.5;
    const direction = state.camera.position.clone().sub(state.controls.target);
    if (direction.lengthSq() < 1e-8) direction.set(1, 1, 1);
    direction.normalize();
    state.controls.target.copy(center);
    state.camera.position.copy(center).addScaledVector(direction, fitDistance);
    state.camera.near = Math.max(0.01, maxDimension / 100000);
    state.camera.far = Math.max(1000, maxDimension * 200);
    state.camera.updateProjectionMatrix();
    state.controls.update();
    state.navigationModelSize = maxDimension;
}

export function loadProjectData(project) {
    if (project?.format !== 'ai-vr-cad-project' || !project.models) {
        throw new Error('This is not a valid AI VR CAD project file.');
    }

    clearTransientEditingState();
    clearSelection();
    clearAllHighlights();
    state.loadedModels.forEach(model => {
        state.scene.remove(model);
        disposeModel(model);
    });
    state.loadedModels = [];
    state.undoStack = [];
    state.redoStack = [];
    state.currentUndoGroup = null;
    updateUndoRedoButtons();

    const parsedRoot = new THREE.ObjectLoader().parse(project.models);
    parsedRoot.children.slice().forEach(model => {
        parsedRoot.remove(model);
        model.traverse(object => {
            if (!object.isMesh || !object.material) return;
            object.userData.initialMaterial = Array.isArray(object.material)
                ? object.material.map(material => material.clone())
                : object.material.clone();
        });
        state.scene.add(model);
        state.loadedModels.push(model);
    });

    if (project.camera && state.camera) {
        state.camera.position.fromArray(project.camera.position);
        state.camera.rotation.fromArray(project.camera.rotation);
        state.controls?.target.fromArray(project.camera.target);
        state.controls?.update();
    }
    fitLoadedProjectView();

    if (project.editor) {
        const values = {
            cadSnapEnabled: project.editor.snapEnabled,
            cadSnapSize: project.editor.snapSize,
            cadSectionEnabled: project.editor.sectionEnabled,
            cadSectionAxis: project.editor.sectionAxis,
            cadSectionInvert: project.editor.sectionInvert,
            cadSectionOffset: project.editor.sectionOffset,
        };
        Object.entries(values).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (!element) return;
            if (element.type === 'checkbox') element.checked = Boolean(value);
            else element.value = value;
            element.dispatchEvent(new Event('change'));
        });
    }

    refreshTools();
    addMessageToLog('System', `Project loaded with ${state.loadedModels.length} model(s).`);
}

export function saveNativeProject() {
    if (state.loadedModels.length === 0) throw new Error('There are no models to save.');
    const project = serializeProject();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `cad-project-${timestamp}.cadproject`;
    downloadText(JSON.stringify(project), filename);
    addMessageToLog('System', `Native project saved as "${filename}".`);
    return filename;
}

export async function loadNativeProjectFile(file) {
    const project = JSON.parse(await file.text());
    loadProjectData(project);
}

export function hasAutosave() {
    return Boolean(localStorage.getItem(AUTOSAVE_KEY));
}

export function autosaveProject(statusElement) {
    if (state.loadedModels.length === 0) return;
    try {
        const project = serializeProject();
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project));
        if (statusElement) statusElement.textContent = `Autosaved ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        console.warn('[Autosave] Could not save project:', error);
        if (statusElement) statusElement.textContent = 'Autosave unavailable for this project size.';
    }
}

export function recoverAutosave() {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) throw new Error('No autosaved project is available.');
    loadProjectData(JSON.parse(raw));
}

export function initProjectPersistence(onRefresh) {
    refreshTools = onRefresh || refreshTools;
    const status = document.getElementById('cadAutosaveStatus');
    setInterval(() => autosaveProject(status), 20000);
    window.addEventListener('beforeunload', () => autosaveProject(status));
}
