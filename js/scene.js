import { state } from './state.js';
import { makeTextSprite } from './utils.js';

const cadCanvas = document.getElementById('cadCanvas');
const viewAxesContainer = document.getElementById('viewAxesContainer');

function isDisplayBoundsMesh(child, preferIFC) {
            if (!child.isMesh || !child.visible || child.userData?.cadDecorHidden || child.userData?.isGridLabel || child.name === 'gridHelper') {
                return false;
            }
            if (!preferIFC) return true;
            return child.userData?.isIFCElement || child.userData?.ifcProperties || child.userData?.IfcGUID || child.userData?.ifcGUID;
        }

function expandBoundsFromModels(models, preferIFC = true) {
            const bounds = new THREE.Box3();
            (models || []).forEach(model => model.traverse(child => {
                if (isDisplayBoundsMesh(child, preferIFC)) bounds.expandByObject(child);
            }));
            return bounds;
        }

function getModelDisplayBounds(models = state.loadedModels) {
            const ifcBounds = expandBoundsFromModels(models, true);
            return ifcBounds.isEmpty() ? expandBoundsFromModels(models, false) : ifcBounds;
        }

function normalizeModelsToGround(models) {
            const roots = (models || []).filter(Boolean);
            if (roots.length === 0) return new THREE.Box3();
            roots.forEach(model => model.updateMatrixWorld(true));
            const bounds = getModelDisplayBounds(roots);
            if (bounds.isEmpty()) return bounds;

            const center = bounds.getCenter(new THREE.Vector3());
            const offset = new THREE.Vector3(-center.x, -bounds.min.y, -center.z);
            roots.forEach(model => model.position.add(offset));
            roots.forEach(model => model.updateMatrixWorld(true));
            return getModelDisplayBounds(roots);
        }

function fitCameraToBounds(bounds, preset = 'iso') {
            if (!state.camera || !state.controls || !bounds || bounds.isEmpty()) return;
            const center = bounds.getCenter(new THREE.Vector3());
            const size = bounds.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z, 0.01);
            const fov = THREE.MathUtils.degToRad(state.camera.fov || 60);
            const distance = Math.max(maxDim * 1.15, (maxDim / (2 * Math.tan(fov / 2))) * 1.35);
            const directions = {
                top: new THREE.Vector3(0, 1, 0.0001),
                front: new THREE.Vector3(0, 0, 1),
                right: new THREE.Vector3(1, 0, 0),
                iso: new THREE.Vector3(0.75, 0.65, 0.75),
            };
            const direction = (directions[preset] || directions.iso).normalize();

            state.camera.near = Math.max(0.0001, maxDim / 1000000);
            state.camera.far = Math.max(1000, distance + maxDim * 20);
            state.camera.position.copy(center).addScaledVector(direction, distance);
            state.controls.target.copy(center);
            state.camera.updateProjectionMatrix();
            state.controls.update();
            state.navigationModelSize = maxDim;
        }

function updateDynamicGrid() {
            if (!state.scene) {
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

            // Keep the grid stable in world space. Its size follows the model, not camera zoom.
            const bounds = getModelDisplayBounds();
            const size = bounds.isEmpty() ? new THREE.Vector3(20, 0, 20) : bounds.getSize(new THREE.Vector3());
            const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
            const rawSize  = Math.max(20, size.x * 1.5, size.z * 1.5);
            const exp      = Math.floor(Math.log10(rawSize));
            const base     = Math.pow(10, exp);
            const gridSize = Math.ceil(rawSize / base) * base;
            const divisions = 40;

            // Create new GridHelper centered beneath the loaded model.
            const newGridHelper = new THREE.GridHelper(gridSize, divisions, 0x4a6080, 0x2d4060);
            newGridHelper.material.opacity = 0.40;
            newGridHelper.material.transparent = true;
            newGridHelper.name = 'gridHelper';
            newGridHelper.position.set(center.x, -0.01, center.z);
            state.scene.add(newGridHelper);
            state.currentGridHelper = newGridHelper;
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

export { updateDynamicGrid, getModelDisplayBounds, normalizeModelsToGround, fitCameraToBounds };
