import { state } from './state.js';
import { addMessageToLog } from './utils.js';
import { saveSceneState } from './history.js';
import { loadIFCFile } from './ifcLoader.js';

const RANDOM_MODEL_URLS = [
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF-Binary/Box.glb',
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb',
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb',
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb',
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb'
];

const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const loadingMsg = document.getElementById('loadingMsg');
const editorPage = document.getElementById('editorPage');

let _speakResponse = () => {};
let _resetView = () => {};
let _goToEditor = () => {};

export function initLoaderCallbacks(cbs) {
    _speakResponse = cbs.speakResponse;
    _resetView = cbs.resetView;
    _goToEditor = cbs.goToEditor;
}

export function initLoaderEventHandlers() {
    dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.textContent = 'Release to drop your .gltf, .glb, or .ifc file';
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
        state.droppedFileBlobs.clear();
        let mainModelFile = null;

        console.log("[Drop Handler] Drop event detected. Items:", e.dataTransfer.items);
        console.log("[Drop Handler] Files:", e.dataTransfer.files);

        async function readDroppedFiles(entry, path) {
            if (entry.isFile) {
                const file = await new Promise(resolve => entry.file(resolve));
                const fullPath = path ? `${path}/${path}/${file.name}` : file.name; // FIX: Corrected path concatenation
                state.droppedFileBlobs.set(fullPath, file);
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
                state.droppedFileBlobs.set(file.name, file);
                console.log(`[Drop Handler] Stored file (flat): ${file.name}, Type: ${file.type}, Size: ${file.size} bytes`);
                if (!mainModelFile && (file.name.toLowerCase().endsWith('.gltf') || file.name.toLowerCase().endsWith('.glb'))) {
                    mainModelFile = file;
                }
            }
        }

        if (mainModelFile) {
            state.uploadedFile = mainModelFile;
            console.log("[Drop Handler] Identified main model file:", state.uploadedFile.name);
            if (validateFile(state.uploadedFile)) {
                // If already in editor, load the model directly
                if (editorPage.classList.contains('page-active')) {
                    loadModel(state.uploadedFile);
                } else {
                    loadingMsg.textContent = `File selected: ${state.uploadedFile.name}. Loading editor...`;
                    loadingMsg.style.color = '#007bff';
                    loadingMsg.style.display = 'block';
                    _goToEditor('uploaded');
                }
            }
            console.log("[Drop Handler] All dropped files (keys in map):", Array.from(state.droppedFileBlobs.keys()));
        } else {
            loadingMsg.textContent = '❌ No .gltf or .glb file found among dropped items!';
            loadingMsg.style.color = 'red';
            setTimeout(() => { // Hide message after a delay
                loadingMsg.style.display = 'none';
                loadingMsg.textContent = '';
            }, 3000);
        }
        console.log("[Drop Handler] state.uploadedFile after change processing:", state.uploadedFile ? state.uploadedFile.name : "null");
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
            state.uploadedFile = file;
            console.log("[File Input] Selected file:", state.uploadedFile.name, `Type: ${state.uploadedFile.type}, Size: ${state.uploadedFile.size} bytes`);

            if (validateFile(state.uploadedFile)) {
                loadingMsg.textContent = `Processing selected file: ${state.uploadedFile.name}...`;
                loadingMsg.style.color = '#007bff';
                loadingMsg.style.display = 'block'; // Show loading message *only* if a file is valid

                state.droppedFileBlobs.clear(); // Clear previous context
                state.droppedFileBlobs.set(file.name, file); // Store the selected file

                if (editorPage.classList.contains('page-active')) {
                    loadModel(state.uploadedFile);
                } else {
                    loadingMsg.textContent = `File selected: ${state.uploadedFile.name}. Loading editor...`;
                    loadingMsg.style.color = '#007bff';
                    loadingMsg.style.display = 'block';
                    _goToEditor('uploaded');
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
            state.uploadedFile = null;
            // No need to show a message if nothing was selected, just clear any previous ones.
            // loadingMsg.textContent = 'No file selected.';
            // loadingMsg.style.color = 'orange';
            // loadingMsg.style.display = 'block';
            // setTimeout(() => {
            //     loadingMsg.style.display = 'none';
            //     loadingMsg.textContent = '';
            // }, 3000);
        }
        console.log("[File Input] state.uploadedFile after change processing:", state.uploadedFile ? state.uploadedFile.name : "null");
    });
}

