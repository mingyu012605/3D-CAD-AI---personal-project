import { state } from './state.js';
import { addMessageToLog } from './utils.js';
import { clearSelection, clearAllHighlights } from './selection.js';

const MAX_HISTORY_SIZE = 20; // Limit history size to prevent excessive memory usage
let history = [];
let historyPointer = -1;
let saveStateTimeout = null;

let _speakResponse = () => {};
let _resetView = () => {};

export function initHistoryCallbacks(cbs) {
    _speakResponse = cbs.speakResponse;
    _resetView = cbs.resetView;
}

export function getHistoryDebugState() {
    return {
        length: history.length,
        pointer: historyPointer
    };
}

export function beginUndoGroup(actionName) {
    if (state.currentUndoGroup) {
        console.warn('[beginUndoGroup] Already in undo group, ending previous group');
        endUndoGroup();
    }

    state.currentUndoGroup = {
        name: actionName,
        actions: [],
        beforeState: getCurrentState()
    };
    console.log(`[beginUndoGroup] Started group: ${actionName}`);
}

export function addUndoAction(action) {
    if (!state.currentUndoGroup) {
        console.warn('[addUndoAction] No active undo group, creating temporary group');
        beginUndoGroup('Temporary Action');
    }

    state.currentUndoGroup.actions.push(action);
}

export function endUndoGroup() {
    if (!state.currentUndoGroup) {
        console.warn('[endUndoGroup] No active undo group');
        return;
    }

    if (state.currentUndoGroup.actions.length > 0) {
        // Save the grouped action to undo stack
        state.undoStack.push({
            name: state.currentUndoGroup.name,
            beforeState: state.currentUndoGroup.beforeState,
            afterState: getCurrentState(),
            actions: state.currentUndoGroup.actions
        });

        // Limit stack size
        if (state.undoStack.length > MAX_HISTORY_SIZE) {
            state.undoStack.shift();
        }

        // Clear redo stack
        state.redoStack = [];

        console.log(`[endUndoGroup] Completed group: ${state.currentUndoGroup.name} with ${state.currentUndoGroup.actions.length} actions`);
    }

    state.currentUndoGroup = null;
    updateUndoRedoButtons();
}

// Function to save the current state of the state.scene (debounced for transform operations)
export function saveSceneStateDebounced(delay = 500) {
    if (saveStateTimeout) {
        clearTimeout(saveStateTimeout);
    }
    saveStateTimeout = setTimeout(() => {
        saveSceneState();
        saveStateTimeout = null;
    }, delay);
}

// Function to save the current state of the state.scene
export function saveSceneState() {
    // For the very first save, save the state BEFORE the action
    // This ensures undo goes back to the previous state, not empty
    if (history.length === 0 && state.loadedModels.length > 0) {
        // If this is the first save and we have objects, save the current state as baseline
        console.log("[History] Saving first state as baseline");
    }

    // Clear any redo history if a new action is performed
    if (historyPointer < history.length - 1) {
        history = history.slice(0, historyPointer + 1);
    }

    const currentState = [];
    state.loadedModels.forEach(model => {
        const modelState = {
            uuid: model.uuid, // Store UUID to identify the object when restoring
            name: model.name,
            type: model.type, // e.g., Group, Mesh
            position: model.position.toArray(),
            rotation: model.rotation.toArray(),
            scale: model.scale.toArray(),
            // Store original file data if it's an uploaded model
            isFileModel: model.userData.isFileModel || false,
            fileData: model.userData.fileData || null, // Store original file blob or URL
            // Store primitive type if it's a created primitive
            isPrimitive: model.userData.isPrimitive || false,
            primitiveType: model.userData.primitiveType || null,
            // Store material properties for meshes within this model
            materials: []
        };

        model.traverse(obj => {
            if (obj.isMesh && obj.material) {
                const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
                const initialMaterials = obj.userData.initialMaterial ? (Array.isArray(obj.userData.initialMaterial) ? obj.userData.initialMaterial : [obj.userData.initialMaterial]) : null;

                const materialStates = materials.map((mat, index) => {
                    const matState = {
                        uuid: mat.uuid,
                        color: mat.color ? mat.color.getHex() : null,
                        emissive: mat.emissive ? mat.emissive.getHex() : null,
                        emissiveIntensity: mat.emissiveIntensity !== undefined ? mat.emissiveIntensity : null,
                        // Add other relevant material properties if needed (e.g., roughness, metalness)
                    };
                    // If there's an initial material, store its properties too for true reversion
                    if (initialMaterials && initialMaterials[index]) {
                        matState.initialColor = initialMaterials[index].color ? initialMaterials[index].color.getHex() : null;
                        matState.initialEmissive = initialMaterials[index].emissive ? initialMaterials[index].emissive.getHex() : null;
                        matState.initialEmissiveIntensity = initialMaterials[index].emissiveIntensity !== undefined ? initialMaterials[index].emissiveIntensity : null;
                    }
                    return matState;
                });
                modelState.materials.push({ meshUuid: obj.uuid, states: materialStates });
            }
        });
        currentState.push(modelState);
    });

    history.push(currentState);
    historyPointer = history.length - 1;

    state.undoStack.push(getCurrentState());
    if (state.undoStack.length > MAX_HISTORY_SIZE) {
        state.undoStack.shift();
    }
    state.redoStack = [];

    // Trim history if it exceeds max size
    if (history.length > MAX_HISTORY_SIZE) {
        history.shift(); // Remove the oldest state
        historyPointer--; // Adjust pointer
    }

    console.log(`[History] Saved state. History size: ${history.length}, Pointer: ${historyPointer}`);
    updateUndoRedoButtons();
}

