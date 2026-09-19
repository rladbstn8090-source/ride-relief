# Cached Jinju sample

`jinju.json` includes a 97 × 97 elevation sample and OSM building/water geometry.

Bounds (south, west, north, east): 35.165, 128.020, 35.202, 128.095.

Elevation: zoom 12 Terrarium tiles from https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png . Decoding: R × 256 + G + B / 256 − 32768 meters. Sample grid rows run south to north. Data were extracted for this sample on 2026-09-18. Source attribution: https://github.com/tilezen/joerd/blob/master/docs/attribution.md . Registry: https://registry.opendata.aws/terrain-tiles/ .

Buildings / water: © OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright . Overpass response reports timestamp_osm_base 2026-06-01T08:52:28Z. Building heights use tagged height, then levels × 3 m, then a 9 m fallback. Water multipolygon rings use even-odd fill so islands are retained. Unclosed geometries are excluded.

Live urban detail: areas up to 7 km request zoom 14 Terrarium elevation plus current OpenStreetMap building, park/garden/grass/recreation-ground, natural-water, water and riverbank geometry through a public Overpass endpoint. Building relations are included; height uses `height`, then `building:levels × 3 m + roof:height`, then 9 m. Adjacent open riverbank members are stitched into closed water polygons, while multipolygon holes remain holes so mapped islands stay dry.

Ocean display: Terrarium elevations below 0 m identify sea cells. The printable ocean surface is flattened to sea level and emitted as the Water part; rivers and lakes continue to use OpenStreetMap geometry where available.

Place search: user-triggered queries use the OpenStreetMap Nominatim Search API and display OpenStreetMap attribution in the search dialog. Requests are limited to South Korea, are never sent as autocomplete, are rate-limited to at most one per second, and successful results are cached in the browser. https://operations.osmfoundation.org/policies/nominatim/

The hand-drawn route in src/data/jinju.ts is an illustrative, synthetic design route, not an actual ride or verified bike itinerary.

## South Korea terrain tiles

`terrain/9/{x}/{y}.png` contains zoom 9 Terrarium tiles x=432–442 and y=196–206. The coverage includes South Korea, Jeju, and the surrounding coastal area. Source: AWS Open Data Elevation Tiles / Mapzen Terrarium. Attribution and upstream source licenses: https://github.com/tilezen/joerd/blob/master/docs/attribution.md .
