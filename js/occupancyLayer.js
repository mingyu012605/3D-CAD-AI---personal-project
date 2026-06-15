function hashText(text = '') {
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return Math.abs(hash);
}

export function calculateOccupancy(level = '', date = new Date()) {
    const hour = date.getHours();
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    let base;
    let mode;

    if (weekend) {
        base = 16;
        mode = 'Weekend reduced';
    } else if (hour >= 8 && hour < 18) {
        base = 72;
        mode = 'Occupied hours';
    } else if (hour >= 6 && hour < 21) {
        base = 32;
        mode = 'Transition hours';
    } else {
        base = 8;
        mode = 'Night setback';
    }

    const levelVariation = (hashText(level) % 17) - 8;
    return { value: Math.max(0, Math.min(100, base + levelVariation)), mode };
}

export function occupancyStatus(value) {
    if (value >= 70) return { label: 'High occupancy', color: 0xef4444 };
    if (value >= 35) return { label: 'Medium occupancy', color: 0xf59e0b };
    return { label: 'Low occupancy', color: 0x38bdf8 };
}
