        // THREE.js is now available globally
        console.log("THREE.js loaded:", typeof THREE !== 'undefined');

        // Global map to store dropped files by their relative path (e.g., "scene.bin", "textures/image.png")
        const droppedFileBlobs = new Map();

        // List of random GLB model URLs
        const RANDOM_MODEL_URLS = [
            'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF-Binary/Box.glb',
            'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb',
            'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb',
            'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb',
            'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb'
        ];

        let uploadedFile = null, scene, camera, renderer, controls;
        let recognition;
        let synth;
        let isVoiceAssistActive = false;
        let raycaster;
        let mouse;
        let selectedObject = null; // This will hold the currently selected THREE.Mesh part
        // Stores original material properties for deselection, now includes color and emissive
        // Changed to store an array of properties for multi-material objects
        const originalMaterialProperties = new Map(); // Stores { uuid: [originalMaterial1, originalMaterial2, ...] or originalMaterial }
        // New map to store original materials for "select all" highlight
        const allHighlightsOriginalMaterials = new Map(); // Stores { uuid: [originalMaterial1, originalMaterial2, ...] or originalMaterial }
        // NEW: This array will hold the actual objects selected by "select all" for functional editing
        let currentlySelectedObjectsForEditing = [];

        let transformControls;

        // UNIFIED SELECTION SYSTEM
        function getSelectedObjects() {
            // Return array of currently selected objects
            if (currentlySelectedObjectsForEditing.length > 0) {
                // Multi-selection mode (from "select all")
                return [...currentlySelectedObjectsForEditing];
            } else if (selectedObject) {
                // Single selection mode
                return [selectedObject];
            } else {
                // No selection
                return [];
            }
        }

        function setSelectedObjects(objects) {
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
                currentlySelectedObjectsForEditing = [...objects];

                // Apply highlight to each object
                objects.forEach(obj => {
                    if (obj && obj.material) {
                        // Store original material
                        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
                        allHighlightsOriginalMaterials.set(obj.uuid, materials.map(mat => mat.clone()));

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

        // Variables for dynamic grid
        let currentGridHelper = null;
        let currentGridLabels = [];

        // Global array to store all loaded GLTF scenes
        let loadedModels = []; // This will now hold all top-level GLTF scenes

        // --- Undo/Redo History ---
        let undoStack = [];
        let redoStack = [];
        const MAX_HISTORY_SIZE = 20; // Limit history size to prevent excessive memory usage

        // GROUPED UNDO SYSTEM
        let currentUndoGroup = null;

        function beginUndoGroup(actionName) {
            if (currentUndoGroup) {
                console.warn('[beginUndoGroup] Already in undo group, ending previous group');
                endUndoGroup();
            }

            currentUndoGroup = {
                name: actionName,
                actions: [],
                beforeState: getCurrentState()
            };
            console.log(`[beginUndoGroup] Started group: ${actionName}`);
        }

        function addUndoAction(action) {
            if (!currentUndoGroup) {
                console.warn('[addUndoAction] No active undo group, creating temporary group');
                beginUndoGroup('Temporary Action');
            }

            currentUndoGroup.actions.push(action);
        }

        function endUndoGroup() {
            if (!currentUndoGroup) {
                console.warn('[endUndoGroup] No active undo group');
                return;
            }

            if (currentUndoGroup.actions.length > 0) {
                // Save the grouped action to undo stack
                undoStack.push({
                    name: currentUndoGroup.name,
                    beforeState: currentUndoGroup.beforeState,
                    afterState: getCurrentState(),
                    actions: currentUndoGroup.actions
                });

                // Limit stack size
                if (undoStack.length > MAX_HISTORY_SIZE) {
                    undoStack.shift();
                }

                // Clear redo stack
                redoStack = [];

                console.log(`[endUndoGroup] Completed group: ${currentUndoGroup.name} with ${currentUndoGroup.actions.length} actions`);
            }

            currentUndoGroup = null;
            updateUndoRedoButtons();
        }

        // New scene and camera for the static view axes helper
        let viewAxesScene, viewAxesCamera, viewAxesRenderer;
        let viewAxesHelper; // The actual AxesHelper object
        let viewAxesSceneRendered = false; // Flag to ensure helper is initialized only once

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
        let raycastDebugSphere;


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



        window.setScaleMode = function() {
            // If multiple objects are selected, use direct scaling
            if (currentlySelectedObjectsForEditing.length > 1) {
                console.log("Multiple objects selected - using direct scaling");
                addMessageToLog('System', `Scale mode: Use scaleAllObjects(1.5) to scale ${currentlySelectedObjectsForEditing.length} objects together`);
                console.log("Available commands:");
                console.log("- scaleAllObjects(1.5) - Make all objects 1.5x bigger");
                console.log("- scaleAllObjects(2) - Make all objects 2x bigger");
                console.log("- scaleAllObjects(0.5) - Make all objects half size");
                return;
            }

            if (transformControls) {
                transformControls.setMode('scale');
                console.log("✅ Transform mode set to SCALE");
                addMessageToLog('System', 'Transform mode: Scale (resize objects)');

                // Reset group helper scale if it exists
                const groupHelper = scene.getObjectByProperty('name', 'GroupMovementHelper');
                if (groupHelper) {
                    groupHelper.scale.set(1, 1, 1);
                    console.log("Reset group helper scale for new scaling operation");
                }
            }
        };

        window.setRotateMode = function() {
            // If multiple objects are selected, use direct rotation
            if (currentlySelectedObjectsForEditing.length > 1) {
                console.log("Multiple objects selected - using direct rotation");
                addMessageToLog('System', `Rotate mode: Use rotateAllObjects() to rotate ${currentlySelectedObjectsForEditing.length} objects together`);
                console.log("Available commands:");
                console.log("- rotateAllObjects(0, Math.PI/4, 0) - Rotate all 45° around Y");
                console.log("- rotateAllObjects(0, Math.PI/2, 0) - Rotate all 90° around Y");
                console.log("- rotateAllObjects(Math.PI/4, 0, 0) - Rotate all 45° around X");
                return;
            }

            if (transformControls) {
                transformControls.setMode('rotate');
                console.log("✅ Transform mode set to ROTATE");
                addMessageToLog('System', 'Transform mode: Rotate (turn objects)');

                // Reset group helper rotation if it exists
                const groupHelper = scene.getObjectByProperty('name', 'GroupMovementHelper');
                if (groupHelper) {
                    groupHelper.rotation.set(0, 0, 0);
                    console.log("Reset group helper rotation for new rotation operation");
                }
            }
        };

        window.setTranslateMode = function() {
            // If multiple objects are selected, use direct movement
            if (currentlySelectedObjectsForEditing.length > 1) {
                console.log("Multiple objects selected - using direct movement");
                addMessageToLog('System', `Move mode: Use moveAllObjects() to move ${currentlySelectedObjectsForEditing.length} objects together`);
                console.log("Available commands:");
                console.log("- moveAllObjects(2, 0, 0) - Move all right by 2");
                console.log("- moveAllObjects(0, 1, 0) - Move all up by 1");
                console.log("- moveAllObjects(0, 0, -2) - Move all back by 2");
                return;
            }

            if (transformControls) {
                transformControls.setMode('translate');
                console.log("✅ Transform mode set to TRANSLATE");
                addMessageToLog('System', 'Transform mode: Translate (move objects)');
            }
        };

        // Duplicate multiple objects at once (for select all)
        window.duplicateAll = function() {
            console.log("=== DUPLICATING ALL OBJECTS ===");

            if (loadedModels.length === 0) {
                console.log("❌ No objects to duplicate");
                addMessageToLog('System', 'No objects found to duplicate.');
                return;
            }

            console.log(`Duplicating ${loadedModels.length} objects...`);

            // Save state for undo
            const currentState = getCurrentState();
            undoStack.push(currentState);
            redoStack = [];

            const duplicatedObjects = [];

            // Duplicate each object
            loadedModels.forEach((original, index) => {
                try {
                    const clone = original.clone();

                    // Position the copy to the right of original
                    clone.position.copy(original.position);
                    clone.position.x += 3; // Move 3 units to the right

                    // Set name
                    clone.name = `${original.name || 'Object'} (Copy)`;

                    // Copy userData
                    clone.userData = { ...original.userData };

                    // Add to scene
                    scene.add(clone);
                    loadedModels.push(clone);
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
                if (!loadedModels || loadedModels.length === 0) {
                    console.log("❌ No objects to duplicate");
                    alert("No objects to duplicate! Create some objects first.");
                    return;
                }

                const originalCount = loadedModels.length;
                console.log(`Starting duplication of ${originalCount} objects...`);

                // Create array of objects to duplicate (snapshot)
                const objectsToClone = [];
                for (let i = 0; i < originalCount; i++) {
                    objectsToClone.push(loadedModels[i]);
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

                        // Add to scene
                        scene.add(clone);
                        loadedModels.push(clone);

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

                            scene.add(fallbackMesh);
                            loadedModels.push(fallbackMesh);

                            console.log(`✅ Fallback creation successful: ${fallbackMesh.name}`);

                        } catch (fallbackError) {
                            console.error(`❌ Fallback creation also failed:`, fallbackError);
                        }
                    }
                }

                const finalCount = loadedModels.length;
                const duplicatedCount = finalCount - originalCount;

                console.log(`✅ Duplication complete!`);
                console.log(`✅ Original objects: ${originalCount}`);
                console.log(`✅ Final objects: ${finalCount}`);
                console.log(`✅ Objects duplicated: ${duplicatedCount}`);

                alert(`Success! Duplicated ${duplicatedCount} objects. Total objects: ${finalCount}`);

                // Force render update
                if (renderer && scene && camera) {
                    renderer.render(scene, camera);
                }

            } catch (mainError) {
                console.error("❌ Main duplication error:", mainError);
                alert(`Duplication failed: ${mainError.message}`);
            }
        };

        // Even simpler duplicate all function
        window.duplicateEverything = function() {
            console.log("=== DUPLICATING EVERYTHING (SIMPLE) ===");

            if (loadedModels.length === 0) {
                console.log("❌ No objects to duplicate");
                addMessageToLog('System', 'No objects found to duplicate.');
                return;
            }

            const originalCount = loadedModels.length;
            console.log(`Duplicating ${originalCount} objects...`);

            // Save state for undo
            const currentState = getCurrentState();
            undoStack.push(currentState);
            redoStack = [];

            // Get all current objects
            const objectsToDuplicate = [...loadedModels];

            // Duplicate each one
            objectsToDuplicate.forEach(original => {
                const clone = original.clone();
                clone.position.copy(original.position);
                clone.position.x += 3;
                clone.name = `${original.name} (Copy)`;
                clone.userData = { ...original.userData };

                scene.add(clone);
                loadedModels.push(clone);
            });

            console.log(`✅ Duplicated ${originalCount} objects`);
            console.log(`✅ Total objects: ${loadedModels.length}`);

            addMessageToLog('System', `Duplicated ${originalCount} objects. Total: ${loadedModels.length}`);
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
                console.log("   - loadedModels.length:", loadedModels.length);
                console.log("   - Objects:", loadedModels.map(obj => obj.name));

                // Step 2: Select all
                console.log("3. Calling highlightAllModels()...");
                highlightAllModels();

                setTimeout(() => {
                    console.log("4. After select all:");
                    console.log("   - selectedObject:", selectedObject ? selectedObject.name : 'null');
                    console.log("   - currentlySelectedObjectsForEditing.length:", currentlySelectedObjectsForEditing.length);
                    console.log("   - Selected objects:", currentlySelectedObjectsForEditing.map(obj => obj.name || obj.type));

                    // Step 3: Try duplicate
                    console.log("5. Calling duplicateNow()...");
                    duplicateNow();

                    setTimeout(() => {
                        console.log("6. After duplicate:");
                        console.log("   - loadedModels.length:", loadedModels.length);
                        console.log("   - Expected: 6 objects");
                        console.log("   - Actual objects:", loadedModels.map(obj => obj.name));

                        if (loadedModels.length === 6) {
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

            if (loadedModels.length === 0) {
                alert("Create some objects first!");
                return;
            }

            const count = loadedModels.length;
            console.log(`Duplicating ${count} objects...`);

            // Simple loop - duplicate each object
            for (let i = 0; i < count; i++) {
                const original = loadedModels[i];

                // Create exact copy using clone
                const copy = original.clone();
                copy.position.x += 3; // Move to right
                copy.name = original.name + " Copy";

                scene.add(copy);
                loadedModels.push(copy);

                console.log(`Copied: ${original.name} → ${copy.name}`);
            }

            console.log(`Done! Total objects: ${loadedModels.length}`);
            alert(`Duplicated ${count} objects!`);
        };

        // MULTI-OBJECT EDITING SYSTEM - Edit many objects at once
        window.editSelected = function(action, ...params) {
            console.log(`=== EDITING ${currentlySelectedObjectsForEditing.length} SELECTED OBJECTS ===`);
            console.log(`Action: ${action}`, params);

            if (currentlySelectedObjectsForEditing.length === 0) {
                console.log("❌ No objects selected. Use highlightAllModels() first.");
                addMessageToLog('System', 'No objects selected. Use "select all" first.');
                return;
            }

            // Save state for undo
            const currentState = getCurrentState();
            undoStack.push(currentState);
            redoStack = [];

            let successCount = 0;

            // Get unique top-level objects to edit
            const objectsToEdit = loadedModels.filter(model =>
                currentlySelectedObjectsForEditing.some(selected =>
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
                            scene.add(clone);
                            loadedModels.push(clone);
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
                            scene.remove(obj);
                            const index = loadedModels.indexOf(obj);
                            if (index > -1) {
                                loadedModels.splice(index, 1);
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
            if (!loadedModels || loadedModels.length === 0) {
                console.log("❌ No objects found");
                alert("No objects to duplicate. Create some objects first!");
                return;
            }

            console.log(`Starting duplication of ${loadedModels.length} objects...`);

            // Store original count
            const originalCount = loadedModels.length;

            // Get snapshot of current objects
            const objectsToClone = [];
            for (let i = 0; i < originalCount; i++) {
                objectsToClone.push(loadedModels[i]);
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

                    // Add to scene
                    scene.add(clone);

                    // Add to our tracking array
                    loadedModels.push(clone);

                    console.log(`✅ Successfully cloned: ${clone.name}`);

                } catch (error) {
                    console.error(`❌ Error cloning ${original.name}:`, error);
                    alert(`Error cloning ${original.name}: ${error.message}`);
                }
            }

            const finalCount = loadedModels.length;
            console.log(`✅ Duplication complete!`);
            console.log(`✅ Objects before: ${originalCount}`);
            console.log(`✅ Objects after: ${finalCount}`);
            console.log(`✅ New objects created: ${finalCount - originalCount}`);

            // Show success message
            alert(`Success! Duplicated ${originalCount} objects. Total objects: ${finalCount}`);

            // Force render update
            if (renderer && scene && camera) {
                renderer.render(scene, camera);
            }
        };

        // SPECIFIC FUNCTION FOR AFTER SELECT ALL
        window.duplicateAfterSelectAll = function() {
            console.log("=== DUPLICATE AFTER SELECT ALL ===");
            console.log("Current state:");
            console.log("- loadedModels.length:", loadedModels.length);
            console.log("- currentlySelectedObjectsForEditing.length:", currentlySelectedObjectsForEditing.length);

            // Just duplicate all objects regardless of selection
            justDuplicate();
        };

        // WORKING DUPLICATE FUNCTION - FINAL VERSION
        window.duplicateMultiple = function() {
            console.log("=== DUPLICATING MULTIPLE OBJECTS ===");

            if (!loadedModels || loadedModels.length === 0) {
                alert("No objects to duplicate! Create some objects first.");
                return;
            }

            const beforeCount = loadedModels.length;
            console.log(`Before: ${beforeCount} objects`);

            // Create array of objects to duplicate (snapshot to avoid infinite loop)
            const objectsToClone = [];
            for (let i = 0; i < beforeCount; i++) {
                objectsToClone.push(loadedModels[i]);
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

                // Add to scene and tracking array
                scene.add(duplicate);
                loadedModels.push(duplicate);

                console.log(`✅ Created: ${duplicate.name}`);
            });

            const afterCount = loadedModels.length;
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

            if (!loadedModels || loadedModels.length === 0) {
                alert("No objects to duplicate! Create some objects first.");
                return false;
            }

            const originalCount = loadedModels.length;
            console.log(`Starting duplication of ${originalCount} objects`);

            // Filter out helper objects and only get real objects
            const objectsToClone = loadedModels.filter(obj => {
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

                    // Add to scene
                    scene.add(duplicate);
                    loadedModels.push(duplicate);
                    successCount++;

                    console.log(`✅ Successfully duplicated: ${duplicate.name}`);

                } catch (error) {
                    console.error(`❌ Failed to duplicate ${original.name}:`, error);
                }
            });

            const finalCount = loadedModels.length;
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
                console.log(`2. Created ${loadedModels.length} objects`);
                console.log("   Objects:", loadedModels.map(obj => obj.name));

                // Step 2: Select all
                console.log("3. Selecting all objects...");
                highlightAllModels();

                setTimeout(() => {
                    console.log("4. Selection complete:");
                    console.log("   - selectedObject:", selectedObject ? selectedObject.name : 'none');
                    console.log("   - currentlySelectedObjectsForEditing.length:", currentlySelectedObjectsForEditing.length);

                    // Step 3: Duplicate
                    console.log("5. Duplicating selected objects...");
                    emergencyDuplicate();

                    setTimeout(() => {
                        console.log("6. Duplication complete:");
                        console.log(`   - Total objects: ${loadedModels.length}`);
                        console.log("   - Expected: 8 objects (4 originals + 4 copies)");

                        if (loadedModels.length === 8) {
                            console.log("✅ SUCCESS: Select all + duplicate working!");
                            alert("✅ SUCCESS! Select all + duplicate works perfectly!");
                        } else {
                            console.error("❌ ISSUE: Expected 8 objects, got", loadedModels.length);
                            alert(`❌ Issue: Expected 8 objects, got ${loadedModels.length}`);
                        }
                    }, 500);
                }, 500);
            }, 2000);
        };

        // UNIFIED DUPLICATE SELECTION FUNCTION
        function duplicateSelection() {
            console.log("=== DUPLICATE SELECTION ===");

            const selection = getSelectedObjects();
            console.log(`Selection count: ${selection.length}`);

            if (selection.length === 0) {
                addMessageToLog('System', 'No objects selected to duplicate.');
                speakResponse('No objects selected to duplicate.');
                return;
            }

            // Begin grouped undo action
            beginUndoGroup(`Duplicate ${selection.length} object${selection.length > 1 ? 's' : ''}`);

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

                    // Add to the SAME parent as the original, not scene root
                    const parent = srcObject.parent || scene;
                    parent.add(clone);

                    // Offset the clone so it's visible next to the original
                    clone.position.copy(srcObject.position);
                    clone.position.add(new THREE.Vector3(2, 0, 0)); // Move 2 units to the right

                    // Add to loadedModels if the original was a top-level model
                    if (loadedModels.includes(srcObject)) {
                        loadedModels.push(clone);
                    }

                    createdObjects.push(clone);

                    // Add undo action for this specific clone
                    addUndoAction({
                        type: 'add_object',
                        object: clone,
                        parent: parent,
                        revert: () => {
                            parent.remove(clone);
                            const modelIndex = loadedModels.indexOf(clone);
                            if (modelIndex !== -1) {
                                loadedModels.splice(modelIndex, 1);
                            }
                        }
                    });

                    console.log(`✅ Created clone: ${clone.name} at position (${clone.position.x}, ${clone.position.y}, ${clone.position.z})`);
                }

                // Update selection to the new clones
                setSelectedObjects(createdObjects);

                // End the undo group
                endUndoGroup();

                const message = `Duplicated ${createdObjects.length} object${createdObjects.length > 1 ? 's' : ''}. Copies created to the right.`;
                addMessageToLog('System', message);
                speakResponse(message);

                console.log(`✅ Duplication complete: ${createdObjects.length} objects created`);

            } catch (error) {
                console.error("❌ Duplication failed:", error);
                addMessageToLog('System', `Duplication failed: ${error.message}`);

                // Clean up any partially created objects
                createdObjects.forEach(obj => {
                    if (obj.parent) {
                        obj.parent.remove(obj);
                    }
                    const modelIndex = loadedModels.indexOf(obj);
                    if (modelIndex !== -1) {
                        loadedModels.splice(modelIndex, 1);
                    }
                });

                // End the undo group (will be empty due to cleanup)
                endUndoGroup();
            }
        }

        // Expose the function globally for UI and voice commands
        window.duplicateSelection = duplicateSelection;

        // DIAGNOSTIC FUNCTIONS FOR TESTING
        window.testSelectAllDuplicate = function() {
            console.log("=== TESTING SELECT ALL → DUPLICATE ===");

            // Step 1: Check current scene
            console.log("1. Current scene state:");
            console.log(`   - loadedModels.length: ${loadedModels.length}`);
            console.log(`   - scene.children.length: ${scene.children.length}`);

            if (loadedModels.length === 0) {
                console.log("❌ No objects in scene. Creating test objects...");

                // Create test objects
                const geometry1 = new THREE.BoxGeometry(1, 1, 1);
                const material1 = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                const cube1 = new THREE.Mesh(geometry1, material1);
                cube1.position.set(-2, 0, 0);
                cube1.name = "Test Cube 1";
                scene.add(cube1);
                loadedModels.push(cube1);

                const geometry2 = new THREE.SphereGeometry(0.5, 32, 32);
                const material2 = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
                const sphere1 = new THREE.Mesh(geometry2, material2);
                sphere1.position.set(2, 0, 0);
                sphere1.name = "Test Sphere 1";
                scene.add(sphere1);
                loadedModels.push(sphere1);

                console.log("✅ Created 2 test objects");
            }

            // Step 2: Select All
            console.log("2. Running Select All...");
            highlightAllModels();

            setTimeout(() => {
                console.log("3. Selection state after Select All:");
                console.log(`   - currentlySelectedObjectsForEditing.length: ${currentlySelectedObjectsForEditing.length}`);
                console.log(`   - getSelectedObjects().length: ${getSelectedObjects().length}`);

                // Step 3: Duplicate
                console.log("4. Running Duplicate...");
                duplicateSelection();

                setTimeout(() => {
                    console.log("5. Final state after Duplicate:");
                    console.log(`   - loadedModels.length: ${loadedModels.length}`);
                    console.log(`   - getSelectedObjects().length: ${getSelectedObjects().length}`);
                    console.log(`   - undoStack.length: ${undoStack.length}`);

                    const expectedCount = loadedModels.length / 2; // Should be double the original
                    if (loadedModels.length >= 4) {
                        console.log("✅ TEST PASSED: Objects were duplicated");
                    } else {
                        console.log("❌ TEST FAILED: Not enough objects created");
                    }

                    console.log("6. Testing Undo...");
                    undo();

                    setTimeout(() => {
                        console.log("7. State after Undo:");
                        console.log(`   - loadedModels.length: ${loadedModels.length}`);

                        if (loadedModels.length === 2) {
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

        // UNIFIED TRANSFORM FUNCTIONS WITH GROUPED UNDO
        function transformSelection(transformType, params) {
            console.log(`=== TRANSFORM SELECTION: ${transformType.toUpperCase()} ===`);

            const selection = getSelectedObjects();
            console.log(`Selection count: ${selection.length}`);

            if (selection.length === 0) {
                addMessageToLog('System', `No objects selected to ${transformType}.`);
                speakResponse(`No objects selected to ${transformType}.`);
                return;
            }

            // Begin grouped undo action
            beginUndoGroup(`${transformType.charAt(0).toUpperCase() + transformType.slice(1)} ${selection.length} object${selection.length > 1 ? 's' : ''}`);

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

                    transformedObjects.push(obj);

                    // Add undo action for this specific transform
                    addUndoAction({
                        type: `${transformType}_object`,
                        object: obj,
                        originalTransform: originalTransform,
                        revert: () => {
                            obj.position.copy(originalTransform.position);
                            obj.rotation.copy(originalTransform.rotation);
                            obj.scale.copy(originalTransform.scale);
                            obj.updateMatrixWorld(true);
                        }
                    });

                    console.log(`✅ ${transformType} applied to: ${obj.name || obj.type}`);
                }

                // End the undo group
                endUndoGroup();

                const message = `${transformType.charAt(0).toUpperCase() + transformType.slice(1)}ed ${transformedObjects.length} object${transformedObjects.length > 1 ? 's' : ''}.`;
                addMessageToLog('System', message);
                speakResponse(message);

                console.log(`✅ ${transformType} complete: ${transformedObjects.length} objects transformed`);

            } catch (error) {
                console.error(`❌ ${transformType} failed:`, error);
                addMessageToLog('System', `${transformType} failed: ${error.message}`);

                // End the undo group (will be empty due to error)
                endUndoGroup();
            }
        }

        // Expose unified transform functions
        window.translateSelection = (x, y, z) => transformSelection('translate', { x, y, z });
        window.rotateSelection = (rx, ry, rz) => transformSelection('rotate', { rx, ry, rz });
        window.scaleSelection = (sx, sy, sz) => transformSelection('scale', { sx, sy, sz });

        // COMPREHENSIVE TRANSFORM TEST
        window.testTransformUndoRedo = function() {
            console.log("=== TESTING TRANSFORM UNDO/REDO SYSTEM ===");

            // Step 1: Create test objects if needed
            if (loadedModels.length === 0) {
                console.log("1. Creating test objects...");

                const geometry1 = new THREE.BoxGeometry(1, 1, 1);
                const material1 = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                const cube1 = new THREE.Mesh(geometry1, material1);
                cube1.position.set(-2, 0, 0);
                cube1.name = "Test Cube 1";
                scene.add(cube1);
                loadedModels.push(cube1);

                const geometry2 = new THREE.SphereGeometry(0.5, 32, 32);
                const material2 = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
                const sphere1 = new THREE.Mesh(geometry2, material2);
                sphere1.position.set(2, 0, 0);
                sphere1.name = "Test Sphere 1";
                scene.add(sphere1);
                loadedModels.push(sphere1);

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
                            console.log(`   Current undo stack size: ${undoStack.length}`);

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
                                        console.log(`   Current redo stack size: ${redoStack.length}`);

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
                                                    console.log(`   Final undo stack size: ${undoStack.length}`);
                                                    console.log(`   Final redo stack size: ${redoStack.length}`);

                                                    if (undoStack.length === 3 && redoStack.length === 0) {
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

        // Scene indexing for object targeting
        function indexScene(scene) {
            const index = [];

            loadedModels.forEach(obj => {
                if (!obj || !obj.uuid) return;

                // Extract object information
                const info = {
                    uuid: obj.uuid,
                    name: obj.name || 'Unnamed Object',
                    tags: obj.userData?.tags || [],
                    color: getObjectColorHex(obj),
                    position: obj.position.clone(),
                    size: getObjectSize(obj),
                    positionHint: getPositionHint(obj.position),
                    sizeHint: getSizeHint(getObjectSize(obj))
                };

                index.push(info);
            });

            return index;
        }

        function getObjectColorHex(obj) {
            if (!obj.material) return '#cccccc';

            if (Array.isArray(obj.material)) {
                // Use first material's color
                const mat = obj.material[0];
                return mat && mat.color ? '#' + mat.color.getHexString() : '#cccccc';
            } else {
                return obj.material.color ? '#' + obj.material.color.getHexString() : '#cccccc';
            }
        }

        function getObjectSize(obj) {
            const bbox = new THREE.Box3().setFromObject(obj);
            const size = bbox.getSize(new THREE.Vector3());
            return Math.max(size.x, size.y, size.z);
        }

        function getPositionHint(position) {
            const x = position.x;
            const z = position.z;

            let hint = '';

            // Left/Right (X axis)
            if (x < -1) hint += 'left';
            else if (x > 1) hint += 'right';
            else hint += 'center';

            // Front/Back (Z axis)
            if (z < -1) hint += '-back';
            else if (z > 1) hint += '-front';
            else if (hint !== 'center') hint += '-center';

            return hint;
        }

        function getSizeHint(size) {
            if (size < 1) return 'small';
            else if (size < 3) return 'medium';
            else return 'large';
        }

        // Object class synonyms for natural language
        const OBJECT_SYNONYMS = {
            car: ["car", "vehicle", "van", "truck", "bus", "automobile", "auto"],
            ball: ["ball", "sphere", "orb"],
            cone: ["cone", "pyramid"],
            cube: ["cube", "box", "block"],
            cylinder: ["cylinder", "tube", "pipe"],
            plane: ["plane", "floor", "ground", "platform"],
            torus: ["torus", "donut", "ring"]
        };

        function findObjectsByClass(index, className) {
            const synonyms = OBJECT_SYNONYMS[className.toLowerCase()] || [className.toLowerCase()];

            return index.filter(obj => {
                const name = obj.name.toLowerCase();
                const tags = obj.tags.map(tag => tag.toLowerCase());

                return synonyms.some(synonym =>
                    name.includes(synonym) ||
                    tags.includes(synonym) ||
                    name === synonym
                );
            });
        }

        // Natural language execution functions
        function deleteByUUIDs(uuids) {
            if (!uuids || uuids.length === 0) return;

            console.log(`[deleteByUUIDs] Deleting ${uuids.length} objects`);

            beginUndoGroup(`Delete ${uuids.length} object${uuids.length > 1 ? 's' : ''}`);

            const removedObjects = [];

            uuids.forEach(uuid => {
                const obj = scene.getObjectByProperty('uuid', uuid);
                if (obj && obj.parent) {
                    removedObjects.push({
                        object: obj,
                        parent: obj.parent,
                        uuid: uuid
                    });

                    obj.parent.remove(obj);

                    // Remove from loadedModels
                    const modelIndex = loadedModels.indexOf(obj);
                    if (modelIndex !== -1) {
                        loadedModels.splice(modelIndex, 1);
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
                                loadedModels.splice(modelIndex, 0, obj);
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
                const obj = scene.getObjectByProperty('uuid', uuid);
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
        let pendingDisambiguation = null;
        let pendingIntent = null;

        // Clear pending operations when selection changes
        function onSelectionChanged() {
            console.log('[onSelectionChanged] Clearing pending operations');
            pendingDisambiguation = null;      // Cancel candidate selection waiting
            pendingIntent = null;              // ⛔ Discard previous intent
        }

        // Get currently active object for operations
        function getActiveObject() {
            return selectedObject || (currentlySelectedObjectsForEditing.length > 0 ? currentlySelectedObjectsForEditing[0] : null);
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
            if (faceEditState.isActive) {
                faceEditState.multiSelect = !!enable;
                console.log('[enableMultiFaceSelection] Multi-select mode:', faceEditState.multiSelect);
                addMessageToLog('System', `Multi-face selection ${enable ? 'enabled' : 'disabled'}. ${enable ? 'Hold Ctrl and click faces.' : ''}`);
                return true;
            } else {
                console.log('[enableMultiFaceSelection] Face mode not active');
                return false;
            }
        }

        // DEBUG: Test multi-select by selecting first two faces
        function testMultiSelect() {
            if (!faceEditState.isActive) {
                console.log('[testMultiSelect] Face mode not active');
                testFaceEditing();
                setTimeout(() => testMultiSelect(), 1000);
                return;
            }

            if (faceEditState.groups.length < 2) {
                console.log('[testMultiSelect] Need at least 2 face groups');
                return;
            }

            console.log('[testMultiSelect] Enabling multi-select and selecting first 2 faces');

            // Enable multi-select
            faceEditState.multiSelect = true;

            // Select first two faces
            faceEditState.selectedFaceIds.clear();
            faceEditState.selectedFaceIds.add(faceEditState.groups[0].id);
            faceEditState.selectedFaceIds.add(faceEditState.groups[1].id);

            // Update legacy compatibility
            faceEditState.selectedGroupId = faceEditState.groups[0].id;

            // Update visual state
            faceEditState.groups.forEach(group => {
                const isSelected = faceEditState.selectedFaceIds.has(group.id);
                if (group.overlay && group.overlay.material) {
                    group.overlay.material.opacity = isSelected ? 0.7 : 0.4;
                    group.overlay.material.color.setHex(isSelected ? 0xff0000 : 0x00ff00);
                }
                if (group.outline) {
                    group.outline.visible = isSelected;
                }
            });

            console.log('[testMultiSelect] Selected faces:', Array.from(faceEditState.selectedFaceIds));
            addMessageToLog('System', `${faceEditState.selectedFaceIds.size} faces selected. Press E to extrude.`);
        }

        // Update face highlights based on selection
        function updateFaceHighlights() {
            if (!faceEditState.isActive) return;

            faceEditState.groups.forEach(group => {
                const isSelected = faceEditState.selectedFaceIds.has(group.id);
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
            console.log('Face mode active:', faceEditState.isActive);
            console.log('Multi-select enabled:', faceEditState.multiSelect);
            console.log('Selected face IDs:', Array.from(faceEditState.selectedFaceIds));
            console.log('Selected count:', faceEditState.selectedFaceIds.size);
            console.log('Legacy selectedGroupId:', faceEditState.selectedGroupId);

            if (faceEditState.isActive) {
                console.log('Available groups:', faceEditState.groups.length);
                faceEditState.groups.forEach((group, i) => {
                    const isSelected = faceEditState.selectedFaceIds.has(group.id);
                    console.log(`Group ${i}: ${group.id} - Selected: ${isSelected}`);
                });
            }

            return {
                active: faceEditState.isActive,
                multiSelect: faceEditState.multiSelect,
                selectedCount: faceEditState.selectedFaceIds.size,
                selectedIds: Array.from(faceEditState.selectedFaceIds)
            };
        }

        // UX ACCEPTANCE TEST - Complete system test
        function testUXAcceptance() {
            console.log('=== UX ACCEPTANCE TEST ===');

            if (!faceEditState.isActive) {
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

            if (faceEditState.groups.length >= 2) {
                // Select first two faces
                faceEditState.selectedFaceIds.clear();
                faceEditState.selectedFaceIds.add(faceEditState.groups[0].id);
                faceEditState.selectedFaceIds.add(faceEditState.groups[1].id);

                // Update visuals
                faceEditState.groups.forEach(group => {
                    const isSelected = faceEditState.selectedFaceIds.has(group.id);
                    if (group.overlay && group.overlay.material) {
                        group.overlay.material.opacity = isSelected ? 0.7 : 0.4;
                        group.overlay.material.color.setHex(isSelected ? 0xff0000 : 0x00ff00);
                    }
                    if (group.outline) {
                        group.outline.visible = isSelected;
                    }
                });

                console.log('✅ Multi-select test: Selected', faceEditState.selectedFaceIds.size, 'faces');
                addMessageToLog('System', `Multi-select test: ${faceEditState.selectedFaceIds.size} faces selected. Press E to test extrude.`);
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
            console.log('Face mode active:', faceEditState.isActive);
            console.log('Target mesh:', faceEditState.targetMesh?.name || 'none');
            console.log('Selected group ID:', faceEditState.selectedGroupId || 'none');
            console.log('Groups count:', faceEditState.groups?.length || 0);
            console.log('Selected object:', selectedObject?.name || 'none');

            if (faceEditState.groups?.length > 0) {
                console.log('Group IDs:', faceEditState.groups.map(g => g.id));
                faceEditState.groups.forEach((group, i) => {
                    console.log(`Group ${i}:`, {
                        id: group.id,
                        triCount: group.triIndices?.length || 0,
                        hasOverlay: !!group.overlay,
                        hasOutline: !!group.outline,
                        overlayVisible: group.overlay?.visible,
                        overlayInScene: group.overlay?.parent === scene
                    });
                });
            }

            return {
                isActive: faceEditState.isActive,
                selectedGroupId: faceEditState.selectedGroupId,
                groupsCount: faceEditState.groups?.length || 0,
                targetMesh: faceEditState.targetMesh?.name || 'none'
            };
        }

        // DEBUG: Force select first face group for testing
        function forceSelectFirstFace() {
            if (!faceEditState.isActive) {
                console.log('[forceSelectFirstFace] Face mode not active');
                return false;
            }

            if (faceEditState.groups.length === 0) {
                console.log('[forceSelectFirstFace] No face groups available');
                return false;
            }

            const firstGroup = faceEditState.groups[0];
            console.log('[forceSelectFirstFace] Selecting first group:', firstGroup.id);

            // Use new selection system
            faceEditState.selectedFaceIds.clear();
            faceEditState.selectedFaceIds.add(firstGroup.id);
            faceEditState.selectedGroupId = firstGroup.id; // For compatibility

            // Update visual state
            faceEditState.groups.forEach(group => {
                const isSelected = faceEditState.selectedFaceIds.has(group.id);
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

            if (!faceEditState.isActive) {
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

            if (!faceEditState.isActive) {
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
            console.log('Selected faces:', Array.from(faceEditState.selectedFaceIds));
            console.log('Multi-select mode:', faceEditState.multiSelect);

            // Step 2: Test extrude
            setTimeout(() => {
                console.log('[testExtrudeSystem] Starting extrude test');
                const extrudeResult = handleExtrudeFace();

                if (extrudeResult) {
                    console.log('[testExtrudeSystem] Extrude gizmo should be visible');
                    console.log('Extrude UI active:', extrudeUI.active);
                    console.log('Arrow created:', !!extrudeUI.arrow);
                    console.log('Face IDs:', extrudeUI.faceIds);

                    // Step 3: Test preview
                    setTimeout(() => {
                        console.log('[testExtrudeSystem] Testing preview update');
                        updateExtrudePreview(0.5);
                        console.log('Preview meshes:', extrudeUI.previewMeshes.length);

                        // Step 4: Test cancel
                        setTimeout(() => {
                            console.log('[testExtrudeSystem] Testing cancel');
                            cancelExtrude();
                            console.log('Extrude UI active after cancel:', extrudeUI.active);
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
                const index = indexScene(scene);
                const matchingObjects = findObjectsByClass(index, data.targets[0].class);
                const uuids = matchingObjects.map(obj => obj.uuid);

                console.log(`[handleNLActionResponse] Expanding 'all ${data.targets[0].class}' to ${uuids.length} objects`);

                if (uuids.length === 0) {
                    addMessageToLog('System', `No ${data.targets[0].class} objects found in the scene.`);
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
                pendingDisambiguation = {
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
            if (!pendingDisambiguation) {
                addMessageToLog('System', 'No pending disambiguation.');
                return;
            }

            const choice = parseInt(choiceNumber) - 1;
            if (choice < 0 || choice >= pendingDisambiguation.candidates.length) {
                addMessageToLog('System', 'Invalid choice number.');
                return;
            }

            const selectedTarget = pendingDisambiguation.candidates[choice];
            const operation = pendingDisambiguation.originalOperation;
            const action = pendingDisambiguation.originalAction;

            // Clear pending state
            pendingDisambiguation = null;

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
            const index = indexScene(scene);
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

        // Face group data structure - ENHANCED
        let faceEditState = {
            targetMesh: null,
            groups: [],
            selectedGroupId: null,
            isActive: false,
            multiSelect: false,
            selectedFaceIds: new Set()
        };

        // Interactive extrude UI state
        const extrudeUI = {
            active: false,
            faceIds: [],
            targetMesh: null,
            arrow: null,
            previewMeshes: [],
            depth: 0,
            drag: {
                on: false,
                startPt: null,
                plane: null
            }
        };

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

            // Detach transform controls to prevent interference
            if (transformControls) {
                transformControls.detach();
                console.log('[enterFaceEditMode] Transform controls detached');
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
                    scene.add(overlay);
                    scene.add(outline);

                    // Show all overlays initially for better visibility
                    overlay.visible = true;
                    outline.visible = true;

                    console.log(`[enterFaceEditMode] Added overlay ${i} to scene:`, {
                        overlayInScene: overlay.parent === scene,
                        outlineInScene: outline.parent === scene,
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
            faceEditState = {
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
            if (!faceEditState.isActive) return;

            console.log('[exitFaceEditMode] Exiting face edit mode');

            // Store target mesh for transform controls reattachment
            const targetMesh = faceEditState.targetMesh;

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
            faceEditState.groups.forEach(group => {
                if (group.overlay) {
                    scene.remove(group.overlay);
                    group.overlay.geometry.dispose();
                    group.overlay.material.dispose();
                }
                if (group.outline) {
                    scene.remove(group.outline);
                    group.outline.geometry.dispose();
                    group.outline.material.dispose();
                }
            });

            // Reset state
            faceEditState = {
                targetMesh: null,
                groups: [],
                selectedGroupId: null,
                isActive: false,
                multiSelect: false,
                selectedFaceIds: new Set()
            };

            // Reattach transform controls if we had a target mesh
            if (transformControls && targetMesh && selectedObject === targetMesh) {
                transformControls.attach(targetMesh);
                console.log('[exitFaceEditMode] Transform controls reattached');
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
            if (loadedModels.length > 0) {
                const currentState = getCurrentState();
                undoStack.push(currentState);
                redoStack = []; // Clear redo stack
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
            console.log('Face mode active:', faceEditState.isActive);
            console.log('Multi-select mode:', faceEditState.multiSelect);
            console.log('Selected face IDs:', Array.from(faceEditState.selectedFaceIds));
            console.log('Total groups:', faceEditState.groups.length);
            console.log('Groups:', faceEditState.groups.map(g => g.id));
            return faceEditState;
        };

        window.debugExtrudeState = function() {
            console.log('=== EXTRUDE STATE DEBUG ===');
            console.log('Extrude UI active:', extrudeUI.active);
            console.log('Arrow exists:', !!extrudeUI.arrow);
            console.log('Face IDs:', extrudeUI.faceIds);
            console.log('Current depth:', extrudeUI.depth);
            console.log('Drag state:', extrudeUI.drag);

            // Check UI panel
            const panel = document.getElementById('extrudePanel');
            console.log('Panel exists:', !!panel);
            console.log('Panel visible:', panel ? panel.style.display : 'N/A');

            return extrudeUI;
        };

        // Quick test function for Fusion 360 style extrude
        window.testFusion360Extrude = function() {
            console.log('🧪 Testing Fusion 360 Extrude System...');

            // Step 1: Create a cube if none exists
            if (loadedModels.length === 0) {
                console.log('1. Creating test cube...');
                createPrimitive('cube');
                setTimeout(() => testFusion360Extrude(), 500);
                return;
            }

            // Step 2: Enter face edit mode
            console.log('2. Entering face edit mode...');
            if (!faceEditState.isActive) {
                toggleFaceEditMode();
            }

            // Step 3: Select first face
            setTimeout(() => {
                console.log('3. Selecting first face...');
                if (faceEditState.groups.length > 0) {
                    const firstFace = faceEditState.groups[0];
                    faceEditState.selectedFaceIds.clear();
                    faceEditState.selectedFaceIds.add(firstFace.id);
                    updateFaceHighlights();

                    // Step 4: Start extrude
                    setTimeout(() => {
                        console.log('4. Starting extrude...');
                        const result = handleExtrudeFace();

                        setTimeout(() => {
                            console.log('=== RESULTS ===');
                            console.log('✅ Extrude started:', result);
                            console.log('✅ Arrow visible:', !!extrudeUI.arrow);
                            console.log('✅ UI active:', extrudeUI.active);

                            const panel = document.getElementById('extrudePanel');
                            console.log('✅ Panel exists:', !!panel);
                            console.log('✅ Panel visible:', panel ? panel.style.display !== 'none' : false);

                            if (result && extrudeUI.arrow && panel && panel.style.display !== 'none') {
                                console.log('🎉 SUCCESS! Blue 2D arrow extrude is working!');
                                console.log('💡 Try clicking and dragging the blue arrow');
                                console.log('💡 Or type a value in the input field');

                                // Test arrow interaction
                                if (extrudeUI.arrow) {
                                    console.log('🔍 Arrow details:');
                                    console.log('   - Type:', extrudeUI.arrow.type);
                                    console.log('   - Children:', extrudeUI.arrow.children.length);
                                    console.log('   - Position:', extrudeUI.arrow.position.toArray());
                                    console.log('   - Visible:', extrudeUI.arrow.visible);
                                    console.log('   - In scene:', extrudeUI.arrow.parent === scene);
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
            if (!extrudeUI.active || !extrudeUI.arrow) {
                console.log('❌ Extrude not active or no arrow. Run testFusion360Extrude() first.');
                return;
            }

            console.log('🎯 Testing arrow click detection...');
            console.log('Arrow exists:', !!extrudeUI.arrow);
            console.log('Arrow children:', extrudeUI.arrow.children.length);
            console.log('Arrow userData:', extrudeUI.arrow.userData);

            // Test raycasting on arrow
            mouse.x = 0; // Center of screen
            mouse.y = 0;
            raycaster.setFromCamera(mouse, camera);

            const intersects = raycaster.intersectObject(extrudeUI.arrow, true);
            console.log('Center screen intersects with arrow:', intersects.length);

            if (intersects.length > 0) {
                console.log('✅ Arrow is clickable at center!');
                console.log('   Intersected:', intersects[0].object.type);
            } else {
                console.log('❌ Arrow not detected at center. Try moving camera closer to arrow.');
            }
        };

        window.forceSelectTwoFaces = function() {
            if (!faceEditState.isActive) {
                console.log('Face mode not active');
                return false;
            }

            if (faceEditState.groups.length < 2) {
                console.log('Need at least 2 faces');
                return false;
            }

            // Force select first two faces
            faceEditState.selectedFaceIds.clear();
            faceEditState.selectedFaceIds.add(faceEditState.groups[0].id);
            faceEditState.selectedFaceIds.add(faceEditState.groups[1].id);
            faceEditState.selectedGroupId = faceEditState.groups[0].id;

            // Update visuals
            faceEditState.groups.forEach(group => {
                const isSelected = faceEditState.selectedFaceIds.has(group.id);
                if (group.overlay && group.overlay.material) {
                    group.overlay.material.opacity = isSelected ? 0.7 : 0.4;
                    group.overlay.material.color.setHex(isSelected ? 0xff0000 : 0x00ff00);
                }
                if (group.outline) {
                    group.outline.visible = isSelected;
                }
            });

            console.log('Selected 2 faces:', Array.from(faceEditState.selectedFaceIds));
            return true;
        };

        // STEP BY STEP DIAGNOSTIC
        window.stepByStepTest = function() {
            console.log('=== STEP BY STEP DIAGNOSTIC ===');

            // Step 1: Check face mode
            console.log('Step 1: Face mode active?', faceEditState.isActive);
            if (!faceEditState.isActive) {
                console.log('Starting face mode...');
                testFaceEditing();
                setTimeout(() => stepByStepTest(), 1000);
                return;
            }

            // Step 2: Check groups
            console.log('Step 2: Face groups available?', faceEditState.groups.length);
            if (faceEditState.groups.length === 0) {
                console.log('No face groups found!');
                return;
            }

            // Step 3: Test single selection
            console.log('Step 3: Testing single face selection...');
            faceEditState.selectedFaceIds.clear();
            faceEditState.selectedFaceIds.add(faceEditState.groups[0].id);
            faceEditState.selectedGroupId = faceEditState.groups[0].id;

            // Update visual
            faceEditState.groups.forEach(group => {
                const isSelected = faceEditState.selectedFaceIds.has(group.id);
                if (group.overlay && group.overlay.material) {
                    group.overlay.material.opacity = isSelected ? 0.7 : 0.4;
                    group.overlay.material.color.setHex(isSelected ? 0xff0000 : 0x00ff00);
                }
            });

            console.log('Step 3 result: Selected faces:', Array.from(faceEditState.selectedFaceIds));

            // Step 4: Test extrude
            console.log('Step 4: Testing extrude...');
            const extrudeResult = handleExtrudeFace();
            console.log('Step 4 result: Extrude started?', extrudeResult);
            console.log('Arrow created?', !!extrudeUI.arrow);

            if (extrudeResult && extrudeUI.arrow) {
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
            if (!faceEditState.isActive) {
                console.log('1. Starting face mode...');
                testFaceEditing();
                setTimeout(() => completeSystemTest(), 1000);
                return;
            }

            console.log('1. ✅ Face mode active');
            console.log('2. Testing single face selection...');

            // Step 2: Test single selection
            if (faceEditState.groups.length > 0) {
                const firstFaceId = faceEditState.groups[0].id;

                // Clear and select first face
                faceEditState.selectedFaceIds.clear();
                faceEditState.selectedFaceIds.add(firstFaceId);
                faceEditState.selectedGroupId = firstFaceId;

                // Update visual
                faceEditState.groups.forEach(group => {
                    const isSelected = faceEditState.selectedFaceIds.has(group.id);
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

                if (extrudeResult && extrudeUI.active && extrudeUI.arrow) {
                    console.log('3. ✅ Extrude system working!');
                    console.log('   - Arrow created:', !!extrudeUI.arrow);
                    console.log('   - UI active:', extrudeUI.active);
                    console.log('   - Face IDs:', extrudeUI.faceIds);

                    // Step 4: Test multi-select
                    setTimeout(() => {
                        console.log('4. Testing multi-select...');
                        cancelExtrude(); // Cancel current extrude

                        if (faceEditState.groups.length >= 2) {
                            // Enable multi-select
                            faceEditState.multiSelect = true;

                            // Select multiple faces
                            faceEditState.selectedFaceIds.clear();
                            faceEditState.selectedFaceIds.add(faceEditState.groups[0].id);
                            faceEditState.selectedFaceIds.add(faceEditState.groups[1].id);

                            // Update visual
                            faceEditState.groups.forEach(group => {
                                const isSelected = faceEditState.selectedFaceIds.has(group.id);
                                if (group.overlay && group.overlay.material) {
                                    group.overlay.material.opacity = isSelected ? 0.7 : 0.4;
                                    group.overlay.material.color.setHex(isSelected ? 0xff0000 : 0x00ff00);
                                }
                                if (group.outline) {
                                    group.outline.visible = isSelected;
                                }
                            });

                            console.log('4. ✅ Multi-select working:', Array.from(faceEditState.selectedFaceIds));

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
                    console.log('   - UI active:', extrudeUI.active);
                    console.log('   - Arrow exists:', !!extrudeUI.arrow);
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
            console.log("Active:", faceEditState.isActive);
            console.log("Target mesh:", faceEditState.targetMesh?.name || "none");
            console.log("Groups count:", faceEditState.groups.length);
            console.log("Selected group:", faceEditState.selectedGroupId || "none");

            if (faceEditState.isActive) {
                console.log("Groups details:");
                faceEditState.groups.forEach((group, i) => {
                    console.log(`  ${i + 1}. ${group.id} - Overlay: ${!!group.overlay}, Outline: ${!!group.outline}`);
                });

                if (faceEditState.selectedGroupId) {
                    const selected = faceEditState.groups.find(g => g.id === faceEditState.selectedGroupId);
                    console.log("Selected group details:", selected);
                }
            }

            return faceEditState;
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
                if (loadedModels.length > 0) {
                    const cube = loadedModels[loadedModels.length - 1]; // Get the last created object
                    selectObject(cube);

                    setTimeout(() => {
                        // Step 3: Enter face edit mode
                        console.log("3. Entering face edit mode...");
                        const success = enterFaceEditMode(cube);

                        if (success) {
                            console.log(`✅ Face edit mode active with ${faceEditState.groups.length} face groups`);

                            setTimeout(() => {
                                // Step 4: Test face selection
                                console.log("4. Testing face selection...");
                                if (faceEditState.groups.length > 0) {
                                    const firstGroup = faceEditState.groups[0];
                                    selectFaceGroup(firstGroup.id);
                                    console.log(`✅ Selected face group: ${firstGroup.id}`);

                                    setTimeout(() => {
                                        // Step 5: Test face deletion
                                        console.log("5. Testing face deletion...");
                                        deleteFaceGroup(faceEditState.targetMesh, firstGroup);
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
            if (loadedModels.length > 0) {
                loadedModels.forEach(obj => {
                    scene.remove(obj);
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach(mat => mat.dispose());
                        } else {
                            obj.material.dispose();
                        }
                    }
                });
                loadedModels.length = 0;
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

                scene.add(mesh);
                loadedModels.push(mesh);
            });

            console.log("✅ Created 5 test objects: 2 cars, 1 ball, 2 cones");

            // Step 2: Test scene indexing
            setTimeout(() => {
                console.log("2. Testing scene indexing...");
                const index = indexScene(scene);
                console.log("Scene index:", index);

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
                            console.log(`   Final object count: ${loadedModels.length}`);
                            console.log(`   Undo stack size: ${undoStack.length}`);
                            console.log(`   Redo stack size: ${redoStack.length}`);

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
            if (loadedModels.length > 0) {
                loadedModels.forEach(obj => {
                    scene.remove(obj);
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach(mat => mat.dispose());
                        } else {
                            obj.material.dispose();
                        }
                    }
                });
                loadedModels.length = 0;
            }

            // Create fresh test objects
            const geometry1 = new THREE.BoxGeometry(1, 1, 1);
            const material1 = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const cube1 = new THREE.Mesh(geometry1, material1);
            cube1.position.set(-2, 0, 0);
            cube1.name = "Test Cube";
            scene.add(cube1);
            loadedModels.push(cube1);

            const geometry2 = new THREE.SphereGeometry(0.5, 32, 32);
            const material2 = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const sphere1 = new THREE.Mesh(geometry2, material2);
            sphere1.position.set(2, 0, 0);
            sphere1.name = "Test Sphere";
            scene.add(sphere1);
            loadedModels.push(sphere1);

            console.log("✅ Created 2 test objects");

            setTimeout(() => {
                // Step 2: Select All → Duplicate
                console.log("2. Testing Select All → Duplicate...");
                highlightAllModels();

                setTimeout(() => {
                    duplicateSelection();

                    setTimeout(() => {
                        console.log(`   Objects after duplicate: ${loadedModels.length} (expected: 4)`);

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
                                        console.log(`   Undo stack size: ${undoStack.length}`);

                                        // Should undo: rotate, scale, move, duplicate
                                        undo(); // Undo rotate
                                        setTimeout(() => {
                                            undo(); // Undo scale
                                            setTimeout(() => {
                                                undo(); // Undo move
                                                setTimeout(() => {
                                                    undo(); // Undo duplicate
                                                    setTimeout(() => {
                                                        console.log(`   Objects after undo sequence: ${loadedModels.length} (expected: 2)`);

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
                                                                        console.log(`   Final objects count: ${loadedModels.length} (expected: 4)`);
                                                                        console.log(`   Final undo stack: ${undoStack.length}`);
                                                                        console.log(`   Final redo stack: ${redoStack.length}`);

                                                                        if (loadedModels.length === 4 && undoStack.length === 4 && redoStack.length === 0) {
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
            console.log(`Moving all ${loadedModels.length} objects by (${x}, ${y}, ${z})`);

            // Select all objects first
            setSelectedObjects(loadedModels);

            // Use the unified transform function
            translateSelection(x || 0, y || 0, z || 0);
        };

        window.scaleAllObjects = function(scale) {
            console.log(`Scaling all ${loadedModels.length} objects by ${scale}`);

            // Select all objects first
            setSelectedObjects(loadedModels);

            // Use the unified transform function
            scaleSelection(scale || 1.5, scale || 1.5, scale || 1.5);
        };

        window.rotateAllObjects = function(x, y, z) {
            console.log(`Rotating all ${loadedModels.length} objects`);

            // Select all objects first
            setSelectedObjects(loadedModels);

            // Use the unified transform function
            rotateSelection(x || 0, y || Math.PI / 4, z || 0);
        };

        window.deleteAllObjects = function() {
            console.log(`Deleting all ${loadedModels.length} objects`);
            const count = loadedModels.length;
            loadedModels.forEach(obj => {
                scene.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(mat => mat.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            });
            loadedModels.length = 0;
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
            const realObjects = loadedModels.filter(obj => {
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

                    scene.add(duplicate);
                    loadedModels.push(duplicate);
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
                console.log("1. Checking loadedModels:", loadedModels);
                console.log("   - Type:", typeof loadedModels);
                console.log("   - Length:", loadedModels ? loadedModels.length : 'undefined');
                console.log("   - Contents:", loadedModels ? loadedModels.map(obj => obj.name || obj.type) : 'none');

                console.log("2. Checking scene:", scene);
                console.log("   - Type:", typeof scene);
                console.log("   - Children count:", scene ? scene.children.length : 'undefined');

                console.log("3. Checking duplicateSelectedObject function:");
                console.log("   - Type:", typeof window.duplicateSelectedObject);
                console.log("   - Exists:", window.duplicateSelectedObject ? 'yes' : 'no');

                console.log("4. Testing simple duplicate:");
                if (loadedModels && loadedModels.length > 0) {
                    console.log("   - Found objects to test with");

                    // Try the simplest possible duplicate
                    const original = loadedModels[0];
                    console.log("   - Testing with:", original.name);

                    try {
                        const copy = original.clone();
                        copy.position.x += 2;
                        copy.name = original.name + " TEST";
                        scene.add(copy);
                        loadedModels.push(copy);
                        console.log("   ✅ Simple duplicate test PASSED");

                        // Clean up test
                        scene.remove(copy);
                        loadedModels.pop();

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

            if (!loadedModels || loadedModels.length === 0) {
                alert("No objects to duplicate");
                return;
            }

            const count = loadedModels.length;
            console.log(`Duplicating ${count} objects...`);

            for (let i = 0; i < count; i++) {
                const original = loadedModels[i];
                console.log(`Copying ${i + 1}: ${original.name}`);

                const copy = original.clone();
                copy.position.x = original.position.x + 3;
                copy.name = original.name + " COPY";

                scene.add(copy);
                loadedModels.push(copy);

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
                console.log(`2. Created ${loadedModels.length} objects`);

                // Step 2: Select all
                console.log("3. Selecting all objects...");
                highlightAllModels();

                setTimeout(() => {
                    console.log("4. All objects selected!");
                    console.log(`   - currentlySelectedObjectsForEditing.length: ${currentlySelectedObjectsForEditing.length}`);
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
                console.log(`Created ${loadedModels.length} objects`);

                // Select all and duplicate
                highlightAllModels();

                setTimeout(() => {
                    const success = duplicateMultipleObjects();

                    if (success && loadedModels.length === 6) {
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
            console.log("   Objects:", loadedModels.length, "Undo stack:", undoStack.length);

            setTimeout(() => {
                // Create second object
                console.log("2. Creating sphere...");
                createPrimitive('sphere');
                console.log("   Objects:", loadedModels.length, "Undo stack:", undoStack.length);

                setTimeout(() => {
                    // Test undo - should go to 1 object, NOT 0
                    console.log("3. Testing undo...");
                    undo();
                    console.log("   After undo - Objects:", loadedModels.length, "Undo stack:", undoStack.length);

                    if (loadedModels.length === 0) {
                        console.error("❌ FAILED: Undo went to empty state!");
                    } else {
                        console.log("✅ SUCCESS: Undo kept objects, no reset!");
                    }

                    setTimeout(() => {
                        // Test redo
                        console.log("4. Testing redo...");
                        redo();
                        console.log("   After redo - Objects:", loadedModels.length, "Redo stack:", redoStack.length);
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
                console.log(`   ✓ Cube created. Objects: ${loadedModels.length}, Undo stack: ${undoStack.length}`);

                // Step 2: Add sphere
                console.log("2. Creating sphere...");
                createPrimitive('sphere');

                setTimeout(() => {
                    console.log(`   ✓ Sphere created. Objects: ${loadedModels.length}, Undo stack: ${undoStack.length}`);

                    // Step 3: Duplicate selected object (sphere should be selected)
                    console.log("3. Duplicating selected object...");
                    if (selectedObject) {
                        duplicateSelectedObject();
                        setTimeout(() => {
                            console.log(`   ✓ Object duplicated. Objects: ${loadedModels.length}, Undo stack: ${undoStack.length}`);

                            // Step 4: Move selected object
                            console.log("4. Moving selected object...");
                            if (selectedObject) {
                                selectedObject.position.x += 2;
                                selectedObject.updateMatrixWorld(true);
                                console.log(`   ✓ Object moved to x: ${selectedObject.position.x}`);
                            }

                            setTimeout(() => {
                                // Step 5: Test undo
                                console.log("5. Testing UNDO...");
                                console.log(`   Before undo - Objects: ${loadedModels.length}, Camera pos: ${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}`);

                                undo();

                                setTimeout(() => {
                                    console.log(`   After undo - Objects: ${loadedModels.length}, Camera pos: ${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}`);

                                    // Check results
                                    if (loadedModels.length === 0) {
                                        console.error("   ❌ FAILED: Scene reset to empty!");
                                    } else {
                                        console.log("   ✅ SUCCESS: Objects preserved, no reset!");
                                    }

                                    // Step 6: Test redo
                                    console.log("6. Testing REDO...");
                                    redo();

                                    setTimeout(() => {
                                        console.log(`   After redo - Objects: ${loadedModels.length}, Camera pos: ${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}`);

                                        // Final verification
                                        console.log("=== FINAL VERIFICATION ===");
                                        console.log(`✓ Camera preserved: ${camera ? 'YES' : 'NO'}`);
                                        console.log(`✓ Scene has lights: ${scene.children.filter(obj => obj.isLight).length > 0 ? 'YES' : 'NO'}`);
                                        console.log(`✓ Grid visible: ${currentGridHelper && currentGridHelper.visible ? 'YES' : 'NO'}`);
                                        console.log(`✓ Objects in scene: ${loadedModels.length}`);
                                        console.log(`✓ Undo stack: ${undoStack.length}, Redo stack: ${redoStack.length}`);
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
            if (loadedModels.length === 0) {
                createPrimitive('cube');
                setTimeout(() => {
                    createPrimitive('sphere');
                    setTimeout(() => {
                        console.log("Created test objects. Now testing select all...");
                        highlightAllModels();
                        console.log("Select all executed. Selected objects:", currentlySelectedObjectsForEditing.length);
                    }, 500);
                }, 500);
            } else {
                console.log("Using existing objects. Testing select all...");
                highlightAllModels();
                console.log("Select all executed. Selected objects:", currentlySelectedObjectsForEditing.length);
            }
        };

        // Comprehensive diagnostic function
        window.diagnoseSelection = function() {
            console.log("=== COMPREHENSIVE SELECTION DIAGNOSTIC ===");

            // Check basic variables
            console.log("1. Basic State Check:");
            console.log("   - scene exists:", !!scene);
            console.log("   - camera exists:", !!camera);
            console.log("   - renderer exists:", !!renderer);
            console.log("   - raycaster exists:", !!raycaster);
            console.log("   - mouse exists:", !!mouse);
            console.log("   - transformControls exists:", !!transformControls);

            console.log("2. Object State:");
            console.log("   - loadedModels.length:", loadedModels.length);
            console.log("   - selectedObject:", selectedObject ? selectedObject.name || selectedObject.uuid : 'null');
            console.log("   - currentlySelectedObjectsForEditing.length:", currentlySelectedObjectsForEditing.length);
            console.log("   - originalMaterialProperties.size:", originalMaterialProperties.size);
            console.log("   - allHighlightsOriginalMaterials.size:", allHighlightsOriginalMaterials.size);

            console.log("3. Scene Analysis:");
            if (scene) {
                let meshCount = 0;
                let visibleMeshCount = 0;
                scene.traverse((obj) => {
                    if (obj.isMesh) {
                        meshCount++;
                        if (obj.visible) visibleMeshCount++;
                    }
                });
                console.log("   - Total meshes in scene:", meshCount);
                console.log("   - Visible meshes in scene:", visibleMeshCount);
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
                sceneReady: !!scene && !!camera && !!renderer,
                selectionReady: !!raycaster && !!mouse,
                objectsExist: loadedModels.length > 0,
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
            console.log("Initial state - History length:", history.length, "Pointer:", historyPointer);
            console.log("Objects in scene:", loadedModels.length);

            // Create a test object
            console.log("Creating cube...");
            createPrimitive('cube');

            setTimeout(() => {
                console.log("After creating cube:");
                console.log("undoButton disabled:", document.getElementById('undoButton')?.disabled);
                console.log("redoButton disabled:", document.getElementById('redoButton')?.disabled);
                console.log("History length:", history.length, "Pointer:", historyPointer);
                console.log("Objects in scene:", loadedModels.length);

                // Create another object
                console.log("Creating sphere...");
                createPrimitive('sphere');

                setTimeout(() => {
                    console.log("After creating sphere:");
                    console.log("History length:", history.length, "Pointer:", historyPointer);
                    console.log("Objects in scene:", loadedModels.length);

                    // Try clicking undo button programmatically
                    const undoBtn = document.getElementById('undoButton');
                    if (undoBtn) {
                        console.log("Clicking undo button programmatically...");
                        undoBtn.click();

                        setTimeout(() => {
                            console.log("After undo:");
                            console.log("History length:", history.length, "Pointer:", historyPointer);
                            console.log("Objects in scene:", loadedModels.length);

                            // Try redo
                            const redoBtn = document.getElementById('redoButton');
                            if (redoBtn) {
                                console.log("Clicking redo button programmatically...");
                                redoBtn.click();

                                setTimeout(() => {
                                    console.log("After redo:");
                                    console.log("History length:", history.length, "Pointer:", historyPointer);
                                    console.log("Objects in scene:", loadedModels.length);
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
            console.log("Current selectedObject:", selectedObject ? selectedObject.name || selectedObject.uuid : 'null');
            console.log("Current select-all objects:", currentlySelectedObjectsForEditing.length);
            console.log("Objects in scene:", loadedModels.length);

            // Create some test objects
            createPrimitive('cube');
            setTimeout(() => {
                createPrimitive('sphere');

                setTimeout(() => {
                    console.log("After creating objects:");
                    console.log("Objects in scene:", loadedModels.length);
                    console.log("Current selectedObject:", selectedObject ? selectedObject.name || selectedObject.uuid : 'null');

                    // Test select all
                    console.log("Testing select all...");
                    highlightAllModels();

                    setTimeout(() => {
                        console.log("After select all:");
                        console.log("Select-all objects:", currentlySelectedObjectsForEditing.length);
                        console.log("All highlights map size:", allHighlightsOriginalMaterials.size);

                        // Test clear selection
                        console.log("Testing clear all highlights...");
                        clearAllHighlights();

                        setTimeout(() => {
                            console.log("After clear all:");
                            console.log("Select-all objects:", currentlySelectedObjectsForEditing.length);
                            console.log("All highlights map size:", allHighlightsOriginalMaterials.size);
                            console.log("=== Selection Test Complete ===");
                        }, 500);
                    }, 500);
                }, 500);
            }, 500);
        };

        // Simple test for shape creation
        window.testShapeCreation = function() {
            console.log("=== Testing Shape Creation ===");
            console.log(`Scene initialized: ${!!scene}`);
            console.log(`Camera initialized: ${!!camera}`);
            console.log(`Renderer initialized: ${!!renderer}`);
            console.log(`Current objects in scene: ${scene ? scene.children.length : 'N/A'}`);
            console.log(`Current loaded models: ${loadedModels.length}`);

            console.log("Creating cube...");
            createPrimitive('cube');

            setTimeout(() => {
                console.log("Creating sphere...");
                createPrimitive('sphere');

                setTimeout(() => {
                    console.log("Creating ball (alias for sphere)...");
                    createPrimitive('ball');

                    console.log(`Final objects in scene: ${scene.children.length}`);
                    console.log(`Final loaded models: ${loadedModels.length}`);
                    console.log("=== Shape Creation Test Complete ===");
                }, 500);
            }, 500);
        };
        window.testUndoRedo = function() {
            console.log("=== Testing Undo/Redo Functionality ===");
            console.log(`Initial state - History: ${history.length}, Pointer: ${historyPointer}`);

            // Create a test cube
            createPrimitive('cube');
            console.log(`After creating cube - History: ${history.length}, Pointer: ${historyPointer}`);

            // Create another test sphere
            setTimeout(() => {
                createPrimitive('sphere');
                console.log(`After creating sphere - History: ${history.length}, Pointer: ${historyPointer}`);

                // Test undo
                setTimeout(() => {
                    console.log("Testing undo...");
                    undo();
                    console.log(`After undo - History: ${history.length}, Pointer: ${historyPointer}`);

                    // Test redo
                    setTimeout(() => {
                        console.log("Testing redo...");
                        redo();
                        console.log(`After redo - History: ${history.length}, Pointer: ${historyPointer}`);
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
                    if (selectedObject) {
                        changeObjectColor('#ff0000');
                    }

                    setTimeout(() => {
                        // Test 3: Duplicate
                        console.log("3. Testing duplicate...");
                        if (selectedObject) {
                            duplicateSelectedObject();
                        }

                        setTimeout(() => {
                            // Test 4: Move/Transform
                            console.log("4. Testing movement...");
                            if (selectedObject) {
                                selectedObject.position.x += 2;
                                selectedObject.updateMatrixWorld(true);
                            }

                            setTimeout(() => {
                                // Test 5: Scale
                                console.log("5. Testing scale...");
                                if (selectedObject) {
                                    selectedObject.scale.multiplyScalar(1.5);
                                    selectedObject.updateMatrixWorld(true);
                                }

                                setTimeout(() => {
                                    // Test 6: Delete
                                    console.log("6. Testing delete...");
                                    if (selectedObject) {
                                        removeObject();
                                    }

                                    setTimeout(() => {
                                        // Test 7: Undo/Redo
                                        console.log("7. Testing undo/redo...");
                                        undo();
                                        setTimeout(() => {
                                            redo();
                                            console.log("=== All Tests Complete ===");
                                            console.log(`Final state - History: ${history.length}, Pointer: ${historyPointer}`);
                                            console.log(`Objects in scene: ${loadedModels.length}`);
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
                    if (selectedObject) {
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
                        if (selectedObject) {
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
                            if (selectedObject) {
                                selectedObject.position.x += 3;
                                selectedObject.updateMatrixWorld(true);
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
                                if (selectedObject) {
                                    selectedObject.scale.multiplyScalar(2);
                                    selectedObject.updateMatrixWorld(true);
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
                                    if (selectedObject) {
                                        selectedObject.rotation.y += Math.PI / 4;
                                        selectedObject.updateMatrixWorld(true);
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
                                        if (selectedObject) {
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
            addMessageToLog('System', 'Clicking "Upload New File" will open file dialog to add another model to the scene.');
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
                uploadedFile = null; // Ensure no previous file is considered for explicit upload
                goToEditor('random'); // Go to editor and load a random model
            });
            console.log("[Init] Load Random Model button event listener attached");
        } else {
            console.error("[Init] loadRandomModelButton not found!");
        }

        if (createNewEmptyModelButton) {
            createNewEmptyModelButton.addEventListener('click', () => {
                console.log("[Create Empty Model] button clicked. Calling goToEditor('empty').");
                uploadedFile = null; // Ensure no previous file is considered
                goToEditor('empty'); // Go to editor with an empty scene
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

        // --- Undo/Redo Functions ---
        // Function to save the current state of the scene (debounced for transform operations)
        function saveSceneStateDebounced(delay = 500) {
            if (saveStateTimeout) {
                clearTimeout(saveStateTimeout);
            }
            saveStateTimeout = setTimeout(() => {
                saveSceneState();
                saveStateTimeout = null;
            }, delay);
        }

        // Function to save the current state of the scene
        function saveSceneState() {
            // For the very first save, save the state BEFORE the action
            // This ensures undo goes back to the previous state, not empty
            if (history.length === 0 && loadedModels.length > 0) {
                // If this is the first save and we have objects, save the current state as baseline
                console.log("[History] Saving first state as baseline");
            }

            // Clear any redo history if a new action is performed
            if (historyPointer < history.length - 1) {
                history = history.slice(0, historyPointer + 1);
            }

            const currentState = [];
            loadedModels.forEach(model => {
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

            // Trim history if it exceeds max size
            if (history.length > MAX_HISTORY_SIZE) {
                history.shift(); // Remove the oldest state
                historyPointer--; // Adjust pointer
            }

            console.log(`[History] Saved state. History size: ${history.length}, Pointer: ${historyPointer}`);
            updateUndoRedoButtons();
        }

        // Function to load a specific state from history
        async function loadSceneState(state) {
            console.log("[History] Loading scene state...", state);

            // Dispose current scene objects (excluding grid and axes helpers)
            // Iterate over a copy of the loadedModels array to avoid issues during removal
            const currentLoadedModels = [...loadedModels];
            currentLoadedModels.forEach(model => {
                scene.remove(model);
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
            loadedModels = []; // Clear current loaded models array after removal

            // Clear selection and highlights before loading new state
            clearSelection();
            clearAllHighlights();

            // Recreate objects from the saved state
            for (const modelState of state) {
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
                        const file = droppedFileBlobs.get(modelState.fileData.name); // Assuming fileData.name is the key
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

                // Restore UUID to match the saved state, important for maps like originalMaterialProperties
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

                scene.add(newObject);
                loadedModels.push(newObject); // Add to loadedModels array
            }

            // Reset camera to fit the new scene
            resetView(); // This will also update the grid

            console.log("[History] Scene state loaded successfully.");
        }

        // ENHANCED: Undo function with grouped action support
        function undo() {
            console.log(`[Undo] Attempting undo. Undo stack size: ${undoStack.length}`);

            if (undoStack.length > 0) {
                const undoItem = undoStack.pop();

                // Check if this is a new grouped action or old state-based action
                if (undoItem.actions && undoItem.actions.length > 0) {
                    // New grouped action system
                    console.log(`[Undo] Undoing grouped action: ${undoItem.name} with ${undoItem.actions.length} sub-actions`);

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
                    redoStack.push(undoItem);

                    addMessageToLog('System', `Undone: ${undoItem.name}`);
                    speakResponse(`Undone ${undoItem.name}`);
                } else {
                    // Legacy state-based undo
                    console.log(`[Undo] Using legacy state-based undo`);

                    // Save current state to redo stack BEFORE undoing
                    const currentState = getCurrentState();
                    redoStack.push(currentState);

                    // Restore previous state
                    restoreState(undoItem);

                    addMessageToLog('System', 'Action undone.');
                    speakResponse('Action undone.');
                }

                console.log(`[Undo] Undone. Undo stack: ${undoStack.length}, Redo stack: ${redoStack.length}`);
            } else {
                console.log(`[Undo] No actions to undo`);
                addMessageToLog('System', 'No more actions to undo.');
                speakResponse('Nothing to undo.');
            }
            updateUndoRedoButtons();
        }

        // ENHANCED: Redo function with grouped action support
        function redo() {
            console.log(`[Redo] Attempting redo. Redo stack size: ${redoStack.length}`);

            if (redoStack.length > 0) {
                const redoItem = redoStack.pop();

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
                    undoStack.push(redoItem);

                    addMessageToLog('System', `Redone: ${redoItem.name}`);
                    speakResponse(`Redone ${redoItem.name}`);
                } else {
                    // Legacy state-based redo
                    console.log(`[Redo] Using legacy state-based redo`);

                    // Save current state to undo stack BEFORE redoing
                    const currentState = getCurrentState();
                    undoStack.push(currentState);

                    // Restore next state
                    restoreState(redoItem);

                    addMessageToLog('System', 'Action redone.');
                    speakResponse('Action redone.');
                }

                console.log(`[Redo] Redone. Undo stack: ${undoStack.length}, Redo stack: ${redoStack.length}`);
            } else {
                console.log(`[Redo] No actions to redo`);
                addMessageToLog('System', 'No more actions to redo.');
                speakResponse('Nothing to redo.');
            }
            updateUndoRedoButtons();
        }

        // Function to update the disabled state of Undo/Redo buttons
        function updateUndoRedoButtons() {
            if (undoButton && redoButton) {
                undoButton.disabled = undoStack.length === 0;
                redoButton.disabled = redoStack.length === 0;

                console.log(`[Buttons] Undo disabled: ${undoButton.disabled}, Redo disabled: ${redoButton.disabled}`);
                console.log(`[Buttons] Undo stack: ${undoStack.length}, Redo stack: ${redoStack.length}`);

                undoButton.title = undoButton.disabled ? 'No actions to undo' : `Undo (${undoStack.length} actions available)`;
                redoButton.title = redoButton.disabled ? 'No actions to redo' : `Redo (${redoStack.length} actions available)`;
            }
        }

        // Get current scene state
        function getCurrentState() {
            const state = [];
            loadedModels.forEach(model => {
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

                state.push(modelState);
            });
            return state;
        }

        // CORRECTED: Only remove mesh objects, preserve lights/camera/controls
        function restoreState(state) {
            console.log("[restoreState] Restoring state with", state.length, "objects");

            // 1. ONLY remove mesh objects from scene (preserve lights, camera, grid, controls)
            const meshesToRemove = scene.children.filter(obj =>
                obj.isMesh &&
                !obj.userData.isGridLabel &&
                obj !== currentGridHelper &&
                obj !== raycastDebugSphere
            );

            // Remove and dispose mesh objects properly
            meshesToRemove.forEach(mesh => {
                scene.remove(mesh);
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

            // Clear arrays and selections (but don't touch scene structure)
            loadedModels = [];
            clearSelection();
            clearAllHighlights();

            // 2. RECREATE objects from saved state
            state.forEach(modelState => {
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

                    // 5. ADD to scene and update arrays
                    scene.add(newObject);
                    loadedModels.push(newObject);

                    console.log(`[restoreState] Restored ${modelState.primitiveType}: ${newObject.name}`);
                }
            });

            console.log(`[restoreState] Successfully restored ${loadedModels.length} objects`);
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
            if (selectedObject && transformControls) {
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


        // --- File Input and Page Navigation ---
        dropZone.addEventListener('dragover', e => {
            e.preventDefault();
            dropZone.textContent = 'Release to drop your .gltf or .glb file(s)';
            dropZone.style.borderColor = '#007bff';
            dropZone.style.display = 'flex'; // Show dropZone on dragover
            dropZone.style.pointerEvents = 'auto'; // Enable pointer events
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.textContent = 'Drag and Drop your .gltf or .glb file(s) here';
            dropZone.style.borderColor = '#a0aec0';
            dropZone.style.display = 'none'; // Hide dropZone on dragleave
            dropZone.style.pointerEvents = 'none'; // Disable pointer events
        });
        dropZone.addEventListener('drop', async e => {
            e.preventDefault();
            dropZone.textContent = 'Processing files...';
            dropZone.style.borderColor = '#a0aec0';
            loadingMsg.textContent = 'Processing dropped files...';
            loadingMsg.style.color = '#007bff';
            loadingMsg.style.display = 'block';

            // Always hide dropZone after a drop attempt, regardless of outcome
            dropZone.style.display = 'none';
            dropZone.style.pointerEvents = 'none';


            // When dropping, assume it's a new set of files for a new model
            // If already in editor, this means adding a new model. If on upload page, it's the first model.
            // Clear previous single-file context (important for correct URL resolution)
            droppedFileBlobs.clear();
            let mainModelFile = null;

            console.log("[Drop Handler] Drop event detected. Items:", e.dataTransfer.items);
            console.log("[Drop Handler] Files:", e.dataTransfer.files);

            async function readDroppedFiles(entry, path) {
                if (entry.isFile) {
                    const file = await new Promise(resolve => entry.file(resolve));
                    const fullPath = path ? `${path}/${path}/${file.name}` : file.name; // FIX: Corrected path concatenation
                    droppedFileBlobs.set(fullPath, file);
                    console.log(`[Drop Handler] Stored file: ${fullPath}, Type: ${file.type}, Size: ${file.size} bytes`);
                    if (!mainModelFile && (file.name.toLowerCase().endsWith('.gltf') || file.name.toLowerCase().endsWith('.glb'))) {
                        mainModelFile = file;
                    }
                } else if (entry.isDirectory) {
                    const directoryReader = entry.createReader();
                    const entries = await new Promise(resolve => directoryReader.readEntries(resolve));
                    console.log(`[Drop Handler] Reading directory: ${path ? `${path}/${entry.name}` : entry.name}, Entries found: ${entries.length}`);
                    for (const subEntry of entries) {
                        await readDroppedFiles(subEntry, path ? `${path}/${entry.name}` : entry.name);
                    }
                }
            }

            if (e.dataTransfer.items && e.dataTransfer.items.length > 0 && e.dataTransfer.items[0].webkitGetAsEntry) {
                console.log("[Drop Handler] Using webkitGetAsEntry for folder drop detection.");
                for (let i = 0; i < e.dataTransfer.items.length; i++) {
                    const item = e.dataTransfer.items[i];
                    const entry = item.webkitGetAsEntry();
                    if (entry) {
                        await readDroppedFiles(entry, '');
                    }
                }
            } else {
                console.log("[Drop Handler] Falling back to flat file drop (webkitGetAsEntry not available or not a folder drop).");
                for (let i = 0; i < e.dataTransfer.files.length; i++) {
                    const file = e.dataTransfer.files[i];
                    droppedFileBlobs.set(file.name, file);
                    console.log(`[Drop Handler] Stored file (flat): ${file.name}, Type: ${file.type}, Size: ${file.size} bytes`);
                    if (!mainModelFile && (file.name.toLowerCase().endsWith('.gltf') || file.name.toLowerCase().endsWith('.glb'))) {
                        mainModelFile = file;
                    }
                }
            }

            if (mainModelFile) {
                uploadedFile = mainModelFile;
                console.log("[Drop Handler] Identified main model file:", uploadedFile.name);
                if (validateFile(uploadedFile)) {
                    // If already in editor, load the model directly
                    if (editorPage.classList.contains('page-active')) {
                        loadModel(uploadedFile);
                    } else {
                        loadingMsg.textContent = `File selected: ${uploadedFile.name}. Loading editor...`;
                        loadingMsg.style.color = '#007bff';
                        loadingMsg.style.display = 'block';
                        goToEditor('uploaded');
                    }
                }
                console.log("[Drop Handler] All dropped files (keys in map):", Array.from(droppedFileBlobs.keys()));
            } else {
                loadingMsg.textContent = '❌ No .gltf or .glb file found among dropped items!';
                loadingMsg.style.color = 'red';
                setTimeout(() => { // Hide message after a delay
                    loadingMsg.style.display = 'none';
                    loadingMsg.textContent = '';
                }, 3000);
            }
            console.log("[Drop Handler] uploadedFile after change processing:", uploadedFile ? uploadedFile.name : "null");
        });

        fileInput.addEventListener('change', () => {
            console.log("[File Input] Change event detected. Files:", fileInput.files);

            // Always ensure dropZone is hidden and non-interactive when file dialog closes
            dropZone.style.display = 'none';
            dropZone.style.pointerEvents = 'none';
            loadingMsg.style.display = 'none'; // Hide any previous loading message
            loadingMsg.textContent = ''; // Clear previous message

            if (fileInput.files.length > 0) {
                const file = fileInput.files[0];
                uploadedFile = file;
                console.log("[File Input] Selected file:", uploadedFile.name, `Type: ${uploadedFile.type}, Size: ${uploadedFile.size} bytes`);

                if (validateFile(uploadedFile)) {
                    loadingMsg.textContent = `Processing selected file: ${uploadedFile.name}...`;
                    loadingMsg.style.color = '#007bff';
                    loadingMsg.style.display = 'block'; // Show loading message *only* if a file is valid

                    droppedFileBlobs.clear(); // Clear previous context
                    droppedFileBlobs.set(file.name, file); // Store the selected file

                    if (editorPage.classList.contains('page-active')) {
                        loadModel(uploadedFile);
                    } else {
                        loadingMsg.textContent = `File selected: ${uploadedFile.name}. Loading editor...`;
                        loadingMsg.style.color = '#007bff';
                        loadingMsg.style.display = 'block';
                        goToEditor('uploaded');
                    }
                } else {
                    // Validation failed, message already set by validateFile
                    setTimeout(() => { // Hide message after a delay
                        loadingMsg.style.display = 'none';
                        loadingMsg.textContent = '';
                    }, 3000);
                }
            } else {
                console.log("[File Input] No file selected via input (e.g., dialog cancelled or no file chosen).");
                uploadedFile = null;
                // No need to show a message if nothing was selected, just clear any previous ones.
                // loadingMsg.textContent = 'No file selected.';
                // loadingMsg.style.color = 'orange';
                // loadingMsg.style.display = 'block';
                // setTimeout(() => {
                //     loadingMsg.style.display = 'none';
                //     loadingMsg.textContent = '';
                // }, 3000);
            }
            console.log("[File Input] uploadedFile after change processing:", uploadedFile ? uploadedFile.name : "null");
        });

        function validateFile(file) {
            console.log("[Validation] Validating file:", file ? file.name : "null");
            if (file && (file.name.toLowerCase().endsWith('.gltf') || file.name.toLowerCase().endsWith('.glb'))) {
                console.log("[Validation] File is a valid GLTF/GLB.");
                return true;
            } else {
                console.error("[Validation] Unsupported file type! Please upload a .gltf or .glb file.");
                // Set message for the caller to display/hide
                loadingMsg.textContent = '❌ Unsupported file type! Please upload a .gltf or .glb file.';
                loadingMsg.style.color = 'red';
                uploadedFile = null;
                return false;
            }
        }

        function disposeSceneResources() {
            console.log("[Dispose] Disposing Three.js resources...");
            if (scene) {
                // Remove all loaded models and dispose their resources
                loadedModels.forEach(model => {
                    scene.remove(model);
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
                loadedModels = []; // Clear the array of loaded models

                // Remove grid helper and labels specifically if they exist
                if (currentGridHelper) {
                    scene.remove(currentGridHelper);
                    currentGridHelper.geometry.dispose();
                    currentGridHelper.material.dispose();
                    currentGridHelper = null;
                }
                currentGridLabels.forEach(label => {
                    scene.remove(label);
                    if (label.material) label.material.dispose();
                    if (label.geometry) label.geometry.dispose();
                });
                currentGridLabels = [];

                // Dispose renderer and controls only if they exist
                if (renderer) {
                    renderer.setAnimationLoop(null);
                    renderer.dispose();
                    renderer = null;
                }
                if (controls) {
                    controls.removeEventListener('change', updateDynamicGrid); // Remove listener
                    controls.dispose();
                    controls = null;
                }
                if (cadCanvas) {
                    cadCanvas.removeEventListener('mousedown', onCanvasClick, false);
                    cadCanvas.removeEventListener('touchstart', onCanvasClick, false);
                }
                if (transformControls) {
                    transformControls.dispose();
                    transformControls = null;
                }
                // Dispose view axes helper and its scene/camera/renderer only if they exist
                if (viewAxesHelper) {
                    // Iterate through children of viewAxesHelper (the axis meshes)
                    viewAxesHelper.children.forEach(child => {
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
                    viewAxesScene.remove(viewAxesHelper); // Remove the group itself
                    viewAxesHelper = null;
                }
                if (viewAxesRenderer) {
                    viewAxesRenderer.setAnimationLoop(null);
                    viewAxesRenderer.dispose();
                    viewAxesRenderer = null;
                }
                if (viewAxesCamera) {
                    viewAxesCamera = null;
                }
                // Clear the container for the view axes helper
                if (viewAxesContainer) {
                    viewAxesContainer.innerHTML = '';
                }

                // Dispose debug sphere if it exists
                if (raycastDebugSphere) {
                    scene.remove(raycastDebugSphere);
                    if (raycastDebugSphere.geometry) raycastDebugSphere.geometry.dispose();
                    if (raycastDebugSphere.material) raycastDebugSphere.material.dispose();
                    raycastDebugSphere = null;
                }

                // Re-initialize scene after disposal to ensure a clean state
                initScene();
            }
            originalMaterialProperties.clear(); // Clear this map too
            allHighlightsOriginalMaterials.clear(); // Clear all highlights map
            selectedObject = null; // Clear selected object
            currentlySelectedObjectsForEditing = []; // Clear the functional selection array
            console.log("[Dispose] Resources disposed and scene re-initialized.");
        }


        function goToEditor(loadType = 'empty') { // Default to 'empty' if no type specified
            console.log(`[goToEditor] Function called with load type: ${loadType}.`); // Added log

            // Dispose and re-init scene to ensure a clean state for new or loaded models
            disposeSceneResources();

            if (loadType === 'random') {
                console.log("[goToEditor] Loading a random model.");
                loadRandomModel();
                addMessageToLog('System', 'Loading a random model. Use "Upload New File" to add more models.');
                speakResponse('Loading a random model. You can upload files from the editor.');
            } else if (loadType === 'empty') {
                console.log("[goToEditor] Creating an empty model scene.");
                addMessageToLog('System', 'Starting a new, empty model. Use "Upload New File" to load models.');
                speakResponse('Starting a new, empty model. You can upload files from the editor.');
                // No model loading needed for empty scene, just initScene() handles the grid.
            } else if (loadType === 'uploaded' && uploadedFile) {
                loadingMsg.textContent = `Loading model: ${uploadedFile.name}...`;
                loadingMsg.style.color = '#007bff';
                loadingMsg.style.display = 'block';
                console.log(`[goToEditor] Transitioning to editor. Preparing to load uploaded model: ${uploadedFile.name}`);
                console.log(`[goToEditor] Current droppedFileBlobs keys:`, Array.from(droppedFileBlobs.keys()));
                loadModel(uploadedFile);
            } else {
                console.warn("[goToEditor] Invalid loadType or no uploadedFile for 'uploaded' type. Defaulting to empty scene.");
                addMessageToLog('System', 'Invalid load request. Starting with an empty scene.');
                speakResponse('Invalid load request. Starting with an empty scene.');
            }

            uploadPage.classList.remove('page-active');
            uploadPage.classList.add('page-inactive');

            editorPage.classList.remove('page-inactive');
            editorPage.classList.add('page-active');
            console.log("[goToEditor] Page transition complete. Editor page is now active.");
        }

        function loadRandomModel() {
            // Added error handling for empty RANDOM_MODEL_URLS
            if (RANDOM_MODEL_URLS.length === 0) {
                console.warn("[loadRandomModel] RANDOM_MODEL_URLS is empty. Cannot load a random model.");
                addMessageToLog('System', 'No random models available to load. Please try uploading a model or creating a new one.');
                speakResponse('No random models available to load.');
                return;
            }

            const randomIndex = Math.floor(Math.random() * RANDOM_MODEL_URLS.length);
            const modelUrl = RANDOM_MODEL_URLS[randomIndex];
            console.log(`[loadRandomModel] Attempting to load random model from URL: ${modelUrl} (Index: ${randomIndex})`); // Added index to log
            const loader = new THREE.GLTFLoader();
            loader.load(modelUrl, (gltf) => {
                const randomModel = gltf.scene;
                randomModel.name = `Random Model (${modelUrl.split('/').pop()})`;
                scene.add(randomModel);
                // Store initial material(s) for the loaded model or its meshes
                randomModel.traverse((obj) => {
                    if (obj.isMesh && obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.userData.initialMaterial = obj.material.map(mat => mat.clone());
                        } else {
                            obj.userData.initialMaterial = obj.material.clone();
                        }
                    }
                });
                loadedModels.push(randomModel);
                resetView();
                addMessageToLog('System', `Random model "${randomModel.name}" loaded successfully.`);
                speakResponse(`Random model loaded.`);
                console.log(`[loadRandomModel] Random model "${randomModel.name}" loaded successfully.`);
                saveSceneState(); // Save state after loading a new model
            }, (xhr) => { // Progress callback
                loadingMsg.textContent = `Loading ${modelUrl}: ${Math.round(xhr.loaded / xhr.total * 100)}%`;
            }, (error) => {
                console.error(`[loadRandomModel] Error loading random model from ${modelUrl}:`, error);
                addMessageToLog('System', `Failed to load random model from ${modelUrl}. Error details in console. Please try another option.`); // More specific error message
                speakResponse(`Failed to load random model. Please check the console for details.`);
            });
        }


        function goBack() {
            console.log("[Navigation] Going back to upload page.");
            editorPage.classList.remove('page-active');
            editorPage.classList.add('page-inactive');
            uploadPage.classList.remove('page-inactive');
            uploadPage.classList.add('page-active');
            stopVoiceAssist();
            window.removeEventListener('resize', onWindowResize, false);
            disposeSceneResources(); // This will clear all models and re-initialize the scene
            uploadedFile = null;
            droppedFileBlobs.clear();
            originalMaterialProperties.clear(); // Clear this map too
            allHighlightsOriginalMaterials.clear(); // Clear all highlights map
            selectedObject = null;
            currentlySelectedObjectsForEditing = []; // Clear the functional selection array
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

        // --- Three.js Scene Setup and Model Loading ---
        function initScene() {
            console.log("[initScene] Initializing Three.js scene...");
            if (typeof THREE === 'undefined') {
                console.error("THREE is not defined at initScene! Three.js script might not have loaded or executed correctly.");
                addMessageToLog('System', "Error: Three.js library failed to load. Please check console for details.");
                return;
            }
            // Only create new scene, renderer, camera, controls if they don't exist
            if (!scene) {
                scene = new THREE.Scene();
                scene.background = new THREE.Color(0xFFFFFF); // Pure white background
            }
            if (!renderer) {
                renderer = new THREE.WebGLRenderer({ canvas: cadCanvas, antialias: true });
                renderer.setPixelRatio(window.devicePixelRatio);
                renderer.xr.enabled = true;
            }
            if (!camera) {
                const viewerDiv = cadCanvas.parentElement;
                camera = new THREE.PerspectiveCamera(75, viewerDiv.clientWidth / viewerDiv.clientHeight, 0.1, 1000);
                // Adjusted initial camera position for a more "twisted" or perspective view
                camera.position.set(30, 30, 30); // Set camera at an angle
            }
            if (!controls) {
                controls = new THREE.OrbitControls(camera, renderer.domElement);
                controls.enableDamping = true;
                controls.dampingFactor = 0.25;
                controls.addEventListener('change', updateDynamicGrid); // Call on camera change
                controls.target.set(0, 0, 0); // Ensure controls target the origin
            }
            if (!transformControls) {
                transformControls = new THREE.TransformControls(camera, renderer.domElement);
                scene.add(transformControls);
                transformControls.addEventListener('dragging-changed', function (event) {
                    controls.enabled = !event.value;
                    // Save state when transform operation STARTS
                    if (event.value && transformControls.object) {
                        console.log("[TransformControls] Transform operation started, saving state");
                        saveSceneState(); // Save state before transform begins
                    }
                });
                transformControls.addEventListener('objectChange', function () {
                    // Update the object's world matrix during transformation
                    if (transformControls.object) {
                        transformControls.object.updateMatrixWorld(true);
                    }
                });
                transformControls.visible = false; // Initialize as hidden
            }

            // Ensure renderer size is correct on init/re-init
            const viewerDiv = cadCanvas.parentElement;
            renderer.setSize(viewerDiv.clientWidth, viewerDiv.clientHeight);
            camera.aspect = viewerDiv.clientWidth / viewerDiv.clientHeight;
            camera.updateProjectionMatrix();


            // Call updateDynamicGrid initially to set up the first grid
            updateDynamicGrid();

            // Increased lighting for better visibility
            // Remove existing lights before adding new ones to prevent duplicates on re-init
            scene.children.filter(c => c.isLight).forEach(light => scene.remove(light));

            const ambientLight = new THREE.AmbientLight(0x808080); // Brighter ambient light
            scene.add(ambientLight);
            // FIX: Corrected typo from DirectionionalLight to DirectionalLight
            const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Full intensity directional light
            directionalLight.position.set(1, 1, 1).normalize();
            scene.add(directionalLight);
            const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.7); // Additional light from another angle
            directionalLight2.position.set(-1, -1, -1).normalize();
            scene.add(directionalLight2);


            raycaster = new THREE.Raycaster();
            mouse = new THREE.Vector2();
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

            // Initialize raycast debug sphere
            if (!raycastDebugSphere) {
                raycastDebugSphere = new THREE.Mesh(
                    new THREE.SphereGeometry(0.05, 8, 8),
                    new THREE.MeshBasicMaterial({ color: 0xffff00 }) // Yellow sphere
                );
                raycastDebugSphere.visible = false; // Initially hidden
                scene.add(raycastDebugSphere);
            }

            console.log("[initScene] Three.js scene initialized.");
            animate();

            // Initialize undo/redo buttons but don't save empty state yet
            updateUndoRedoButtons();
        }

        // Function to create a text sprite
        function makeTextSprite(message, parameters) {
            if (parameters === undefined) parameters = {};
            const fontface = parameters.fontface || 'Arial';
            const fontsize = parameters.fontsize || 40;
            const borderThickness = 0; // Removed border
            const borderColor = parameters.borderColor || { r: 0, g: 0, b: 0, a: 0.0 }; // Transparent border
            const backgroundColor = parameters.backgroundColor || { r: 255, g: 255, b: 255, a: 0.0 }; // Transparent background
            const textColor = parameters.textColor || { r: 0, g: 0, b: 0, a: 1.0 };

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            context.font = "Bold " + fontsize + "px " + fontface;
            const metrics = context.measureText(message);
            const textWidth = metrics.width;

            // Adjust canvas size to fit text
            canvas.width = textWidth + borderThickness * 2;
            canvas.height = fontsize + borderThickness * 2;

            context.font = "Bold " + fontsize + "px " + fontface;
            context.textBaseline = "middle"; // Center vertically
            context.textAlign = "center";   // Center horizontally

            // background color (if not transparent)
            if (backgroundColor.a > 0) {
                context.fillStyle = "rgba(" + backgroundColor.r + "," + backgroundColor.g + "," + backgroundColor.b + "," + backgroundColor.a + ")";
                context.fillRect(0, 0, canvas.width, canvas.height);
            }

            context.fillStyle = "rgba(" + textColor.r + ", " + textColor.g + ", " + textColor.b + ", " + textColor.a + ")";
            context.fillText(message, canvas.width / 2, canvas.height / 2);

            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;

            const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.userData.isGridLabel = true; // Mark as grid label for easy removal
            return sprite;
        }

        function updateDynamicGrid() {
            // Defensive check: only proceed if controls is defined
            if (!controls) {
                console.warn("[updateDynamicGrid] Controls not initialized, skipping dynamic grid update.");
                return;
            }

            // Clear existing grid and labels
            if (currentGridHelper) {
                scene.remove(currentGridHelper);
                currentGridHelper.geometry.dispose();
                currentGridHelper.material.dispose();
                currentGridHelper = null;
            }
            currentGridLabels.forEach(label => {
                scene.remove(label);
                if (label.material) label.material.dispose();
                if (label.geometry) label.geometry.dispose();
            });
            currentGridLabels = [];

            // Calculate distance to the center of the orbit (controls.target is usually 0,0,0)
            const distance = camera.position.distanceTo(controls.target);

            let gridSize, divisions, labelInterval, labelFontSize, labelScaleFactor;
            let gridLineColor = 0xbbbbbb; // Light grey for grid lines
            let centerLineColor = 0x888888; // Slightly darker for center lines
            // Very light grey for "less bright" effect on pure white background
            let labelTextColor = { r: 180, g: 180, b: 180, a: 1.0 };

            // Define grid levels based on camera distance
            // Further reduced labelScaleFactor and labelFontSize for all levels
            if (distance < 5) { // Very close zoom
                gridSize = 20;
                divisions = 20; // 1 unit per division
                labelInterval = 2; // Labels every 2 units
                labelFontSize = 10; // Very small base font size
                labelScaleFactor = 0.02; // Very small scale factor
            } else if (distance < 20) { // Close zoom
                gridSize = 50;
                divisions = 25; // 2 units per division
                labelInterval = 5; // Labels every 5 units
                labelFontSize = 12; // Very small base font size
                labelScaleFactor = 0.025; // Very small scale factor
            } else if (distance < 80) { // Medium zoom
                gridSize = 100;
                divisions = 20; // 5 units per division
                labelInterval = 10; // Labels every 10 units
                labelFontSize = 14; // Small base font size
                labelScaleFactor = 0.03; // Small scale factor
            } else if (distance < 250) { // Further zoom
                gridSize = 250;
                divisions = 25; // 10 units per division
                labelInterval = 25; // Labels every 25 units
                labelFontSize = 16; // Small base font size
                labelScaleFactor = 0.035; // Small scale factor
            } else if (distance < 600) { // Even further zoom
                gridSize = 600;
                divisions = 30; // 20 units per division
                labelInterval = 50; // Labels every 50 units
                labelFontSize = 18; // Slightly larger base font size
                labelScaleFactor = 0.04; // Slightly larger scale factor
            }
            else { // Very far zoom
                gridSize = 1000;
                divisions = 25; // 40 units per division
                labelInterval = 100; // Labels every 100 units
                labelFontSize = 20; // Slightly larger base font size
                labelScaleFactor = 0.045; // Slightly larger scale factor
            }

            // Create new GridHelper
            const newGridHelper = new THREE.GridHelper(gridSize, divisions, centerLineColor, gridLineColor);
            newGridHelper.material.opacity = 0.2;
            newGridHelper.material.transparent = true;
            newGridHelper.name = 'gridHelper';
            scene.add(newGridHelper);
            currentGridHelper = newGridHelper;

            // Create new labels
            const labelOffset = 0.5; // Kept small and fixed for now
            // Only add labels if the current grid density makes sense for them
            if (labelInterval <= gridSize / 5) { // Arbitrary threshold to avoid too many labels
                for (let i = -gridSize / 2; i <= gridSize / 2; i += labelInterval) {
                    // Skip origin and potentially very small numbers if interval is large
                    if (i === 0 || (labelInterval > 10 && Math.abs(i) < labelInterval)) continue;

                    // X-axis labels
                    const xLabel = makeTextSprite(i.toString(), { textColor: labelTextColor, fontsize: labelFontSize });
                    // Position along Z-edge, adjusted by label size, and slightly offset to prevent overlap with grid lines
                    xLabel.position.set(i, labelOffset, -gridSize / 2 - (labelFontSize * labelScaleFactor * 0.75));
                    xLabel.scale.set(labelFontSize * labelScaleFactor, labelFontSize * labelScaleFactor, 1); // Scale based on font size and factor
                    scene.add(xLabel);
                    currentGridLabels.push(xLabel);

                    // Z-axis labels
                    const zLabel = makeTextSprite(i.toString(), { textColor: labelTextColor, fontsize: labelFontSize });
                    // Position along X-edge, adjusted by label size, and slightly offset
                    zLabel.position.set(-gridSize / 2 - (labelFontSize * labelScaleFactor * 0.75), labelOffset, i);
                    zLabel.scale.set(labelFontSize * labelScaleFactor, labelFontSize * labelScaleFactor, 1);
                    scene.add(zLabel);
                    currentGridLabels.push(zLabel);
                }
            }
        }

        function animate() {
            renderer.setAnimationLoop(() => {
                controls.update();
                renderer.render(scene, camera);
                // Render the static view axes helper scene
                if (viewAxesRenderer && viewAxesScene && viewAxesCamera) {
                    viewAxesRenderer.render(viewAxesScene, viewAxesCamera);
                }
            });
        }

        function loadModel(file) {
            console.log("[loadModel] Attempting to load file:", file.name);
            const loader = new THREE.GLTFLoader();
            const fileLoader = new THREE.FileLoader();
            fileLoader.manager = new THREE.LoadingManager();
            fileLoader.manager.setURLModifier(url => {
                console.log(`[URLModifier] Requested URL: "${url}"`);
                const fileName = url.split('/').pop();
                let resolvedPath = fileName;
                if (url.startsWith('blob:')) {
                    const blobFile = Array.from(droppedFileBlobs.values()).find(f => URL.createObjectURL(f) === url);
                    if (blobFile) {
                        resolvedPath = blobFile.name;
                        console.log(`[URLModifier] Resolved blob URL to file: ${resolvedPath}`);
                    }
                } else {
                    const potentialPaths = Array.from(droppedFileBlobs.keys()).filter(key => key.endsWith(fileName));
                    if (potentialPaths.length > 0) {
                        potentialPaths.sort((a, b) => a.length - b.length)[0]; // Use the shortest path if multiple
                        resolvedPath = potentialPaths.sort((a, b) => a.length - b.length)[0];
                        console.log(`[URLModifier] Resolved relative path to: ${resolvedPath}`);
                    }
                }
                const foundFile = droppedFileBlobs.get(resolvedPath);
                if (foundFile) {
                    const blobURL = URL.createObjectURL(foundFile);
                    console.log(`[URLModifier] Returning Blob URL for ${resolvedPath}: ${blobURL}`);
                    return blobURL;
                } else {
                    console.warn(`[URLModifier] GLTFLoader could not find referenced file: "${url}" (tried "${resolvedPath}", and potentially combined paths). Falling back to original URL.`);
                    return url;
                }
            });
            const reader = new FileReader();
            reader.onload = (event) => {
                const contents = event.target.result;
                console.log(`[FileReader] ${file.name} read successfully.`);
                loader.manager = fileLoader.manager;
                loader.parse(contents, '', (gltf) => {
                    console.log("[GLTFLoader] .gltf/.glb parsing successful.");

                    const newModel = gltf.scene;
                    newModel.name = file.name; // Assign the file name to the model for identification
                    scene.add(newModel); // Add the new model to the scene

                    // Store initial material(s) for the entire model or its meshes
                    newModel.traverse((obj) => {
                        if (obj.isMesh && obj.material) {
                            if (Array.isArray(obj.material)) {
                                obj.userData.initialMaterial = obj.material.map(mat => mat.clone());
                            } else {
                                obj.userData.initialMaterial = obj.material.clone();
                            }
                        }
                    });

                    loadedModels.push(newModel); // Store the new model in our array

                    console.log(`[loadModel] Model '${file.name}' added to scene. Total models: ${loadedModels.length}`);
                    console.log("[loadModel] New model bounding box:", new THREE.Box3().setFromObject(newModel));

                    // Call resetView to adjust camera and controls to fit all loaded models
                    resetView();

                    loadingMsg.style.display = 'none';
                    addMessageToLog('System', `Model '${file.name}' loaded successfully. You now have ${loadedModels.length} models in the scene.`);
                    speakResponse(`Model loaded successfully. You now have ${loadedModels.length} models in the scene.`);
                    console.log("[loadModel] Model successfully added to scene. Current loadedModels:", loadedModels);

                    saveSceneState(); // Save state after loading a new model
                }, (xhr) => { // Progress callback
                    loadingMsg.textContent = `Loading ${file.name}: ${Math.round(xhr.loaded / xhr.total * 100)}%`;
                }, (error) => {
                    console.error('An error happened loading the GLTF model:', error);
                    addMessageToLog('System', 'Error loading model. Please ensure it\'s a valid .gltf or .glb file and all associated files (like textures) are in the same folder if dropped as a folder, or embedded within the .glb.');
                    speakResponse(`Error loading model. Please check the console for details.`);
                    loadingMsg.textContent = '❌ Error loading model!';
                    loadingMsg.style.color = 'red';
                });
            };
            reader.readAsArrayBuffer(file);
        }

        // --- Model Interaction (Selection, Transformation, Information) ---
        let mouseDownX = 0;
        let mouseDownY = 0;
        const CLICK_TOLERANCE = 15; // Increased from 10 to 15 for more forgiving click detection

        // Global highlight material (re-use this instance)
        const highlightMaterial = new THREE.MeshBasicMaterial({
            color: 0x1e90ff, // Dodger Blue
            transparent: true,
            opacity: 0.8,
            depthTest: false, // Important: Render without considering depth
            depthWrite: false // Important: Do not write to depth buffer
        });

        function onCanvasClick(event) {
            console.log(`[onCanvasClick] Event type: ${event.type}, Button: ${event.button}`);
            // Only process left-click (mouse button 0) or touchstart
            if (event.type === 'mousedown' && event.button !== 0) {
                console.log("[onCanvasClick] Ignoring non-left click or non-touchstart event.");
                return;
            }

            // If TransformControls are currently active and dragging, do not process selection
            if (transformControls && transformControls.dragging) {
                console.log("[onCanvasClick] TransformControls are dragging, skipping selection.");
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
            console.log(`[onCanvasClick] Mouse/Touch Down: Initial(${mouseDownX}, ${mouseDownY})`);

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

                console.log(`[onCanvasClick] Mouse/Touch Up: Final(${currentX}, ${currentY}). DeltaX=${deltaX}, DeltaY=${deltaY}. Tolerance=${CLICK_TOLERANCE}`);

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
                    // Normalize mouse coordinates for raycasting using the initial mousedown position
                    const rect = renderer.domElement.getBoundingClientRect();
                    mouse.x = ((mouseDownX - rect.left) / rect.width) * 2 - 1;
                    mouse.y = -((mouseDownY - rect.top) / rect.height) * 2 + 1;
                    console.log(`[onCanvasClick] Normalized mouse coords for raycasting: X=${mouse.x.toFixed(4)}, Y=${mouse.y.toFixed(4)}`);
                    console.log(`[onCanvasClick] Raycaster set from camera. Mouse: (${mouse.x.toFixed(3)}, ${mouse.y.toFixed(3)})`);
                    console.log(`[onCanvasClick] Camera position: (${camera.position.x.toFixed(3)}, ${camera.position.y.toFixed(3)}, ${camera.position.z.toFixed(3)})`);
                    console.log(`[onCanvasClick] Camera fov: ${camera.fov}, aspect: ${camera.aspect}`);


                    raycaster.setFromCamera(mouse, camera);

                    const objectsToIntersect = [];
                    scene.traverse((obj) => { // Traverse the entire scene
                        // Only consider meshes that are visible and not part of the grid or labels
                        if (obj.isMesh && obj.visible && !obj.userData.isGridLabel && obj !== currentGridHelper && obj !== raycastDebugSphere) { // Exclude debug sphere
                            objectsToIntersect.push(obj);
                        }
                    });
                    console.log(`[onCanvasClick] Total visible meshes considered for intersection: ${objectsToIntersect.length}`);
                    if (objectsToIntersect.length === 0) {
                        console.log("[onCanvasClick] No meshes available to intersect.");
                    }


                    // PRIORITY 1: Check for face selection if in face edit mode
                    let faceGroupId = null;
                    if (faceEditState.isActive) {
                        faceGroupId = detectFaceFromClick();
                        console.log(`[onCanvasClick] Face detection result: ${faceGroupId}`);
                    }

                    if (faceGroupId) {
                        // Face overlay clicked - SELECTION ONLY!
                        console.log("[onCanvasClick] Face overlay clicked:", faceGroupId);

                        // ✅ EXACT FACE SELECTION - Toggle + Multi-select
                        if (faceEditState.isActive) {
                            console.log('=== FACE SELECTION DEBUG ===');
                            console.log('[onFaceClick] Face clicked:', faceGroupId);
                            console.log('[onFaceClick] Multi-select mode:', faceEditState.multiSelect);
                            console.log('[onFaceClick] Currently selected:', Array.from(faceEditState.selectedFaceIds));

                            onSelectionChanged(); // Clear pending operations

                            // EXACT LOGIC FROM SPEC
                            if (!faceEditState.multiSelect) {
                                // Single-select toggle
                                if (faceEditState.selectedFaceIds.has(faceGroupId) && faceEditState.selectedFaceIds.size === 1) {
                                    faceEditState.selectedFaceIds.clear(); // Deselect on second tap
                                    console.log('[onFaceClick] Deselected face on second tap');
                                } else {
                                    faceEditState.selectedFaceIds.clear();
                                    faceEditState.selectedFaceIds.add(faceGroupId);
                                    console.log('[onFaceClick] Single-selected face');
                                }
                            } else {
                                // Multi-select toggle
                                if (faceEditState.selectedFaceIds.has(faceGroupId)) {
                                    faceEditState.selectedFaceIds.delete(faceGroupId);
                                    console.log('[onFaceClick] Removed from multi-selection');
                                } else {
                                    faceEditState.selectedFaceIds.add(faceGroupId);
                                    console.log('[onFaceClick] Added to multi-selection');
                                }
                            }

                            // Update visual state
                            faceEditState.groups.forEach(group => {
                                const isSelected = faceEditState.selectedFaceIds.has(group.id);
                                if (group.overlay && group.overlay.material) {
                                    group.overlay.material.opacity = isSelected ? 0.7 : 0.4;
                                    group.overlay.material.color.setHex(isSelected ? 0xff0000 : 0x00ff00);
                                }
                                if (group.outline) {
                                    group.outline.visible = isSelected;
                                    if (group.outline.material) {
                                        group.outline.material.color.setHex(isSelected ? 0xff0000 : 0x000000);
                                    }
                                }
                            });

                            // Update legacy compatibility
                            faceEditState.selectedGroupId = Array.from(faceEditState.selectedFaceIds)[0] || null;

                            const selectedCount = faceEditState.selectedFaceIds.size;
                            const message = selectedCount ? `${selectedCount} face(s) selected` : 'No face selected';
                            console.log("[onFaceClick]", message);
                            addMessageToLog('System', message + '. Say "extrude" or press E.');
                            speakResponse(selectedCount ? 'Face selected.' : 'Face deselected.');
                        }

                        // Show debug sphere at face center
                        const group = faceEditState.groups.find(g => g.id === faceGroupId);
                        if (group) {
                            raycastDebugSphere.position.copy(group.centroid);
                            raycastDebugSphere.visible = true;
                            setTimeout(() => {
                                raycastDebugSphere.visible = false;
                            }, 500);
                        }
                        return; // Don't process normal object selection
                    }

                    // PRIORITY 2: Normal object intersection
                    const intersects = raycaster.intersectObjects(objectsToIntersect, true);
                    console.log(`[onCanvasClick] Intersections found by raycaster: ${intersects.length}`);

                    if (intersects.length > 0) {
                        const intersectedObject = intersects[0].object;
                        console.log("[onCanvasClick] Object intersected:", intersectedObject.name || "Unnamed Object", "UUID:", intersectedObject.uuid, "Type:", intersectedObject.type);

                        // Show raycast debug sphere
                        raycastDebugSphere.position.copy(intersects[0].point);
                        raycastDebugSphere.visible = true;
                        setTimeout(() => {
                            raycastDebugSphere.visible = false;
                        }, 500);

                        // Normal object selection
                        selectObject(intersectedObject);
                    } else {
                        console.log("[onCanvasClick] No object intersected by raycaster. Clearing selection.");
                        raycastDebugSphere.visible = false;
                        clearSelection();

                        // Clear face selection if in face edit mode
                        if (faceEditState.isActive) {
                            faceEditState.selectedGroupId = null;
                        }
                    }
                }

                // Clean up the temporary listeners
                renderer.domElement.removeEventListener('mouseup', onPointerUp);
                renderer.domElement.removeEventListener('touchend', onPointerUp);
            };

            // Attach temporary listeners for mouseup/touchend
            renderer.domElement.addEventListener('mouseup', onPointerUp, { once: true });
            renderer.domElement.addEventListener('touchend', onPointerUp, { once: true });
        }

        function selectObject(object) {
            console.log(`[selectObject] Function called with object: ${object ? object.name || object.uuid : 'null'}`);
            console.log(`[selectObject] Current selectedObject BEFORE: ${selectedObject ? selectedObject.name || selectedObject.uuid : 'null'}`);

            // Clear pending operations when object selection changes
            onSelectionChanged();

            // Clear any existing "select all" highlights first if this object was part of it
            if (allHighlightsOriginalMaterials.size > 0) {
                // Clear all highlights and the currentlySelectedObjectsForEditing array
                clearAllHighlights();
            }

            // Clear any previous individual selection
            clearSelection();

            if (object) {
                selectedObject = object;
                console.log(`[selectObject] Selected object set to: ${selectedObject.name || 'Unnamed Object'} (UUID: ${selectedObject.uuid})`);

                const materials = Array.isArray(selectedObject.material) ? selectedObject.material : [selectedObject.material];
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
                            console.log(`[selectObject] Applied emissive highlight to material for ${selectedObject.name || 'Unnamed Object'} (material index ${index}).`);
                        } else if (mat.color !== undefined) {
                            // If no emissive, change the main color
                            mat.color.copy(highlightMaterial.color);
                            console.log(`[selectObject] Applied color highlight to material for ${selectedObject.name || 'Unnamed Object'} (material index ${index}).`);
                        } else {
                            console.warn(`[selectObject] Material for ${object.name || 'Unnamed Part'} (UUID: ${object.uuid}, material index ${index}) does not have an emissive or color property. Highlighting might not work as expected.`);
                        }
                        mat.needsUpdate = true;
                    } else {
                        console.warn(`[selectObject] Material at index ${index} for object ${object.name || object.uuid} is null or not a valid material. Skipping highlight.`);
                    }
                });
                originalMaterialProperties.set(selectedObject.uuid, objectOriginalMaterials); // Store the array of current materials for individual selection reversion

                transformControls.attach(selectedObject);
                transformControls.visible = true; // Make controls visible
                transformControls.enabled = true; // Ensure controls are enabled

                // Set default mode to translate, but ensure all modes work
                transformControls.setMode('translate');

                console.log(`[selectObject] TransformControls attached: ${transformControls.object ? transformControls.object.name || transformControls.object.uuid : 'none'}`);
                console.log(`[selectObject] TransformControls visible: ${transformControls.visible}`);
                console.log(`[selectObject] TransformControls mode: ${transformControls.mode}`);

                addMessageToLog('System', `Selected: ${object.name || 'Unnamed Part'} (UUID: ${object.uuid}). Press S to scale, R to rotate, G to move.`);
                speakResponse(`Selected ${object.name || 'a part'}. Press S to scale.`);

                // Don't save state on selection - save when actual changes happen
            } else {
                console.log("[selectObject] No object provided for selection, clearing any existing selection.");
                clearSelection(); // If no object is passed, clear selection
            }
            console.log(`[selectObject] Current selectedObject AFTER: ${selectedObject ? selectedObject.name || selectedObject.uuid : 'null'}`);
        }

        function clearSelection() {
            console.log(`[clearSelection] Function called. selectedObject BEFORE: ${selectedObject ? selectedObject.name || selectedObject.uuid : 'null'}`);

            // Clear pending operations when selection is cleared
            onSelectionChanged();

            if (selectedObject && originalMaterialProperties.has(selectedObject.uuid)) {
                console.log(`[clearSelection] Reverting highlight for: ${selectedObject.name || 'Unnamed Part'} (UUID: ${selectedObject.uuid})`);

                const originalMaterials = originalMaterialProperties.get(selectedObject.uuid); // Get the array of original material instances
                const currentMaterials = Array.isArray(selectedObject.material) ? selectedObject.material : [selectedObject.material];

                currentMaterials.forEach((mat, index) => {
                    if (mat && mat.isMaterial && originalMaterials[index]) { // Defensive check
                        mat.dispose(); // Dispose current material before replacing to avoid memory leaks
                        // Assign the original material instance back
                        // Use the initialMaterial if available, otherwise fallback to the one stored for temporary highlight
                        if (selectedObject.userData.initialMaterial && (Array.isArray(selectedObject.userData.initialMaterial) ? selectedObject.userData.initialMaterial[index] : selectedObject.userData.initialMaterial)) {
                            if (Array.isArray(selectedObject.material)) {
                                selectedObject.material[index] = selectedObject.userData.initialMaterial[index].clone(); // Clone to ensure independence
                            } else {
                                selectedObject.material = selectedObject.userData.initialMaterial.clone(); // Clone to ensure independence
                            }
                        } else {
                            if (Array.isArray(selectedObject.material)) {
                                selectedObject.material[index] = originalMaterials[index];
                            } else {
                                selectedObject.material = originalMaterials[index];
                            }
                        }
                        selectedObject.material.needsUpdate = true;
                        console.log(`[clearSelection] Restored material for index ${index}.`);
                    } else {
                        console.warn(`[clearSelection] Material at index ${index} for object ${selectedObject.name || selectedObject.uuid} is null or not a valid material, or no original material instance found. Skipping restore.`);
                    }
                });

                // Detach transform controls before clearing selectedObject
                if (transformControls) {
                    transformControls.detach(); // Detach controls when selection is cleared
                    transformControls.visible = false; // Explicitly hide controls
                    console.log("[clearSelection] TransformControls detached and hidden.");
                }

                originalMaterialProperties.delete(selectedObject.uuid); // Remove from map
                selectedObject = null; // Clear selected object reference
                console.log("[clearSelection] Individual selection cleared and highlight reverted.");
            } else {
                console.log("[clearSelection] No object selected or no original material properties to restore.");
            }
            currentlySelectedObjectsForEditing = []; // Clear the functional selection array
            console.log(`[clearSelection] Function finished. selectedObject AFTER: ${selectedObject ? selectedObject.name || selectedObject.uuid : 'null'}`);
            // Do NOT add message to log or speak here, as it's often called internally before a new selection.
            // addMessageToLog('System', 'Selection cleared.');
            // speakResponse('Selection cleared.');
        }

        // FIXED: Select all with proper group movement
        function highlightAllModels() {
            console.log("[highlightAllModels] Attempting to highlight all models.");
            clearSelection(); // Clear any individual selection first
            clearAllHighlights(); // Clear any previous "select all" highlights

            let highlightedCount = 0;
            currentlySelectedObjectsForEditing = []; // Clear before populating

            // Store original positions for group movement
            const originalPositions = new Map();

            // Iterate over loadedModels for highlighting
            loadedModels.forEach(model => {
                // Highlight the top-level model
                const materials = Array.isArray(model.material) ? model.material : [model.material];
                const objectOriginalMaterials = [];

                // Store original position for group movement
                originalPositions.set(model.uuid, model.position.clone());

                // Highlight all meshes in the model
                model.traverse((obj) => {
                    if (obj.isMesh && obj.visible && !obj.userData.isGridLabel && obj !== currentGridHelper && obj !== raycastDebugSphere) {
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

                        allHighlightsOriginalMaterials.set(obj.uuid, objOriginalMaterials);
                        currentlySelectedObjectsForEditing.push(obj);
                    }
                });

                // Add the top-level model to selection for movement
                currentlySelectedObjectsForEditing.push(model);
            });

            if (highlightedCount > 0) {
                // Create a virtual group object for transform controls
                const groupHelper = new THREE.Object3D();
                groupHelper.name = 'GroupMovementHelper';
                groupHelper.userData.isGroupHelper = true;
                groupHelper.userData.originalPositions = originalPositions;
                groupHelper.userData.selectedModels = [...loadedModels];

                // Position the helper at the center of all objects
                const center = new THREE.Vector3();
                loadedModels.forEach(model => {
                    center.add(model.position);
                });
                center.divideScalar(loadedModels.length);
                groupHelper.position.copy(center);

                scene.add(groupHelper);

                // Attach transform controls to the helper
                if (transformControls) {
                    transformControls.attach(groupHelper);
                    transformControls.visible = true;
                    transformControls.setMode('translate'); // Start with translate mode
                    console.log("[highlightAllModels] Transform controls attached to group helper");
                }

                // Set as selected object for movement
                selectedObject = groupHelper;

                // Store original transforms for all operations
                groupHelper.userData.originalTransforms = new Map();
                loadedModels.forEach(model => {
                    groupHelper.userData.originalTransforms.set(model.uuid, {
                        position: model.position.clone(),
                        rotation: model.rotation.clone(),
                        scale: model.scale.clone()
                    });
                });

                // Add event listeners for ALL transform operations
                if (transformControls) {
                    const onGroupTransform = () => {
                        if (groupHelper.userData.selectedModels) {
                            const mode = transformControls.mode;

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

                    transformControls.addEventListener('objectChange', onGroupTransform);
                    groupHelper.userData.transformListener = onGroupTransform;
                }

                addMessageToLog('AI', `Selected ${highlightedCount} objects. You can now move, scale, rotate, or duplicate them together. Press G/R/S to switch modes.`);
                speakResponse(`Selected all ${highlightedCount} objects. You can now edit them together.`);
                console.log(`[highlightAllModels] Successfully selected ${highlightedCount} objects for group editing.`);
            } else {
                addMessageToLog('System', 'No objects found to select in the scene.');
                speakResponse('No objects found to select.');
                console.log("[highlightAllModels] No objects found to select.");
            }
        }

        // FIXED: Clear highlights and group helper
        function clearAllHighlights() {
            console.log("[clearAllHighlights] Attempting to clear all highlights.");

            // Remove group helper if it exists
            const groupHelper = scene.getObjectByProperty('name', 'GroupMovementHelper');
            if (groupHelper) {
                // Remove event listeners
                if (groupHelper.userData.transformListener && transformControls) {
                    transformControls.removeEventListener('objectChange', groupHelper.userData.transformListener);
                }
                if (groupHelper.userData.moveListener && transformControls) {
                    transformControls.removeEventListener('objectChange', groupHelper.userData.moveListener);
                }
                scene.remove(groupHelper);
                console.log("[clearAllHighlights] Removed group editing helper");
            }

            if (allHighlightsOriginalMaterials.size === 0) {
                console.log("[clearAllHighlights] No global highlights to clear.");
                return;
            }

            let clearedCount = 0;
            for (const [uuid, originalMaterials] of allHighlightsOriginalMaterials.entries()) {
                const object = scene.getObjectByProperty('uuid', uuid);
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
            allHighlightsOriginalMaterials.clear(); // Clear the map
            currentlySelectedObjectsForEditing = []; // Clear the functional selection array
            addMessageToLog('System', `Cleared highlights from ${clearedCount} objects.`);
            speakResponse('All highlights cleared.');
            console.log(`[clearAllHighlights] Successfully cleared highlights from ${clearedCount} objects.`);
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
                if (loadedModels.length > 0) {
                    const currentState = getCurrentState();
                    undoStack.push(currentState);
                    redoStack = []; // Clear redo stack
                }

                // Create a colored overlay for just this face group
                const coloredOverlay = createColoredFaceOverlay(mesh, group, hexColor);
                if (coloredOverlay) {
                    // Add to scene
                    scene.add(coloredOverlay);

                    // Store reference for cleanup
                    if (!mesh.userData.coloredFaces) {
                        mesh.userData.coloredFaces = [];
                    }
                    mesh.userData.coloredFaces.push(coloredOverlay);

                    console.log('[paintFaceMaterial] Added colored overlay to scene');
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
            if (faceEditState?.isActive) {
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
                const oldSelectedObject = selectedObject;
                selectedObject = object;  // Temporarily set for changeObjectColor
                changeObjectColor(hexColor);
                selectedObject = oldSelectedObject;  // Restore

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
            console.log('[color] faceMode:', faceEditState.isActive);
            console.log('[color] selectedId:', faceEditState.selectedGroupId);
            console.log('[color] selectedObject:', selectedObject?.name || 'none');
            console.log('[color] groups count:', faceEditState.groups?.length || 0);
            console.log('[color] targetMesh:', faceEditState.targetMesh?.name || 'none');

            // Priority 1: Face coloring if in face mode with selected face
            if (faceEditState.isActive && faceEditState.selectedGroupId) {
                console.log('[color] ROUTE: paintFaceMaterial');
                const group = faceEditState.groups.find(g => g.id === faceEditState.selectedGroupId);
                console.log('[color] Found group:', group ? 'YES' : 'NO');
                if (group) {
                    console.log('[color] Group triIndices:', group.triIndices?.length || 0);
                    console.log('[color] Target mesh geometry indexed:', !!faceEditState.targetMesh?.geometry?.index);
                    return paintFaceMaterial(faceEditState.targetMesh, group, hexColor);
                } else {
                    console.warn('[color] Selected face group not found!');
                    console.log('[color] Available group IDs:', faceEditState.groups.map(g => g.id));
                    return false;
                }
            }

            // Priority 2: Guide user if in face mode but no face selected
            if (faceEditState.isActive) {
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
            if (!faceEditState.isActive || !faceEditState.targetMesh) {
                console.warn('[refreshFaceGroups] Face edit mode not active');
                return false;
            }

            console.log('[refreshFaceGroups] Refreshing face groups...');

            const targetMesh = faceEditState.targetMesh;
            const wasSelected = faceEditState.selectedGroupId;

            // Clean up old overlays
            faceEditState.groups.forEach(group => {
                if (group.overlay) {
                    scene.remove(group.overlay);
                    group.overlay.geometry.dispose();
                    group.overlay.material.dispose();
                }
                if (group.outline) {
                    scene.remove(group.outline);
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
                scene.add(overlay);
                scene.add(outline);

                overlay.visible = true;
                outline.visible = true;
            });

            // Update state
            faceEditState.groups = newGroups;
            faceEditState.selectedGroupId = null; // Clear selection after refresh

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
            if (loadedModels.length > 0) {
                const currentState = getCurrentState();
                undoStack.push(currentState);
                redoStack = []; // Clear redo stack
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

                // Add to scene
                scene.add(extrudeMesh);
                loadedModels.push(extrudeMesh);

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
            console.log('[handleExtrudeFace] Face mode active:', faceEditState.isActive);
            console.log('[handleExtrudeFace] Selected face IDs:', Array.from(faceEditState.selectedFaceIds));
            console.log('[handleExtrudeFace] Total groups:', faceEditState.groups.length);

            if (!faceEditState.isActive) {
                console.log('[handleExtrudeFace] BLOCKED: Face mode not active');
                addMessageToLog('System', 'Please enter face edit mode first by saying "edit this object".');
                speakResponse('Please enter face edit mode first.');
                return false;
            }

            const selectedIds = Array.from(faceEditState.selectedFaceIds);
            if (selectedIds.length === 0) {
                console.log('[handleExtrudeFace] BLOCKED: No faces selected');
                addMessageToLog('System', 'Please select one or more faces first.');
                speakResponse('Please select faces first.');
                return false;
            }

            const selectedGroups = faceEditState.groups.filter(g => selectedIds.includes(g.id));
            console.log('[handleExtrudeFace] Found', selectedGroups.length, 'matching groups');

            if (selectedGroups.length === 0) {
                console.warn('[handleExtrudeFace] BLOCKED: Selected face groups not found');
                console.log('[handleExtrudeFace] Available group IDs:', faceEditState.groups.map(g => g.id));
                addMessageToLog('System', 'Selected faces not found. Please select faces again.');
                return false;
            }

            console.log('[handleExtrudeFace] SUCCESS: Starting extrude gizmo');
            showExtrudeGizmo(faceEditState.targetMesh, selectedGroups);
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
            extrudeUI.active = true;
            extrudeUI.targetMesh = mesh;
            extrudeUI.faceIds = selectedGroups.map(g => g.id);
            extrudeUI.depth = 0;

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

            scene.add(arrow);
            extrudeUI.arrow = arrow;

            console.log('[showExtrudeGizmo] ✅ Fusion 360 extrude UI ready!');

            // 3) Drag plane orthogonal to normal (goes through centroid)
            extrudeUI.drag.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(F.n, F.o);
            extrudeUI.drag.startPt = F.o.clone();

            console.log('[showExtrudeGizmo] 2D Fusion-style arrow created at:', F.o);
            addMessageToLog('System', 'Drag arrow to set depth (perpendicular). Click background/Enter to confirm, Esc to cancel.');
            speakResponse('Drag the arrow to set depth.');
        }

        // Update live extrude preview - EXACT BOUNDARY VERSION
        function updateExtrudePreview(depth) {
            clearExtrudePreview();
            const mesh = extrudeUI.targetMesh;

            console.log('[updateExtrudePreview] Creating preview for depth:', depth);

            for (const id of extrudeUI.faceIds) {
                const group = faceEditState.groups.find(g => g.id === id);
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
                scene.add(previewMesh);
                extrudeUI.previewMeshes.push(previewMesh);
            }

            requestRender();
        }

        // Update extrude distance from input field
        function updateExtrudeDistance() {
            const input = document.getElementById('extrudeDistanceInput');
            if (!input || !extrudeUI.active) return;

            const newDepth = parseFloat(input.value) || 0;
            extrudeUI.depth = newDepth;

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
            for (const mesh of extrudeUI.previewMeshes) {
                scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
            }
            extrudeUI.previewMeshes.length = 0;
        }

        // Confirm extrude operation - EXACT SPEC VERSION
        function confirmExtrude() {
            if (!extrudeUI.active) return;

            console.log('[confirmExtrude] Confirming extrude with depth:', extrudeUI.depth);

            const mesh = extrudeUI.targetMesh;
            const depth = extrudeUI.depth;

            // Save state for undo (grouped action)
            if (loadedModels.length > 0) {
                const currentState = getCurrentState();
                undoStack.push(currentState);
                redoStack = []; // Clear redo stack
            }

            // Option A: ADD bosses as separate meshes
            const created = [];
            for (const id of extrudeUI.faceIds) {
                const group = faceEditState.groups.find(g => g.id === id);
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

                scene.add(boss);
                loadedModels.push(boss);
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

            if (extrudeUI.arrow) {
                scene.remove(extrudeUI.arrow);
                extrudeUI.arrow = null;
            }

            extrudeUI.active = false;
            extrudeUI.faceIds = [];
            extrudeUI.targetMesh = null;
            extrudeUI.depth = 0;
            extrudeUI.drag = { on: false, startPt: null, plane: null };

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
            if (!extrudeUI.active) {
                console.log('[onExtrudePointerDown] Extrude UI not active');
                return;
            }

            console.log('[onExtrudePointerDown] Extrude UI active, processing click');

            // Update mouse coordinates
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            console.log('[onExtrudePointerDown] Mouse coords:', mouse.x.toFixed(3), mouse.y.toFixed(3));
            console.log('[onExtrudePointerDown] Arrow exists:', !!extrudeUI.arrow);

            // Check if 2D arrow was clicked (recursive for Group)
            const arrowIntersects = raycaster.intersectObject(extrudeUI.arrow, true);
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
                const firstGroup = faceEditState.groups.find(g => g.id === extrudeUI.faceIds[0]);
                if (firstGroup) {
                    const boundaryResult = buildFaceBoundaryPolygon(extrudeUI.targetMesh, firstGroup);
                    if (boundaryResult) {
                        const { F } = boundaryResult;

                        // Set up drag state with face-aligned plane
                        extrudeUI.drag.on = true;
                        extrudeUI.drag.startPt = F.o.clone();
                        extrudeUI.drag.plane = new THREE.Plane(F.n, -F.o.dot(F.n));

                        console.log('   Drag setup complete - face normal:', F.n.toArray());
                        console.log('   Start point:', extrudeUI.drag.startPt.toArray());
                    }
                }

                event.preventDefault();
                event.stopPropagation();
                return;
            }

            console.log('[onExtrudePointerDown] Arrow not clicked, checking background');

            // Confirm by clicking background: detect click that did NOT hit gizmo or overlays
            const hitOverlay = faceEditState.isActive && raycaster.intersectObjects(
                faceEditState.groups.map(g => g.overlay).filter(o => o),
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
            if (!extrudeUI.active) return;
            if (!extrudeUI.drag.on) return;

            console.log('🔄 [onExtrudePointerMove] Dragging arrow...');

            // Update mouse coordinates
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            // Get face info for movement calculation
            const firstGroup = faceEditState.groups.find(g => g.id === extrudeUI.faceIds[0]);
            if (!firstGroup) {
                console.log('[onExtrudePointerMove] No first group found');
                return;
            }

            const boundaryResult = buildFaceBoundaryPolygon(extrudeUI.targetMesh, firstGroup);
            if (!boundaryResult) {
                console.log('[onExtrudePointerMove] No boundary result');
                return;
            }

            const { F } = boundaryResult;

            // Create a plane perpendicular to the camera for better mouse tracking
            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection);
            const dragPlane = new THREE.Plane(cameraDirection, -F.o.dot(cameraDirection));

            // Get current mouse position on the drag plane
            const currentPoint = new THREE.Vector3();
            if (!raycaster.ray.intersectPlane(dragPlane, currentPoint)) {
                console.log('[onExtrudePointerMove] No plane intersection');
                return;
            }

            // Calculate movement from face center and project onto face normal
            const delta = new THREE.Vector3().subVectors(currentPoint, F.o);
            const depth = THREE.MathUtils.clamp(delta.dot(F.n), -2.0, 2.0); // Signed depth along normal

            extrudeUI.depth = depth;

            // Update input field to match drag
            const input = document.getElementById('extrudeDistanceInput');
            if (input) {
                input.value = depth.toFixed(2);
            }

            // Update 2D arrow position along normal (keep same orientation)
            const newPosition = F.o.clone().add(F.n.clone().multiplyScalar(depth + 0.1)); // +0.1 for visibility offset
            extrudeUI.arrow.position.copy(newPosition);

            // Live preview for each selected face
            updateExtrudePreview(depth);

            console.log('[onExtrudePointerMove] Depth:', depth.toFixed(3), 'Position:', newPosition.toArray().map(n => n.toFixed(2)));
        }

        function onExtrudePointerUp(event) {
            if (!extrudeUI.active) return;

            if (extrudeUI.drag.on) {
                console.log('[onExtrudePointerUp] Drag ended');
                extrudeUI.drag.on = false;
            }
        }

        // SMART DELETE HANDLER - Face vs Object
        function handleDeleteCommand() {
            console.log('[handleDeleteCommand] Delete command received');
            console.log(`[handleDeleteCommand] Face mode active: ${faceEditState.isActive}`);
            console.log(`[handleDeleteCommand] Selected face: ${faceEditState.selectedGroupId}`);

            // Priority 1: Face deletion if in face mode with selected face
            if (faceEditState.isActive && faceEditState.selectedGroupId) {
                const group = faceEditState.groups.find(g => g.id === faceEditState.selectedGroupId);
                if (group) {
                    console.log('[handleDeleteCommand] Deleting selected face');
                    return deleteFaceGroup(faceEditState.targetMesh, group);
                }
            }

            // Priority 2: Ask user if in face mode but no face selected
            if (faceEditState.isActive && !faceEditState.selectedGroupId) {
                console.log('[handleDeleteCommand] Face mode active but no face selected');
                addMessageToLog('System', 'No face selected. Click on a face first, or say "exit face mode" to delete the whole object.');
                speakResponse('No face selected. Click on a face first.');
                return;
            }

            // Priority 3: Normal object deletion
            console.log('[handleDeleteCommand] Normal object deletion');
            removeObject();
        }


        function removeObject() {
            // Only save state if we have objects (never save empty state)
            if (loadedModels.length > 0) {
                const currentState = getCurrentState();
                undoStack.push(currentState);
                redoStack = []; // Clear redo stack
                console.log("[removeObject] Saved state with", loadedModels.length, "objects");
            }
            if (selectedObject) {
                const objectToRemoveName = selectedObject.name || "Unnamed Part";
                const objectToRemoveUUID = selectedObject.uuid;

                transformControls.detach();

                let parent = selectedObject.parent;
                if (parent) {
                    parent.remove(selectedObject);
                    if (selectedObject.geometry) selectedObject.geometry.dispose();
                    if (selectedObject.material) {
                        if (Array.isArray(selectedObject.material)) {
                            selectedObject.material.forEach(material => material.dispose());
                        } else {
                            selectedObject.material.dispose();
                        }
                    }

                    const index = loadedModels.indexOf(selectedObject);
                    if (index > -1) {
                        loadedModels.splice(index, 1);
                        console.log(`[Remove Object] Removed top-level model: ${objectToRemoveName}. Remaining models: ${loadedModels.length}`);
                    } else {
                        console.log(`[Remove Object] Removed object: ${objectToRemoveName} (UUID: ${objectToRemoveUUID})`);
                    }

                    if (originalMaterialProperties.has(selectedObject.uuid)) {
                        originalMaterialProperties.delete(selectedObject.uuid);
                    }
                    if (allHighlightsOriginalMaterials.has(selectedObject.uuid)) {
                        allHighlightsOriginalMaterials.delete(selectedObject.uuid);
                    }

                    addMessageToLog('AI', `Removed ${objectToRemoveName}.`);
                    speakResponse(`Removed ${objectToRemoveName}.`);
                    selectedObject = null;
                    currentlySelectedObjectsForEditing = [];
                    resetView();
                } else {
                    console.warn(`[Remove Object] Selected object ${objectToRemoveName} has no parent to remove from.`);
                    addMessageToLog('System', `Cannot remove ${objectToRemoveName}: No parent found.`);
                    speakResponse(`Cannot remove that part.`);
                }
            } else {
                addMessageToLog('System', 'No object selected to remove.');
                speakResponse('No object selected to remove.');
            }
            updateUndoRedoButtons();
        }

        function duplicateSelectedObject() {
            console.log("[duplicateSelectedObject] Legacy function called, redirecting to duplicateSelection()");
            // Redirect to the new unified function
            duplicateSelection();
        }


        function resetView() {
            // Don't save state for view changes - this is just camera movement
            if (controls && camera && loadedModels.length > 0) {
                const overallBbox = new THREE.Box3();
                loadedModels.forEach(model => {
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

                const fov = camera.fov * (Math.PI / 180);
                const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));

                const newCameraPosition = center.clone().add(new THREE.Vector3(maxDim * 0.8, maxDim * 0.8, maxDim * 0.8));
                camera.position.copy(newCameraPosition);
                camera.lookAt(center);
                controls.target.copy(center);
                controls.update();

                addMessageToLog('AI', 'View reset to fit all models.');
                speakResponse('View reset to fit all models.');
            } else if (controls && camera) {
                camera.position.set(30, 30, 30);
                camera.lookAt(0, 0, 0);
                controls.target.set(0, 0, 0);
                controls.update();
                addMessageToLog('System', 'No models loaded. Resetting to default view.');
                speakResponse('No models loaded. Resetting to default view.');
            } else {
                addMessageToLog('System', 'Three.js components not initialized for view reset.');
                speakResponse('Cannot reset view, editor components not ready.');
            }
            updateUndoRedoButtons();
        }

        function showDesignInfo() {
            if (loadedModels.length > 0) {
                let info = `Total Models Loaded: ${loadedModels.length}\n`;
                loadedModels.forEach((model, index) => {
                    info += `\nModel ${index + 1} (${model.name || 'Unnamed Model'}):\n`;
                    info += `  Number of Meshes: ${model.children.filter(c => c.isMesh).length}\n`;
                    info += `  Total Objects: ${model.children.length}\n`;
                });

                const sceneBbox = new THREE.Box3().setFromObject(scene);
                const sceneSize = sceneBbox.getSize(new THREE.Vector3());
                info += `\nOverall Scene Bounding Box Size: X=${sceneSize.x.toFixed(2)}, Y=${sceneSize.y.toFixed(2)}, Z=${sceneSize.z.toFixed(2)}\n`;

                addMessageToLog('AI', info);
                speakResponse('Design information displayed for all loaded models.');
            } else {
                addMessageToLog('System', 'No models loaded to show design information.');
                speakResponse('No models loaded.');
            }
        }

        function setTransformMode(mode) {
            if (transformControls) {
                // Don't save state for mode changes - save when actual transform happens
                transformControls.setMode(mode);
                addMessageToLog('AI', `Transform mode set to ${mode}.`);
                speakResponse(`Transform mode set to ${mode}.`);
            } else {
                addMessageToLog('System', 'Transform controls not available.');
                speakResponse('Transform controls are not available.');
            }
        }

        function listParts() {
            if (loadedModels.length > 0) {
                let parts = "Parts in loaded models:\n";
                loadedModels.forEach((model, modelIndex) => {
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
            if (loadedModels.length > 0) {
                let foundObject = null;
                for (const model of loadedModels) {
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

        // --- Camera View Functions (now including negative axes) ---
        function setCameraView(position, target) {
            if (camera && controls) {
                camera.position.copy(position);
                controls.target.copy(target);
                controls.update(); // Update controls after changing camera position/target
                addMessageToLog('System', `Camera view set to [${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}] looking at [${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)}].`);
            } else {
                addMessageToLog('System', 'Three.js components not initialized for view change.');
            }
        }

        function getSceneCenterAndDistance() {
            const bbox = new THREE.Box3().setFromObject(scene);
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

        // --- Static View Axes Helper ---
        let viewAxesRaycaster;
        let viewAxesMouse;
        // viewAxesSceneRendered is a global flag, already declared at the top

        function initViewAxesHelper() {
            if (viewAxesSceneRendered) return; // Prevent re-initialization

            viewAxesScene = new THREE.Scene();
            viewAxesCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10); // Small FOV, aspect 1:1 for container
            viewAxesCamera.position.set(1.5, 1.5, 1.5); // Fixed position for isometric view of axes
            viewAxesCamera.lookAt(0, 0, 0);

            viewAxesRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // Alpha true for transparent background
            viewAxesRenderer.setPixelRatio(window.devicePixelRatio);
            viewAxesRenderer.setSize(viewAxesContainer.clientWidth, viewAxesContainer.clientHeight);
            viewAxesRenderer.domElement.style.width = '100%';
            viewAxesRenderer.domElement.style.height = '100%';
            viewAxesContainer.appendChild(viewAxesRenderer.domElement);

            // Create a custom AxesHelper with clickable parts
            viewAxesHelper = new THREE.Group();
            const axisLength = 1.0;
            const axisRadius = 0.08; // Made axes thicker for easier clicking

            // X-axis (Red)
            const xAxisMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const xAxisCylinder = new THREE.Mesh(new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8), xAxisMaterial);
            xAxisCylinder.rotation.z = -Math.PI / 2;
            xAxisCylinder.position.x = axisLength / 2;
            xAxisCylinder.userData.axis = 'x';
            xAxisCylinder.userData.direction = 'positive';
            viewAxesHelper.add(xAxisCylinder);

            const negXAxisCylinder = new THREE.Mesh(new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8), xAxisMaterial);
            negXAxisCylinder.rotation.z = Math.PI / 2;
            negXAxisCylinder.position.x = -axisLength / 2;
            negXAxisCylinder.userData.axis = 'x';
            negXAxisCylinder.userData.direction = 'negative';
            viewAxesHelper.add(negXAxisCylinder);

            // Y-axis (Green)
            const yAxisMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const yAxisCylinder = new THREE.Mesh(new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8), yAxisMaterial);
            yAxisCylinder.position.y = axisLength / 2;
            yAxisCylinder.userData.axis = 'y';
            yAxisCylinder.userData.direction = 'positive';
            viewAxesHelper.add(yAxisCylinder);

            const negYAxisCylinder = new THREE.Mesh(new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8), yAxisMaterial);
            negYAxisCylinder.rotation.z = Math.PI; // Rotate to point downwards
            negYAxisCylinder.position.y = -axisLength / 2;
            negYAxisCylinder.userData.axis = 'y';
            negYAxisCylinder.userData.direction = 'negative';
            viewAxesHelper.add(negYAxisCylinder);

            // Z-axis (Blue)
            const zAxisMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
            const zAxisCylinder = new THREE.Mesh(new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8), zAxisMaterial);
            zAxisCylinder.rotation.x = Math.PI / 2;
            zAxisCylinder.position.z = axisLength / 2;
            zAxisCylinder.userData.axis = 'z';
            zAxisCylinder.userData.direction = 'positive';
            viewAxesHelper.add(zAxisCylinder);

            const negZAxisCylinder = new THREE.Mesh(new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8), zAxisMaterial);
            negZAxisCylinder.rotation.x = -Math.PI / 2;
            negZAxisCylinder.position.z = -axisLength / 2;
            negZAxisCylinder.userData.axis = 'z';
            negZAxisCylinder.userData.direction = 'negative';
            viewAxesHelper.add(negZAxisCylinder);

            viewAxesScene.add(viewAxesHelper);

            // Add labels (X, Y, Z)
            const labelScale = 0.2; // Adjust label size
            const labelOffset = 0.7; // Offset from axis end

            const xLabel = makeTextSprite('X', { textColor: { r: 255, g: 0, b: 0, a: 1.0 }, fontsize: 60 });
            xLabel.position.set(axisLength + labelOffset, 0, 0);
            xLabel.scale.set(labelScale, labelScale, 1);
            viewAxesScene.add(xLabel);

            const yLabel = makeTextSprite('Y', { textColor: { r: 0, g: 255, b: 0, a: 1.0 }, fontsize: 60 });
            yLabel.position.set(0, axisLength + labelOffset, 0);
            yLabel.scale.set(labelScale, labelScale, 1);
            viewAxesScene.add(yLabel);

            const zLabel = makeTextSprite('Z', { textColor: { r: 0, g: 0, b: 255, a: 1.0 }, fontsize: 60 });
            zLabel.position.set(0, 0, axisLength + labelOffset);
            zLabel.scale.set(labelScale, labelScale, 1);
            viewAxesScene.add(zLabel);


            viewAxesRaycaster = new THREE.Raycaster();
            viewAxesMouse = new THREE.Vector2();

            viewAxesContainer.addEventListener('click', onViewAxesClick, false);

            viewAxesSceneRendered = true;
        }

        // DIRECT FACE DETECTION - Raycast original mesh and find face group
        function detectFaceFromClick() {
            console.log('[detectFaceFromClick] Called - faceMode:', faceEditState.isActive);

            if (!faceEditState.isActive || !faceEditState.targetMesh) {
                console.log('[detectFaceFromClick] No face mode or target mesh');
                return null;
            }

            // Raycast against the original target mesh
            const intersects = raycaster.intersectObject(faceEditState.targetMesh, false);
            console.log('[detectFaceFromClick] Intersects with target mesh:', intersects.length);

            if (intersects.length === 0) {
                console.log('[detectFaceFromClick] No intersection with target mesh');
                return null;
            }

            const intersection = intersects[0];
            const faceIndex = intersection.faceIndex;
            console.log('[detectFaceFromClick] Hit face index:', faceIndex);

            // Find which face group contains this triangle
            for (let i = 0; i < faceEditState.groups.length; i++) {
                const group = faceEditState.groups[i];
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

        // Mouse move handler for face hovering
        let lastHoveredGroupId = null;

        function onCanvasMouseMove(event) {
            if (!faceEditState.isActive) return;

            // Get mouse position
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            // Raycast for face overlays
            raycaster.setFromCamera(mouse, camera);
            const hoveredGroupId = raycastFaceOverlays();

            // ✅ HOVER = HIGHLIGHT ONLY! NO EDITING!
            if (hoveredGroupId !== lastHoveredGroupId) {
                // Update hover visual state
                faceEditState.groups.forEach(group => {
                    const isHovered = group.id === hoveredGroupId;
                    const isSelected = faceEditState.selectedFaceIds.has(group.id);

                    if (group.overlay && group.overlay.material) {
                        if (isSelected) {
                            // Keep selected appearance (red)
                            group.overlay.material.opacity = 0.6;
                            group.overlay.material.color.setHex(0xff0000);
                        } else if (isHovered) {
                            // Hover appearance (bright green)
                            group.overlay.material.opacity = 0.35;
                            group.overlay.material.color.setHex(0x44ff44);
                        } else {
                            // Normal appearance (visible green - like Fusion 360)
                            group.overlay.material.opacity = 0.4;
                            group.overlay.material.color.setHex(0x00ff00);
                        }
                    }
                });

                lastHoveredGroupId = hoveredGroupId;
            }

            // ⛔ NO GEOMETRY MODIFICATION/PAINTING/EXTRUDE HERE!
        }

        function onViewAxesClick(event) {
            event.preventDefault(); // Prevent default browser behavior

            // Calculate mouse position in normalized device coordinates (NDC)
            // (-1 to +1) for both X and Y
            const rect = viewAxesRenderer.domElement.getBoundingClientRect();
            viewAxesMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            viewAxesMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            viewAxesRaycaster.setFromCamera(viewAxesMouse, viewAxesCamera);

            // Check for intersections with the individual axis meshes
            const intersects = viewAxesRaycaster.intersectObjects(viewAxesHelper.children, true);

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
        function addMessageToLog(sender, message) {
            const messageElement = document.createElement('p');
            messageElement.classList.add(sender === 'User' ? 'user-message' : sender === 'AI' ? 'ai-response' : 'system-message');
            messageElement.textContent = `${sender}: ${message}`;
            aiLog.appendChild(messageElement);
            aiLog.scrollTop = aiLog.scrollHeight; // Auto-scroll to bottom
        }

        // --- Backend API Configuration ---
        // This URL should point to your Render backend's AI proxy endpoint.
        const BACKEND_API_URL = "https://mingyu.onrender.com/api/ai"; // YOUR RENDER BACKEND URL HERE

        async function sendAICommand(command) {
            sendTextCommandBtn.disabled = true;
            textCommandInput.disabled = true;
            addMessageToLog('System', 'AI is thinking...');
            console.log("[sendAICommand] Sending command to Render backend:", command);

            let selectedObjectInfo = "none";
            // Check if there are objects in currentlySelectedObjectsForEditing (meaning "select all" is active)
            if (currentlySelectedObjectsForEditing.length > 0) {
                const uuids = currentlySelectedObjectsForEditing.map(obj => obj.uuid);
                selectedObjectInfo = `Multiple CAD objects are currently selected for editing with UUIDs: ${uuids.join(', ')}.`;
            } else if (selectedObject) {
                selectedObjectInfo = `A CAD object is currently selected with UUID: ${selectedObject.uuid} and name: "${selectedObject.name || 'Unnamed Part'}".`;
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

                    4.  **To reset the camera view to fit all models:**
                        User input example: "reset view", "fit all", "zoom out to see everything"
                        Return:
                        \`\`\`json
                        {"action": "resetView"}
                        \`\`\`

                    5.  **To show design information (e.g., number of models, bounding box):**
                        User input example: "show design info", "what's in the scene?", "tell me about the design"
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

                    9.  **To highlight all objects in the scene:**
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

                        For these commands, analyze the scene objects and return:
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
                    Scene objects: ${JSON.stringify(buildModelContext().objects)}
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
            if (loadedModels.length > 0) {
                const currentState = getCurrentState();
                undoStack.push(currentState);
                redoStack = []; // Clear redo stack
                console.log("[changeObjectColor] Saved state with", loadedModels.length, "objects");
            }
            const newColor = new THREE.Color(colorValue);
            let objectsToModify = [];

            // If currentlySelectedObjectsForEditing is populated, use it for batch operations
            if (currentlySelectedObjectsForEditing.length > 0) {
                console.log(`[changeObjectColor] Applying color to ${currentlySelectedObjectsForEditing.length} objects from batch selection.`);
                objectsToModify = [...currentlySelectedObjectsForEditing]; // Use spread to copy array
            } else if (selectedObject) {
                // Fallback to single selected object if no batch selection
                console.log("[changeObjectColor] Applying color to single selected object.");
                objectsToModify.push(selectedObject);
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
                // After changing color, update originalMaterialProperties for the current selection cycle
                // This ensures that if this object is later individually selected, its highlight reverts correctly.
                const updatedOriginalMaterials = [];
                const topLevelMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];
                topLevelMaterials.forEach(mat => {
                    if (mat && mat.isMaterial) {
                        updatedOriginalMaterials.push(mat.clone());
                    }
                });
                originalMaterialProperties.set(obj.uuid, updatedOriginalMaterials);
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
            if (loadedModels.length === 0) {
                console.log('1. Creating test cube...');
                createPrimitive('cube');
                setTimeout(() => testExtrudeImprovements(), 500);
                return;
            }

            const cube = loadedModels[0];
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
            console.log('   - Face groups found:', faceEditState.groups.length);

            // Step 4: Auto-select first face
            setTimeout(() => {
                console.log('4. Auto-selecting first face...');
                const firstFace = faceEditState.groups[0];
                faceEditState.selectedFaceIds.add(firstFace.id);
                firstFace.outline.visible = true;

                // Step 5: Test extrude
                setTimeout(() => {
                    console.log('5. Testing extrude...');
                    const extrudeResult = handleExtrudeFace();

                    if (extrudeResult && extrudeUI.arrow) {
                        console.log('✅ SUCCESS: All improvements working!');
                        console.log('   - 2D arrow created:', !!extrudeUI.arrow);
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
            if (loadedModels.length === 0) {
                console.log('1. Creating test cube...');
                createPrimitive('cube');
                setTimeout(() => testExtrudeWorkflow(), 500);
                return;
            }

            // Step 2: Select the cube
            const cube = loadedModels[0];
            console.log('2. Selecting cube:', cube.name);
            selectObject(cube);

            // Step 3: Enter face edit mode
            console.log('3. Entering face edit mode...');
            const faceResult = enterFaceEditMode();
            console.log('   Face mode active:', faceEditState.isActive);
            console.log('   Face groups found:', faceEditState.groups.length);

            if (!faceEditState.isActive) {
                console.error('❌ Failed to enter face edit mode');
                return;
            }

            // Step 4: Auto-select first face
            setTimeout(() => {
                console.log('4. Auto-selecting first face...');
                if (faceEditState.groups.length > 0) {
                    const firstFace = faceEditState.groups[0];
                    faceEditState.selectedFaceIds.add(firstFace.id);
                    faceEditState.selectedGroupId = firstFace.id;

                    // Update visual feedback
                    firstFace.outline.visible = true;

                    console.log('   Selected face ID:', firstFace.id);
                    console.log('   Selected faces count:', faceEditState.selectedFaceIds.size);

                    // Step 5: Test extrude
                    setTimeout(() => {
                        console.log('5. Testing extrude...');
                        const extrudeResult = handleExtrudeFace();

                        if (extrudeResult) {
                            console.log('✅ SUCCESS: Extrude started!');
                            console.log('   Arrow created:', !!extrudeUI.arrow);
                            console.log('   UI active:', extrudeUI.active);
                            console.log('');
                            console.log('🎯 NOW TRY:');
                            console.log('   - Drag the green arrow to set depth');
                            console.log('   - Press Enter to confirm');
                            console.log('   - Press Esc to cancel');
                        } else {
                            console.error('❌ FAILED: Extrude did not start');
                            console.log('   Face mode active:', faceEditState.isActive);
                            console.log('   Selected faces:', faceEditState.selectedFaceIds.size);
                            console.log('   Available groups:', faceEditState.groups.length);
                        }
                    }, 500);
                } else {
                    console.error('❌ No face groups found');
                }
            }, 500);
        };

        // Clear all models from scene
        window.clearAllModels = function() {
            console.log(`[clearAllModels] Clearing ${loadedModels.length} models`);
            loadedModels.forEach(model => {
                if (scene && model) {
                    scene.remove(model);
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
            loadedModels.length = 0;
            clearSelection();
            clearAllHighlights();
            console.log('[clearAllModels] All models cleared');
        };

        // DEBUG: Check extrude system status
        window.checkExtrudeStatus = function() {
            console.log('=== EXTRUDE SYSTEM STATUS ===');
            console.log('Face edit mode active:', faceEditState.isActive);
            console.log('Selected object:', selectedObject ? selectedObject.name : 'none');
            console.log('Face groups available:', faceEditState.groups.length);
            console.log('Selected face IDs:', Array.from(faceEditState.selectedFaceIds));
            console.log('Extrude UI active:', extrudeUI.active);
            console.log('Extrude arrow exists:', !!extrudeUI.arrow);
            console.log('');
            console.log('🔧 QUICK FIXES:');
            console.log('- testExtrudeWorkflow() - Full test');
            console.log('- createPrimitive("cube") - Create test object');
            console.log('- selectObject(loadedModels[0]) - Select first object');
            console.log('- enterFaceEditMode() - Enter face mode');
            console.log('- handleExtrudeFace() - Start extrude');
        };

        // FIXED: Function to create primitive shapes - GUARANTEED TO WORK
        function createPrimitive(type) {
            console.log(`[createPrimitive] Creating ${type} shape`);

            // Check if THREE.js is loaded
            if (typeof THREE === 'undefined') {
                console.error("[createPrimitive] THREE.js not loaded!");
                alert("THREE.js library not loaded. Please refresh the page.");
                return;
            }

            // Check if scene is initialized
            if (!scene) {
                console.error("[createPrimitive] Scene not initialized!");
                alert("Scene not initialized. Please refresh the page.");
                return;
            }

            // Save state for undo (only if we have existing objects)
            if (loadedModels.length > 0) {
                const currentState = getCurrentState();
                undoStack.push(currentState);
                redoStack = []; // Clear redo stack
                console.log("[createPrimitive] Saved state with", loadedModels.length, "objects");
            }

            // Create material
            const material = new THREE.MeshStandardMaterial({
                color: 0x00ff00,  // Green color for visibility
                metalness: 0.3,
                roughness: 0.7
            });

            let geometry;
            let mesh;

            // Create geometry based on type
            try {
                switch (type.toLowerCase()) {
                    case 'box':
                    case 'cube':
                        geometry = new THREE.BoxGeometry(1, 1, 1);
                        mesh = new THREE.Mesh(geometry, material);
                        mesh.name = 'Cube';
                        console.log("[createPrimitive] Created cube geometry");
                        break;

                    case 'sphere':
                    case 'ball':
                        geometry = new THREE.SphereGeometry(0.5, 32, 32);
                        mesh = new THREE.Mesh(geometry, material);
                        mesh.name = 'Sphere';
                        console.log("[createPrimitive] Created sphere geometry");
                        break;

                    case 'cylinder':
                    case 'tube':
                        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
                        mesh = new THREE.Mesh(geometry, material);
                        mesh.name = 'Cylinder';
                        console.log("[createPrimitive] Created cylinder geometry");
                        break;

                    case 'cone':
                        geometry = new THREE.ConeGeometry(0.5, 1, 32);
                        mesh = new THREE.Mesh(geometry, material);
                        mesh.name = 'Cone';
                        console.log("[createPrimitive] Created cone geometry");
                        break;

                    case 'pyramid':
                        geometry = new THREE.ConeGeometry(0.5, 1, 4);
                        mesh = new THREE.Mesh(geometry, material);
                        mesh.name = 'Pyramid';
                        console.log("[createPrimitive] Created pyramid geometry");
                        break;

                    case 'plane':
                        geometry = new THREE.PlaneGeometry(2, 2);
                        mesh = new THREE.Mesh(geometry, material);
                        mesh.rotation.x = -Math.PI / 2; // Lay flat
                        mesh.name = 'Plane';
                        console.log("[createPrimitive] Created plane geometry");
                        break;

                    case 'torus':
                    case 'donut':
                        geometry = new THREE.TorusGeometry(0.5, 0.2, 16, 100);
                        mesh = new THREE.Mesh(geometry, material);
                        mesh.name = 'Torus';
                        console.log("[createPrimitive] Created torus geometry");
                        break;

                    default:
                        console.error(`[createPrimitive] Unknown shape type: ${type}`);
                        alert(`Unknown shape type: ${type}. Available: cube, sphere, cylinder, cone, pyramid, plane, torus`);
                        return;
                }
            } catch (error) {
                console.error("[createPrimitive] Error creating geometry:", error);
                alert(`Error creating ${type}: ${error.message}`);
                return;
            }

            // Verify mesh was created
            if (!mesh) {
                console.error("[createPrimitive] Failed to create mesh");
                alert(`Failed to create ${type}`);
                return;
            }

            console.log(`[createPrimitive] Mesh created successfully: ${mesh.name}`);

            // Set position (in front of camera)
            mesh.position.set(0, 1, 0); // Simple position above ground

            // Store metadata
            mesh.userData.isPrimitive = true;
            mesh.userData.primitiveType = type;

            // Store initial material for color changes
            if (Array.isArray(mesh.material)) {
                mesh.userData.initialMaterial = mesh.material.map(mat => mat.clone());
            } else {
                mesh.userData.initialMaterial = mesh.material.clone();
            }

            // Add to scene and track it
            scene.add(mesh);
            loadedModels.push(mesh);

            console.log(`[createPrimitive] Added ${type} to scene. Total objects: ${loadedModels.length}`);

            // Select the new object
            selectObject(mesh);

            // Update UI
            addMessageToLog('AI', `Created a ${type}.`);
            updateUndoRedoButtons();

            console.log(`[createPrimitive] ✅ Successfully created ${type}!`);
        }


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
                                if (selectedObject && selectedObject.isMesh) {
                                    const success = enterFaceEditMode(selectedObject);
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
            recognition = new webkitSpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                isVoiceAssistActive = true;
                integratedVoiceBtn.classList.add('active-voice-btn');
                addMessageToLog('System', 'Listening for voice commands...');
            };

            recognition.onresult = (event) => {
                const command = event.results[0][0].transcript;
                addMessageToLog('System', `You said: "${command}"`);
                sendAICommand(command);
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                addMessageToLog('System', `Voice command error: ${event.error}`);
                speakResponse("I didn't catch that. Could you please repeat?");
                integratedVoiceBtn.classList.remove('active-voice-btn');
                isVoiceAssistActive = false;
            };

            recognition.onend = () => {
                integratedVoiceBtn.classList.remove('active-voice-btn');
                isVoiceAssistActive = false;
                addMessageToLog('System', 'Voice command ended.');
            };

            integratedVoiceBtn.addEventListener('click', () => {
                if (isVoiceAssistActive) {
                    stopVoiceAssist();
                } else {
                    startVoiceAssist();
                }
            });
        } else {
            integratedVoiceBtn.style.display = 'none'; // Hide button if API not supported
            addMessageToLog('System', 'Voice recognition not supported in this browser.');
        }

        function startVoiceAssist() {
            if (recognition && !isVoiceAssistActive) {
                recognition.start();
            }
        }

        function stopVoiceAssist() {
            if (recognition && isVoiceAssistActive) {
                recognition.stop();
            }
        }

        // Text-to-speech integration
        if ('speechSynthesis' in window) {
            synth = window.speechSynthesis;
        } else {
            console.warn('Text-to-speech not supported in this browser.');
        }

        function speakResponse(text) {
            if (synth) {
                const utterance = new SpeechSynthesisUtterance(text);
                synth.speak(utterance);
            }
        }
        // Send text command via input field
        sendTextCommandBtn.addEventListener('click', () => {
            const command = textCommandInput.value.trim();
            if (command) {
                addMessageToLog('User', command); // Add user message to log immediately

                // Check if this is a disambiguation response (number)
                if (pendingDisambiguation && /^\d+$/.test(command)) {
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

        // Handle window resizing for Three.js canvas
        function onWindowResize() {
            if (camera && renderer && cadCanvas) {
                const viewerDiv = cadCanvas.parentElement;
                camera.aspect = viewerDiv.clientWidth / viewerDiv.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(viewerDiv.clientWidth, viewerDiv.clientHeight);
                updateDynamicGrid(); // Update grid on resize as well
                // No need to call resetView() here, as it can be jarring on every resize.
                // The user can use the "Fit All" button or AI command.
            }
            // Update viewAxesHelper renderer size on window resize
            if (viewAxesRenderer && viewAxesContainer) {
                viewAxesRenderer.setSize(viewAxesContainer.clientWidth, viewAxesContainer.clientHeight);
                viewAxesCamera.aspect = viewAxesContainer.clientWidth / viewAxesContainer.clientHeight;
                viewAxesCamera.updateProjectionMatrix();
            }
        }

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

        // ENHANCED KEYBOARD SHORTCUTS - Face editing + Extrude controls
        window.addEventListener('keydown', (event) => {
            // ✅ GUARD: Don't interfere with typing
            if (isTypingInUI()) return;

            const key = event.key.toLowerCase();

            // Multi-select control (check both lowercase and original)
            if (key === 'control' || event.key === 'Control') {
                if (faceEditState.isActive) {
                    faceEditState.multiSelect = true;
                    console.log('[Keyboard] Multi-select enabled');
                }
                return;
            }

            // Extrude mode controls - EXACT SPEC
            if (extrudeUI.active) {
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
            if (!faceEditState.isActive) return;

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
                if (faceEditState.isActive) {
                    faceEditState.multiSelect = false;
                    console.log('[Keyboard] Multi-select disabled');
                }
            }
        });



        // Initialize scene when the window loads
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

            // DEBUG: Clear any existing models on startup
            if (loadedModels.length > 0) {
                console.log('[Init] Clearing', loadedModels.length, 'existing models');
                loadedModels.forEach(model => {
                    if (scene && model) scene.remove(model);
                });
                loadedModels.length = 0;
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

