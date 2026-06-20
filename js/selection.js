import { state } from './state.js';
import { addMessageToLog } from './utils.js';

let mouseDownX = 0;
let mouseDownY = 0;
const MOUSE_CLICK_TOLERANCE = 6;
const TOUCH_CLICK_TOLERANCE = 12;
const SELECTION_ASSIST_RADIUS_PX = 9;
const highlightMaterial = new THREE.MeshBasicMaterial({
    color: 0x3b82c4,
    transparent: true,
    opacity: 0.14,
    depthTest: false,
    depthWrite: false
});
const SELECTION_OUTLINE_NAME = '__selectionOutline';
let lastHoveredGroupId = null;

function isObjectLocked(object) {
    let current = object;
    while (current) {
        if (current.userData?.cadLocked) return true;
        current = current.parent;
    }
    return false;
}

function isMaterialUsedByAnotherMesh(material, owner) {
    let isUsed = false;
    state.loadedModels.some(model => {
        model.traverse(child => {
            if (isUsed || child === owner || !child.isMesh) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            if (materials.includes(material)) isUsed = true;
        });
        return isUsed;
    });
    return isUsed;
}

function findObjectIntersections(clientX, clientY, objectsToIntersect) {
    const rect = state.renderer.domElement.getBoundingClientRect();
    const offsets = [
        [0, 0],
        [SELECTION_ASSIST_RADIUS_PX, 0],
        [-SELECTION_ASSIST_RADIUS_PX, 0],
        [0, SELECTION_ASSIST_RADIUS_PX],
        [0, -SELECTION_ASSIST_RADIUS_PX],
        [SELECTION_ASSIST_RADIUS_PX * 0.7, SELECTION_ASSIST_RADIUS_PX * 0.7],
        [-SELECTION_ASSIST_RADIUS_PX * 0.7, SELECTION_ASSIST_RADIUS_PX * 0.7],
        [SELECTION_ASSIST_RADIUS_PX * 0.7, -SELECTION_ASSIST_RADIUS_PX * 0.7],
        [-SELECTION_ASSIST_RADIUS_PX * 0.7, -SELECTION_ASSIST_RADIUS_PX * 0.7],
    ];

    for (const [offsetX, offsetY] of offsets) {
        state.mouse.x = ((clientX + offsetX - rect.left) / rect.width) * 2 - 1;
        state.mouse.y = -((clientY + offsetY - rect.top) / rect.height) * 2 + 1;
        state.raycaster.setFromCamera(state.mouse, state.camera);
        const intersections = state.raycaster.intersectObjects(objectsToIntersect, false);
        if (intersections.length > 0) return intersections;
    }

    return [];
}

function getSelectableMeshes() {
    const meshes = [];
    state.loadedModels.forEach(model => model.traverse(obj => {
        if (!obj.isMesh || !obj.visible) return;
        if (obj.userData?.isGridLabel || obj.userData?.isSelectionOutline || obj.userData?.isDecorativeContext) return;
        if (obj === state.currentGridHelper || obj === state.raycastDebugSphere || isTransformControlPart(obj)) return;
        meshes.push(obj);
    }));
    return meshes;
}

function isTransformControlPart(object) {
    let current = object;
    while (current) {
        if (current === state.transformControls) return true;
        if (String(current.type || '').startsWith('TransformControls')) return true;
        current = current.parent;
    }
    return false;
}

function addSelectionOutline(object) {
    if (!object) return;

    const meshes = [];
    object.traverse(child => {
        if (child.isMesh && child.geometry) meshes.push(child);
    });

    meshes.forEach(mesh => {
        if (mesh.children.some(child => child.name === SELECTION_OUTLINE_NAME)) return;

        const outline = new THREE.LineSegments(
            new THREE.EdgesGeometry(mesh.geometry, 20),
            new THREE.LineBasicMaterial({
                color: 0x6fa3d7,
                transparent: true,
                opacity: 0.78,
                depthTest: false,
                depthWrite: false
            })
        );
        outline.name = SELECTION_OUTLINE_NAME;
        outline.userData.isSelectionOutline = true;
        outline.renderOrder = 1000;
        mesh.add(outline);
    });
}

function isLargeArchitecturalSurface(object) {
    const data = object?.userData || {};
    const props = data.ifcProperties || {};
    const text = [
        object?.name,
        data.ifcTypeKey,
        props.typeName,
        props.objectType,
        props.name,
    ].filter(Boolean).join(' ').toLowerCase();
    return /(roof|slab|floor|ceiling)/i.test(text);
}

