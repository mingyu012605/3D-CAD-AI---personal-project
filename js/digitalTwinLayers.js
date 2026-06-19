import { state } from './state.js';
import { clearSelection, selectObject } from './selection.js';
import { getWeather } from './weatherService.js';
import { calculateEnergyLoad, energyStatus } from './energyLayer.js';
import { calculateOccupancy, occupancyStatus } from './occupancyLayer.js';
import { calculateMaintenanceStatus } from './maintenanceLayer.js';

const baselineMaterials = new Map();
const levelFilterMaterials = new Map();
const resultByObject = new Map();
const objectByGuid = new Map();
const metadataCache = new WeakMap();
const ownedMaterials = new WeakSet();
let targetCache = { signature: '', energy: [], occupancySpaces: [], occupancyFallback: [] };
let elementLinks = {};
let maintenanceByGuid = new Map();
let activeLayer = null;
let weather = null;
let initialized = false;
let lastModelSignature = '';
let maintenanceMatches = [];
let simulationHour = new Date().getHours();
let useCurrentTime = true;
let activeLevelFilter = '__all__';
let levelFilterMode = 'ghost';
let lastLevelSignature = '';
let timeLayerTimer = null;
let materialCloneCount = 0;
let lastLayerApplyMs = 0;
let lastLayerFragmentCount = 0;

const ALL_LEVELS = '__all__';
const UNKNOWN_LEVEL = '__unknown__';

function markOwnedMaterial(material) {
    if (material?.isMaterial) {
        ownedMaterials.add(material);
        materialCloneCount++;
    }
}

function cloneMaterials(material, owned = false) {
    if (!material) return null;
    const cloned = Array.isArray(material) ? material.map(item => item.clone()) : material.clone();
    if (owned) forEachMaterial(cloned, markOwnedMaterial);
    return cloned;
}

function forEachMaterial(material, callback) {
    (Array.isArray(material) ? material : [material]).filter(Boolean).forEach(callback);
}

function disposeOwnedMaterials(material) {
    forEachMaterial(material, item => {
        if (ownedMaterials.has(item)) item.dispose();
    });
}

function disposeMaterialSnapshot(snapshot) {
    forEachMaterial(snapshot?.material, material => material.dispose?.());
    forEachMaterial(snapshot?.initialMaterial, material => material.dispose?.());
}

function getIFCMeshes() {
    const meshes = [];
    state.loadedModels.forEach(model => model.traverse(object => {
        if (object.isMesh && object.userData?.isIFCElement) meshes.push(object);
    }));
    return meshes;
}

function getModelSignature() {
    return state.loadedModels.map(model => model.uuid).join('|');
}

function getMetadata(mesh) {
    if (!mesh) return { guid: null, expressID: '', category: '', family: '', level: '', type: '', name: '' };
    if (metadataCache.has(mesh)) return metadataCache.get(mesh);
    const props = mesh?.userData?.ifcProperties || {};
    const guid = props.globalId || mesh?.userData?.globalId || mesh?.userData?.IfcGUID || mesh?.userData?.ifcGUID || null;
    const linked = guid ? elementLinks[guid] || {} : {};
    const metadata = {
        guid,
        expressID: props.expressID ?? mesh?.userData?.expressID ?? '',
        category: linked.category || props.category || props.Category || props.objectType || '',
        family: linked.familyAndType || props.typeName || props.name || '',
        level: props.level || linked.level || '',
        type: props.typeName || mesh?.userData?.ifcTypeKey || '',
        name: props.name || mesh?.name || '',
    };
    metadataCache.set(mesh, metadata);
    return metadata;
}

