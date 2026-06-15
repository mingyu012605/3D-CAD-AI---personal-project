# 3D-CAD-AI---personal-project

## Digital Twin Data Layers

The viewer includes simulated Energy Usage, Occupancy, and Maintenance layers. The app works without external API keys.

To enable live OpenWeatherMap temperature, edit the public-browser placeholder in `js/config.js`:

```js
window.DIGITAL_TWIN_CONFIG = window.DIGITAL_TWIN_CONFIG || {
  openWeatherMapApiKey: 'YOUR_PUBLIC_BROWSER_KEY',
  weatherLocation: 'Vancouver'
};
```

For production, restrict the OpenWeatherMap key to the deployed site. Never commit private keys. When no key is configured or the request fails, the viewer uses a labelled simulated seasonal temperature.

Edit `maintenance_schedule.json` to manage maintenance records. Records are matched to IFC elements by `ifcGuid`:

```json
{
  "ifcGuid": "IFC_GLOBAL_ID",
  "equipmentName": "Equipment name",
  "lastServiceDate": "2026-05-20",
  "serviceIntervalDays": 120,
  "notes": "Service notes"
}
```
