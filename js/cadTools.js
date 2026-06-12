import { state } from './state.js';
import { addMessageToLog } from './utils.js';
import { getSelectedObjects, selectObject, setSelectedObjects, clearSelection } from './selection.js';
import { getCurrentState, updateUndoRedoButtons } from './history.js';
import {
    saveNativeProject,
    loadNativeProjectFile,
    recoverAutosave,
    hasAutosave,
    initProjectPersistence,
} from './project.js';

const sectionPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
let isolateModel = null;
let lastTreeSignature = '';
let lastInspectorSignature = '';

function setCADMode(mode) {
    document.querySelectorAll('.cad-mode-tab').forEach(button => {
        button.classList.toggle('active', button.dataset.cadMode === mode);
    });
    document.querySelectorAll('.cad-mode-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `cadMode${mode.charAt(0).toUpperCase()}${mode.slice(1)}`);
    });
}

function selectedTopModels() {
    const found = new Set();
    getSelectedObjects().forEach(object => {
        let current = object;
        while (current && !state.loadedModels.includes(current)) current = current.parent;
        if (current) found.add(current);
    });
    return [...found];
}

function pushUndoState() {
    if (state.loadedModels.length > 0) {
        state.undoStack.push(getCurrentState());
        state.redoStack = [];
        updateUndoRedoButtons();
    }
}

function refreshObjectTree(force = false) {
    const tree = document.getElementById('cadObjectTree');
    if (!tree) return;
    const selected = new Set(selectedTopModels().map(model => model.uuid));
    const signature = state.loadedModels.map(model =>
        `${model.uuid}:${model.name}:${model.visible}:${Boolean(model.userData.cadLocked)}:${selected.has(model.uuid)}`
    ).join('|');
    if (!force && signature === lastTreeSignature) return;
    lastTreeSignature = signature;

    tree.innerHTML = '';
    state.loadedModels.forEach(model => {
        const row = document.createElement('div');
        row.className = `cad-tree-row${selected.has(model.uuid) ? ' selected' : ''}`;
        row.dataset.uuid = model.uuid;
        row.innerHTML = `
            <span class="cad-tree-name" title="Click to select; Ctrl-click for multi-select">${model.name || 'Unnamed Model'}</span>
            <button data-action="visibility" title="Show/hide">${model.visible ? 'Eye' : 'Off'}</button>
            <button data-action="lock" title="Lock/unlock">${model.userData.cadLocked ? 'Lock' : 'Free'}</button>
            <button data-action="isolate" title="Isolate model">Iso</button>`;
        tree.appendChild(row);
    });

    const sectionSlider = document.getElementById('cadSectionOffset');
    if (sectionSlider && state.loadedModels.length > 0) {
        const bounds = new THREE.Box3();
        state.loadedModels.forEach(model => bounds.expandByObject(model));
        const extent = Math.max(1, bounds.getSize(new THREE.Vector3()).length());
        sectionSlider.min = -extent;
        sectionSlider.max = extent;
    }
}

function handleTreeClick(event) {
    const row = event.target.closest('.cad-tree-row');
    if (!row) return;
    const model = state.loadedModels.find(item => item.uuid === row.dataset.uuid);
    if (!model) return;
    const action = event.target.dataset.action;

    if (action === 'visibility') {
        model.visible = !model.visible;
    } else if (action === 'lock') {
        model.userData.cadLocked = !model.userData.cadLocked;
        if (model.userData.cadLocked && selectedTopModels().includes(model)) clearSelection();
    } else if (action === 'isolate') {
        isolateModel = isolateModel === model ? null : model;
        state.loadedModels.forEach(item => {
            item.visible = !isolateModel || item === isolateModel;
        });
    } else if (event.target.classList.contains('cad-tree-name')) {
        if (event.ctrlKey || event.metaKey) {
            const next = new Set(selectedTopModels());
            if (next.has(model)) next.delete(model);
            else next.add(model);
            setSelectedObjects([...next]);
        } else {
            selectObject(model);
            setCADMode('object');
        }
    }
    refreshObjectTree(true);
}

function handleTreeRename(event) {
    const row = event.target.closest('.cad-tree-row');
    if (!row || !event.target.classList.contains('cad-tree-name')) return;
    const model = state.loadedModels.find(item => item.uuid === row.dataset.uuid);
    if (!model) return;
    const name = prompt('Model name', model.name || 'Unnamed Model');
    if (name?.trim()) {
        pushUndoState();
        model.name = name.trim();
        refreshObjectTree(true);
    }
}

