/**
 * Domain model schemas for the generic PV / shade / battery simulator.
 *
 * The `Project` schema is the canonical, versioned representation of a
 * simulation project. It is used both at runtime (for validation of
 * UI-edited state) and as the JSON file format for export/import.
 *
 * Design principles
 * -----------------
 * - All entities have a stable `id` that does not change across edits.
 * - All numeric units are SI-style and explicit in field names where
 *   ambiguous (`tiltDeg`, `azimuthDeg`, `heightM`, `capacityKwh`, ...).
 * - The project schema is versioned via `schemaVersion` so future
 *   migrations stay tractable.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/** Stable identifier for any entity inside a project. */
export const IdSchema = z.string().min(1, 'id must not be empty');

const FiniteNumber = z.number().finite();
const NonNegative = FiniteNumber.nonnegative();
const Positive = FiniteNumber.positive();

const DegreesAzimuth = FiniteNumber.gte(0).lt(360);
const DegreesTilt = FiniteNumber.gte(0).lte(90);

/** Bounds for the Netherlands (incl. Wadden Sea), used for input validation. */
export const NL_BOUNDS = {
  minLat: 50.5,
  maxLat: 53.7,
  minLon: 3.2,
  maxLon: 7.3,
} as const;

export const LatLonSchema = z.object({
  lat: FiniteNumber.gte(-90).lte(90),
  lon: FiniteNumber.gte(-180).lte(180),
});
export type LatLon = z.infer<typeof LatLonSchema>;

/**
 * A location anywhere in the Netherlands. Coordinates outside the NL bounding
 * box are rejected because weather/irradiance sources used by the simulator
 * are NL-specific.
 */
export const LocationSchema = z
  .object({
    lat: FiniteNumber,
    lon: FiniteNumber,
    label: z.string().optional(),
    /** IANA timezone, e.g. "Europe/Amsterdam". */
    timezone: z.string().default('Europe/Amsterdam'),
    /** Ground elevation in metres above NAP, optional. */
    elevationM: FiniteNumber.optional(),
  })
  .superRefine((loc, ctx) => {
    if (
      loc.lat < NL_BOUNDS.minLat ||
      loc.lat > NL_BOUNDS.maxLat ||
      loc.lon < NL_BOUNDS.minLon ||
      loc.lon > NL_BOUNDS.maxLon
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Location must be inside the Netherlands bounding box',
        path: [],
      });
    }
  });
export type Location = z.infer<typeof LocationSchema>;

// ---------------------------------------------------------------------------
// Scene objects (shading geometry)
// ---------------------------------------------------------------------------

const SceneObjectBase = z.object({
  id: IdSchema,
  name: z.string().default(''),
  /** Anchor position of the object on the map. */
  position: LatLonSchema,
});

export const TreeObjectSchema = SceneObjectBase.extend({
  kind: z.literal('tree'),
  /** Total tree height in metres. */
  heightM: Positive,
  /** Crown radius in metres. */
  crownRadiusM: Positive,
  /** Bare-trunk height (m) below the crown. */
  trunkHeightM: NonNegative,
  /** Crown opacity in [0, 1]. 1 = fully opaque. */
  density: FiniteNumber.gte(0).lte(1).default(0.7),
  /** Undergrowth around/below the tree crown, used by shading model later. */
  undergrowth: z.enum(['none', 'grass', 'shrubs', 'dense']).default('grass'),
  /** Whether the tree drops its leaves; affects winter density. */
  deciduous: z.boolean().default(true),
});
export type TreeObject = z.infer<typeof TreeObjectSchema>;

export const BuildingObjectSchema = SceneObjectBase.extend({
  kind: z.literal('building'),
  /** Polygon footprint as ring of [lon, lat] pairs (closed implicitly). */
  footprint: z
    .array(z.tuple([FiniteNumber, FiniteNumber]))
    .min(3, 'building footprint needs at least 3 points'),
  heightM: Positive,
  /** Optional roof polygons imported from 3D BAG/CityJSON for non-flat roof geometry. */
  roofSurfaces: z
    .array(
      z.object({
        footprint: z.array(z.tuple([FiniteNumber, FiniteNumber])).min(3),
        /** Optional per-vertex [lon, lat, height above ground] for sloped roofs. */
        vertices: z.array(z.tuple([FiniteNumber, FiniteNumber, NonNegative])).min(3).optional(),
        baseHeightM: NonNegative.default(0),
        heightM: Positive,
      }),
    )
    .optional(),
});
export type BuildingObject = z.infer<typeof BuildingObjectSchema>;

