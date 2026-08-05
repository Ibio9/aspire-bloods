/**
 * Phase 2 §2.3/§2.4: explicit, named conversions only — never silently
 * coerce a value from one unit to another. Only markers with a genuinely
 * well-known, unambiguous conversion factor are listed here; every other
 * marker is left alone, and if a trend series actually needs conversion
 * for a marker not listed here, the caller must fall back to marking the
 * series not cross-source-comparable rather than guess.
 */
interface ConversionRule {
  /** factor such that value_in_to = value_in_from * factor + offset */
  factor: number;
  offset?: number;
}

// Keyed by `${markerKey}:${fromUnit}->${toUnit}`, both directions listed
// explicitly (no auto-inversion — a transcription slip in one direction
// should not silently define the other).
const CONVERSIONS: Record<string, ConversionRule> = {
  // Glucose: 1 mmol/L = 18.0182 mg/dL
  'glucose:mmol/L->mg/dL': { factor: 18.0182 },
  'glucose:mg/dL->mmol/L': { factor: 1 / 18.0182 },
  // Cholesterol family: 1 mmol/L = 38.67 mg/dL
  'total-cholesterol:mmol/L->mg/dL': { factor: 38.67 },
  'total-cholesterol:mg/dL->mmol/L': { factor: 1 / 38.67 },
  'hdl:mmol/L->mg/dL': { factor: 38.67 },
  'hdl:mg/dL->mmol/L': { factor: 1 / 38.67 },
  'ldl:mmol/L->mg/dL': { factor: 38.67 },
  'ldl:mg/dL->mmol/L': { factor: 1 / 38.67 },
  // Triglycerides: 1 mmol/L = 88.57 mg/dL
  'triglycerides:mmol/L->mg/dL': { factor: 88.57 },
  'triglycerides:mg/dL->mmol/L': { factor: 1 / 88.57 },
  // Creatinine: 1 µmol/L = 0.0113 mg/dL. Key uses the actual micro sign
  // (µ, U+00B5) to match the seeded/report unit string exactly — an
  // ASCII "u" here would silently never match and this conversion would
  // never fire.
  'creatinine:µmol/L->mg/dL': { factor: 0.0113 },
  'creatinine:mg/dL->µmol/L': { factor: 1 / 0.0113 },
  // HbA1c: NGSP % to IFCC mmol/mol — not a simple ratio, standard formula
  'hba1c:%->mmol/mol': { factor: 10.929, offset: -23.5 },
  'hba1c:mmol/mol->%': { factor: 1 / 10.929, offset: 23.5 / 10.929 },
};

export interface ConversionResult {
  value: number;
  unit: string;
  converted: boolean;
  originalValue: number;
  originalUnit: string;
}

/** Returns the value unchanged (converted: false) if no conversion is needed or none is known. */
export function convertToDisplayUnit(markerKey: string, value: number, fromUnit: string, toUnit: string): ConversionResult {
  if (fromUnit === toUnit) {
    return { value, unit: toUnit, converted: false, originalValue: value, originalUnit: fromUnit };
  }
  const rule = CONVERSIONS[`${markerKey}:${fromUnit}->${toUnit}`];
  if (!rule) {
    // No known conversion — caller is responsible for treating this series
    // as not cross-source-comparable rather than mixing incompatible units.
    return { value, unit: fromUnit, converted: false, originalValue: value, originalUnit: fromUnit };
  }
  const converted = value * rule.factor + (rule.offset ?? 0);
  return { value: converted, unit: toUnit, converted: true, originalValue: value, originalUnit: fromUnit };
}

export function hasKnownConversion(markerKey: string, fromUnit: string, toUnit: string): boolean {
  return fromUnit === toUnit || `${markerKey}:${fromUnit}->${toUnit}` in CONVERSIONS;
}
