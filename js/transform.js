import { state } from './state.js';
import { addMessageToLog } from './utils.js';
import { getSelectedObjects } from './selection.js';

let _speakResponse = () => {};
let _beginUndoGroup = () => {};
let _endUndoGroup = () => {};
let _addUndoAction = () => {};
let transformDragState = null;
let transformDragConstraint = null;

function constrainDraggedPosition(object, before, axis) {
    if (!axis || axis === 'XYZ' || state.transformControls?.mode !== 'translate') return;
    const allowedAxes = new Set(axis.replace('E', '').split(''));
    const worldPosition = object.getWorldPosition(new THREE.Vector3());
    if (!allowedAxes.has('X')) worldPosition.x = before.worldPosition.x;
    if (!allowedAxes.has('Y')) worldPosition.y = before.worldPosition.y;
    if (!allowedAxes.has('Z')) worldPosition.z = before.worldPosition.z;

    object.position.copy(worldPosition);
    object.parent?.worldToLocal(object.position);
}

export function initTransformCallbacks(cbs) {
    _speakResponse = cbs.speakResponse;
    _beginUndoGroup = cbs.beginUndoGroup;
    _endUndoGroup = cbs.endUndoGroup;
    _addUndoAction = cbs.addUndoAction;
}

export function setScaleMode() {
    // If multiple objects are selected, use direct scaling
    if (state.currentlySelectedObjectsForEditing.length > 1) {
        console.log("Multiple objects selected - using direct scaling");
        addMessageToLog('System', `Scale mode: Use scaleAllObjects(1.5) to scale ${state.currentlySelectedObjectsForEditing.length} objects together`);
        console.log("Available commands:");
        console.log("- scaleAllObjects(1.5) - Make all objects 1.5x bigger");
        console.log("- scaleAllObjects(2) - Make all objects 2x bigger");
        console.log("- scaleAllObjects(0.5) - Make all objects half size");
        return;
    }

    if (state.transformControls) {
        state.transformControls.setMode('scale');
        console.log("✅ Transform mode set to SCALE");
        addMessageToLog('System', 'Transform mode: Scale (resize objects)');

        // Reset group helper scale if it exists
        const groupHelper = state.scene.getObjectByProperty('name', 'GroupMovementHelper');
        if (groupHelper) {
            groupHelper.scale.set(1, 1, 1);
            console.log("Reset group helper scale for new scaling operation");
        }
    }
}

export function setRotateMode() {
    // If multiple objects are selected, use direct rotation
    if (state.currentlySelectedObjectsForEditing.length > 1) {
        console.log("Multiple objects selected - using direct rotation");
        addMessageToLog('System', `Rotate mode: Use rotateAllObjects() to rotate ${state.currentlySelectedObjectsForEditing.length} objects together`);
        console.log("Available commands:");
        console.log("- rotateAllObjects(0, Math.PI/4, 0) - Rotate all 45° around Y");
        console.log("- rotateAllObjects(0, Math.PI/2, 0) - Rotate all 90° around Y");
        console.log("- rotateAllObjects(Math.PI/4, 0, 0) - Rotate all 45° around X");
        return;
    }

    if (state.transformControls) {
        state.transformControls.setMode('rotate');
        console.log("✅ Transform mode set to ROTATE");
        addMessageToLog('System', 'Transform mode: Rotate (turn objects)');

        // Reset group helper rotation if it exists
        const groupHelper = state.scene.getObjectByProperty('name', 'GroupMovementHelper');
        if (groupHelper) {
            groupHelper.rotation.set(0, 0, 0);
            console.log("Reset group helper rotation for new rotation operation");
        }
    }
}

export function setTranslateMode() {
    // If multiple objects are selected, use direct movement
    if (state.currentlySelectedObjectsForEditing.length > 1) {
        console.log("Multiple objects selected - using direct movement");
        addMessageToLog('System', `Move mode: Use moveAllObjects() to move ${state.currentlySelectedObjectsForEditing.length} objects together`);
        console.log("Available commands:");
        console.log("- moveAllObjects(2, 0, 0) - Move all right by 2");
        console.log("- moveAllObjects(0, 1, 0) - Move all up by 1");
        console.log("- moveAllObjects(0, 0, -2) - Move all back by 2");
        return;
    }

    if (state.transformControls) {
        state.transformControls.setMode('translate');
        console.log("✅ Transform mode set to TRANSLATE");
        addMessageToLog('System', 'Transform mode: Translate (move objects)');
    }
}

