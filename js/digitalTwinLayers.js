import { state } from './state.js';
import { clearSelection, selectObject } from './selection.js';
import { getWeather } from './weatherService.js';
import { calculateEnergyLoad, energyStatus } from './energyLayer.js';
import { calculateOccupancy, occupancyStatus } from './occupancyLayer.js';
import { calculateMaintenanceStatus } from './maintenanceLayer.js';

const baselineMaterials = new Map();
const resultByObject = new Map();
const objectByGuid = new Map();
let elementLinks = {};
let maintenanceByGuid = new Map();
let activeLayer = null;
let weather = null;
let initialized = false;
let lastModelSignature = '';
let maintenanceMatches = [];

function cloneMaterials(material) {
    if (!material) return null;
    return Array.isArray(material) ? material.map(item => item.clone()) : material.clone();
}

function forEachMaterial(material, callback) {
    (Array.isArray(material) ? material : [material]).filter(Boolean).forEach(callback);
}

function getIFCMeshes() {
    const meshes = [];
    state.loadedModels.forEach(model => model.traverse(object => {
        if (object.isMesh && object.userData?.isIFCElement) meshes.push(object);
    }));
    return meshes;
}

function getMetadata(mesh) {
    const props = mesh?.userData?.ifcProperties || {};
    const guid = props.globalId || mesh?.userData?.globalId || mesh?.userData?.IfcGUID || mesh?.userData?.ifcGUID || null;
    const linked = guid ? elementLinks[guid] || {} : {};
    return {
        guid,
        category: linked.category || props.category || props.Category || props.objectType || '',
        family: linked.familyAndType || props.typeName || props.name || '',
        level: props.level || linked.level || '',
        type: props.typeName || mesh?.userData?.ifcTypeKey || '',
        name: props.name || mesh?.name || '',
    };
}

function metadataText(mesh) {
    return Object.values(getMetadata(mesh)).filter(Boolean).join(' ').toLowerCase();
}

function descriptiveText(mesh) {
    const meta = getMetadata(mesh);
    return [meta.category, meta.family, meta.type, meta.name].filter(Boolean).join(' ').toLowerCase();
}

function isMechanical(mesh) {
    const meta = getMetadata(mesh);
    const category = meta.category.toLowerCase();
    const text = metadataText(mesh);
    return /(mechanical equipment|air terminals|ducts?|duct fittings|duct systems|pipes?|pipe fittings|piping systems|plumbing fixtures|fire protection|sprinklers?)/i.test(category)
        || /(hvac|wshp|heat pump|pump|fan|boiler|chiller|cooling|heating|terminal|diffuser|damper|vav|ahu|rtu|exhaust|supply air|return air|hydronic)/i.test(text);
}

function isEnergyTarget(mesh) {
    const meta = getMetadata(mesh);
    const category = meta.category.toLowerCase();
    const text = descriptiveText(mesh);
    if (/mechanical equipment|air terminals/i.test(category)) return true;
    if (/duct systems/i.test(category)) return /supply air|return air|exhaust|outside air|transfer air/i.test(text);
    if (/ducts?|duct fittings/i.test(category)) return /supply air|return air|exhaust|outside air|transfer air/i.test(text);
    if (/pipes|pipe fittings|piping systems/i.test(category)) return /hydronic|heating|cooling|condenser|chilled|hot water/i.test(text);
    return /(hvac|wshp|heat pump|pump|fan|boiler|chiller|cooling|heating|terminal|diffuser|damper|vav|ahu|rtu|supply air|return air|hydronic)/i.test(text);
}

function isOccupancyTarget(mesh) {
    return /(space|room|area|zone|classroom|office|storey)/i.test(descriptiveText(mesh));
}

function isPrimaryOccupancyTarget(mesh) {
    const text = descriptiveText(mesh);
    return /(space|room|area|zone|classroom|office|storey)/i.test(text);
}

function isLevelFallbackTarget(mesh) {
    const meta = getMetadata(mesh);
    if (!meta.level || isMechanical(mesh)) return false;
    return /(floor|slab|ceiling|roof|storey|zone|room|area)/i.test(descriptiveText(mesh));
}

