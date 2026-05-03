import { state } from './state.js';
import { addMessageToLog } from './utils.js';
import { getCurrentState, updateUndoRedoButtons } from './history.js';
import { selectObject } from './selection.js';

// FIXED: Function to create primitive shapes - GUARANTEED TO WORK
export function createPrimitive(type) {
    console.log(`[createPrimitive] Creating ${type} shape`);

    // Check if THREE.js is loaded
    if (typeof THREE === 'undefined') {
        console.error("[createPrimitive] THREE.js not loaded!");
        alert("THREE.js library not loaded. Please refresh the page.");
        return;
    }

    // Check if state.scene is initialized
    if (!state.scene) {
        console.error("[createPrimitive] state.scene not initialized!");
        alert("state.scene not initialized. Please refresh the page.");
        return;
    }

    // Save state for undo (only if we have existing objects)
    if (state.loadedModels.length > 0) {
        const currentState = getCurrentState();
        state.undoStack.push(currentState);
        state.redoStack = []; // Clear redo stack
        console.log("[createPrimitive] Saved state with", state.loadedModels.length, "objects");
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

    // Set position (in front of state.camera)
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

    // Add to state.scene and track it
    state.scene.add(mesh);
    state.loadedModels.push(mesh);

    console.log(`[createPrimitive] Added ${type} to state.scene. Total objects: ${state.loadedModels.length}`);

    // Select the new object
    selectObject(mesh);

    // Update UI
    addMessageToLog('AI', `Created a ${type}.`);
    updateUndoRedoButtons();

    console.log(`[createPrimitive] ✅ Successfully created ${type}!`);
}
