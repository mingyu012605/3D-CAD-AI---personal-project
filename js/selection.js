import { state } from './state.js';
import { addMessageToLog } from './utils.js';

const cadViewer = document.getElementById('cadViewer');
let mouseDownX = 0;
let mouseDownY = 0;
const CLICK_TOLERANCE = 15;
const highlightMaterial = new THREE.MeshBasicMaterial({
    color: 0x1e90ff,
    transparent: true,
    opacity: 0.8,
    depthTest: false,
    depthWrite: false
});
let lastHoveredGroupId = null;

// Callbacks for functions not yet extracted (registered by main.js via initSelectionCallbacks)
let _speakResponse = () => {};
let _getCurrentState = () => null;
let _updateUndoRedoButtons = () => {};
let _resetView = () => {};
let _beginUndoGroup = () => {};
let _endUndoGroup = () => {};
let _addUndoAction = () => {};
let _detectFaceFromClick = () => null;
let _onSelectionChanged = () => {};
let _raycastFaceOverlays = () => null;
let _handleFaceClick = () => false;
let _clearFaceSelection = () => {};
let _updateFaceHover = () => {};
let _onObjectSelected = () => {};

export function initSelectionCallbacks(cbs) {
    _speakResponse = cbs.speakResponse;
    _getCurrentState = cbs.getCurrentState;
    _updateUndoRedoButtons = cbs.updateUndoRedoButtons;
    _resetView = cbs.resetView;
    _beginUndoGroup = cbs.beginUndoGroup;
    _endUndoGroup = cbs.endUndoGroup;
    _addUndoAction = cbs.addUndoAction;
    _detectFaceFromClick = cbs.detectFaceFromClick;
    _onSelectionChanged = cbs.onSelectionChanged;
    _raycastFaceOverlays = cbs.raycastFaceOverlays;
    _handleFaceClick = cbs.handleFaceClick || _handleFaceClick;
    _clearFaceSelection = cbs.clearFaceSelection || _clearFaceSelection;
    _updateFaceHover = cbs.updateFaceHover || _updateFaceHover;
    _onObjectSelected = cbs.onObjectSelected || _onObjectSelected;
}

export function getSelectedObjects() {
    // Return array of currently selected objects
    if (state.currentlySelectedObjectsForEditing.length > 0) {
        // Multi-selection mode (from "select all")
        return [...state.currentlySelectedObjectsForEditing];
    } else if (state.selectedObject) {
        // Single selection mode
        return [state.selectedObject];
    } else {
        // No selection
        return [];
    }
}

export function setSelectedObjects(objects) {
    // Clear current selection
    clearSelection();
    clearAllHighlights();

    if (!objects || objects.length === 0) {
        return;
    }

    if (objects.length === 1) {
        // Single object selection
        selectObject(objects[0]);
    } else {
        // Multi-object selection - use the highlight system
        state.currentlySelectedObjectsForEditing = [...objects];

        // Apply highlight to each object
        objects.forEach(obj => {
            if (obj && obj.material) {
                // Store original material
                const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
                state.allHighlightsOriginalMaterials.set(obj.uuid, materials.map(mat => mat.clone()));

                // Apply highlight
                materials.forEach(mat => {
                    mat.emissive = new THREE.Color(0x444444);
                });
            }
        });

        console.log(`[setSelectedObjects] Selected ${objects.length} objects for multi-editing`);
        addMessageToLog('System', `Selected ${objects.length} objects for editing.`);
    }
}