function isLargeArchitecturalSurface(mesh) {
    return /(floor|slab|ceiling|roof)/i.test(descriptiveText(mesh));
}

function ensureBaseline(mesh) {
    if (baselineMaterials.has(mesh.uuid)) return;
    baselineMaterials.set(mesh.uuid, {
        material: cloneMaterials(mesh.material),
        initialMaterial: cloneMaterials(mesh.userData.initialMaterial || mesh.material),
    });
}

function restoreMesh(mesh) {
    const baseline = baselineMaterials.get(mesh.uuid);
    if (!baseline) return;
    mesh.material = cloneMaterials(baseline.material);
    mesh.userData.initialMaterial = cloneMaterials(baseline.initialMaterial);
    forEachMaterial(mesh.material, material => { material.needsUpdate = true; });
}

function colorMesh(mesh, color, options = {}) {
    const { mix = 0.7, opacity = null } = options;
    ensureBaseline(mesh);
    // Each IFC fragment receives independent materials to avoid shared-material colour leaks.
    mesh.material = cloneMaterials(mesh.material);
    mesh.userData.initialMaterial = cloneMaterials(mesh.material);
    forEachMaterial(mesh.material, material => {
        if (material.color) material.color.lerp(new THREE.Color(color), mix);
        if (opacity != null) {
            material.transparent = opacity < 0.98;
            material.opacity = Math.min(material.opacity ?? 1, opacity);
            material.depthTest = true;
            material.depthWrite = opacity >= 0.98;
            material.polygonOffset = true;
            material.polygonOffsetFactor = -1;
            material.polygonOffsetUnits = -1;
        }
        if (material.emissive) material.emissive.setHex(0x000000);
        if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0;
        material.needsUpdate = true;
    });
    forEachMaterial(mesh.userData.initialMaterial, material => {
        if (material.color) material.color.lerp(new THREE.Color(color), mix);
        if (opacity != null) {
            material.transparent = opacity < 0.98;
            material.opacity = Math.min(material.opacity ?? 1, opacity);
            material.depthTest = true;
            material.depthWrite = opacity >= 0.98;
            material.polygonOffset = true;
            material.polygonOffsetFactor = -1;
            material.polygonOffsetUnits = -1;
        }
        if (material.emissive) material.emissive.setHex(0x000000);
        if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0;
        material.needsUpdate = true;
    });
}

function withSelectionPreserved(callback) {
    const selected = state.selectedObject;
    if (selected) clearSelection();
    callback();
    if (selected?.parent) selectObject(selected);
}

function restoreBaseline(clearStored = false) {
    getIFCMeshes().forEach(restoreMesh);
    if (clearStored) baselineMaterials.clear();
}

function smallVariation(text = '') {
    return [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 15 - 7;
}

function weatherLabel(w) {
    if (!w) return 'Unavailable';
    if (w.source === 'open-meteo') return `${w.temperatureC.toFixed(1)} °C — Live, Open-Meteo`;
    if (w.source === 'openweathermap') return `${w.temperatureC.toFixed(1)} °C — Live, OpenWeatherMap`;
    return `${w.temperatureC.toFixed(1)} °C — Simulated fallback`;
}

function focusObject(object) {
    if (!object || !state.controls) return;
    try {
        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) return;
        const center = new THREE.Vector3();
        box.getCenter(center);
        state.controls.target.copy(center);
        state.controls.update();
    } catch (_) {}
}

function setLegend(items) {
    const legend = document.getElementById('digitalTwinLegend');
    if (!legend) return;
    legend.innerHTML = items.map(item =>
        `<span><i style="background:${item.color}"></i>${item.label}</span>`
    ).join('');
}

function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function updateObjectGuidIndex(meshes = getIFCMeshes()) {
    objectByGuid.clear();
    meshes.forEach(mesh => {
        const guid = getMetadata(mesh).guid;
        if (guid && !objectByGuid.has(guid)) objectByGuid.set(guid, mesh);
    });
}

function escapeHTML(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char]));
}

function updateLayerButtons() {
    document.querySelectorAll('[data-digital-twin-layer]').forEach(button => {
        button.classList.toggle('active', button.dataset.digitalTwinLayer === activeLayer);
    });
}

