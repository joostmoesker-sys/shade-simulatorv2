# PRD: Generieke PV, Schaduw En Accu Simulator

> Status: vastgesteld voor MVP – fase 1 in implementatie (project model, JSON
> schema, OSM kaartcanvas, locatiezoeker).

## 1. Doel

Een webtool waarmee een gebruiker voor elke locatie in Nederland een
realistische opbrengst- en economische simulatie kan maken van een
PV‑installatie met schaduwobjecten, meerdere arrays, specifieke panelen,
inverter/MPPT‑configuraties, accu, woningverbruik en warmtepomp.

De tool moet van een technisch prototype (`shade-analyser`) groeien naar een
generiek product: locatie‑onafhankelijk, configureerbaar, reproduceerbaar en
geschikt voor scenariovergelijking.

## 2. Doelgroep

- Huiseigenaren met een complexe PV‑situatie.
- Installateurs die meerdere legplannen en inverter­configuraties willen
  vergelijken.
- Technische gebruikers die nauwkeuriger willen rekenen dan standaard
  PV‑calculators.
- Energie‑enthousiastelingen met dynamische tarieven en accu’s.

## 3. Scope

**In scope (eindbeeld)**

- Locatie zoeken binnen Nederland.
- OSM‑kaartinterface voor dak, panelen en objecten.
- 3D‑schaduwobjecten zoals bomen, gebouwen, schoorstenen en dakopbouwen.
- Meerdere PV‑arrays met eigen geometrie, oriëntatie, paneeltype en
  plaatsing.
- Paneeldatabase plus handmatige paneelspecificaties.
- Inverter‑ en MPPT‑definitie.
- Visueel verbinden van panelen tot strings, parallelle strings en
  TCT‑achtige topologieën.
- Uurlijkse simulatie op basis van historische weerdata.
- Schaduwberekening per tijdstap.
- PV‑opbrengstberekening inclusief elektrische mismatch.
- Accu‑ en economische optimalisatie op basis van dynamische prijzen.
- Scenario’s vergelijken en exporteren.

**Out of scope (eerste versie)**

- Constructieve dakberekening.
- Installatie‑offertes.
- Netcongestie‑ of netbeheerder‑specifieke aansluitbeperkingen.
- Certificering als financieel adviesproduct.
- Volledig automatische herkenning van alle bomen/gebouwen uit luchtfoto’s.

## 4. Kerngebruikersverhalen

1. Als gebruiker wil ik mijn adres of locatie kunnen zoeken, zodat de
   simulatie automatisch op de juiste zonpositie en weerdata gebaseerd is.
2. Als gebruiker wil ik op een kaart mijn huis, dakvlakken en omgeving
   kunnen zien, zodat ik PV‑arrays en schaduwobjecten op de echte locatie
   kan plaatsen.
3. Als gebruiker wil ik bomen, gebouwen, schoorstenen en andere objecten
   als 3D‑vormen kunnen tekenen, zodat schaduw realistisch wordt
   meegenomen.
4. Als gebruiker wil ik per boom hoogte, kruinbreedte, stamhoogte,
   dichtheid en seizoensfactor kunnen instellen, zodat bladverlies en
   ondergroei meegenomen worden.
5. Als gebruiker wil ik één of meerdere PV‑arrays kunnen plaatsen met
   oriëntatie, tilt, hoogte, rijen, kolommen, portrait/landscape en
   paneeltype, zodat mijn fysieke installatie klopt.
6. Als gebruiker wil ik panelen uit een database kunnen kiezen of zelf
   specificaties kunnen invoeren, zodat zowel bekende als onbekende panelen
   ondersteund worden.
7. Als gebruiker wil ik inverter‑ en MPPT‑specificaties kunnen definiëren,
   zodat spannings‑, stroom‑ en vermogenslimieten worden meegenomen.
8. Als gebruiker wil ik panelen visueel kunnen verbinden tot strings,
   parallelle strings en eventueel TCT‑configuraties, zodat ik
   verschillende bekabelingsstrategieën kan vergelijken.
9. Als gebruiker wil ik foutmeldingen krijgen als mijn stringspanning,
   stroom of vermogen buiten inverterlimieten valt, zodat ik ongeldige
   ontwerpen herken.
10. Als gebruiker wil ik een accu kunnen definiëren met capaciteit, laad‑/
    ontlaadvermogen, efficiëntie, standby‑verbruik en SOC‑limieten, zodat
    batterijgedrag realistisch wordt gesimuleerd.
11. Als gebruiker wil ik mijn basisverbruik en warmtepompverbruik kunnen
    modelleren, zodat eigen gebruik en wintervraag worden meegenomen.
12. Als gebruiker wil ik historische uurlijkse weerdata gebruiken, zodat de
    jaaropbrengst niet alleen clear‑sky is.
