import { state } from './state.js';
import { getIFCElementProperties } from './ifcLoader.js';

// Hard-coded entries that have associated document URLs (keyed by IfcGUID or numeric elementId)
const MANUAL_DATABASE = {
    "513637": {
        name: "177 kW Cooling Tower",
        category: "Mechanical Equipment",
        familyAndType: "177 kW Cooling Tower",
        level: "Roof Level",
        doc_url: "https://docs.google.com/document/d/1T5mt5TU4QPyyHTcVoLNbsFQGbDHfADxCPPBGM79moAc/edit?usp=drive_link",
        doc_label: "Research Note"
    }
};

let elementLinks = {};   // populated from element_links.json
let currentObject = null;

function els() {
    return {
        nameDisplay: document.getElementById('docObjectName'),
        metaDisplay: document.getElementById('docObjectMeta'),
        urlInput:    document.getElementById('docUrlInput'),
        saveBtn:     document.getElementById('saveDocUrlBtn'),
        openBtn:     document.getElementById('openDocUrlBtn'),
    };
}

// Find a match for a regular (GLB/GLTF) object in MANUAL_DATABASE or elementLinks
function findGLBElementData(obj) {
    if (!obj) return null;

    // 1. Check userData for IFC GUID fields Revit GLB exporters may embed
    const guidFields = ['IFC_GUID', 'ifcGUID', 'IfcGUID', 'ifc_guid', 'GlobalId'];
    for (const field of guidFields) {
        const guid = obj.userData?.[field];
        if (guid && elementLinks[guid]) return { guid, ...elementLinks[guid] };
    }

    // 2. Scan all userData values that look like an IfcGUID (20–22 base64 chars)
    if (obj.userData) {
        for (const val of Object.values(obj.userData)) {
            if (typeof val === 'string' && /^[0-9A-Za-z_$]{20,22}$/.test(val) && elementLinks[val]) {
                return { guid: val, ...elementLinks[val] };
            }
        }
    }

    // 3. Legacy numeric elementId → MANUAL_DATABASE
    if (obj.userData?.elementId != null) {
        const entry = MANUAL_DATABASE[String(obj.userData.elementId)];
        if (entry) return entry;
    }

    // 4. Name substring match against MANUAL_DATABASE
    if (obj.name) {
        const nameLower = obj.name.toLowerCase();
        for (const entry of Object.values(MANUAL_DATABASE)) {
            const keywords = entry.familyAndType.toLowerCase().split(' ').slice(0, 3).join(' ');
            if (nameLower.includes(keywords)) return entry;
        }

        // 5. Name substring match against elementLinks familyAndType
        for (const [guid, data] of Object.entries(elementLinks)) {
            if (data.familyAndType && nameLower.includes(data.familyAndType.toLowerCase())) {
                return { guid, ...data };
            }
        }

        // 6. Numeric ID fallback → MANUAL_DATABASE
        const numMatch = obj.name.match(/\b(\d{5,})\b/);
        if (numMatch && MANUAL_DATABASE[numMatch[1]]) return MANUAL_DATABASE[numMatch[1]];
    }

    return null;
}

function renderMeta(metaDisplay, tags) {
    metaDisplay.innerHTML = tags
        .filter(Boolean)
        .map(t => `<span class="meta-tag">${t}</span>`)
        .join('');
    metaDisplay.style.display = tags.filter(Boolean).length ? 'block' : 'none';
}

