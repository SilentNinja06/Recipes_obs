/**
 * Unit table, amount formatting (fractions/decimals) and normalization.
 * Pure module — no Obsidian imports, so it is unit-testable in Node.
 *
 * Base units: volume → millilitres, weight → grams, count → the count itself.
 */

export type UnitFamily = "volume" | "weight" | "count";
export type UnitSystem = "us" | "metric" | "neutral";

export interface UnitDef {
	id: string;
	family: UnitFamily;
	system: UnitSystem;
	/** Multiplier to the family's base unit (ml, g, or 1). */
	toBase: number;
	singular: string;
	plural: string;
}

interface UnitSpec extends UnitDef {
	aliases: string[];
}

function u(
	id: string,
	family: UnitFamily,
	system: UnitSystem,
	toBase: number,
	singular: string,
	plural: string,
	aliases: string[]
): UnitSpec {
	return { id, family, system, toBase, singular, plural, aliases };
}

function count(id: string, plural: string, aliases: string[] = []): UnitSpec {
	return u(id, "count", "neutral", 1, id, plural, aliases);
}

const SPECS: UnitSpec[] = [
	// Volume — US customary
	u("tsp", "volume", "us", 4.92892, "tsp", "tsp", ["teaspoon", "teaspoons", "tsps"]),
	u("tbsp", "volume", "us", 14.7868, "tbsp", "tbsp", ["tablespoon", "tablespoons", "tbsps", "tbl", "tbs"]),
	u("floz", "volume", "us", 29.5735, "fl oz", "fl oz", ["fl oz", "floz", "fluid ounce", "fluid ounces"]),
	u("cup", "volume", "us", 236.588, "cup", "cups", []),
	u("pint", "volume", "us", 473.176, "pint", "pints", ["pt"]),
	u("quart", "volume", "us", 946.353, "quart", "quarts", ["qt", "qts"]),
	u("gallon", "volume", "us", 3785.41, "gallon", "gallons", ["gal", "gals"]),
	// Volume — metric
	u("ml", "volume", "metric", 1, "ml", "ml", ["milliliter", "milliliters", "millilitre", "millilitres", "cc"]),
	u("l", "volume", "metric", 1000, "l", "l", ["liter", "liters", "litre", "litres"]),
	u("dl", "volume", "metric", 100, "dl", "dl", ["deciliter", "deciliters", "decilitre", "decilitres"]),
	// Weight — metric
	u("mg", "weight", "metric", 0.001, "mg", "mg", ["milligram", "milligrams"]),
	u("g", "weight", "metric", 1, "g", "g", ["gram", "grams", "gr"]),
	u("kg", "weight", "metric", 1000, "kg", "kg", ["kilogram", "kilograms", "kilo", "kilos"]),
	// Weight — US/imperial
	u("oz", "weight", "us", 28.3495, "oz", "oz", ["ounce", "ounces"]),
	u("lb", "weight", "us", 453.592, "lb", "lb", ["lbs", "pound", "pounds"]),
	// Counts / kitchen measures that scale but never convert.
	// These only auto-combine with the exact same unit.
	count("clove", "cloves"),
	count("can", "cans"),
	count("jar", "jars"),
	count("bottle", "bottles"),
	count("bag", "bags"),
	count("box", "boxes"),
	count("package", "packages", ["pkg", "pkgs", "packet", "packets"]),
	count("slice", "slices"),
	count("stick", "sticks"),
	count("bunch", "bunches"),
	count("head", "heads"),
	count("sprig", "sprigs"),
	count("stalk", "stalks"),
	count("piece", "pieces"),
	count("sheet", "sheets"),
	count("fillet", "fillets"),
	count("leaf", "leaves"),
	count("ear", "ears"),
	count("cube", "cubes"),
	count("strip", "strips"),
	count("scoop", "scoops"),
	count("drop", "drops"),
	count("splash", "splashes"),
	count("pinch", "pinches"),
	count("dash", "dashes"),
	count("handful", "handfuls"),
	count("knob", "knobs"),
];

const ALIASES = new Map<string, UnitDef>();
for (const spec of SPECS) {
	const { aliases, ...def } = spec;
	for (const key of [spec.id, spec.singular, spec.plural, ...aliases]) {
		ALIASES.set(key.toLowerCase(), def);
	}
}

const BY_ID = new Map<string, UnitDef>();
for (const spec of SPECS) {
	const { aliases, ...def } = spec;
	BY_ID.set(spec.id, def);
}

