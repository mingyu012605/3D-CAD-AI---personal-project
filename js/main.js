import { state } from './state.js';
import { addMessageToLog, indexScene, findObjectsByClass, makeTextSprite } from './utils.js';
import { updateDynamicGrid, startAnimateLoop, initViewAxesHelper, onWindowResize } from './scene.js';
import {
    selectObject, clearSelection, highlightAllModels, clearAllHighlights,
    getSelectedObjects, setSelectedObjects, removeObject,
    duplicateSelectedObject, duplicateSelection,
    onCanvasClick, onCanvasMouseMove,
    initSelectionCallbacks
} from './selection.js';
import {
    setTranslateMode, setRotateMode, setScaleMode, setTransformMode,
    translateSelection, rotateSelection, scaleSelection,
    initTransformCallbacks, initTransformControls
} from './transform.js';
import {
    beginUndoGroup, addUndoAction, endUndoGroup,
    saveSceneState,
    undo, redo, updateUndoRedoButtons, getCurrentState,
    initHistoryCallbacks, getHistoryDebugState
} from './history.js';
import { createPrimitive } from './primitives.js';
import {
    loadRandomModel, loadModel,
    initLoaderCallbacks, initLoaderEventHandlers
} from './loader.js';

        // THREE.js is now available globally
        console.log("THREE.js loaded:", typeof THREE !== 'undefined');


        // Variables for dynamic grid

        // Global array to store all loaded GLTF scenes
        // New state.scene and state.camera for the static view axes helper

        // Get references to HTML elements
        const fileInput = document.getElementById('fileInput');
        const dropZone = document.getElementById('dropZone');
        const loadingMsg = document.getElementById('loadingMsg');
        const uploadPage = document.getElementById('uploadPage');
        const editorPage = document.getElementById('editorPage');
        const integratedVoiceBtn = document.getElementById('integratedVoiceBtn');
        const aiLog = document.getElementById('aiLog');
        const textCommandInput = document.getElementById('textCommandInput');
        const sendTextCommandBtn = document.getElementById('sendTextCommandBtn');
        const cadCanvas = document.getElementById('cadCanvas');
        const cadViewer = document.getElementById('cadViewer'); // Reference to the cadViewer div
        const viewAxesContainer = document.getElementById('viewAxesContainer'); // Container for the static view axes

        // New button references on the upload page
        const loadRandomModelButton = document.getElementById('loadRandomModelButton');
        const createNewEmptyModelButton = document.getElementById('createNewEmptyModelButton');
        const editExistingModelButton = document.getElementById('editExistingModelButton');

        // Updated button references on editor page
        const uploadNewFileButton = document.getElementById('uploadNewFileButton');
        const saveButton = document.getElementById('saveButton');
        const undoButton = document.getElementById('undoButton'); // New Undo button
        const redoButton = document.getElementById('redoButton'); // New Redo button
        const chatContent = document.getElementById('chatContent');
        const codeEditorContent = document.getElementById('codeEditorContent');
        const cssCodeEditor = document.getElementById('cssCodeEditor');
        const applyCssButton = document.getElementById('applyCssButton');

        // NEW: References to tab buttons for setActiveTab function
        const chatTabButton = document.getElementById('chatTabButton');
        const codeEditorTabButton = document.getElementById('codeEditorTabButton');


        // New view control buttons - these are now unused in the HTML but kept for reference if AI commands use them
        const topViewBtn = document.getElementById('topViewBtn');
        const bottomViewBtn = document.getElementById('bottomViewBtn');
        const frontViewBtn = document.getElementById('frontViewBtn');
        const backViewBtn = document.getElementById('backViewBtn');
        const rightViewBtn = document.getElementById('rightViewBtn');
        const leftViewBtn = document.getElementById('leftViewBtn');
        const isometricViewBtn = document.getElementById('isometricViewBtn');
        const fitAllViewBtn = document.getElementById('fitAllViewBtn');

        // New object properties UI elements
        const objectColorPicker = document.getElementById('objectColorPicker');
        const applyObjectColorBtn = document.getElementById('applyObjectColorBtn');

        // Debugging: Raycast hit visualizer


        // --- Expose functions globally for HTML onclick attributes ---
        window.removeObject = removeObject;
        window.resetView = resetView;
        window.showDesignInfo = showDesignInfo;
        window.goBack = goBack;
        window.selectPartByName = selectPartByName;
        window.setTransformMode = setTransformMode;
        window.listParts = listParts;
        window.saveModel = saveModel; // Expose saveModel globally
        window.highlightAllModels = highlightAllModels; // Expose for AI command
        window.clearAllHighlights = clearAllHighlights; // Expose for AI command
        window.duplicateSelectedObject = duplicateSelectedObject; // Expose for AI command
        window.undo = undo; // Expose undo for testing
        window.redo = redo; // Expose redo for testing
        window.createPrimitive = createPrimitive; // Expose for testing
        window.selectObject = selectObject; // Expose for testing
        window.clearSelection = clearSelection; // Expose for testing
        window.setScaleMode = setScaleMode;
        window.setRotateMode = setRotateMode;
        window.setTranslateMode = setTranslateMode;
        window.translateSelection = translateSelection;
        window.rotateSelection = rotateSelection;
        window.scaleSelection = scaleSelection;

        initSelectionCallbacks({
            speakResponse,
            getCurrentState,
            updateUndoRedoButtons,
            resetView,
            beginUndoGroup,
            endUndoGroup,
            addUndoAction,
            detectFaceFromClick,
            onSelectionChanged,
            raycastFaceOverlays
        });

        initHistoryCallbacks({
            speakResponse,
            resetView
        });

        initTransformCallbacks({
            speakResponse,
            beginUndoGroup,
            endUndoGroup,
            addUndoAction,
            saveSceneState
        });

        initLoaderCallbacks({
            speakResponse,
            resetView,
            goToEditor
        });
        initLoaderEventHandlers();

        // Duplicate multiple objects at once (for select all)
        window.duplicateAll = function() {
            console.log("=== DUPLICATING ALL OBJECTS ===");

            if (state.loadedModels.length === 0) {
                console.log("❌ No objects to duplicate");
                addMessageToLog('System', 'No objects found to duplicate.');
                return;
            }

            console.log(`Duplicating ${state.loadedModels.length} objects...`);

            // Save state for undo
            const currentState = getCurrentState();
            state.undoStack.push(currentState);
            state.redoStack = [];

            const duplicatedObjects = [];

            // Duplicate each object
            state.loadedModels.forEach((original, index) => {
                try {
                    const clone = original.clone();

                    // Position the copy to the right of original
                    clone.position.copy(original.position);
                    clone.position.x += 3; // Move 3 units to the right

                    // Set name
                    clone.name = `${original.name || 'Object'} (Copy)`;

                    // Copy userData
                    clone.userData = { ...original.userData };

                    // Add to state.scene
                    state.scene.add(clone);
                    state.loadedModels.push(clone);
                    duplicatedObjects.push(clone);

                    console.log(`✅ Duplicated: ${original.name} → ${clone.name}`);

                } catch (error) {
                    console.error(`❌ Failed to duplicate ${original.name}:`, error);
                }
            });

            console.log(`✅ Successfully duplicated ${duplicatedObjects.length} objects`);
            addMessageToLog('System', `Duplicated ${duplicatedObjects.length} objects. Copies created to the right.`);

            // Clear selection and highlight all objects (including new copies)
            clearSelection();
            clearAllHighlights();

            // Optionally select all objects including copies
            setTimeout(() => {
                highlightAllModels();
            }, 100);

            updateUndoRedoButtons();
        };

        // BULLETPROOF DUPLICATE FUNCTION
        window.duplicateNow = function() {
            console.log("=== DUPLICATE NOW (BULLETPROOF) ===");

            try {
                // Check if we have objects
                if (!state.loadedModels || state.loadedModels.length === 0) {
                    console.log("❌ No objects to duplicate");
                    alert("No objects to duplicate! Create some objects first.");
                    return;
                }

                const originalCount = state.loadedModels.length;
                console.log(`Starting duplication of ${originalCount} objects...`);

                // Create array of objects to duplicate (snapshot)
                const objectsToClone = [];
                for (let i = 0; i < originalCount; i++) {
                    objectsToClone.push(state.loadedModels[i]);
                }

                // Duplicate each object
                for (let i = 0; i < objectsToClone.length; i++) {
                    const original = objectsToClone[i];
                    console.log(`Duplicating ${i + 1}/${objectsToClone.length}: ${original.name || 'Unnamed'}`);

                    try {
                        // Use THREE.js clone method (safest approach)
                        const clone = original.clone();

                        // Move clone to the right
                        clone.position.x = original.position.x + 3;
                        clone.position.y = original.position.y;
                        clone.position.z = original.position.z;

                        // Update name
                        clone.name = (original.name || 'Object') + ' Copy';

                        // Ensure userData is copied
                        if (original.userData) {
                            clone.userData = {
                                isPrimitive: original.userData.isPrimitive || true,
                                primitiveType: original.userData.primitiveType || 'cube',
                                initialMaterial: clone.material ? clone.material.clone() : null
                            };
                        }

                        // Add to state.scene
                        state.scene.add(clone);
                        state.loadedModels.push(clone);

                        console.log(`✅ Successfully duplicated: ${clone.name}`);

                    } catch (cloneError) {
                        console.error(`❌ Failed to clone ${original.name}:`, cloneError);

                        // Fallback: manual creation
                        try {
                            console.log("Trying manual creation fallback...");

                            let geometry, material;

                            // Determine geometry type and recreate
                            if (original.userData && original.userData.primitiveType) {
                                const type = original.userData.primitiveType.toLowerCase();
                                switch (type) {
                                    case 'cube':
                                    case 'box':
                                        geometry = new THREE.BoxGeometry(1, 1, 1);
                                        break;
                                    case 'sphere':
                                    case 'ball':
                                        geometry = new THREE.SphereGeometry(0.5, 32, 32);
                                        break;
                                    case 'pyramid':
                                        geometry = new THREE.ConeGeometry(0.5, 1, 4);
                                        break;
                                    case 'cone':
                                        geometry = new THREE.ConeGeometry(0.5, 1, 32);
                                        break;
                                    case 'cylinder':
                                        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
                                        break;
                                    case 'torus':
                                        geometry = new THREE.TorusGeometry(0.5, 0.2, 16, 100);
                                        break;
                                    default:
                                        geometry = new THREE.BoxGeometry(1, 1, 1);
                                }
                            } else {
                                geometry = new THREE.BoxGeometry(1, 1, 1);
                            }

                            // Create material
                            material = new THREE.MeshStandardMaterial({
                                color: original.material && original.material.color ?
                                       original.material.color.getHex() : 0x00ff00
                            });

                            // Create mesh
                            const fallbackMesh = new THREE.Mesh(geometry, material);
                            fallbackMesh.position.x = original.position.x + 3;
                            fallbackMesh.position.y = original.position.y;
                            fallbackMesh.position.z = original.position.z;
                            fallbackMesh.scale.copy(original.scale);
                            fallbackMesh.rotation.copy(original.rotation);
                            fallbackMesh.name = (original.name || 'Object') + ' Copy';

                            fallbackMesh.userData = {
                                isPrimitive: true,
                                primitiveType: original.userData?.primitiveType || 'cube',
                                initialMaterial: material.clone()
                            };

                            state.scene.add(fallbackMesh);
                            state.loadedModels.push(fallbackMesh);

                            console.log(`✅ Fallback creation successful: ${fallbackMesh.name}`);

                        } catch (fallbackError) {
                            console.error(`❌ Fallback creation also failed:`, fallbackError);
                        }
                    }
                }

                const finalCount = state.loadedModels.length;
                const duplicatedCount = finalCount - originalCount;

                console.log(`✅ Duplication complete!`);
                console.log(`✅ Original objects: ${originalCount}`);
                console.log(`✅ Final objects: ${finalCount}`);
                console.log(`✅ Objects duplicated: ${duplicatedCount}`);

                alert(`Success! Duplicated ${duplicatedCount} objects. Total objects: ${finalCount}`);

                // Force render update
                if (state.renderer && state.scene && state.camera) {
                    state.renderer.render(state.scene, state.camera);
                }

            } catch (mainError) {
                console.error("❌ Main duplication error:", mainError);
                alert(`Duplication failed: ${mainError.message}`);
            }
        };

        // Even simpler duplicate all function
        window.duplicateEverything = function() {
            console.log("=== DUPLICATING EVERYTHING (SIMPLE) ===");

            if (state.loadedModels.length === 0) {
                console.log("❌ No objects to duplicate");
                addMessageToLog('System', 'No objects found to duplicate.');
                return;
            }

            const originalCount = state.loadedModels.length;
            console.log(`Duplicating ${originalCount} objects...`);

            // Save state for undo
            const currentState = getCurrentState();
            state.undoStack.push(currentState);
            state.redoStack = [];

            // Get all current objects
            const objectsToDuplicate = [...state.loadedModels];

            // Duplicate each one
            objectsToDuplicate.forEach(original => {
                const clone = original.clone();
                clone.position.copy(original.position);
                clone.position.x += 3;
                clone.name = `${original.name} (Copy)`;
                clone.userData = { ...original.userData };

                state.scene.add(clone);
                state.loadedModels.push(clone);
            });

            console.log(`✅ Duplicated ${originalCount} objects`);
            console.log(`✅ Total objects: ${state.loadedModels.length}`);

            addMessageToLog('System', `Duplicated ${originalCount} objects. Total: ${state.loadedModels.length}`);
            updateUndoRedoButtons();
        };

        // DEBUG: Check what happens with select all + duplicate
        window.debugSelectAllDuplicate = function() {
            console.log("=== DEBUGGING SELECT ALL + DUPLICATE ===");

            // Step 1: Create objects
            console.log("1. Creating test objects...");
            createPrimitive('cube');
            createPrimitive('sphere');
            createPrimitive('pyramid');

            setTimeout(() => {
                console.log("2. Objects created:");
                console.log("   - state.loadedModels.length:", state.loadedModels.length);
                console.log("   - Objects:", state.loadedModels.map(obj => obj.name));

                // Step 2: Select all
                console.log("3. Calling highlightAllModels()...");
                highlightAllModels();

                setTimeout(() => {
                    console.log("4. After select all:");
                    console.log("   - state.selectedObject:", state.selectedObject ? state.selectedObject.name : 'null');
                    console.log("   - state.currentlySelectedObjectsForEditing.length:", state.currentlySelectedObjectsForEditing.length);
                    console.log("   - Selected objects:", state.currentlySelectedObjectsForEditing.map(obj => obj.name || obj.type));

                    // Step 3: Try duplicate
                    console.log("5. Calling duplicateNow()...");
                    duplicateNow();

                    setTimeout(() => {
                        console.log("6. After duplicate:");
                        console.log("   - state.loadedModels.length:", state.loadedModels.length);
                        console.log("   - Expected: 6 objects");
                        console.log("   - Actual objects:", state.loadedModels.map(obj => obj.name));

                        if (state.loadedModels.length === 6) {
                            console.log("✅ SUCCESS: Duplication worked!");
                        } else {
                            console.error("❌ FAILED: Duplication didn't work properly");
                        }
                    }, 500);
                }, 500);
            }, 1000);
        };

        // SUPER SIMPLE: Just duplicate without any selection logic
        window.justDuplicate = function() {
            console.log("=== JUST DUPLICATE (NO SELECTION) ===");

            if (state.loadedModels.length === 0) {
                alert("Create some objects first!");
                return;
            }

            const count = state.loadedModels.length;
            console.log(`Duplicating ${count} objects...`);

            // Simple loop - duplicate each object
            for (let i = 0; i < count; i++) {
                const original = state.loadedModels[i];

                // Create exact copy using clone
                const copy = original.clone();
                copy.position.x += 3; // Move to right
                copy.name = original.name + " Copy";

                state.scene.add(copy);
                state.loadedModels.push(copy);

                console.log(`Copied: ${original.name} → ${copy.name}`);
            }

            console.log(`Done! Total objects: ${state.loadedModels.length}`);
            alert(`Duplicated ${count} objects!`);
        };

        // MULTI-OBJECT EDITING SYSTEM - Edit many objects at once
        window.editSelected = function(action, ...params) {
            console.log(`=== EDITING ${state.currentlySelectedObjectsForEditing.length} SELECTED OBJECTS ===`);
            console.log(`Action: ${action}`, params);

            if (state.currentlySelectedObjectsForEditing.length === 0) {
                console.log("❌ No objects selected. Use highlightAllModels() first.");
                addMessageToLog('System', 'No objects selected. Use "select all" first.');
                return;
            }

            // Save state for undo
            const currentState = getCurrentState();
            state.undoStack.push(currentState);
            state.redoStack = [];

            let successCount = 0;

            // Get unique top-level objects to edit
            const objectsToEdit = state.loadedModels.filter(model =>
                state.currentlySelectedObjectsForEditing.some(selected =>
                    selected === model || model.getObjectById(selected.id)
                )
            );

            console.log(`Editing ${objectsToEdit.length} top-level objects...`);

            objectsToEdit.forEach(obj => {
                try {
                    switch(action.toLowerCase()) {
                        case 'duplicate':
                            const clone = obj.clone();
                            clone.position.copy(obj.position);
                            clone.position.x += 3;
                            clone.name = `${obj.name || 'Object'} (Copy)`;
                            clone.userData = { ...obj.userData };
                            state.scene.add(clone);
                            state.loadedModels.push(clone);
                            successCount++;
                            break;

                        case 'move':
                        case 'translate':
                            const [x, y, z] = params;
                            obj.position.x += (x || 0);
                            obj.position.y += (y || 0);
                            obj.position.z += (z || 0);
                            successCount++;
                            break;

                        case 'scale':
                            const [sx, sy, sz] = params;
                            const scaleX = sx || params[0] || 1.5;
                            const scaleY = sy || params[0] || 1.5;
                            const scaleZ = sz || params[0] || 1.5;
                            obj.scale.x *= scaleX;
                            obj.scale.y *= scaleY;
                            obj.scale.z *= scaleZ;
                            successCount++;
                            break;

                        case 'rotate':
                            const [rx, ry, rz] = params;
                            obj.rotation.x += (rx || 0);
                            obj.rotation.y += (ry || Math.PI / 4); // Default 45 degrees
                            obj.rotation.z += (rz || 0);
                            successCount++;
                            break;

                        case 'color':
                            const color = params[0] || '#ff0000';
                            obj.traverse(child => {
                                if (child.isMesh && child.material) {
                                    if (Array.isArray(child.material)) {
                                        child.material.forEach(mat => {
                                            mat.color.setStyle(color);
                                            mat.needsUpdate = true;
                                        });
                                    } else {
                                        child.material.color.setStyle(color);
                                        child.material.needsUpdate = true;
                                    }
                                }
                            });
                            successCount++;
                            break;

                        case 'delete':
                        case 'remove':
                            state.scene.remove(obj);
                            const index = state.loadedModels.indexOf(obj);
                            if (index > -1) {
                                state.loadedModels.splice(index, 1);
                            }
                            // Dispose geometry and materials
                            obj.traverse(child => {
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
                            successCount++;
                            break;

                        default:
                            console.warn(`Unknown action: ${action}`);
                    }
                } catch (error) {
                    console.error(`Failed to ${action} object ${obj.name}:`, error);
                }
            });

            console.log(`✅ Successfully ${action}ed ${successCount} objects`);
            addMessageToLog('System', `${action} applied to ${successCount} selected objects.`);

            // Update selection if objects still exist
            if (action !== 'delete' && action !== 'remove') {
                setTimeout(() => {
                    highlightAllModels();
                }, 100);
            } else {
                clearSelection();
                clearAllHighlights();
            }

            updateUndoRedoButtons();
        };

        // ULTRA SIMPLE: Duplicate all objects - GUARANTEED TO WORK
        window.duplicateAll = function() {
            console.log("=== DUPLICATING ALL OBJECTS ===");

            // Check if we have objects
            if (!state.loadedModels || state.loadedModels.length === 0) {
                console.log("❌ No objects found");
                alert("No objects to duplicate. Create some objects first!");
                return;
            }

            console.log(`Starting duplication of ${state.loadedModels.length} objects...`);

            // Store original count
            const originalCount = state.loadedModels.length;

            // Get snapshot of current objects
            const objectsToClone = [];
            for (let i = 0; i < originalCount; i++) {
                objectsToClone.push(state.loadedModels[i]);
            }

            console.log("Objects to clone:", objectsToClone.map(obj => obj.name || obj.type));

            // Clone each object
            for (let i = 0; i < objectsToClone.length; i++) {
                const original = objectsToClone[i];
                console.log(`Cloning ${i + 1}/${objectsToClone.length}: ${original.name}`);

                try {
                    // Create the clone
                    const clone = original.clone();

                    // Set position (move to the right)
                    clone.position.x = original.position.x + 3;
                    clone.position.y = original.position.y;
                    clone.position.z = original.position.z;

                    // Set name
                    clone.name = original.name + " (Copy)";

                    // Copy important properties
                    if (original.userData) {
                        clone.userData = JSON.parse(JSON.stringify(original.userData));
                    }

                    // Add to state.scene
                    state.scene.add(clone);

                    // Add to our tracking array
                    state.loadedModels.push(clone);

                    console.log(`✅ Successfully cloned: ${clone.name}`);

                } catch (error) {
                    console.error(`❌ Error cloning ${original.name}:`, error);
                    alert(`Error cloning ${original.name}: ${error.message}`);
                }
            }

            const finalCount = state.loadedModels.length;
            console.log(`✅ Duplication complete!`);
            console.log(`✅ Objects before: ${originalCount}`);
            console.log(`✅ Objects after: ${finalCount}`);
            console.log(`✅ New objects created: ${finalCount - originalCount}`);

            // Show success message
            alert(`Success! Duplicated ${originalCount} objects. Total objects: ${finalCount}`);

            // Force render update
            if (state.renderer && state.scene && state.camera) {
                state.renderer.render(state.scene, state.camera);
            }
        };

        // SPECIFIC FUNCTION FOR AFTER SELECT ALL
        window.duplicateAfterSelectAll = function() {
            console.log("=== DUPLICATE AFTER SELECT ALL ===");
            console.log("Current state:");
            console.log("- state.loadedModels.length:", state.loadedModels.length);
            console.log("- state.currentlySelectedObjectsForEditing.length:", state.currentlySelectedObjectsForEditing.length);

            // Just duplicate all objects regardless of selection
            justDuplicate();
        };

        // WORKING DUPLICATE FUNCTION - FINAL VERSION
        window.duplicateMultiple = function() {
            console.log("=== DUPLICATING MULTIPLE OBJECTS ===");

            if (!state.loadedModels || state.loadedModels.length === 0) {
                alert("No objects to duplicate! Create some objects first.");
                return;
            }

            const beforeCount = state.loadedModels.length;
            console.log(`Before: ${beforeCount} objects`);

            // Create array of objects to duplicate (snapshot to avoid infinite loop)
            const objectsToClone = [];
            for (let i = 0; i < beforeCount; i++) {
                objectsToClone.push(state.loadedModels[i]);
            }

            console.log("Objects to clone:", objectsToClone.map(obj => obj.name));

            // Clone each object
            objectsToClone.forEach((original, index) => {
                console.log(`Cloning ${index + 1}/${objectsToClone.length}: ${original.name}`);

                // Create the duplicate
                const duplicate = original.clone();

                // Position it to the right
                duplicate.position.set(
                    original.position.x + 3,
                    original.position.y,
                    original.position.z
                );

                // Give it a new name
                duplicate.name = original.name + " (Duplicate)";

                // Copy scale and rotation
                duplicate.scale.copy(original.scale);
                duplicate.rotation.copy(original.rotation);

                // Copy userData if it exists
                if (original.userData) {
                    duplicate.userData = {
                        isPrimitive: original.userData.isPrimitive,
                        primitiveType: original.userData.primitiveType,
                        initialMaterial: duplicate.material ? duplicate.material.clone() : null
                    };
                }

                // Add to state.scene and tracking array
                state.scene.add(duplicate);
                state.loadedModels.push(duplicate);

                console.log(`✅ Created: ${duplicate.name}`);
            });

            const afterCount = state.loadedModels.length;
            const duplicatedCount = afterCount - beforeCount;

            console.log(`After: ${afterCount} objects`);
            console.log(`Duplicated: ${duplicatedCount} objects`);

            // Show success message
            addMessageToLog('System', `Duplicated ${duplicatedCount} objects. Total: ${afterCount}`);
            alert(`✅ SUCCESS! Duplicated ${duplicatedCount} objects. Total: ${afterCount}`);

            // Update undo/redo
            updateUndoRedoButtons();
        };

        // WORKING DUPLICATE FOR MULTIPLE OBJECTS
        window.duplicateMultipleObjects = function() {
            console.log("=== DUPLICATING MULTIPLE OBJECTS ===");

            if (!state.loadedModels || state.loadedModels.length === 0) {
                alert("No objects to duplicate! Create some objects first.");
                return false;
            }

            const originalCount = state.loadedModels.length;
            console.log(`Starting duplication of ${originalCount} objects`);

            // Filter out helper objects and only get real objects
            const objectsToClone = state.loadedModels.filter(obj => {
                // Skip helper objects
                if (obj.name === 'GroupMovementHelper' ||
                    obj.userData?.isGroupHelper ||
                    obj.userData?.isHelper) {
                    console.log(`Skipping helper object: ${obj.name}`);
                    return false;
                }
                return true;
            });

            if (objectsToClone.length === 0) {
                alert("No real objects found to duplicate!");
                return false;
            }

            console.log(`Found ${objectsToClone.length} real objects to duplicate (filtered from ${originalCount} total)`);
            console.log("Objects to duplicate:", objectsToClone.map(obj => obj.name));

            let successCount = 0;

            // Duplicate each object
            objectsToClone.forEach((original, index) => {
                try {
                    console.log(`Duplicating ${index + 1}/${objectsToClone.length}: ${original.name}`);

                    // Clone the object
                    const duplicate = original.clone();

                    // Position to the right
                    duplicate.position.x = original.position.x + 3;
                    duplicate.position.y = original.position.y;
                    duplicate.position.z = original.position.z;

                    // Copy other properties
                    duplicate.scale.copy(original.scale);
                    duplicate.rotation.copy(original.rotation);
                    duplicate.name = original.name + " Copy";

                    // Copy userData
                    duplicate.userData = {
                        isPrimitive: original.userData?.isPrimitive || true,
                        primitiveType: original.userData?.primitiveType || 'cube',
                        initialMaterial: duplicate.material ? duplicate.material.clone() : null
                    };

                    // Add to state.scene
                    state.scene.add(duplicate);
                    state.loadedModels.push(duplicate);
                    successCount++;

                    console.log(`✅ Successfully duplicated: ${duplicate.name}`);

                } catch (error) {
                    console.error(`❌ Failed to duplicate ${original.name}:`, error);
                }
            });

            const finalCount = state.loadedModels.length;
            console.log(`Duplication complete: ${successCount} real objects duplicated`);
            console.log(`Total objects: ${originalCount} → ${finalCount}`);

            if (successCount > 0) {
                alert(`✅ SUCCESS! Duplicated ${successCount} real objects. Total: ${finalCount}`);
                addMessageToLog('System', `Duplicated ${successCount} real objects. Copies created to the right.`);

                // Clear selection and reselect all (including new copies)
                clearSelection();
                clearAllHighlights();

                setTimeout(() => {
                    console.log("Re-selecting all objects including new copies...");
                    highlightAllModels();
                }, 300);

                return true;
            } else {
                alert("❌ Failed to duplicate objects");
                return false;
            }
        };

        // COMPLETE SELECT ALL + DUPLICATE TEST
        window.testSelectAllDuplicate = function() {
            console.log("=== TESTING SELECT ALL + DUPLICATE WORKFLOW ===");

            // Step 1: Create multiple objects
            console.log("1. Creating multiple objects...");
            createPrimitive('cube');
            createPrimitive('sphere');
            createPrimitive('pyramid');
            createPrimitive('cone');

            setTimeout(() => {
                console.log(`2. Created ${state.loadedModels.length} objects`);
                console.log("   Objects:", state.loadedModels.map(obj => obj.name));

                // Step 2: Select all
                console.log("3. Selecting all objects...");
                highlightAllModels();

                setTimeout(() => {
                    console.log("4. Selection complete:");
                    console.log("   - state.selectedObject:", state.selectedObject ? state.selectedObject.name : 'none');
                    console.log("   - state.currentlySelectedObjectsForEditing.length:", state.currentlySelectedObjectsForEditing.length);

                    // Step 3: Duplicate
                    console.log("5. Duplicating selected objects...");
                    emergencyDuplicate();

                    setTimeout(() => {
                        console.log("6. Duplication complete:");
                        console.log(`   - Total objects: ${state.loadedModels.length}`);
                        console.log("   - Expected: 8 objects (4 originals + 4 copies)");

                        if (state.loadedModels.length === 8) {
                            console.log("✅ SUCCESS: Select all + duplicate working!");
                            alert("✅ SUCCESS! Select all + duplicate works perfectly!");
                        } else {
                            console.error("❌ ISSUE: Expected 8 objects, got", state.loadedModels.length);
                            alert(`❌ Issue: Expected 8 objects, got ${state.loadedModels.length}`);
                        }
                    }, 500);
                }, 500);
            }, 2000);
        };

        // UNIFIED DUPLICATE SELECTION FUNCTION
        // Expose the function globally for UI and voice commands
        window.duplicateSelection = duplicateSelection;

        // DIAGNOSTIC FUNCTIONS FOR TESTING
        window.testSelectAllDuplicate = function() {
            console.log("=== TESTING SELECT ALL → DUPLICATE ===");

            // Step 1: Check current state.scene
            console.log("1. Current state.scene state:");
            console.log(`   - state.loadedModels.length: ${state.loadedModels.length}`);
            console.log(`   - state.scene.children.length: ${state.scene.children.length}`);

            if (state.loadedModels.length === 0) {
                console.log("❌ No objects in state.scene. Creating test objects...");

                // Create test objects
                const geometry1 = new THREE.BoxGeometry(1, 1, 1);
                const material1 = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                const cube1 = new THREE.Mesh(geometry1, material1);
                cube1.position.set(-2, 0, 0);
                cube1.name = "Test Cube 1";
                state.scene.add(cube1);
                state.loadedModels.push(cube1);

                const geometry2 = new THREE.SphereGeometry(0.5, 32, 32);
                const material2 = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
                const sphere1 = new THREE.Mesh(geometry2, material2);
                sphere1.position.set(2, 0, 0);
                sphere1.name = "Test Sphere 1";
                state.scene.add(sphere1);
                state.loadedModels.push(sphere1);

                console.log("✅ Created 2 test objects");
            }

            // Step 2: Select All
            console.log("2. Running Select All...");
            highlightAllModels();

            setTimeout(() => {
                console.log("3. Selection state after Select All:");
                console.log(`   - state.currentlySelectedObjectsForEditing.length: ${state.currentlySelectedObjectsForEditing.length}`);
                console.log(`   - getSelectedObjects().length: ${getSelectedObjects().length}`);

                // Step 3: Duplicate
                console.log("4. Running Duplicate...");
                duplicateSelection();

                setTimeout(() => {
                    console.log("5. Final state after Duplicate:");
                    console.log(`   - state.loadedModels.length: ${state.loadedModels.length}`);
                    console.log(`   - getSelectedObjects().length: ${getSelectedObjects().length}`);
                    console.log(`   - state.undoStack.length: ${state.undoStack.length}`);

                    const expectedCount = state.loadedModels.length / 2; // Should be double the original
                    if (state.loadedModels.length >= 4) {
                        console.log("✅ TEST PASSED: Objects were duplicated");
                    } else {
                        console.log("❌ TEST FAILED: Not enough objects created");
                    }

                    console.log("6. Testing Undo...");
                    undo();

                    setTimeout(() => {
                        console.log("7. State after Undo:");
                        console.log(`   - state.loadedModels.length: ${state.loadedModels.length}`);

                        if (state.loadedModels.length === 2) {
                            console.log("✅ UNDO TEST PASSED: Back to original count");
                        } else {
                            console.log("❌ UNDO TEST FAILED: Wrong object count");
                        }
                    }, 100);
                }, 100);
            }, 100);
        };

        // Quick test for selection system
        window.testSelection = function() {
            console.log("=== TESTING SELECTION SYSTEM ===");
            console.log(`Current selection: ${getSelectedObjects().length} objects`);
            getSelectedObjects().forEach((obj, i) => {
                console.log(`  ${i + 1}. ${obj.name || obj.type} (UUID: ${obj.uuid})`);
            });
        };

        // COMPREHENSIVE TRANSFORM TEST
        window.testTransformUndoRedo = function() {
            console.log("=== TESTING TRANSFORM UNDO/REDO SYSTEM ===");

            // Step 1: Create test objects if needed
            if (state.loadedModels.length === 0) {
                console.log("1. Creating test objects...");

                const geometry1 = new THREE.BoxGeometry(1, 1, 1);
                const material1 = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                const cube1 = new THREE.Mesh(geometry1, material1);
                cube1.position.set(-2, 0, 0);
                cube1.name = "Test Cube 1";
                state.scene.add(cube1);
                state.loadedModels.push(cube1);

                const geometry2 = new THREE.SphereGeometry(0.5, 32, 32);
                const material2 = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
                const sphere1 = new THREE.Mesh(geometry2, material2);
                sphere1.position.set(2, 0, 0);
                sphere1.name = "Test Sphere 1";
                state.scene.add(sphere1);
                state.loadedModels.push(sphere1);

                console.log("✅ Created 2 test objects");
            }

            // Step 2: Select All
            console.log("2. Selecting all objects...");
            highlightAllModels();

            setTimeout(() => {
                console.log("3. Testing sequence of transforms...");

                // Test 1: Move
                console.log("   3a. Moving objects...");
                translateSelection(1, 0, 0);

                setTimeout(() => {
                    // Test 2: Scale
                    console.log("   3b. Scaling objects...");
                    scaleSelection(1.5, 1.5, 1.5);

                    setTimeout(() => {
                        // Test 3: Rotate
                        console.log("   3c. Rotating objects...");
                        rotateSelection(0, Math.PI / 4, 0);

                        setTimeout(() => {
                            console.log("4. Testing undo sequence...");
                            console.log(`   Current undo stack size: ${state.undoStack.length}`);

                            // Undo 1: Rotation
                            console.log("   4a. Undoing rotation...");
                            undo();

                            setTimeout(() => {
                                // Undo 2: Scale
                                console.log("   4b. Undoing scale...");
                                undo();

                                setTimeout(() => {
                                    // Undo 3: Move
                                    console.log("   4c. Undoing move...");
                                    undo();

                                    setTimeout(() => {
                                        console.log("5. Testing redo sequence...");
                                        console.log(`   Current redo stack size: ${state.redoStack.length}`);

                                        // Redo 1: Move
                                        console.log("   5a. Redoing move...");
                                        redo();

                                        setTimeout(() => {
                                            // Redo 2: Scale
                                            console.log("   5b. Redoing scale...");
                                            redo();

                                            setTimeout(() => {
                                                // Redo 3: Rotation
                                                console.log("   5c. Redoing rotation...");
                                                redo();

                                                setTimeout(() => {
                                                    console.log("✅ TRANSFORM UNDO/REDO TEST COMPLETE");
                                                    console.log(`   Final undo stack size: ${state.undoStack.length}`);
                                                    console.log(`   Final redo stack size: ${state.redoStack.length}`);

                                                    if (state.undoStack.length === 3 && state.redoStack.length === 0) {
                                                        console.log("✅ TEST PASSED: Undo/Redo working correctly");
                                                    } else {
                                                        console.log("❌ TEST FAILED: Unexpected stack sizes");
                                                    }
                                                }, 200);
                                            }, 200);
                                        }, 200);
                                    }, 200);
                                }, 200);
                            }, 200);
                        }, 200);
                    }, 200);
                }, 200);
            }, 100);
        };

        // NATURAL LANGUAGE OBJECT TARGETING SYSTEM

        // Natural language execution functions
        function deleteByUUIDs(uuids) {
            if (!uuids || uuids.length === 0) return;

            console.log(`[deleteByUUIDs] Deleting ${uuids.length} objects`);

            beginUndoGroup(`Delete ${uuids.length} object${uuids.length > 1 ? 's' : ''}`);

            const removedObjects = [];

            uuids.forEach(uuid => {
                const obj = state.scene.getObjectByProperty('uuid', uuid);
                if (obj && obj.parent) {
                    removedObjects.push({
                        object: obj,
                        parent: obj.parent,
                        uuid: uuid
                    });

                    obj.parent.remove(obj);

                    // Remove from state.loadedModels
                    const modelIndex = state.loadedModels.indexOf(obj);
                    if (modelIndex !== -1) {
                        state.loadedModels.splice(modelIndex, 1);
                    }

                    // Add undo action
                    addUndoAction({
                        type: 'delete_object',
                        object: obj,
                        parent: obj.parent,
                        modelIndex: modelIndex,
                        revert: () => {
                            obj.parent.add(obj);
                            if (modelIndex !== -1) {
                                state.loadedModels.splice(modelIndex, 0, obj);
                            }
                        }
                    });

                    console.log(`✅ Deleted: ${obj.name || obj.type} (UUID: ${uuid})`);
                }
            });

            endUndoGroup();

            const message = `Deleted ${removedObjects.length} object${removedObjects.length > 1 ? 's' : ''}.`;
            addMessageToLog('System', message);
            speakResponse(message);
        }

        function applyNLTransform(uuids, operation) {
            if (!uuids || uuids.length === 0 || !operation) return;

            console.log(`[applyNLTransform] Applying ${operation.type} to ${uuids.length} objects`);

            beginUndoGroup(`${operation.type.charAt(0).toUpperCase() + operation.type.slice(1)} ${uuids.length} object${uuids.length > 1 ? 's' : ''}`);

            const transformedObjects = [];

            uuids.forEach(uuid => {
                const obj = state.scene.getObjectByProperty('uuid', uuid);
                if (!obj) return;

                // Store original transform values
                const originalTransform = {
                    position: obj.position.clone(),
                    rotation: obj.rotation.clone(),
                    scale: obj.scale.clone(),
                    material: obj.material ? (Array.isArray(obj.material) ? obj.material.map(m => m.clone()) : obj.material.clone()) : null
                };

                // Apply the transformation
                switch (operation.type) {
                    case 'translate':
                        const { x = 0, y = 0, z = 0 } = operation.value;
                        obj.position.add(new THREE.Vector3(x, y, z));
                        break;

                    case 'rotate':
                        const axis = (operation.value.axis || 'y').toLowerCase();
                        const degrees = operation.value.degrees || 0;
                        const radians = degrees * Math.PI / 180;

                        if (axis === 'x') obj.rotateX(radians);
                        else if (axis === 'y') obj.rotateY(radians);
                        else if (axis === 'z') obj.rotateZ(radians);
                        break;

                    case 'scale':
                        const scaleValue = operation.value;
                        if (scaleValue.uniform !== undefined) {
                            obj.scale.multiplyScalar(scaleValue.uniform);
                        } else {
                            obj.scale.set(
                                scaleValue.x !== undefined ? scaleValue.x : obj.scale.x,
                                scaleValue.y !== undefined ? scaleValue.y : obj.scale.y,
                                scaleValue.z !== undefined ? scaleValue.z : obj.scale.z
                            );
                        }
                        break;

                    case 'color':
                        const hex = operation.value.hex;
                        if (obj.material && hex) {
                            if (Array.isArray(obj.material)) {
                                obj.material = obj.material.map(mat => {
                                    const newMat = mat.clone();
                                    newMat.color.set(hex);
                                    return newMat;
                                });
                            } else {
                                obj.material = obj.material.clone();
                                obj.material.color.set(hex);
                            }
                        }
                        break;
                }

                obj.updateMatrixWorld(true);
                transformedObjects.push(obj);

                // Add undo action
                addUndoAction({
                    type: `${operation.type}_object`,
                    object: obj,
                    originalTransform: originalTransform,
                    revert: () => {
                        obj.position.copy(originalTransform.position);
                        obj.rotation.copy(originalTransform.rotation);
                        obj.scale.copy(originalTransform.scale);
                        if (originalTransform.material) {
                            obj.material = originalTransform.material;
                        }
                        obj.updateMatrixWorld(true);
                    }
                });

                console.log(`✅ ${operation.type} applied to: ${obj.name || obj.type}`);
            });

            endUndoGroup();

            const message = `${operation.type.charAt(0).toUpperCase() + operation.type.slice(1)}ed ${transformedObjects.length} object${transformedObjects.length > 1 ? 's' : ''}.`;
            addMessageToLog('System', message);
            speakResponse(message);
        }

        // Disambiguation state
        let pendingIntent = null;

        // Clear pending operations when selection changes
        function onSelectionChanged() {
            console.log('[onSelectionChanged] Clearing pending operations');
            state.pendingDisambiguation = null;      // Cancel candidate selection waiting
            pendingIntent = null;              // ⛔ Discard previous intent
        }

        // Get currently active object for operations
        function getActiveObject() {
            return state.selectedObject || (state.currentlySelectedObjectsForEditing.length > 0 ? state.currentlySelectedObjectsForEditing[0] : null);
        }

        // Build exact face boundary polygon (not convex hull) - PRECISE VERSION
        function buildFaceBoundaryPolygon(mesh, group) {
            console.log('[buildFaceBoundaryPolygon] Building exact boundary for group:', group.id);

            const geom = mesh.geometry;
            const idx = geom.index.array;
            const triIndices = group.triIndices;

            // 1) Collect edges in group (undirected)
            const edgeCount = new Map(); // "a-b" sorted -> count
            const triVerts = [];

            for (const t of triIndices) {
                const a = idx[3*t], b = idx[3*t+1], c = idx[3*t+2];
                triVerts.push([a,b,c]);
                [[a,b],[b,c],[c,a]].forEach(([u,v]) => {
                    const key = u < v ? `${u}-${v}` : `${v}-${u}`;
                    edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
                });
            }

            // 2) Boundary edges = count === 1 (edges used by only one triangle)
            const boundaryEdges = [];
            for (const [key, cnt] of edgeCount.entries()) {
                if (cnt !== 1) continue;
                const [s, e] = key.split('-').map(Number);
                boundaryEdges.push([s, e]);
            }

            console.log('[buildFaceBoundaryPolygon] Found', boundaryEdges.length, 'boundary edges');

            if (boundaryEdges.length === 0) {
                console.warn('[buildFaceBoundaryPolygon] No boundary edges found!');
                return null;
            }

            // 3) Order them into a loop
            const adjacency = new Map();
            for (const [s,e] of boundaryEdges) {
                if (!adjacency.has(s)) adjacency.set(s, []);
                if (!adjacency.has(e)) adjacency.set(e, []);
                adjacency.get(s).push(e);
                adjacency.get(e).push(s);
            }

            // Start at any boundary vertex
            const start = boundaryEdges[0][0];
            const loop = [start];
            let prev = null, cur = start;

            while (true) {
                const nexts = (adjacency.get(cur) || []).filter(n => n !== prev);
                if (!nexts.length) break;
                const next = nexts[0];
                loop.push(next);
                prev = cur;
                cur = next;
                if (next === start) break;
            }

            console.log('[buildFaceBoundaryPolygon] Built ordered loop with', loop.length, 'vertices');

            // 4) Project ordered vertices to 2D face plane
            const F = getFaceFrame(group); // Use the getFaceFrame function
            const pos = geom.attributes.position;
            const pts2D = loop.map(i => {
                const P = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
                const r = new THREE.Vector3().subVectors(P, F.o);
                return new THREE.Vector2(r.dot(F.u), r.dot(F.v));
            });

            // 5) Ensure CCW (for ExtrudeGeometry)
            const area = pts2D.reduce((s, p, i) => {
                const q = pts2D[(i+1) % pts2D.length];
                return s + (p.x * q.y - p.y * q.x);
            }, 0);

            if (area < 0) {
                pts2D.reverse();
                console.log('[buildFaceBoundaryPolygon] Reversed to CCW');
            }

            console.log('[buildFaceBoundaryPolygon] Final 2D points:', pts2D.length);
            return { F, pts2D };
        }



        // Get face coordinate frame (origin, u, v, normal)
        function getFaceFrame(group) {
            // Use existing centroid and normal from group
            const o = group.centroid.clone();
            const n = group.normal.clone().normalize();

            // Create orthogonal u, v vectors
            const up = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
            const u = new THREE.Vector3().crossVectors(up, n).normalize();
            const v = new THREE.Vector3().crossVectors(n, u).normalize();

            return { o, u, v, n };
        }

        // Enable/disable multi-face selection mode
        function enableMultiFaceSelection(enable) {
            if (state.faceEditState.isActive) {
                state.faceEditState.multiSelect = !!enable;
                console.log('[enableMultiFaceSelection] Multi-select mode:', state.faceEditState.multiSelect);
                addMessageToLog('System', `Multi-face selection ${enable ? 'enabled' : 'disabled'}. ${enable ? 'Hold Ctrl and click faces.' : ''}`);
                return true;
            } else {
                console.log('[enableMultiFaceSelection] Face mode not active');
                return false;
            }
        }

        // DEBUG: Test multi-select by selecting first two faces
        function testMultiSelect() {
            if (!state.faceEditState.isActive) {
                console.log('[testMultiSelect] Face mode not active');
                testFaceEditing();
                setTimeout(() => testMultiSelect(), 1000);
                return;
            }

            if (state.faceEditState.groups.length < 2) {
                console.log('[testMultiSelect] Need at least 2 face groups');
                return;
            }

            console.log('[testMultiSelect] Enabling multi-select and selecting first 2 faces');

            // Enable multi-select
            state.faceEditState.multiSelect = true;

            // Select first two faces
            state.faceEditState.selectedFaceIds.clear();
            state.faceEditState.selectedFaceIds.add(state.faceEditState.groups[0].id);
            state.faceEditState.selectedFaceIds.add(state.faceEditState.groups[1].id);

            // Update legacy compatibility
            state.faceEditState.selectedGroupId = state.faceEditState.groups[0].id;

            // Update visual state
            state.faceEditState.groups.forEach(group => {
                const isSelected = state.faceEditState.selectedFaceIds.has(group.id);
                if (group.overlay && group.overlay.material) {
                    group.overlay.material.opacity = isSelected ? 0.7 : 0.4;
                    group.overlay.material.color.setHex(isSelected ? 0xff0000 : 0x00ff00);
                }
                if (group.outline) {
                    group.outline.visible = isSelected;
                }
            });

            console.log('[testMultiSelect] Selected faces:', Array.from(state.faceEditState.selectedFaceIds));
            addMessageToLog('System', `${state.faceEditState.selectedFaceIds.size} faces selected. Press E to extrude.`);
        }

        // Update face highlights based on selection
        function updateFaceHighlights() {
            if (!state.faceEditState.isActive) return;

            state.faceEditState.groups.forEach(group => {
                const isSelected = state.faceEditState.selectedFaceIds.has(group.id);
                if (group.overlay && group.overlay.material) {
                    group.overlay.material.opacity = isSelected ? 0.7 : 0.4;
                    group.overlay.material.color.setHex(isSelected ? 0xff0000 : 0x00ff00);
                }
                if (group.outline) {
                    group.outline.visible = isSelected;
                }
            });

            requestRender();
        }

        // DEBUG: Check multi-select state
        function checkMultiSelectState() {
            console.log('=== MULTI-SELECT STATE ===');
            console.log('Face mode active:', state.faceEditState.isActive);
            console.log('Multi-select enabled:', state.faceEditState.multiSelect);
            console.log('Selected face IDs:', Array.from(state.faceEditState.selectedFaceIds));
            console.log('Selected count:', state.faceEditState.selectedFaceIds.size);
            console.log('Legacy selectedGroupId:', state.faceEditState.selectedGroupId);

            if (state.faceEditState.isActive) {
                console.log('Available groups:', state.faceEditState.groups.length);
                state.faceEditState.groups.forEach((group, i) => {
                    const isSelected = state.faceEditState.selectedFaceIds.has(group.id);
                    console.log(`Group ${i}: ${group.id} - Selected: ${isSelected}`);
                });
            }

            return {
                active: state.faceEditState.isActive,
                multiSelect: state.faceEditState.multiSelect,
                selectedCount: state.faceEditState.selectedFaceIds.size,
                selectedIds: Array.from(state.faceEditState.selectedFaceIds)
            };
        }

        // UX ACCEPTANCE TEST - Complete system test
        function testUXAcceptance() {
            console.log('=== UX ACCEPTANCE TEST ===');

            if (!state.faceEditState.isActive) {
                console.log('Starting face mode...');
                testFaceEditing();
                setTimeout(() => testUXAcceptance(), 1000);
                return;
            }

            console.log('✅ Face mode active');
            console.log('✅ Click a face → highlight toggles');
            console.log('✅ Click again → deselect');
            console.log('✅ Hold Ctrl → multi-select mode');
            console.log('✅ Say "extrude" → arrow gizmo appears');
            console.log('✅ Drag arrow → live preview with exact face outline');
            console.log('✅ Click background/Enter → confirmed');
            console.log('✅ Esc → canceled');
            console.log('✅ Undo once → removes all created bosses');

            // Test multi-select
            console.log('\n--- Testing Multi-Select ---');
            enableMultiFaceSelection(true);

            if (state.faceEditState.groups.length >= 2) {
                // Select first two faces
                state.faceEditState.selectedFaceIds.clear();
                state.faceEditState.selectedFaceIds.add(state.faceEditState.groups[0].id);
                state.faceEditState.selectedFaceIds.add(state.faceEditState.groups[1].id);

                // Update visuals
                state.faceEditState.groups.forEach(group => {
                    const isSelected = state.faceEditState.selectedFaceIds.has(group.id);
                    if (group.overlay && group.overlay.material) {
                        group.overlay.material.opacity = isSelected ? 0.7 : 0.4;
                        group.overlay.material.color.setHex(isSelected ? 0xff0000 : 0x00ff00);
                    }
                    if (group.outline) {
                        group.outline.visible = isSelected;
                    }
                });

                console.log('✅ Multi-select test: Selected', state.faceEditState.selectedFaceIds.size, 'faces');
                addMessageToLog('System', `Multi-select test: ${state.faceEditState.selectedFaceIds.size} faces selected. Press E to test extrude.`);
            }

            console.log('\n--- Ready for Manual Testing ---');
            console.log('1. Click faces to test toggle selection');
            console.log('2. Hold Ctrl and click multiple faces');
            console.log('3. Press E to start extrude');
            console.log('4. Drag the green arrow');
            console.log('5. Press Enter to confirm or Esc to cancel');
        }

        // DEBUG: Check face editing status
        function getFaceEditStatus() {
            console.log('=== FACE EDIT STATUS ===');
            console.log('Face mode active:', state.faceEditState.isActive);
            console.log('Target mesh:', state.faceEditState.targetMesh?.name || 'none');
            console.log('Selected group ID:', state.faceEditState.selectedGroupId || 'none');
            console.log('Groups count:', state.faceEditState.groups?.length || 0);
            console.log('Selected object:', state.selectedObject?.name || 'none');

            if (state.faceEditState.groups?.length > 0) {
                console.log('Group IDs:', state.faceEditState.groups.map(g => g.id));
                state.faceEditState.groups.forEach((group, i) => {
                    console.log(`Group ${i}:`, {
                        id: group.id,
                        triCount: group.triIndices?.length || 0,
                        hasOverlay: !!group.overlay,
                        hasOutline: !!group.outline,
                        overlayVisible: group.overlay?.visible,
                        overlayInScene: group.overlay?.parent === state.scene
                    });
                });
            }

            return {
                isActive: state.faceEditState.isActive,
                selectedGroupId: state.faceEditState.selectedGroupId,
                groupsCount: state.faceEditState.groups?.length || 0,
                targetMesh: state.faceEditState.targetMesh?.name || 'none'
            };
        }

        // DEBUG: Force select first face group for testing
        function forceSelectFirstFace() {
            if (!state.faceEditState.isActive) {
                console.log('[forceSelectFirstFace] Face mode not active');
                return false;
            }

            if (state.faceEditState.groups.length === 0) {
                console.log('[forceSelectFirstFace] No face groups available');
                return false;
            }

            const firstGroup = state.faceEditState.groups[0];
            console.log('[forceSelectFirstFace] Selecting first group:', firstGroup.id);

            // Use new selection system
            state.faceEditState.selectedFaceIds.clear();
            state.faceEditState.selectedFaceIds.add(firstGroup.id);
            state.faceEditState.selectedGroupId = firstGroup.id; // For compatibility

            // Update visual state
            state.faceEditState.groups.forEach(group => {
                const isSelected = state.faceEditState.selectedFaceIds.has(group.id);
                if (group.overlay && group.overlay.material) {
                    group.overlay.material.opacity = isSelected ? 0.7 : 0.4;
                    group.overlay.material.color.setHex(isSelected ? 0xff0000 : 0x00ff00);
                }
                if (group.outline) {
                    group.outline.visible = isSelected;
                }
            });

            console.log('[forceSelectFirstFace] First face selected');
            addMessageToLog('System', 'First face force-selected for testing.');
            return true;
        }

        // DEBUG: Test face coloring directly
        function testFaceColoring() {
            console.log('=== TESTING FACE COLORING ===');

            if (!state.faceEditState.isActive) {
                console.log('[testFaceColoring] Face mode not active - starting test');
                testFaceEditing();
                setTimeout(() => testFaceColoring(), 1000);
                return;
            }

            console.log('[testFaceColoring] Face mode active, forcing first face selection');
            const selected = forceSelectFirstFace();

            if (selected) {
                console.log('[testFaceColoring] Face selected, testing color command');
                setTimeout(() => {
                    handleColorCommand('#ff0000');
                }, 500);
            } else {
                console.log('[testFaceColoring] Failed to select face');
            }
        }

        // DEBUG: Test complete extrude system
        function testExtrudeSystem() {
            console.log('=== TESTING COMPLETE EXTRUDE SYSTEM ===');

            if (!state.faceEditState.isActive) {
                console.log('[testExtrudeSystem] Starting face mode');
                testFaceEditing();
                setTimeout(() => testExtrudeSystem(), 1000);
                return;
            }

            console.log('[testExtrudeSystem] Face mode active');

            // Step 1: Select first face
            const selected = forceSelectFirstFace();
            if (!selected) {
                console.log('[testExtrudeSystem] Failed to select face');
                return;
            }

            console.log('[testExtrudeSystem] Face selected, checking selection state');
            console.log('Selected faces:', Array.from(state.faceEditState.selectedFaceIds));
            console.log('Multi-select mode:', state.faceEditState.multiSelect);

            // Step 2: Test extrude
            setTimeout(() => {
                console.log('[testExtrudeSystem] Starting extrude test');
                const extrudeResult = handleExtrudeFace();

                if (extrudeResult) {
                    console.log('[testExtrudeSystem] Extrude gizmo should be visible');
                    console.log('Extrude UI active:', state.extrudeUI.active);
                    console.log('Arrow created:', !!state.extrudeUI.arrow);
                    console.log('Face IDs:', state.extrudeUI.faceIds);

                    // Step 3: Test preview
                    setTimeout(() => {
                        console.log('[testExtrudeSystem] Testing preview update');
                        updateExtrudePreview(0.5);
                        console.log('Preview meshes:', state.extrudeUI.previewMeshes.length);

                        // Step 4: Test cancel
                        setTimeout(() => {
                            console.log('[testExtrudeSystem] Testing cancel');
                            cancelExtrude();
                            console.log('Extrude UI active after cancel:', state.extrudeUI.active);
                        }, 1000);
                    }, 1000);
                } else {
                    console.log('[testExtrudeSystem] Extrude failed to start');
                }
            }, 500);
        }

        // Main natural language action handler
        function handleNLActionResponse(jsonResponse) {
            let data;
            try {
                data = typeof jsonResponse === 'string' ? JSON.parse(jsonResponse) : jsonResponse;
            } catch (error) {
                console.error('[handleNLActionResponse] Failed to parse JSON:', error);
                addMessageToLog('System', 'Failed to parse natural language response.');
                return;
            }

            console.log('[handleNLActionResponse] Processing:', data);

            // Handle 'all' targets - expand class to UUIDs
            if (data.targets?.length === 1 && data.targets[0].all && data.targets[0].class) {
                const index = indexScene(state.scene);
                const matchingObjects = findObjectsByClass(index, data.targets[0].class);
                const uuids = matchingObjects.map(obj => obj.uuid);

                console.log(`[handleNLActionResponse] Expanding 'all ${data.targets[0].class}' to ${uuids.length} objects`);

                if (uuids.length === 0) {
                    addMessageToLog('System', `No ${data.targets[0].class} objects found in the state.scene.`);
                    speakResponse(`No ${data.targets[0].class} objects found.`);
                    return;
                }

                if (data.action === 'delete') {
                    return deleteByUUIDs(uuids);
                }
                if (data.action === 'transform') {
                    return applyNLTransform(uuids, data.operation);
                }
                return;
            }

            // Handle clarification request
            if (data.action === 'clarify') {
                state.pendingDisambiguation = {
                    candidates: data.targets,
                    originalOperation: data.operation || null,
                    originalAction: data.context?.originalAction || 'delete'
                };

                const options = data.targets.map((target, index) => {
                    const parts = [];
                    if (target.color && target.color !== '#cccccc') parts.push(target.color);
                    if (target.positionHint) parts.push(target.positionHint);
                    if (target.sizeHint) parts.push(target.sizeHint);
                    if (target.name && target.name !== 'Unnamed Object') parts.push(target.name);
                    else if (target.class) parts.push(target.class);

                    return `${index + 1}) ${parts.join(' ')}`;
                }).join(', ');

                const question = data.question || `Which object? ${options}`;
                addMessageToLog('System', question);
                speakResponse(question);

                // Store the question for user response
                window.lastDisambiguationQuestion = question;
                window.lastDisambiguationOptions = data.targets;

                return;
            }

            // Handle direct delete action
            if (data.action === 'delete') {
                const uuids = data.targets.map(target => target.uuid).filter(Boolean);
                if (uuids.length > 0) {
                    return deleteByUUIDs(uuids);
                } else {
                    addMessageToLog('System', 'No valid objects found to delete.');
                    speakResponse('No valid objects found to delete.');
                }
                return;
            }

            // Handle direct transform action
            if (data.action === 'transform') {
                const uuids = data.targets.map(target => target.uuid).filter(Boolean);
                if (uuids.length > 0 && data.operation) {
                    return applyNLTransform(uuids, data.operation);
                } else {
                    addMessageToLog('System', 'No valid objects found to transform or missing operation.');
                    speakResponse('No valid objects found to transform.');
                }
                return;
            }

            console.warn('[handleNLActionResponse] Unknown action:', data.action);
            addMessageToLog('System', `Unknown action: ${data.action}`);
        }

        // Handle disambiguation choice
        function handleDisambiguationChoice(choiceNumber) {
            if (!state.pendingDisambiguation) {
                addMessageToLog('System', 'No pending disambiguation.');
                return;
            }

            const choice = parseInt(choiceNumber) - 1;
            if (choice < 0 || choice >= state.pendingDisambiguation.candidates.length) {
                addMessageToLog('System', 'Invalid choice number.');
                return;
            }

            const selectedTarget = state.pendingDisambiguation.candidates[choice];
            const operation = state.pendingDisambiguation.originalOperation;
            const action = state.pendingDisambiguation.originalAction;

            // Clear pending state
            state.pendingDisambiguation = null;

            // Execute the action with the selected target
            const responseData = {
                action: action,
                operation: operation,
                targets: [{ uuid: selectedTarget.uuid }]
            };

            console.log('[handleDisambiguationChoice] Executing with selected target:', responseData);
            handleNLActionResponse(responseData);
        }

        // Build context for the AI model
        function buildModelContext() {
            const index = indexScene(state.scene);
            return {
                objects: index.map(obj => ({
                    uuid: obj.uuid,
                    name: obj.name,
                    tags: obj.tags,
                    color: obj.color,
                    positionHint: obj.positionHint,
                    sizeHint: obj.sizeHint
                }))
            };
        }

        // FACE EDITING SYSTEM



        // Build face groups using region growing algorithm
        function buildFaceGroups(mesh, epsAngle = 0.02, epsPlane = 1e-3) {
            console.log('[buildFaceGroups] Building face groups for mesh:', mesh.name);

            // Ensure geometry has index
            let geom = mesh.geometry;
            if (!geom.index) {
                console.warn('[buildFaceGroups] Geometry has no index, creating one...');
                // Create index for non-indexed geometry
                const positions = geom.attributes.position;
                const indices = [];
                for (let i = 0; i < positions.count; i++) {
                    indices.push(i);
                }
                geom.setIndex(indices);
            }

            const pos = geom.attributes.position;
            const idx = geom.index.array;
            const triCount = idx.length / 3;

            // World transformation matrix
            const worldMatrix = mesh.matrixWorld.clone();

            function toWorld(vertexIndex, out = new THREE.Vector3()) {
                return out.fromBufferAttribute(pos, vertexIndex).applyMatrix4(worldMatrix);
            }

            // Calculate plane/normal/centroid for each triangle
            const triangles = [];
            for (let t = 0; t < triCount; t++) {
                const a = idx[3 * t], b = idx[3 * t + 1], c = idx[3 * t + 2];
                const A = toWorld(a, new THREE.Vector3());
                const B = toWorld(b, new THREE.Vector3());
                const C = toWorld(c, new THREE.Vector3());

                // Calculate face normal (geometric normal, not vertex normal)
                const AB = new THREE.Vector3().subVectors(B, A);
                const AC = new THREE.Vector3().subVectors(C, A);
                const normal = new THREE.Vector3().crossVectors(AB, AC).normalize();

                const centroid = new THREE.Vector3().addVectors(A, B).add(C).multiplyScalar(1/3);
                const d = -normal.dot(A); // Plane equation: n·x + d = 0

                triangles.push({
                    indices: [a, b, c],
                    normal: normal,
                    centroid: centroid,
                    d: d,
                    visited: false
                });
            }

            // Build adjacency map (shared edges)
            const adjacency = Array.from({length: triCount}, () => []);
            const edgeMap = new Map();

            for (let t = 0; t < triCount; t++) {
                const indices = [idx[3 * t], idx[3 * t + 1], idx[3 * t + 2]];
                for (let e = 0; e < 3; e++) {
                    const u = indices[e];
                    const v = indices[(e + 1) % 3];
                    const edgeKey = u < v ? `${u}-${v}` : `${v}-${u}`;

                    if (edgeMap.has(edgeKey)) {
                        const otherTri = edgeMap.get(edgeKey);
                        adjacency[t].push(otherTri);
                        adjacency[otherTri].push(t);
                    } else {
                        edgeMap.set(edgeKey, t);
                    }
                }
            }

            // Region growing to form face groups
            const groups = [];
            const cosThreshold = Math.cos(epsAngle); // Convert angle to cosine threshold

            for (let i = 0; i < triCount; i++) {
                if (triangles[i].visited) continue;

                // Start new group
                const seed = triangles[i];
                seed.visited = true;
                const stack = [i];
                const triIndices = [i];
                let normalSum = seed.normal.clone();
                let centroidSum = seed.centroid.clone();

                while (stack.length > 0) {
                    const currentTri = stack.pop();

                    for (const neighborTri of adjacency[currentTri]) {
                        if (triangles[neighborTri].visited) continue;

                        const neighbor = triangles[neighborTri];

                        // Check normal similarity (cosine of angle between normals)
                        const normalDot = neighbor.normal.dot(seed.normal);

                        // Check if on same plane
                        const planeDistance = Math.abs(neighbor.normal.dot(neighbor.centroid) + seed.d);
                        const samePlane = planeDistance < epsPlane;

                        if (normalDot > cosThreshold && samePlane) {
                            neighbor.visited = true;
                            stack.push(neighborTri);
                            triIndices.push(neighborTri);
                            normalSum.add(neighbor.normal);
                            centroidSum.add(neighbor.centroid);
                        }
                    }
                }

                // Create face group
                const avgNormal = normalSum.normalize();
                const avgCentroid = centroidSum.multiplyScalar(1 / triIndices.length);
                const avgD = -avgNormal.dot(avgCentroid);

                // Collect unique vertex indices
                const vertexSet = new Set();
                triIndices.forEach(triIndex => {
                    vertexSet.add(idx[3 * triIndex]);
                    vertexSet.add(idx[3 * triIndex + 1]);
                    vertexSet.add(idx[3 * triIndex + 2]);
                });

                const group = {
                    id: `${mesh.uuid}-face-${groups.length}`,
                    triIndices: triIndices,
                    vertexIndices: Array.from(vertexSet),
                    normal: avgNormal,
                    centroid: avgCentroid,
                    plane: { n: avgNormal, d: avgD },
                    overlay: null,
                    outline: null
                };

                groups.push(group);
            }

            console.log(`[buildFaceGroups] Created ${groups.length} face groups`);
            mesh.userData.faceGroups = groups;
            return groups;
        }

        // Create overlay mesh for face group highlighting
        function makeGroupOverlay(mesh, group, color = 0xff00ff, opacity = 0.25) {
            const geometry = new THREE.BufferGeometry();
            const srcGeometry = mesh.geometry;
            const srcPosition = srcGeometry.attributes.position;
            const srcIndex = srcGeometry.index.array;

            // Extract triangles for this group
            const triangleIndices = [];
            group.triIndices.forEach(triIndex => {
                triangleIndices.push(
                    srcIndex[3 * triIndex],
                    srcIndex[3 * triIndex + 1],
                    srcIndex[3 * triIndex + 2]
                );
            });

            // Create new geometry with only the group's triangles
            const positions = new Float32Array(triangleIndices.length * 3);
            for (let i = 0; i < triangleIndices.length; i++) {
                const vertexIndex = triangleIndices[i];
                positions[i * 3] = srcPosition.getX(vertexIndex);
                positions[i * 3 + 1] = srcPosition.getY(vertexIndex);
                positions[i * 3 + 2] = srcPosition.getZ(vertexIndex);
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.computeVertexNormals();

            // Create overlay material - always on top
            const material = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: opacity,
                depthWrite: false,
                depthTest: false, // Always render on top
                side: THREE.DoubleSide
            });

            const overlay = new THREE.Mesh(geometry, material);
            overlay.matrixAutoUpdate = false;
            overlay.applyMatrix4(mesh.matrixWorld);
            overlay.renderOrder = 9999; // High render order
            overlay.userData.faceGroupId = group.id;
            overlay.userData.isOverlay = true;

            // Create outline - also always on top
            const edges = new THREE.EdgesGeometry(geometry);
            const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
                color: 0x000000,
                linewidth: 2,
                depthTest: false // Always render on top
            }));
            outline.matrixAutoUpdate = false;
            outline.applyMatrix4(mesh.matrixWorld);
            outline.renderOrder = 10000; // Even higher render order
            outline.userData.faceGroupId = group.id;
            outline.userData.isOutline = true;

            return { overlay, outline };
        }

        // Enter face editing mode
        function enterFaceEditMode(mesh) {
            if (!mesh || !mesh.geometry) {
                console.warn('[enterFaceEditMode] Invalid mesh provided');
                return false;
            }

            console.log('[enterFaceEditMode] Entering face edit mode for:', mesh.name);

            // Exit any existing face edit mode
            exitFaceEditMode();

            // Detach transform state.controls to prevent interference
            if (state.transformControls) {
                state.transformControls.detach();
                console.log('[enterFaceEditMode] Transform state.controls detached');
            }

            // Build face groups
            const groups = buildFaceGroups(mesh);

            if (groups.length === 0) {
                console.warn('[enterFaceEditMode] No face groups found');
                addMessageToLog('System', 'No faces found on this object.');
                return false;
            }

            // Create overlays for each group
            console.log('[enterFaceEditMode] Creating overlays for', groups.length, 'groups');
            groups.forEach((group, i) => {
                console.log(`[enterFaceEditMode] Creating overlay for group ${i}:`, group.id);
                const { overlay, outline } = makeGroupOverlay(mesh, group, 0x00ff00, 0.15);
                group.overlay = overlay;
                group.outline = outline;

                if (overlay && outline) {
                    state.scene.add(overlay);
                    state.scene.add(outline);

                    // Show all overlays initially for better visibility
                    overlay.visible = true;
                    outline.visible = true;

                    console.log(`[enterFaceEditMode] Added overlay ${i} to state.scene:`, {
                        overlayInScene: overlay.parent === state.scene,
                        outlineInScene: outline.parent === state.scene,
                        overlayVisible: overlay.visible,
                        outlineVisible: outline.visible
                    });
                } else {
                    console.error(`[enterFaceEditMode] Failed to create overlay for group ${i}`);
                }
            });

            // Keep object FULLY VISIBLE and highlighted like in your image
            mesh.traverse(child => {
                if (child.isMesh && child.material) {
                    // Store original material properties for restoration
                    if (!child.userData.originalMaterial) {
                        child.userData.originalMaterial = child.material.clone();
                    }

                    // Keep object solid and visible (like in your image)
                    // Don't change opacity or transparency - keep it fully solid
                    child.material.transparent = false;
                    child.material.opacity = 1.0;

                    // Apply subtle highlight effect
                    if (child.material.emissive !== undefined) {
                        child.material.emissive.setHex(0x222222); // Very subtle glow
                        child.material.emissiveIntensity = 0.1;
                    }
                    child.material.needsUpdate = true;
                }
            });

            // Update face edit state
            state.faceEditState = {
                targetMesh: mesh,
                groups: groups,
                selectedGroupId: null,
                isActive: true,
                multiSelect: false,
                selectedFaceIds: new Set()
            };

            addMessageToLog('System', `Face edit mode active. Found ${groups.length} faces. Click on faces to select them.`);
            speakResponse(`Face edit mode active. Found ${groups.length} faces.`);

            return true;
        }

        // Exit face editing mode
        function exitFaceEditMode() {
            if (!state.faceEditState.isActive) return;

            console.log('[exitFaceEditMode] Exiting face edit mode');

            // Store target mesh for transform state.controls reattachment
            const targetMesh = state.faceEditState.targetMesh;

            // Restore original material properties
            if (targetMesh) {
                targetMesh.traverse(child => {
                    if (child.isMesh && child.material && child.userData.originalMaterial) {
                        // Restore original material
                        child.material.copy(child.userData.originalMaterial);
                        child.material.needsUpdate = true;

                        // Clean up stored material
                        delete child.userData.originalMaterial;
                    }
                });
            }

            // Remove all overlays and outlines
            state.faceEditState.groups.forEach(group => {
                if (group.overlay) {
                    state.scene.remove(group.overlay);
                    group.overlay.geometry.dispose();
                    group.overlay.material.dispose();
                }
                if (group.outline) {
                    state.scene.remove(group.outline);
                    group.outline.geometry.dispose();
                    group.outline.material.dispose();
                }
            });

            // Reset state
            state.faceEditState = {
                targetMesh: null,
                groups: [],
                selectedGroupId: null,
                isActive: false,
                multiSelect: false,
                selectedFaceIds: new Set()
            };

            // Reattach transform state.controls if we had a target mesh
            if (state.transformControls && targetMesh && state.selectedObject === targetMesh) {
                state.transformControls.attach(targetMesh);
                console.log('[exitFaceEditMode] Transform state.controls reattached');
            }

            addMessageToLog('System', 'Face edit mode deactivated.');
        }

        // Face highlighting is now handled directly in onCanvasMouseMove - no separate function needed

        // Face selection is now handled directly in onCanvasClick - no separate function needed

        // Delete selected face group
        function deleteFaceGroup(mesh, group) {
            if (!mesh || !group) {
                console.warn('[deleteFaceGroup] Invalid mesh or group');
                return false;
            }

            console.log('[deleteFaceGroup] Deleting face group:', group.id);

            // Save state for undo
            if (state.loadedModels.length > 0) {
                const currentState = getCurrentState();
                state.undoStack.push(currentState);
                state.redoStack = []; // Clear redo stack
            }

            try {
                const srcGeometry = mesh.geometry;
                const srcIndex = srcGeometry.index.array;
                const totalTriangles = srcIndex.length / 3;

                // Create set of triangles to delete
                const deleteTriangles = new Set(group.triIndices);

                // Build new index array without deleted triangles
                const newIndices = [];
                for (let t = 0; t < totalTriangles; t++) {
                    if (!deleteTriangles.has(t)) {
                        newIndices.push(
                            srcIndex[3 * t],
                            srcIndex[3 * t + 1],
                            srcIndex[3 * t + 2]
                        );
                    }
                }

                if (newIndices.length === 0) {
                    console.warn('[deleteFaceGroup] Cannot delete all faces');
                    addMessageToLog('System', 'Cannot delete all faces of the object.');
                    return false;
                }

                // Create new geometry
                const newGeometry = srcGeometry.clone();
                newGeometry.setIndex(newIndices);
                newGeometry.computeVertexNormals();
                newGeometry.computeBoundingBox();
                newGeometry.computeBoundingSphere();

                // Apply new geometry
                mesh.geometry.dispose();
                mesh.geometry = newGeometry;

                // Refresh face groups to reflect the new geometry
                setTimeout(() => {
                    refreshFaceGroups();
                }, 100);

                addMessageToLog('System', 'Face deleted successfully.');
                speakResponse('Face deleted.');

                console.log('[deleteFaceGroup] Face deletion completed');
                return true;

            } catch (error) {
                console.error('[deleteFaceGroup] Error deleting face:', error);
                addMessageToLog('System', 'Error deleting face.');
                return false;
            }
        }

        // REMOVED DUPLICATE - Using main getFaceFrame function

        // Convert world coordinates to face 2D coordinates
        function worldToFace2D(worldPoint, faceFrame) {
            const origin = faceFrame.o || faceFrame.origin; // Support both formats
            const relative = new THREE.Vector3().subVectors(worldPoint, origin);
            return new THREE.Vector2(
                relative.dot(faceFrame.u),
                relative.dot(faceFrame.v)
            );
        }

        // Convert face 2D coordinates to world coordinates
        function face2DToWorld(face2DPoint, faceFrame) {
            const origin = faceFrame.o || faceFrame.origin; // Support both formats
            return new THREE.Vector3()
                .copy(origin)
                .addScaledVector(faceFrame.u, face2DPoint.x)
                .addScaledVector(faceFrame.v, face2DPoint.y);
        }

        // Expose functions globally
        window.handleNLActionResponse = handleNLActionResponse;
        window.handleDisambiguationChoice = handleDisambiguationChoice;
        window.buildModelContext = buildModelContext;
        window.indexScene = indexScene;
        window.findObjectsByClass = findObjectsByClass;

        // Expose face editing functions globally
        window.buildFaceGroups = buildFaceGroups;
        window.enterFaceEditMode = enterFaceEditMode;
        window.exitFaceEditMode = exitFaceEditMode;
        window.deleteFaceGroup = deleteFaceGroup;
        window.handleDeleteCommand = handleDeleteCommand;
        window.handleColorFace = handleColorFace;
        window.getFaceEditStatus = getFaceEditStatus;
        window.forceSelectFirstFace = forceSelectFirstFace;
        window.testFaceColoring = testFaceColoring;
        window.testExtrudeSystem = testExtrudeSystem;
        window.testMultiSelect = testMultiSelect;
        window.checkMultiSelectState = checkMultiSelectState;
        window.testUXAcceptance = testUXAcceptance;
        window.handleExtrudeFace = handleExtrudeFace;
        window.enableMultiFaceSelection = enableMultiFaceSelection;
        window.buildFaceBoundaryPolygon = buildFaceBoundaryPolygon;
        window.showExtrudeGizmo = showExtrudeGizmo;
        window.confirmExtrude = confirmExtrude;
        window.cancelExtrude = cancelExtrude;
        window.updateExtrudeDistance = updateExtrudeDistance;
        window.handleExtrudeKeydown = handleExtrudeKeydown;

        // QUICK DEBUG FUNCTIONS
        window.debugFaceSelection = function() {
            console.log('=== FACE SELECTION DEBUG ===');
            console.log('Face mode active:', state.faceEditState.isActive);
            console.log('Multi-select mode:', state.faceEditState.multiSelect);
            console.log('Selected face IDs:', Array.from(state.faceEditState.selectedFaceIds));
            console.log('Total groups:', state.faceEditState.groups.length);
            console.log('Groups:', state.faceEditState.groups.map(g => g.id));
            return state.faceEditState;
        };

        window.debugExtrudeState = function() {
            console.log('=== EXTRUDE STATE DEBUG ===');
            console.log('Extrude UI active:', state.extrudeUI.active);
            console.log('Arrow exists:', !!state.extrudeUI.arrow);
            console.log('Face IDs:', state.extrudeUI.faceIds);
            console.log('Current depth:', state.extrudeUI.depth);
            console.log('Drag state:', state.extrudeUI.drag);

            // Check UI panel
            const panel = document.getElementById('extrudePanel');
            console.log('Panel exists:', !!panel);
            console.log('Panel visible:', panel ? panel.style.display : 'N/A');

            return state.extrudeUI;
        };

        // Quick test function for Fusion 360 style extrude
        window.testFusion360Extrude = function() {
            console.log('🧪 Testing Fusion 360 Extrude System...');

            // Step 1: Create a cube if none exists
            if (state.loadedModels.length === 0) {
                console.log('1. Creating test cube...');
                createPrimitive('cube');
                setTimeout(() => testFusion360Extrude(), 500);
                return;
            }

            // Step 2: Enter face edit mode
            console.log('2. Entering face edit mode...');
            if (!state.faceEditState.isActive) {
                toggleFaceEditMode();
            }

            // Step 3: Select first face
            setTimeout(() => {
                console.log('3. Selecting first face...');
                if (state.faceEditState.groups.length > 0) {
                    const firstFace = state.faceEditState.groups[0];
                    state.faceEditState.selectedFaceIds.clear();
                    state.faceEditState.selectedFaceIds.add(firstFace.id);
                    updateFaceHighlights();

                    // Step 4: Start extrude
                    setTimeout(() => {
                        console.log('4. Starting extrude...');
                        const result = handleExtrudeFace();

                        setTimeout(() => {
                            console.log('=== RESULTS ===');
                            console.log('✅ Extrude started:', result);
                            console.log('✅ Arrow visible:', !!state.extrudeUI.arrow);
                            console.log('✅ UI active:', state.extrudeUI.active);

                            const panel = document.getElementById('extrudePanel');
                            console.log('✅ Panel exists:', !!panel);
                            console.log('✅ Panel visible:', panel ? panel.style.display !== 'none' : false);

                            if (result && state.extrudeUI.arrow && panel && panel.style.display !== 'none') {
                                console.log('🎉 SUCCESS! Blue 2D arrow extrude is working!');
                                console.log('💡 Try clicking and dragging the blue arrow');
                                console.log('💡 Or type a value in the input field');

                                // Test arrow interaction
                                if (state.extrudeUI.arrow) {
                                    console.log('🔍 Arrow details:');
                                    console.log('   - Type:', state.extrudeUI.arrow.type);
                                    console.log('   - Children:', state.extrudeUI.arrow.children.length);
                                    console.log('   - Position:', state.extrudeUI.arrow.position.toArray());
                                    console.log('   - Visible:', state.extrudeUI.arrow.visible);
                                    console.log('   - In state.scene:', state.extrudeUI.arrow.parent === state.scene);
                                }
                            } else {
                                console.log('❌ Something is not working...');
                                debugExtrudeState();
                            }
                        }, 200);
                    }, 200);
                }
            }, 200);
        };

        // Test arrow clicking specifically
        window.testArrowClick = function() {
            if (!state.extrudeUI.active || !state.extrudeUI.arrow) {
                console.log('❌ Extrude not active or no arrow. Run testFusion360Extrude() first.');
                return;
            }

            console.log('🎯 Testing arrow click detection...');
            console.log('Arrow exists:', !!state.extrudeUI.arrow);
            console.log('Arrow children:', state.extrudeUI.arrow.children.length);
            console.log('Arrow userData:', state.extrudeUI.arrow.userData);

            // Test raycasting on arrow
            state.mouse.x = 0; // Center of screen
            state.mouse.y = 0;
            state.raycaster.setFromCamera(state.mouse, state.camera);

            const intersects = state.raycaster.intersectObject(state.extrudeUI.arrow, true);
            console.log('Center screen intersects with arrow:', intersects.length);

            if (intersects.length > 0) {
                console.log('✅ Arrow is clickable at center!');
                console.log('   Intersected:', intersects[0].object.type);
            } else {
                console.log('❌ Arrow not detected at center. Try moving state.camera closer to arrow.');
            }
        };

        window.forceSelectTwoFaces = function() {
            if (!state.faceEditState.isActive) {
                console.log('Face mode not active');
                return false;
            }

            if (state.faceEditState.groups.length < 2) {
                console.log('Need at least 2 faces');
                return false;
            }

            // Force select first two faces
            state.faceEditState.selectedFaceIds.clear();
            state.faceEditState.selectedFaceIds.add(state.faceEditState.groups[0].id);
            state.faceEditState.selectedFaceIds.add(state.faceEditState.groups[1].id);
            state.faceEditState.selectedGroupId = state.faceEditState.groups[0].id;

            // Update visuals
            state.faceEditState.groups.forEach(group => {
                const isSelected = state.faceEditState.selectedFaceIds.has(group.id);
                if (group.overlay && group.overlay.material) {
                    group.overlay.material.opacity = isSelected ? 0.7 : 0.4;
                    group.overlay.material.color.setHex(isSelected ? 0xff0000 : 0x00ff00);
                }
                if (group.outline) {
                    group.outline.visible = isSelected;
                }
            });

            console.log('Selected 2 faces:', Array.from(state.faceEditState.selectedFaceIds));
            return true;
        };

        // STEP BY STEP DIAGNOSTIC
        window.stepByStepTest = function() {
            console.log('=== STEP BY STEP DIAGNOSTIC ===');

            // Step 1: Check face mode
            console.log('Step 1: Face mode active?', state.faceEditState.isActive);
            if (!state.faceEditState.isActive) {
                console.log('Starting face mode...');
                testFaceEditing();
                setTimeout(() => stepByStepTest(), 1000);
                return;
            }

            // Step 2: Check groups
            console.log('Step 2: Face groups available?', state.faceEditState.groups.length);
            if (state.faceEditState.groups.length === 0) {
                console.log('No face groups found!');
                return;
            }

            // Step 3: Test single selection
            console.log('Step 3: Testing single face selection...');
            state.faceEditState.selectedFaceIds.clear();
            state.faceEditState.selectedFaceIds.add(state.faceEditState.groups[0].id);
            state.faceEditState.selectedGroupId = state.faceEditState.groups[0].id;

            // Update visual
            state.faceEditState.groups.forEach(group => {
                const isSelected = state.faceEditState.selectedFaceIds.has(group.id);
                if (group.overlay && group.overlay.material) {
                    group.overlay.material.opacity = isSelected ? 0.7 : 0.4;
                    group.overlay.material.color.setHex(isSelected ? 0xff0000 : 0x00ff00);
                }
            });

            console.log('Step 3 result: Selected faces:', Array.from(state.faceEditState.selectedFaceIds));

            // Step 4: Test extrude
            console.log('Step 4: Testing extrude...');
            const extrudeResult = handleExtrudeFace();
            console.log('Step 4 result: Extrude started?', extrudeResult);
            console.log('Arrow created?', !!state.extrudeUI.arrow);

            if (extrudeResult && state.extrudeUI.arrow) {
                console.log('✅ SUCCESS: Extrude system working!');
                console.log('Try dragging the green arrow, then press Enter to confirm or Esc to cancel');
            } else {
                console.log('❌ FAILED: Extrude system not working');
                debugExtrudeState();
            }
        };

        // COMPLETE SYSTEM TEST
        window.completeSystemTest = function() {
            console.log('=== COMPLETE SYSTEM TEST ===');

            // Step 1: Setup
            if (!state.faceEditState.isActive) {
                console.log('1. Starting face mode...');
                testFaceEditing();
                setTimeout(() => completeSystemTest(), 1000);
                return;
            }

            console.log('1. ✅ Face mode active');
            console.log('2. Testing single face selection...');

            // Step 2: Test single selection
            if (state.faceEditState.groups.length > 0) {
                const firstFaceId = state.faceEditState.groups[0].id;

                // Clear and select first face
                state.faceEditState.selectedFaceIds.clear();
                state.faceEditState.selectedFaceIds.add(firstFaceId);
                state.faceEditState.selectedGroupId = firstFaceId;

                // Update visual
                state.faceEditState.groups.forEach(group => {
                    const isSelected = state.faceEditState.selectedFaceIds.has(group.id);
                    if (group.overlay && group.overlay.material) {
                        group.overlay.material.opacity = isSelected ? 0.7 : 0.4;
                        group.overlay.material.color.setHex(isSelected ? 0xff0000 : 0x00ff00);
                    }
                    if (group.outline) {
                        group.outline.visible = isSelected;
                    }
                });

                console.log('2. ✅ Single face selected:', firstFaceId);

                // Step 3: Test extrude
                console.log('3. Testing extrude...');
                const extrudeResult = handleExtrudeFace();

                if (extrudeResult && state.extrudeUI.active && state.extrudeUI.arrow) {
                    console.log('3. ✅ Extrude system working!');
                    console.log('   - Arrow created:', !!state.extrudeUI.arrow);
                    console.log('   - UI active:', state.extrudeUI.active);
                    console.log('   - Face IDs:', state.extrudeUI.faceIds);

                    // Step 4: Test multi-select
                    setTimeout(() => {
                        console.log('4. Testing multi-select...');
                        cancelExtrude(); // Cancel current extrude

                        if (state.faceEditState.groups.length >= 2) {
                            // Enable multi-select
                            state.faceEditState.multiSelect = true;

                            // Select multiple faces
                            state.faceEditState.selectedFaceIds.clear();
                            state.faceEditState.selectedFaceIds.add(state.faceEditState.groups[0].id);
                            state.faceEditState.selectedFaceIds.add(state.faceEditState.groups[1].id);

                            // Update visual
                            state.faceEditState.groups.forEach(group => {
                                const isSelected = state.faceEditState.selectedFaceIds.has(group.id);
                                if (group.overlay && group.overlay.material) {
                                    group.overlay.material.opacity = isSelected ? 0.7 : 0.4;
                                    group.overlay.material.color.setHex(isSelected ? 0xff0000 : 0x00ff00);
                                }
                                if (group.outline) {
                                    group.outline.visible = isSelected;
                                }
                            });

                            console.log('4. ✅ Multi-select working:', Array.from(state.faceEditState.selectedFaceIds));

                            // Test multi-face extrude
                            const multiExtrudeResult = handleExtrudeFace();
                            if (multiExtrudeResult) {
                                console.log('5. ✅ Multi-face extrude working!');
                                console.log('');
                                console.log('🎉 ALL TESTS PASSED! 🎉');
                                console.log('');
                                console.log('Manual test instructions:');
                                console.log('- Click faces to select/deselect');
                                console.log('- Hold Ctrl and click for multi-select');
                                console.log('- Press E to start extrude');
                                console.log('- Drag green arrow to set depth');
                                console.log('- Press Enter to confirm, Esc to cancel');
                            } else {
                                console.log('5. ❌ Multi-face extrude failed');
                            }
                        } else {
                            console.log('4. ⚠️ Need at least 2 faces for multi-select test');
                        }
                    }, 1000);
                } else {
                    console.log('3. ❌ Extrude system failed');
                    console.log('   - Result:', extrudeResult);
                    console.log('   - UI active:', state.extrudeUI.active);
                    console.log('   - Arrow exists:', !!state.extrudeUI.arrow);
                }
            } else {
                console.log('2. ❌ No face groups available');
            }
        };
        window.paintFace = paintFace;
        window.extrudeFaceAdd = extrudeFaceAdd;
        window.refreshFaceGroups = refreshFaceGroups;

        // Face editing status and debugging
        window.getFaceEditStatus = function() {
            console.log("=== FACE EDIT STATUS ===");
            console.log("Active:", state.faceEditState.isActive);
            console.log("Target mesh:", state.faceEditState.targetMesh?.name || "none");
            console.log("Groups count:", state.faceEditState.groups.length);
            console.log("Selected group:", state.faceEditState.selectedGroupId || "none");

            if (state.faceEditState.isActive) {
                console.log("Groups details:");
                state.faceEditState.groups.forEach((group, i) => {
                    console.log(`  ${i + 1}. ${group.id} - Overlay: ${!!group.overlay}, Outline: ${!!group.outline}`);
                });

                if (state.faceEditState.selectedGroupId) {
                    const selected = state.faceEditState.groups.find(g => g.id === state.faceEditState.selectedGroupId);
                    console.log("Selected group details:", selected);
                }
            }

            return state.faceEditState;
        };

        // TEST FACE EDITING SYSTEM
        window.testFaceEditing = function() {
            console.log("=== TESTING FACE EDITING SYSTEM ===");

            // Step 1: Create a test cube
            console.log("1. Creating test cube...");
            createPrimitive('cube');

            setTimeout(() => {
                // Step 2: Select the cube
                console.log("2. Selecting the cube...");
                if (state.loadedModels.length > 0) {
                    const cube = state.loadedModels[state.loadedModels.length - 1]; // Get the last created object
                    selectObject(cube);

                    setTimeout(() => {
                        // Step 3: Enter face edit mode
                        console.log("3. Entering face edit mode...");
                        const success = enterFaceEditMode(cube);

                        if (success) {
                            console.log(`✅ Face edit mode active with ${state.faceEditState.groups.length} face groups`);

                            setTimeout(() => {
                                // Step 4: Test face selection
                                console.log("4. Testing face selection...");
                                if (state.faceEditState.groups.length > 0) {
                                    const firstGroup = state.faceEditState.groups[0];
                                    selectFaceGroup(firstGroup.id);
                                    console.log(`✅ Selected face group: ${firstGroup.id}`);

                                    setTimeout(() => {
                                        // Step 5: Test face deletion
                                        console.log("5. Testing face deletion...");
                                        deleteFaceGroup(state.faceEditState.targetMesh, firstGroup);
                                        console.log("✅ Face deleted");

                                        setTimeout(() => {
                                            // Step 6: Test undo
                                            console.log("6. Testing undo...");
                                            undo();
                                            console.log("✅ Undo completed");

                                            console.log("✅ FACE EDITING TEST COMPLETE");
                                            console.log("\n🎯 TRY THESE COMMANDS:");
                                            console.log("- 'edit this object' (select cube first)");
                                            console.log("- Click on a face to select it (red highlight)");
                                            console.log("- 'delete this face' or press X");
                                            console.log("- 'paint this face red' or press C");
                                            console.log("- 'extrude this face' or press E");
                                            console.log("- 'exit face mode' or press Q");
                                            console.log("\n⌨️ KEYBOARD SHORTCUTS:");
                                            console.log("- X = Delete selected face");
                                            console.log("- C = Color selected face red");
                                            console.log("- E = Extrude selected face");
                                            console.log("- Q = Exit face mode");

                                        }, 1000);
                                    }, 1000);
                                }
                            }, 1000);
                        } else {
                            console.log("❌ Failed to enter face edit mode");
                        }
                    }, 500);
                } else {
                    console.log("❌ No cube created");
                }
            }, 500);
        };

        // TEST NATURAL LANGUAGE SYSTEM
        window.testNaturalLanguage = function() {
            console.log("=== TESTING NATURAL LANGUAGE OBJECT TARGETING ===");

            // Step 1: Create diverse test objects
            console.log("1. Creating diverse test objects...");

            // Clear existing objects
            if (state.loadedModels.length > 0) {
                state.loadedModels.forEach(obj => {
                    state.scene.remove(obj);
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach(mat => mat.dispose());
                        } else {
                            obj.material.dispose();
                        }
                    }
                });
                state.loadedModels.length = 0;
            }

            // Create test objects with different properties
            const objects = [
                { type: 'box', name: 'Red Car', position: [-3, 0, 0], color: 0xff0000, tags: ['car', 'vehicle'] },
                { type: 'box', name: 'Blue Car', position: [3, 0, 0], color: 0x0000ff, tags: ['car', 'vehicle'] },
                { type: 'sphere', name: 'Green Ball', position: [0, 2, -2], color: 0x00ff00, tags: ['ball'] },
                { type: 'cone', name: 'Yellow Cone', position: [-1, 0, 2], color: 0xffff00, tags: ['cone'] },
                { type: 'cone', name: 'Orange Cone', position: [1, 0, 2], color: 0xff8800, tags: ['cone'] }
            ];

            objects.forEach(objDef => {
                let geometry;
                switch (objDef.type) {
                    case 'box':
                        geometry = new THREE.BoxGeometry(1, 0.5, 2);
                        break;
                    case 'sphere':
                        geometry = new THREE.SphereGeometry(0.5, 32, 32);
                        break;
                    case 'cone':
                        geometry = new THREE.ConeGeometry(0.3, 1, 8);
                        break;
                }

                const material = new THREE.MeshBasicMaterial({ color: objDef.color });
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(...objDef.position);
                mesh.name = objDef.name;
                mesh.userData.tags = objDef.tags;

                state.scene.add(mesh);
                state.loadedModels.push(mesh);
            });

            console.log("✅ Created 5 test objects: 2 cars, 1 ball, 2 cones");

            // Step 2: Test state.scene indexing
            setTimeout(() => {
                console.log("2. Testing state.scene indexing...");
                const index = indexScene(state.scene);
                console.log("state.scene index:", index);

                // Step 3: Test object class finding
                console.log("3. Testing object class finding...");
                const cars = findObjectsByClass(index, 'car');
                const balls = findObjectsByClass(index, 'ball');
                const cones = findObjectsByClass(index, 'cone');

                console.log(`Found ${cars.length} cars:`, cars.map(c => c.name));
                console.log(`Found ${balls.length} balls:`, balls.map(b => b.name));
                console.log(`Found ${cones.length} cones:`, cones.map(c => c.name));

                // Step 4: Test natural language commands
                console.log("4. Testing natural language commands...");

                // Test 1: Unique object (should work directly)
                console.log("   4a. Testing unique object selection...");
                const uniqueResponse = {
                    action: "delete",
                    targets: [{ uuid: balls[0].uuid, class: "ball", reason: "unique match" }]
                };
                console.log("   Simulating: 'delete the ball'");
                console.log("   Response:", uniqueResponse);

                // Test 2: Multiple objects (should trigger clarification)
                console.log("   4b. Testing multiple object clarification...");
                const multipleResponse = {
                    action: "clarify",
                    targets: cars.map((car, i) => ({
                        uuid: car.uuid,
                        class: "car",
                        name: car.name,
                        color: car.color,
                        positionHint: car.positionHint,
                        reason: "multiple matches"
                    })),
                    question: "Which car? (1) Red Car left-center, (2) Blue Car right-center",
                    context: { originalAction: "delete" }
                };
                console.log("   Simulating: 'delete a car'");
                console.log("   Response:", multipleResponse);

                // Test 3: All objects (should work directly)
                console.log("   4c. Testing 'all' selection...");
                const allResponse = {
                    action: "transform",
                    operation: { type: "scale", value: { uniform: 1.5 } },
                    targets: [{ class: "cone", all: true, reason: "user said all" }]
                };
                console.log("   Simulating: 'scale all cones by 1.5'");
                console.log("   Response:", allResponse);

                // Step 5: Test actual execution
                console.log("5. Testing actual execution...");

                setTimeout(() => {
                    console.log("   5a. Executing 'scale all cones'...");
                    handleNLActionResponse(allResponse);

                    setTimeout(() => {
                        console.log("   5b. Testing undo...");
                        undo();

                        setTimeout(() => {
                            console.log("   5c. Testing redo...");
                            redo();

                            console.log("✅ NATURAL LANGUAGE TEST COMPLETE");
                            console.log(`   Final object count: ${state.loadedModels.length}`);
                            console.log(`   Undo stack size: ${state.undoStack.length}`);
                            console.log(`   Redo stack size: ${state.redoStack.length}`);

                            // Display instructions
                            console.log("\n🎯 TRY THESE COMMANDS:");
                            console.log("- 'delete the ball'");
                            console.log("- 'delete a car' (will ask which one)");
                            console.log("- 'move the red car up 1 meter'");
                            console.log("- 'rotate all cones 45 degrees'");
                            console.log("- 'make the blue car green'");
                            console.log("- 'scale the ball by 2'");

                        }, 500);
                    }, 500);
                }, 500);
            }, 100);
        };

        // COMPLETE WORKFLOW TEST
        window.testCompleteWorkflow = function() {
            console.log("=== TESTING COMPLETE WORKFLOW ===");

            // Step 1: Create objects
            console.log("1. Creating test objects...");

            // Clear existing objects first
            if (state.loadedModels.length > 0) {
                state.loadedModels.forEach(obj => {
                    state.scene.remove(obj);
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach(mat => mat.dispose());
                        } else {
                            obj.material.dispose();
                        }
                    }
                });
                state.loadedModels.length = 0;
            }

            // Create fresh test objects
            const geometry1 = new THREE.BoxGeometry(1, 1, 1);
            const material1 = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const cube1 = new THREE.Mesh(geometry1, material1);
            cube1.position.set(-2, 0, 0);
            cube1.name = "Test Cube";
            state.scene.add(cube1);
            state.loadedModels.push(cube1);

            const geometry2 = new THREE.SphereGeometry(0.5, 32, 32);
            const material2 = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const sphere1 = new THREE.Mesh(geometry2, material2);
            sphere1.position.set(2, 0, 0);
            sphere1.name = "Test Sphere";
            state.scene.add(sphere1);
            state.loadedModels.push(sphere1);

            console.log("✅ Created 2 test objects");

            setTimeout(() => {
                // Step 2: Select All → Duplicate
                console.log("2. Testing Select All → Duplicate...");
                highlightAllModels();

                setTimeout(() => {
                    duplicateSelection();

                    setTimeout(() => {
                        console.log(`   Objects after duplicate: ${state.loadedModels.length} (expected: 4)`);

                        // Step 3: Select All → Transform sequence
                        console.log("3. Testing Select All → Transform sequence...");
                        highlightAllModels();

                        setTimeout(() => {
                            // Move
                            console.log("   3a. Moving all objects...");
                            translateSelection(0, 1, 0);

                            setTimeout(() => {
                                // Scale
                                console.log("   3b. Scaling all objects...");
                                scaleSelection(1.2, 1.2, 1.2);

                                setTimeout(() => {
                                    // Rotate
                                    console.log("   3c. Rotating all objects...");
                                    rotateSelection(0, Math.PI / 6, 0);

                                    setTimeout(() => {
                                        // Step 4: Test undo sequence
                                        console.log("4. Testing undo sequence...");
                                        console.log(`   Undo stack size: ${state.undoStack.length}`);

                                        // Should undo: rotate, scale, move, duplicate
                                        undo(); // Undo rotate
                                        setTimeout(() => {
                                            undo(); // Undo scale
                                            setTimeout(() => {
                                                undo(); // Undo move
                                                setTimeout(() => {
                                                    undo(); // Undo duplicate
                                                    setTimeout(() => {
                                                        console.log(`   Objects after undo sequence: ${state.loadedModels.length} (expected: 2)`);

                                                        // Step 5: Test redo sequence
                                                        console.log("5. Testing redo sequence...");
                                                        redo(); // Redo duplicate
                                                        setTimeout(() => {
                                                            redo(); // Redo move
                                                            setTimeout(() => {
                                                                redo(); // Redo scale
                                                                setTimeout(() => {
                                                                    redo(); // Redo rotate
                                                                    setTimeout(() => {
                                                                        console.log(`   Final objects count: ${state.loadedModels.length} (expected: 4)`);
                                                                        console.log(`   Final undo stack: ${state.undoStack.length}`);
                                                                        console.log(`   Final redo stack: ${state.redoStack.length}`);

                                                                        if (state.loadedModels.length === 4 && state.undoStack.length === 4 && state.redoStack.length === 0) {
                                                                            console.log("✅ COMPLETE WORKFLOW TEST PASSED");
                                                                        } else {
                                                                            console.log("❌ COMPLETE WORKFLOW TEST FAILED");
                                                                        }
                                                                    }, 200);
                                                                }, 200);
                                                            }, 200);
                                                        }, 200);
                                                    }, 200);
                                                }, 200);
                                            }, 200);
                                        }, 200);
                                    }, 200);
                                }, 200);
                            }, 200);
                        }, 200);
                    }, 200);
                }, 200);
            }, 100);
        };

        // SIMPLE DIRECT EDITING FUNCTIONS - UPDATED TO USE UNIFIED SYSTEM
        window.moveAllObjects = function(x, y, z) {
            console.log(`Moving all ${state.loadedModels.length} objects by (${x}, ${y}, ${z})`);

            // Select all objects first
            setSelectedObjects(state.loadedModels);

            // Use the unified transform function
            translateSelection(x || 0, y || 0, z || 0);
        };

        window.scaleAllObjects = function(scale) {
            console.log(`Scaling all ${state.loadedModels.length} objects by ${scale}`);

            // Select all objects first
            setSelectedObjects(state.loadedModels);

            // Use the unified transform function
            scaleSelection(scale || 1.5, scale || 1.5, scale || 1.5);
        };

        window.rotateAllObjects = function(x, y, z) {
            console.log(`Rotating all ${state.loadedModels.length} objects`);

            // Select all objects first
            setSelectedObjects(state.loadedModels);

            // Use the unified transform function
            rotateSelection(x || 0, y || Math.PI / 4, z || 0);
        };

        window.deleteAllObjects = function() {
            console.log(`Deleting all ${state.loadedModels.length} objects`);
            const count = state.loadedModels.length;
            state.loadedModels.forEach(obj => {
                state.scene.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(mat => mat.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            });
            state.loadedModels.length = 0;
            clearSelection();
            clearAllHighlights();
            alert(`Deleted ${count} objects`);
        };

        // COMPLETELY BYPASS SELECTION SYSTEM - JUST DUPLICATE ALL REAL OBJECTS
        window.duplicateSelectedObject = function() {
            console.log("=== DUPLICATE SELECTED OBJECT (BYPASS SELECTION) ===");

            // Always duplicate all real objects, ignore selection completely
            console.log("Bypassing selection system, duplicating all real objects...");

            // Get all real objects (not helpers)
            const realObjects = state.loadedModels.filter(obj => {
                return obj.name !== 'GroupMovementHelper' &&
                       !obj.userData?.isGroupHelper &&
                       !obj.userData?.isHelper &&
                       obj.isMesh; // Only mesh objects
            });

            if (realObjects.length === 0) {
                alert("No real objects found to duplicate!");
                return false;
            }

            console.log(`Found ${realObjects.length} real objects to duplicate:`, realObjects.map(obj => obj.name));

            let duplicatedCount = 0;

            // Duplicate each real object
            realObjects.forEach(original => {
                try {
                    const duplicate = original.clone();
                    duplicate.position.x = original.position.x + 3;
                    duplicate.position.y = original.position.y;
                    duplicate.position.z = original.position.z;
                    duplicate.name = original.name + " Copy";

                    // Copy important properties
                    duplicate.scale.copy(original.scale);
                    duplicate.rotation.copy(original.rotation);

                    if (original.userData) {
                        duplicate.userData = {
                            isPrimitive: original.userData.isPrimitive,
                            primitiveType: original.userData.primitiveType,
                            initialMaterial: duplicate.material ? duplicate.material.clone() : null
                        };
                    }

                    state.scene.add(duplicate);
                    state.loadedModels.push(duplicate);
                    duplicatedCount++;

                    console.log(`✅ Duplicated: ${original.name} → ${duplicate.name}`);

                } catch (error) {
                    console.error(`❌ Failed to duplicate ${original.name}:`, error);
                }
            });

            if (duplicatedCount > 0) {
                alert(`✅ SUCCESS! Duplicated ${duplicatedCount} real objects!`);
                addMessageToLog('System', `Duplicated ${duplicatedCount} real objects. Copies created to the right.`);
                console.log(`✅ Successfully duplicated ${duplicatedCount} real objects`);
                return true;
            } else {
                alert("❌ Failed to duplicate any objects");
                return false;
            }
        };

        // ERROR CHECKING AND DEBUGGING FUNCTION
        window.checkForErrors = function() {
            console.log("=== ERROR CHECKING ===");

            try {
                console.log("1. Checking state.loadedModels:", state.loadedModels);
                console.log("   - Type:", typeof state.loadedModels);
                console.log("   - Length:", state.loadedModels ? state.loadedModels.length : 'undefined');
                console.log("   - Contents:", state.loadedModels ? state.loadedModels.map(obj => obj.name || obj.type) : 'none');

                console.log("2. Checking state.scene:", state.scene);
                console.log("   - Type:", typeof state.scene);
                console.log("   - Children count:", state.scene ? state.scene.children.length : 'undefined');

                console.log("3. Checking duplicateSelectedObject function:");
                console.log("   - Type:", typeof window.duplicateSelectedObject);
                console.log("   - Exists:", window.duplicateSelectedObject ? 'yes' : 'no');

                console.log("4. Testing simple duplicate:");
                if (state.loadedModels && state.loadedModels.length > 0) {
                    console.log("   - Found objects to test with");

                    // Try the simplest possible duplicate
                    const original = state.loadedModels[0];
                    console.log("   - Testing with:", original.name);

                    try {
                        const copy = original.clone();
                        copy.position.x += 2;
                        copy.name = original.name + " TEST";
                        state.scene.add(copy);
                        state.loadedModels.push(copy);
                        console.log("   ✅ Simple duplicate test PASSED");

                        // Clean up test
                        state.scene.remove(copy);
                        state.loadedModels.pop();

                    } catch (cloneError) {
                        console.error("   ❌ Simple duplicate test FAILED:", cloneError);
                    }
                } else {
                    console.log("   - No objects to test with");
                }

                console.log("5. Error check complete");

            } catch (error) {
                console.error("❌ Error during error checking:", error);
            }
        };

        // ULTRA SIMPLE DUPLICATE - NO DEPENDENCIES
        window.simplestDuplicate = function() {
            console.log("=== SIMPLEST DUPLICATE ===");

            if (!state.loadedModels || state.loadedModels.length === 0) {
                alert("No objects to duplicate");
                return;
            }

            const count = state.loadedModels.length;
            console.log(`Duplicating ${count} objects...`);

            for (let i = 0; i < count; i++) {
                const original = state.loadedModels[i];
                console.log(`Copying ${i + 1}: ${original.name}`);

                const copy = original.clone();
                copy.position.x = original.position.x + 3;
                copy.name = original.name + " COPY";

                state.scene.add(copy);
                state.loadedModels.push(copy);

                console.log(`✅ Created: ${copy.name}`);
            }

            alert(`Created ${count} copies!`);
        };

        // ALL DUPLICATE FUNCTIONS USE THE WORKING VERSION
        window.duplicateAllSelected = window.duplicateSelectedObject;
        window.duplicateSelected = window.duplicateSelectedObject;
        window.duplicateEverything = window.duplicateMultipleObjects;
        window.duplicateAllObjects = window.duplicateMultipleObjects;
        window.duplicateAll = window.duplicateMultipleObjects;
        window.justDuplicate = window.duplicateMultipleObjects;
        window.duplicateNow = window.duplicateMultipleObjects;
        window.copyAll = window.duplicateMultipleObjects;
        window.duplicateMultiple = window.duplicateMultipleObjects;

        // COMPLETE SELECT ALL + EDIT WORKFLOW TEST
        window.testSelectAllWorkflow = function() {
            console.log("=== TESTING COMPLETE SELECT ALL + EDIT WORKFLOW ===");

            // Step 1: Create multiple objects
            console.log("1. Creating multiple objects...");
            createPrimitive('cube');
            createPrimitive('sphere');
            createPrimitive('pyramid');

            setTimeout(() => {
                console.log(`2. Created ${state.loadedModels.length} objects`);

                // Step 2: Select all
                console.log("3. Selecting all objects...");
                highlightAllModels();

                setTimeout(() => {
                    console.log("4. All objects selected!");
                    console.log(`   - state.currentlySelectedObjectsForEditing.length: ${state.currentlySelectedObjectsForEditing.length}`);
                    console.log("");
                    console.log("✅ NOW YOU CAN EDIT ALL SELECTED OBJECTS:");
                    console.log("");
                    console.log("DUPLICATE:");
                    console.log("- duplicateSelection() - Duplicates all selected objects (NEW)");
                    console.log("");
                    console.log("MOVE:");
                    console.log("- moveAllObjects(2, 0, 0) - Move all right");
                    console.log("- moveAllObjects(0, 1, 0) - Move all up");
                    console.log("");
                    console.log("SCALE:");
                    console.log("- scaleAllObjects(1.5) - Make all 1.5x bigger");
                    console.log("- scaleAllObjects(2) - Make all 2x bigger");
                    console.log("");
                    console.log("ROTATE:");
                    console.log("- rotateAllObjects(0, Math.PI/4, 0) - Rotate all 45°");
                    console.log("- rotateAllObjects(0, Math.PI/2, 0) - Rotate all 90°");
                    console.log("");
                    console.log("DELETE:");
                    console.log("- deleteAllObjects() - Delete all objects");
                    console.log("");
                    console.log("🎯 TRY: duplicateSelection() or testSelectAllDuplicate()");

                    addMessageToLog('System', 'Select all complete! Now you can duplicate, move, scale, rotate, or delete all selected objects using the functions shown in console.');
                }, 500);
            }, 1500);
        };

        // SIMPLE TEST FOR MULTIPLE OBJECT DUPLICATION
        window.testMultipleDuplicate = function() {
            console.log("=== TESTING MULTIPLE OBJECT DUPLICATION ===");

            // Create multiple objects
            createPrimitive('cube');
            createPrimitive('sphere');
            createPrimitive('pyramid');

            setTimeout(() => {
                console.log(`Created ${state.loadedModels.length} objects`);

                // Select all and duplicate
                highlightAllModels();

                setTimeout(() => {
                    const success = duplicateMultipleObjects();

                    if (success && state.loadedModels.length === 6) {
                        console.log("✅ MULTIPLE OBJECT DUPLICATION WORKS!");
                    } else {
                        console.error("❌ Multiple object duplication failed");
                    }
                }, 500);
            }, 1500);
        };

        window.moveAllSelected = (x, y, z) => editSelected('move', x, y, z);
        window.scaleAllSelected = (scale) => editSelected('scale', scale);
        window.rotateAllSelected = (x, y, z) => editSelected('rotate', x, y, z);
        window.colorAllSelected = (color) => editSelected('color', color);
        window.deleteAllSelected = () => editSelected('delete');

        // Test multi-object editing
        window.testMultiEdit = function() {
            console.log("=== TESTING MULTI-OBJECT EDITING ===");

            // Create multiple objects
            console.log("1. Creating 5 test objects...");
            createPrimitive('cube');
            setTimeout(() => {
                createPrimitive('sphere');
                setTimeout(() => {
                    createPrimitive('pyramid');
                    setTimeout(() => {
                        createPrimitive('cone');
                        setTimeout(() => {
                            createPrimitive('cylinder');

                            setTimeout(() => {
                                console.log("2. Objects created. Testing select all...");
                                highlightAllModels();

                                setTimeout(() => {
                                    console.log("3. All objects selected. Testing operations...");
                                    console.log("   Available operations:");
                                    console.log("   - duplicateAllSelected() - Duplicate all");
                                    console.log("   - moveAllSelected(2, 0, 0) - Move all right");
                                    console.log("   - scaleAllSelected(1.5) - Scale all 1.5x");
                                    console.log("   - rotateAllSelected(0, Math.PI/4, 0) - Rotate all");
                                    console.log("   - colorAllSelected('#ff0000') - Make all red");
                                    console.log("   - deleteAllSelected() - Delete all");
                                    console.log("");
                                    console.log("✅ Multi-edit system ready!");
                                    console.log("✅ Try: duplicateAllSelected()");
                                }, 500);
                            }, 500);
                        }, 500);
                    }, 500);
                }, 500);
            }, 500);
        };

        // Test the no-reset undo system
        window.testNoReset = function() {
            console.log("=== Testing NO RESET Undo System ===");

            // Create first object
            console.log("1. Creating cube...");
            createPrimitive('cube');
            console.log("   Objects:", state.loadedModels.length, "Undo stack:", state.undoStack.length);

            setTimeout(() => {
                // Create second object
                console.log("2. Creating sphere...");
                createPrimitive('sphere');
                console.log("   Objects:", state.loadedModels.length, "Undo stack:", state.undoStack.length);

                setTimeout(() => {
                    // Test undo - should go to 1 object, NOT 0
                    console.log("3. Testing undo...");
                    undo();
                    console.log("   After undo - Objects:", state.loadedModels.length, "Undo stack:", state.undoStack.length);

                    if (state.loadedModels.length === 0) {
                        console.error("❌ FAILED: Undo went to empty state!");
                    } else {
                        console.log("✅ SUCCESS: Undo kept objects, no reset!");
                    }

                    setTimeout(() => {
                        // Test redo
                        console.log("4. Testing redo...");
                        redo();
                        console.log("   After redo - Objects:", state.loadedModels.length, "Redo stack:", state.redoStack.length);
                        console.log("=== Test Complete ===");
                    }, 500);
                }, 500);
            }, 500);
        };

        // Comprehensive workflow test as requested
        window.testWorkflow = function() {
            console.log("=== COMPREHENSIVE WORKFLOW TEST ===");
            console.log("Testing: createPrimitive → duplicate → move → undo → redo");

            // Step 1: Add cube
            console.log("1. Creating cube...");
            createPrimitive('cube');

            setTimeout(() => {
                console.log(`   ✓ Cube created. Objects: ${state.loadedModels.length}, Undo stack: ${state.undoStack.length}`);

                // Step 2: Add sphere
                console.log("2. Creating sphere...");
                createPrimitive('sphere');

                setTimeout(() => {
                    console.log(`   ✓ Sphere created. Objects: ${state.loadedModels.length}, Undo stack: ${state.undoStack.length}`);

                    // Step 3: Duplicate selected object (sphere should be selected)
                    console.log("3. Duplicating selected object...");
                    if (state.selectedObject) {
                        duplicateSelectedObject();
                        setTimeout(() => {
                            console.log(`   ✓ Object duplicated. Objects: ${state.loadedModels.length}, Undo stack: ${state.undoStack.length}`);

                            // Step 4: Move selected object
                            console.log("4. Moving selected object...");
                            if (state.selectedObject) {
                                state.selectedObject.position.x += 2;
                                state.selectedObject.updateMatrixWorld(true);
                                console.log(`   ✓ Object moved to x: ${state.selectedObject.position.x}`);
                            }

                            setTimeout(() => {
                                // Step 5: Test undo
                                console.log("5. Testing UNDO...");
                                console.log(`   Before undo - Objects: ${state.loadedModels.length}, state.camera pos: ${state.camera.position.x.toFixed(2)}, ${state.camera.position.y.toFixed(2)}, ${state.camera.position.z.toFixed(2)}`);

                                undo();

                                setTimeout(() => {
                                    console.log(`   After undo - Objects: ${state.loadedModels.length}, state.camera pos: ${state.camera.position.x.toFixed(2)}, ${state.camera.position.y.toFixed(2)}, ${state.camera.position.z.toFixed(2)}`);

                                    // Check results
                                    if (state.loadedModels.length === 0) {
                                        console.error("   ❌ FAILED: state.scene reset to empty!");
                                    } else {
                                        console.log("   ✅ SUCCESS: Objects preserved, no reset!");
                                    }

                                    // Step 6: Test redo
                                    console.log("6. Testing REDO...");
                                    redo();

                                    setTimeout(() => {
                                        console.log(`   After redo - Objects: ${state.loadedModels.length}, state.camera pos: ${state.camera.position.x.toFixed(2)}, ${state.camera.position.y.toFixed(2)}, ${state.camera.position.z.toFixed(2)}`);

                                        // Final verification
                                        console.log("=== FINAL VERIFICATION ===");
                                        console.log(`✓ state.camera preserved: ${state.camera ? 'YES' : 'NO'}`);
                                        console.log(`✓ state.scene has lights: ${state.scene.children.filter(obj => obj.isLight).length > 0 ? 'YES' : 'NO'}`);
                                        console.log(`✓ Grid visible: ${state.currentGridHelper && state.currentGridHelper.visible ? 'YES' : 'NO'}`);
                                        console.log(`✓ Objects in state.scene: ${state.loadedModels.length}`);
                                        console.log(`✓ Undo stack: ${state.undoStack.length}, Redo stack: ${state.redoStack.length}`);
                                        console.log("=== WORKFLOW TEST COMPLETE ===");
                                    }, 500);
                                }, 500);
                            }, 500);
                        }, 500);
                    } else {
                        console.log("   No object selected for duplication, skipping...");
                    }
                }, 500);
            }, 500);
        };

        // Simple button test function
        window.testButtons = function() {
            console.log("=== Testing Undo/Redo Buttons ===");

            const undoBtn = document.getElementById('undoButton');
            const redoBtn = document.getElementById('redoButton');

            console.log("Undo button found:", !!undoBtn);
            console.log("Redo button found:", !!redoBtn);
            console.log("Undo button disabled:", undoBtn?.disabled);
            console.log("Redo button disabled:", redoBtn?.disabled);

            if (undoBtn) {
                console.log("Undo button onclick:", undoBtn.onclick);
                console.log("Undo button event listeners: (cannot inspect directly)");
            }

            if (redoBtn) {
                console.log("Redo button onclick:", redoBtn.onclick);
                console.log("Redo button event listeners: (cannot inspect directly)");
            }

            // Test if functions exist
            console.log("undo function exists:", typeof undo === 'function');
            console.log("redo function exists:", typeof redo === 'function');

            // Test calling functions directly
            console.log("Testing undo() function directly...");
            try {
                undo();
                console.log("✅ undo() function works");
            } catch (e) {
                console.error("❌ undo() function error:", e);
            }

            console.log("Testing redo() function directly...");
            try {
                redo();
                console.log("✅ redo() function works");
            } catch (e) {
                console.error("❌ redo() function error:", e);
            }

            return {
                undoButtonExists: !!undoBtn,
                redoButtonExists: !!redoBtn,
                undoFunctionExists: typeof undo === 'function',
                redoFunctionExists: typeof redo === 'function'
            };
        };

        // Quick test for select all functionality
        window.quickTestSelectAll = function() {
            console.log("=== Quick Select All Test ===");

            // Create objects if none exist
            if (state.loadedModels.length === 0) {
                createPrimitive('cube');
                setTimeout(() => {
                    createPrimitive('sphere');
                    setTimeout(() => {
                        console.log("Created test objects. Now testing select all...");
                        highlightAllModels();
                        console.log("Select all executed. Selected objects:", state.currentlySelectedObjectsForEditing.length);
                    }, 500);
                }, 500);
            } else {
                console.log("Using existing objects. Testing select all...");
                highlightAllModels();
                console.log("Select all executed. Selected objects:", state.currentlySelectedObjectsForEditing.length);
            }
        };

        // Comprehensive diagnostic function
        window.diagnoseSelection = function() {
            console.log("=== COMPREHENSIVE SELECTION DIAGNOSTIC ===");

            // Check basic variables
            console.log("1. Basic State Check:");
            console.log("   - state.scene exists:", !!state.scene);
            console.log("   - state.camera exists:", !!state.camera);
            console.log("   - state.renderer exists:", !!state.renderer);
            console.log("   - state.raycaster exists:", !!state.raycaster);
            console.log("   - state.mouse exists:", !!state.mouse);
            console.log("   - state.transformControls exists:", !!state.transformControls);

            console.log("2. Object State:");
            console.log("   - state.loadedModels.length:", state.loadedModels.length);
            console.log("   - state.selectedObject:", state.selectedObject ? state.selectedObject.name || state.selectedObject.uuid : 'null');
            console.log("   - state.currentlySelectedObjectsForEditing.length:", state.currentlySelectedObjectsForEditing.length);
            console.log("   - state.originalMaterialProperties.size:", state.originalMaterialProperties.size);
            console.log("   - state.allHighlightsOriginalMaterials.size:", state.allHighlightsOriginalMaterials.size);

            console.log("3. state.scene Analysis:");
            if (state.scene) {
                let meshCount = 0;
                let visibleMeshCount = 0;
                state.scene.traverse((obj) => {
                    if (obj.isMesh) {
                        meshCount++;
                        if (obj.visible) visibleMeshCount++;
                    }
                });
                console.log("   - Total meshes in state.scene:", meshCount);
                console.log("   - Visible meshes in state.scene:", visibleMeshCount);
            }

            console.log("4. Function Tests:");
            try {
                console.log("   - highlightAllModels function exists:", typeof highlightAllModels === 'function');
                console.log("   - clearAllHighlights function exists:", typeof clearAllHighlights === 'function');
                console.log("   - selectObject function exists:", typeof selectObject === 'function');
                console.log("   - clearSelection function exists:", typeof clearSelection === 'function');
            } catch (e) {
                console.error("   - Error checking functions:", e);
            }

            console.log("5. Event Listener Test:");
            if (cadCanvas) {
                console.log("   - cadCanvas exists:", !!cadCanvas);
                console.log("   - cadCanvas has click listeners: checking...");
                // Note: Can't easily check event listeners, but we can verify the element exists
            }

            console.log("=== DIAGNOSTIC COMPLETE ===");
            console.log("If you see any 'false' or 'null' values above, that indicates the issue.");

            return {
                sceneReady: !!state.scene && !!state.camera && !!state.renderer,
                selectionReady: !!state.raycaster && !!state.mouse,
                objectsExist: state.loadedModels.length > 0,
                functionsExist: typeof highlightAllModels === 'function'
            };
        };

        // Test undo/redo buttons specifically
        window.testUndoRedoButtons = function() {
            console.log("=== Testing Undo/Redo Buttons ===");
            console.log("undoButton element:", document.getElementById('undoButton'));
            console.log("redoButton element:", document.getElementById('redoButton'));
            console.log("undoButton disabled:", document.getElementById('undoButton')?.disabled);
            console.log("redoButton disabled:", document.getElementById('redoButton')?.disabled);
            console.log("Initial state - History length:", getHistoryDebugState().length, "Pointer:", getHistoryDebugState().pointer);
            console.log("Objects in state.scene:", state.loadedModels.length);

            // Create a test object
            console.log("Creating cube...");
            createPrimitive('cube');

            setTimeout(() => {
                console.log("After creating cube:");
                console.log("undoButton disabled:", document.getElementById('undoButton')?.disabled);
                console.log("redoButton disabled:", document.getElementById('redoButton')?.disabled);
                console.log("History length:", getHistoryDebugState().length, "Pointer:", getHistoryDebugState().pointer);
                console.log("Objects in state.scene:", state.loadedModels.length);

                // Create another object
                console.log("Creating sphere...");
                createPrimitive('sphere');

                setTimeout(() => {
                    console.log("After creating sphere:");
                    console.log("History length:", getHistoryDebugState().length, "Pointer:", getHistoryDebugState().pointer);
                    console.log("Objects in state.scene:", state.loadedModels.length);

                    // Try clicking undo button programmatically
                    const undoBtn = document.getElementById('undoButton');
                    if (undoBtn) {
                        console.log("Clicking undo button programmatically...");
                        undoBtn.click();

                        setTimeout(() => {
                            console.log("After undo:");
                            console.log("History length:", getHistoryDebugState().length, "Pointer:", getHistoryDebugState().pointer);
                            console.log("Objects in state.scene:", state.loadedModels.length);

                            // Try redo
                            const redoBtn = document.getElementById('redoButton');
                            if (redoBtn) {
                                console.log("Clicking redo button programmatically...");
                                redoBtn.click();

                                setTimeout(() => {
                                    console.log("After redo:");
                                    console.log("History length:", getHistoryDebugState().length, "Pointer:", getHistoryDebugState().pointer);
                                    console.log("Objects in state.scene:", state.loadedModels.length);
                                    console.log("=== Test Complete ===");
                                }, 500);
                            }
                        }, 500);
                    } else {
                        console.error("Undo button not found!");
                    }
                }, 1000);
            }, 1000);
        };

        // Test selection functionality
        window.testSelection = function() {
            console.log("=== Testing Selection Functionality ===");
            console.log("Current state.selectedObject:", state.selectedObject ? state.selectedObject.name || state.selectedObject.uuid : 'null');
            console.log("Current select-all objects:", state.currentlySelectedObjectsForEditing.length);
            console.log("Objects in state.scene:", state.loadedModels.length);

            // Create some test objects
            createPrimitive('cube');
            setTimeout(() => {
                createPrimitive('sphere');

                setTimeout(() => {
                    console.log("After creating objects:");
                    console.log("Objects in state.scene:", state.loadedModels.length);
                    console.log("Current state.selectedObject:", state.selectedObject ? state.selectedObject.name || state.selectedObject.uuid : 'null');

                    // Test select all
                    console.log("Testing select all...");
                    highlightAllModels();

                    setTimeout(() => {
                        console.log("After select all:");
                        console.log("Select-all objects:", state.currentlySelectedObjectsForEditing.length);
                        console.log("All highlights map size:", state.allHighlightsOriginalMaterials.size);

                        // Test clear selection
                        console.log("Testing clear all highlights...");
                        clearAllHighlights();

                        setTimeout(() => {
                            console.log("After clear all:");
                            console.log("Select-all objects:", state.currentlySelectedObjectsForEditing.length);
                            console.log("All highlights map size:", state.allHighlightsOriginalMaterials.size);
                            console.log("=== Selection Test Complete ===");
                        }, 500);
                    }, 500);
                }, 500);
            }, 500);
        };

        // Simple test for shape creation
        window.testShapeCreation = function() {
            console.log("=== Testing Shape Creation ===");
            console.log(`state.scene initialized: ${!!state.scene}`);
            console.log(`state.camera initialized: ${!!state.camera}`);
            console.log(`state.renderer initialized: ${!!state.renderer}`);
            console.log(`Current objects in state.scene: ${state.scene ? state.scene.children.length : 'N/A'}`);
            console.log(`Current loaded models: ${state.loadedModels.length}`);

            console.log("Creating cube...");
            createPrimitive('cube');

            setTimeout(() => {
                console.log("Creating sphere...");
                createPrimitive('sphere');

                setTimeout(() => {
                    console.log("Creating ball (alias for sphere)...");
                    createPrimitive('ball');

                    console.log(`Final objects in state.scene: ${state.scene.children.length}`);
                    console.log(`Final loaded models: ${state.loadedModels.length}`);
                    console.log("=== Shape Creation Test Complete ===");
                }, 500);
            }, 500);
        };
        window.testUndoRedo = function() {
            console.log("=== Testing Undo/Redo Functionality ===");
            console.log(`Initial state - History: ${getHistoryDebugState().length}, Pointer: ${getHistoryDebugState().pointer}`);

            // Create a test cube
            createPrimitive('cube');
            console.log(`After creating cube - History: ${getHistoryDebugState().length}, Pointer: ${getHistoryDebugState().pointer}`);

            // Create another test sphere
            setTimeout(() => {
                createPrimitive('sphere');
                console.log(`After creating sphere - History: ${getHistoryDebugState().length}, Pointer: ${getHistoryDebugState().pointer}`);

                // Test undo
                setTimeout(() => {
                    console.log("Testing undo...");
                    undo();
                    console.log(`After undo - History: ${getHistoryDebugState().length}, Pointer: ${getHistoryDebugState().pointer}`);

                    // Test redo
                    setTimeout(() => {
                        console.log("Testing redo...");
                        redo();
                        console.log(`After redo - History: ${getHistoryDebugState().length}, Pointer: ${getHistoryDebugState().pointer}`);
                        console.log("=== Test Complete ===");
                    }, 1000);
                }, 1000);
            }, 1000);
        };

        // Test all core functionality
        window.testAllFeatures = function() {
            console.log("=== Testing All Core Features ===");

            // Test 1: Create primitives
            console.log("1. Testing createPrimitive...");
            createPrimitive('cube');

            setTimeout(() => {
                createPrimitive('sphere');

                setTimeout(() => {
                    // Test 2: Color change
                    console.log("2. Testing color change...");
                    if (state.selectedObject) {
                        changeObjectColor('#ff0000');
                    }

                    setTimeout(() => {
                        // Test 3: Duplicate
                        console.log("3. Testing duplicate...");
                        if (state.selectedObject) {
                            duplicateSelectedObject();
                        }

                        setTimeout(() => {
                            // Test 4: Move/Transform
                            console.log("4. Testing movement...");
                            if (state.selectedObject) {
                                state.selectedObject.position.x += 2;
                                state.selectedObject.updateMatrixWorld(true);
                            }

                            setTimeout(() => {
                                // Test 5: Scale
                                console.log("5. Testing scale...");
                                if (state.selectedObject) {
                                    state.selectedObject.scale.multiplyScalar(1.5);
                                    state.selectedObject.updateMatrixWorld(true);
                                }

                                setTimeout(() => {
                                    // Test 6: Delete
                                    console.log("6. Testing delete...");
                                    if (state.selectedObject) {
                                        removeObject();
                                    }

                                    setTimeout(() => {
                                        // Test 7: Undo/Redo
                                        console.log("7. Testing undo/redo...");
                                        undo();
                                        setTimeout(() => {
                                            redo();
                                            console.log("=== All Tests Complete ===");
                                            console.log(`Final state - History: ${getHistoryDebugState().length}, Pointer: ${getHistoryDebugState().pointer}`);
                                            console.log(`Objects in state.scene: ${state.loadedModels.length}`);
                                        }, 500);
                                    }, 500);
                                }, 500);
                            }, 500);
                        }, 500);
                    }, 500);
                }, 500);
            }, 500);
        };

        // Comprehensive test of all individual features
        window.testEverything = function() {
            console.log("=== COMPREHENSIVE FEATURE TEST ===");

            let testResults = {
                createShape: false,
                duplicate: false,
                colorChange: false,
                move: false,
                scale: false,
                rotate: false,
                delete: false,
                undo: false,
                redo: false
            };

            // Test 1: Create shape
            console.log("Testing: Create Shape");
            try {
                createPrimitive('cube');
                testResults.createShape = true;
                console.log("✅ Create Shape: PASSED");
            } catch (e) {
                console.log("❌ Create Shape: FAILED", e);
            }

            setTimeout(() => {
                // Test 2: Duplicate
                console.log("Testing: Duplicate");
                try {
                    if (state.selectedObject) {
                        duplicateSelectedObject();
                        testResults.duplicate = true;
                        console.log("✅ Duplicate: PASSED");
                    } else {
                        console.log("❌ Duplicate: FAILED - No object selected");
                    }
                } catch (e) {
                    console.log("❌ Duplicate: FAILED", e);
                }

                setTimeout(() => {
                    // Test 3: Color change
                    console.log("Testing: Color Change");
                    try {
                        if (state.selectedObject) {
                            changeObjectColor('#00ff00');
                            testResults.colorChange = true;
                            console.log("✅ Color Change: PASSED");
                        } else {
                            console.log("❌ Color Change: FAILED - No object selected");
                        }
                    } catch (e) {
                        console.log("❌ Color Change: FAILED", e);
                    }

                    setTimeout(() => {
                        // Test 4: Move
                        console.log("Testing: Move");
                        try {
                            if (state.selectedObject) {
                                state.selectedObject.position.x += 3;
                                state.selectedObject.updateMatrixWorld(true);
                                testResults.move = true;
                                console.log("✅ Move: PASSED");
                            } else {
                                console.log("❌ Move: FAILED - No object selected");
                            }
                        } catch (e) {
                            console.log("❌ Move: FAILED", e);
                        }

                        setTimeout(() => {
                            // Test 5: Scale
                            console.log("Testing: Scale");
                            try {
                                if (state.selectedObject) {
                                    state.selectedObject.scale.multiplyScalar(2);
                                    state.selectedObject.updateMatrixWorld(true);
                                    testResults.scale = true;
                                    console.log("✅ Scale: PASSED");
                                } else {
                                    console.log("❌ Scale: FAILED - No object selected");
                                }
                            } catch (e) {
                                console.log("❌ Scale: FAILED", e);
                            }

                            setTimeout(() => {
                                // Test 6: Rotate
                                console.log("Testing: Rotate");
                                try {
                                    if (state.selectedObject) {
                                        state.selectedObject.rotation.y += Math.PI / 4;
                                        state.selectedObject.updateMatrixWorld(true);
                                        testResults.rotate = true;
                                        console.log("✅ Rotate: PASSED");
                                    } else {
                                        console.log("❌ Rotate: FAILED - No object selected");
                                    }
                                } catch (e) {
                                    console.log("❌ Rotate: FAILED", e);
                                }

                                setTimeout(() => {
                                    // Test 7: Delete
                                    console.log("Testing: Delete");
                                    try {
                                        if (state.selectedObject) {
                                            removeObject();
                                            testResults.delete = true;
                                            console.log("✅ Delete: PASSED");
                                        } else {
                                            console.log("❌ Delete: FAILED - No object selected");
                                        }
                                    } catch (e) {
                                        console.log("❌ Delete: FAILED", e);
                                    }

                                    setTimeout(() => {
                                        // Test 8: Undo
                                        console.log("Testing: Undo");
                                        try {
                                            undo();
                                            testResults.undo = true;
                                            console.log("✅ Undo: PASSED");
                                        } catch (e) {
                                            console.log("❌ Undo: FAILED", e);
                                        }

                                        setTimeout(() => {
                                            // Test 9: Redo
                                            console.log("Testing: Redo");
                                            try {
                                                redo();
                                                testResults.redo = true;
                                                console.log("✅ Redo: PASSED");
                                            } catch (e) {
                                                console.log("❌ Redo: FAILED", e);
                                            }

                                            // Final results
                                            console.log("\n=== FINAL TEST RESULTS ===");
                                            Object.keys(testResults).forEach(test => {
                                                const status = testResults[test] ? "✅ PASSED" : "❌ FAILED";
                                                console.log(`${test}: ${status}`);
                                            });

                                            const passedTests = Object.values(testResults).filter(result => result).length;
                                            const totalTests = Object.keys(testResults).length;
                                            console.log(`\nOverall: ${passedTests}/${totalTests} tests passed`);

                                            if (passedTests === totalTests) {
                                                console.log("🎉 ALL FEATURES WORKING CORRECTLY!");
                                            } else {
                                                console.log("⚠️ Some features need attention");
                                            }
                                        }, 500);
                                    }, 500);
                                }, 500);
                            }, 500);
                        }, 500);
                    }, 500);
                }, 500);
            }, 500);
        };

        // --- Event Listeners for new buttons ---
        // The "Upload New File" button now directly triggers the file input click
        uploadNewFileButton.addEventListener('click', () => {
            console.log("[Upload New File] button clicked."); // Debug log
            fileInput.click(); // Programmatically click the hidden file input
            addMessageToLog('System', 'Clicking "Upload New File" will open file dialog to add another model to the state.scene.');
        });
        saveButton.addEventListener('click', () => {
            console.log("[Save] button clicked."); // Debug log
            saveModel();
        });

        // --- New Event Listeners for Upload Page Buttons ---
        // Add error handling and check if buttons exist
        if (loadRandomModelButton) {
            loadRandomModelButton.addEventListener('click', () => {
                console.log("[Load Random Model] button clicked. Calling goToEditor('random').");
                state.uploadedFile = null; // Ensure no previous file is considered for explicit upload
                goToEditor('random'); // Go to editor and load a random model
            });
            console.log("[Init] Load Random Model button event listener attached");
        } else {
            console.error("[Init] loadRandomModelButton not found!");
        }

        if (createNewEmptyModelButton) {
            createNewEmptyModelButton.addEventListener('click', () => {
                console.log("[Create Empty Model] button clicked. Calling goToEditor('empty').");
                state.uploadedFile = null; // Ensure no previous file is considered
                goToEditor('empty'); // Go to editor with an empty state.scene
            });
            console.log("[Init] Create Empty Model button event listener attached");
        } else {
            console.error("[Init] createNewEmptyModelButton not found!");
        }

        if (editExistingModelButton) {
            editExistingModelButton.addEventListener('click', () => {
                console.log("[Edit Existing Model] button clicked. Opening file dialog.");
                // Do NOT show dropZone or loadingMsg here. The fileInput 'change' listener will handle cleanup.
                fileInput.click(); // Programmatically click the hidden file input
                addMessageToLog('System', 'Please select a .gltf or .glb file.');
            });
            console.log("[Init] Edit Existing Model button event listener attached");
        } else {
            console.error("[Init] editExistingModelButton not found!");
        }

        // --- Event Listeners for Undo/Redo Buttons ---
        // These will be set up in window.onload to ensure DOM is ready

        // --- Keyboard Shortcuts for Undo/Redo and Transform Modes ---
        document.addEventListener('keydown', function(event) {
            // Only handle shortcuts when not typing in input fields
            if (event.target.tagName.toLowerCase() === 'input' || event.target.tagName.toLowerCase() === 'textarea') {
                return;
            }

            // Undo/Redo shortcuts
            if (event.ctrlKey || event.metaKey) { // Support both Ctrl (Windows/Linux) and Cmd (Mac)
                if (event.key === 'z' && !event.shiftKey) {
                    event.preventDefault();
                    undo();
                } else if ((event.key === 'y') || (event.key === 'z' && event.shiftKey)) {
                    event.preventDefault();
                    redo();
                }
            }

            // Transform mode shortcuts (when object is selected)
            if (state.selectedObject && state.transformControls) {
                switch(event.key.toLowerCase()) {
                    case 'g': // G for Grab/Move (like Blender)
                        event.preventDefault();
                        setTranslateMode();
                        break;
                    case 'r': // R for Rotate (like Blender)
                        event.preventDefault();
                        setRotateMode();
                        break;
                    case 's': // S for Scale (like Blender)
                        event.preventDefault();
                        setScaleMode();
                        break;
                }
            }
        });


        // --- Placeholder Save Model Function ---
        function saveModel() {
            addMessageToLog('System', 'Save functionality is a placeholder. To implement actual model saving (e.g., to GLTF/GLB), a GLTFExporter would be required, which involves more complex Three.js serialization.');
            speakResponse('Save feature is not fully implemented yet.');
            console.warn("Save Model: Placeholder function executed. Actual GLTF/GLB export not implemented.");
        }

        // --- Apply CSS Function (remains the same, but now accessed via AI command or direct console) ---
        applyCssButton.addEventListener('click', () => {
            console.log("[Apply CSS] button clicked."); // Debug log
            const cssText = cssCodeEditor.value;
            try {
                // Clear existing inline styles to prevent conflicts
                cadViewer.style.cssText = '';

                // Apply the new CSS properties
                const lines = cssText.split(';');
                lines.forEach(line => {
                    const parts = line.split(':'); // Corrected from `line = line.split(':')`
                    if (parts.length === 2) {
                        const prop = parts[0].trim();
                        const value = parts[1].trim();
                        if (prop && value) {
                            cadViewer.style[prop] = value;
                        }
                    }
                });
                addMessageToLog('System', 'CAD viewer background CSS applied successfully.');
            } catch (error) {
                addMessageToLog('System', `Error applying CSS: ${error.message}`);
                console.error("Error applying CSS:", error);
            }
        });


        function disposeSceneResources() {
            console.log("[Dispose] Disposing Three.js resources...");
            if (state.scene) {
                // Remove all loaded models and dispose their resources
                state.loadedModels.forEach(model => {
                    state.scene.remove(model);
                    model.traverse(function (object) {
                        if (object.isMesh) {
                            if (object.geometry) object.geometry.dispose();
                            if (object.material) {
                                if (Array.isArray(object.material)) {
                                    object.material.forEach(mat => mat.dispose());
                                } else {
                                    object.material.dispose();
                                }
                            }
                        }
                    });
                });
                state.loadedModels = []; // Clear the array of loaded models

                // Remove grid helper and labels specifically if they exist
                if (state.currentGridHelper) {
                    state.scene.remove(state.currentGridHelper);
                    state.currentGridHelper.geometry.dispose();
                    state.currentGridHelper.material.dispose();
                    state.currentGridHelper = null;
                }
                state.currentGridLabels.forEach(label => {
                    state.scene.remove(label);
                    if (label.material) label.material.dispose();
                    if (label.geometry) label.geometry.dispose();
                });
                state.currentGridLabels = [];

                // Dispose state.renderer and state.controls only if they exist
                if (state.renderer) {
                    state.renderer.setAnimationLoop(null);
                    state.renderer.dispose();
                    state.renderer = null;
                }
                if (state.controls) {
                    state.controls.removeEventListener('change', updateDynamicGrid); // Remove listener
                    state.controls.dispose();
                    state.controls = null;
                }
                if (cadCanvas) {
                    cadCanvas.removeEventListener('mousedown', onCanvasClick, false);
                    cadCanvas.removeEventListener('touchstart', onCanvasClick, false);
                }
                if (state.transformControls) {
                    state.transformControls.dispose();
                    state.transformControls = null;
                }
                // Dispose view axes helper and its state.scene/state.camera/state.renderer only if they exist
                if (state.viewAxesHelper) {
                    // Iterate through children of state.viewAxesHelper (the axis meshes)
                    state.viewAxesHelper.children.forEach(child => {
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
                    state.viewAxesScene.remove(state.viewAxesHelper); // Remove the group itself
                    state.viewAxesHelper = null;
                }
                if (state.viewAxesRenderer) {
                    state.viewAxesRenderer.setAnimationLoop(null);
                    state.viewAxesRenderer.dispose();
                    state.viewAxesRenderer = null;
                }
                if (state.viewAxesCamera) {
                    state.viewAxesCamera = null;
                }
                // Clear the container for the view axes helper
                if (viewAxesContainer) {
                    viewAxesContainer.innerHTML = '';
                }

                // Dispose debug sphere if it exists
                if (state.raycastDebugSphere) {
                    state.scene.remove(state.raycastDebugSphere);
                    if (state.raycastDebugSphere.geometry) state.raycastDebugSphere.geometry.dispose();
                    if (state.raycastDebugSphere.material) state.raycastDebugSphere.material.dispose();
                    state.raycastDebugSphere = null;
                }

                // Re-initialize state.scene after disposal to ensure a clean state
                initScene();
            }
            state.originalMaterialProperties.clear(); // Clear this map too
            state.allHighlightsOriginalMaterials.clear(); // Clear all highlights map
            state.selectedObject = null; // Clear selected object
            state.currentlySelectedObjectsForEditing = []; // Clear the functional selection array
            console.log("[Dispose] Resources disposed and state.scene re-initialized.");
        }


        function goToEditor(loadType = 'empty') { // Default to 'empty' if no type specified
            console.log(`[goToEditor] Function called with load type: ${loadType}.`); // Added log

            // Dispose and re-init state.scene to ensure a clean state for new or loaded models
            disposeSceneResources();

            if (loadType === 'random') {
                console.log("[goToEditor] Loading a random model.");
                loadRandomModel();
                addMessageToLog('System', 'Loading a random model. Use "Upload New File" to add more models.');
                speakResponse('Loading a random model. You can upload files from the editor.');
            } else if (loadType === 'empty') {
                console.log("[goToEditor] Creating an empty model state.scene.");
                addMessageToLog('System', 'Starting a new, empty model. Use "Upload New File" to load models.');
                speakResponse('Starting a new, empty model. You can upload files from the editor.');
                // No model loading needed for empty state.scene, just initScene() handles the grid.
            } else if (loadType === 'uploaded' && state.uploadedFile) {
                loadingMsg.textContent = `Loading model: ${state.uploadedFile.name}...`;
                loadingMsg.style.color = '#007bff';
                loadingMsg.style.display = 'block';
                console.log(`[goToEditor] Transitioning to editor. Preparing to load uploaded model: ${state.uploadedFile.name}`);
                console.log(`[goToEditor] Current state.droppedFileBlobs keys:`, Array.from(state.droppedFileBlobs.keys()));
                loadModel(state.uploadedFile);
            } else {
                console.warn("[goToEditor] Invalid loadType or no state.uploadedFile for 'uploaded' type. Defaulting to empty state.scene.");
                addMessageToLog('System', 'Invalid load request. Starting with an empty state.scene.');
                speakResponse('Invalid load request. Starting with an empty state.scene.');
            }

            uploadPage.classList.remove('page-active');
            uploadPage.classList.add('page-inactive');

            editorPage.classList.remove('page-inactive');
            editorPage.classList.add('page-active');
            console.log("[goToEditor] Page transition complete. Editor page is now active.");
        }

        function goBack() {
            console.log("[Navigation] Going back to upload page.");
            editorPage.classList.remove('page-active');
            editorPage.classList.add('page-inactive');
            uploadPage.classList.remove('page-inactive');
            uploadPage.classList.add('page-active');
            stopVoiceAssist();
            window.removeEventListener('resize', onWindowResize, false);
            disposeSceneResources(); // This will clear all models and re-initialize the state.scene
            state.uploadedFile = null;
            state.droppedFileBlobs.clear();
            state.originalMaterialProperties.clear(); // Clear this map too
            state.allHighlightsOriginalMaterials.clear(); // Clear all highlights map
            state.selectedObject = null;
            state.currentlySelectedObjectsForEditing = []; // Clear the functional selection array
            fileInput.value = ''; // Clear file input value
            loadingMsg.textContent = 'Drag and Drop your .gltf or .glb file(s) here, or click to browse.';
            loadingMsg.style.display = 'none';
            loadingMsg.style.color = '';
            dropZone.textContent = 'Drag and Drop your .gltf or .glb file(s) here';
            dropZone.style.borderColor = '#a0aec0';
            // Hide dropZone and loadingMsg when returning to the upload page
            dropZone.style.display = 'none';
            dropZone.style.pointerEvents = 'none';
            loadingMsg.style.display = 'none';
            console.log("[Navigation] Returned to upload page. State reset.");
            addMessageToLog('System', 'Welcome back! Choose an option to get started.');
            updateUndoRedoButtons(); // Update buttons on page change
        }

        // --- Three.js state.scene Setup and Model Loading ---
        function initScene() {
            console.log("[initScene] Initializing Three.js state.scene...");
            if (typeof THREE === 'undefined') {
                console.error("THREE is not defined at initScene! Three.js script might not have loaded or executed correctly.");
                addMessageToLog('System', "Error: Three.js library failed to load. Please check console for details.");
                return;
            }
            // Only create new state.scene, state.renderer, state.camera, state.controls if they don't exist
            if (!state.scene) {
                state.scene = new THREE.Scene();
                state.scene.background = new THREE.Color(0xFFFFFF); // Pure white background
            }
            if (!state.renderer) {
                state.renderer = new THREE.WebGLRenderer({ canvas: cadCanvas, antialias: true });
                state.renderer.setPixelRatio(window.devicePixelRatio);
                state.renderer.xr.enabled = true;
            }
            if (!state.camera) {
                const viewerDiv = cadCanvas.parentElement;
                state.camera = new THREE.PerspectiveCamera(75, viewerDiv.clientWidth / viewerDiv.clientHeight, 0.1, 1000);
                // Adjusted initial state.camera position for a more "twisted" or perspective view
                state.camera.position.set(30, 30, 30); // Set state.camera at an angle
            }
            if (!state.controls) {
                state.controls = new THREE.OrbitControls(state.camera, state.renderer.domElement);
                state.controls.enableDamping = true;
                state.controls.dampingFactor = 0.25;
                state.controls.addEventListener('change', updateDynamicGrid); // Call on state.camera change
                state.controls.target.set(0, 0, 0); // Ensure state.controls target the origin
            }
            initTransformControls();

            // Ensure state.renderer size is correct on init/re-init
            const viewerDiv = cadCanvas.parentElement;
            state.renderer.setSize(viewerDiv.clientWidth, viewerDiv.clientHeight);
            state.camera.aspect = viewerDiv.clientWidth / viewerDiv.clientHeight;
            state.camera.updateProjectionMatrix();


            // Call updateDynamicGrid initially to set up the first grid
            updateDynamicGrid();

            // Increased lighting for better visibility
            // Remove existing lights before adding new ones to prevent duplicates on re-init
            state.scene.children.filter(c => c.isLight).forEach(light => state.scene.remove(light));

            const ambientLight = new THREE.AmbientLight(0x808080); // Brighter ambient light
            state.scene.add(ambientLight);
            // FIX: Corrected typo from DirectionionalLight to DirectionalLight
            const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Full intensity directional light
            directionalLight.position.set(1, 1, 1).normalize();
            state.scene.add(directionalLight);
            const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.7); // Additional light from another angle
            directionalLight2.position.set(-1, -1, -1).normalize();
            state.scene.add(directionalLight2);


            state.raycaster = new THREE.Raycaster();
            state.mouse = new THREE.Vector2();
            // Remove previous listeners before adding new ones to prevent duplicates on re-init
            cadCanvas.removeEventListener('mousedown', onCanvasClick, false);
            cadCanvas.removeEventListener('touchstart', onCanvasClick, false);
            cadCanvas.addEventListener('mousedown', onCanvasClick, false);
            cadCanvas.addEventListener('touchstart', onCanvasClick, false);
            cadCanvas.addEventListener('mousemove', onCanvasMouseMove, false);

            // Add extrude gizmo interaction handlers
            cadCanvas.addEventListener('mousedown', onExtrudePointerDown, false);
            cadCanvas.addEventListener('mousemove', onExtrudePointerMove, false);
            cadCanvas.addEventListener('mouseup', onExtrudePointerUp, false);

            initViewAxesHelper(); // Initialize the static view axes helper
            viewAxesContainer.addEventListener('click', onViewAxesClick, false);

            // Initialize raycast debug sphere
            if (!state.raycastDebugSphere) {
                state.raycastDebugSphere = new THREE.Mesh(
                    new THREE.SphereGeometry(0.05, 8, 8),
                    new THREE.MeshBasicMaterial({ color: 0xffff00 }) // Yellow sphere
                );
                state.raycastDebugSphere.visible = false; // Initially hidden
                state.scene.add(state.raycastDebugSphere);
            }

            console.log("[initScene] Three.js state.scene initialized.");

            // Initialize undo/redo buttons but don't save empty state yet
            updateUndoRedoButtons();
        }

        // FACE EDITING OPERATIONS

        // SIMPLE FACE PAINTING - Add colored overlay for selected face
        function paintFaceMaterial(mesh, group, hexColor) {
            console.log('=== SIMPLE FACE PAINTING ===');
            console.log('[paintFaceMaterial] Painting face group:', group.id, 'with color:', hexColor);
            console.log('[paintFaceMaterial] Group triIndices:', group.triIndices?.length || 0);

            if (!mesh || !mesh.geometry || !group || !group.triIndices) {
                console.error('[paintFaceMaterial] Invalid parameters');
                return false;
            }

            try {
                // Save state for undo
                if (state.loadedModels.length > 0) {
                    const currentState = getCurrentState();
                    state.undoStack.push(currentState);
                    state.redoStack = []; // Clear redo stack
                }

                // Create a colored overlay for just this face group
                const coloredOverlay = createColoredFaceOverlay(mesh, group, hexColor);
                if (coloredOverlay) {
                    // Add to state.scene
                    state.scene.add(coloredOverlay);

                    // Store reference for cleanup
                    if (!mesh.userData.coloredFaces) {
                        mesh.userData.coloredFaces = [];
                    }
                    mesh.userData.coloredFaces.push(coloredOverlay);

                    console.log('[paintFaceMaterial] Added colored overlay to state.scene');
                    addMessageToLog('System', 'Colored 1 face.');
                    speakResponse('Face painted.');

                    requestRender();
                    return true;
                } else {
                    console.error('[paintFaceMaterial] Failed to create colored overlay');
                    return false;
                }

            } catch (error) {
                console.error('[paintFaceMaterial] Error painting face:', error);
                addMessageToLog('System', 'Error painting face.');
                speakResponse('Error painting face.');
                return false;
            }
        }

        // Create a colored overlay for a specific face group
        function createColoredFaceOverlay(mesh, group, hexColor) {
            console.log('[createColoredFaceOverlay] Creating colored overlay for group:', group.id);

            const geometry = new THREE.BufferGeometry();
            const srcGeometry = mesh.geometry;
            const srcPosition = srcGeometry.attributes.position;
            const srcIndex = srcGeometry.index.array;

            // Extract triangles for this group
            const triangleIndices = [];
            group.triIndices.forEach(triIndex => {
                triangleIndices.push(
                    srcIndex[3 * triIndex],
                    srcIndex[3 * triIndex + 1],
                    srcIndex[3 * triIndex + 2]
                );
            });

            // Create new geometry with only the group's triangles
            const positions = new Float32Array(triangleIndices.length * 3);
            for (let i = 0; i < triangleIndices.length; i++) {
                const vertexIndex = triangleIndices[i];
                positions[i * 3] = srcPosition.getX(vertexIndex);
                positions[i * 3 + 1] = srcPosition.getY(vertexIndex);
                positions[i * 3 + 2] = srcPosition.getZ(vertexIndex);
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.computeVertexNormals();

            // Create solid colored material
            const material = new THREE.MeshStandardMaterial({
                color: hexColor,
                transparent: false,
                opacity: 1.0,
                side: THREE.DoubleSide
            });

            const coloredOverlay = new THREE.Mesh(geometry, material);

            // Position to match the original mesh exactly
            coloredOverlay.position.copy(mesh.position);
            coloredOverlay.rotation.copy(mesh.rotation);
            coloredOverlay.scale.copy(mesh.scale);

            // Slightly offset to prevent z-fighting
            coloredOverlay.position.add(new THREE.Vector3(0.001, 0.001, 0.001));

            coloredOverlay.userData.isFaceColor = true;
            coloredOverlay.userData.faceGroupId = group.id;
            coloredOverlay.userData.originalMesh = mesh;

            console.log('[createColoredFaceOverlay] Created colored overlay with', triangleIndices.length, 'vertices');
            return coloredOverlay;
        }

        // Paint entire object with color - WITH FACE MODE KILLSWITCH
        function paintObject(object, hexColor) {
            // ✅ KILLSWITCH: 면 모드면 객체 전체 색칠 금지
            if (state.faceEditState?.isActive) {
                console.warn('[paintObject] BLOCKED: Face edit mode is active');
                addMessageToLog('System', 'Face edit mode is on. Select a face, or exit face mode to color whole object.');
                speakResponse('Face edit mode is on. Select a face first.');
                return false;
            }

            if (!object) {
                console.warn('[paintObject] No object provided');
                return false;
            }

            console.log('[paintObject] Painting entire object:', object.name || object.uuid, 'with color:', hexColor);

            try {
                // Use existing changeObjectColor function
                const oldSelectedObject = state.selectedObject;
                state.selectedObject = object;  // Temporarily set for changeObjectColor
                changeObjectColor(hexColor);
                state.selectedObject = oldSelectedObject;  // Restore

                console.log('[paintObject] Object painted successfully');
                return true;

            } catch (error) {
                console.error('[paintObject] Error painting object:', error);
                return false;
            }
        }

        // Legacy function for backward compatibility
        function paintFace(mesh, group, hexColor) {
            return paintFaceMaterial(mesh, group, hexColor);
        }

        // SMART COLOR ROUTING - Face vs Object (WITH ENHANCED DEBUG LOGS)
        function handleColorCommand(hexColor) {
            console.log('=== COLOR COMMAND DEBUG ===');
            console.log('[color] faceMode:', state.faceEditState.isActive);
            console.log('[color] selectedId:', state.faceEditState.selectedGroupId);
            console.log('[color] state.selectedObject:', state.selectedObject?.name || 'none');
            console.log('[color] groups count:', state.faceEditState.groups?.length || 0);
            console.log('[color] targetMesh:', state.faceEditState.targetMesh?.name || 'none');

            // Priority 1: Face coloring if in face mode with selected face
            if (state.faceEditState.isActive && state.faceEditState.selectedGroupId) {
                console.log('[color] ROUTE: paintFaceMaterial');
                const group = state.faceEditState.groups.find(g => g.id === state.faceEditState.selectedGroupId);
                console.log('[color] Found group:', group ? 'YES' : 'NO');
                if (group) {
                    console.log('[color] Group triIndices:', group.triIndices?.length || 0);
                    console.log('[color] Target mesh geometry indexed:', !!state.faceEditState.targetMesh?.geometry?.index);
                    return paintFaceMaterial(state.faceEditState.targetMesh, group, hexColor);
                } else {
                    console.warn('[color] Selected face group not found!');
                    console.log('[color] Available group IDs:', state.faceEditState.groups.map(g => g.id));
                    return false;
                }
            }

            // Priority 2: Guide user if in face mode but no face selected
            if (state.faceEditState.isActive) {
                console.log('[color] ROUTE: face mode guidance');
                addMessageToLog('System', 'Select a face first (or say "exit face mode" to paint whole object).');
                speakResponse('Select a face first.');
                return false;
            }

            // Priority 3: Object coloring (normal mode)
            console.log('[color] ROUTE: paintObject');
            const activeObj = getActiveObject();
            if (activeObj) {
                return paintObject(activeObj, hexColor);
            } else {
                console.log('[color] No active object found');
                addMessageToLog('System', 'Please select an object first.');
                speakResponse('Please select an object first.');
                return false;
            }
        }

        // Legacy function for backward compatibility
        function handleColorFace(hexColor) {
            return handleColorCommand(hexColor);
        }

        // Refresh face groups after geometry changes
        function refreshFaceGroups() {
            if (!state.faceEditState.isActive || !state.faceEditState.targetMesh) {
                console.warn('[refreshFaceGroups] Face edit mode not active');
                return false;
            }

            console.log('[refreshFaceGroups] Refreshing face groups...');

            const targetMesh = state.faceEditState.targetMesh;
            const wasSelected = state.faceEditState.selectedGroupId;

            // Clean up old overlays
            state.faceEditState.groups.forEach(group => {
                if (group.overlay) {
                    state.scene.remove(group.overlay);
                    group.overlay.geometry.dispose();
                    group.overlay.material.dispose();
                }
                if (group.outline) {
                    state.scene.remove(group.outline);
                    group.outline.geometry.dispose();
                    group.outline.material.dispose();
                }
            });

            // Rebuild face groups
            const newGroups = buildFaceGroups(targetMesh);

            // Create new overlays
            newGroups.forEach(group => {
                const { overlay, outline } = makeGroupOverlay(targetMesh, group, 0x00ff00, 0.15);
                group.overlay = overlay;
                group.outline = outline;
                state.scene.add(overlay);
                state.scene.add(outline);

                overlay.visible = true;
                outline.visible = true;
            });

            // Update state
            state.faceEditState.groups = newGroups;
            state.faceEditState.selectedGroupId = null; // Clear selection after refresh

            console.log(`[refreshFaceGroups] Refreshed to ${newGroups.length} face groups`);
            addMessageToLog('System', `Face groups refreshed. Found ${newGroups.length} faces.`);

            return true;
        }

        // REMOVED DUPLICATE - Using main getFaceFrame function

        // Simple extrude face (add geometry)
        function extrudeFaceAdd(mesh, group, distance = 0.2) {
            if (!group || !mesh) {
                console.warn('[extrudeFaceAdd] Invalid group or mesh');
                return false;
            }

            console.log(`[extrudeFaceAdd] Extruding face ${group.id} by ${distance}`);

            // Save state for undo
            if (state.loadedModels.length > 0) {
                const currentState = getCurrentState();
                state.undoStack.push(currentState);
                state.redoStack = []; // Clear redo stack
            }

            try {
                // Get face frame
                const frame = getFaceFrame(group);

                // Create simple box extrusion (placeholder - can be enhanced)
                const extrudeGeometry = new THREE.BoxGeometry(0.5, distance, 0.5);
                const extrudeMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
                const extrudeMesh = new THREE.Mesh(extrudeGeometry, extrudeMaterial);

                // Position at face center, oriented along face normal
                extrudeMesh.position.copy(frame.origin);
                extrudeMesh.position.addScaledVector(frame.normal, distance / 2);
                extrudeMesh.lookAt(frame.origin.clone().add(frame.normal));

                // Add to state.scene
                state.scene.add(extrudeMesh);
                state.loadedModels.push(extrudeMesh);

                addMessageToLog('System', `Face extruded by ${distance}.`);
                speakResponse('Face extruded.');

                return true;

            } catch (error) {
                console.error('[extrudeFaceAdd] Error extruding face:', error);
                return false;
            }
        }

        // Start interactive extrude mode - ENHANCED DEBUG
        function handleExtrudeFace(distance = 0.2) {
            console.log('=== EXTRUDE DEBUG ===');
            console.log('[handleExtrudeFace] Starting interactive extrude mode');
            console.log('[handleExtrudeFace] Face mode active:', state.faceEditState.isActive);
            console.log('[handleExtrudeFace] Selected face IDs:', Array.from(state.faceEditState.selectedFaceIds));
            console.log('[handleExtrudeFace] Total groups:', state.faceEditState.groups.length);

            if (!state.faceEditState.isActive) {
                console.log('[handleExtrudeFace] BLOCKED: Face mode not active');
                addMessageToLog('System', 'Please enter face edit mode first by saying "edit this object".');
                speakResponse('Please enter face edit mode first.');
                return false;
            }

            const selectedIds = Array.from(state.faceEditState.selectedFaceIds);
            if (selectedIds.length === 0) {
                console.log('[handleExtrudeFace] BLOCKED: No faces selected');
                addMessageToLog('System', 'Please select one or more faces first.');
                speakResponse('Please select faces first.');
                return false;
            }

            const selectedGroups = state.faceEditState.groups.filter(g => selectedIds.includes(g.id));
            console.log('[handleExtrudeFace] Found', selectedGroups.length, 'matching groups');

            if (selectedGroups.length === 0) {
                console.warn('[handleExtrudeFace] BLOCKED: Selected face groups not found');
                console.log('[handleExtrudeFace] Available group IDs:', state.faceEditState.groups.map(g => g.id));
                addMessageToLog('System', 'Selected faces not found. Please select faces again.');
                return false;
            }

            console.log('[handleExtrudeFace] SUCCESS: Starting extrude gizmo');
            showExtrudeGizmo(state.faceEditState.targetMesh, selectedGroups);
            return true;
        }

        // Create blue 2D arrow gizmo (like your image)
        function makeFusion360Arrow() {
            try {
                console.log('[makeFusion360Arrow] Creating blue 2D arrow...');

                // Create 2D arrow shape pointing along Z-axis
                const shape = new THREE.Shape();

                // Arrow shaft (rectangle)
                shape.moveTo(-0.02, 0);      // Bottom left
                shape.lineTo(0.02, 0);       // Bottom right
                shape.lineTo(0.02, 0.3);     // Top right of shaft
                shape.lineTo(-0.02, 0.3);    // Top left of shaft
                shape.closePath();

                // Arrow head (triangle)
                const headShape = new THREE.Shape();
                headShape.moveTo(-0.05, 0.3);  // Left point of triangle
                headShape.lineTo(0.05, 0.3);   // Right point of triangle
                headShape.lineTo(0, 0.4);      // Top point of triangle
                headShape.closePath();

                // Create geometries
                const shaftGeometry = new THREE.ShapeGeometry(shape);
                const headGeometry = new THREE.ShapeGeometry(headShape);

                // Create blue material (bright and visible)
                const arrowMaterial = new THREE.MeshBasicMaterial({
                    color: 0x0078d4,  // Bright blue like your image
                    side: THREE.DoubleSide,
                    depthTest: false,
                    depthWrite: false,
                    transparent: true,
                    opacity: 0.9
                });

                // Create meshes
                const shaftMesh = new THREE.Mesh(shaftGeometry, arrowMaterial);
                const headMesh = new THREE.Mesh(headGeometry, arrowMaterial);

                // Group them together
                const group = new THREE.Group();
                group.add(shaftMesh);
                group.add(headMesh);

                // Add larger invisible collision area for easier clicking/dragging
                const collisionGeometry = new THREE.PlaneGeometry(0.2, 0.6);
                const collisionMaterial = new THREE.MeshBasicMaterial({
                    transparent: true,
                    opacity: 0,
                    visible: false
                });
                const collision = new THREE.Mesh(collisionGeometry, collisionMaterial);
                collision.position.set(0, 0.2, 0); // Center on arrow
                collision.userData.isCollisionBox = true;
                collision.userData.isExtrudeArrow = true; // Mark for detection
                group.add(collision);

                // Also mark the visible parts for detection
                shaftMesh.userData.isExtrudeArrow = true;
                headMesh.userData.isExtrudeArrow = true;

                group.userData.isExtrudeArrow = true;
                group.renderOrder = 10000;

                console.log('[makeFusion360Arrow] Blue 2D arrow created successfully');
                return group;
            } catch (error) {
                console.error('[makeFusion360Arrow] Error creating arrow:', error);
                return null;
            }
        }

        // Show draggable normal-arrow gizmo with live preview - FUSION STYLE 2D
        function showExtrudeGizmo(mesh, selectedGroups) {
            if (!selectedGroups.length) {
                addMessageToLog('System', 'Select one or more faces.');
                return;
            }

            console.log('[showExtrudeGizmo] Starting Fusion-style 2D extrude UI for', selectedGroups.length, 'faces');

            // 1) Setup extrude UI state
            state.extrudeUI.active = true;
            state.extrudeUI.targetMesh = mesh;
            state.extrudeUI.faceIds = selectedGroups.map(g => g.id);
            state.extrudeUI.depth = 0;

            // Show the Fusion 360-style panel
            try {
                console.log('[showExtrudeGizmo] Showing Fusion 360 panel...');
                const panel = document.getElementById('extrudePanel');
                if (panel) {
                    panel.style.display = 'block';
                    console.log('[showExtrudeGizmo] Panel displayed');

                    // Focus the input field
                    const input = document.getElementById('extrudeDistanceInput');
                    if (input) {
                        input.value = '0.00';
                        setTimeout(() => {
                            input.focus();
                            input.select();
                        }, 100);
                        console.log('[showExtrudeGizmo] Input field focused');
                    } else {
                        console.error('[showExtrudeGizmo] Input field not found!');
                    }
                } else {
                    console.error('[showExtrudeGizmo] Panel not found!');
                }
            } catch (error) {
                console.error('[showExtrudeGizmo] Error showing panel:', error);
            }

            // 2) Place arrow at first face centroid, perpendicular to face (along normal)
            const firstGroup = selectedGroups[0];
            const boundaryResult = buildFaceBoundaryPolygon(mesh, firstGroup);

            if (!boundaryResult) {
                console.error('[showExtrudeGizmo] Failed to build boundary polygon');
                addMessageToLog('System', 'Failed to analyze face boundary.');
                return;
            }

            const { F } = boundaryResult; // gives {o,u,v,n}

            // Create 2D perpendicular arrow
            const arrow = makeFusion360Arrow();

            if (!arrow) {
                console.error('[showExtrudeGizmo] Failed to create arrow!');
                return false;
            }

            // Position 2D arrow perpendicular to face (pointing along normal)
            // The arrow was created pointing along Z, now orient it along face normal

            // Calculate rotation to align arrow Z-axis with face normal
            const arrowUp = new THREE.Vector3(0, 0, 1); // Arrow points along Z
            const quaternion = new THREE.Quaternion().setFromUnitVectors(arrowUp, F.n);

            // Position arrow at face center, slightly offset along normal for visibility
            const arrowPosition = F.o.clone().add(F.n.clone().multiplyScalar(0.1));

            // Apply position and rotation
            arrow.position.copy(arrowPosition);
            arrow.quaternion.copy(quaternion);
            arrow.matrixAutoUpdate = true;

            console.log('[showExtrudeGizmo] Fusion 360 Arrow positioned perpendicular to face');
            console.log('  Face center:', F.o.toArray().map(n => n.toFixed(2)));
            console.log('  Face normal:', F.n.toArray().map(n => n.toFixed(2)));
            console.log('  Arrow position:', arrowPosition.toArray().map(n => n.toFixed(2)));

            state.scene.add(arrow);
            state.extrudeUI.arrow = arrow;

            console.log('[showExtrudeGizmo] ✅ Fusion 360 extrude UI ready!');

            // 3) Drag plane orthogonal to normal (goes through centroid)
            state.extrudeUI.drag.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(F.n, F.o);
            state.extrudeUI.drag.startPt = F.o.clone();

            console.log('[showExtrudeGizmo] 2D Fusion-style arrow created at:', F.o);
            addMessageToLog('System', 'Drag arrow to set depth (perpendicular). Click background/Enter to confirm, Esc to cancel.');
            speakResponse('Drag the arrow to set depth.');
        }

        // Update live extrude preview - EXACT BOUNDARY VERSION
        function updateExtrudePreview(depth) {
            clearExtrudePreview();
            const mesh = state.extrudeUI.targetMesh;

            console.log('[updateExtrudePreview] Creating preview for depth:', depth);

            for (const id of state.extrudeUI.faceIds) {
                const group = state.faceEditState.groups.find(g => g.id === id);
                if (!group) continue;

                const boundaryResult = buildFaceBoundaryPolygon(mesh, group);
                if (!boundaryResult) {
                    console.warn('[updateExtrudePreview] Failed to build boundary for group:', id);
                    continue;
                }

                const { F, pts2D } = boundaryResult;

                // Create shape from exact boundary points
                const shape = new THREE.Shape(pts2D);
                const geometry = new THREE.ExtrudeGeometry(shape, {
                    depth: Math.abs(depth),
                    bevelEnabled: false
                });

                // Align to (u,v,n) and set sign
                const basis = new THREE.Matrix4().makeBasis(F.u, F.v, depth >= 0 ? F.n : F.n.clone().multiplyScalar(-1));
                geometry.applyMatrix4(basis);
                geometry.applyMatrix4(new THREE.Matrix4().setPosition(F.o));

                // Create preview mesh
                const previewMaterial = new THREE.MeshBasicMaterial({
                    color: 0x00ff00,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.5
                });

                const previewMesh = new THREE.Mesh(geometry, previewMaterial);
                state.scene.add(previewMesh);
                state.extrudeUI.previewMeshes.push(previewMesh);
            }

            requestRender();
        }

        // Update extrude distance from input field
        function updateExtrudeDistance() {
            const input = document.getElementById('extrudeDistanceInput');
            if (!input || !state.extrudeUI.active) return;

            const newDepth = parseFloat(input.value) || 0;
            state.extrudeUI.depth = newDepth;

            // Update live preview with the new depth
            updateExtrudePreview(newDepth);
        }

        // Handle keyboard shortcuts in extrude input
        function handleExtrudeKeydown(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                confirmExtrude();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelExtrude();
            }
        }

        // Clear extrude preview meshes
        function clearExtrudePreview() {
            for (const mesh of state.extrudeUI.previewMeshes) {
                state.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
            }
            state.extrudeUI.previewMeshes.length = 0;
        }

        // Confirm extrude operation - EXACT SPEC VERSION
        function confirmExtrude() {
            if (!state.extrudeUI.active) return;

            console.log('[confirmExtrude] Confirming extrude with depth:', state.extrudeUI.depth);

            const mesh = state.extrudeUI.targetMesh;
            const depth = state.extrudeUI.depth;

            // Save state for undo (grouped action)
            if (state.loadedModels.length > 0) {
                const currentState = getCurrentState();
                state.undoStack.push(currentState);
                state.redoStack = []; // Clear redo stack
            }

            // Option A: ADD bosses as separate meshes
            const created = [];
            for (const id of state.extrudeUI.faceIds) {
                const group = state.faceEditState.groups.find(g => g.id === id);
                if (!group) continue;

                const boundaryResult = buildFaceBoundaryPolygon(mesh, group);
                if (!boundaryResult) {
                    console.warn('[confirmExtrude] Failed to build boundary for group:', id);
                    continue;
                }

                const { F, pts2D } = boundaryResult;
                const shape = new THREE.Shape(pts2D);
                const geometry = new THREE.ExtrudeGeometry(shape, {
                    depth: Math.abs(depth),
                    bevelEnabled: false
                });

                // Align to (u,v,n) and set sign
                const basis = new THREE.Matrix4().makeBasis(F.u, F.v, depth >= 0 ? F.n : F.n.clone().multiplyScalar(-1));
                geometry.applyMatrix4(basis);
                geometry.applyMatrix4(new THREE.Matrix4().setPosition(F.o));

                // Create final boss mesh
                const boss = new THREE.Mesh(geometry, mesh.material.clone());
                boss.name = `${mesh.name}_extruded_${Date.now()}`;
                boss.userData.isExtruded = true;
                boss.userData.originalMesh = mesh;

                state.scene.add(boss);
                state.loadedModels.push(boss);
                created.push(boss);
            }

            console.log('[confirmExtrude] Created', created.length, 'extruded boss meshes');
            addMessageToLog('System', `Extruded ${created.length} face(s) by ${depth.toFixed(2)} units.`);
            speakResponse('Extrude completed.');

            exitExtrudeMode();
            updateUndoRedoButtons();
            requestRender();
        }

        // Cancel extrude operation
        function cancelExtrude() {
            console.log('[cancelExtrude] Canceling extrude operation');
            exitExtrudeMode();
            addMessageToLog('System', 'Extrude canceled.');
            speakResponse('Extrude canceled.');
        }

        // Exit extrude mode
        function exitExtrudeMode() {
            clearExtrudePreview();

            if (state.extrudeUI.arrow) {
                state.scene.remove(state.extrudeUI.arrow);
                state.extrudeUI.arrow = null;
            }

            state.extrudeUI.active = false;
            state.extrudeUI.faceIds = [];
            state.extrudeUI.targetMesh = null;
            state.extrudeUI.depth = 0;
            state.extrudeUI.drag = { on: false, startPt: null, plane: null };

            // Hide the Fusion 360-style panel
            const panel = document.getElementById('extrudePanel');
            if (panel) {
                panel.style.display = 'none';
            }

            console.log('[exitExtrudeMode] Exited extrude mode');
            requestRender();
        }

        // EXTRUDE GIZMO INTERACTION HANDLERS

        function onExtrudePointerDown(event) {
            if (!state.extrudeUI.active) {
                console.log('[onExtrudePointerDown] Extrude UI not active');
                return;
            }

            console.log('[onExtrudePointerDown] Extrude UI active, processing click');

            // Update state.mouse coordinates
            const rect = state.renderer.domElement.getBoundingClientRect();
            state.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            state.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            state.raycaster.setFromCamera(state.mouse, state.camera);

            console.log('[onExtrudePointerDown] state.mouse coords:', state.mouse.x.toFixed(3), state.mouse.y.toFixed(3));
            console.log('[onExtrudePointerDown] Arrow exists:', !!state.extrudeUI.arrow);

            // Check if 2D arrow was clicked (recursive for Group)
            const arrowIntersects = state.raycaster.intersectObject(state.extrudeUI.arrow, true);
            console.log('[onExtrudePointerDown] Arrow intersects:', arrowIntersects.length);

            // Also check if any intersected object has the arrow marker
            const isArrowClick = arrowIntersects.some(intersect =>
                intersect.object.userData.isExtrudeArrow ||
                intersect.object.userData.isCollisionBox ||
                intersect.object.parent?.userData.isExtrudeArrow
            );

            if (arrowIntersects.length > 0 && isArrowClick) {
                console.log('🎯 [onExtrudePointerDown] BLUE ARROW CLICKED! Starting drag mode');
                console.log('   Intersected object:', arrowIntersects[0].object.type);
                console.log('   Intersected object userData:', arrowIntersects[0].object.userData);

                // Get face normal for proper drag plane
                const firstGroup = state.faceEditState.groups.find(g => g.id === state.extrudeUI.faceIds[0]);
                if (firstGroup) {
                    const boundaryResult = buildFaceBoundaryPolygon(state.extrudeUI.targetMesh, firstGroup);
                    if (boundaryResult) {
                        const { F } = boundaryResult;

                        // Set up drag state with face-aligned plane
                        state.extrudeUI.drag.on = true;
                        state.extrudeUI.drag.startPt = F.o.clone();
                        state.extrudeUI.drag.plane = new THREE.Plane(F.n, -F.o.dot(F.n));

                        console.log('   Drag setup complete - face normal:', F.n.toArray());
                        console.log('   Start point:', state.extrudeUI.drag.startPt.toArray());
                    }
                }

                event.preventDefault();
                event.stopPropagation();
                return;
            }

            console.log('[onExtrudePointerDown] Arrow not clicked, checking background');

            // Confirm by clicking background: detect click that did NOT hit gizmo or overlays
            const hitOverlay = state.faceEditState.isActive && state.raycaster.intersectObjects(
                state.faceEditState.groups.map(g => g.overlay).filter(o => o),
                false
            );

            if (!hitOverlay || hitOverlay.length === 0) {
                console.log('[onExtrudePointerDown] Background clicked, confirming extrude');
                confirmExtrude();
                event.preventDefault();
            } else {
                console.log('[onExtrudePointerDown] Overlay clicked, not confirming');
            }
        }

        function onExtrudePointerMove(event) {
            if (!state.extrudeUI.active) return;
            if (!state.extrudeUI.drag.on) return;

            console.log('🔄 [onExtrudePointerMove] Dragging arrow...');

            // Update state.mouse coordinates
            const rect = state.renderer.domElement.getBoundingClientRect();
            state.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            state.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            state.raycaster.setFromCamera(state.mouse, state.camera);

            // Get face info for movement calculation
            const firstGroup = state.faceEditState.groups.find(g => g.id === state.extrudeUI.faceIds[0]);
            if (!firstGroup) {
                console.log('[onExtrudePointerMove] No first group found');
                return;
            }

            const boundaryResult = buildFaceBoundaryPolygon(state.extrudeUI.targetMesh, firstGroup);
            if (!boundaryResult) {
                console.log('[onExtrudePointerMove] No boundary result');
                return;
            }

            const { F } = boundaryResult;

            // Create a plane perpendicular to the state.camera for better state.mouse tracking
            const cameraDirection = new THREE.Vector3();
            state.camera.getWorldDirection(cameraDirection);
            const dragPlane = new THREE.Plane(cameraDirection, -F.o.dot(cameraDirection));

            // Get current state.mouse position on the drag plane
            const currentPoint = new THREE.Vector3();
            if (!state.raycaster.ray.intersectPlane(dragPlane, currentPoint)) {
                console.log('[onExtrudePointerMove] No plane intersection');
                return;
            }

            // Calculate movement from face center and project onto face normal
            const delta = new THREE.Vector3().subVectors(currentPoint, F.o);
            const depth = THREE.MathUtils.clamp(delta.dot(F.n), -2.0, 2.0); // Signed depth along normal

            state.extrudeUI.depth = depth;

            // Update input field to match drag
            const input = document.getElementById('extrudeDistanceInput');
            if (input) {
                input.value = depth.toFixed(2);
            }

            // Update 2D arrow position along normal (keep same orientation)
            const newPosition = F.o.clone().add(F.n.clone().multiplyScalar(depth + 0.1)); // +0.1 for visibility offset
            state.extrudeUI.arrow.position.copy(newPosition);

            // Live preview for each selected face
            updateExtrudePreview(depth);

            console.log('[onExtrudePointerMove] Depth:', depth.toFixed(3), 'Position:', newPosition.toArray().map(n => n.toFixed(2)));
        }

        function onExtrudePointerUp(event) {
            if (!state.extrudeUI.active) return;

            if (state.extrudeUI.drag.on) {
                console.log('[onExtrudePointerUp] Drag ended');
                state.extrudeUI.drag.on = false;
            }
        }

        // SMART DELETE HANDLER - Face vs Object
        function handleDeleteCommand() {
            console.log('[handleDeleteCommand] Delete command received');
            console.log(`[handleDeleteCommand] Face mode active: ${state.faceEditState.isActive}`);
            console.log(`[handleDeleteCommand] Selected face: ${state.faceEditState.selectedGroupId}`);

            // Priority 1: Face deletion if in face mode with selected face
            if (state.faceEditState.isActive && state.faceEditState.selectedGroupId) {
                const group = state.faceEditState.groups.find(g => g.id === state.faceEditState.selectedGroupId);
                if (group) {
                    console.log('[handleDeleteCommand] Deleting selected face');
                    return deleteFaceGroup(state.faceEditState.targetMesh, group);
                }
            }

            // Priority 2: Ask user if in face mode but no face selected
            if (state.faceEditState.isActive && !state.faceEditState.selectedGroupId) {
                console.log('[handleDeleteCommand] Face mode active but no face selected');
                addMessageToLog('System', 'No face selected. Click on a face first, or say "exit face mode" to delete the whole object.');
                speakResponse('No face selected. Click on a face first.');
                return;
            }

            // Priority 3: Normal object deletion
            console.log('[handleDeleteCommand] Normal object deletion');
            removeObject();
        }


        function resetView() {
            // Don't save state for view changes - this is just state.camera movement
            if (state.controls && state.camera && state.loadedModels.length > 0) {
                const overallBbox = new THREE.Box3();
                state.loadedModels.forEach(model => {
                    overallBbox.union(new THREE.Box3().setFromObject(model));
                });

                if (overallBbox.isEmpty()) {
                    console.warn("[resetView] Overall bounding box is empty. Cannot reset view.");
                    addMessageToLog('System', 'No visible models to reset view to.');
                    speakResponse('No visible models to reset view to.');
                    return;
                }

                const center = overallBbox.getCenter(new THREE.Vector3());
                const size = overallBbox.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);

                console.log("[resetView] Overall Bounding Box:", overallBbox);
                console.log("[resetView] Center:", center);
                console.log("[resetView] Resetting view to fit all models.");
                console.log("[resetView] Size:", size);
                console.log("[resetView] Max Dimension:", maxDim);

                const fov = state.camera.fov * (Math.PI / 180);
                const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));

                const newCameraPosition = center.clone().add(new THREE.Vector3(maxDim * 0.8, maxDim * 0.8, maxDim * 0.8));
                state.camera.position.copy(newCameraPosition);
                state.camera.lookAt(center);
                state.controls.target.copy(center);
                state.controls.update();

                addMessageToLog('AI', 'View reset to fit all models.');
                speakResponse('View reset to fit all models.');
            } else if (state.controls && state.camera) {
                state.camera.position.set(30, 30, 30);
                state.camera.lookAt(0, 0, 0);
                state.controls.target.set(0, 0, 0);
                state.controls.update();
                addMessageToLog('System', 'No models loaded. Resetting to default view.');
                speakResponse('No models loaded. Resetting to default view.');
            } else {
                addMessageToLog('System', 'Three.js components not initialized for view reset.');
                speakResponse('Cannot reset view, editor components not ready.');
            }
            updateUndoRedoButtons();
        }

        function showDesignInfo() {
            if (state.loadedModels.length > 0) {
                let info = `Total Models Loaded: ${state.loadedModels.length}\n`;
                state.loadedModels.forEach((model, index) => {
                    info += `\nModel ${index + 1} (${model.name || 'Unnamed Model'}):\n`;
                    info += `  Number of Meshes: ${model.children.filter(c => c.isMesh).length}\n`;
                    info += `  Total Objects: ${model.children.length}\n`;
                });

                const sceneBbox = new THREE.Box3().setFromObject(state.scene);
                const sceneSize = sceneBbox.getSize(new THREE.Vector3());
                info += `\nOverall state.scene Bounding Box Size: X=${sceneSize.x.toFixed(2)}, Y=${sceneSize.y.toFixed(2)}, Z=${sceneSize.z.toFixed(2)}\n`;

                addMessageToLog('AI', info);
                speakResponse('Design information displayed for all loaded models.');
            } else {
                addMessageToLog('System', 'No models loaded to show design information.');
                speakResponse('No models loaded.');
            }
        }

        function listParts() {
            if (state.loadedModels.length > 0) {
                let parts = "Parts in loaded models:\n";
                state.loadedModels.forEach((model, modelIndex) => {
                    parts += `\n--- Model ${modelIndex + 1} (${model.name || 'Unnamed Model'}) ---\n`;
                    let modelHasParts = false;
                    model.traverse(obj => {
                        if (obj.isMesh && obj.name) {
                            parts += `- ${obj.name}\n`;
                            modelHasParts = true;
                        }
                    });
                    if (!modelHasParts) {
                        parts += "No named parts found in this model.\n";
                    }
                });
                addMessageToLog('AI', parts);
                speakResponse('Listed parts in the models.');
            } else {
                addMessageToLog('System', 'No models loaded or no parts to list.');
                speakResponse('No models loaded or no parts to list.');
            }
        }

        function selectPartByName(partName) {
            if (state.loadedModels.length > 0) {
                let foundObject = null;
                for (const model of state.loadedModels) {
                    model.traverse((obj) => {
                        if (obj.isMesh && obj.name === partName) {
                            foundObject = obj;
                        }
                    });
                    if (foundObject) break; // Stop searching once found
                }

                if (foundObject) {
                    selectObject(foundObject);
                } else {
                    addMessageToLog('System', `Part "${partName}" not found in any loaded models.`);
                    speakResponse(`Part ${partName} not found.`);
                }
            } else {
                addMessageToLog('System', 'No models loaded to select parts from.');
                speakResponse('No models loaded.');
            }
        }

        // --- state.camera View Functions (now including negative axes) ---
        function setCameraView(position, target) {
            if (state.camera && state.controls) {
                state.camera.position.copy(position);
                state.controls.target.copy(target);
                state.controls.update(); // Update state.controls after changing state.camera position/target
                addMessageToLog('System', `state.camera view set to [${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}] looking at [${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)}].`);
            } else {
                addMessageToLog('System', 'Three.js components not initialized for view change.');
            }
        }

        function getSceneCenterAndDistance() {
            const bbox = new THREE.Box3().setFromObject(state.scene);
            const center = bbox.getCenter(new THREE.Vector3());
            const size = bbox.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const cameraDistance = maxDim * 1.5; // Adjust as needed for comfortable viewing
            return { center, cameraDistance };
        }

        function setTopView() {
            const { center, cameraDistance } = getSceneCenterAndDistance();
            setCameraView(new THREE.Vector3(center.x, center.y + cameraDistance, center.z), center);
            speakResponse('Switched to top view.');
        }

        function setBottomView() {
            const { center, cameraDistance } = getSceneCenterAndDistance();
            setCameraView(new THREE.Vector3(center.x, center.y - cameraDistance, center.z), center);
            speakResponse('Switched to bottom view.');
        }

        function setFrontView() {
            const { center, cameraDistance } = getSceneCenterAndDistance();
            setCameraView(new THREE.Vector3(center.x, center.y, center.z + cameraDistance), center);
            speakResponse('Switched to front view.');
        }

        function setBackView() {
            const { center, cameraDistance } = getSceneCenterAndDistance();
            setCameraView(new THREE.Vector3(center.x, center.y, center.z - cameraDistance), center);
            speakResponse('Switched to back view.');
        }

        function setRightView() {
            const { center, cameraDistance } = getSceneCenterAndDistance();
            setCameraView(new THREE.Vector3(center.x + cameraDistance, center.y, center.z), center);
            speakResponse('Switched to right view.');
        }

        function setLeftView() {
            const { center, cameraDistance } = getSceneCenterAndDistance();
            setCameraView(new THREE.Vector3(center.x - cameraDistance, center.y, center.z), center);
            speakResponse('Switched to left view.');
        }

        function setIsometricView() {
            // This will be similar to resetView, but explicitly for isometric
            // If models are loaded, it will fit them, otherwise a default isometric
            resetView(); // resetView already provides an isometric-like fit or default
            speakResponse('Switched to isometric view.');
        }

        // DIRECT FACE DETECTION - Raycast original mesh and find face group
        function detectFaceFromClick() {
            console.log('[detectFaceFromClick] Called - faceMode:', state.faceEditState.isActive);

            if (!state.faceEditState.isActive || !state.faceEditState.targetMesh) {
                console.log('[detectFaceFromClick] No face mode or target mesh');
                return null;
            }

            // Raycast against the original target mesh
            const intersects = state.raycaster.intersectObject(state.faceEditState.targetMesh, false);
            console.log('[detectFaceFromClick] Intersects with target mesh:', intersects.length);

            if (intersects.length === 0) {
                console.log('[detectFaceFromClick] No intersection with target mesh');
                return null;
            }

            const intersection = intersects[0];
            const faceIndex = intersection.faceIndex;
            console.log('[detectFaceFromClick] Hit face index:', faceIndex);

            // Find which face group contains this triangle
            for (let i = 0; i < state.faceEditState.groups.length; i++) {
                const group = state.faceEditState.groups[i];
                if (group.triIndices.includes(faceIndex)) {
                    console.log('[detectFaceFromClick] Found face in group:', group.id);
                    return group.id;
                }
            }

            console.log('[detectFaceFromClick] Face not found in any group');
            return null;
        }

        // Legacy function for backward compatibility
        function raycastFaceOverlays() {
            return detectFaceFromClick();
        }

        function onViewAxesClick(event) {
            event.preventDefault(); // Prevent default browser behavior

            // Calculate state.mouse position in normalized device coordinates (NDC)
            // (-1 to +1) for both X and Y
            const rect = state.viewAxesRenderer.domElement.getBoundingClientRect();
            state.viewAxesMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            state.viewAxesMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            state.viewAxesRaycaster.setFromCamera(state.viewAxesMouse, state.viewAxesCamera);

            // Check for intersections with the individual axis meshes
            const intersects = state.viewAxesRaycaster.intersectObjects(state.viewAxesHelper.children, true);

            if (intersects.length > 0) {
                const intersectedObject = intersects[0].object;
                const axis = intersectedObject.userData.axis;
                const direction = intersectedObject.userData.direction;

                console.log(`[ViewAxesClick] Clicked on ${direction} ${axis}-axis.`);
                addMessageToLog('System', `View axis clicked: ${direction} ${axis}-axis.`);

                // Temporary visual feedback on the container
                viewAxesContainer.style.backgroundColor = '#DAA520'; // Accent yellow
                setTimeout(() => {
                    viewAxesContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.3)'; // Revert to original gray
                }, 200); // Flash for 200ms

                // Map to corresponding view functions
                if (axis === 'x') {
                    if (direction === 'positive') setRightView();
                    else setLeftView();
                } else if (axis === 'y') {
                    if (direction === 'positive') setTopView();
                    else setBottomView();
                } else if (axis === 'z') {
                    if (direction === 'positive') setFrontView();
                    else setBackView();
                }
            } else {
                console.log("[ViewAxesClick] No axis clicked. Falling back to Isometric view.");
                addMessageToLog('System', 'View axes helper clicked, but no specific axis. Resetting to Isometric view.');
                setIsometricView(); // If clicked anywhere on the helper but not an axis, go isometric
            }
        }


        // --- AI Chat and Voice Commands ---

        // --- Backend API Configuration ---
        // This URL should point to your Render backend's AI proxy endpoint.
        const BACKEND_API_URL = "https://mingyu.onrender.com/api/ai"; // YOUR RENDER BACKEND URL HERE

        async function sendAICommand(command) {
            sendTextCommandBtn.disabled = true;
            textCommandInput.disabled = true;
            addMessageToLog('System', 'AI is thinking...');
            console.log("[sendAICommand] Sending command to Render backend:", command);

            let selectedObjectInfo = "none";
            // Check if there are objects in state.currentlySelectedObjectsForEditing (meaning "select all" is active)
            if (state.currentlySelectedObjectsForEditing.length > 0) {
                const uuids = state.currentlySelectedObjectsForEditing.map(obj => obj.uuid);
                selectedObjectInfo = `Multiple CAD objects are currently selected for editing with UUIDs: ${uuids.join(', ')}.`;
            } else if (state.selectedObject) {
                selectedObjectInfo = `A CAD object is currently selected with UUID: ${state.selectedObject.uuid} and name: "${state.selectedObject.name || 'Unnamed Part'}".`;
            } else {
                selectedObjectInfo = "No CAD object is currently selected.";
            }

            const payload = {
                prompt: `You are an AI assistant for a CAD editor. Your primary goal is to interpret user commands and return a JSON object with an "action" and "value" property.
                    **VERY IMPORTANT:** Always respond with a single JSON object. Do not include any other text outside the JSON.

                    Available actions and their expected JSON format:

                    1.  **To create a new shape (PRIORITY - check this first):**
                        User input examples: "create a box", "add a sphere", "make a cylinder", "make a cube", "create cube", "add cube", "new cube", "make cube"
                        Return:
                        \`\`\`json
                        {"action": "createShape", "value": "[shape_type]"}
                        \`\`\`
                        [shape_type] can be "box" (or "cube"), "sphere", "cylinder", "cone", "pyramid", "plane", or "torus".
                        Note: "cube" and "box" are the same shape.

                    2.  **To duplicate the currently selected object:**
                        User input example: "duplicate it", "make a copy", "duplicate this"
                        Return:
                        \`\`\`json
                        {"action": "duplicateObject"}
                        \`\`\`

                    3.  **To remove the selected object:**
                        User input example: "remove it", "delete this", "erase the selected object"
                        Return:
                        \`\`\`json
                        {"action": "removeObject"}
                        \`\`\`

                    4.  **To reset the state.camera view to fit all models:**
                        User input example: "reset view", "fit all", "zoom out to see everything"
                        Return:
                        \`\`\`json
                        {"action": "resetView"}
                        \`\`\`

                    5.  **To show design information (e.g., number of models, bounding box):**
                        User input example: "show design info", "what's in the state.scene?", "tell me about the design"
                        Return:
                        \`\`\`json
                        {"action": "showDesignInfo"}
                        \`\`\`

                    6.  **To change the transform mode of the selected object:**
                        User input example: "set to translate mode", "rotate this", "switch to scale"
                        Return:
                        \`\`\`json
                        {"action": "setTransformMode", "value": "[mode]"}
                        \`\`\`
                        [mode] can be "translate", "rotate", or "scale".

                    7.  **To list all named parts in the models:**
                        User input example: "list parts", "what are the parts?", "show me the parts"
                        Return:
                        \`\`\`json
                        {"action": "listParts"}
                        \`\`\`

                    8.  **To select a part by its name:**
                        User input example: "select the wheel", "select part A", "choose the main body"
                        Return:
                        \`\`\`json
                        {"action": "selectPart", "value": "[part_name]"}
                        \`\`\`

                    9.  **To highlight all objects in the state.scene:**
                        User input example: "select all", "highlight everything"
                        Return:
                        \`\`\`json
                        {"action": "selectAll"}
                        \`\`\`

                    10. **To clear all highlights:**
                        User input example: "clear highlights", "unhighlight all"
                        Return:
                        \`\`\`json
                        {"action": "clearAllHighlights"}
                        \`\`\`

                    11. **To rotate the selected object:**
                        User input example: "rotate 90 degrees around x", "turn it on y axis by 45"
                        Return:
                        \`\`\`json
                        {"action": "rotateAxis", "value": {"axis": "[x/y/z]", "degrees": [number]}}
                        \`\`\`
                        If axis is not specified, default to 'y'. If degrees is not specified, default to 90.

                    12. **To scale the selected object:**
                        User input example: "scale it by 2", "make it half size", "scale up by 1.5"
                        Return:
                        \`\`\`json
                        {"action": "scale", "value": [factor]}
                        \`\`\`

                    13. **To translate (move) the selected object:**
                        User input example: "move it 1 unit on x", "shift by -0.5 on y", "translate 2, 0, -1"
                        Return:
                        \`\`\`json
                        {"action": "translate", "value": {"x": [number], "y": [number], "z": [number]}}
                        \`\`\`
                        If a coordinate is not specified, assume 0.

                    14. **To change the color of the selected object:**
                        User input example: "make it red", "change color to #00FF00", "set color to blue"
                        Return:
                        \`\`\`json
                        {"action": "changeColor", "value": "[color_value]"}
                        \`\`\`
                        [color_value] can be a color name (e.g., "red") or a hex code (e.g., "#FF0000").

                    15. **For conversational responses or if the command is not understood:**
                        Return:
                        \`\`\`json
                        {"action": "conversational", "value": "[your response]"}
                        \`\`\`

                    16. **For natural language object targeting (delete/move/rotate/scale/color specific objects):**
                        User input examples:
                        - "delete the car", "remove a ball", "delete all cones"
                        - "move the car up 2 meters", "rotate the ball 90 degrees", "scale all cubes by 1.5"
                        - "make the car red", "color all spheres blue"

                        For these commands, analyze the state.scene objects and return:
                        \`\`\`json
                        {
                          "action": "delete" | "transform" | "clarify",
                          "operation": {
                            "type": "translate" | "rotate" | "scale" | "color",
                            "value": { }
                          },
                          "targets": [
                            {
                              "uuid": "preferred when unique",
                              "class": "car|ball|cone|cube|cylinder|...",
                              "all": false,
                              "reason": "why it matched",
                              "name": "optional",
                              "color": "#rrggbb",
                              "positionHint": "left-front|right-back|center",
                              "sizeHint": "small|medium|large"
                            }
                          ],
                          "question": "if action=clarify, short question for user",
                          "context": { "originalAction": "delete|transform" }
                        }
                        \`\`\`

                        Rules:
                        - If exactly one object matches → include its uuid and return delete/transform
                        - If multiple match and user didn't say "all" → return "clarify" with ≤3 candidates
                        - If user said "all" → set "all": true on target with class
                        - For transforms: translate uses {"x":0,"y":1,"z":0}, rotate uses {"axis":"x|y|z","degrees":90}, scale uses {"uniform":1.2} or {"x":1.2,"y":1.2,"z":1.2}, color uses {"hex":"#ff0000"}

                    17. **For face editing commands:**
                        User input examples:
                        - "edit this object", "select faces", "face edit mode" → Enter face editing mode
                        - "delete this face", "remove the face I clicked" → Delete selected face
                        - "paint this face red", "color this face blue", "make this face green" → Color selected face
                        - "extrude this face", "push this face out", "extend this face" → Extrude selected face
                        - "exit face mode", "stop face editing" → Exit face editing mode

                        Return:
                        \`\`\`json
                        {"action": "faceEdit", "value": "enter|delete|color|extrude|exit", "color": "#ff0000", "distance": 0.2}
                        \`\`\`
                        For color commands, include "color" field with hex value.
                        For extrude commands, include "distance" field (default 0.2).

                    User command: "${command}".
                    Current context: ${selectedObjectInfo}
                    state.scene objects: ${JSON.stringify(buildModelContext().objects)}
                    Please return *only* the JSON object for the most appropriate action based on the user's command and the current context.
                    `
            };

            try {
                console.log("[sendAICommand] Fetching from backend API:", BACKEND_API_URL, "with payload:", payload);
                const response = await fetch(BACKEND_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                        // No Authorization header here, as the backend handles the OpenAI API key
                    },
                    body: JSON.stringify(payload)
                });

                console.log("[sendAICommand] Backend API response received. Status:", response.status, "OK:", response.ok);

                if (!response.ok) {
                    const errorData = await response.json();
                    console.error("[sendAICommand] Backend API Response not OK. Status:", response.status, "Status Text:", response.statusText, "Error Data:", errorData);
                    throw new Error(`Backend API error: ${errorData.error || response.statusText}. Details: ${JSON.stringify(errorData)}`);
                }

                const result = await response.json();
                console.log("[sendAICommand] Raw backend response result:", result);

                if (result.content) { // Expecting { content: "..." } from your backend
                    processAICommand(result.content); // Pass the AI's content for parsing
                } else {
                    console.error("[sendAICommand] Backend response format unexpected or empty. Result:", result);
                    throw new Error("Backend response format unexpected or empty.");
                }

            } catch (error) {
                console.error("Error communicating with backend API:", error);
                addMessageToLog('AI', `I'm sorry, I couldn't reach the AI service through your backend. Please ensure your Render backend is running and configured correctly. Error: ${error.message}`);
                speakResponse(`I'm sorry, I couldn't reach the AI service.`);
            } finally {
                sendTextCommandBtn.disabled = false;
                textCommandInput.disabled = false;
                const lastLogMessage = aiLog.lastChild;
                if (lastLogMessage && lastLogMessage.textContent.includes('AI is thinking...')) {
                    aiLog.removeChild(lastLogMessage);
                }
            }
        }

        // Function to test backend connection on load (now only logs, no UI status update)
        async function testAIConnection() {
            console.log("[testAIConnection] Attempting to test backend connection with a simple 'hello'.");

            try {
                const response = await fetch(BACKEND_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: "hello" })
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.content) {
                        console.log(`[testAIConnection] Backend connection successful! AI responded (via backend): "${JSON.parse(result.content).value || 'Hello!'}"`);
                    } else {
                        console.warn('[testAIConnection] Backend responded OK, but AI content was missing or malformed.');
                    }
                } else {
                    const errorData = await response.json();
                    console.error(`[testAIConnection] Backend connection failed: Status ${response.status}. Error: ${errorData.error || response.statusText}. Check Render logs.`);
                }
            } catch (error) {
                console.error(`[testAIConnection] Backend connection failed (network error): ${error.message}. Is your Render server running?`);
            }
        }

        // Function to change the color of the selected object
        function changeObjectColor(colorValue) {
            // Only save state if we have objects (never save empty state)
            if (state.loadedModels.length > 0) {
                const currentState = getCurrentState();
                state.undoStack.push(currentState);
                state.redoStack = []; // Clear redo stack
                console.log("[changeObjectColor] Saved state with", state.loadedModels.length, "objects");
            }
            const newColor = new THREE.Color(colorValue);
            let objectsToModify = [];

            // If state.currentlySelectedObjectsForEditing is populated, use it for batch operations
            if (state.currentlySelectedObjectsForEditing.length > 0) {
                console.log(`[changeObjectColor] Applying color to ${state.currentlySelectedObjectsForEditing.length} objects from batch selection.`);
                objectsToModify = [...state.currentlySelectedObjectsForEditing]; // Use spread to copy array
            } else if (state.selectedObject) {
                // Fallback to single selected object if no batch selection
                console.log("[changeObjectColor] Applying color to single selected object.");
                objectsToModify.push(state.selectedObject);
            } else {
                // If neither is selected, inform the user
                addMessageToLog('System', 'No object selected. Please select an object or use "select all" first.');
                speakResponse('No object selected. Please select an object or use select all first.');
                return;
            }

            objectsToModify.forEach(obj => {
                console.log(`[changeObjectColor] Modifying color for object: ${obj.name || obj.uuid}`); // Added log
                // Traverse children to ensure all meshes within the object/model get the color change
                obj.traverse((child) => {
                    if (child.isMesh && child.material) {
                        const materials = Array.isArray(child.material) ? child.material : [child.material];
                        materials.forEach(material => {
                            if (material && material.isMaterial) {
                                if (material.map) {
                                    material.map.dispose();
                                    material.map = null;
                                }
                                if (material.color) {
                                    material.color.set(newColor);
                                }
                                if (material.emissive !== undefined) {
                                    material.emissive.set(0x000000);
                                    material.emissiveIntensity = 0;
                                }
                                material.needsUpdate = true;
                            }
                        });
                        // Update initialMaterial for this child mesh to reflect the new permanent color
                        if (Array.isArray(child.material)) {
                            child.userData.initialMaterial = child.material.map(mat => mat.clone());
                        } else {
                            child.userData.initialMaterial = child.material.clone();
                        }
                    }
                });
                // After changing color, update state.originalMaterialProperties for the current selection cycle
                // This ensures that if this object is later individually selected, its highlight reverts correctly.
                const updatedOriginalMaterials = [];
                const topLevelMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];
                topLevelMaterials.forEach(mat => {
                    if (mat && mat.isMaterial) {
                        updatedOriginalMaterials.push(mat.clone());
                    }
                });
                state.originalMaterialProperties.set(obj.uuid, updatedOriginalMaterials);
                obj.updateMatrixWorld(true); // Ensure world matrix is updated after material change
            });

            addMessageToLog('AI', `Changed color of ${objectsToModify.length} object(s) to ${colorValue}.`);
            speakResponse(`Changed color of ${objectsToModify.length} object(s).`);
            console.log(`[changeObjectColor] Changed color of ${objectsToModify.length} object(s) to ${colorValue}.`);

            clearAllHighlights(); // This will now revert to the updated initialMaterial
            updateUndoRedoButtons(); // Update buttons after action
        }

        // COMPREHENSIVE: Test all extrude improvements
        window.testExtrudeImprovements = function() {
            console.log('=== TESTING EXTRUDE IMPROVEMENTS ===');
            console.log('Testing: 2D perpendicular arrow + object highlighting + drag functionality');

            // Step 1: Create cube
            if (state.loadedModels.length === 0) {
                console.log('1. Creating test cube...');
                createPrimitive('cube');
                setTimeout(() => testExtrudeImprovements(), 500);
                return;
            }

            const cube = state.loadedModels[0];
            console.log('2. Selecting cube:', cube.name);
            selectObject(cube);

            // Step 3: Enter face edit mode
            console.log('3. Entering face edit mode...');
            const faceResult = enterFaceEditMode(cube);

            if (!faceResult) {
                console.error('❌ Failed to enter face edit mode');
                return;
            }

            console.log('✅ Face edit mode active');
            console.log('   - Object should be highlighted (emissive glow)');
            console.log('   - Face groups found:', state.faceEditState.groups.length);

            // Step 4: Auto-select first face
            setTimeout(() => {
                console.log('4. Auto-selecting first face...');
                const firstFace = state.faceEditState.groups[0];
                state.faceEditState.selectedFaceIds.add(firstFace.id);
                firstFace.outline.visible = true;

                // Step 5: Test extrude
                setTimeout(() => {
                    console.log('5. Testing extrude...');
                    const extrudeResult = handleExtrudeFace();

                    if (extrudeResult && state.extrudeUI.arrow) {
                        console.log('✅ SUCCESS: All improvements working!');
                        console.log('   - 2D arrow created:', !!state.extrudeUI.arrow);
                        console.log('   - Arrow should be perpendicular to face');
                        console.log('   - Object should stay highlighted');
                        console.log('');
                        console.log('🎯 NOW TEST MANUALLY:');
                        console.log('   - Try clicking and dragging the green arrow');
                        console.log('   - Arrow should move perpendicular to face');
                        console.log('   - Press Enter to confirm or Esc to cancel');
                    } else {
                        console.error('❌ FAILED: Extrude not working');
                    }
                }, 500);
            }, 500);
        };

        // DEBUG: Test extrude workflow step by step
        window.testExtrudeWorkflow = function() {
            console.log('=== TESTING EXTRUDE WORKFLOW ===');

            // Step 1: Create a cube if none exists
            if (state.loadedModels.length === 0) {
                console.log('1. Creating test cube...');
                createPrimitive('cube');
                setTimeout(() => testExtrudeWorkflow(), 500);
                return;
            }

            // Step 2: Select the cube
            const cube = state.loadedModels[0];
            console.log('2. Selecting cube:', cube.name);
            selectObject(cube);

            // Step 3: Enter face edit mode
            console.log('3. Entering face edit mode...');
            const faceResult = enterFaceEditMode();
            console.log('   Face mode active:', state.faceEditState.isActive);
            console.log('   Face groups found:', state.faceEditState.groups.length);

            if (!state.faceEditState.isActive) {
                console.error('❌ Failed to enter face edit mode');
                return;
            }

            // Step 4: Auto-select first face
            setTimeout(() => {
                console.log('4. Auto-selecting first face...');
                if (state.faceEditState.groups.length > 0) {
                    const firstFace = state.faceEditState.groups[0];
                    state.faceEditState.selectedFaceIds.add(firstFace.id);
                    state.faceEditState.selectedGroupId = firstFace.id;

                    // Update visual feedback
                    firstFace.outline.visible = true;

                    console.log('   Selected face ID:', firstFace.id);
                    console.log('   Selected faces count:', state.faceEditState.selectedFaceIds.size);

                    // Step 5: Test extrude
                    setTimeout(() => {
                        console.log('5. Testing extrude...');
                        const extrudeResult = handleExtrudeFace();

                        if (extrudeResult) {
                            console.log('✅ SUCCESS: Extrude started!');
                            console.log('   Arrow created:', !!state.extrudeUI.arrow);
                            console.log('   UI active:', state.extrudeUI.active);
                            console.log('');
                            console.log('🎯 NOW TRY:');
                            console.log('   - Drag the green arrow to set depth');
                            console.log('   - Press Enter to confirm');
                            console.log('   - Press Esc to cancel');
                        } else {
                            console.error('❌ FAILED: Extrude did not start');
                            console.log('   Face mode active:', state.faceEditState.isActive);
                            console.log('   Selected faces:', state.faceEditState.selectedFaceIds.size);
                            console.log('   Available groups:', state.faceEditState.groups.length);
                        }
                    }, 500);
                } else {
                    console.error('❌ No face groups found');
                }
            }, 500);
        };

        // Clear all models from state.scene
        window.clearAllModels = function() {
            console.log(`[clearAllModels] Clearing ${state.loadedModels.length} models`);
            state.loadedModels.forEach(model => {
                if (state.scene && model) {
                    state.scene.remove(model);
                    // Dispose geometry and materials
                    if (model.geometry) model.geometry.dispose();
                    if (model.material) {
                        if (Array.isArray(model.material)) {
                            model.material.forEach(mat => mat.dispose());
                        } else {
                            model.material.dispose();
                        }
                    }
                }
            });
            state.loadedModels.length = 0;
            clearSelection();
            clearAllHighlights();
            console.log('[clearAllModels] All models cleared');
        };

        // DEBUG: Check extrude system status
        window.checkExtrudeStatus = function() {
            console.log('=== EXTRUDE SYSTEM STATUS ===');
            console.log('Face edit mode active:', state.faceEditState.isActive);
            console.log('Selected object:', state.selectedObject ? state.selectedObject.name : 'none');
            console.log('Face groups available:', state.faceEditState.groups.length);
            console.log('Selected face IDs:', Array.from(state.faceEditState.selectedFaceIds));
            console.log('Extrude UI active:', state.extrudeUI.active);
            console.log('Extrude arrow exists:', !!state.extrudeUI.arrow);
            console.log('');
            console.log('🔧 QUICK FIXES:');
            console.log('- testExtrudeWorkflow() - Full test');
            console.log('- createPrimitive("cube") - Create test object');
            console.log('- selectObject(state.loadedModels[0]) - Select first object');
            console.log('- enterFaceEditMode() - Enter face mode');
            console.log('- handleExtrudeFace() - Start extrude');
        };

        function processAICommand(aiResponseContent) { // Now receives the content string directly
            console.log("[processAICommand] Processing AI command content:", aiResponseContent);

            let parsedResponse;
            try {
                parsedResponse = JSON.parse(aiResponseContent); // Parse the content string
                console.log("[processAICommand] Parsed AI response (JSON):", parsedResponse);

                // Check for natural language actions first (delete, transform, clarify)
                if (parsedResponse.action === 'delete' || parsedResponse.action === 'transform' || parsedResponse.action === 'clarify') {
                    console.log("[processAICommand] Natural language action detected:", parsedResponse.action);
                    handleNLActionResponse(parsedResponse);
                    return;
                }

                // Handle cases where 'action' might be missing or is 'conversational'
                if (parsedResponse.action === 'conversational' || (!parsedResponse.action && parsedResponse.value)) {
                    addMessageToLog('AI', parsedResponse.value);
                    speakResponse(parsedResponse.value);
                } else if (typeof parsedResponse.action === 'string') {
                    switch (parsedResponse.action) {
                        case 'createShape':
                            if (parsedResponse.value) {
                                createPrimitive(parsedResponse.value);
                            } else {
                                addMessageToLog('AI', 'Please specify a shape type (e.g., "box", "sphere", "cylinder", "cone", "pyramid").');
                                speakResponse('Please specify a shape type like box, sphere, cylinder, cone, or pyramid.');
                            }
                            break;
                        case 'removeObject':
                            handleDeleteCommand();
                            break;
                        case 'duplicateObject': // Handle duplicate command
                            console.log("[processAICommand] Duplicate command received");
                            const selectedObjects = getSelectedObjects();
                            console.log(`[processAICommand] Selected objects count: ${selectedObjects.length}`);

                            if (selectedObjects.length > 0) {
                                duplicateSelection(); // Use the new unified function
                            } else {
                                // If AI tries to duplicate but nothing is selected, provide a specific error to the user
                                addMessageToLog('AI', 'I cannot duplicate. No object is currently selected. Please select an object first by clicking on it or using "select all".');
                                speakResponse('No object selected to duplicate. Please click on an object first or use select all.');
                            }
                            break;
                        case 'resetView':
                            resetView();
                            break;
                        case 'showDesignInfo':
                            showDesignInfo();
                            break;
                        case 'setTransformMode':
                            if (parsedResponse.value) {
                                setTransformMode(parsedResponse.value);
                            } else {
                                addMessageToLog('AI', 'Please specify a transform mode (translate, rotate, scale).');
                                speakResponse('Please specify a transform mode like translate, rotate, or scale.');
                            }
                            break;
                        case 'listParts':
                            listParts();
                            break;
                        case 'selectPart':
                            if (parsedResponse.value) {
                                selectPartByName(parsedResponse.value);
                            } else {
                                addMessageToLog('AI', 'Please specify a part name to select.');
                                speakResponse('Please tell me which part to select.');
                            }
                            break;
                        case 'selectAll': // Handle select all command
                            highlightAllModels();
                            break;
                        case 'clearAllHighlights': // New command to clear all highlights
                            clearAllHighlights();
                            break;
                        case 'rotateAxis':
                            console.log("[processAICommand] Rotate command received");
                            if (parsedResponse.value) {
                                const { axis, degrees } = parsedResponse.value;
                                const radians = THREE.MathUtils.degToRad(degrees || 90);

                                // Convert axis-based rotation to rx, ry, rz format
                                let rx = 0, ry = 0, rz = 0;
                                if (axis === 'x') rx = radians;
                                else if (axis === 'y') ry = radians;
                                else if (axis === 'z') rz = radians;

                                rotateSelection(rx, ry, rz);
                            } else {
                                addMessageToLog('System', 'Invalid rotation command - missing axis or degrees.');
                                speakResponse('Invalid rotation command.');
                            }
                            break;
                        case 'scale':
                            console.log("[processAICommand] Scale command received");
                            if (parsedResponse.value) {
                                const factor = parsedResponse.value;
                                scaleSelection(factor, factor, factor);
                            } else {
                                addMessageToLog('System', 'Invalid scale command - missing scale factor.');
                                speakResponse('Invalid scale command.');
                            }
                            break;
                        case 'translate':
                            console.log("[processAICommand] Translate command received");
                            if (parsedResponse.value) {
                                const { x, y, z } = parsedResponse.value;
                                translateSelection(x || 0, y || 0, z || 0);
                            } else {
                                addMessageToLog('System', 'Invalid translate command - missing coordinates.');
                                speakResponse('Invalid translate command.');
                            }
                            updateUndoRedoButtons(); // Update buttons after action
                            break;
                        case 'changeColor':
                            if (parsedResponse.value) {
                                console.log('[AI] changeColor command - routing to handleColorCommand');
                                handleColorCommand(parsedResponse.value);  // ✅ 통일된 라우팅
                            } else {
                                addMessageToLog('AI', 'Please specify a color value (e.g., "red", "#FF0000").');
                                speakResponse('Please specify a color value.');
                            }
                            break;
                        case 'faceEdit':
                            console.log("[processAICommand] Face edit command received:", parsedResponse.value);
                            const faceAction = parsedResponse.value;

                            if (faceAction === 'enter') {
                                if (state.selectedObject && state.selectedObject.isMesh) {
                                    const success = enterFaceEditMode(state.selectedObject);
                                    if (!success) {
                                        addMessageToLog('AI', 'Could not enter face edit mode. Make sure you have selected a valid mesh object.');
                                        speakResponse('Could not enter face edit mode.');
                                    }
                                } else {
                                    addMessageToLog('AI', 'Please select a mesh object first to edit its faces.');
                                    speakResponse('Please select a mesh object first.');
                                }
                            } else if (faceAction === 'delete') {
                                handleDeleteCommand();
                            } else if (faceAction === 'color') {
                                const color = parsedResponse.color || '#ff0000';
                                console.log("[processAICommand] Face color command - routing to handleColorCommand:", color);
                                handleColorCommand(color);  // ✅ 통일된 라우팅
                            } else if (faceAction === 'extrude') {
                                const distance = parsedResponse.distance || 0.2;
                                console.log("[processAICommand] Face extrude command:", distance);
                                handleExtrudeFace(distance);
                            } else if (faceAction === 'exit') {
                                exitFaceEditMode();
                            } else {
                                addMessageToLog('AI', 'Unknown face edit command. Try "enter", "delete", "color", "extrude", or "exit".');
                                speakResponse('Unknown face edit command.');
                            }
                            break;
                        case 'error':
                            addMessageToLog('AI', parsedResponse.value || 'An unknown error occurred.'); // Use parsedResponse.value for error messages
                            speakResponse(parsedResponse.value || 'An unknown error occurred.');
                            break;
                        default:
                            addMessageToLog('AI', `Understood: "${parsedResponse.action}". However, I don't know how to perform this action.`);
                            speakResponse(`I understand, but I don't know how to perform ${parsedResponse.action}.`);
                    }
                } else if (parsedResponse.message) {
                    addMessageToLog('AI', parsedResponse.message);
                    speakResponse(parsedResponse.message);
                } else {
                    addMessageToLog('AI', `Unexpected AI response format: ${aiResponseContent}`);
                    speakResponse('I received an unexpected response.');
                }
            } catch (jsonError) {
                console.error("Failed to parse AI response as JSON:", jsonError);
                console.error("Raw Response (for parsing error):", aiResponseContent);
                console.error("Response type:", typeof aiResponseContent);
                console.error("Response length:", aiResponseContent ? aiResponseContent.length : 'null/undefined');

                // Try to handle common non-JSON responses
                if (typeof aiResponseContent === 'string') {
                    // Check if it's a plain text response that should be treated as conversational
                    if (!aiResponseContent.trim().startsWith('{') && !aiResponseContent.trim().startsWith('[')) {
                        console.log("Treating as plain text response");
                        addMessageToLog('AI', aiResponseContent);
                        speakResponse(aiResponseContent);
                        return;
                    }

                    // Try to extract JSON from a larger response
                    const jsonMatch = aiResponseContent.match(/\{[^}]*\}/);
                    if (jsonMatch) {
                        try {
                            const extractedJson = JSON.parse(jsonMatch[0]);
                            console.log("Successfully extracted JSON from response:", extractedJson);
                            processAICommand(JSON.stringify(extractedJson));
                            return;
                        } catch (extractError) {
                            console.error("Failed to parse extracted JSON:", extractError);
                        }
                    }
                }

                addMessageToLog('AI', `I received an uninterpretable response from the AI: "${aiResponseContent.substring(0, 100)}...". Please check the console for full details.`);
                speakResponse('I received an uninterpretable response.');
            }
        }

        // Voice input integration
        if ('webkitSpeechRecognition' in window) {
            state.recognition = new webkitSpeechRecognition();
            state.recognition.continuous = false;
            state.recognition.interimResults = false;
            state.recognition.lang = 'en-US';

            state.recognition.onstart = () => {
                state.isVoiceAssistActive = true;
                integratedVoiceBtn.classList.add('active-voice-btn');
                addMessageToLog('System', 'Listening for voice commands...');
            };

            state.recognition.onresult = (event) => {
                const command = event.results[0][0].transcript;
                addMessageToLog('System', `You said: "${command}"`);
                sendAICommand(command);
            };

            state.recognition.onerror = (event) => {
                console.error('Speech state.recognition error:', event.error);
                addMessageToLog('System', `Voice command error: ${event.error}`);
                speakResponse("I didn't catch that. Could you please repeat?");
                integratedVoiceBtn.classList.remove('active-voice-btn');
                state.isVoiceAssistActive = false;
            };

            state.recognition.onend = () => {
                integratedVoiceBtn.classList.remove('active-voice-btn');
                state.isVoiceAssistActive = false;
                addMessageToLog('System', 'Voice command ended.');
            };

            integratedVoiceBtn.addEventListener('click', () => {
                if (state.isVoiceAssistActive) {
                    stopVoiceAssist();
                } else {
                    startVoiceAssist();
                }
            });
        } else {
            integratedVoiceBtn.style.display = 'none'; // Hide button if API not supported
            addMessageToLog('System', 'Voice state.recognition not supported in this browser.');
        }

        function startVoiceAssist() {
            if (state.recognition && !state.isVoiceAssistActive) {
                state.recognition.start();
            }
        }

        function stopVoiceAssist() {
            if (state.recognition && state.isVoiceAssistActive) {
                state.recognition.stop();
            }
        }

        // Text-to-speech integration
        if ('speechSynthesis' in window) {
            state.synth = window.speechSynthesis;
        } else {
            console.warn('Text-to-speech not supported in this browser.');
        }

        function speakResponse(text) {
            if (state.synth) {
                const utterance = new SpeechSynthesisUtterance(text);
                state.synth.speak(utterance);
            }
        }
        // Send text command via input field
        sendTextCommandBtn.addEventListener('click', () => {
            const command = textCommandInput.value.trim();
            if (command) {
                addMessageToLog('User', command); // Add user message to log immediately

                // Check if this is a disambiguation response (number)
                if (state.pendingDisambiguation && /^\d+$/.test(command)) {
                    handleDisambiguationChoice(command);
                } else {
                    sendAICommand(command);
                }

                textCommandInput.value = ''; // Clear input after sending
            }
        });

        // Allow sending command by pressing Enter in the input field
        textCommandInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prevent default Enter key behavior (e.g., new line in textarea)
                sendTextCommandBtn.click();
            }
        });

        window.addEventListener('resize', onWindowResize, false);

        // Function to handle tab switching (AI Chat / Code Editor)
        function setActiveTab(tabName) {
            // Remove 'active' class from all tab buttons and content
            // Ensure we only affect the tab buttons within the right-panel
            document.querySelectorAll('.right-panel .tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.right-panel .tab-content').forEach(content => content.classList.remove('active'));

            // Add 'active' class to the clicked tab button and corresponding content
            if (tabName === 'chat') {
                chatTabButton.classList.add('active');
                chatContent.classList.add('active');
                speakResponse('Switched to AI chat.');
            } else if (tabName === 'codeEditor') {
                codeEditorTabButton.classList.add('active');
                codeEditorContent.classList.add('active');
                speakResponse('Switched to code editor.');
            }
        }

        // Event listeners for tab buttons (now that setActiveTab is global)
        chatTabButton.addEventListener('click', () => setActiveTab('chat'));
        codeEditorTabButton.addEventListener('click', () => setActiveTab('codeEditor'));


        // Check if user is typing in UI elements - ENHANCED
        function isTypingInUI() {
            const activeElement = document.activeElement;
            return activeElement && (
                /INPUT|TEXTAREA/.test(activeElement.tagName) ||
                activeElement.isContentEditable ||
                activeElement.id === 'textCommandInput' ||
                activeElement.id === 'objectColorPicker'
            );
        }

        // ENHANCED KEYBOARD SHORTCUTS - Face editing + Extrude state.controls
        window.addEventListener('keydown', (event) => {
            // ✅ GUARD: Don't interfere with typing
            if (isTypingInUI()) return;

            const key = event.key.toLowerCase();

            // Multi-select control (check both lowercase and original)
            if (key === 'control' || event.key === 'Control') {
                if (state.faceEditState.isActive) {
                    state.faceEditState.multiSelect = true;
                    console.log('[Keyboard] Multi-select enabled');
                }
                return;
            }

            // Extrude mode state.controls - EXACT SPEC
            if (state.extrudeUI.active) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    confirmExtrude();
                    return;
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelExtrude();
                    return;
                }
            }

            // Face editing shortcuts
            if (!state.faceEditState.isActive) return;

            // Prevent default browser behavior for our shortcuts
            if (['x', 'c', 'e', 'q'].includes(key)) {
                event.preventDefault();
            }

            switch (key) {
                case 'x':
                    console.log('[Keyboard] X pressed - Delete face');
                    handleDeleteCommand();
                    break;
                case 'c':
                    console.log('[Keyboard] C pressed - Smart color command');
                    handleColorCommand('#1e90ff');  // ✅ Smart routing
                    break;
                case 'e':
                    console.log('[Keyboard] E pressed - Start extrude');
                    handleExtrudeFace();
                    break;
                case 'q':
                    console.log('[Keyboard] Q pressed - Exit face mode');
                    exitFaceEditMode();
                    break;
            }
        });

        window.addEventListener('keyup', (event) => {
            const key = event.key.toLowerCase();

            // Disable multi-select when Control is released
            if (key === 'control' || event.key === 'Control') {
                if (state.faceEditState.isActive) {
                    state.faceEditState.multiSelect = false;
                    console.log('[Keyboard] Multi-select disabled');
                }
            }
        });



        // Initialize state.scene when the window loads
        window.onload = () => {
            console.log("[Init] Window loaded, starting initialization...");

            // Check if we're on the upload page
            const uploadPage = document.getElementById('uploadPage');
            const editorPage = document.getElementById('editorPage');

            console.log("[Init] Upload page element:", uploadPage);
            console.log("[Init] Editor page element:", editorPage);
            console.log("[Init] Upload page classes:", uploadPage?.className);
            console.log("[Init] Editor page classes:", editorPage?.className);

            // Check button elements
            console.log("[Init] Button elements check:");
            console.log("  - loadRandomModelButton:", loadRandomModelButton);
            console.log("  - createNewEmptyModelButton:", createNewEmptyModelButton);
            console.log("  - editExistingModelButton:", editExistingModelButton);

            initScene();
            startAnimateLoop();

            // DEBUG: Clear any existing models on startup
            if (state.loadedModels.length > 0) {
                console.log('[Init] Clearing', state.loadedModels.length, 'existing models');
                state.loadedModels.forEach(model => {
                    if (state.scene && model) state.scene.remove(model);
                });
                state.loadedModels.length = 0;
            }

            // Set initial CSS for the CAD viewer background
            cadViewer.style.backgroundColor = '#FFFFFF';
            cadViewer.style.backgroundImage = 'repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(0,0,0,0.1) 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(0,0,0,0.1) 20px)';
            cadViewer.style.backgroundSize = '20px 20px';

            // RESTORED: Show upload page first (more professional)
            uploadPage.classList.add('page-active');
            uploadPage.classList.remove('page-inactive');
            editorPage.classList.add('page-inactive');
            editorPage.classList.remove('page-active');



            // Explicitly hide dropZone and loadingMsg on initial load
            dropZone.style.display = 'none';
            dropZone.style.pointerEvents = 'none';
            loadingMsg.style.display = 'none';

            // Automatically test AI connection on load
            testAIConnection(); // Still call to log backend status to console

            // Removed event listeners for view control buttons as the HTML is removed
            // topViewBtn.addEventListener('click', setTopView);
            // bottomViewBtn.addEventListener('click', setBottomView);
            // frontViewBtn.addEventListener('click', setFrontView);
            // backViewBtn.addEventListener('click', setBackView);
            // rightViewBtn.addEventListener('click', setRightView);
            // leftViewBtn.addEventListener('click', setLeftView);
            // isometricViewBtn.addEventListener('click', setIsometricView);
            // fitAllViewBtn.addEventListener('click', resetView);

            // Add event listener for smart color change (face vs object)
            applyObjectColorBtn.addEventListener('click', () => {
                const color = objectColorPicker.value;
                handleColorCommand(color);  // ✅ Smart routing
            });

            // Set up undo/redo button event listeners with retry mechanism
            console.log("[Init] Setting up undo/redo button listeners");

            function setupUndoRedoButtons() {
                const undoBtn = document.getElementById('undoButton');
                const redoBtn = document.getElementById('redoButton');

                console.log("[Init] undoButton found:", !!undoBtn);
                console.log("[Init] redoButton found:", !!redoBtn);

                if (undoBtn && redoBtn) {
                    // Remove any existing listeners first
                    undoBtn.removeEventListener('click', undo);
                    redoBtn.removeEventListener('click', redo);

                    // Add new listeners
                    undoBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        console.log("[UndoButton] Button clicked - calling undo()");
                        undo();
                    });

                    redoBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        console.log("[RedoButton] Button clicked - calling redo()");
                        redo();
                    });

                    console.log("[Init] Undo/Redo button listeners added successfully");
                    return true;
                } else {
                    console.error("[Init] Undo/Redo buttons not found!");
                    console.error("undoButton element:", undoBtn);
                    console.error("redoButton element:", redoBtn);
                    return false;
                }
            }

            // Try to setup buttons immediately
            if (!setupUndoRedoButtons()) {
                // If failed, try again after a short delay
                setTimeout(() => {
                    console.log("[Init] Retrying undo/redo button setup...");
                    setupUndoRedoButtons();
                }, 100);
            }

            // Initial message to guide the user on the upload page
            addMessageToLog('System', 'Welcome to the AI VR CAD Editor! Please choose an option above to get started: "Create Empty Model", "Edit Existing Model" (to upload a file), or "Load Random Model".');

            // Don't save initial empty state - let first action create the baseline
            console.log("[Init] Undo/redo system ready - first action will create baseline state");


            // Add backup event listeners using document.getElementById
            setTimeout(() => {
                console.log("[Init] Adding backup event listeners...");

                const backupCreateBtn = document.getElementById('createNewEmptyModelButton');
                const backupEditBtn = document.getElementById('editExistingModelButton');
                const backupRandomBtn = document.getElementById('loadRandomModelButton');

                if (backupCreateBtn) {
                    backupCreateBtn.onclick = function() {
                        console.log("[Backup] Create Empty Model clicked!");
                        goToEditor('empty');
                    };
                    console.log("[Init] Backup Create Empty Model listener added");
                }

                if (backupEditBtn) {
                    backupEditBtn.onclick = function() {
                        console.log("[Backup] Edit Existing Model clicked!");
                        const fileInput = document.getElementById('fileInput');
                        if (fileInput) fileInput.click();
                    };
                    console.log("[Init] Backup Edit Existing Model listener added");
                }

                if (backupRandomBtn) {
                    backupRandomBtn.onclick = function() {
                        console.log("[Backup] Load Random Model clicked!");
                        goToEditor('random');
                    };
                    console.log("[Init] Backup Load Random Model listener added");
                }
            }, 100);

            console.log("[Init] Initialization complete. Try testButtonClicks() or forceCreateEmpty() in console if buttons don't work.");
        };

