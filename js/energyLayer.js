function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
}

export function calculateEnergyLoad(temperatureC, date = new Date()) {
    const hour = date.getHours();
    const occupiedHours = hour >= 7 && hour < 19;
    const coolingDemand = Math.max(0, temperatureC - 20) * 7;
    const heatingDemand = Math.max(0, 16 - temperatureC) * 6;
    const baseLoad = occupiedHours ? 24 : 10;
    return Math.round(clamp(baseLoad + coolingDemand + heatingDemand));
}

export function energyStatus(load) {
    if (load >= 85) return { label: 'Critical load', color: 0xdc2626 };
    if (load >= 65) return { label: 'High load', color: 0xf97316 };
    if (load >= 40) return { label: 'Moderate load', color: 0xeab308 };
    return { label: 'Low load', color: 0x22c55e };
}
