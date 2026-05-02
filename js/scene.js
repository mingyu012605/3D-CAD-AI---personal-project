import { state } from './state.js';
import { makeTextSprite } from './utils.js';

const cadCanvas = document.getElementById('cadCanvas');
const viewAxesContainer = document.getElementById('viewAxesContainer');

function updateDynamicGrid() {
            // Defensive check: only proceed if state.controls is defined
            if (!state.controls) {
                console.warn("[updateDynamicGrid] state.controls not initialized, skipping dynamic grid update.");
                return;
            }

            // Clear existing grid and labels
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

            // Calculate distance to the center of the orbit (state.controls.target is usually 0,0,0)
            const distance = state.camera.position.distanceTo(state.controls.target);

            let gridSize, divisions, labelInterval, labelFontSize, labelScaleFactor;
            let gridLineColor = 0xbbbbbb; // Light grey for grid lines
            let centerLineColor = 0x888888; // Slightly darker for center lines
            // Very light grey for "less bright" effect on pure white background
            let labelTextColor = { r: 180, g: 180, b: 180, a: 1.0 };

            // Define grid levels based on state.camera distance
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
            state.scene.add(newGridHelper);
            state.currentGridHelper = newGridHelper;

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
                    state.scene.add(xLabel);
                    state.currentGridLabels.push(xLabel);

                    // Z-axis labels
                    const zLabel = makeTextSprite(i.toString(), { textColor: labelTextColor, fontsize: labelFontSize });
                    // Position along X-edge, adjusted by label size, and slightly offset
                    zLabel.position.set(-gridSize / 2 - (labelFontSize * labelScaleFactor * 0.75), labelOffset, i);
                    zLabel.scale.set(labelFontSize * labelScaleFactor, labelFontSize * labelScaleFactor, 1);
                    state.scene.add(zLabel);
                    state.currentGridLabels.push(zLabel);
                }
            }
        }

function animate() {
            state.renderer.setAnimationLoop(() => {
                state.controls.update();
                state.renderer.render(state.scene, state.camera);
                // Render the static view axes helper state.scene
                if (state.viewAxesRenderer && state.viewAxesScene && state.viewAxesCamera) {
                    state.viewAxesRenderer.render(state.viewAxesScene, state.viewAxesCamera);
                }
            });
        }

export function startAnimateLoop() {
    animate();
}

