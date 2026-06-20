import { state } from './state.js';

const RUNTIME_USER_DATA_KEYS = new Set([
    'initialMaterial',
    'originalMaterial',
    'originalMesh',
    'faceGroups',
    'coloredFaces',
    'typeIndex',
    'transformListener',
    'moveListener',
    'selectedModels',
    'originalPositions',
    'originalTransforms',
]);

function makeSerializableUserData(userData) {
    const seen = new WeakSet();
    const json = JSON.stringify(userData || {}, (key, value) => {
        if (RUNTIME_USER_DATA_KEYS.has(key) || typeof value === 'function') return undefined;
        if (!value || typeof value !== 'object') return value;
        if (
            value.isObject3D ||
            value.isMaterial ||
            value.isTexture ||
            value.isBufferGeometry ||
            value instanceof Map ||
            value instanceof Set ||
            value instanceof Blob
        ) {
            return undefined;
        }
        if (seen.has(value)) return undefined;
        seen.add(value);
        return value;
    });

    return json ? JSON.parse(json) : {};
}

function isEditorOnlyObject(object) {
    const data = object.userData || {};
    return Boolean(
        data.isSelectionOutline ||
        data.isOverlay ||
        data.isOutline ||
        data.isExtrudeArrow ||
        data.isCollisionBox ||
        data.isGroupHelper ||
        data.isGridLabel
    );
}

function restoreCloneMaterials(source, clone) {
    const originals = state.originalMaterialProperties.get(source.uuid)
        || state.allHighlightsOriginalMaterials.get(source.uuid);
    if (originals && clone.material) {
        clone.material = Array.isArray(clone.material)
            ? originals.map(material => material.clone())
            : originals[0]?.clone() || clone.material;
    }
    source.children.forEach((child, index) => {
        if (clone.children[index]) restoreCloneMaterials(child, clone.children[index]);
    });
}

function removeEditorOnlyObjects(root) {
    const remove = [];
    root.traverse(object => {
        if (object !== root && isEditorOnlyObject(object)) remove.push(object);
    });
    remove.forEach(object => object.parent?.remove(object));
}

function prepareModelsForExport(models) {
    const savedUserData = [];
    const savedVisibility = [];

    models.forEach(model => {
        model.traverse(object => {
            savedUserData.push([object, object.userData]);
            object.userData = makeSerializableUserData(object.userData);

            if (isEditorOnlyObject(object)) {
                savedVisibility.push([object, object.visible]);
                object.visible = false;
            }
        });
    });

    return () => {
        savedVisibility.forEach(([object, visible]) => {
            object.visible = visible;
        });
        savedUserData.forEach(([object, userData]) => {
            object.userData = userData;
        });
    };
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function defaultFilename() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `cad-scene-${timestamp}.glb`;
}

export function createSerializableModelClones() {
    const restoreModels = prepareModelsForExport(state.loadedModels);
    try {
        return state.loadedModels.map(model => {
            const clone = model.clone(true);
            restoreCloneMaterials(model, clone);
            removeEditorOnlyObjects(clone);
            return clone;
        });
    } finally {
        restoreModels();
    }
}

export async function saveSceneAsGLB(filename = defaultFilename()) {
    if (state.loadedModels.length === 0) {
        throw new Error('There are no models in the scene to save.');
    }
    if (typeof THREE === 'undefined' || typeof THREE.GLTFExporter !== 'function') {
        throw new Error('The GLB exporter is unavailable. Refresh the editor and try again.');
    }

    const exportScene = new THREE.Scene();
    exportScene.name = 'Forma Twin Scene';
    createSerializableModelClones().forEach(model => exportScene.add(model));
    const result = await new Promise((resolve, reject) => {
        const exporter = new THREE.GLTFExporter();
        try {
            exporter.parse(
                exportScene,
                resolve,
                {
                    binary: true,
                    onlyVisible: true,
                    truncateDrawRange: true,
                }
            );
        } catch (error) {
            reject(error);
        }
    });

    downloadBlob(new Blob([result], { type: 'model/gltf-binary' }), filename);
    return filename;
}
