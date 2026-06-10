import { state } from './state.js';

// Hard-coded entries with doc URLs (keyed by IfcGUID or legacy elementId)
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

// Try to find a match in elementLinks by IfcGUID stored in userData or object name
function findElementData(obj) {
    if (!obj) return null;

    // 1. Check userData for IFC GUID fields Revit GLB exporters use
    const guidFields = ['IFC_GUID', 'ifcGUID', 'IfcGUID', 'ifc_guid', 'GlobalId'];
    for (const field of guidFields) {
        const guid = obj.userData?.[field];
        if (guid && elementLinks[guid]) return { guid, ...elementLinks[guid] };
    }

    // 2. Scan userData for any value that looks like an IfcGUID (20-22 chars, base64-ish)
    if (obj.userData) {
        for (const val of Object.values(obj.userData)) {
            if (typeof val === 'string' && /^[0-9A-Za-z_$]{20,22}$/.test(val) && elementLinks[val]) {
                return { guid: val, ...elementLinks[val] };
            }
        }
    }

    // 3. Check legacy elementId (numeric) in MANUAL_DATABASE
    if (obj.userData?.elementId != null) {
        const entry = MANUAL_DATABASE[String(obj.userData.elementId)];
        if (entry) return entry;
    }

    // 4. Match by familyAndType substring against object name
    if (obj.name) {
        const nameLower = obj.name.toLowerCase();

        // MANUAL_DATABASE keyword match
        for (const entry of Object.values(MANUAL_DATABASE)) {
            const keywords = entry.familyAndType.toLowerCase().split(' ').slice(0, 3).join(' ');
            if (nameLower.includes(keywords)) return entry;
        }

        // elementLinks familyAndType match — prefer exact matches, then partial
        for (const [guid, data] of Object.entries(elementLinks)) {
            if (data.familyAndType && nameLower.includes(data.familyAndType.toLowerCase())) {
                return { guid, ...data };
            }
        }

        // 5. Numeric ID fallback → MANUAL_DATABASE
        const numMatch = obj.name.match(/\b(\d{5,})\b/);
        if (numMatch) {
            const entry = MANUAL_DATABASE[numMatch[1]];
            if (entry) return entry;
        }
    }

    return null;
}

export async function initDocLink() {
    // Load element_links.json (fire-and-forget; matching still works before it loads)
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
        const { urlInput, openBtn } = els();
        const url = urlInput.value.trim();
        currentObject.userData.docUrl = url;
        openBtn.disabled = !url;
        console.log(`[docLink] Saved URL for "${currentObject.name}": ${url}`);
    });

    openBtn.addEventListener('click', () => {
        if (!currentObject) return;
        const url = currentObject.userData.docUrl;
        if (!url) return;
        window.open(url, '_blank', 'noopener,noreferrer');
    });
}

export function onObjectSelected(obj) {
    currentObject = obj;
    const { nameDisplay, metaDisplay, urlInput, saveBtn, openBtn } = els();

    if (!obj) {
        nameDisplay.textContent = 'No object selected';
        metaDisplay.innerHTML = '';
        metaDisplay.style.display = 'none';
        urlInput.value = '';
        urlInput.disabled = true;
        saveBtn.disabled = true;
        openBtn.disabled = true;
        return;
    }

    const data = findElementData(obj);

    if (data) {
        nameDisplay.textContent = data.name || data.familyAndType || obj.name || 'Unknown';

        const metaParts = [];
        if (data.category)      metaParts.push(`<span class="meta-tag">${data.category}</span>`);
        if (data.familyAndType) metaParts.push(`<span class="meta-tag">${data.familyAndType}</span>`);
        if (data.level)         metaParts.push(`<span class="meta-tag">${data.level}</span>`);
        metaDisplay.innerHTML = metaParts.join('');
        metaDisplay.style.display = metaParts.length ? 'block' : 'none';

        if (data.doc_url) {
            obj.userData.docUrl = data.doc_url;
            urlInput.value = data.doc_url;
            openBtn.textContent = `Open ${data.doc_label || 'Doc'} ↗`;
        } else {
            urlInput.value = obj.userData.docUrl || '';
            openBtn.textContent = 'Open ↗';
        }
    } else {
        nameDisplay.textContent = obj.name || 'Unnamed Object';
        metaDisplay.innerHTML = '';
        metaDisplay.style.display = 'none';
        urlInput.value = obj.userData.docUrl || '';
        openBtn.textContent = 'Open ↗';
    }

    urlInput.disabled = false;
    saveBtn.disabled = false;
    openBtn.disabled = !obj.userData.docUrl;
}