// Function to load a specific state from history
export async function loadSceneState(sceneState) {
    console.log("[History] Loading state.scene state...", sceneState);

    // Dispose current state.scene objects (excluding grid and axes helpers)
    // Iterate over a copy of the state.loadedModels array to avoid issues during removal
    const currentLoadedModels = [...state.loadedModels];
    currentLoadedModels.forEach(model => {
        state.scene.remove(model);
        model.traverse(child => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        });
    });
    state.loadedModels = []; // Clear current loaded models array after removal

    // Clear selection and highlights before loading new state
    clearSelection();
    clearAllHighlights();

    // Recreate objects from the saved state
    for (const modelState of sceneState) {
        let newObject;
        if (modelState.isPrimitive) {
            // Recreate primitive
            const material = new THREE.MeshStandardMaterial({ color: 0x1e90ff, metalness: 0.5, roughness: 0.5 });
            switch (modelState.primitiveType.toLowerCase()) {
                case 'box': case 'cube': newObject = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material); break;
                case 'sphere': case 'ball': newObject = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), material); break;
                case 'cylinder': case 'tube': newObject = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 32), material); break;
                case 'cone': newObject = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 32), material); break;
                case 'pyramid': newObject = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 4), material); break;
                case 'plane': newObject = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide })); break;
                case 'torus': newObject = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.2, 16, 100), material); break;
                default: console.warn(`[loadSceneState] Unknown primitive type: ${modelState.primitiveType}`); continue;
            }
            newObject.name = modelState.name;
            newObject.userData.isPrimitive = true;
            newObject.userData.primitiveType = modelState.primitiveType;
        } else if (modelState.isFileModel && modelState.fileData) {
            // Reload GLTF model if it was an uploaded file
            const loader = new THREE.GLTFLoader();
            try {
                const file = state.droppedFileBlobs.get(modelState.fileData.name); // Assuming fileData.name is the key
                if (file) {
                    const fileUrl = URL.createObjectURL(file);
                    const gltf = await new Promise((resolve, reject) => loader.load(fileUrl, resolve, undefined, reject));
                    newObject = gltf.scene;
                    newObject.name = modelState.name;
                    newObject.userData.isFileModel = true;
                    newObject.userData.fileData = modelState.fileData;
                    URL.revokeObjectURL(fileUrl); // Clean up blob URL
                } else {
                    console.warn(`[loadSceneState] File data not found for model: ${modelState.name}. Skipping.`);
                    continue;
                }
            } catch (error) {
                console.error(`[loadSceneState] Error reloading GLTF model ${modelState.name}:`, error);
                continue;
            }
        } else {
            console.warn(`[loadSceneState] Cannot restore object type: ${modelState.type || 'unknown'}. Skipping.`);
            continue;
        }

        // Restore UUID to match the saved state, important for maps like state.originalMaterialProperties
        newObject.uuid = modelState.uuid;

        // Apply saved transforms
        newObject.position.fromArray(modelState.position);
        newObject.rotation.fromArray(modelState.rotation);
        newObject.scale.fromArray(modelState.scale);

        // Apply saved materials (traverse children to find meshes)
        newObject.traverse(child => {
            if (child.isMesh && child.material) {
                const savedMeshMaterials = modelState.materials.find(m => m.meshUuid === child.uuid);
                if (savedMeshMaterials) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    savedMeshMaterials.states.forEach((matState, index) => {
                        if (materials[index]) {
                            // Dispose existing material before replacing with a new one from state
                            materials[index].dispose();

                            // Create a new material instance for the child mesh
                            let restoredMaterial;
                            // Try to match the original material type if possible
                            if (materials[index].isMeshStandardMaterial) {
                                restoredMaterial = new THREE.MeshStandardMaterial({
                                    metalness: 0.5,
                                    roughness: 0.5
                                });
                            } else if (materials[index].isMeshBasicMaterial) {
                                restoredMaterial = new THREE.MeshBasicMaterial();
                            } else {
                                restoredMaterial = new THREE.MeshStandardMaterial({
                                    metalness: 0.5,
                                    roughness: 0.5
                                }); // Default fallback
                            }

                            if (matState.color !== null) restoredMaterial.color.setHex(matState.color);
                            if (matState.emissive !== null) restoredMaterial.emissive.setHex(matState.emissive);
                            if (matState.emissiveIntensity !== null) restoredMaterial.emissiveIntensity = matState.emissiveIntensity;
                            restoredMaterial.needsUpdate = true;

                            if (Array.isArray(child.material)) {
                                child.material[index] = restoredMaterial;
                            } else {
                                child.material = restoredMaterial;
                            }

                            // Restore initialMaterial for this child mesh
                            if (matState.initialColor !== null || matState.initialEmissive !== null) {
                                let initialMatClone;
                                if (restoredMaterial.isMeshStandardMaterial) {
                                    initialMatClone = new THREE.MeshStandardMaterial();
                                } else if (restoredMaterial.isMeshBasicMaterial) {
                                    initialMatClone = new THREE.MeshBasicMaterial();
                                } else {
                                    initialMatClone = new THREE.Material();
                                }
                                if (matState.initialColor !== null) initialMatClone.color.setHex(matState.initialColor);
                                if (matState.initialEmissive !== null) initialMatClone.emissive.setHex(matState.initialEmissive);
                                if (matState.initialEmissiveIntensity !== null) initialMatClone.emissiveIntensity = matState.initialEmissiveIntensity;

                                if (Array.isArray(child.userData.initialMaterial)) {
                                    if (!child.userData.initialMaterial) child.userData.initialMaterial = [];
                                    child.userData.initialMaterial[index] = initialMatClone;
                                } else {
                                    child.userData.initialMaterial = initialMatClone;
                                }
                            }
                        }
                    });
                }
            }
        });

        state.scene.add(newObject);
        state.loadedModels.push(newObject); // Add to state.loadedModels array
    }

    // Reset state.camera to fit the new state.scene
    _resetView(); // This will also update the grid

    console.log("[History] state.scene state loaded successfully.");
}