13. Als gebruiker wil ik economische optimalisatie met dynamische prijzen,
    terugleververgoeding en eventueel grid pre‑charge, zodat ik de beste
    dispatchstrategie voor de accu kan vinden.
14. Als gebruiker wil ik scenario’s kunnen kopiëren en vergelijken, zodat
    ik bijvoorbeeld andere panelen, andere strings of een grotere accu kan
    testen.
15. Als gebruiker wil ik resultaten kunnen exporteren als CSV/JSON/PDF,
    zodat ik ze kan delen of verder analyseren.

## 5. Productflows

1. **Locatie** – Zoek op adres, postcode of kaartklik. Toon OSM‑kaart, leg
   simulatiecoördinaten vast, haal tijdzone, zonpositieparameters en
   weerdata op.
2. **Scene editor** – 2D bovenaanzicht (primair) met optionele 3D‑preview.
   Tekenen van bomen (positie, hoogte, kruin, stamhoogte, dichtheid,
   seizoen), gebouwen (footprint + hoogte) en schoorstenen/dakkapellen.
3. **PV array editor** – Rechthoekig raster op kaart met rotate/move handles.
   Velden: rijen, kolommen, oriëntatie, paneeltype, montagevlak, tilt,
   azimuth, basis­hoogte, paneel‑/rijafstand.
4. **Paneeldatabase** – Pmax, Vmp, Imp, Voc, Isc, temperatuurcoëfficiënten,
   cellen­configuratie, bypassdiodes, afmetingen. Handmatige invoer +
   optionele import (PAN/CSV) in een latere fase.
5. **Inverter/MPPT editor** – AC nominaal/max, DC max, per MPPT
   spannings‑/stroomvenster, efficiëntie(curve), standby, accu‑interface
   bij hybride inverters. Validatie op stringontwerp.
6. **Wiring editor** – Panelen als nodes, aanklikken voor seriestrings,
   parallel groeperen per MPPT. Geavanceerde modus voor TCT later.
   Waarschuwingen bij Voc bij kou, Vmpp bij hitte, overstroom bij
   parallel.
7. **Verbruik & accu** – Basisverbruik (jaarkWh + profiel), warmtepomp
   (winterdag‑kWh + temperatuur­curve), accu (capaciteit, laden/ontladen,
   efficiëntie, SOC‑grenzen, standby, grid charge/export).
8. **Simulatie** – Uurlijks (later kwartier). Pipeline: zonpositie →
   weerdata → POA‑irradiance → schaduwfactor → paneeltemperatuur → IV
   curve → string/MPPT/inverter → clipping & efficiëntie → load matching →
   accu‑dispatch → economisch resultaat.
9. **Resultaten** – Jaar/maand opbrengst, schaduw‑/mismatchverlies,
   clipping, eigenverbruik, export/import, accucycli, financieel resultaat,
   uurgrafieken, paneel‑heatmap, scenariovergelijking, CSV/JSON/PDF export.

## 6. Interfaceconcept

Eén projectcanvas met workflow‑stappen als tabs:

`Locatie`, `Objecten`, `PV Arrays`, `Bekabeling`, `Inverters`,
`Accu & Verbruik`, `Simulatie`, `Resultaten`.

Layout:

- Midden: kaart/scene.
- Rechts: eigenschappen­paneel van geselecteerd object.
- Links: projectboom (arrays, objecten, inverters, MPPT’s, scenario’s).
- Onderin: validaties, waarschuwingen en simulatiestatus.

UI‑richtlijnen: kaart is centraal (geen formulier), 2D primair, 3D
ondersteunend, snelle previewmodus naast nauwkeurige jaarmodus, wiring
visueel maar geen volledig CAD‑pakket.

## 7. Technologiestack

Aanbevolen voor MVP en daarna:

- **Frontend**: TypeScript, React 18, Vite.
- **State**: Zustand.
- **Kaart**: MapLibre GL JS met OpenStreetMap raster tiles.
- **3D preview**: Three.js (later toe te voegen).
- **Geometrie**: Turf.js + lichte eigen utilities.
- **Validatie / schema**: Zod als bron van waarheid; JSON Schema afgeleid
  via `zod-to-json-schema` voor externe consumenten en projectfiles.
- **Simulatie**: Web Workers in TypeScript; later eventueel WASM/Rust voor
  raytracing en IV‑curve.
- **Grafieken**: uPlot of ECharts.
- **Lokale opslag**: IndexedDB via Dexie (toekomstig).
- **Tests**: Vitest (unit + integratie), Playwright (UI smoke, later).
- **Lint/format**: ESLint + Prettier.
- **Hosting**: GitHub Pages / Cloudflare Pages / Netlify.
- **Optionele serverless laag**: weerdata‑proxy, API‑key bescherming,
  caching, paneeldatabase updates, scenario sharing.

