const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateMaintenanceStatus(record, now = new Date()) {
    if (!record) return { label: 'No maintenance record', color: null, daysSinceService: null, daysUntilDue: null };

    const lastService = new Date(record.lastServiceDate);
    const interval = Math.max(1, Number(record.serviceIntervalDays) || 1);
    const daysSinceService = Number.isNaN(lastService.getTime())
        ? null
        : Math.max(0, Math.floor((now - lastService) / DAY_MS));

    if (daysSinceService == null) {
        return { label: 'Invalid service date', color: 0xf59e0b, daysSinceService: null, daysUntilDue: null };
    }

    const daysUntilDue = interval - daysSinceService;
    if (daysUntilDue < 0) {
        return { label: 'Overdue', color: 0xef4444, daysSinceService, daysUntilDue };
    }
    if (daysUntilDue <= Math.max(14, interval * 0.2)) {
        return { label: 'Service due soon', color: 0xf59e0b, daysSinceService, daysUntilDue };
    }
    return { label: 'Recently serviced', color: 0x34d399, daysSinceService, daysUntilDue };
}