export function duplicateSelection() {
    console.log("=== DUPLICATE SELECTION ===");

    const selection = getSelectedObjects();
    console.log(`Selection count: ${selection.length}`);

    if (selection.length === 0) {
        addMessageToLog('System', 'No objects selected to duplicate.');
        _speakResponse('No objects selected to duplicate.');
        return;
    }

    // Begin grouped undo action
    _beginUndoGroup(`Duplicate ${selection.length} object${selection.length > 1 ? 's' : ''}`);

    const createdObjects = [];

    try {
        for (const srcObject of selection) {
            console.log(`Duplicating: ${srcObject.name || srcObject.type} (UUID: ${srcObject.uuid})`);

            // Deep clone the object including children
            const clone = srcObject.clone(true);

            // Ensure unique UUIDs for the clone and all its children
            clone.uuid = THREE.MathUtils.generateUUID();
            clone.traverse(child => {
                if (child !== clone) {
                    child.uuid = THREE.MathUtils.generateUUID();
                }

                // Clone materials to avoid shared references
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(mat => mat.clone());
                    } else {
                        child.material = child.material.clone();
                    }
                }

                // Clone geometry to avoid shared references
                if (child.geometry) {
                    child.geometry = child.geometry.clone();
                }
            });

            // Preserve and enhance userData
            clone.userData = {
                ...srcObject.userData,
                isClone: true,
                originalUUID: srcObject.uuid,
                clonedAt: Date.now()
            };

            // Set name for the clone
            clone.name = `${srcObject.name || 'Object'} (Copy)`;

            // Add to the SAME parent as the original, not state.scene root
            const parent = srcObject.parent || state.scene;
            parent.add(clone);

            // Offset the clone so it's visible next to the original
            clone.position.copy(srcObject.position);
            clone.position.add(new THREE.Vector3(2, 0, 0)); // Move 2 units to the right

            // Add to state.loadedModels if the original was a top-level model
            if (state.loadedModels.includes(srcObject)) {
                state.loadedModels.push(clone);
            }

            createdObjects.push(clone);

            // Add undo action for this specific clone
            _addUndoAction({
                type: 'add_object',
                object: clone,
                parent: parent,
                revert: () => {
                    parent.remove(clone);
                    const modelIndex = state.loadedModels.indexOf(clone);
                    if (modelIndex !== -1) {
                        state.loadedModels.splice(modelIndex, 1);
                    }
                }
            });

            console.log(`✅ Created clone: ${clone.name} at position (${clone.position.x}, ${clone.position.y}, ${clone.position.z})`);
        }

        // Update selection to the new clones
        setSelectedObjects(createdObjects);

        // End the undo group
        _endUndoGroup();

        const message = `Duplicated ${createdObjects.length} object${createdObjects.length > 1 ? 's' : ''}. Copies created to the right.`;
        addMessageToLog('System', message);
        _speakResponse(message);

        console.log(`✅ Duplication complete: ${createdObjects.length} objects created`);

    } catch (error) {
        console.error("❌ Duplication failed:", error);
        addMessageToLog('System', `Duplication failed: ${error.message}`);

        // Clean up any partially created objects
        createdObjects.forEach(obj => {
            if (obj.parent) {
                obj.parent.remove(obj);
            }
            const modelIndex = state.loadedModels.indexOf(obj);
            if (modelIndex !== -1) {
                state.loadedModels.splice(modelIndex, 1);
            }
        });

        // End the undo group (will be empty due to cleanup)
        _endUndoGroup();
    }
}

