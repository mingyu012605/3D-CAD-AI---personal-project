const DEFAULT_LOCATION = 'Vancouver';

function simulatedTemperature(now = new Date()) {
    const month = now.getMonth();
    const hour = now.getHours();
    const seasonalBase = [5, 6, 8, 11, 15, 18, 21, 21, 17, 12, 8, 5][month];
    const daytimeSwing = Math.sin(((hour - 8) / 24) * Math.PI * 2) * 4;
    return Number((seasonalBase + daytimeSwing).toFixed(1));
}

export async function getWeather() {
    // Static deployments can define this before js/main.js loads:
    // window.DIGITAL_TWIN_CONFIG = { openWeatherMapApiKey: '...', weatherLocation: 'Vancouver' };
    const config = window.DIGITAL_TWIN_CONFIG || {};
    const apiKey = config.openWeatherMapApiKey?.trim();
    const location = config.weatherLocation?.trim() || DEFAULT_LOCATION;

    if (apiKey) {
        try {
            const url = new URL('https://api.openweathermap.org/data/2.5/weather');
            url.searchParams.set('q', location);
            url.searchParams.set('appid', apiKey);
            url.searchParams.set('units', 'metric');
            const response = await fetch(url);
            if (!response.ok) throw new Error(`OpenWeather returned ${response.status}`);
            const data = await response.json();
            return {
                temperatureC: Number(data.main.temp),
                description: data.weather?.[0]?.description || 'live weather',
                location: data.name || location,
                simulated: false,
            };
        } catch (error) {
            console.warn('[weatherService] Live weather unavailable; using simulated fallback:', error.message);
        }
    }

    return {
        temperatureC: simulatedTemperature(),
        description: 'seasonal fallback',
        location,
        simulated: true,
    };
}