function readNumber(id, fallback) {
    const value = Number(document.getElementById(id)?.value);
    return Number.isFinite(value) ? value : fallback;
}

function refreshTransformInputs() {
    const object = getSelectedObjects()[0];
    if (!object || document.activeElement?.closest?.('.cad-tool-grid')) return;
    const values = {
        cadPosX: object.position.x, cadPosY: object.position.y, cadPosZ: object.position.z,
        cadRotX: THREE.MathUtils.radToDeg(object.rotation.x),
        cadRotY: THREE.MathUtils.radToDeg(object.rotation.y),
        cadRotZ: THREE.MathUtils.radToDeg(object.rotation.z),
        cadScaleX: object.scale.x, cadScaleY: object.scale.y, cadScaleZ: object.scale.z,
    };
    Object.entries(values).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input) input.value = Number(value.toFixed(4));
    });
}

function applyPreciseTransform() {
    const objects = getSelectedObjects();
    if (objects.length === 0) return addMessageToLog('System', 'Select an object before applying a precise transform.');
    pushUndoState();
    objects.forEach(object => {
        object.position.set(readNumber('cadPosX', object.position.x), readNumber('cadPosY', object.position.y), readNumber('cadPosZ', object.position.z));
        object.rotation.set(
            THREE.MathUtils.degToRad(readNumber('cadRotX', THREE.MathUtils.radToDeg(object.rotation.x))),
            THREE.MathUtils.degToRad(readNumber('cadRotY', THREE.MathUtils.radToDeg(object.rotation.y))),
            THREE.MathUtils.degToRad(readNumber('cadRotZ', THREE.MathUtils.radToDeg(object.rotation.z)))
        );
        object.scale.set(readNumber('cadScaleX', object.scale.x), readNumber('cadScaleY', object.scale.y), readNumber('cadScaleZ', object.scale.z));
        object.updateMatrixWorld(true);
    });
    addMessageToLog('System', `Applied precise transform to ${objects.length} object(s).`);
}

function updateSnapping() {
    if (!state.transformControls) return;
    const enabled = document.getElementById('cadSnapEnabled').checked;
    const size = Math.max(0.001, readNumber('cadSnapSize', 0.5));
    state.transformControls.setTranslationSnap(enabled ? size : null);
    state.transformControls.setRotationSnap(enabled ? THREE.MathUtils.degToRad(15) : null);
    state.transformControls.setScaleSnap(enabled ? size : null);
    addMessageToLog('System', enabled ? `Snapping enabled at ${size} units / 15 degrees.` : 'Snapping disabled.');
}

function measureObject(object) {
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    let area = 0;
    let volume = 0;
    object.traverse(mesh => {
        if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
        const position = mesh.geometry.attributes.position;
        const index = mesh.geometry.index;
        const triangleCount = index ? index.count / 3 : position.count / 3;
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        const ab = new THREE.Vector3(), ac = new THREE.Vector3(), cross = new THREE.Vector3();
        for (let i = 0; i < triangleCount; i++) {
            const ia = index ? index.getX(i * 3) : i * 3;
            const ib = index ? index.getX(i * 3 + 1) : i * 3 + 1;
            const ic = index ? index.getX(i * 3 + 2) : i * 3 + 2;
            a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
            b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
            c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
            ab.subVectors(b, a);
            ac.subVectors(c, a);
            area += cross.crossVectors(ab, ac).length() * 0.5;
            volume += a.dot(cross.crossVectors(b, c)) / 6;
        }
    });
    return { size, area, volume: Math.abs(volume), diagonal: size.length() };
}

function refreshObjectInspector() {
    const objects = getSelectedObjects();
    const empty = document.getElementById('cadObjectEmpty');
    const selected = document.getElementById('cadObjectSelected');
    if (!empty || !selected) return;

    empty.hidden = objects.length > 0;
    selected.hidden = objects.length === 0;
    if (objects.length === 0) {
        lastInspectorSignature = '';
        return;
    }

    const bounds = new THREE.Box3();
    let totalArea = 0;
    let totalVolume = 0;
    objects.forEach(object => {
        bounds.expandByObject(object);
        const measurement = measureObject(object);
        totalArea += measurement.area;
        totalVolume += measurement.volume;
    });
    const size = bounds.getSize(new THREE.Vector3());
    const planarAxis = [size.x, size.y, size.z].findIndex(value => value < Math.max(size.x, size.y, size.z) * 0.001);
    const is2D = planarAxis !== -1;
    const name = objects.length === 1 ? objects[0].name || 'Unnamed Object' : `${objects.length} objects selected`;
    const type = objects.length === 1
        ? (is2D ? '2D Shape' : objects[0].userData?.isIFCElement ? 'IFC Element' : '3D Mesh')
        : 'Multiple Selection';

    document.getElementById('cadInspectorName').textContent = name;
    document.getElementById('cadInspectorType').textContent = type;
    document.getElementById('cadInspectorDimensions').textContent =
        `${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)}`;
    document.getElementById('cadInspectorPrimaryLabel').textContent = is2D ? 'Area' : 'Volume';
    document.getElementById('cadInspectorPrimary').textContent = (is2D ? totalArea : totalVolume).toFixed(3);
    document.getElementById('cadInspectorSecondaryLabel').textContent = is2D ? 'Bounding diagonal' : 'Surface Area';
    document.getElementById('cadInspectorSecondary').textContent =
        (is2D ? size.length() : totalArea).toFixed(3);

    const signature = objects.map(object => object.uuid).join('|');
    if (signature !== lastInspectorSignature) {
        lastInspectorSignature = signature;
        setCADMode('object');
    }
}

