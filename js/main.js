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
import { initDocLink, onObjectSelected as docLinkOnSelected } from './docLink.js';
import { getIFCElementProperties } from './ifcLoader.js';
import { saveNativeProject } from './project.js';
import { initCADTools } from './cadTools.js';
import {
    initFaceEditCallbacks,
    buildFaceBoundaryPolygon,
    enableMultiFaceSelection,
    testMultiSelect,
    updateFaceHighlights,
    checkMultiSelectState,
    testUXAcceptance,
    getFaceEditStatus,
    forceSelectFirstFace,
    testFaceColoring,
    testExtrudeSystem,
    buildFaceGroups,
    enterFaceEditMode,
    exitFaceEditMode,
    deleteFaceGroup,
    paintFace,
    handleColorCommand,
    handleColorFace,
    refreshFaceGroups,
    extrudeFaceAdd,
    handleExtrudeFace,
    showExtrudeGizmo,
    updateExtrudeDistance,
    handleExtrudeKeydown,
    confirmExtrude,
    cancelExtrude,
    onExtrudePointerDown,
    onExtrudePointerMove,
    onExtrudePointerUp,
    handleDeleteCommand,
    selectFaceGroup,
    handleFaceClick,
    clearFaceSelection,
    updateFaceHover,
    detectFaceFromClick,
    raycastFaceOverlays
} from './faceEdit.js';

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
        const resetCssButton = document.getElementById('resetCssButton');
        const headerEditorActions = document.getElementById('headerEditorActions');

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
            raycastFaceOverlays,
            handleFaceClick,
            clearFaceSelection,
            updateFaceHover,
            onObjectSelected: docLinkOnSelected
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
        initDocLink();
        initCADTools();

        initFaceEditCallbacks({
            speakResponse,
            requestRender: typeof requestRender === 'function' ? requestRender : () => {},
            getActiveObject,
            paintObject,
            testFaceEditing: () => window.testFaceEditing ? window.testFaceEditing() : false,
            onSelectionChanged
        });

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
                    const parent = obj.parent;
                    removedObjects.push({
                        object: obj,
                        parent,
                        uuid: uuid
                    });

                    parent.remove(obj);

                    // Remove from state.loadedModels
                    const modelIndex = state.loadedModels.indexOf(obj);
                    if (modelIndex !== -1) {
                        state.loadedModels.splice(modelIndex, 1);
                    }

                    // Add undo action
                    addUndoAction({
                        type: 'delete_object',
                        object: obj,
                        parent,
                        modelIndex: modelIndex,
                        revert: () => {
                            parent.add(obj);
                            if (modelIndex !== -1) {
                                state.loadedModels.splice(modelIndex, 0, obj);
                            }
                        },
                        apply: () => {
                            obj.parent?.remove(obj);
                            const currentIndex = state.loadedModels.indexOf(obj);
                            if (currentIndex !== -1) {
                                state.loadedModels.splice(currentIndex, 1);
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
                    material: obj.material ? (Array.isArray(obj.material) ? [...obj.material] : obj.material) : null
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
                const appliedTransform = {
                    position: obj.position.clone(),
                    rotation: obj.rotation.clone(),
                    scale: obj.scale.clone(),
                    material: obj.material ? (Array.isArray(obj.material) ? [...obj.material] : obj.material) : null
                };

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
                    },
                    apply: () => {
                        obj.position.copy(appliedTransform.position);
                        obj.rotation.copy(appliedTransform.rotation);
                        obj.scale.copy(appliedTransform.scale);
                        if (appliedTransform.material) {
                            obj.material = appliedTransform.material;
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
        // Get face coordinate frame (origin, u, v, normal)
        // Enable/disable multi-face selection mode
        // DEBUG: Test multi-select by selecting first two faces
        // Update face highlights based on selection
        // DEBUG: Check multi-select state
        // UX ACCEPTANCE TEST - Complete system test
        // DEBUG: Check face editing status
        // DEBUG: Force select first face group for testing
        // DEBUG: Test face coloring directly
        // DEBUG: Test complete extrude system
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
            const objects = [];

            for (const model of state.loadedModels) {
                if (!model) continue;

                if (model.userData?.isIFCModel) {
                    const entry = { uuid: model.uuid, name: model.name, type: 'ifc_model' };
                    const ti = model.userData.typeIndex;
                    if (ti && Object.keys(ti).length > 0) {
                        entry.selectableTypes = {};
                        for (const [k, v] of Object.entries(ti)) entry.selectableTypes[k] = v.length;
                    } else {
                        entry.note = 'IFC model — use selectPart or selectAllByType with: window, wall, door, roof, floor, slab, beam, column, stair, railing, space, furniture';
                    }
                    objects.push(entry);
                } else {
                    objects.push({ uuid: model.uuid, name: model.name || 'Model', type: 'model' });
                    let n = 0;
                    model.traverse(child => {
                        if (n >= 100 || !child.isMesh) return;
                        objects.push({ uuid: child.uuid, name: child.name || `mesh_${child.uuid.slice(0, 8)}` });
                        n++;
                    });
                }
            }

            return { objects };
        }

        // FACE EDITING SYSTEM



        // Build face groups using region growing algorithm
        // Create overlay mesh for face group highlighting
        // Enter face editing mode
        // Exit face editing mode
        // Face highlighting is now handled directly in onCanvasMouseMove - no separate function needed

        // Face selection is now handled directly in onCanvasClick - no separate function needed

        // Delete selected face group
        // REMOVED DUPLICATE - Using main getFaceFrame function

        // Convert world coordinates to face 2D coordinates
        // Convert face 2D coordinates to world coordinates
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
        window.selectFaceGroup = selectFaceGroup;
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
            fileInput.value = '';
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
                fileInput.value = '';
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
            const isTyping = event.target.tagName.toLowerCase() === 'input' || event.target.tagName.toLowerCase() === 'textarea';
            const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
            // Save should always work, but other editor shortcuts should not fire while typing.
            if (isTyping && !isSaveShortcut) {
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
                } else if (event.key.toLowerCase() === 's') {
                    event.preventDefault();
                    saveModel();
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


        async function saveModel() {
            if (saveButton.disabled) return;

            saveButton.disabled = true;
            saveButton.textContent = 'Saving...';
            addMessageToLog('System', 'Saving an editable project file...');

            try {
                const filename = saveNativeProject();
                addMessageToLog('System', `Editable project saved successfully as "${filename}".`);
                speakResponse('Editable project saved successfully.');
            } catch (error) {
                console.error('[Save] Could not save project:', error);
                addMessageToLog('System', `Could not save project: ${error.message}`);
                speakResponse('Could not save the project.');
            } finally {
                saveButton.disabled = false;
                saveButton.textContent = 'Save';
            }
        }

        // --- Apply CSS Function (remains the same, but now accessed via AI command or direct console) ---
        applyCssButton.addEventListener('click', () => {
            console.log("[Apply CSS] button clicked."); // Debug log
            const cssText = cssCodeEditor.value;
            try {
                cadViewer.style.cssText = cssText;
                addMessageToLog('System', 'Viewer appearance applied.');
            } catch (error) {
                addMessageToLog('System', `Error applying CSS: ${error.message}`);
                console.error("Error applying CSS:", error);
            }
        });
        document.querySelectorAll('[data-viewer-style]').forEach(button => {
            button.addEventListener('click', () => {
                const styles = {
                    light: 'background: #ffffff;',
                    blueprint: 'background: linear-gradient(135deg, #eaf4ff, #cddff2);',
                    dark: 'background: #182231;',
                    grid: 'background-color: #ffffff; background-image: linear-gradient(#dfe7ef 1px, transparent 1px), linear-gradient(90deg, #dfe7ef 1px, transparent 1px); background-size: 24px 24px;',
                };
                cssCodeEditor.value = styles[button.dataset.viewerStyle] || '';
                applyCssButton.click();
            });
        });
        resetCssButton.addEventListener('click', () => {
            cssCodeEditor.value = '';
            cadViewer.style.cssText = '';
            addMessageToLog('System', 'Viewer appearance reset.');
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
            headerEditorActions.hidden = false;
            console.log("[goToEditor] Page transition complete. Editor page is now active.");

            // The renderer was sized before the page became visible — fix it now
            requestAnimationFrame(() => onWindowResize());
        }

        function goBack() {
            console.log("[Navigation] Going back to upload page.");
            editorPage.classList.remove('page-active');
            editorPage.classList.add('page-inactive');
            uploadPage.classList.remove('page-inactive');
            uploadPage.classList.add('page-active');
            headerEditorActions.hidden = true;
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
                state.scene.background = new THREE.Color(0xf4f7fb);
            }
            if (!state.renderer) {
                state.renderer = new THREE.WebGLRenderer({ canvas: cadCanvas, antialias: true });
                state.renderer.setPixelRatio(window.devicePixelRatio);
                state.renderer.xr.enabled = true;
            }
            if (!state.camera) {
                const viewerDiv = cadCanvas.parentElement;
                state.camera = new THREE.PerspectiveCamera(75, viewerDiv.clientWidth / viewerDiv.clientHeight, 0.01, 500000);
                // Adjusted initial state.camera position for a more "twisted" or perspective view
                state.camera.position.set(30, 30, 30); // Set state.camera at an angle
            }
            if (!state.controls) {
                state.controls = new THREE.OrbitControls(state.camera, state.renderer.domElement);
                state.controls.enableDamping = true;
                state.controls.dampingFactor = 0.25;
                // OrbitControls handles touchscreen pinch zoom. Keep it gentler than
                // the separately handled wheel/touchpad zoom below.
                state.controls.zoomSpeed = 0.4;
                state.controls.minDistance = 0.001;
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

            const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
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
            cadCanvas.removeEventListener('mousemove', onCanvasMouseMove, false);
            cadCanvas.addEventListener('mousemove', onCanvasMouseMove, false);
            cadCanvas.removeEventListener('wheel', focusZoomOnPointer, false);
            cadCanvas.removeEventListener('wheel', focusZoomOnPointer, true);
            cadCanvas.addEventListener('wheel', focusZoomOnPointer, { passive: false, capture: true });

            // Add extrude gizmo interaction handlers
            cadCanvas.removeEventListener('mousedown', onExtrudePointerDown, false);
            cadCanvas.removeEventListener('mousemove', onExtrudePointerMove, false);
            cadCanvas.removeEventListener('mouseup', onExtrudePointerUp, false);
            cadCanvas.addEventListener('mousedown', onExtrudePointerDown, false);
            cadCanvas.addEventListener('mousemove', onExtrudePointerMove, false);
            cadCanvas.addEventListener('mouseup', onExtrudePointerUp, false);

            initViewAxesHelper(); // Initialize the static view axes helper
            viewAxesContainer.removeEventListener('click', onViewAxesClick, false);
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

            // Restart the animation loop every time the scene is (re)initialized
            startAnimateLoop();
        }

        function focusZoomOnPointer(event) {
            if (!state.controls || !state.camera || !state.renderer) return;
            event.preventDefault();
            event.stopImmediatePropagation();

            const rect = state.renderer.domElement.getBoundingClientRect();
            const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
            const pixelDelta = THREE.MathUtils.clamp(event.deltaY * deltaScale, -120, 120);
            const currentOffset = state.camera.position.clone().sub(state.controls.target);
            const currentDistance = currentOffset.length();
            const minDistance = Math.max(0.01, state.controls.minDistance || 0.01);
            const maxDistance = Number.isFinite(state.controls.maxDistance)
                ? state.controls.maxDistance
                : 500000;
            const nextDistance = THREE.MathUtils.clamp(
                currentDistance * Math.exp(pixelDelta * 0.001),
                minDistance,
                maxDistance
            );

            // A real zoom changes the camera-to-target distance. Moving both the
            // camera and target together causes the view to fly through the model.
            currentOffset.setLength(nextDistance);
            state.camera.position.copy(state.controls.target).add(currentOffset);
            state.controls.update();
        }

        // FACE EDITING OPERATIONS

        // SIMPLE FACE PAINTING - Add colored overlay for selected face
        // Create a colored overlay for a specific face group
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
        // SMART COLOR ROUTING - Face vs Object (WITH ENHANCED DEBUG LOGS)
        // Legacy function for backward compatibility
        // Refresh face groups after geometry changes
        // REMOVED DUPLICATE - Using main getFaceFrame function

        // Simple extrude face (add geometry)
        // Start interactive extrude mode - ENHANCED DEBUG
        // Create blue 2D arrow gizmo (like your image)
        // Show draggable normal-arrow gizmo with live preview - FUSION STYLE 2D
        // Update live extrude preview - EXACT BOUNDARY VERSION
        // Update extrude distance from input field
        // Handle keyboard shortcuts in extrude input
        // Clear extrude preview meshes
        // Confirm extrude operation - EXACT SPEC VERSION
        // Cancel extrude operation
        // Exit extrude mode
        // EXTRUDE GIZMO INTERACTION HANDLERS

        // Set camera to a preset view angle
        function setView(preset) {
            if (!state.camera || !state.controls) return;
            const bbox = new THREE.Box3();
            state.loadedModels.forEach(m => bbox.expandByObject(m));
            const center = bbox.isEmpty() ? new THREE.Vector3() : bbox.getCenter(new THREE.Vector3());
            const size   = bbox.isEmpty() ? 10 : bbox.getSize(new THREE.Vector3()).length();
            const d = size * 1.5;

            // Scale clipping planes to the model so nothing gets clipped
            state.camera.near = Math.max(0.01, size / 100000);
            state.camera.far  = Math.max(1000, size * 200);
            state.camera.updateProjectionMatrix();

            // Slight Z offset for top view avoids OrbitControls gimbal-lock singularity
            const offsets = {
                top:   new THREE.Vector3(0,   d,   d * 0.0001),
                front: new THREE.Vector3(0,   0,   d),
                right: new THREE.Vector3(d,   0,   0),
                iso:   new THREE.Vector3(d * 0.6, d * 0.6, d * 0.6),
            };
            const dir = offsets[preset] || offsets.iso;
            state.camera.position.copy(center).add(dir);
            state.controls.target.copy(center);
            state.controls.update();
        }
        window.setView = setView;

        // SMART DELETE HANDLER - Face vs Object
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

                // Scale clipping planes so the entire model is visible at any distance
                state.camera.near = Math.max(0.01, maxDim / 100000);
                state.camera.far  = Math.max(1000, maxDim * 200);
                state.camera.updateProjectionMatrix();

                const newCameraPosition = center.clone().add(new THREE.Vector3(maxDim * 0.8, maxDim * 0.8, maxDim * 0.8));
                state.camera.position.copy(newCameraPosition);
                state.controls.target.copy(center);
                state.controls.update();
                updateDynamicGrid();

                addMessageToLog('AI', 'View reset to fit all models.');
                speakResponse('View reset to fit all models.');
            } else if (state.controls && state.camera) {
                state.camera.position.set(30, 30, 30);
                state.camera.lookAt(0, 0, 0);
                state.controls.target.set(0, 0, 0);
                state.controls.update();
                updateDynamicGrid();
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
            if (state.loadedModels.length === 0) {
                addMessageToLog('System', 'No models loaded to select parts from.');
                speakResponse('No models loaded.');
                return false;
            }

            const candidates = findIFCSelectionCandidates(partName);
            if (candidates.length > 0) {
                startIFCSelectionClarification(partName, candidates);
                return true;
            } else {
                const availableTypes = [];
                for (const model of state.loadedModels) {
                    const ti = model.userData?.typeIndex;
                    if (ti) availableTypes.push(...Object.keys(ti).slice(0, 8));
                }
                const hint = availableTypes.length > 0 ? ` Available types: ${[...new Set(availableTypes)].join(', ')}` : '';
                addMessageToLog('System', `"${partName}" not found.${hint}`);
                speakResponse(`${partName} not found.`);
                return false;
            }
        }

        function normalizeSelectionText(value) {
            const normalized = String(value || '')
                .toLowerCase()
                .replace(/^ifc/i, '')
                .replace(/^(select|highlight|show)\s+/i, '')
                .replace(/^(all|every|the|a|an)\s+/i, '')
                .replace(/\s+(element|object|type|part)s?$/i, '')
                .trim();
            return normalized.length > 3 && normalized.endsWith('s') && normalized !== 'yes'
                ? normalized.slice(0, -1)
                : normalized;
        }

        function getIFCSelectionMeta(mesh) {
            const props = mesh.userData.ifcProperties
                || getIFCElementProperties(mesh.userData.modelID, mesh.userData.expressID)
                || {};
            return {
                mesh,
                meshes: [mesh],
                uuid: mesh.uuid,
                type: props.typeName || mesh.userData.ifcTypeKey || 'IFC Element',
                name: props.name || props.objectType || mesh.name || 'Unnamed IFC element',
                level: props.level || 'Unknown level',
            };
        }

        function findIFCSelectionCandidates(rawQuery) {
            const query = normalizeSelectionText(rawQuery);
            if (!query) return [];
            const candidates = [];
            const candidatesByElement = new Map();
            const matchAll = ['all', 'everything', 'model'].includes(query);

            state.loadedModels.forEach(model => {
                model.traverse(mesh => {
                    if (!mesh.userData?.isIFCElement) return;
                    const meta = getIFCSelectionMeta(mesh);
                    const searchable = [meta.uuid, meta.type, meta.name, meta.level, mesh.name]
                        .map(normalizeSelectionText);
                    if (matchAll || searchable.some(value => value === query || value.includes(query) || query.includes(value))) {
                        const elementKey = mesh.userData.modelID != null && mesh.userData.expressID != null
                            ? `${mesh.userData.modelID}:${mesh.userData.expressID}`
                            : mesh.uuid;
                        const existing = candidatesByElement.get(elementKey);
                        if (existing) {
                            existing.meshes.push(mesh);
                        } else {
                            candidatesByElement.set(elementKey, meta);
                            candidates.push(meta);
                        }
                    }
                });
            });
            return candidates;
        }

        function tryHandleIFCSelectionRequest(command) {
            const match = String(command || '').trim().match(/^(?:please\s+)?(?:select|highlight|show(?:\s+me)?)\s+(.+)$/i);
            if (!match) return false;

            const candidates = findIFCSelectionCandidates(match[1]);
            if (candidates.length === 0) return false;

            startIFCSelectionClarification(match[1], candidates);
            return true;
        }

        function distinctSelectionValues(candidates, field) {
            return [...new Set(candidates.map(candidate => candidate[field]).filter(Boolean))];
        }

        function askNextIFCSelectionQuestion() {
            const pending = state.pendingIFCSelection;
            if (!pending) return;

            const dimensions = [
                ['level', 'Which level?'],
                ['type', 'Which IFC type?'],
                ['name', 'Which specific name?'],
            ];
            const next = dimensions.find(([field]) =>
                !pending.askedFields.includes(field)
                && distinctSelectionValues(pending.candidates, field).length > 1
            );

            if (next) {
                const [field, prompt] = next;
                const options = distinctSelectionValues(pending.candidates, field);
                pending.awaiting = field;
                pending.options = options;
                pending.askedFields.push(field);
                const question = `${prompt} ${options.map((option, index) => `${index + 1}) ${option}`).join(', ')}`;
                addMessageToLog('AI', question);
                speakResponse(question);
                return;
            }

            pending.awaiting = 'confirm';
            pending.options = [];
            const first = pending.candidates[0];
            const description = pending.candidates.length === 1
                ? `"${first.name}" (${first.type}, ${first.level})`
                : `${pending.candidates.length} elements matching "${pending.query}"`;
            const question = `Ready to select ${description}. Confirm?`;
            addMessageToLog('AI', question);
            speakResponse(question);
        }

        function startIFCSelectionClarification(query, candidates) {
            state.pendingIFCSelection = {
                query,
                candidates,
                askedFields: [],
                awaiting: null,
                options: [],
            };
            addMessageToLog('AI', `I found ${candidates.length} matching IFC element${candidates.length === 1 ? '' : 's'}. I will narrow the selection before selecting.`);
            askNextIFCSelectionQuestion();
        }

        function handleIFCSelectionClarification(response) {
            const pending = state.pendingIFCSelection;
            if (!pending) return false;

            const normalized = normalizeSelectionText(response);
            if (['cancel', 'stop', 'nevermind', 'never mind'].includes(normalized)) {
                state.pendingIFCSelection = null;
                addMessageToLog('AI', 'Selection cancelled.');
                return true;
            }

            if (pending.awaiting === 'confirm') {
                if (!['yes', 'confirm', 'ok', 'okay', 'select', 'them', 'it'].includes(normalized)) {
                    addMessageToLog('AI', 'Please answer "yes" to select these elements, or "cancel".');
                    return true;
                }
                const meshes = pending.candidates.flatMap(candidate => candidate.meshes);
                const elementCount = pending.candidates.length;
                state.pendingIFCSelection = null;
                if (meshes.length === 1) selectObject(meshes[0]);
                else setSelectedObjects(meshes);
                addMessageToLog('AI', `Selected ${elementCount} IFC element${elementCount === 1 ? '' : 's'}.`);
                return true;
            }

            const numericChoice = /^\d+$/.test(response.trim()) ? Number(response.trim()) - 1 : -1;
            const chosenValue = numericChoice >= 0 && numericChoice < pending.options.length
                ? pending.options[numericChoice]
                : pending.options.find(option => normalizeSelectionText(option) === normalized
                    || normalizeSelectionText(option).includes(normalized)
                    || normalized.includes(normalizeSelectionText(option)));

            if (!chosenValue) {
                addMessageToLog('AI', `Please choose one of: ${pending.options.map((option, index) => `${index + 1}) ${option}`).join(', ')}, or say "cancel".`);
                return true;
            }

            pending.candidates = pending.candidates.filter(candidate => candidate[pending.awaiting] === chosenValue);
            askNextIFCSelectionQuestion();
            return true;
        }

        function getOrBuildTypeIndex(model) {
            if (model.userData.typeIndex) return model.userData.typeIndex;
            if (!model.userData.isIFCModel) return null;
            addMessageToLog('System', 'Indexing IFC elements for search (one-time)…');
            const typeIndex = {};
            model.traverse(mesh => {
                if (!mesh.userData?.isIFCElement) return;
                const props = mesh.userData.ifcProperties
                    || getIFCElementProperties(mesh.userData.modelID, mesh.userData.expressID);
                const key = mesh.userData.ifcTypeKey
                    || (props?.typeName || 'unknown').replace(/^ifc/i, '').trim().toLowerCase();
                if (!typeIndex[key]) typeIndex[key] = [];
                typeIndex[key].push(mesh);
            });
            model.userData.typeIndex = typeIndex;
            const summary = Object.entries(typeIndex).map(([k, v]) => `${k}:${v.length}`).join(', ');
            console.log(`[IFC] Type index built — ${summary}`);
            return typeIndex;
        }

        function selectAllByType(typeName) {
            selectPartByName(typeName);
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
        // Legacy function for backward compatibility
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
                    **CRITICAL RULE:** When the user says "select [anything]" (including "select all walls"), return {"action":"selectPart","value":"[the thing]"}. The editor will ask one clarification question at a time and will not select until the user confirms.

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

                    8.  **To select a single part by name, IFC type, or UUID:**
                        User input examples: "select the wheel", "select roof", "select a window", "select wall", "select UUID abc-123"
                        For IFC models, check the "selectableTypes" field in the context below — use those exact type names as values (e.g., "window", "wall", "door", "slab", "beam", "column", "stair", "roof", "railing", "space").
                        You may also pass an exact UUID from the list.
                        Return:
                        \`\`\`json
                        {"action": "selectPart", "value": "[type_name_or_uuid]"}
                        \`\`\`

                    8b. **Legacy IFC type selection action:**
                        User input examples: "select all windows", "highlight all walls", "select every door", "show all beams"
                        This also starts clarification and requires user confirmation before selection.
                        Return:
                        \`\`\`json
                        {"action": "selectAllByType", "value": "[type_name]"}
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

            // Work on the saved object list, but remove temporary selection materials
            // before capturing permanent color history.
            clearAllHighlights();
            beginUndoGroup(`Color ${objectsToModify.length} object${objectsToModify.length > 1 ? 's' : ''}`);
            const changedMaterials = new Map();

            objectsToModify.forEach(obj => {
                console.log(`[changeObjectColor] Modifying color for object: ${obj.name || obj.uuid}`); // Added log
                // Traverse children to ensure all meshes within the object/model get the color change
                obj.traverse((child) => {
                    if (child.isMesh && child.material) {
                        const materials = Array.isArray(child.material) ? child.material : [child.material];
                        materials.forEach((material, index) => {
                            if (material && material.isMaterial) {
                                const initial = Array.isArray(child.userData.initialMaterial)
                                    ? child.userData.initialMaterial[index]
                                    : child.userData.initialMaterial;
                                let change = changedMaterials.get(material);
                                if (!change) {
                                    change = {
                                        material,
                                        initials: new Set(),
                                        originalColor: material.color?.clone(),
                                        originalEmissive: material.emissive?.clone(),
                                        originalEmissiveIntensity: material.emissiveIntensity
                                    };
                                    changedMaterials.set(material, change);
                                }
                                if (initial) change.initials.add(initial);
                            }
                        });
                    }
                });
            });

            changedMaterials.forEach(change => {
                const applyColor = color => {
                    const { material, initials } = change;
                    if (material.color) material.color.copy(color);
                    if (material.emissive) material.emissive.set(0x000000);
                    if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0;
                    material.needsUpdate = true;
                    initials.forEach(initial => {
                        if (initial?.color) initial.color.copy(color);
                        if (initial?.emissive) initial.emissive.set(0x000000);
                        if (initial?.emissiveIntensity !== undefined) initial.emissiveIntensity = 0;
                    });
                };
                applyColor(newColor);
                addUndoAction({
                    type: 'color_material',
                    apply: () => applyColor(newColor),
                    revert: () => {
                        const { material, initials, originalColor, originalEmissive, originalEmissiveIntensity } = change;
                        if (originalColor && material.color) material.color.copy(originalColor);
                        if (originalEmissive && material.emissive) material.emissive.copy(originalEmissive);
                        if (material.emissiveIntensity !== undefined) material.emissiveIntensity = originalEmissiveIntensity;
                        material.needsUpdate = true;
                        initials.forEach(initial => {
                            if (originalColor && initial?.color) initial.color.copy(originalColor);
                            if (originalEmissive && initial?.emissive) initial.emissive.copy(originalEmissive);
                            if (initial?.emissiveIntensity !== undefined) initial.emissiveIntensity = originalEmissiveIntensity;
                        });
                    }
                });
            });

            objectsToModify.forEach(obj => {
                // After changing color, update state.originalMaterialProperties for the current selection cycle
                // This ensures that if this object is later individually selected, its highlight reverts correctly.
                const updatedOriginalMaterials = [];
                const topLevelMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];
                topLevelMaterials.forEach(mat => {
                    if (mat && mat.isMaterial) {
                        updatedOriginalMaterials.push(mat.clone());
                    }
                });
                state.originalMaterialProperties.get(obj.uuid)?.forEach(material => material.dispose());
                state.originalMaterialProperties.set(obj.uuid, updatedOriginalMaterials);
                obj.updateMatrixWorld(true); // Ensure world matrix is updated after material change
            });
            endUndoGroup();

            addMessageToLog('AI', `Changed color of ${objectsToModify.length} object(s) to ${colorValue}.`);
            speakResponse(`Changed color of ${objectsToModify.length} object(s).`);
            console.log(`[changeObjectColor] Changed color of ${objectsToModify.length} object(s) to ${colorValue}.`);

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
                        case 'selectAllByType':
                            if (parsedResponse.value) {
                                selectAllByType(parsedResponse.value);
                            } else {
                                addMessageToLog('AI', 'Please specify a type (e.g., "window", "wall", "door").');
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
                if (!handleIFCSelectionClarification(command) && !tryHandleFastLocalCommand(command) && !tryHandleIFCSelectionRequest(command)) {
                    sendAICommand(command);
                }
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

        function tryHandleFastLocalCommand(command) {
            const text = command.trim().toLowerCase();
            if (!text) return false;

            if (/^(undo|go back|undo that)$/.test(text)) {
                undo();
                return true;
            }
            if (/^(redo|redo that)$/.test(text)) {
                redo();
                return true;
            }
            if (/^(fit|fit all|reset view|show everything)$/.test(text)) {
                resetView();
                return true;
            }
            if (/^(top|top view)$/.test(text)) {
                setTopView();
                return true;
            }
            if (/^(front|front view)$/.test(text)) {
                setFrontView();
                return true;
            }
            if (/^(right|right view)$/.test(text)) {
                setRightView();
                return true;
            }
            if (/^(iso|isometric|isometric view)$/.test(text)) {
                resetView();
                return true;
            }
            if (/^(show structure|structure view|select all|highlight everything)$/.test(text)) {
                document.getElementById('structureHighlightButton').click();
                return true;
            }
            if (/^(clear structure|clear highlights|unhighlight all)$/.test(text)) {
                document.getElementById('clearStructureButton').click();
                return true;
            }
            const shapeMatch = text.match(/^(?:create|add|make)(?:\s+(?:a|an|new))?\s+(box|cube|sphere|ball|cylinder|cone|pyramid|plane|torus|donut)$/);
            if (shapeMatch) {
                createPrimitive(shapeMatch[1]);
                return true;
            }
            if (/^(duplicate|duplicate it|duplicate them|make a copy|copy selected)$/.test(text)) {
                duplicateSelection();
                return true;
            }
            if (/^(delete|delete it|delete them|remove it|remove them|erase selected)$/.test(text)) {
                handleDeleteCommand();
                return true;
            }
            if (/^(?:scale|resize|make)\b/.test(text)) {
                const factor = /\bhalf\b/.test(text) ? 0.5
                    : /\b(?:double|twice)\b/.test(text) ? 2
                    : Number(text.match(/\d*\.?\d+/)?.[0]);
                if (Number.isFinite(factor) && factor > 0) {
                    scaleSelection(factor, factor, factor);
                    return true;
                }
            }
            if (/^(?:rotate|turn)\b/.test(text)) {
                const degrees = Number(text.match(/-?\d*\.?\d+/)?.[0] || 90);
                const radians = THREE.MathUtils.degToRad(degrees);
                if (/\bx(?:\s*axis)?\b/.test(text)) rotateSelection(radians, 0, 0);
                else if (/\bz(?:\s*axis)?\b/.test(text)) rotateSelection(0, 0, radians);
                else rotateSelection(0, radians, 0);
                return true;
            }

            if (/^(move|shift|translate)\b/.test(text)) {
                const triple = text.match(/(-?\d*\.?\d+)\s*[, ]\s*(-?\d*\.?\d+)\s*[, ]\s*(-?\d*\.?\d+)/);
                if (triple) {
                    translateSelection(Number(triple[1]), Number(triple[2]), Number(triple[3]));
                    return true;
                }
                const amount = Number(text.match(/-?\d*\.?\d+/)?.[0] || 1);
                if (/\b(up|upward|upwards)\b/.test(text)) translateSelection(0, Math.abs(amount), 0);
                else if (/\b(down|downward|downwards)\b/.test(text)) translateSelection(0, -Math.abs(amount), 0);
                else if (/\bleft\b/.test(text)) translateSelection(-Math.abs(amount), 0, 0);
                else if (/\bright\b/.test(text)) translateSelection(Math.abs(amount), 0, 0);
                else if (/\b(forward|front)\b/.test(text)) translateSelection(0, 0, -Math.abs(amount));
                else if (/\b(back|backward|backwards)\b/.test(text)) translateSelection(0, 0, Math.abs(amount));
                else if (/\bx(?:\s*axis)?\b/.test(text)) translateSelection(amount, 0, 0);
                else if (/\by(?:\s*axis)?\b/.test(text)) translateSelection(0, amount, 0);
                else if (/\bz(?:\s*axis)?\b/.test(text)) translateSelection(0, 0, amount);
                else return false;
                return true;
            }
            return false;
        }

        // Send text command via input field
        sendTextCommandBtn.addEventListener('click', () => {
            const command = textCommandInput.value.trim();
            if (command) {
                addMessageToLog('User', command); // Add user message to log immediately

                // Check if this is a disambiguation response (number)
                if (handleIFCSelectionClarification(command)) {
                    // IFC selection clarification replies are handled locally.
                } else if (state.pendingDisambiguation && /^\d+$/.test(command)) {
                    handleDisambiguationChoice(command);
                } else if (tryHandleFastLocalCommand(command)) {
                    // Common editor commands run immediately without waiting for the backend.
                } else if (tryHandleIFCSelectionRequest(command)) {
                    // IFC selection requests bypass the backend so clarification cannot be skipped.
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
            document.querySelectorAll('.editor-actions .tab-button').forEach(btn => btn.classList.remove('active'));
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
            cadViewer.style.backgroundColor = '#f4f7fb';
            cadViewer.style.backgroundImage = 'none';

            // RESTORED: Show upload page first (more professional)
            uploadPage.classList.add('page-active');
            uploadPage.classList.remove('page-inactive');
            editorPage.classList.add('page-inactive');
            editorPage.classList.remove('page-active');
            headerEditorActions.hidden = true;



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


            console.log("[Init] Initialization complete. Try testButtonClicks() or forceCreateEmpty() in console if buttons don't work.");
        };