Volledig client‑side blijft haalbaar voor de simulatie‑engine zelf;
weerdata, AHN/3DBAG en gedeelde scenario’s vragen later om een dunne
serverless laag.

## 8. Domeinmodel (samenvatting)

`Project` (root, versioned) bevat:

- `Location` (NL bbox‑gevalideerd, IANA timezone, optionele hoogte).
- `Scene.objects[]` discriminated union: `tree`, `building`, `box`.
- `pv.panelTypes[]`, `pv.arrays[]` (rijen/kolommen, tilt, azimuth, hoogte,
  oriëntatie, panelGap/rowGap).
- `electrical.inverters[]` (met `mppts[]`) en `electrical.wiring[]`
  (`MPPTWiring` met series strings van paneel‑coördinaten).
- `storage.batteries[]`.
- `loads.base[]` (`LoadProfile` met profielshape) en `loads.heatPumps[]`.
- `tariffs[]` (dynamisch of statisch + energiebelasting).

Ontwerpprincipe: UI praat met een Zustand store, store muteert het
projectmodel, simulatie‑engine consumeert een gevalideerd `Project`. Geen
directe rekencode in componenten.

## 9. Simulatiearchitectuur (modules)

`solar-position`, `weather`, `geometry`, `shading`, `irradiance`,
`pv-model`, `wiring`, `inverter`, `load`, `battery`, `optimizer`,
`results`. Elke module is afzonderlijk testbaar en draait in een Web
Worker tijdens een run.

## 10. Niet‑functionele eisen

- **Performance**: UI responsive tijdens simulatie; jaarberekening < 30 s
  voor een gemiddelde woning; preview enkele seconden.
- **Nauwkeurigheid**: aannames expliciet rapporteren; verliesposten
  (schaduw, weer, clipping, mismatch) apart; validatie tegen
  PVGIS/PVsyst/SAM waar mogelijk.
- **Privacy**: projectdata blijft lokaal tenzij geëxporteerd; geen account
  nodig voor basisgebruik.
- **Betrouwbaarheid**: simulatie reproduceerbaar; project JSON heeft
  `schemaVersion`; foutmeldingen wijzen op het ongeldige veld.
- **Gebruiksgemak**: beginner met templates, expert met handmatige
  specificaties; tablet bruikbaar, complexe wiring desktop‑first.

## 11. Risico’s en mitigatie

| Risico                                               | Mitigatie                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| Wiring‑editor wordt te complex                       | Eerst templates + serie/parallel; TCT later                      |
| Realistische boomschaduw (transparantie/seizoen)     | Density + seizoens­factor + later betere modellen                |
| Locatie­specifieke historische weerdata              | Gebruik PVGIS/Open‑Meteo, toon expliciete aannames               |
| Volledig client‑side bij veel objecten/scenario’s    | Web Workers vanaf dag 1, later WASM voor hot loops               |
| Overweldigende UI                                    | Templates + progressive disclosure                               |
| Engine‑coupling in UI                                | Strikte scheiding `model ↔ store ↔ engine`                       |

## 12. MVP implementatievolgorde

1. **Projectmodel en JSON schema** ← *fase 1 (deze PR)*
2. MapLibre locatiezoeker en projectcanvas ← *fase 1 (deze PR, basis)*
3. PV‑array editor met panel grid
4. Simpele objecteditor voor bomen en gebouwen
5. Zonpositie, weerdata en POA‑irradiance
6. Schaduwberekening via vereenvoudigde raycasting
7. Paneel/inverter/MPPT datamodel ← *gedefinieerd in fase 1, UI volgt*
8. Serie/parallel wiring editor
9. Jaarlijkse PV‑simulatie in Web Worker
10. Load, warmtepomp en accu
11. Economische optimizer
12. Resultatenschermen en export
13. Scenariovergelijking
14. Validatie, tests en documentatie

## 13. Fase 1 – scope van deze PR

- Vite + React + TypeScript scaffold met Vitest, ESLint, Prettier.
- Domeinmodel als Zod‑schema's (`Project`, `Location`, `SceneObject`,
  `PanelType`, `PVArray`, `Inverter`/`MPPT`, `WiringString`/`MPPTWiring`,
  `Battery`, `LoadProfile`, `HeatPumpProfile`, `TariffProfile`).
- JSON Schema export afgeleid van het Zod model.
- `createProject`, `validateProject`, `serializeProject`,
  `deserializeProject` met TDD‑tests.
- Locatie‑module met NL bounds en Nominatim‑geocoder
  (injectable `fetch`, volledig getest).
- OSM raster style + `<OsmMap>` MapLibre wrapper.
- App shell met de acht PRD‑tabs en een werkende `Locatie`‑tab.
- 55 unit/integration tests, allemaal groen, gebouwd via TDD.
