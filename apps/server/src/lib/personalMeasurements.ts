/**
 * ---------------------------------------------------------------------------
 * The measurements taken at the clinic visit, as Personal Health Measurements.
 * ---------------------------------------------------------------------------
 *
 * GetOrderResultDetail returns height, weight, waist, hip, pulse and both
 * blood pressures alongside the analytes. They are recorded at collection,
 * not measured from the blood sample, and our catalogue already has a health
 * area for exactly that — "Personal Health Measurements", whose own note says
 * so. This module is the mapping between the two.
 *
 * WHY THEY ARE NOT ReportResult ROWS. A ReportResult carries a reference
 * range and a status, and both are mandatory to it in the way that matters:
 * the range is a required relation, and everything downstream — the range
 * bar, the traffic-light tint, the counts strip, the trend bands — reads a
 * result as "a number with a position between two numbers". None of these
 * measurements has such a position. Randox supply no range for them, and the
 * ones that have published thresholds have DIAGNOSTIC thresholds: NICE's
 * hypertension numbers are acted on in a consultation with a repeat reading,
 * not printed as a band beside a single clinic measurement. Inventing a range
 * to satisfy a foreign key would be inventing a range (see the optimal-range
 * rule), and the status it implied would be a diagnosis this system does not
 * make.
 *
 * So they are carried as what they are: values with units, grouped under
 * their health area, with no status, no tint, no reference range and no
 * optimal band. The same treatment the genetic, sensitivity and composition
 * sections get, and for the same reason — a measurement of a person is not
 * the same kind of statement as an analyte against a laboratory range, and
 * laying them out as though it were is the error.
 */

export interface PersonalMeasurement {
  /** Marker.key in the catalogue's Personal Health Measurements area. */
  key: string;
  /** The name as the catalogue holds it. */
  name: string;
  value: number;
  unit: string;
}

export interface MeasurementSource {
  heightCm: number | null;
  weightKg: number | null;
  waistCm: number | null;
  hipCm: number | null;
  pulseBpm: number | null;
  systolicBp: number | null;
  diastolicBp: number | null;
}

interface Definition {
  key: string;
  name: string;
  unit: string;
  read: (m: MeasurementSource) => number | null;
  /** Decimal places. Everything here is reported to a sensible precision. */
  decimals: number;
}

/**
 * Order is the catalogue's, not the payload's: someone reading their own
 * measurements reads height and weight together, then the two circumferences,
 * then the two pressures. Waist/hip ratio sits with the circumferences it is
 * derived from.
 */
const DEFINITIONS: Definition[] = [
  { key: 'height', name: 'Height', unit: 'cm', read: (m) => m.heightCm, decimals: 1 },
  { key: 'weight', name: 'Weight', unit: 'kg', read: (m) => m.weightKg, decimals: 1 },
  { key: 'waist-circumference', name: 'Waist Circumference', unit: 'cm', read: (m) => m.waistCm, decimals: 1 },
  { key: 'hip-circumference', name: 'Hip Circumference', unit: 'cm', read: (m) => m.hipCm, decimals: 1 },
  {
    key: 'waist-hip-ratio',
    name: 'Waist/Hip Ratio',
    unit: '',
    // Arithmetic on two numbers the laboratory measured, not a new claim
    // about the patient — which is why deriving this one is fine where
    // deriving, say, a body-mass classification would not be. Guarded
    // against a zero hip measurement, which would otherwise produce Infinity
    // and render as a number.
    read: (m) => (m.waistCm !== null && m.hipCm !== null && m.hipCm > 0 ? m.waistCm / m.hipCm : null),
    decimals: 2,
  },
  { key: 'pulse', name: 'Pulse', unit: 'bpm', read: (m) => m.pulseBpm, decimals: 0 },
  {
    key: 'systolic-blood-pressure',
    name: 'Systolic Blood Pressure',
    unit: 'mmHg',
    read: (m) => m.systolicBp,
    decimals: 0,
  },
  {
    key: 'diastolic-blood-pressure',
    name: 'Diastolic Blood Pressure',
    unit: 'mmHg',
    read: (m) => m.diastolicBp,
    decimals: 0,
  },
];

/**
 * The measurements present on a report, in catalogue order.
 *
 * A measurement that was not taken renders nowhere — the same product rule
 * every other result obeys ("a marker with no result renders nowhere, never a
 * placeholder, never an empty row"). Zero is a real reading for none of these
 * and is treated as absent: a height of 0cm is a field nobody filled in.
 */
export function personalMeasurementsOf(source: MeasurementSource | null | undefined): PersonalMeasurement[] {
  if (!source) return [];
  const out: PersonalMeasurement[] = [];
  for (const def of DEFINITIONS) {
    const raw = def.read(source);
    if (raw === null || !Number.isFinite(raw) || raw <= 0) continue;
    out.push({
      key: def.key,
      name: def.name,
      value: Number(raw.toFixed(def.decimals)),
      unit: def.unit,
    });
  }
  return out;
}

/** The catalogue key of the health area these belong to. */
export const PERSONAL_MEASUREMENTS_CATEGORY_KEY = 'personal-health-measurements';