// ENHANCED: Undo function with grouped action support
export function undo() {
    console.log(`[Undo] Attempting undo. Undo stack size: ${state.undoStack.length}`);

    if (state.undoStack.length > 0) {
        const undoItem = state.undoStack.pop();

        // Check if this is a new grouped action or old state-based action
        if (undoItem.actions && undoItem.actions.length > 0) {
            // New grouped action system
            console.log(`[Undo] Undoing grouped action: ${undoItem.name} with ${undoItem.actions.length} sub-actions`);

            if (state.transformControls) {
                state.transformControls.detach();
                state.transformControls.visible = false;
            }
            state.selectedObject = null;
            state.currentlySelectedObjectsForEditing = [];

            // Execute revert for each action in reverse order
            for (let i = undoItem.actions.length - 1; i >= 0; i--) {
                const action = undoItem.actions[i];
                if (action.revert && typeof action.revert === 'function') {
                    try {
                        action.revert();
                    } catch (error) {
                        console.error(`[Undo] Error reverting action ${i}:`, error);
                    }
                }
            }

            // Save to redo stack
            state.redoStack.push(undoItem);

            addMessageToLog('System', `Undone: ${undoItem.name}`);
            _speakResponse(`Undone ${undoItem.name}`);
        } else {
            // Legacy state-based undo
            console.log(`[Undo] Using legacy state-based undo`);

            // Save current state to redo stack BEFORE undoing
            const currentState = getCurrentState();
            state.redoStack.push(currentState);

            // Restore previous state
            restoreState(undoItem);

            addMessageToLog('System', 'Action undone.');
            _speakResponse('Action undone.');
        }

        console.log(`[Undo] Undone. Undo stack: ${state.undoStack.length}, Redo stack: ${state.redoStack.length}`);
    } else {
        console.log(`[Undo] No actions to undo`);
        addMessageToLog('System', 'No more actions to undo.');
        _speakResponse('Nothing to undo.');
    }
    updateUndoRedoButtons();
}