export function validateFile(file) {
    console.log("[Validation] Validating file:", file ? file.name : "null");
    const name = file?.name.toLowerCase() ?? '';
    if (name.endsWith('.gltf') || name.endsWith('.glb') || name.endsWith('.ifc')) {
        console.log("[Validation] File is a valid GLTF/GLB/IFC.");
        return true;
    } else {
        console.error("[Validation] Unsupported file type! Please upload a .gltf, .glb, or .ifc file.");
        loadingMsg.textContent = '❌ Unsupported file type! Please upload a .gltf, .glb, or .ifc file.';
        loadingMsg.style.color = 'red';
        state.uploadedFile = null;
        return false;
    }
}

export function loadRandomModel() {
    // Added error handling for empty RANDOM_MODEL_URLS
    if (RANDOM_MODEL_URLS.length === 0) {
        console.warn("[loadRandomModel] RANDOM_MODEL_URLS is empty. Cannot load a random model.");
        addMessageToLog('System', 'No random models available to load. Please try uploading a model or creating a new one.');
        _speakResponse('No random models available to load.');
        return;
    }

    const randomIndex = Math.floor(Math.random() * RANDOM_MODEL_URLS.length);
    const modelUrl = RANDOM_MODEL_URLS[randomIndex];
    console.log(`[loadRandomModel] Attempting to load random model from URL: ${modelUrl} (Index: ${randomIndex})`); // Added index to log
    const loader = new THREE.GLTFLoader();
    loader.load(modelUrl, (gltf) => {
        const randomModel = gltf.scene;
        randomModel.name = `Random Model (${modelUrl.split('/').pop()})`;
        state.scene.add(randomModel);
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
        state.loadedModels.push(randomModel);
        _resetView();
        addMessageToLog('System', `Random model "${randomModel.name}" loaded successfully.`);
        _speakResponse(`Random model loaded.`);
        console.log(`[loadRandomModel] Random model "${randomModel.name}" loaded successfully.`);
        saveSceneState(); // Save state after loading a new model
    }, (xhr) => { // Progress callback
        loadingMsg.textContent = `Loading ${modelUrl}: ${Math.round(xhr.loaded / xhr.total * 100)}%`;
    }, (error) => {
        console.error(`[loadRandomModel] Error loading random model from ${modelUrl}:`, error);
        addMessageToLog('System', `Failed to load random model from ${modelUrl}. Error details in console. Please try another option.`); // More specific error message
        _speakResponse(`Failed to load random model. Please check the console for details.`);
    });
}

async function _loadIFCModel(file) {
    addMessageToLog('System', `Loading IFC: ${file.name}…`);
    try {
        const group = await loadIFCFile(file, msg => {
            addMessageToLog('System', msg);
        });

        state.scene.add(group);

        // Snap bottom of model to ground plane (Y=0)
        const bbox = new THREE.Box3().setFromObject(group);
        if (!bbox.isEmpty()) group.position.y -= bbox.min.y;

        state.loadedModels.push(group);
        _resetView();
        loadingMsg.style.display = 'none';
        const count = group.children.length;
        addMessageToLog('System', `✅ IFC model '${file.name}' loaded — ${count} element${count !== 1 ? 's' : ''}. Click any element to see its properties.`);
        _speakResponse('IFC model loaded.');
        saveSceneState();
    } catch (e) {
        console.error('[loader] IFC load error:', e);
        addMessageToLog('System', `❌ Error loading IFC: ${e.message}`);
        loadingMsg.style.display = 'none';
    }
}