function initViewAxesHelper() {
            if (state.viewAxesSceneRendered) return; // Prevent re-initialization

            state.viewAxesScene = new THREE.Scene();
            state.viewAxesCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10); // Small FOV, aspect 1:1 for container
            state.viewAxesCamera.position.set(1.5, 1.5, 1.5); // Fixed position for isometric view of axes
            state.viewAxesCamera.lookAt(0, 0, 0);

            state.viewAxesRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // Alpha true for transparent background
            state.viewAxesRenderer.setPixelRatio(window.devicePixelRatio);
            state.viewAxesRenderer.setSize(viewAxesContainer.clientWidth, viewAxesContainer.clientHeight);
            state.viewAxesRenderer.domElement.style.width = '100%';
            state.viewAxesRenderer.domElement.style.height = '100%';
            viewAxesContainer.appendChild(state.viewAxesRenderer.domElement);

            // Create a custom AxesHelper with clickable parts
            state.viewAxesHelper = new THREE.Group();
            const axisLength = 1.0;
            const axisRadius = 0.08; // Made axes thicker for easier clicking

            // X-axis (Red)
            const xAxisMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const xAxisCylinder = new THREE.Mesh(new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8), xAxisMaterial);
            xAxisCylinder.rotation.z = -Math.PI / 2;
            xAxisCylinder.position.x = axisLength / 2;
            xAxisCylinder.userData.axis = 'x';
            xAxisCylinder.userData.direction = 'positive';
            state.viewAxesHelper.add(xAxisCylinder);

            const negXAxisCylinder = new THREE.Mesh(new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8), xAxisMaterial);
            negXAxisCylinder.rotation.z = Math.PI / 2;
            negXAxisCylinder.position.x = -axisLength / 2;
            negXAxisCylinder.userData.axis = 'x';
            negXAxisCylinder.userData.direction = 'negative';
            state.viewAxesHelper.add(negXAxisCylinder);

            // Y-axis (Green)
            const yAxisMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const yAxisCylinder = new THREE.Mesh(new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8), yAxisMaterial);
            yAxisCylinder.position.y = axisLength / 2;
            yAxisCylinder.userData.axis = 'y';
            yAxisCylinder.userData.direction = 'positive';
            state.viewAxesHelper.add(yAxisCylinder);

            const negYAxisCylinder = new THREE.Mesh(new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8), yAxisMaterial);
            negYAxisCylinder.rotation.z = Math.PI; // Rotate to point downwards
            negYAxisCylinder.position.y = -axisLength / 2;
            negYAxisCylinder.userData.axis = 'y';
            negYAxisCylinder.userData.direction = 'negative';
            state.viewAxesHelper.add(negYAxisCylinder);

            // Z-axis (Blue)
            const zAxisMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
            const zAxisCylinder = new THREE.Mesh(new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8), zAxisMaterial);
            zAxisCylinder.rotation.x = Math.PI / 2;
            zAxisCylinder.position.z = axisLength / 2;
            zAxisCylinder.userData.axis = 'z';
            zAxisCylinder.userData.direction = 'positive';
            state.viewAxesHelper.add(zAxisCylinder);

            const negZAxisCylinder = new THREE.Mesh(new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 8), zAxisMaterial);
            negZAxisCylinder.rotation.x = -Math.PI / 2;
            negZAxisCylinder.position.z = -axisLength / 2;
            negZAxisCylinder.userData.axis = 'z';
            negZAxisCylinder.userData.direction = 'negative';
            state.viewAxesHelper.add(negZAxisCylinder);

            state.viewAxesScene.add(state.viewAxesHelper);

            // Add labels (X, Y, Z)
            const labelScale = 0.2; // Adjust label size
            const labelOffset = 0.7; // Offset from axis end

            const xLabel = makeTextSprite('X', { textColor: { r: 255, g: 0, b: 0, a: 1.0 }, fontsize: 60 });
            xLabel.position.set(axisLength + labelOffset, 0, 0);
            xLabel.scale.set(labelScale, labelScale, 1);
            state.viewAxesScene.add(xLabel);

            const yLabel = makeTextSprite('Y', { textColor: { r: 0, g: 255, b: 0, a: 1.0 }, fontsize: 60 });
            yLabel.position.set(0, axisLength + labelOffset, 0);
            yLabel.scale.set(labelScale, labelScale, 1);
            state.viewAxesScene.add(yLabel);

            const zLabel = makeTextSprite('Z', { textColor: { r: 0, g: 0, b: 255, a: 1.0 }, fontsize: 60 });
            zLabel.position.set(0, 0, axisLength + labelOffset);
            zLabel.scale.set(labelScale, labelScale, 1);
            state.viewAxesScene.add(zLabel);


            state.viewAxesRaycaster = new THREE.Raycaster();
            state.viewAxesMouse = new THREE.Vector2();

            state.viewAxesSceneRendered = true;
        }

export { initViewAxesHelper };

// Handle window resizing for Three.js canvas
function onWindowResize() {
            if (state.camera && state.renderer && cadCanvas) {
                const viewerDiv = cadCanvas.parentElement;
                state.camera.aspect = viewerDiv.clientWidth / viewerDiv.clientHeight;
                state.camera.updateProjectionMatrix();
                state.renderer.setSize(viewerDiv.clientWidth, viewerDiv.clientHeight);
                updateDynamicGrid(); // Update grid on resize as well
                // No need to call resetView() here, as it can be jarring on every resize.
                // The user can use the "Fit All" button or AI command.
            }
            // Update state.viewAxesHelper state.renderer size on window resize
            if (state.viewAxesRenderer && viewAxesContainer) {
                state.viewAxesRenderer.setSize(viewAxesContainer.clientWidth, viewAxesContainer.clientHeight);
                state.viewAxesCamera.aspect = viewAxesContainer.clientWidth / viewAxesContainer.clientHeight;
                state.viewAxesCamera.updateProjectionMatrix();
            }
        }

export { onWindowResize };

export { updateDynamicGrid };