// ENHANCED: Redo function with grouped action support
export function redo() {
    console.log(`[Redo] Attempting redo. Redo stack size: ${state.redoStack.length}`);

    if (state.redoStack.length > 0) {
        const redoItem = state.redoStack.pop();

        // Check if this is a new grouped action or old state-based action
        if (redoItem.actions && redoItem.actions.length > 0) {
            // New grouped action system - re-execute the actions
            console.log(`[Redo] Redoing grouped action: ${redoItem.name} with ${redoItem.actions.length} sub-actions`);

            // For redo, we need to re-apply the changes
            // Since we stored the afterState, we can restore to that state
            if (redoItem.afterState) {
                restoreState(redoItem.afterState);
            } else {
                console.warn(`[Redo] No afterState found for grouped action: ${redoItem.name}`);
            }

            // Save back to undo stack
            state.undoStack.push(redoItem);

            addMessageToLog('System', `Redone: ${redoItem.name}`);
            _speakResponse(`Redone ${redoItem.name}`);
        } else {
            // Legacy state-based redo
            console.log(`[Redo] Using legacy state-based redo`);

            // Save current state to undo stack BEFORE redoing
            const currentState = getCurrentState();
            state.undoStack.push(currentState);

            // Restore next state
            restoreState(redoItem);

            addMessageToLog('System', 'Action redone.');
            _speakResponse('Action redone.');
        }

        console.log(`[Redo] Redone. Undo stack: ${state.undoStack.length}, Redo stack: ${state.redoStack.length}`);
    } else {
        console.log(`[Redo] No actions to redo`);
        addMessageToLog('System', 'No more actions to redo.');
        _speakResponse('Nothing to redo.');
    }
    updateUndoRedoButtons();
}

// Function to update the disabled state of Undo/Redo buttons
export function updateUndoRedoButtons() {
    const undoButton = document.getElementById('undoButton');
    const redoButton = document.getElementById('redoButton');

    if (undoButton && redoButton) {
        undoButton.disabled = state.undoStack.length === 0;
        redoButton.disabled = state.redoStack.length === 0;

        console.log(`[Buttons] Undo disabled: ${undoButton.disabled}, Redo disabled: ${redoButton.disabled}`);
        console.log(`[Buttons] Undo stack: ${state.undoStack.length}, Redo stack: ${state.redoStack.length}`);

        undoButton.title = undoButton.disabled ? 'No actions to undo' : `Undo (${state.undoStack.length} actions available)`;
        redoButton.title = redoButton.disabled ? 'No actions to redo' : `Redo (${state.redoStack.length} actions available)`;
    }
}

// Get current state.scene state
export function getCurrentState() {
    const sceneState = [];
    state.loadedModels.forEach(model => {
        const modelState = {
            name: model.name || 'Unnamed Model',
            uuid: model.uuid,
            position: { x: model.position.x, y: model.position.y, z: model.position.z },
            rotation: { x: model.rotation.x, y: model.rotation.y, z: model.rotation.z },
            scale: { x: model.scale.x, y: model.scale.y, z: model.scale.z },
            isPrimitive: model.userData.isPrimitive || false,
            primitiveType: model.userData.primitiveType || null,
            materials: []
        };

        model.traverse(child => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(mat => {
                    if (mat && mat.isMaterial) {
                        modelState.materials.push({
                            uuid: child.uuid,
                            color: mat.color ? mat.color.getHex() : null
                        });
                    }
                });
            }
        });

        sceneState.push(modelState);
    });
    return sceneState;
}

