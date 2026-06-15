import { state } from './state.js';
import { clearSelection, selectObject } from './selection.js';
import { getWeather } from './weatherService.js';
import { calculateEnergyLoad, energyStatus } from './energyLayer.js';
import { calculateOccupancy, occupancyStatus } from './occupancyLayer.js';
import { calculateMaintenanceStatus } from './maintenanceLayer.js';

const baselineMaterials = new Map();
const resultByObject = new Map();
let elementLinks = {};
let maintenanceByGuid = new Map();
let activeLayer = null;
let weather = null;
let initialized = false;
let lastModelSignature = '';

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
    const guid = props.globalId || mesh?.userData?.globalId || null;
    const linked = guid ? elementLinks[guid] || {} : {};
    return {
        guid,
        category: linked.category || '',
        family: linked.familyAndType || props.objectType || '',
        level: props.level || linked.level || '',
        type: props.typeName || mesh?.userData?.ifcTypeKey || '',
        name: props.name || mesh?.name || '',
    };
}

function metadataText(mesh) {
    return Object.values(getMetadata(mesh)).filter(Boolean).join(' ').toLowerCase();
}

function isMechanical(mesh) {
    return /(mechanical|hvac|equipment|duct|pipe|pump|fan|boiler|chiller|cooling|heating|terminal|diffuser|air|unit|sensor|damper|heat pump)/i.test(metadataText(mesh));
}