function removeSelectionOutline(object) {
    if (!object) return;

    const outlines = [];
    object.traverse(child => {
        if (child.name === SELECTION_OUTLINE_NAME) outlines.push(child);
    });

    outlines.forEach(outline => {
        outline.parent?.remove(outline);
        outline.geometry?.dispose();
        outline.material?.dispose();
    });
}

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

    objects = (objects || []).filter(object => !isObjectLocked(object));
    if (objects.length === 0) {
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
                    if (mat.emissive !== undefined) {
                        mat.emissive.copy(highlightMaterial.color);
                        mat.emissiveIntensity = 1;
                    } else if (mat.color !== undefined) {
                        mat.color.copy(highlightMaterial.color);
                    }
                    mat.needsUpdate = true;
                });
                addSelectionOutline(obj);
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
    // Only process left-click (state.mouse button 0) or touchstart
    if (event.type === 'mousedown' && event.button !== 0) {
        return;
    }

    // If state.transformControls are currently active and dragging, do not process selection
    if (state.transformControls && state.transformControls.dragging) {
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
    const clickTolerance = event.type === 'touchstart' ? TOUCH_CLICK_TOLERANCE : MOUSE_CLICK_TOLERANCE;

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
        const moved = Math.hypot(deltaX, deltaY);

        if (moved > clickTolerance || state.controls?.isDragging || state.transformControls?.dragging) {
            // Treat mouse movement as orbit/pan, not selection.
        } else {
            // It was a click, proceed with raycasting
            // Normalize state.mouse coordinates for raycasting using the release position.
            const rect = state.renderer.domElement.getBoundingClientRect();
            state.mouse.x = ((currentX - rect.left) / rect.width) * 2 - 1;
            state.mouse.y = -((currentY - rect.top) / rect.height) * 2 + 1;

            state.raycaster.setFromCamera(state.mouse, state.camera);

            const objectsToIntersect = getSelectableMeshes();

            // PRIORITY 1: Check for face selection if in face edit mode
            let faceGroupId = null;
            if (state.faceEditState.isActive) {
                faceGroupId = _detectFaceFromClick();
            }

            if (faceGroupId) {
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
            const intersects = findObjectIntersections(currentX, currentY, objectsToIntersect);

            if (intersects.length > 0) {
                const intersectedObject = intersects[0].object;

                // Show raycast debug sphere
                state.raycastDebugSphere.position.copy(intersects[0].point);
                state.raycastDebugSphere.visible = true;
                setTimeout(() => {
                    state.raycastDebugSphere.visible = false;
                }, 500);

                // Normal object selection
                selectObject(intersectedObject);
            } else {
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
    // Clear pending operations when object selection changes
    _onSelectionChanged();

    // Clear any existing "select all" highlights first if this object was part of it
    if (state.allHighlightsOriginalMaterials.size > 0) {
        // Clear all highlights and the state.currentlySelectedObjectsForEditing array
        clearAllHighlights();
    }

    // Clear any previous individual selection
    clearSelection();

    if (object && isObjectLocked(object)) {
        addMessageToLog('System', `${object.name || 'Object'} is locked. Unlock it in Models & Layers before editing.`);
        clearSelection();
        return;
    }

    if (object) {
        state.selectedObject = object;

        const materials = Array.isArray(state.selectedObject.material) ? state.selectedObject.material : [state.selectedObject.material];
        const objectOriginalMaterials = []; // Array to store original material instances
        const outlineOnly = isLargeArchitecturalSurface(object);

        materials.forEach((mat, index) => {
            if (mat && mat.isMaterial) { // Defensive check for valid material
                // Store the original material instance itself
                objectOriginalMaterials.push(mat.clone()); // Store a clone of the current material for highlight reversion

                // Apply highlight. Large roof/slab/floor surfaces use outline only to avoid bright wash/flicker.
                if (outlineOnly) {
                } else if (mat.emissive !== undefined) {
                    mat.emissive.copy(highlightMaterial.color);
                    mat.emissiveIntensity = 1;
                } else if (mat.color !== undefined) {
                    // If no emissive, change the main color
                    mat.color.copy(highlightMaterial.color);
                } else {
                    console.warn(`[selectObject] Material for ${object.name || 'Unnamed Part'} (UUID: ${object.uuid}, material index ${index}) does not have an emissive or color property. Highlighting might not work as expected.`);
                }
                mat.needsUpdate = true;
            } else {
                console.warn(`[selectObject] Material at index ${index} for object ${object.name || object.uuid} is null or not a valid material. Skipping highlight.`);
            }
        });
        addSelectionOutline(state.selectedObject);
        state.originalMaterialProperties.set(state.selectedObject.uuid, objectOriginalMaterials); // Store the array of current materials for individual selection reversion

        state.transformControls.attach(state.selectedObject);
        state.transformControls.visible = true; // Make state.controls visible
        state.transformControls.enabled = true; // Ensure state.controls are enabled

        // Set default mode to translate, but ensure all modes work
        state.transformControls.setMode('translate');

        addMessageToLog('System', `Selected: ${object.name || 'Unnamed Part'} (UUID: ${object.uuid}). Press S to scale, R to rotate, G to move.`);
        _speakResponse(`Selected ${object.name || 'a part'}. Press S to scale.`);
        _onObjectSelected(object);

        // Don't save state on selection - save when actual changes happen
    } else {
        clearSelection(); // If no object is passed, clear selection
    }
}

export function clearSelection() {
    // Clear pending operations when selection is cleared
    _onSelectionChanged();
    removeSelectionOutline(state.selectedObject);

    if (state.selectedObject && state.originalMaterialProperties.has(state.selectedObject.uuid)) {
        const originalMaterials = state.originalMaterialProperties.get(state.selectedObject.uuid); // Get the array of original material instances
        const currentMaterials = Array.isArray(state.selectedObject.material) ? state.selectedObject.material : [state.selectedObject.material];

        currentMaterials.forEach((mat, index) => {
            if (mat && mat.isMaterial && originalMaterials[index]) { // Defensive check
                if (!isMaterialUsedByAnotherMesh(mat, state.selectedObject)) mat.dispose();
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
            } else {
                console.warn(`[clearSelection] Material at index ${index} for object ${state.selectedObject.name || state.selectedObject.uuid} is null or not a valid material, or no original material instance found. Skipping restore.`);
            }
        });

        // Detach transform state.controls before clearing state.selectedObject
        if (state.transformControls) {
            state.transformControls.detach(); // Detach state.controls when selection is cleared
            state.transformControls.visible = false; // Explicitly hide state.controls
        }

        state.originalMaterialProperties.delete(state.selectedObject.uuid); // Remove from map
        state.selectedObject = null; // Clear selected object reference
    } else {
        if (state.selectedObject && state.transformControls) {
            state.transformControls.detach();
            state.transformControls.visible = false;
        }
        state.selectedObject = null;
    }
    state.currentlySelectedObjectsForEditing = []; // Clear the functional selection array
    _onObjectSelected(null);
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
                            mat.emissiveIntensity = 1;
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

    state.currentlySelectedObjectsForEditing.forEach(removeSelectionOutline);

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
        if (state.transformControls?.object === groupHelper) {
            state.transformControls.detach();
            state.transformControls.visible = false;
        }
        state.scene.remove(groupHelper);
        if (state.selectedObject === groupHelper) state.selectedObject = null;
        console.log("[clearAllHighlights] Removed group editing helper");
    }

    if (state.allHighlightsOriginalMaterials.size === 0) {
        state.currentlySelectedObjectsForEditing = [];
        console.log("[clearAllHighlights] No global highlights to clear.");
        return;
    }

    let clearedCount = 0;
    for (const [uuid, originalMaterials] of state.allHighlightsOriginalMaterials.entries()) {
        const object = state.scene.getObjectByProperty('uuid', uuid);
        if (object && object.isMesh) {
            removeSelectionOutline(object);
            const currentMaterials = Array.isArray(object.material) ? object.material : [object.material];
            currentMaterials.forEach((mat, index) => {
                if (mat && mat.isMaterial && originalMaterials[index]) {
                    if (!isMaterialUsedByAnotherMesh(mat, object)) mat.dispose();
                    // Restore the material as it was immediately before Structure view.
                    if (Array.isArray(object.material)) {
                        object.material[index] = originalMaterials[index];
                    } else {
                        object.material = originalMaterials[index];
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
    if (state.selectedObject) {
        const object = state.selectedObject;
        const objectToRemoveName = object.name || "Unnamed Part";
        const objectToRemoveUUID = object.uuid;
        const parent = object.parent;
        const modelIndex = state.loadedModels.indexOf(object);

        if (parent) {
            clearSelection();
            parent.remove(object);
            if (modelIndex > -1) state.loadedModels.splice(modelIndex, 1);

            _beginUndoGroup(`Delete ${objectToRemoveName}`);
            _addUndoAction({
                type: 'delete_object',
                object,
                parent,
                modelIndex,
                revert: () => {
                    parent.add(object);
                    if (modelIndex > -1 && !state.loadedModels.includes(object)) {
                        state.loadedModels.splice(modelIndex, 0, object);
                    }
                },
                apply: () => {
                    object.parent?.remove(object);
                    const currentIndex = state.loadedModels.indexOf(object);
                    if (currentIndex > -1) state.loadedModels.splice(currentIndex, 1);
                }
            });
            _endUndoGroup();

            if (modelIndex > -1) {
                console.log(`[Remove Object] Removed top-level model: ${objectToRemoveName}. Remaining models: ${state.loadedModels.length}`);
            } else {
                console.log(`[Remove Object] Removed object: ${objectToRemoveName} (UUID: ${objectToRemoveUUID})`);
            }

            if (state.originalMaterialProperties.has(object.uuid)) {
                state.originalMaterialProperties.delete(object.uuid);
            }
            if (state.allHighlightsOriginalMaterials.has(object.uuid)) {
                state.allHighlightsOriginalMaterials.delete(object.uuid);
            }

            addMessageToLog('AI', `Removed ${objectToRemoveName}.`);
            _speakResponse(`Removed ${objectToRemoveName}.`);
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