// CORRECTED: Only remove mesh objects, preserve lights/state.camera/state.controls
export function restoreState(snapshot) {
    console.log("[restoreState] Restoring state with", snapshot.length, "objects");

    if (state.transformControls) {
        state.transformControls.detach();
        state.transformControls.visible = false;
    }
    state.selectedObject = null;
    state.currentlySelectedObjectsForEditing = [];

    // Clear selections before removing meshes so transform controls detach cleanly.
    clearSelection();
    clearAllHighlights();

    // 1. ONLY remove mesh objects from state.scene (preserve lights, state.camera, grid, state.controls)
    const meshesToRemove = state.scene.children.filter(obj =>
        obj.isMesh &&
        !obj.userData.isGridLabel &&
        obj !== state.currentGridHelper &&
        obj !== state.raycastDebugSphere
    );

    // Remove and dispose mesh objects properly
    meshesToRemove.forEach(mesh => {
        state.scene.remove(mesh);
        // Dispose geometry and materials to prevent memory leaks
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(mat => mat.dispose());
            } else {
                mesh.material.dispose();
            }
        }
    });

    // Clear arrays and selections (but don't touch state.scene structure)
    state.loadedModels = [];

    // 2. RECREATE objects from saved state
    snapshot.forEach(modelState => {
        if (modelState.isPrimitive) {
            // Create base material
            let baseMaterial = new THREE.MeshStandardMaterial({
                color: 0x1e90ff,
                metalness: 0.5,
                roughness: 0.5
            });

            let newObject;

            // Create geometry based on primitive type
            switch (modelState.primitiveType.toLowerCase()) {
                case 'box':
                case 'cube':
                    newObject = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), baseMaterial);
                    break;
                case 'sphere':
                case 'ball':
                    newObject = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), baseMaterial);
                    break;
                case 'cylinder':
                case 'tube':
                    newObject = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 32), baseMaterial);
                    break;
                case 'cone':
                    newObject = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 32), baseMaterial);
                    break;
                case 'pyramid':
                    newObject = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 4), baseMaterial);
                    break;
                case 'plane':
                    newObject = new THREE.Mesh(
                        new THREE.PlaneGeometry(10, 10),
                        new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide })
                    );
                    break;
                case 'torus':
                    newObject = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.2, 16, 100), baseMaterial);
                    break;
                default:
                    console.warn(`[restoreState] Unknown primitive type: ${modelState.primitiveType}`);
                    return;
            }

            // 3. RESTORE all object properties
            newObject.name = modelState.name;
            newObject.uuid = modelState.uuid;

            // Restore transform properties
            newObject.position.set(modelState.position.x, modelState.position.y, modelState.position.z);
            newObject.rotation.set(modelState.rotation.x, modelState.rotation.y, modelState.rotation.z);
            newObject.scale.set(modelState.scale.x, modelState.scale.y, modelState.scale.z);

            // Restore userData
            newObject.userData.isPrimitive = true;
            newObject.userData.primitiveType = modelState.primitiveType;

            // 4. RESTORE material properties (colors)
            if (modelState.materials && modelState.materials.length > 0) {
                modelState.materials.forEach(matState => {
                    if (matState.color !== null && newObject.material) {
                        newObject.material.color.setHex(matState.color);
                        newObject.material.needsUpdate = true;
                        // Store as initial material for future color changes
                        newObject.userData.initialMaterial = newObject.material.clone();
                    }
                });
            }

            // 5. ADD to state.scene and update arrays
            state.scene.add(newObject);
            state.loadedModels.push(newObject);

            console.log(`[restoreState] Restored ${modelState.primitiveType}: ${newObject.name}`);
        }
    });

    console.log(`[restoreState] Successfully restored ${state.loadedModels.length} objects`);
}