export function onCanvasClick(event) {
    console.log(`[onCanvasClick] Event type: ${event.type}, Button: ${event.button}`);
    // Only process left-click (state.mouse button 0) or touchstart
    if (event.type === 'mousedown' && event.button !== 0) {
        console.log("[onCanvasClick] Ignoring non-left click or non-touchstart event.");
        return;
    }

    // If state.transformControls are currently active and dragging, do not process selection
    if (state.transformControls && state.transformControls.dragging) {
        console.log("[onCanvasClick] state.transformControls are dragging, skipping selection.");
        return;
    }

    // Store initial pointer position on mousedown/touchstart
    if (event.type === 'touchstart') {
        mouseDownX = event.touches[0].clientX;
        mouseDownY = event.touches[0].clientY;
    } else {
        mouseDownX = event.clientX;
        mouseDownY = event.clientY;
    }
    console.log(`[onCanvasClick] state.mouse/Touch Down: Initial(${mouseDownX}, ${mouseDownY})`);

    // Add a temporary mouseup/touchend listener to check for drag vs click
    const onPointerUp = (upEvent) => {
        let currentX, currentY;
        if (upEvent.type === 'touchend') {
            // For touchend, use changedTouches as touches array might be empty
            if (upEvent.changedTouches && upEvent.changedTouches.length > 0) {
                currentX = upEvent.changedTouches[0].clientX;
                currentY = upEvent.changedTouches[0].clientY;
            } else {
                // Fallback if changedTouches is also empty (unlikely but safe)
                currentX = mouseDownX;
                currentY = mouseDownY;
            }
        } else {
            currentX = upEvent.clientX;
            currentY = upEvent.clientY;
        }

        const deltaX = Math.abs(mouseDownX - currentX);
        const deltaY = Math.abs(mouseDownY - currentY);

        console.log(`[onCanvasClick] state.mouse/Touch Up: Final(${currentX}, ${currentY}). DeltaX=${deltaX}, DeltaY=${deltaY}. Tolerance=${CLICK_TOLERANCE}`);

        // Visual feedback for any click registered
        cadViewer.style.backgroundColor = '#E0F2F7'; // Light blue flash
        setTimeout(() => {
            cadViewer.style.backgroundColor = '#FFFFFF'; // Revert to white
        }, 100);


        if (deltaX > CLICK_TOLERANCE || deltaY > CLICK_TOLERANCE) {
            console.log("[onCanvasClick] Detected drag (movement exceeded tolerance), skipping selection.");
        } else {
            // It was a click, proceed with raycasting
            console.log("[onCanvasClick] Detected click (movement within tolerance), processing selection.");
            // Normalize state.mouse coordinates for raycasting using the initial mousedown position
            const rect = state.renderer.domElement.getBoundingClientRect();
            state.mouse.x = ((mouseDownX - rect.left) / rect.width) * 2 - 1;
            state.mouse.y = -((mouseDownY - rect.top) / rect.height) * 2 + 1;
            console.log(`[onCanvasClick] Normalized state.mouse coords for raycasting: X=${state.mouse.x.toFixed(4)}, Y=${state.mouse.y.toFixed(4)}`);
            console.log(`[onCanvasClick] state.raycaster set from state.camera. state.mouse: (${state.mouse.x.toFixed(3)}, ${state.mouse.y.toFixed(3)})`);
            console.log(`[onCanvasClick] state.camera position: (${state.camera.position.x.toFixed(3)}, ${state.camera.position.y.toFixed(3)}, ${state.camera.position.z.toFixed(3)})`);
            console.log(`[onCanvasClick] state.camera fov: ${state.camera.fov}, aspect: ${state.camera.aspect}`);


            state.raycaster.setFromCamera(state.mouse, state.camera);

            const objectsToIntersect = [];
            state.scene.traverse((obj) => { // Traverse the entire state.scene
                // Only consider meshes that are visible and not part of the grid or labels
                if (obj.isMesh && obj.visible && !obj.userData.isGridLabel && obj !== state.currentGridHelper && obj !== state.raycastDebugSphere) { // Exclude debug sphere
                    objectsToIntersect.push(obj);
                }
            });
            console.log(`[onCanvasClick] Total visible meshes considered for intersection: ${objectsToIntersect.length}`);
            if (objectsToIntersect.length === 0) {
                console.log("[onCanvasClick] No meshes available to intersect.");
            }


            // PRIORITY 1: Check for face selection if in face edit mode
            let faceGroupId = null;
            if (state.faceEditState.isActive) {
                faceGroupId = _detectFaceFromClick();
                console.log(`[onCanvasClick] Face detection result: ${faceGroupId}`);
            }

            if (faceGroupId) {
                console.log("[onCanvasClick] Face overlay clicked:", faceGroupId);
                _handleFaceClick(faceGroupId);

                // Show debug sphere at face center
                const group = state.faceEditState.groups.find(g => g.id === faceGroupId);
                if (group) {
                    state.raycastDebugSphere.position.copy(group.centroid);
                    state.raycastDebugSphere.visible = true;
                    setTimeout(() => {
                        state.raycastDebugSphere.visible = false;
                    }, 500);
                }
                return; // Don't process normal object selection
            }

            // PRIORITY 2: Normal object intersection
            const intersects = state.raycaster.intersectObjects(objectsToIntersect, true);
            console.log(`[onCanvasClick] Intersections found by state.raycaster: ${intersects.length}`);

            if (intersects.length > 0) {
                const intersectedObject = intersects[0].object;
                console.log("[onCanvasClick] Object intersected:", intersectedObject.name || "Unnamed Object", "UUID:", intersectedObject.uuid, "Type:", intersectedObject.type);

                // Show raycast debug sphere
                state.raycastDebugSphere.position.copy(intersects[0].point);
                state.raycastDebugSphere.visible = true;
                setTimeout(() => {
                    state.raycastDebugSphere.visible = false;
                }, 500);

                // Normal object selection
                selectObject(intersectedObject);
            } else {
                console.log("[onCanvasClick] No object intersected by state.raycaster. Clearing selection.");
                state.raycastDebugSphere.visible = false;
                clearSelection();

                // Clear face selection if in face edit mode
                if (state.faceEditState.isActive) {
                    _clearFaceSelection();
                }
            }
        }

        // Clean up the temporary listeners
        state.renderer.domElement.removeEventListener('mouseup', onPointerUp);
        state.renderer.domElement.removeEventListener('touchend', onPointerUp);
    };

    // Attach temporary listeners for mouseup/touchend
    state.renderer.domElement.addEventListener('mouseup', onPointerUp, { once: true });
    state.renderer.domElement.addEventListener('touchend', onPointerUp, { once: true });
}

