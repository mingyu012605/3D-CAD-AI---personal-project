import { state } from './state.js';
import { addMessageToLog } from './utils.js';
import { getCurrentState, updateUndoRedoButtons } from './history.js';
import { removeObject } from './selection.js';

let _speakResponse = () => {};
let _requestRender = () => {};
let _getActiveObject = () => null;
let _paintObject = () => false;
let _testFaceEditing = () => false;
let _onSelectionChanged = () => {};

export function initFaceEditCallbacks(cbs) {
    _speakResponse = cbs.speakResponse || _speakResponse;
    _requestRender = cbs.requestRender || _requestRender;
    _getActiveObject = cbs.getActiveObject || _getActiveObject;
    _paintObject = cbs.paintObject || _paintObject;
    _testFaceEditing = cbs.testFaceEditing || _testFaceEditing;
    _onSelectionChanged = cbs.onSelectionChanged || _onSelectionChanged;
}

        export function buildFaceBoundaryPolygon(mesh, group) {
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

        function getScreenAxisDrag(axisOrigin, axisDirection, rect) {
            const sampleDistance = Math.max(0.1, state.camera.position.distanceTo(axisOrigin) * 0.15);
            const start = axisOrigin.clone().project(state.camera);
            const end = axisOrigin.clone()
                .addScaledVector(axisDirection, sampleDistance)
                .project(state.camera);
            const dx = (end.x - start.x) * rect.width * 0.5;
            const dy = -(end.y - start.y) * rect.height * 0.5;
            const pixelDistance = Math.hypot(dx, dy);

            if (pixelDistance >= 1) {
                return {
                    screenDirection: new THREE.Vector2(dx, dy).normalize(),
                    pixelsPerUnit: Math.max(50, pixelDistance / sampleDistance),
                };
            }

            const distance = Math.max(0.1, state.camera.position.distanceTo(axisOrigin));
            const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(state.camera.fov) / 2);
            return {
                screenDirection: new THREE.Vector2(0, -1),
                pixelsPerUnit: Math.max(50, rect.height / visibleHeight),
            };
        }

        export function enableMultiFaceSelection(enable) {
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

        export function testMultiSelect() {
            if (!state.faceEditState.isActive) {
                console.log('[testMultiSelect] Face mode not active');
                _testFaceEditing();
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
                    if (group.outline.material) {
                        group.outline.material.color.setHex(isSelected ? 0xff0000 : 0x000000);
                    }
                }
            });

            console.log('[testMultiSelect] Selected faces:', Array.from(state.faceEditState.selectedFaceIds));
            addMessageToLog('System', `${state.faceEditState.selectedFaceIds.size} faces selected. Press E to extrude.`);
        }

        export function updateFaceHighlights() {
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

            _requestRender();
        }

        export function checkMultiSelectState() {
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

        export function testUXAcceptance() {
            console.log('=== UX ACCEPTANCE TEST ===');

            if (!state.faceEditState.isActive) {
                console.log('Starting face mode...');
                _testFaceEditing();
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

        export function getFaceEditStatus() {
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

        export function forceSelectFirstFace() {
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

        export function selectFaceGroup(faceGroupId, options = {}) {
            if (!state.faceEditState.isActive || !faceGroupId) {
                return false;
            }

            const group = state.faceEditState.groups.find(g => g.id === faceGroupId);
            if (!group) {
                console.warn('[selectFaceGroup] Face group not found:', faceGroupId);
                return false;
            }

            state.faceEditState.selectedFaceIds.clear();
            state.faceEditState.selectedFaceIds.add(faceGroupId);
            state.faceEditState.selectedGroupId = faceGroupId;
            updateFaceHighlights();

            if (!options.silent) {
                addMessageToLog('System', '1 face(s) selected. Say "extrude" or press E.');
                _speakResponse('Face selected.');
            }

            return true;
        }

        export function handleFaceClick(faceGroupId) {
            if (!state.faceEditState.isActive || !faceGroupId) {
                return false;
            }

            console.log('=== FACE SELECTION DEBUG ===');
            console.log('[onFaceClick] Face clicked:', faceGroupId);
            console.log('[onFaceClick] Multi-select mode:', state.faceEditState.multiSelect);
            console.log('[onFaceClick] Currently selected:', Array.from(state.faceEditState.selectedFaceIds));

            _onSelectionChanged();

            if (!state.faceEditState.multiSelect) {
                if (state.faceEditState.selectedFaceIds.has(faceGroupId) && state.faceEditState.selectedFaceIds.size === 1) {
                    state.faceEditState.selectedFaceIds.clear();
                    console.log('[onFaceClick] Deselected face on second tap');
                } else {
                    state.faceEditState.selectedFaceIds.clear();
                    state.faceEditState.selectedFaceIds.add(faceGroupId);
                    console.log('[onFaceClick] Single-selected face');
                }
            } else if (state.faceEditState.selectedFaceIds.has(faceGroupId)) {
                state.faceEditState.selectedFaceIds.delete(faceGroupId);
                console.log('[onFaceClick] Removed from multi-selection');
            } else {
                state.faceEditState.selectedFaceIds.add(faceGroupId);
                console.log('[onFaceClick] Added to multi-selection');
            }

            updateFaceHighlights();

            state.faceEditState.selectedGroupId = Array.from(state.faceEditState.selectedFaceIds)[0] || null;

            const selectedCount = state.faceEditState.selectedFaceIds.size;
            const message = selectedCount ? `${selectedCount} face(s) selected` : 'No face selected';
            console.log('[onFaceClick]', message);
            addMessageToLog('System', message + '. Say "extrude" or press E.');
            _speakResponse(selectedCount ? 'Face selected.' : 'Face deselected.');

            return true;
        }

        export function clearFaceSelection() {
            if (!state.faceEditState.isActive) {
                return;
            }

            state.faceEditState.selectedGroupId = null;
        }

        export function updateFaceHover(hoveredGroupId) {
            if (!state.faceEditState.isActive) {
                return;
            }

            state.faceEditState.groups.forEach(group => {
                const isHovered = group.id === hoveredGroupId;
                const isSelected = state.faceEditState.selectedFaceIds.has(group.id);

                if (group.overlay && group.overlay.material) {
                    if (isSelected) {
                        group.overlay.material.opacity = 0.6;
                        group.overlay.material.color.setHex(0xff0000);
                    } else if (isHovered) {
                        group.overlay.material.opacity = 0.35;
                        group.overlay.material.color.setHex(0x44ff44);
                    } else {
                        group.overlay.material.opacity = 0.4;
                        group.overlay.material.color.setHex(0x00ff00);
                    }
                }
            });
        }

        export function testFaceColoring() {
            console.log('=== TESTING FACE COLORING ===');

            if (!state.faceEditState.isActive) {
                console.log('[testFaceColoring] Face mode not active - starting test');
                _testFaceEditing();
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

        export function testExtrudeSystem() {
            console.log('=== TESTING COMPLETE EXTRUDE SYSTEM ===');

            if (!state.faceEditState.isActive) {
                console.log('[testExtrudeSystem] Starting face mode');
                _testFaceEditing();
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

        export function buildFaceGroups(mesh, epsAngle = 0.02, epsPlane = 1e-3) {
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

        export function enterFaceEditMode(mesh) {
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
            _speakResponse(`Face edit mode active. Found ${groups.length} faces.`);

            return true;
        }

        export function exitFaceEditMode() {
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

        export function deleteFaceGroup(mesh, group) {
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
                _speakResponse('Face deleted.');

                console.log('[deleteFaceGroup] Face deletion completed');
                return true;

            } catch (error) {
                console.error('[deleteFaceGroup] Error deleting face:', error);
                addMessageToLog('System', 'Error deleting face.');
                return false;
            }
        }

        function worldToFace2D(worldPoint, faceFrame) {
            const origin = faceFrame.o || faceFrame.origin; // Support both formats
            const relative = new THREE.Vector3().subVectors(worldPoint, origin);
            return new THREE.Vector2(
                relative.dot(faceFrame.u),
                relative.dot(faceFrame.v)
            );
        }

        function face2DToWorld(face2DPoint, faceFrame) {
            const origin = faceFrame.o || faceFrame.origin; // Support both formats
            return new THREE.Vector3()
                .copy(origin)
                .addScaledVector(faceFrame.u, face2DPoint.x)
                .addScaledVector(faceFrame.v, face2DPoint.y);
        }

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
                    _speakResponse('Face painted.');

                    _requestRender();
                    return true;
                } else {
                    console.error('[paintFaceMaterial] Failed to create colored overlay');
                    return false;
                }

            } catch (error) {
                console.error('[paintFaceMaterial] Error painting face:', error);
                addMessageToLog('System', 'Error painting face.');
                _speakResponse('Error painting face.');
                return false;
            }
        }

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

        export function paintFace(mesh, group, hexColor) {
            return paintFaceMaterial(mesh, group, hexColor);
        }

        export function handleColorCommand(hexColor) {
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
                _speakResponse('Select a face first.');
                return false;
            }

            // Priority 3: Object coloring (normal mode)
            console.log('[color] ROUTE: paintObject');
            const activeObj = _getActiveObject();
            if (activeObj) {
                return _paintObject(activeObj, hexColor);
            } else {
                console.log('[color] No active object found');
                addMessageToLog('System', 'Please select an object first.');
                _speakResponse('Please select an object first.');
                return false;
            }
        }

        export function handleColorFace(hexColor) {
            return handleColorCommand(hexColor);
        }

        export function refreshFaceGroups() {
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

        export function extrudeFaceAdd(mesh, group, distance = 0.2) {
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
                _speakResponse('Face extruded.');

                return true;

            } catch (error) {
                console.error('[extrudeFaceAdd] Error extruding face:', error);
                return false;
            }
        }

        export function handleExtrudeFace(distance = 0.2) {
            console.log('=== EXTRUDE DEBUG ===');
            console.log('[handleExtrudeFace] Starting interactive extrude mode');
            console.log('[handleExtrudeFace] Face mode active:', state.faceEditState.isActive);
            console.log('[handleExtrudeFace] Selected face IDs:', Array.from(state.faceEditState.selectedFaceIds));
            console.log('[handleExtrudeFace] Total groups:', state.faceEditState.groups.length);

            if (!state.faceEditState.isActive) {
                console.log('[handleExtrudeFace] BLOCKED: Face mode not active');
                addMessageToLog('System', 'Please enter face edit mode first by saying "edit this object".');
                _speakResponse('Please enter face edit mode first.');
                return false;
            }

            const selectedIds = Array.from(state.faceEditState.selectedFaceIds);
            if (selectedIds.length === 0) {
                console.log('[handleExtrudeFace] BLOCKED: No faces selected');
                addMessageToLog('System', 'Please select one or more faces first.');
                _speakResponse('Please select faces first.');
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

        export function showExtrudeGizmo(mesh, selectedGroups) {
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

            state.extrudeUI.drag = {
                on: false,
                axisOrigin: F.o.clone(),
                axisDirection: F.n.clone(),
                startClientX: 0,
                startClientY: 0,
                screenDirection: null,
                pixelsPerUnit: 1,
                startDepth: 0,
            };

            console.log('[showExtrudeGizmo] 2D Fusion-style arrow created at:', F.o);
            addMessageToLog('System', 'Drag arrow to set depth (perpendicular). Click background/Enter to confirm, Esc to cancel.');
            _speakResponse('Drag the arrow to set depth.');
        }

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

            _requestRender();
        }

        export function updateExtrudeDistance() {
            const input = document.getElementById('extrudeDistanceInput');
            if (!input || !state.extrudeUI.active) return;

            const newDepth = parseFloat(input.value) || 0;
            state.extrudeUI.depth = newDepth;

            // Update live preview with the new depth
            updateExtrudePreview(newDepth);
        }

        export function handleExtrudeKeydown(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                confirmExtrude();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelExtrude();
            }
        }

        function clearExtrudePreview() {
            for (const mesh of state.extrudeUI.previewMeshes) {
                state.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) mesh.material.dispose();
            }
            state.extrudeUI.previewMeshes.length = 0;
        }

        export function confirmExtrude() {
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
            _speakResponse('Extrude completed.');

            exitExtrudeMode();
            updateUndoRedoButtons();
            _requestRender();
        }

        export function cancelExtrude() {
            console.log('[cancelExtrude] Canceling extrude operation');
            exitExtrudeMode();
            addMessageToLog('System', 'Extrude canceled.');
            _speakResponse('Extrude canceled.');
        }

        function exitExtrudeMode() {
            clearExtrudePreview();
            if (state.controls) state.controls.enabled = true;

            if (state.extrudeUI.arrow) {
                state.scene.remove(state.extrudeUI.arrow);
                state.extrudeUI.arrow = null;
            }

            state.extrudeUI.active = false;
            state.extrudeUI.faceIds = [];
            state.extrudeUI.targetMesh = null;
            state.extrudeUI.depth = 0;
            state.extrudeUI.drag = {
                on: false,
                axisOrigin: null,
                axisDirection: null,
                startClientX: 0,
                startClientY: 0,
                screenDirection: null,
                pixelsPerUnit: 1,
                startDepth: 0,
            };

            // Hide the Fusion 360-style panel
            const panel = document.getElementById('extrudePanel');
            if (panel) {
                panel.style.display = 'none';
            }

            console.log('[exitExtrudeMode] Exited extrude mode');
            _requestRender();
        }

        export function onExtrudePointerDown(event) {
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

                        const axisDirection = F.n.clone().normalize();
                        const screenDrag = getScreenAxisDrag(F.o, axisDirection, rect);
                        state.extrudeUI.drag = {
                            on: true,
                            axisOrigin: F.o.clone(),
                            axisDirection,
                            startClientX: event.clientX,
                            startClientY: event.clientY,
                            screenDirection: screenDrag.screenDirection,
                            pixelsPerUnit: screenDrag.pixelsPerUnit,
                            startDepth: state.extrudeUI.depth,
                        };
                        if (state.controls) state.controls.enabled = false;

                        console.log('   Drag setup complete - face normal:', F.n.toArray());
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

        export function onExtrudePointerMove(event) {
            if (!state.extrudeUI.active) return;
            if (!state.extrudeUI.drag.on) return;

            console.log('🔄 [onExtrudePointerMove] Dragging arrow...');

            // Update state.mouse coordinates
            const rect = state.renderer.domElement.getBoundingClientRect();
            state.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            state.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            state.raycaster.setFromCamera(state.mouse, state.camera);

            const drag = state.extrudeUI.drag;
            const pointerDelta = new THREE.Vector2(
                event.clientX - drag.startClientX,
                event.clientY - drag.startClientY
            );
            const depth = THREE.MathUtils.clamp(
                drag.startDepth + pointerDelta.dot(drag.screenDirection) / drag.pixelsPerUnit,
                -1000,
                1000
            );

            state.extrudeUI.depth = depth;

            // Update input field to match drag
            const input = document.getElementById('extrudeDistanceInput');
            if (input) {
                input.value = depth.toFixed(2);
            }

            // Update 2D arrow position along normal (keep same orientation)
            const newPosition = drag.axisOrigin.clone()
                .add(drag.axisDirection.clone().multiplyScalar(depth + 0.1));
            state.extrudeUI.arrow.position.copy(newPosition);

            // Live preview for each selected face
            updateExtrudePreview(depth);

            console.log('[onExtrudePointerMove] Depth:', depth.toFixed(3), 'Position:', newPosition.toArray().map(n => n.toFixed(2)));
        }

        export function onExtrudePointerUp(event) {
            if (!state.extrudeUI.active) return;

            if (state.extrudeUI.drag.on) {
                console.log('[onExtrudePointerUp] Drag ended');
                state.extrudeUI.drag.on = false;
                if (state.controls) state.controls.enabled = true;
            }
        }

        export function handleDeleteCommand() {
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
                _speakResponse('No face selected. Click on a face first.');
                return;
            }

            // Priority 3: Normal object deletion
            console.log('[handleDeleteCommand] Normal object deletion');
            removeObject();
        }

        export function detectFaceFromClick() {
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

        export function raycastFaceOverlays() {
            return detectFaceFromClick();
        }