export const BoxObjectSchema = SceneObjectBase.extend({
  kind: z.literal('box'),
  widthM: Positive,
  depthM: Positive,
  heightM: Positive,
  azimuthDeg: DegreesAzimuth.default(0),
});
export type BoxObject = z.infer<typeof BoxObjectSchema>;

export const SceneObjectSchema = z.discriminatedUnion('kind', [
  TreeObjectSchema,
  BuildingObjectSchema,
  BoxObjectSchema,
]);
export type SceneObject = z.infer<typeof SceneObjectSchema>;

// ---------------------------------------------------------------------------
// Panels, arrays, inverters, wiring
// ---------------------------------------------------------------------------

export const PanelTypeSchema = z.object({
  id: IdSchema,
  manufacturer: z.string().default(''),
  model: z.string().default(''),
  /** Nameplate Wp at STC. */
  pmaxW: Positive,
  vmpV: Positive,
  impA: Positive,
  vocV: Positive,
  iscA: Positive,
  /** Temperature coefficient of Pmax in %/°C (typically negative, e.g. -0.35). */
  tempCoeffPmaxPctPerC: FiniteNumber,
  tempCoeffVocPctPerC: FiniteNumber,
  cells: z.number().int().positive().default(60),
  bypassDiodes: z.number().int().positive().default(3),
  widthM: Positive,
  heightM: Positive,
});
export type PanelType = z.infer<typeof PanelTypeSchema>;

export const PVArraySchema = z.object({
  id: IdSchema,
  name: z.string().default(''),
  panelTypeId: IdSchema,
  /** Anchor position of the array centroid. */
  position: LatLonSchema,
  rows: z.number().int().positive(),
  columns: z.number().int().positive(),
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  azimuthDeg: DegreesAzimuth,
  tiltDeg: DegreesTilt,
  /** Height of the lowest panel edge above ground (m). */
  baseHeightM: NonNegative.default(0),
  /** Spacing between panels within a row (m). */
  panelGapM: NonNegative.default(0.02),
  /** Spacing between rows (m). */
  rowGapM: NonNegative.default(0.02),
});
export type PVArray = z.infer<typeof PVArraySchema>;

export const MPPTSchema = z.object({
  id: IdSchema,
  name: z.string().default(''),
  vMinV: Positive,
  vMaxV: Positive,
  vStartV: Positive,
  iMaxA: Positive,
  iScMaxA: Positive,
  pMaxW: Positive,
});
export type MPPT = z.infer<typeof MPPTSchema>;

export const InverterSchema = z.object({
  id: IdSchema,
  name: z.string().default(''),
  pAcNomW: Positive,
  pAcMaxW: Positive,
  pDcMaxW: Positive,
  /** Hybrid inverter: max battery charge/discharge AC-side power. */
  pBatteryMaxW: NonNegative.default(0),
  efficiency: FiniteNumber.gt(0).lte(1).default(0.97),
  standbyW: NonNegative.default(5),
  mppts: z.array(MPPTSchema).min(1),
});
export type Inverter = z.infer<typeof InverterSchema>;

/**
 * A wiring graph describes how panels of one or more arrays are wired
 * into series strings and how those strings connect to MPPTs.
 *
 * For phase 1 we only model series strings + parallel grouping per MPPT.
 * Cross-tie / TCT topologies are reserved for a later phase.
 */