export function loadModel(file) {
    if (file.name.toLowerCase().endsWith('.ifc')) {
        _loadIFCModel(file);
        return;
    }
    console.log("[loadModel] Attempting to load file:", file.name);
    const loader = new THREE.GLTFLoader();
    const fileLoader = new THREE.FileLoader();
    fileLoader.manager = new THREE.LoadingManager();
    fileLoader.manager.setURLModifier(url => {
        console.log(`[URLModifier] Requested URL: "${url}"`);
        const fileName = url.split('/').pop();
        let resolvedPath = fileName;
        if (url.startsWith('blob:')) {
            const blobFile = Array.from(state.droppedFileBlobs.values()).find(f => URL.createObjectURL(f) === url);
            if (blobFile) {
                resolvedPath = blobFile.name;
                console.log(`[URLModifier] Resolved blob URL to file: ${resolvedPath}`);
            }
        } else {
            const potentialPaths = Array.from(state.droppedFileBlobs.keys()).filter(key => key.endsWith(fileName));
            if (potentialPaths.length > 0) {
                potentialPaths.sort((a, b) => a.length - b.length)[0]; // Use the shortest path if multiple
                resolvedPath = potentialPaths.sort((a, b) => a.length - b.length)[0];
                console.log(`[URLModifier] Resolved relative path to: ${resolvedPath}`);
            }
        }
        const foundFile = state.droppedFileBlobs.get(resolvedPath);
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
            state.scene.add(newModel); // Add the new model to the state.scene

            // Fix materials and store originals
            newModel.traverse((obj) => {
                if (obj.isMesh && obj.material) {
                    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                    mats.forEach(mat => {
                        mat.side = THREE.DoubleSide; // Fix inverted normals from Revit/CAD exports
                        mat.needsUpdate = true;
                    });
                    if (Array.isArray(obj.material)) {
                        obj.userData.initialMaterial = obj.material.map(mat => mat.clone());
                    } else {
                        obj.userData.initialMaterial = obj.material.clone();
                    }
                }
            });

            // Always place model on top of grid (Y=0), never below it
            const bbox = new THREE.Box3().setFromObject(newModel);
            if (bbox.min.y < 0) {
                newModel.position.y -= bbox.min.y;
            }

            state.loadedModels.push(newModel); // Store the new model in our array

            console.log(`[loadModel] Model '${file.name}' added to state.scene. Total models: ${state.loadedModels.length}`);
            console.log("[loadModel] New model bounding box:", new THREE.Box3().setFromObject(newModel));

            // Call resetView to adjust state.camera and state.controls to fit all loaded models
            _resetView();

            loadingMsg.style.display = 'none';
            addMessageToLog('System', `Model '${file.name}' loaded successfully. You now have ${state.loadedModels.length} models in the state.scene.`);
            _speakResponse(`Model loaded successfully. You now have ${state.loadedModels.length} models in the state.scene.`);
            console.log("[loadModel] Model successfully added to state.scene. Current state.loadedModels:", state.loadedModels);

            saveSceneState(); // Save state after loading a new model
        }, (xhr) => { // Progress callback
            loadingMsg.textContent = `Loading ${file.name}: ${Math.round(xhr.loaded / xhr.total * 100)}%`;
        }, (error) => {
            console.error('An error happened loading the GLTF model:', error);
            addMessageToLog('System', 'Error loading model. Please ensure it\'s a valid .gltf or .glb file and all associated files (like textures) are in the same folder if dropped as a folder, or embedded within the .glb.');
            _speakResponse(`Error loading model. Please check the console for details.`);
            loadingMsg.textContent = '❌ Error loading model!';
            loadingMsg.style.color = 'red';
        });
    };
    reader.readAsArrayBuffer(file);
}