export function selectObject(object) {
    console.log(`[selectObject] Function called with object: ${object ? object.name || object.uuid : 'null'}`);
    console.log(`[selectObject] Current state.selectedObject BEFORE: ${state.selectedObject ? state.selectedObject.name || state.selectedObject.uuid : 'null'}`);

    // Clear pending operations when object selection changes
    _onSelectionChanged();

    // Clear any existing "select all" highlights first if this object was part of it
    if (state.allHighlightsOriginalMaterials.size > 0) {
        // Clear all highlights and the state.currentlySelectedObjectsForEditing array
        clearAllHighlights();
    }

    // Clear any previous individual selection
    clearSelection();

    if (object) {
        state.selectedObject = object;
        console.log(`[selectObject] Selected object set to: ${state.selectedObject.name || 'Unnamed Object'} (UUID: ${state.selectedObject.uuid})`);

        const materials = Array.isArray(state.selectedObject.material) ? state.selectedObject.material : [state.selectedObject.material];
        const objectOriginalMaterials = []; // Array to store original material instances

        materials.forEach((mat, index) => {
            if (mat && mat.isMaterial) { // Defensive check for valid material
                console.log(`[selectObject] Processing material ${index}: Type=${mat.type}, Color=${mat.color ? mat.color.getHexString() : 'N/A'}, Emissive=${mat.emissive ? mat.emissive.getHexString() : 'N/A'}`);

                // Store the original material instance itself
                objectOriginalMaterials.push(mat.clone()); // Store a clone of the current material for highlight reversion

                // Apply highlight
                if (mat.emissive !== undefined) {
                    mat.emissive.copy(highlightMaterial.color);
                    mat.emissiveIntensity = 0.5; // Adjust intensity as needed
                    console.log(`[selectObject] Applied emissive highlight to material for ${state.selectedObject.name || 'Unnamed Object'} (material index ${index}).`);
                } else if (mat.color !== undefined) {
                    // If no emissive, change the main color
                    mat.color.copy(highlightMaterial.color);
                    console.log(`[selectObject] Applied color highlight to material for ${state.selectedObject.name || 'Unnamed Object'} (material index ${index}).`);
                } else {
                    console.warn(`[selectObject] Material for ${object.name || 'Unnamed Part'} (UUID: ${object.uuid}, material index ${index}) does not have an emissive or color property. Highlighting might not work as expected.`);
                }
                mat.needsUpdate = true;
            } else {
                console.warn(`[selectObject] Material at index ${index} for object ${object.name || object.uuid} is null or not a valid material. Skipping highlight.`);
            }
        });
        state.originalMaterialProperties.set(state.selectedObject.uuid, objectOriginalMaterials); // Store the array of current materials for individual selection reversion

        state.transformControls.attach(state.selectedObject);
        state.transformControls.visible = true; // Make state.controls visible
        state.transformControls.enabled = true; // Ensure state.controls are enabled

        // Set default mode to translate, but ensure all modes work
        state.transformControls.setMode('translate');

        console.log(`[selectObject] state.transformControls attached: ${state.transformControls.object ? state.transformControls.object.name || state.transformControls.object.uuid : 'none'}`);
        console.log(`[selectObject] state.transformControls visible: ${state.transformControls.visible}`);
        console.log(`[selectObject] state.transformControls mode: ${state.transformControls.mode}`);

        addMessageToLog('System', `Selected: ${object.name || 'Unnamed Part'} (UUID: ${object.uuid}). Press S to scale, R to rotate, G to move.`);
        _speakResponse(`Selected ${object.name || 'a part'}. Press S to scale.`);
        _onObjectSelected(object);

        // Don't save state on selection - save when actual changes happen
    } else {
        console.log("[selectObject] No object provided for selection, clearing any existing selection.");
        clearSelection(); // If no object is passed, clear selection
    }
    console.log(`[selectObject] Current state.selectedObject AFTER: ${state.selectedObject ? state.selectedObject.name || state.selectedObject.uuid : 'null'}`);
}