function refreshMeasurement() {
    const output = document.getElementById('cadMeasurementOutput');
    const objects = getSelectedObjects();
    if (!output) return;
    if (objects.length === 0) {
        output.textContent = 'Select an object to measure it.';
        return;
    }
    if (objects.length >= 3) {
        const a = new THREE.Box3().setFromObject(objects[0]).getCenter(new THREE.Vector3());
        const vertex = new THREE.Box3().setFromObject(objects[1]).getCenter(new THREE.Vector3());
        const c = new THREE.Box3().setFromObject(objects[2]).getCenter(new THREE.Vector3());
        const angle = THREE.MathUtils.radToDeg(a.sub(vertex).angleTo(c.sub(vertex)));
        output.textContent = `Angle through selection centers: ${angle.toFixed(2)} degrees`;
        return;
    }
    if (objects.length === 2) {
        const a = new THREE.Box3().setFromObject(objects[0]).getCenter(new THREE.Vector3());
        const b = new THREE.Box3().setFromObject(objects[1]).getCenter(new THREE.Vector3());
        output.textContent = `Center distance: ${a.distanceTo(b).toFixed(3)} units`;
        return;
    }
    const result = measureObject(objects[0]);
    output.textContent = `Size: ${result.size.x.toFixed(3)} x ${result.size.y.toFixed(3)} x ${result.size.z.toFixed(3)} | Diagonal: ${result.diagonal.toFixed(3)} | Surface: ${result.area.toFixed(3)} | Volume: ${result.volume.toFixed(3)}`;
}

function updateSectionPlane() {
    if (!state.renderer) return;
    const enabled = document.getElementById('cadSectionEnabled').checked;
    const axis = document.getElementById('cadSectionAxis').value.toLowerCase();
    const invert = document.getElementById('cadSectionInvert').checked ? -1 : 1;
    const offset = readNumber('cadSectionOffset', 0);
    sectionPlane.normal.set(axis === 'x' ? invert : 0, axis === 'y' ? invert : 0, axis === 'z' ? invert : 0);
    sectionPlane.constant = offset;
    state.renderer.localClippingEnabled = enabled;
    state.loadedModels.forEach(model => model.traverse(object => {
        if (!object.isMesh || !object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => {
            material.clippingPlanes = enabled ? [sectionPlane] : [];
            material.clipShadows = true;
            material.needsUpdate = true;
        });
    }));
}

function createBoxFromBounds(bounds, material, name) {
    const size = bounds.getSize(new THREE.Vector3());
    if (size.x <= 1e-6 || size.y <= 1e-6 || size.z <= 1e-6) return null;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material.clone());
    mesh.position.copy(bounds.getCenter(new THREE.Vector3()));
    mesh.name = name;
    mesh.userData.isPrimitive = true;
    mesh.userData.primitiveType = 'cube';
    mesh.userData.initialMaterial = mesh.material.clone();
    return mesh;
}

function removeTopModels(models) {
    models.forEach(model => {
        state.scene.remove(model);
        const index = state.loadedModels.indexOf(model);
        if (index >= 0) state.loadedModels.splice(index, 1);
    });
}

function subtractBounds(a, overlap) {
    const pieces = [];
    const add = (minX, minY, minZ, maxX, maxY, maxZ) => pieces.push(new THREE.Box3(
        new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ)
    ));
    add(a.min.x, a.min.y, a.min.z, overlap.min.x, a.max.y, a.max.z);
    add(overlap.max.x, a.min.y, a.min.z, a.max.x, a.max.y, a.max.z);
    add(overlap.min.x, a.min.y, a.min.z, overlap.max.x, overlap.min.y, a.max.z);
    add(overlap.min.x, overlap.max.y, a.min.z, overlap.max.x, a.max.y, a.max.z);
    add(overlap.min.x, overlap.min.y, a.min.z, overlap.max.x, overlap.max.y, overlap.min.z);
    add(overlap.min.x, overlap.min.y, overlap.max.z, overlap.max.x, overlap.max.y, a.max.z);
    return pieces;
}