export const WiringStringSchema = z.object({
  id: IdSchema,
  /** Ordered list of panel references that form one series string. */
  panels: z
    .array(
      z.object({
        arrayId: IdSchema,
        /** Zero-based row index within the array. */
        row: z.number().int().nonnegative(),
        /** Zero-based column index within the array. */
        column: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});
export type WiringString = z.infer<typeof WiringStringSchema>;

export const MPPTWiringSchema = z.object({
  inverterId: IdSchema,
  mpptId: IdSchema,
  /** Strings connected in parallel on this MPPT. */
  strings: z.array(WiringStringSchema),
});
export type MPPTWiring = z.infer<typeof MPPTWiringSchema>;

// ---------------------------------------------------------------------------
// Battery, loads, tariffs
// ---------------------------------------------------------------------------

export const BatterySchema = z.object({
  id: IdSchema,
  name: z.string().default(''),
  capacityKwh: Positive,
  pChargeMaxKw: Positive,
  pDischargeMaxKw: Positive,
  roundTripEfficiency: FiniteNumber.gt(0).lte(1).default(0.9),
  socMin: FiniteNumber.gte(0).lte(1).default(0.1),
  socMax: FiniteNumber.gte(0).lte(1).default(1.0),
  standbyW: NonNegative.default(15),
  /** Whether grid charging is allowed (e.g. cheap APX hours). */
  allowGridCharge: z.boolean().default(false),
  /** Whether discharging back to the grid is allowed. */
  allowGridExport: z.boolean().default(true),
});
export type Battery = z.infer<typeof BatterySchema>;

export const LoadProfileSchema = z.object({
  id: IdSchema,
  name: z.string().default('Basisverbruik'),
  /** Annual base electricity use in kWh. */
  annualKwh: NonNegative,
  /** Profile shape used to spread `annualKwh` over the year. */
  shape: z.enum(['flat', 'morning_peak', 'evening_peak', 'work_from_home']).default('evening_peak'),
});
export type LoadProfile = z.infer<typeof LoadProfileSchema>;

export const HeatPumpProfileSchema = z.object({
  id: IdSchema,
  name: z.string().default('Warmtepomp'),
  /** Average winter-day energy use in kWh (e.g. January). */
  winterDayKwh: NonNegative,
  /** Outside temperature (°C) above which heating drops to ~0. */
  heatingBaseTempC: FiniteNumber.default(15),
});
export type HeatPumpProfile = z.infer<typeof HeatPumpProfileSchema>;

export const ElectricVehicleProfileSchema = z.object({
  id: IdSchema,
  name: z.string().default('Elektrische auto'),
  /** Usable vehicle battery capacity. Typical mid-range EVs are around 60 kWh. */
  batteryCapacityKwh: Positive.default(60),
  /** Charging power available at home or work. */
  chargePowerKw: Positive.default(11),
  /** Average driven energy that must be recharged on weekdays. */
  weekdayUseKwh: NonNegative.default(6),
  /** Average driven energy that must be recharged on weekend days. */
  weekendUseKwh: NonNegative.default(8),
  /** First preferred charging hour, local clock. */
  chargeStartHour: z.number().int().min(0).max(23).default(18),
  /** Last preferred charging hour, local clock. */
  chargeEndHour: z.number().int().min(0).max(23).default(7),
  /** Flexible EV demand may be shifted inside the preferred charge window. */
  flexible: z.boolean().default(true),
});
export type ElectricVehicleProfile = z.infer<typeof ElectricVehicleProfileSchema>;

export const TariffProfileSchema = z.object({
  id: IdSchema,
  name: z.string().default(''),
  /** Whether dynamic (APX-style hourly) pricing is used. */
  dynamic: z.boolean().default(true),
  /** Fallback static import price (EUR/kWh) if dynamic data unavailable. */
  staticImportEurPerKwh: NonNegative.default(0.3),
  /** Static feed-in price (EUR/kWh). */
  staticExportEurPerKwh: NonNegative.default(0.05),
  /** Energy tax (EUR/kWh) added to the import price. */
  energyTaxEurPerKwh: NonNegative.default(0.1316),
  /** Energy-company surcharge added to imported dynamic electricity (EUR/kWh). */
  importMarkupEurPerKwh: NonNegative.default(0.03),
  /** Energy-company surcharge added to exported dynamic electricity (EUR/kWh). */
  exportMarkupEurPerKwh: NonNegative.default(0),
});
export type TariffProfile = z.infer<typeof TariffProfileSchema>;

// ---------------------------------------------------------------------------
// Project root
// ---------------------------------------------------------------------------

/** Increment when making breaking schema changes; migrations live elsewhere. */
export const PROJECT_SCHEMA_VERSION = 1 as const;

export const ProjectSchema = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  id: IdSchema,
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  location: LocationSchema,
  scene: z.object({
    objects: z.array(SceneObjectSchema).default([]),
  }),
  pv: z.object({
    panelTypes: z.array(PanelTypeSchema).default([]),
    arrays: z.array(PVArraySchema).default([]),
  }),
  electrical: z.object({
    inverters: z.array(InverterSchema).default([]),
    wiring: z.array(MPPTWiringSchema).default([]),
  }),
  storage: z.object({
    batteries: z.array(BatterySchema).default([]),
  }),
  loads: z.object({
    base: z.array(LoadProfileSchema).default([]),
    heatPumps: z.array(HeatPumpProfileSchema).default([]),
    electricVehicles: z.array(ElectricVehicleProfileSchema).default([]),
  }),
  tariffs: z.array(TariffProfileSchema).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;
