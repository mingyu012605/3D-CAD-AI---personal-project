import { state } from './state.js';

let currentObject = null;

function els() {
    return {
        nameDisplay: document.getElementById('docObjectName'),
        urlInput:    document.getElementById('docUrlInput'),
        saveBtn:     document.getElementById('saveDocUrlBtn'),
        openBtn:     document.getElementById('openDocUrlBtn'),
    };
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
        if (!currentObject || !currentObject.userData.docUrl) return;
        window.open(currentObject.userData.docUrl, '_blank', 'noopener,noreferrer');
    });
}

export function onObjectSelected(obj) {
    currentObject = obj;
    const { nameDisplay, urlInput, saveBtn, openBtn } = els();

    if (obj) {
        nameDisplay.textContent = obj.name || 'Unnamed Object';
        urlInput.value = obj.userData.docUrl || '';
        urlInput.disabled = false;
        saveBtn.disabled = false;
        openBtn.disabled = !obj.userData.docUrl;
    } else {
        nameDisplay.textContent = 'No object selected';
        urlInput.value = '';
        urlInput.disabled = true;
        saveBtn.disabled = true;
        openBtn.disabled = true;
    }
}
