const DEFAULT_LAT = 49.2827;
const DEFAULT_LON = -123.1207;
const DEFAULT_LOCATION = 'Vancouver, BC';

function simulatedTemperature(now = new Date()) {
    const month = now.getMonth();
    const hour = now.getHours();
    const seasonalBase = [5, 6, 8, 11, 15, 18, 21, 21, 17, 12, 8, 5][month];
    const daytimeSwing = Math.sin(((hour - 8) / 24) * Math.PI * 2) * 4;
    return Number((seasonalBase + daytimeSwing).toFixed(1));
}

async function fetchOpenMeteo(lat, lon, location) {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('current', 'temperature_2m');
    url.searchParams.set('forecast_days', '1');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
    const data = await response.json();
    return {
        temperatureC: Number(data.current.temperature_2m),
        description: 'current conditions',
        location,
        simulated: false,
        source: 'open-meteo',
    };
}

export async function getWeather() {
    const config = window.DIGITAL_TWIN_CONFIG || {};
    const apiKey = config.openWeatherMapApiKey?.trim();
    const location = config.weatherLocation?.trim() || DEFAULT_LOCATION;
    const lat = config.latitude ?? DEFAULT_LAT;
    const lon = config.longitude ?? DEFAULT_LON;

    // Try Open-Meteo first — no API key required
    try {
        return await fetchOpenMeteo(lat, lon, location);
    } catch (e) {
        console.warn('[weatherService] Open-Meteo unavailable:', e.message);
    }

    // Fall back to OpenWeatherMap if a key is configured
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
                source: 'openweathermap',
            };
        } catch (error) {
            console.warn('[weatherService] OpenWeatherMap unavailable:', error.message);
        }
    }

    return {
        temperatureC: simulatedTemperature(),
        description: 'seasonal estimate',
        location,
        simulated: true,
        source: 'simulated',
    };
}