function getLevelFilterValue(mesh) {
    return getMetadata(mesh).level || UNKNOWN_LEVEL;
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

function getLayerTargets(meshes = getIFCMeshes()) {
    const signature = `${getModelSignature()}|${meshes.length}`;
    if (targetCache.signature === signature) return targetCache;
    targetCache = {
        signature,
        energy: meshes.filter(isEnergyTarget),
        occupancySpaces: meshes.filter(isOccupancyTarget),
        occupancyFallback: meshes.filter(isLevelFallbackTarget),
    };
    return targetCache;
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
    disposeOwnedMaterials(mesh.material);
    disposeOwnedMaterials(mesh.userData.initialMaterial);
    mesh.material = cloneMaterials(baseline.material, true);
    mesh.userData.initialMaterial = cloneMaterials(baseline.initialMaterial, true);
    forEachMaterial(mesh.material, material => { material.needsUpdate = true; });
}

function restoreLevelFilterMesh(mesh) {
    const stored = levelFilterMaterials.get(mesh.uuid);
    if (!stored) return;
    mesh.visible = stored.visible;
    disposeOwnedMaterials(mesh.material);
    disposeOwnedMaterials(mesh.userData.initialMaterial);
    mesh.material = cloneMaterials(stored.material, true);
    mesh.userData.initialMaterial = cloneMaterials(stored.initialMaterial, true);
    forEachMaterial(mesh.material, material => { material.needsUpdate = true; });
}

function clearLevelFilterVisuals() {
    getIFCMeshes().forEach(restoreLevelFilterMesh);
    levelFilterMaterials.forEach(disposeMaterialSnapshot);
    levelFilterMaterials.clear();
}

function ghostMeshForLevelFilter(mesh) {
    if (!levelFilterMaterials.has(mesh.uuid)) {
        levelFilterMaterials.set(mesh.uuid, {
            visible: mesh.visible,
            material: cloneMaterials(mesh.material),
            initialMaterial: cloneMaterials(mesh.userData.initialMaterial || mesh.material),
        });
    }
    mesh.visible = true;
    disposeOwnedMaterials(mesh.material);
    disposeOwnedMaterials(mesh.userData.initialMaterial);
    mesh.material = cloneMaterials(levelFilterMaterials.get(mesh.uuid).material, true);
    mesh.userData.initialMaterial = cloneMaterials(levelFilterMaterials.get(mesh.uuid).initialMaterial, true);
    forEachMaterial(mesh.material, material => {
        material.transparent = true;
        material.opacity = Math.min(material.opacity ?? 1, 0.07);
        material.depthTest = true;
        material.depthWrite = false;
        if (material.emissive) material.emissive.setHex(0x000000);
        if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0;
        material.needsUpdate = true;
    });
}

function hideMeshForLevelFilter(mesh) {
    if (!levelFilterMaterials.has(mesh.uuid)) {
        levelFilterMaterials.set(mesh.uuid, {
            visible: mesh.visible,
            material: cloneMaterials(mesh.material),
            initialMaterial: cloneMaterials(mesh.userData.initialMaterial || mesh.material),
        });
    }
    mesh.visible = false;
}

function isVisibleForLevelFilter(mesh) {
    if (activeLevelFilter === ALL_LEVELS) return true;
    const level = getLevelFilterValue(mesh);
    if (level === UNKNOWN_LEVEL && activeLevelFilter !== UNKNOWN_LEVEL) return true;
    return level === activeLevelFilter;
}

function applyLevelFilterVisuals(meshes = getIFCMeshes()) {
    clearLevelFilterVisuals();
    if (activeLevelFilter === ALL_LEVELS) {
        setValue('digitalTwinLevelFilterStatus', 'All levels visible');
        return;
    }
    let muted = 0;
    meshes.forEach(mesh => {
        if (!isVisibleForLevelFilter(mesh)) {
            if (levelFilterMode === 'hide') hideMeshForLevelFilter(mesh);
            else ghostMeshForLevelFilter(mesh);
            muted++;
        } else {
            mesh.visible = true;
        }
    });
    const label = activeLevelFilter === UNKNOWN_LEVEL ? 'Unknown Level' : activeLevelFilter;
    const action = levelFilterMode === 'hide' ? 'hidden' : 'softly ghosted';
    setValue('digitalTwinLevelFilterStatus', `${label} active; ${muted} other IFC fragment${muted === 1 ? '' : 's'} ${action}`);
}

function colorMesh(mesh, color, options = {}) {
    const { mix = 0.7, opacity = null } = options;
    ensureBaseline(mesh);
    // Each IFC fragment receives independent materials to avoid shared-material colour leaks.
    const baseline = baselineMaterials.get(mesh.uuid);
    disposeOwnedMaterials(mesh.material);
    disposeOwnedMaterials(mesh.userData.initialMaterial);
    mesh.material = cloneMaterials(baseline.material, true);
    mesh.userData.initialMaterial = cloneMaterials(baseline.material, true);
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
    if (clearStored) {
        baselineMaterials.forEach(disposeMaterialSnapshot);
        baselineMaterials.clear();
    }
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

function weatherSourceLabel(w) {
    if (!w) return 'Unavailable';
    if (w.source === 'open-meteo') return 'Live Open-Meteo';
    if (w.source === 'openweathermap') return 'Live OpenWeatherMap';
    return 'Simulated fallback';
}

function formatHourLabel(hour) {
    const normalized = ((Number(hour) % 24) + 24) % 24;
    const suffix = normalized >= 12 ? 'PM' : 'AM';
    const displayHour = normalized % 12 || 12;
    return `${displayHour}:00 ${suffix}`;
}

function getSimulationDate() {
    const date = new Date();
    if (useCurrentTime) {
        simulationHour = date.getHours();
        return date;
    }
    date.setHours(simulationHour, 0, 0, 0);
    return date;
}

function updateSimulationTimeUI() {
    const date = getSimulationDate();
    const hour = date.getHours();
    const slider = document.getElementById('digitalTwinTimeSlider');
    const currentButton = document.getElementById('digitalTwinUseCurrentTime');
    if (slider) slider.value = String(hour);
    setValue('digitalTwinTimeLabel', `Simulation time: ${formatHourLabel(hour)}${useCurrentTime ? ' (current)' : ''}`);
    if (currentButton) {
        currentButton.textContent = useCurrentTime ? 'Using current time' : 'Use current time';
        currentButton.classList.toggle('active', useCurrentTime);
    }
}

function refreshTimeLayer() {
    updateSimulationTimeUI();
    if (activeLayer !== 'energy' && activeLayer !== 'occupancy') return;
    window.clearTimeout(timeLayerTimer);
    timeLayerTimer = window.setTimeout(() => applyDigitalTwinLayer(activeLayer), 120);
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

function setActiveLayerSummary(name, value, detail) {
    setValue('digitalTwinActiveLayerName', name);
    setValue('digitalTwinActiveLayerValue', value);
    setValue('digitalTwinActiveFragments', detail);
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

function detailRow(label, value) {
    return `<div class="dt-detail-row"><em>${escapeHTML(label)}</em><span>${escapeHTML(value || 'Unknown')}</span></div>`;
}

function renderFactRows(facts = []) {
    return facts.map(([label, value]) => detailRow(label, value)).join('');
}

function collectLevelOptions(meshes = getIFCMeshes()) {
    const levels = new Set();
    let hasUnknown = false;
    meshes.forEach(mesh => {
        const level = getMetadata(mesh).level;
        if (level) levels.add(level);
        else hasUnknown = true;
    });
    return {
        levels: [...levels].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })),
        hasUnknown,
    };
}

function updateLevelFilterOptions() {
    const select = document.getElementById('digitalTwinLevelFilter');
    if (!select) return;
    const meshes = getIFCMeshes();
    const { levels, hasUnknown } = collectLevelOptions(meshes);
    const signature = `${levels.join('|')}|${hasUnknown}|${meshes.length}`;
    if (signature === lastLevelSignature) return;
    lastLevelSignature = signature;
    const options = [
        [ALL_LEVELS, 'All Levels'],
        ...levels.map(level => [level, level]),
        ...(hasUnknown ? [[UNKNOWN_LEVEL, 'Unknown Level']] : []),
    ];
    if (!options.some(([value]) => value === activeLevelFilter)) activeLevelFilter = ALL_LEVELS;
    select.innerHTML = options.map(([value, label]) =>
        `<option value="${escapeHTML(value)}"${value === activeLevelFilter ? ' selected' : ''}>${escapeHTML(label)}</option>`
    ).join('');
    applyLevelFilterVisuals(meshes);
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
    const simulationDate = getSimulationDate();
    const timeLabel = formatHourLabel(simulationDate.getHours());
    const baseLoad = calculateEnergyLoad(weather.temperatureC, simulationDate);
    let count = 0;
    getLayerTargets(meshes).energy.forEach(mesh => {
        const load = Math.max(0, Math.min(100, baseLoad + smallVariation(getMetadata(mesh).guid || mesh.uuid)));
        const status = energyStatus(load);
        const meta = getMetadata(mesh);
        colorMesh(mesh, status.color, { mix: 0.52, opacity: 0.82 });
        resultByObject.set(mesh.uuid, {
            title: 'Energy Usage',
            value: `${load}% derived HVAC load`,
            detail: `${status.label} / ${timeLabel} / ${meta.category || 'Mechanical target'}${meta.level ? ` / ${meta.level}` : ''}`,
            facts: [
                ['Status', status.label],
                ['Energy load', `${load}%`],
                ['Temperature', weather ? `${weather.temperatureC.toFixed(1)} °C` : 'Unavailable'],
                ['Weather source', weatherSourceLabel(weather)],
                ['Simulation time', timeLabel],
            ],
            rule: 'Derived estimate from weather + selected simulation time; matched mechanical/HVAC IFC metadata',
        });
        count++;
    });
    updateSimulationTimeUI();
    setValue('digitalTwinWeatherValue', weatherLabel(weather));
    setValue('digitalTwinEnergyValue', `${baseLoad}% derived estimate`);
    setValue('digitalTwinOccupancyValue', 'Inactive');
    setActiveLayerSummary('Energy Usage', `${baseLoad}% derived estimate from weather + time`, `${count} HVAC fragment${count === 1 ? '' : 's'} coloured`);
    setLegend([
        { color: '#22c55e', label: 'Low load' },
        { color: '#eab308', label: 'Moderate' },
        { color: '#f97316', label: 'High' },
        { color: '#dc2626', label: 'Critical' },
    ]);
    return count;
}

function applyOccupancy(meshes) {
    const simulationDate = getSimulationDate();
    const timeLabel = formatHourLabel(simulationDate.getHours());
    const layerTargets = getLayerTargets(meshes);
    const spaceTargets = layerTargets.occupancySpaces;
    const fallbackTargets = spaceTargets.length === 0 ? layerTargets.occupancyFallback : [];
    const targets = [...spaceTargets, ...fallbackTargets];
    let total = 0;
    targets.forEach(mesh => {
        const meta = getMetadata(mesh);
        const zone = meta.level || meta.name || meta.category || 'Building';
        const occupancy = calculateOccupancy(zone, simulationDate);
        const status = occupancyStatus(occupancy.value);
        const isFallback = fallbackTargets.includes(mesh);
        colorMesh(mesh, status.color, isFallback || isLargeArchitecturalSurface(mesh) ? { mix: 0.025, opacity: 0.06 } : { mix: 0.16, opacity: 0.28 });
        resultByObject.set(mesh.uuid, {
            title: 'Space Occupancy',
            value: `${occupancy.value}% simulated occupancy`,
            detail: `${occupancy.mode} / ${timeLabel} / ${zone}`,
            facts: [
                ['Status', occupancy.mode],
                ['Occupancy', `${occupancy.value}%`],
                ['Level / zone', zone],
                ['Simulation time', timeLabel],
            ],
            rule: isFallback ? 'Level-based fallback — no space elements found in IFC'
                : 'Matched space/room/zone element (simulated time-of-day schedule)',
        });
        total += occupancy.value;
    });
    const current = calculateOccupancy('building', simulationDate);
    updateSimulationTimeUI();
    setValue('digitalTwinWeatherValue', weatherLabel(weather));
    setValue('digitalTwinEnergyValue', 'Inactive');
    setValue('digitalTwinOccupancyValue', `${current.mode} / ${targets.length ? Math.round(total / targets.length) : current.value}% simulated`);
    setActiveLayerSummary('Occupancy', `${current.mode} / ${targets.length ? Math.round(total / targets.length) : current.value}% simulated`, `${targets.length} space/level fragment${targets.length === 1 ? '' : 's'} coloured`);
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
            facts: record ? [
                ['Equipment', record.equipmentName || 'Equipment'],
                ['IfcGUID', meta.guid || 'Unknown'],
                ['Last service', record.lastServiceDate || 'Unknown'],
                ['Interval', `${record.serviceIntervalDays || '?'} days`],
                ['Days since', status.daysSinceService != null ? `${status.daysSinceService}` : 'Unknown'],
                ['Status', status.label],
            ] : [
                ['Status', 'No maintenance record'],
                ['IfcGUID', meta.guid || 'Unknown'],
            ],
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
    setActiveLayerSummary('Maintenance', `${maintenanceMatches.length} matched record${maintenanceMatches.length === 1 ? '' : 's'}`, `${count} equipment fragment${count === 1 ? '' : 's'} coloured`);
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
    if (!object) {
        panel.innerHTML = '<strong>No object selected</strong><span>Select an IFC element to inspect its digital twin status.</span>';
        return;
    }
    const result = resultByObject.get(object.uuid);
    const meta = getMetadata(object);
    const linked = meta.guid ? elementLinks[meta.guid] || {} : {};
    const docUrl = object.userData?.docUrl || linked.doc_url || '';
    const docLabel = linked.doc_label || 'Linked document';
    const identityHTML = `
        <div class="dt-detail-section">
            <strong>Selected Element</strong>
            ${detailRow('Category', meta.category)}
            ${detailRow('Family / Type', meta.family || meta.type)}
            ${detailRow('Level', meta.level)}
            ${detailRow('IfcGUID', meta.guid)}
            ${detailRow('Express ID', meta.expressID)}
        </div>
        <div class="dt-detail-section">
            <strong>Linked Document</strong>
            ${detailRow('Status', docUrl ? `${docLabel} available` : 'No linked document saved')}
            <small>Use the Linked Document controls above to save or open URLs.</small>
        </div>
    `;
    if (!activeLayer) {
        panel.innerHTML = `${identityHTML}<div class="dt-detail-section"><strong>Digital Twin Status</strong><span>No active digital twin status for this element.</span></div>`;
        return;
    }
    if (!result) {
        const fallback = activeLayer === 'maintenance' ? 'No maintenance record' : 'This element is not targeted by the active layer.';
        const extra = activeLayer === 'maintenance'
            ? `<span>${maintenanceMatches.length} maintenance record${maintenanceMatches.length === 1 ? '' : 's'} matched in the loaded model.</span>`
            : '<span>Existing linked documents remain available above.</span>';
        panel.innerHTML = `${identityHTML}<div class="dt-detail-section"><strong>Digital Twin Status</strong><span class="dt-status-pill">${escapeHTML(fallback)}</span>${extra}</div>`;
        return;
    }
    const ruleHTML = result.rule ? `<small>${escapeHTML(result.rule)}</small>` : '';
    const factsHTML = renderFactRows(result.facts);
    panel.innerHTML = `${identityHTML}<div class="dt-detail-section"><strong>Digital Twin Status</strong><span class="dt-status-pill">${escapeHTML(result.title)}</span><b>${escapeHTML(result.value)}</b>${factsHTML}<span>${escapeHTML(result.detail)}</span>${ruleHTML}</div>`;
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
    const startedAt = performance.now();
    const meshes = getIFCMeshes();
    updateObjectGuidIndex(meshes);
    resultByObject.clear();
    maintenanceMatches = [];
    activeLayer = layer;

    if (!weather) weather = await getWeather();
    withSelectionPreserved(() => {
        clearLevelFilterVisuals();
        meshes.forEach(ensureBaseline);
        restoreBaseline();
        let affected = 0;
        if (layer === 'energy') affected = applyEnergy(meshes);
        if (layer === 'occupancy') affected = applyOccupancy(meshes);
        if (layer === 'maintenance') affected = applyMaintenance(meshes);
        applyLevelFilterVisuals(meshes);
        setValue('digitalTwinLayerStatus', `${affected} IFC fragment${affected === 1 ? '' : 's'} coloured`);
        lastLayerFragmentCount = affected;
    });
    lastLayerApplyMs = performance.now() - startedAt;
    updateLayerButtons();
    if (layer !== 'maintenance') renderMaintenanceRecords();
    renderSelectedResult(state.selectedObject);
    lastModelSignature = getModelSignature();
}

export function resetDigitalTwinColours() {
    withSelectionPreserved(() => {
        clearLevelFilterVisuals();
        restoreBaseline(true);
        applyLevelFilterVisuals();
    });
    activeLayer = null;
    resultByObject.clear();
    maintenanceMatches = [];
    updateLayerButtons();
    renderMaintenanceRecords();
    setLegend([{ color: '#91a9bd', label: 'Choose a layer to view its legend' }]);
    setValue('digitalTwinLayerStatus', 'Original IFC colours restored');
    setValue('digitalTwinEnergyValue', 'Inactive');
    setValue('digitalTwinOccupancyValue', 'Inactive');
    setActiveLayerSummary('None', 'Choose Energy, Occupancy, or Maintenance.', 'No fragments coloured');
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
    window.getViewerPerformanceStats = () => ({
        sceneObjects: state.scene?.children?.length || 0,
        loadedModels: state.loadedModels.length,
        selectableIfcMeshes: getIFCMeshes().filter(mesh => mesh.visible).length,
        baselineMaterials: baselineMaterials.size,
        levelFilterMaterials: levelFilterMaterials.size,
        temporaryMaterialClonesCreated: materialCloneCount,
        lastLayerApplyMs: Math.round(lastLayerApplyMs * 10) / 10,
        lastLayerFragmentCount,
    });
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
    setActiveLayerSummary('None', 'Choose Energy, Occupancy, or Maintenance.', 'No fragments coloured');
    updateSimulationTimeUI();
    updateLevelFilterOptions();
    document.getElementById('digitalTwinTimeSlider')?.addEventListener('input', event => {
        simulationHour = Number(event.target.value);
        useCurrentTime = false;
        refreshTimeLayer();
    });
    document.getElementById('digitalTwinUseCurrentTime')?.addEventListener('click', () => {
        useCurrentTime = true;
        refreshTimeLayer();
    });
    document.getElementById('digitalTwinLevelFilter')?.addEventListener('change', async event => {
        activeLevelFilter = event.target.value || ALL_LEVELS;
        if (activeLayer) {
            await applyDigitalTwinLayer(activeLayer);
            return;
        }
        withSelectionPreserved(() => applyLevelFilterVisuals());
    });
    document.getElementById('digitalTwinLevelFilterMode')?.addEventListener('change', async event => {
        levelFilterMode = event.target.value === 'hide' ? 'hide' : 'ghost';
        if (activeLayer) {
            await applyDigitalTwinLayer(activeLayer);
            return;
        }
        withSelectionPreserved(() => applyLevelFilterVisuals());
    });
    document.querySelectorAll('[data-digital-twin-layer]').forEach(button => {
        button.addEventListener('click', () => applyDigitalTwinLayer(button.dataset.digitalTwinLayer));
    });
    document.getElementById('digitalTwinResetColours')?.addEventListener('click', resetDigitalTwinColours);

    setInterval(() => {
        const signature = getModelSignature();
        updateLevelFilterOptions();
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