export function transformSelection(transformType, params) {
    console.log(`=== TRANSFORM SELECTION: ${transformType.toUpperCase()} ===`);

    const selection = getSelectedObjects();
    console.log(`Selection count: ${selection.length}`);

    if (selection.length === 0) {
        addMessageToLog('System', `No objects selected to ${transformType}.`);
        _speakResponse(`No objects selected to ${transformType}.`);
        return;
    }

    // Begin grouped undo action
    _beginUndoGroup(`${transformType.charAt(0).toUpperCase() + transformType.slice(1)} ${selection.length} object${selection.length > 1 ? 's' : ''}`);

    const transformedObjects = [];

    try {
        for (const obj of selection) {
            console.log(`${transformType}: ${obj.name || obj.type} (UUID: ${obj.uuid})`);

            // Store original transform values for undo
            const originalTransform = {
                position: obj.position.clone(),
                rotation: obj.rotation.clone(),
                scale: obj.scale.clone()
            };

            // Apply the transformation
            switch (transformType) {
                case 'translate':
                case 'move':
                    const { x = 0, y = 0, z = 0 } = params;
                    obj.position.x += x;
                    obj.position.y += y;
                    obj.position.z += z;
                    break;

                case 'rotate':
                    const { rx = 0, ry = 0, rz = 0 } = params;
                    obj.rotation.x += rx;
                    obj.rotation.y += ry;
                    obj.rotation.z += rz;
                    break;

                case 'scale':
                    const { sx = 1, sy = null, sz = null } = params;
                    const scaleX = sx;
                    const scaleY = sy !== null ? sy : sx;
                    const scaleZ = sz !== null ? sz : sx;
                    obj.scale.x *= scaleX;
                    obj.scale.y *= scaleY;
                    obj.scale.z *= scaleZ;
                    break;
            }

            // Update world matrix
            obj.updateMatrixWorld(true);
            const appliedTransform = {
                position: obj.position.clone(),
                rotation: obj.rotation.clone(),
                scale: obj.scale.clone()
            };

            transformedObjects.push(obj);

            // Add undo action for this specific transform
            _addUndoAction({
                type: `${transformType}_object`,
                object: obj,
                originalTransform: originalTransform,
                revert: () => {
                    obj.position.copy(originalTransform.position);
                    obj.rotation.copy(originalTransform.rotation);
                    obj.scale.copy(originalTransform.scale);
                    obj.updateMatrixWorld(true);
                },
                apply: () => {
                    obj.position.copy(appliedTransform.position);
                    obj.rotation.copy(appliedTransform.rotation);
                    obj.scale.copy(appliedTransform.scale);
                    obj.updateMatrixWorld(true);
                }
            });

            console.log(`✅ ${transformType} applied to: ${obj.name || obj.type}`);
        }

        // End the undo group
        _endUndoGroup();

        const message = `${transformType.charAt(0).toUpperCase() + transformType.slice(1)}ed ${transformedObjects.length} object${transformedObjects.length > 1 ? 's' : ''}.`;
        addMessageToLog('System', message);
        _speakResponse(message);

        console.log(`✅ ${transformType} complete: ${transformedObjects.length} objects transformed`);

    } catch (error) {
        console.error(`❌ ${transformType} failed:`, error);
        addMessageToLog('System', `${transformType} failed: ${error.message}`);

        // End the undo group (will be empty due to error)
        _endUndoGroup();
    }
}

export function translateSelection(x, y, z) {
    transformSelection('translate', { x, y, z });
}

export function rotateSelection(rx, ry, rz) {
    transformSelection('rotate', { rx, ry, rz });
}

export function scaleSelection(sx, sy, sz) {
    transformSelection('scale', { sx, sy, sz });
}

export function initTransformControls() {
    if (!state.transformControls) {
        state.transformControls = new THREE.TransformControls(state.camera, state.renderer.domElement);
        state.scene.add(state.transformControls);
        state.transformControls.addEventListener('dragging-changed', function (event) {
            state.controls.enabled = !event.value;
            if (event.value && state.transformControls.object) {
                const controlObject = state.transformControls.object;
                const targets = controlObject.userData.selectedModels || [controlObject];
                transformDragConstraint = {
                    object: controlObject,
                    axis: state.transformControls.axis,
                    before: {
                        worldPosition: controlObject.getWorldPosition(new THREE.Vector3())
                    }
                };
                transformDragState = targets.map(object => ({
                    object,
                    before: {
                        position: object.position.clone(),
                        rotation: object.rotation.clone(),
                        scale: object.scale.clone()
                    }
                }));
            } else if (!event.value && transformDragState) {
                _beginUndoGroup(`${state.transformControls.mode || 'transform'} ${transformDragState.length} object${transformDragState.length > 1 ? 's' : ''}`);
                transformDragState.forEach(({ object, before }) => {
                    const after = {
                        position: object.position.clone(),
                        rotation: object.rotation.clone(),
                        scale: object.scale.clone()
                    };
                    const changed = !before.position.equals(after.position)
                        || !before.rotation.equals(after.rotation)
                        || !before.scale.equals(after.scale);
                    if (!changed) return;
                    _addUndoAction({
                        type: `${state.transformControls.mode || 'transform'}_object`,
                        object,
                        revert: () => {
                            object.position.copy(before.position);
                            object.rotation.copy(before.rotation);
                            object.scale.copy(before.scale);
                            object.updateMatrixWorld(true);
                        },
                        apply: () => {
                            object.position.copy(after.position);
                            object.rotation.copy(after.rotation);
                            object.scale.copy(after.scale);
                            object.updateMatrixWorld(true);
                        }
                    });
                });
                _endUndoGroup();
                transformDragState = null;
                transformDragConstraint = null;
            }
        });
        state.transformControls.addEventListener('objectChange', function () {
            // Update the object's world matrix during transformation
            if (state.transformControls.object) {
                if (transformDragConstraint) {
                    constrainDraggedPosition(
                        transformDragConstraint.object,
                        transformDragConstraint.before,
                        transformDragConstraint.axis
                    );
                }
                state.transformControls.object.updateMatrixWorld(true);
            }
        });
        state.transformControls.visible = false; // Initialize as hidden
    }
}

export function setTransformMode(mode) {
    if (state.transformControls) {
        // Don't save state for mode changes - save when actual transform happens
        state.transformControls.setMode(mode);
        addMessageToLog('AI', `Transform mode set to ${mode}.`);
        _speakResponse(`Transform mode set to ${mode}.`);
    } else {
        addMessageToLog('System', 'Transform state.controls not available.');
        _speakResponse('Transform state.controls are not available.');
    }
}