function isOccupancyTarget(mesh) {
    return /(space|room|floor|slab|storey|level|zone|classroom|office)/i.test(metadataText(mesh));
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

function colorMesh(mesh, color) {
    ensureBaseline(mesh);
    // Each IFC fragment receives independent materials to avoid shared-material colour leaks.
    mesh.material = cloneMaterials(mesh.material);
    mesh.userData.initialMaterial = cloneMaterials(mesh.material);
    forEachMaterial(mesh.material, material => {
        if (material.color) material.color.setHex(color);
        if (material.emissive) material.emissive.setHex(0x000000);
        if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0;
        material.needsUpdate = true;
    });
    forEachMaterial(mesh.userData.initialMaterial, material => {
        if (material.color) material.color.setHex(color);
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

function updateLayerButtons() {
    document.querySelectorAll('[data-digital-twin-layer]').forEach(button => {
        button.classList.toggle('active', button.dataset.digitalTwinLayer === activeLayer);
    });
}

function applyEnergy(meshes) {
    const baseLoad = calculateEnergyLoad(weather.temperatureC);
    let count = 0;
    meshes.filter(isMechanical).forEach(mesh => {
        const load = Math.max(0, Math.min(100, baseLoad + smallVariation(getMetadata(mesh).guid || mesh.uuid)));
        const status = energyStatus(load);
        colorMesh(mesh, status.color);
        resultByObject.set(mesh.uuid, { title: 'Energy Usage', value: `${load}% simulated HVAC load`, detail: status.label });
        count++;
    });
    setValue('digitalTwinWeatherValue', `${weather.temperatureC.toFixed(1)} C${weather.simulated ? ' (simulated)' : ' (live)'}`);
    setValue('digitalTwinEnergyValue', `${baseLoad}% simulated`);
    setValue('digitalTwinOccupancyValue', 'Inactive');
    setLegend([
        { color: '#34d399', label: 'Low load' },
        { color: '#f59e0b', label: 'Medium' },
        { color: '#ef4444', label: 'High load' },
    ]);
    return count;
}

function applyOccupancy(meshes) {
    let targets = meshes.filter(isOccupancyTarget);
    if (targets.length === 0) targets = meshes.filter(mesh => getMetadata(mesh).level);
    let total = 0;
    targets.forEach(mesh => {
        const meta = getMetadata(mesh);
        const occupancy = calculateOccupancy(meta.level || meta.name);
        const status = occupancyStatus(occupancy.value);
        colorMesh(mesh, status.color);
        resultByObject.set(mesh.uuid, {
            title: 'Space Occupancy',
            value: `${occupancy.value}% simulated occupancy`,
            detail: `${occupancy.mode}${meta.level ? ` / ${meta.level}` : ''}`,
        });
        total += occupancy.value;
    });
    const current = calculateOccupancy('building');
    setValue('digitalTwinWeatherValue', weather ? `${weather.temperatureC.toFixed(1)} C${weather.simulated ? ' (simulated)' : ' (live)'}` : 'Unavailable');
    setValue('digitalTwinEnergyValue', 'Inactive');
    setValue('digitalTwinOccupancyValue', `${current.mode} / ${targets.length ? Math.round(total / targets.length) : current.value}% simulated`);
    setLegend([
        { color: '#38bdf8', label: 'Low occupancy' },
        { color: '#f59e0b', label: 'Medium' },
        { color: '#ef4444', label: 'High occupancy' },
    ]);
    return targets.length;
}

function applyMaintenance(meshes) {
    let count = 0;
    meshes.forEach(mesh => {
        const meta = getMetadata(mesh);
        const record = meta.guid ? maintenanceByGuid.get(meta.guid) : null;
        const status = calculateMaintenanceStatus(record);
        resultByObject.set(mesh.uuid, {
            title: 'Maintenance Schedule',
            value: status.label,
            detail: record
                ? `${record.equipmentName}: ${status.daysSinceService} days since service. ${record.notes || ''}`
                : 'No maintenance record',
        });
        if (status.color != null) {
            colorMesh(mesh, status.color);
            count++;
        }
    });
    setValue('digitalTwinEnergyValue', 'Inactive');
    setValue('digitalTwinOccupancyValue', 'Inactive');
    setLegend([
        { color: '#34d399', label: 'Recently serviced' },
        { color: '#f59e0b', label: 'Due soon' },
        { color: '#ef4444', label: 'Overdue' },
    ]);
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
    if (!result) {
        const fallback = activeLayer === 'maintenance' ? 'No maintenance record' : 'This element is not targeted by the active layer.';
        panel.innerHTML = `<strong>${fallback}</strong><span>Existing IFC metadata and linked documents remain available above.</span>`;
        return;
    }
    panel.innerHTML = `<strong>${result.title}</strong><b>${result.value}</b><span>${result.detail}</span>`;
}

function updateSelectedMaintenanceValue(object) {
    if (!object) {
        setValue('digitalTwinMaintenanceValue', 'No element selected');
        return;
    }
    const guid = getMetadata(object).guid;
    const status = calculateMaintenanceStatus(guid ? maintenanceByGuid.get(guid) : null);
    setValue('digitalTwinMaintenanceValue', status.label);
}

export async function applyDigitalTwinLayer(layer) {
    if (!initialized) return;
    const meshes = getIFCMeshes();
    resultByObject.clear();
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
    renderSelectedResult(state.selectedObject);
    lastModelSignature = state.loadedModels.map(model => model.uuid).join('|');
}

export function resetDigitalTwinColours() {
    withSelectionPreserved(() => restoreBaseline(true));
    activeLayer = null;
    resultByObject.clear();
    updateLayerButtons();
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

    setValue('digitalTwinWeatherValue', `${weather.temperatureC.toFixed(1)} C${weather.simulated ? ' (simulated)' : ' (live)'}`);
    setValue('digitalTwinMaintenanceValue', 'No element selected');
    document.querySelectorAll('[data-digital-twin-layer]').forEach(button => {
        button.addEventListener('click', () => applyDigitalTwinLayer(button.dataset.digitalTwinLayer));
    });
    document.getElementById('digitalTwinResetColours')?.addEventListener('click', resetDigitalTwinColours);

    setInterval(() => {
        const signature = state.loadedModels.map(model => model.uuid).join('|');
        if (activeLayer && signature !== lastModelSignature) applyDigitalTwinLayer(activeLayer);
    }, 2000);
}