function applyBoolean(operation) {
    const models = selectedTopModels();
    if (models.length !== 2) return addMessageToLog('System', 'Select exactly two top-level objects for a boolean operation.');
    if (models.some(model => model.userData.cadLocked)) return addMessageToLog('System', 'Unlock both objects before using boolean tools.');
    pushUndoState();
    clearSelection();
    const [aModel, bModel] = models;
    const a = new THREE.Box3().setFromObject(aModel);
    const b = new THREE.Box3().setFromObject(bModel);
    const materialSource = aModel.getObjectByProperty('isMesh', true)?.material;
    const material = (Array.isArray(materialSource) ? materialSource[0] : materialSource) || new THREE.MeshStandardMaterial({ color: 0x4da3ff });
    const results = [];

    if (operation === 'union') {
        const group = new THREE.Group();
        group.name = `Union (${aModel.name} + ${bModel.name})`;
        state.scene.add(group);
        group.attach(aModel);
        group.attach(bModel);
        results.push(group);
    } else {
        const overlap = a.clone().intersect(b);
        if (overlap.isEmpty()) return addMessageToLog('System', 'The selected objects do not overlap.');
        const bounds = operation === 'intersect' ? [overlap] : subtractBounds(a, overlap);
        bounds.forEach((box, index) => {
            const mesh = createBoxFromBounds(box, material, `${operation} result ${index + 1}`);
            if (mesh) results.push(mesh);
        });
        removeTopModels(models);
        results.forEach(result => state.scene.add(result));
    }

    removeTopModels(models);
    results.forEach(result => {
        if (!result.parent) state.scene.add(result);
        result.userData.booleanOperation = operation;
        state.loadedModels.push(result);
    });
    setSelectedObjects(results);
    refreshObjectTree(true);
    addMessageToLog('System', `${operation} completed with bounds-based axis-aligned boolean tools.`);
}

function wireProjectControls() {
    const input = document.getElementById('cadProjectFileInput');
    document.getElementById('cadSaveProject').addEventListener('click', () => {
        try { saveNativeProject(); } catch (error) { addMessageToLog('System', error.message); }
    });
    document.getElementById('cadOpenProject').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
        try { if (input.files[0]) await loadNativeProjectFile(input.files[0]); }
        catch (error) { addMessageToLog('System', `Could not open project: ${error.message}`); }
        input.value = '';
    });
    const recover = document.getElementById('cadRecoverProject');
    recover.disabled = !hasAutosave();
    recover.addEventListener('click', () => {
        try { recoverAutosave(); refreshAllTools(); }
        catch (error) { addMessageToLog('System', error.message); }
    });
    initProjectPersistence(refreshAllTools);
}

export function refreshAllTools() {
    refreshObjectTree();
    refreshObjectInspector();
    refreshTransformInputs();
    refreshMeasurement();
    updateSectionPlane();
    const recover = document.getElementById('cadRecoverProject');
    if (recover) recover.disabled = !hasAutosave();
}

export function initCADTools() {
    document.querySelectorAll('.cad-mode-tab').forEach(button => {
        button.addEventListener('click', () => setCADMode(button.dataset.cadMode));
    });
    document.getElementById('cadObjectTree').addEventListener('click', handleTreeClick);
    document.getElementById('cadObjectTree').addEventListener('dblclick', handleTreeRename);
    document.getElementById('cadApplyTransform').addEventListener('click', applyPreciseTransform);
    document.getElementById('cadSnapEnabled').addEventListener('change', updateSnapping);
    document.getElementById('cadSnapSize').addEventListener('change', updateSnapping);
    document.getElementById('cadRefreshMeasurement').addEventListener('click', refreshMeasurement);
    ['cadSectionEnabled', 'cadSectionAxis', 'cadSectionInvert', 'cadSectionOffset'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateSectionPlane);
        document.getElementById(id).addEventListener('change', updateSectionPlane);
    });
    document.querySelectorAll('[data-cad-boolean]').forEach(button => {
        button.addEventListener('click', () => applyBoolean(button.dataset.cadBoolean));
    });
    wireProjectControls();
    setInterval(refreshAllTools, 750);
    refreshAllTools();
}