export function clearSelection() {
    console.log(`[clearSelection] Function called. state.selectedObject BEFORE: ${state.selectedObject ? state.selectedObject.name || state.selectedObject.uuid : 'null'}`);

    // Clear pending operations when selection is cleared
    _onSelectionChanged();

    if (state.selectedObject && state.originalMaterialProperties.has(state.selectedObject.uuid)) {
        console.log(`[clearSelection] Reverting highlight for: ${state.selectedObject.name || 'Unnamed Part'} (UUID: ${state.selectedObject.uuid})`);

        const originalMaterials = state.originalMaterialProperties.get(state.selectedObject.uuid); // Get the array of original material instances
        const currentMaterials = Array.isArray(state.selectedObject.material) ? state.selectedObject.material : [state.selectedObject.material];

        currentMaterials.forEach((mat, index) => {
            if (mat && mat.isMaterial && originalMaterials[index]) { // Defensive check
                mat.dispose(); // Dispose current material before replacing to avoid memory leaks
                // Assign the original material instance back
                // Use the initialMaterial if available, otherwise fallback to the one stored for temporary highlight
                if (state.selectedObject.userData.initialMaterial && (Array.isArray(state.selectedObject.userData.initialMaterial) ? state.selectedObject.userData.initialMaterial[index] : state.selectedObject.userData.initialMaterial)) {
                    if (Array.isArray(state.selectedObject.material)) {
                        state.selectedObject.material[index] = state.selectedObject.userData.initialMaterial[index].clone(); // Clone to ensure independence
                    } else {
                        state.selectedObject.material = state.selectedObject.userData.initialMaterial.clone(); // Clone to ensure independence
                    }
                } else {
                    if (Array.isArray(state.selectedObject.material)) {
                        state.selectedObject.material[index] = originalMaterials[index];
                    } else {
                        state.selectedObject.material = originalMaterials[index];
                    }
                }
                state.selectedObject.material.needsUpdate = true;
                console.log(`[clearSelection] Restored material for index ${index}.`);
            } else {
                console.warn(`[clearSelection] Material at index ${index} for object ${state.selectedObject.name || state.selectedObject.uuid} is null or not a valid material, or no original material instance found. Skipping restore.`);
            }
        });

        // Detach transform state.controls before clearing state.selectedObject
        if (state.transformControls) {
            state.transformControls.detach(); // Detach state.controls when selection is cleared
            state.transformControls.visible = false; // Explicitly hide state.controls
            console.log("[clearSelection] state.transformControls detached and hidden.");
        }

        state.originalMaterialProperties.delete(state.selectedObject.uuid); // Remove from map
        state.selectedObject = null; // Clear selected object reference
        console.log("[clearSelection] Individual selection cleared and highlight reverted.");
    } else {
        console.log("[clearSelection] No object selected or no original material properties to restore.");
    }
    state.currentlySelectedObjectsForEditing = []; // Clear the functional selection array
    _onObjectSelected(null);
    console.log(`[clearSelection] Function finished. state.selectedObject AFTER: ${state.selectedObject ? state.selectedObject.name || state.selectedObject.uuid : 'null'}`);
    // Do NOT add message to log or speak here, as it's often called internally before a new selection.
    // addMessageToLog('System', 'Selection cleared.');
    // speakResponse('Selection cleared.');
}