function renderMaintenanceRecords() {
    const panel = document.getElementById('digitalTwinMaintenanceRecords');
    if (!panel) return;
    if (activeLayer !== 'maintenance') {
        panel.classList.remove('visible');
        panel.innerHTML = '';
        return;
    }

    const matches = maintenanceMatches.slice(0, 6);
    panel.classList.add('visible');
    if (matches.length === 0) {
        panel.innerHTML = '<strong>Maintenance records in model</strong><small>No matching maintenance records found in the loaded IFC.</small>';
        return;
    }

    panel.innerHTML = [
        `<strong>Maintenance records in model (${maintenanceMatches.length})</strong>`,
        ...matches.map(item => `
            <button type="button" data-maintenance-guid="${escapeHTML(item.guid)}">
                <span>${escapeHTML(item.record.equipmentName || 'Equipment')}</span>
                <small>${escapeHTML(item.status.label)}</small>
            </button>
        `),
    ].join('');

    panel.querySelectorAll('[data-maintenance-guid]').forEach(button => {
        button.addEventListener('click', () => {
            const object = objectByGuid.get(button.dataset.maintenanceGuid);
            if (object?.parent) {
                selectObject(object);
                focusObject(object);
            }
        });
    });
}

function applyEnergy(meshes) {
    const baseLoad = calculateEnergyLoad(weather.temperatureC);
    let count = 0;
    meshes.filter(isEnergyTarget).forEach(mesh => {
        const load = Math.max(0, Math.min(100, baseLoad + smallVariation(getMetadata(mesh).guid || mesh.uuid)));
        const status = energyStatus(load);
        const meta = getMetadata(mesh);
        colorMesh(mesh, status.color, { mix: 0.52, opacity: 0.82 });
        resultByObject.set(mesh.uuid, {
            title: 'Energy Usage',
            value: `${load}% simulated HVAC load`,
            detail: `${status.label} / ${meta.category || 'Mechanical target'}${meta.level ? ` / ${meta.level}` : ''}`,
            rule: 'Matched mechanical/HVAC equipment category in IFC metadata',
        });
        count++;
    });
    setValue('digitalTwinWeatherValue', weatherLabel(weather));
    setValue('digitalTwinEnergyValue', `${baseLoad}% simulated`);
    setValue('digitalTwinOccupancyValue', 'Inactive');
    setLegend([
        { color: '#22c55e', label: 'Low load' },
        { color: '#eab308', label: 'Moderate' },
        { color: '#f97316', label: 'High' },
        { color: '#dc2626', label: 'Critical' },
    ]);
    return count;
}

function applyOccupancy(meshes) {
    const spaceTargets = meshes.filter(isOccupancyTarget);
    const fallbackTargets = spaceTargets.length === 0 ? meshes.filter(isLevelFallbackTarget) : [];
    const targets = [...spaceTargets, ...fallbackTargets];
    let total = 0;
    targets.forEach(mesh => {
        const meta = getMetadata(mesh);
        const zone = meta.level || meta.name || meta.category || 'Building';
        const occupancy = calculateOccupancy(zone);
        const status = occupancyStatus(occupancy.value);
        const isFallback = fallbackTargets.includes(mesh);
        colorMesh(mesh, status.color, isFallback || isLargeArchitecturalSurface(mesh) ? { mix: 0.025, opacity: 0.06 } : { mix: 0.16, opacity: 0.28 });
        resultByObject.set(mesh.uuid, {
            title: 'Space Occupancy',
            value: `${occupancy.value}% simulated occupancy`,
            detail: `${occupancy.mode} / ${zone}`,
            rule: isFallback ? 'Level-based fallback — no space elements found in IFC'
                : 'Matched space/room/zone element (simulated schedule)',
        });
        total += occupancy.value;
    });
    const current = calculateOccupancy('building');
    setValue('digitalTwinWeatherValue', weatherLabel(weather));
    setValue('digitalTwinEnergyValue', 'Inactive');
    setValue('digitalTwinOccupancyValue', `${current.mode} / ${targets.length ? Math.round(total / targets.length) : current.value}% simulated`);
    setLegend([
        { color: '#64748b', label: 'Low occupancy' },
        { color: '#22c55e', label: 'Normal' },
        { color: '#eab308', label: 'Busy' },
        { color: '#dc2626', label: 'High occupancy' },
    ]);
    return targets.length;
}