export async function initDocLink() {
    // Load element_links.json (non-blocking; matching works even before it loads)
    try {
        const res = await fetch('element_links.json');
        if (res.ok) {
            elementLinks = await res.json();
            console.log(`[docLink] Loaded ${Object.keys(elementLinks).length} elements from element_links.json`);
        } else {
            console.warn('[docLink] element_links.json not found — only manual database active');
        }
    } catch (e) {
        console.warn('[docLink] Could not load element_links.json:', e.message);
    }

    const { saveBtn, openBtn } = els();

    saveBtn.addEventListener('click', () => {
        if (!currentObject) return;
        const { urlInput } = els();
        const url = urlInput.value.trim();
        currentObject.userData.docUrl = url;
        els().openBtn.disabled = !url;
        console.log(`[docLink] Saved URL for "${currentObject.name}": ${url}`);
    });

    openBtn.addEventListener('click', () => {
        if (!currentObject) return;
        const url = currentObject.userData.docUrl;
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
}

export async function onObjectSelected(obj) {
    currentObject = obj;
    const { nameDisplay, metaDisplay, urlInput, saveBtn, openBtn } = els();

    if (!obj) {
        nameDisplay.textContent = 'No object selected';
        metaDisplay.innerHTML   = '';
        metaDisplay.style.display = 'none';
        urlInput.value   = '';
        urlInput.disabled  = true;
        saveBtn.disabled   = true;
        openBtn.disabled   = true;
        openBtn.textContent = 'Open ↗';
        return;
    }

    // --- IFC element path ---
    if (obj.userData?.isIFCElement) {
        const ifcProps = getIFCElementProperties(obj.userData.modelID, obj.userData.expressID);
        const linked   = ifcProps?.globalId ? elementLinks[ifcProps.globalId] : null;

        if (linked) {
            // Full match in element_links.json via IfcGUID
            nameDisplay.textContent = linked.familyAndType || ifcProps?.name || 'IFC Element';
            renderMeta(metaDisplay, [linked.category, linked.familyAndType, linked.level]);
            if (linked.doc_url) {
                obj.userData.docUrl  = linked.doc_url;
                urlInput.value       = linked.doc_url;
                openBtn.textContent  = `Open ${linked.doc_label || 'Doc'} ↗`;
            } else {
                urlInput.value      = obj.userData.docUrl || '';
                openBtn.textContent = 'Open ↗';
            }
        } else if (ifcProps) {
            // Show whatever the IFC file itself tells us
            nameDisplay.textContent = ifcProps.name || `Element ${ifcProps.expressID}`;
            renderMeta(metaDisplay, [
                ifcProps.typeName,
                ifcProps.objectType,
                ifcProps.globalId ? `GUID: ${ifcProps.globalId}` : null,
            ]);
            urlInput.value      = obj.userData.docUrl || '';
            openBtn.textContent = 'Open ↗';
        } else {
            nameDisplay.textContent = obj.name || 'IFC Element';
            metaDisplay.innerHTML   = '';
            metaDisplay.style.display = 'none';
            urlInput.value      = obj.userData.docUrl || '';
            openBtn.textContent = 'Open ↗';
        }

        urlInput.disabled  = false;
        saveBtn.disabled   = false;
        openBtn.disabled   = !obj.userData.docUrl;
        return;
    }

    // --- GLB / GLTF / primitive path ---
    const data = findGLBElementData(obj);

    if (data) {
        nameDisplay.textContent = data.name || data.familyAndType || obj.name || 'Unknown';
        renderMeta(metaDisplay, [data.category, data.familyAndType, data.level]);
        if (data.doc_url) {
            obj.userData.docUrl  = data.doc_url;
            urlInput.value       = data.doc_url;
            openBtn.textContent  = `Open ${data.doc_label || 'Doc'} ↗`;
        } else {
            urlInput.value      = obj.userData.docUrl || '';
            openBtn.textContent = 'Open ↗';
        }
    } else {
        nameDisplay.textContent   = obj.name || 'Unnamed Object';
        metaDisplay.innerHTML     = '';
        metaDisplay.style.display = 'none';
        urlInput.value      = obj.userData.docUrl || '';
        openBtn.textContent = 'Open ↗';
    }

    urlInput.disabled  = false;
    saveBtn.disabled   = false;
    openBtn.disabled   = !obj.userData.docUrl;
}