export function unitById(id: string): UnitDef {
	const def = BY_ID.get(id);
	if (!def) throw new Error(`Unknown unit id: ${id}`);
	return def;
}

/** Look up a unit by any alias. Case-insensitive; trailing periods and doubled spaces ignored. */
export function lookupUnit(word: string): UnitDef | null {
	const key = word.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
	return ALIASES.get(key) ?? null;
}

/** An ingredient amount; `high` is set for ranges like "2-3". */
export interface Amount {
	low: number;
	high: number | null;
}

export function scaleAmount(amount: Amount, multiplier: number): Amount {
	return {
		low: amount.low * multiplier,
		high: amount.high == null ? null : amount.high * multiplier,
	};
}

const DENOMINATORS = [2, 3, 4, 6, 8];
const FRACTION_TOLERANCE = 0.021;

/**
 * Format a quantity for display.
 * With `fractions` on, snaps to the nearest kitchen fraction (halves, thirds,
 * quarters, …, sixteenths) when one is close enough; otherwise falls back to
 * a decimal rounded to two places.
 */
export function formatQuantity(value: number, fractions: boolean): string {
	if (!isFinite(value)) return "";
	if (!fractions) {
		const rounded = Math.round(value * 100) / 100;
		return String(rounded);
	}
	const whole = Math.floor(value + 1e-9);
	const frac = value - whole;
	if (frac <= FRACTION_TOLERANCE) {
		return whole === 0 ? formatQuantity(value, false) : String(whole);
	}
	if (1 - frac <= FRACTION_TOLERANCE) {
		return String(whole + 1);
	}
	let best: { n: number; d: number; err: number } | null = null;
	for (const d of DENOMINATORS) {
		const n = Math.round(frac * d);
		if (n <= 0 || n >= d) continue;
		const err = Math.abs(frac - n / d);
		if (!best || err < best.err - 1e-12) best = { n, d, err };
	}
	if (!best || best.err > FRACTION_TOLERANCE) {
		return formatQuantity(value, false);
	}
	const fracText = `${best.n}/${best.d}`;
	return whole > 0 ? `${whole} ${fracText}` : fracText;
}

/** Format an Amount (possibly a range) after applying a multiplier. */
export function formatAmount(amount: Amount, multiplier: number, fractions: boolean): string {
	const scaled = scaleAmount(amount, multiplier);
	const low = formatQuantity(scaled.low, fractions);
	if (scaled.high == null || Math.abs(scaled.high - scaled.low) < 1e-9) return low;
	return `${low}–${formatQuantity(scaled.high, fractions)}`;
}

/**
 * Format a quantity for a specific unit. Metric amounts round to sensible
 * whole numbers (237 ml, not 236.59 ml); US amounts honor the fraction flag.
 */
export function formatQuantityForUnit(value: number, unit: UnitDef, fractions: boolean): string {
	if (unit.system === "metric") {
		if (value >= 10) return String(Math.round(value));
		return String(Math.round(value * 10) / 10);
	}
	return formatQuantity(value, fractions);
}

/** Pick the singular or plural label for a unit given the displayed value. */
export function unitLabel(unit: UnitDef, value: number): string {
	return value > 1.0001 ? unit.plural : unit.singular;
}

/**
 * Convert a base-unit total (ml or g) into a sensible display unit for the
 * requested measurement system. E.g. 59.15 ml (12 tsp) in the US system
 * becomes { value: 0.25, unit: cup }.
 */
export function normalizeBase(
	base: number,
	family: "volume" | "weight",
	system: "us" | "metric"
): { value: number; unit: UnitDef } {
	const inUnit = (id: string) => {
		const unit = unitById(id);
		return { value: base / unit.toBase, unit };
	};
	if (family === "volume") {
		if (system === "metric") {
			return base >= 1000 ? inUnit("l") : inUnit("ml");
		}
		const cup = inUnit("cup");
		// 1/4 cup is the smallest "natural" cup measure; below it, use spoons.
		if (cup.value >= 0.2499) return cup;
		const tbsp = inUnit("tbsp");
		if (tbsp.value >= 0.9999) return tbsp;
		return inUnit("tsp");
	}
	if (system === "metric") {
		return base >= 1000 ? inUnit("kg") : inUnit("g");
	}
	const lb = inUnit("lb");
	if (lb.value >= 0.9999) return lb;
	return inUnit("oz");
}