function formatMaintenanceDetail(record, status) {
    if (!record) return 'No maintenance record';
    const parts = [
        record.equipmentName || 'Equipment',
        `last serviced ${record.lastServiceDate || 'unknown'}`,
        `interval ${record.serviceIntervalDays || '?'} days`,
    ];
    if (status.daysSinceService != null) parts.push(`${status.daysSinceService} days since service`);
    if (status.daysUntilDue != null) parts.push(status.daysUntilDue < 0 ? `${Math.abs(status.daysUntilDue)} days overdue` : `${status.daysUntilDue} days until due`);
    if (record.notes) parts.push(record.notes);
    return parts.join(' / ');
}

function applyMaintenance(meshes) {
    let count = 0;
    const matchesByGuid = new Map();
    meshes.forEach(mesh => {
        const meta = getMetadata(mesh);
        const record = meta.guid ? maintenanceByGuid.get(meta.guid) : null;
        const status = calculateMaintenanceStatus(record);
        if (record && !matchesByGuid.has(meta.guid)) {
            matchesByGuid.set(meta.guid, { guid: meta.guid, record, status });
        }
        resultByObject.set(mesh.uuid, {
            title: 'Maintenance Schedule',
            value: status.label,
            detail: formatMaintenanceDetail(record, status),
            rule: record
                ? `Matched IfcGUID in maintenance_schedule.json (demo data) — GUID: ${meta.guid || 'unknown'}`
                : 'No matching IfcGUID in demo maintenance records',
        });
        if (status.color != null) {
            colorMesh(mesh, status.color, { mix: 0.55, opacity: 0.82 });
            count++;
        }
    });
    maintenanceMatches = [...matchesByGuid.values()];
    setValue('digitalTwinEnergyValue', 'Inactive');
    setValue('digitalTwinOccupancyValue', 'Inactive');
    setLegend([
        { color: '#22c55e', label: 'Recently serviced' },
        { color: '#eab308', label: 'Due soon' },
        { color: '#f97316', label: 'Overdue' },
        { color: '#dc2626', label: 'Critical overdue' },
    ]);
    renderMaintenanceRecords();
    return count;
}

function renderSelectedResult(object) {
    const panel = document.getElementById('digitalTwinSelectedResult');
    if (!panel) return;
    if (!object || !activeLayer) {
        panel.innerHTML = '<strong>No active layer result</strong><span>Select a layer and an IFC element.</span>';
        return;
    }
    const result = resultByObject.get(object.uuid);
    const meta = getMetadata(object);
    const metadataHTML = `
        <span>Category: ${escapeHTML(meta.category || 'Unknown')}</span>
        <span>Family: ${escapeHTML(meta.family || meta.type || 'Unknown')}</span>
        <span>Level: ${escapeHTML(meta.level || 'Unknown')}</span>
        <span>IfcGUID: ${escapeHTML(meta.guid || 'Unknown')}</span>
    `;
    if (!result) {
        const fallback = activeLayer === 'maintenance' ? 'No maintenance record' : 'This element is not targeted by the active layer.';
        const extra = activeLayer === 'maintenance'
            ? `<span>${maintenanceMatches.length} maintenance record${maintenanceMatches.length === 1 ? '' : 's'} matched in the loaded model.</span>`
            : '<span>Existing linked documents remain available above.</span>';
        panel.innerHTML = `<strong>${escapeHTML(fallback)}</strong>${metadataHTML}${extra}`;
        return;
    }
    const ruleHTML = result.rule ? `<small>${escapeHTML(result.rule)}</small>` : '';
    panel.innerHTML = `<strong>${escapeHTML(result.title)}</strong>${metadataHTML}<b>${escapeHTML(result.value)}</b><span>${escapeHTML(result.detail)}</span>${ruleHTML}`;
}

