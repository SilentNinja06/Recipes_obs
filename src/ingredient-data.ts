/**
 * Ingredient reference data for nutrition and cost estimates.
 * Pure module — no Obsidian imports, so it is unit-testable in Node.
 *
 * Data lives in a normal vault note inside a `recipe-ingredient-data` code
 * block, one ingredient per line:
 *
 *   name[, alias…]; per <amount> [unit]; kcal <n>; protein <n>; carbs <n>; fat <n>; cost <n>
 *
 *   all-purpose flour, flour; per 1 cup; kcal 455; protein 13; carbs 95; fat 1.2; cost 0.30
 *   egg, eggs; per 1; kcal 72; protein 6.3; fat 4.8; carbs 0.4; cost 0.35
 *   chicken breast; per 100 g; kcal 165; protein 31; fat 3.6
 *
 * Nutrient values are per the stated basis. Cost is in your own currency,
 * also per the stated basis.
 */

import { Ingredient, parseMeasure } from "./parse";
import { UnitDef } from "./units";
import { AggregatedItem, nameKeyCandidates, normalizeName } from "./combine";

export interface IngredientData {
	names: string[];
	basisAmount: number;
	basisUnit: UnitDef | null;
	kcal: number | null;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
	cost: number | null;
}

const FIELD_ALIASES: Record<string, keyof Pick<IngredientData, "kcal" | "protein" | "carbs" | "fat" | "cost">> = {
	kcal: "kcal",
	calorie: "kcal",
	calories: "kcal",
	protein: "protein",
	carb: "carbs",
	carbs: "carbs",
	carbohydrate: "carbs",
	carbohydrates: "carbs",
	fat: "fat",
	cost: "cost",
	price: "cost",
};

/** Parse the body of a `recipe-ingredient-data` code block. */
export function parseIngredientData(source: string): IngredientData[] {
	const out: IngredientData[] = [];
	for (const line of source.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) continue;
		const segments = trimmed.split(";").map((s) => s.trim());
		const names = segments[0]
			.split(",")
			.map((n) => n.trim())
			.filter(Boolean);
		if (names.length === 0) continue;

		const data: IngredientData = {
			names,
			basisAmount: 1,
			basisUnit: null,
			kcal: null,
			protein: null,
			carbs: null,
			fat: null,
			cost: null,
		};

		for (const segment of segments.slice(1)) {
			const per = segment.match(/^per\s+(.+)$/i);
			if (per) {
				const measure = parseMeasure(per[1]);
				if (measure.amount) data.basisAmount = measure.amount.low;
				data.basisUnit = measure.unit;
				continue;
			}
			const kv = segment.match(/^([A-Za-z]+)\s*[:=]?\s*([\d.,]+)/);
			if (kv) {
				const field = FIELD_ALIASES[kv[1].toLowerCase()];
				if (field) data[field] = parseFloat(kv[2].replace(",", "."));
			}
		}
		out.push(data);
	}
	return out;
}

/** Index entries by every alias, normalized the same way ingredient names are. */
export function buildDataIndex(entries: IngredientData[]): Map<string, IngredientData> {
	const index = new Map<string, IngredientData>();
	for (const entry of entries) {
		for (const name of entry.names) {
			index.set(normalizeName(name), entry);
		}
	}
	return index;
}

/** Find data for an ingredient name, dropping leading adjectives if needed. */
export function findIngredientData(
	index: Map<string, IngredientData>,
	name: string
): IngredientData | null {
	for (const key of nameKeyCandidates(name)) {
		const hit = index.get(key);
		if (hit) return hit;
	}
	return null;
}

function measurableFamily(unit: UnitDef | null): "volume" | "weight" | null {
	if (unit && (unit.family === "volume" || unit.family === "weight")) return unit.family;
	return null;
}

/**
 * How many "basis units" of the data entry a recipe ingredient represents.
 * Returns null when the amounts can't be reconciled (e.g. data is per 100 g
 * but the recipe measures in cups — no density guessing).
 */
export function basisFactor(ing: Ingredient, data: IngredientData): number | null {
	if (!ing.amount) return null;
	const amount = ing.amount.low;
	const dataFamily = measurableFamily(data.basisUnit);
	const ingFamily = measurableFamily(ing.unit);

	if (dataFamily && ingFamily) {
		if (dataFamily !== ingFamily) return null;
		const basisBase = data.basisAmount * data.basisUnit!.toBase;
		return (amount * ing.unit!.toBase) / basisBase;
	}
	if (dataFamily || ingFamily) return null;

	// Both sides are counts or unitless. "per 1" matches pieces and vice versa;
	// distinct count units (clove vs head) don't.
	if (ing.unit && data.basisUnit && ing.unit.id !== data.basisUnit.id) return null;
	return amount / data.basisAmount;
}

/** Same as basisFactor, but for an aggregated grocery item (base-unit totals). */
export function aggregatedFactor(item: AggregatedItem, data: IngredientData): number | null {
	if (!item.hasAmount) return null;
	const dataFamily = measurableFamily(data.basisUnit);

	if (item.kind === "measurable" && item.family) {
		if (dataFamily !== item.family) return null;
		const basisBase = data.basisAmount * data.basisUnit!.toBase;
		return item.low / basisBase;
	}
	if (item.kind === "unit" || item.kind === "plain") {
		if (dataFamily) return null;
		if (item.unit && data.basisUnit && item.unit.id !== data.basisUnit.id) return null;
		return item.low / data.basisAmount;
	}
	return null;
}

export interface NutritionTotals {
	kcal: number;
	protein: number;
	carbs: number;
	fat: number;
	cost: number;
	/** Ingredients that contributed at least one value. */
	matched: string[];
	/** Ingredients with no data or irreconcilable units. */
	unmatched: string[];
	/** How many matched ingredients had cost data. */
	pricedCount: number;
}

/** Total nutrition + cost for a list of ingredients against a data index. */
export function computeNutrition(
	ingredients: Ingredient[],
	index: Map<string, IngredientData>
): NutritionTotals {
	const totals: NutritionTotals = {
		kcal: 0,
		protein: 0,
		carbs: 0,
		fat: 0,
		cost: 0,
		matched: [],
		unmatched: [],
		pricedCount: 0,
	};
	for (const ing of ingredients) {
		if (!ing.name) continue;
		// Unscaled seasoning ("salt, to taste") contributes nothing — skip silently.
		if (!ing.amount && ing.toTaste) continue;
		const data = findIngredientData(index, ing.name);
		const factor = data ? basisFactor(ing, data) : null;
		if (!data || factor == null) {
			totals.unmatched.push(ing.name);
			continue;
		}
		totals.matched.push(ing.name);
		if (data.kcal != null) totals.kcal += data.kcal * factor;
		if (data.protein != null) totals.protein += data.protein * factor;
		if (data.carbs != null) totals.carbs += data.carbs * factor;
		if (data.fat != null) totals.fat += data.fat * factor;
		if (data.cost != null) {
			totals.cost += data.cost * factor;
			totals.pricedCount++;
		}
	}
	return totals;
}
