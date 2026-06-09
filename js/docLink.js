import { state } from './state.js';

const ELEMENT_DATABASE = {
    "513637": {
        name: "177 kW Cooling Tower",
        category: "Mechanical Equipment",
        level: "Roof Level",
        doc_url: "https://docs.google.com/document/d/1T5mt5TU4QPyyHTcVoLNbsFQGbDHfADxCPPBGM79moAc/edit?usp=drive_link",
        doc_label: "Research Note"
    }
};

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

function getElementId(obj) {
    if (!obj) return null;
    // 1. Check userData.elementId
    if (obj.userData && obj.userData.elementId != null) {
        return String(obj.userData.elementId);
    }
    // 2. Match by name keyword against database entries
    if (obj.name) {
        for (const [id, entry] of Object.entries(ELEMENT_DATABASE)) {
            if (obj.name.toLowerCase().includes(entry.name.toLowerCase().split(' ').slice(0, 3).join(' ').toLowerCase())) {
                return id;
            }
        }
    }
    // 3. Fall back to extracting a numeric ID from the object name
    const match = obj.name && obj.name.match(/\b(\d{5,})\b/);
    return match ? match[1] : null;
}

export function initDocLink() {
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
        metaDisplay.textContent = '';
        metaDisplay.style.display = 'none';
        urlInput.value = '';
        urlInput.disabled = true;
        saveBtn.disabled = true;
        openBtn.disabled = true;
        return;
    }

    // Check if this object matches anything in the database
    const elementId = getElementId(obj);
    const dbEntry = elementId ? ELEMENT_DATABASE[elementId] : null;

    if (dbEntry) {
        // Auto-populate from database
        nameDisplay.textContent = dbEntry.name;
        metaDisplay.textContent = `${dbEntry.category}  ·  ${dbEntry.level}`;
        metaDisplay.style.display = 'block';
        obj.userData.docUrl = dbEntry.doc_url;
        urlInput.value = dbEntry.doc_url;
        openBtn.textContent = `Open ${dbEntry.doc_label} ↗`;
    } else {
        nameDisplay.textContent = obj.name || 'Unnamed Object';
        metaDisplay.textContent = '';
        metaDisplay.style.display = 'none';
        urlInput.value = obj.userData.docUrl || '';
        openBtn.textContent = 'Open ↗';
    }

    urlInput.disabled = false;
    saveBtn.disabled = false;
    openBtn.disabled = !obj.userData.docUrl;
}