function updateSelectedMaintenanceValue(object) {
    if (!object) {
        setValue('digitalTwinMaintenanceValue', 'No element selected');
        return;
    }
    const guid = getMetadata(object).guid;
    const record = guid ? maintenanceByGuid.get(guid) : null;
    const status = calculateMaintenanceStatus(record);
    setValue('digitalTwinMaintenanceValue', record ? `${record.equipmentName || 'Equipment'} / ${status.label}` : status.label);
}

export async function applyDigitalTwinLayer(layer) {
    if (!initialized) return;
    const meshes = getIFCMeshes();
    updateObjectGuidIndex(meshes);
    resultByObject.clear();
    maintenanceMatches = [];
    activeLayer = layer;

    if (!weather) weather = await getWeather();
    withSelectionPreserved(() => {
        meshes.forEach(ensureBaseline);
        restoreBaseline();
        let affected = 0;
        if (layer === 'energy') affected = applyEnergy(meshes);
        if (layer === 'occupancy') affected = applyOccupancy(meshes);
        if (layer === 'maintenance') affected = applyMaintenance(meshes);
        setValue('digitalTwinLayerStatus', `${affected} IFC fragment${affected === 1 ? '' : 's'} coloured`);
    });
    updateLayerButtons();
    if (layer !== 'maintenance') renderMaintenanceRecords();
    renderSelectedResult(state.selectedObject);
    lastModelSignature = state.loadedModels.map(model => model.uuid).join('|');
}

export function resetDigitalTwinColours() {
    withSelectionPreserved(() => restoreBaseline(true));
    activeLayer = null;
    resultByObject.clear();
    maintenanceMatches = [];
    updateLayerButtons();
    renderMaintenanceRecords();
    setLegend([{ color: '#91a9bd', label: 'Choose a layer to view its legend' }]);
    setValue('digitalTwinLayerStatus', 'Original IFC colours restored');
    setValue('digitalTwinEnergyValue', 'Inactive');
    setValue('digitalTwinOccupancyValue', 'Inactive');
    renderSelectedResult(state.selectedObject);
}

export function onDigitalTwinObjectSelected(object) {
    updateSelectedMaintenanceValue(object);
    renderSelectedResult(object);
}

async function loadJSON(url, fallback) {
    try {
        const response = await fetch(url);
        return response.ok ? await response.json() : fallback;
    } catch (error) {
        console.warn(`[digitalTwinLayers] Could not load ${url}:`, error.message);
        return fallback;
    }
}

export async function initDigitalTwinLayers() {
    if (initialized) return;
    initialized = true;
    [elementLinks, weather] = await Promise.all([
        loadJSON('element_links.json', {}),
        getWeather(),
    ]);
    const maintenance = await loadJSON('maintenance_schedule.json', []);
    maintenanceByGuid = new Map(maintenance.map(record => [record.ifcGuid, record]));

    setValue('digitalTwinWeatherValue', weatherLabel(weather));
    setValue('digitalTwinWeatherSource', weather.source === 'open-meteo' ? 'Live from Open-Meteo (no key)'
        : weather.source === 'openweathermap' ? 'Live from OpenWeatherMap'
        : 'Simulated fallback');
    setValue('digitalTwinMaintenanceValue', 'No element selected');
    document.querySelectorAll('[data-digital-twin-layer]').forEach(button => {
        button.addEventListener('click', () => applyDigitalTwinLayer(button.dataset.digitalTwinLayer));
    });
    document.getElementById('digitalTwinResetColours')?.addEventListener('click', resetDigitalTwinColours);

    setInterval(() => {
        const signature = state.loadedModels.map(model => model.uuid).join('|');
        if (activeLayer && signature !== lastModelSignature) applyDigitalTwinLayer(activeLayer);
    }, 2000);

    // Refresh live weather every 10 minutes
    setInterval(async () => {
        const refreshed = await getWeather();
        weather = refreshed;
        setValue('digitalTwinWeatherValue', weatherLabel(weather));
        setValue('digitalTwinWeatherSource', weather.source === 'open-meteo' ? 'Live from Open-Meteo (no key)'
            : weather.source === 'openweathermap' ? 'Live from OpenWeatherMap'
            : 'Simulated fallback');
        if (activeLayer === 'energy') applyDigitalTwinLayer('energy');
    }, 10 * 60 * 1000);
}