export function highlightAllModels() {
    console.log("[highlightAllModels] Attempting to highlight all models.");
    clearSelection(); // Clear any individual selection first
    clearAllHighlights(); // Clear any previous "select all" highlights

    let highlightedCount = 0;
    state.currentlySelectedObjectsForEditing = []; // Clear before populating

    // Store original positions for group movement
    const originalPositions = new Map();

    // Iterate over state.loadedModels for highlighting
    state.loadedModels.forEach(model => {
        // Highlight the top-level model
        const materials = Array.isArray(model.material) ? model.material : [model.material];
        const objectOriginalMaterials = [];

        // Store original position for group movement
        originalPositions.set(model.uuid, model.position.clone());

        // Highlight all meshes in the model
        model.traverse((obj) => {
            if (obj.isMesh && obj.visible && !obj.userData.isGridLabel && obj !== state.currentGridHelper && obj !== state.raycastDebugSphere) {
                const objMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];
                const objOriginalMaterials = [];

                objMaterials.forEach(mat => {
                    if (mat && mat.isMaterial) {
                        objOriginalMaterials.push(mat.clone());
                        if (mat.emissive !== undefined) {
                            mat.emissive.copy(highlightMaterial.color);
                            mat.emissiveIntensity = 0.5;
                        } else if (mat.color !== undefined) {
                            mat.color.copy(highlightMaterial.color);
                        }
                        mat.needsUpdate = true;
                        highlightedCount++;
                    }
                });

                state.allHighlightsOriginalMaterials.set(obj.uuid, objOriginalMaterials);
                state.currentlySelectedObjectsForEditing.push(obj);
            }
        });

        // Add the top-level model to selection for movement
        state.currentlySelectedObjectsForEditing.push(model);
    });

    if (highlightedCount > 0) {
        // Create a virtual group object for transform state.controls
        const groupHelper = new THREE.Object3D();
        groupHelper.name = 'GroupMovementHelper';
        groupHelper.userData.isGroupHelper = true;
        groupHelper.userData.originalPositions = originalPositions;
        groupHelper.userData.selectedModels = [...state.loadedModels];

        // Position the helper at the center of all objects
        const center = new THREE.Vector3();
        state.loadedModels.forEach(model => {
            center.add(model.position);
        });
        center.divideScalar(state.loadedModels.length);
        groupHelper.position.copy(center);

        state.scene.add(groupHelper);

        // Attach transform state.controls to the helper
        if (state.transformControls) {
            state.transformControls.attach(groupHelper);
            state.transformControls.visible = true;
            state.transformControls.setMode('translate'); // Start with translate mode
            console.log("[highlightAllModels] Transform state.controls attached to group helper");
        }

        // Set as selected object for movement
        state.selectedObject = groupHelper;

        // Store original transforms for all operations
        groupHelper.userData.originalTransforms = new Map();
        state.loadedModels.forEach(model => {
            groupHelper.userData.originalTransforms.set(model.uuid, {
                position: model.position.clone(),
                rotation: model.rotation.clone(),
                scale: model.scale.clone()
            });
        });

        // Add event listeners for ALL transform operations
        if (state.transformControls) {
            const onGroupTransform = () => {
                if (groupHelper.userData.selectedModels) {
                    const mode = state.transformControls.mode;

                    if (mode === 'translate') {
                        // Group movement
                        const deltaPosition = new THREE.Vector3().subVectors(groupHelper.position, center);
                        groupHelper.userData.selectedModels.forEach(model => {
                            const originalPos = groupHelper.userData.originalTransforms.get(model.uuid).position;
                            if (originalPos) {
                                model.position.copy(originalPos).add(deltaPosition);
                            }
                        });
                    } else if (mode === 'rotate') {
                        // Group rotation
                        groupHelper.userData.selectedModels.forEach(model => {
                            const originalRot = groupHelper.userData.originalTransforms.get(model.uuid).rotation;
                            if (originalRot) {
                                model.rotation.copy(originalRot);
                                model.rotation.x += groupHelper.rotation.x;
                                model.rotation.y += groupHelper.rotation.y;
                                model.rotation.z += groupHelper.rotation.z;
                            }
                        });
                    } else if (mode === 'scale') {
                        // Group scaling
                        groupHelper.userData.selectedModels.forEach(model => {
                            const originalScale = groupHelper.userData.originalTransforms.get(model.uuid).scale;
                            if (originalScale) {
                                model.scale.copy(originalScale);
                                model.scale.multiply(groupHelper.scale);
                            }
                        });
                    }
                }
            };

            state.transformControls.addEventListener('objectChange', onGroupTransform);
            groupHelper.userData.transformListener = onGroupTransform;
        }

        addMessageToLog('AI', `Selected ${highlightedCount} objects. You can now move, scale, rotate, or duplicate them together. Press G/R/S to switch modes.`);
        _speakResponse(`Selected all ${highlightedCount} objects. You can now edit them together.`);
        console.log(`[highlightAllModels] Successfully selected ${highlightedCount} objects for group editing.`);
    } else {
        addMessageToLog('System', 'No objects found to select in the state.scene.');
        _speakResponse('No objects found to select.');
        console.log("[highlightAllModels] No objects found to select.");
    }
}

