// IFC file loader using web-ifc served from /vendor/web-ifc/
// Uses the global THREE object (loaded via CDN script tag in index.html)

// Derive the vendor path relative to the current page, so it works on any host
const VENDOR_BASE = new URL('/vendor/web-ifc/', location.href).href;
const MODULE_URL  = `${VENDOR_BASE}web-ifc-api.js`;

let webIFCModule = null;  // the dynamically imported ES module namespace
let ifcAPI       = null;  // singleton IfcAPI instance
let typeCodeMap  = null;  // numeric type code → 'IFCWALL' string

async function ensureAPI() {
    if (ifcAPI) return;

    webIFCModule = await import(MODULE_URL);

    const api = new webIFCModule.IfcAPI();
    // absolute=true → wasmPath is used as-is without prepending scriptDirectory
    api.SetWasmPath(VENDOR_BASE, true);
    await api.Init();
    ifcAPI = api;

    // Build reverse-lookup: numeric type code → IFC class name string
    typeCodeMap = {};
    for (const [name, val] of Object.entries(webIFCModule)) {
        if (typeof val === 'number' && name.startsWith('IFC')) {
            typeCodeMap[val] = name;
        }
    }
}

function buildMesh(api, modelID, placedGeom) {
    let geom;
    try {
        geom = api.GetGeometry(modelID, placedGeom.geometryExpressID);

        const vPtr  = geom.GetVertexData();
        const vSize = geom.GetVertexDataSize();   // number of float32 elements
        const iPtr  = geom.GetIndexData();
        const iSize = geom.GetIndexDataSize();    // number of uint32 elements

        if (!vSize || !iSize) return null;

        // Copy out of WASM heap before any further API calls (heap may be reallocated)
        const verts   = new Float32Array(api.wasmModule.HEAPF32.buffer).slice(vPtr >> 2, (vPtr >> 2) + vSize);
        const indices = new Uint32Array(api.wasmModule.HEAPU32.buffer).slice(iPtr >> 2, (iPtr >> 2) + iSize);

        // Vertex layout: x, y, z, nx, ny, nz  (6 floats per vertex)
        const numV = vSize / 6;
        const pos  = new Float32Array(numV * 3);
        const nrm  = new Float32Array(numV * 3);
        for (let i = 0; i < numV; i++) {
            pos[i * 3]     = verts[i * 6];
            pos[i * 3 + 1] = verts[i * 6 + 1];
            pos[i * 3 + 2] = verts[i * 6 + 2];
            nrm[i * 3]     = verts[i * 6 + 3];
            nrm[i * 3 + 1] = verts[i * 6 + 4];
            nrm[i * 3 + 2] = verts[i * 6 + 5];
        }

        const bufGeom = new THREE.BufferGeometry();
        bufGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        bufGeom.setAttribute('normal',   new THREE.BufferAttribute(nrm, 3));
        bufGeom.setIndex(new THREE.BufferAttribute(indices, 1));

        const { x: r, y: g, z: b, w: a } = placedGeom.color;
        const mat = new THREE.MeshLambertMaterial({
            color:       new THREE.Color(r, g, b),
            opacity:     a,
            transparent: a < 1,
            side:        THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(bufGeom, mat);
        mesh.userData.initialMaterial = mat.clone();
        mesh.applyMatrix4(new THREE.Matrix4().fromArray(placedGeom.flatTransformation));
        return mesh;

    } catch (e) {
        console.warn('[ifcLoader] buildMesh error:', e);
        return null;
    } finally {
        geom?.delete();
    }
}

/**
 * Parse an IFC file and return a Three.js Group containing all geometry.
 * Each child mesh has userData.expressID, userData.modelID, userData.isIFCElement = true.
 * onProgress(message) is called with status strings during loading.
 */
export async function loadIFCFile(file, onProgress) {
    onProgress?.('Loading IFC engine…');
    await ensureAPI();

    onProgress?.(`Parsing ${file.name}…`);
    // Yield to browser so the status message renders before the synchronous parse
    await new Promise(r => setTimeout(r, 60));

    const buffer  = await file.arrayBuffer();
    const modelID = ifcAPI.OpenModel(new Uint8Array(buffer), {
        COORDINATE_TO_ORIGIN: true,
        USE_FAST_BOOLS:       true,
    });

    const group = new THREE.Group();
    group.name = file.name;
    group.userData.isIFCModel  = true;
    group.userData.ifcModelID  = modelID;

    onProgress?.('Building geometry — this may take a moment…');
    await new Promise(r => setTimeout(r, 60));

    ifcAPI.StreamAllMeshes(modelID, (mesh) => {
        const expressID = mesh.expressID;
        const count     = mesh.geometries.size();
        for (let i = 0; i < count; i++) {
            const m = buildMesh(ifcAPI, modelID, mesh.geometries.get(i));
            if (!m) continue;
            m.name                  = `IFC_${expressID}`;
            m.userData.expressID    = expressID;
            m.userData.modelID      = modelID;
            m.userData.isIFCElement = true;
            group.add(m);
        }
    });

    // IFC default coordinate system is Z-up; Three.js is Y-up
    group.rotation.x = -Math.PI / 2;

    return group;
}

/**
 * Fetch IFC entity properties for a given element.
 * Returns null if no IFC file has been loaded yet (API not initialised).
 */
export function getIFCElementProperties(modelID, expressID) {
    if (!ifcAPI) return null;
    try {
        const line = ifcAPI.GetLine(modelID, expressID);
        return {
            expressID,
            typeName:   typeCodeMap?.[line.type] ?? 'IFC Element',
            globalId:   line.GlobalId?.value    ?? null,
            name:       line.Name?.value         ?? null,
            objectType: line.ObjectType?.value   ?? null,
        };
    } catch (e) {
        console.warn('[ifcLoader] getIFCElementProperties:', e);
        return { expressID, typeName: 'IFC Element', globalId: null, name: null };
    }
}