export function clearAllHighlights() {
    console.log("[clearAllHighlights] Attempting to clear all highlights.");

    // Remove group helper if it exists
    const groupHelper = state.scene.getObjectByProperty('name', 'GroupMovementHelper');
    if (groupHelper) {
        // Remove event listeners
        if (groupHelper.userData.transformListener && state.transformControls) {
            state.transformControls.removeEventListener('objectChange', groupHelper.userData.transformListener);
        }
        if (groupHelper.userData.moveListener && state.transformControls) {
            state.transformControls.removeEventListener('objectChange', groupHelper.userData.moveListener);
        }
        state.scene.remove(groupHelper);
        console.log("[clearAllHighlights] Removed group editing helper");
    }

    if (state.allHighlightsOriginalMaterials.size === 0) {
        console.log("[clearAllHighlights] No global highlights to clear.");
        return;
    }

    let clearedCount = 0;
    for (const [uuid, originalMaterials] of state.allHighlightsOriginalMaterials.entries()) {
        const object = state.scene.getObjectByProperty('uuid', uuid);
        if (object && object.isMesh) {
            const currentMaterials = Array.isArray(object.material) ? object.material : [object.material];
            currentMaterials.forEach((mat, index) => {
                if (mat && mat.isMaterial && originalMaterials[index]) {
                    mat.dispose(); // Dispose current material before replacing
                    // Use the initialMaterial if available, otherwise fallback to the one stored for temporary highlight
                    if (object.userData.initialMaterial && (Array.isArray(object.userData.initialMaterial) ? object.userData.initialMaterial[index] : object.userData.initialMaterial)) {
                        if (Array.isArray(object.material)) {
                            object.material[index] = object.userData.initialMaterial[index].clone(); // Clone to ensure independence
                        } else {
                            object.material = object.userData.initialMaterial.clone(); // Clone to ensure independence
                        }
                    } else {
                        if (Array.isArray(object.material)) {
                            object.material[index] = originalMaterials[index];
                        } else {
                            object.material = originalMaterials[index];
                        }
                    }
                    object.material.needsUpdate = true;
                }
            });
            clearedCount++;
        }
    }
    state.allHighlightsOriginalMaterials.clear(); // Clear the map
    state.currentlySelectedObjectsForEditing = []; // Clear the functional selection array
    addMessageToLog('System', `Cleared highlights from ${clearedCount} objects.`);
    _speakResponse('All highlights cleared.');
    console.log(`[clearAllHighlights] Successfully cleared highlights from ${clearedCount} objects.`);
}

export function removeObject() {
    // Only save state if we have objects (never save empty state)
    if (state.loadedModels.length > 0) {
        const currentState = _getCurrentState();
        state.undoStack.push(currentState);
        state.redoStack = []; // Clear redo stack
        console.log("[removeObject] Saved state with", state.loadedModels.length, "objects");
    }
    if (state.selectedObject) {
        const objectToRemoveName = state.selectedObject.name || "Unnamed Part";
        const objectToRemoveUUID = state.selectedObject.uuid;

        state.transformControls.detach();

        let parent = state.selectedObject.parent;
        if (parent) {
            parent.remove(state.selectedObject);
            if (state.selectedObject.geometry) state.selectedObject.geometry.dispose();
            if (state.selectedObject.material) {
                if (Array.isArray(state.selectedObject.material)) {
                    state.selectedObject.material.forEach(material => material.dispose());
                } else {
                    state.selectedObject.material.dispose();
                }
            }

            const index = state.loadedModels.indexOf(state.selectedObject);
            if (index > -1) {
                state.loadedModels.splice(index, 1);
                console.log(`[Remove Object] Removed top-level model: ${objectToRemoveName}. Remaining models: ${state.loadedModels.length}`);
            } else {
                console.log(`[Remove Object] Removed object: ${objectToRemoveName} (UUID: ${objectToRemoveUUID})`);
            }

            if (state.originalMaterialProperties.has(state.selectedObject.uuid)) {
                state.originalMaterialProperties.delete(state.selectedObject.uuid);
            }
            if (state.allHighlightsOriginalMaterials.has(state.selectedObject.uuid)) {
                state.allHighlightsOriginalMaterials.delete(state.selectedObject.uuid);
            }

            addMessageToLog('AI', `Removed ${objectToRemoveName}.`);
            _speakResponse(`Removed ${objectToRemoveName}.`);
            state.selectedObject = null;
            state.currentlySelectedObjectsForEditing = [];
            _resetView();
        } else {
            console.warn(`[Remove Object] Selected object ${objectToRemoveName} has no parent to remove from.`);
            addMessageToLog('System', `Cannot remove ${objectToRemoveName}: No parent found.`);
            _speakResponse(`Cannot remove that part.`);
        }
    } else {
        addMessageToLog('System', 'No object selected to remove.');
        _speakResponse('No object selected to remove.');
    }
    _updateUndoRedoButtons();
}

export function duplicateSelectedObject() {
    console.log("[duplicateSelectedObject] Legacy function called, redirecting to duplicateSelection()");
    // Redirect to the new unified function
    duplicateSelection();
}

export function onCanvasMouseMove(event) {
    if (!state.faceEditState.isActive) return;

    // Get state.mouse position
    const rect = state.renderer.domElement.getBoundingClientRect();
    state.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Raycast for face overlays
    state.raycaster.setFromCamera(state.mouse, state.camera);
    const hoveredGroupId = _raycastFaceOverlays();

    // ✅ HOVER = HIGHLIGHT ONLY! NO EDITING!
    if (hoveredGroupId !== lastHoveredGroupId) {
        _updateFaceHover(hoveredGroupId);
        lastHoveredGroupId = hoveredGroupId;
    }

    // ⛔ NO GEOMETRY MODIFICATION/PAINTING/EXTRUDE HERE!
}
