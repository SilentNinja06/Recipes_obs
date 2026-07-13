/**
 * Grocery-list combining engine.
 * Pure module — no Obsidian imports, so it is unit-testable in Node.
 *
 * Combining rules:
 * - Ingredients merge when their normalized name matches AND their units are
 *   compatible: volume↔volume and weight↔weight convert and sum; count-style
 *   units (cloves, cans, …) only merge with the exact same unit; unitless
 *   merges with unitless; "to taste" merges with "to taste".
 * - Anything incompatible (e.g. "1 cup milk" + "200 g milk") stays as
 *   separate lines rather than being guessed at.
 * - Volume/weight totals are re-normalized to a sensible unit (12 tsp →
 *   1/4 cup) in whichever measurement system the majority of the source
 *   entries used.
 *
 * The pipeline is split in two so other features can work on raw totals:
 * `aggregateIngredients` produces base-unit accumulators (pantry subtraction
 * and cost estimation operate on these), and `renderCombinedItem` turns one
 * into display text.
 */

import { Ingredient } from "./parse";
import {
	UnitDef,
	formatQuantity,
	formatQuantityForUnit,
	normalizeBase,
	unitLabel,
} from "./units";

export interface RecipeSelection {
	/** Display name of the recipe (frontmatter title or file basename). */
	name: string;
	multiplier: number;
	ingredients: Ingredient[];
}

export type ItemKind = "measurable" | "unit" | "plain" | "taste";

export interface AggregatedItem {
	displayName: string;
	nameKey: string;
	kind: ItemKind;
	family: "volume" | "weight" | null;
	unit: UnitDef | null;
	/** Base units (ml/g) for measurable items; the raw count otherwise. */
	low: number;
	high: number;
	hasAmount: boolean;
	usVotes: number;
	metricVotes: number;
	sources: string[];
}

export interface CombinedItem {
	name: string;
	/** Formatted amount + unit, e.g. "2 1/4 cups"; empty when there is no amount. */
	amountText: string;
	toTaste: boolean;
	/** Recipe labels this item came from, e.g. ["Pancakes", "Waffles ×2"]. */
	sources: string[];
}

export function normalizeName(name: string): string {
	let key = name.toLowerCase().replace(/\s+/g, " ").trim();
	// Naive singularization so "onion" and "onions" merge.
	if (key.length > 3 && key.endsWith("s") && !key.endsWith("ss")) {
		key = key.slice(0, -1);
	}
	return key;
}

/**
 * Lookup keys for an ingredient name, most specific first: the full name,
 * then with leading words dropped so "extra virgin olive oil" can still
 * match a data/pantry entry for "olive oil".
 */
export function nameKeyCandidates(name: string): string[] {
	const words = name.toLowerCase().replace(/\s+/g, " ").trim().split(" ");
	const keys: string[] = [];
	for (let i = 0; i < words.length; i++) {
		const key = normalizeName(words.slice(i).join(" "));
		if (!keys.includes(key)) keys.push(key);
	}
	return keys;
}

function pluralizeName(name: string, total: number): string {
	if (total <= 1.0001) return name;
	if (/s$/i.test(name)) return name;
	const words = name.split(" ");
	words[words.length - 1] += "s";
	return words.join(" ");
}

function formatMultiplier(mult: number): string {
	return formatQuantity(mult, false);
}

/** Sum selections into per-ingredient accumulators keyed by name + unit compatibility. */
export function aggregateIngredients(selections: RecipeSelection[]): AggregatedItem[] {
	const map = new Map<string, AggregatedItem & { sourceSet: Set<string> }>();

	for (const sel of selections) {
		const label =
			Math.abs(sel.multiplier - 1) < 1e-9
				? sel.name
				: `${sel.name} ×${formatMultiplier(sel.multiplier)}`;
		for (const ing of sel.ingredients) {
			if (!ing.name) continue;
			const nameKey = normalizeName(ing.name);
			const measurable =
				ing.amount != null &&
				ing.unit != null &&
				(ing.unit.family === "volume" || ing.unit.family === "weight");

			let key: string;
			let kind: ItemKind;
			if (ing.amount == null) {
				kind = ing.toTaste ? "taste" : "plain";
				key = `${nameKey}|${kind}`;
			} else if (measurable) {
				kind = "measurable";
				key = `${nameKey}|${ing.unit!.family}`;
			} else if (ing.unit) {
				kind = "unit";
				key = `${nameKey}|u:${ing.unit.id}`;
			} else {
				kind = "plain";
				key = `${nameKey}|plain`;
			}

			let acc = map.get(key);
			if (!acc) {
				acc = {
					displayName: ing.name,
					nameKey,
					kind,
					family: measurable ? (ing.unit!.family as "volume" | "weight") : null,
					unit: ing.unit,
					low: 0,
					high: 0,
					hasAmount: false,
					usVotes: 0,
					metricVotes: 0,
					sources: [],
					sourceSet: new Set(),
				};
				map.set(key, acc);
			}

			if (ing.amount != null) {
				const factor = sel.multiplier * (measurable ? ing.unit!.toBase : 1);
				acc.low += ing.amount.low * factor;
				acc.high += (ing.amount.high ?? ing.amount.low) * factor;
				acc.hasAmount = true;
			}
			if (measurable) {
				if (ing.unit!.system === "metric") acc.metricVotes++;
				else acc.usVotes++;
			}
			if (!acc.sourceSet.has(label)) {
				acc.sourceSet.add(label);
				acc.sources.push(label);
			}
		}
	}

	return [...map.values()].map(({ sourceSet, ...item }) => item);
}

/** Turn one accumulator into display text. */
export function renderCombinedItem(acc: AggregatedItem, fractions: boolean): CombinedItem {
	const isRange = acc.hasAmount && Math.abs(acc.high - acc.low) > 1e-9;

	let amountText = "";
	let name = acc.displayName;

	if (acc.kind === "measurable" && acc.hasAmount && acc.family) {
		const system = acc.metricVotes > acc.usVotes ? "metric" : "us";
		const norm = normalizeBase(acc.low, acc.family, system);
		const lowText = formatQuantityForUnit(norm.value, norm.unit, fractions);
		let text = lowText;
		if (isRange) {
			const highValue = acc.high / norm.unit.toBase;
			text = `${lowText}–${formatQuantityForUnit(highValue, norm.unit, fractions)}`;
		}
		const labelValue = isRange ? acc.high / norm.unit.toBase : norm.value;
		amountText = `${text} ${unitLabel(norm.unit, labelValue)}`;
	} else if (acc.kind === "unit" && acc.hasAmount && acc.unit) {
		const lowText = formatQuantity(acc.low, fractions);
		const text = isRange ? `${lowText}–${formatQuantity(acc.high, fractions)}` : lowText;
		amountText = `${text} ${unitLabel(acc.unit, isRange ? acc.high : acc.low)}`;
	} else if (acc.kind === "plain" && acc.hasAmount) {
		const lowText = formatQuantity(acc.low, fractions);
		amountText = isRange ? `${lowText}–${formatQuantity(acc.high, fractions)}` : lowText;
		name = pluralizeName(name, isRange ? acc.high : acc.low);
	}

	return {
		name,
		amountText,
		toTaste: acc.kind === "taste",
		sources: acc.sources,
	};
}

/** Aggregate + render + sort, in one call. */
export function combineIngredients(
	selections: RecipeSelection[],
	fractions: boolean
): CombinedItem[] {
	const items = aggregateIngredients(selections).map((acc) => renderCombinedItem(acc, fractions));
	items.sort((a, b) => a.name.localeCompare(b.name));
	return items;
}

/** Render combined items as a markdown task list. */
export function groceryListMarkdown(items: CombinedItem[], showSources: boolean): string {
	const lines = items.map((item) => {
		let line = "- [ ] ";
		if (item.amountText) line += `**${item.amountText}** `;
		line += item.name;
		if (item.toTaste) line += " — to taste";
		if (showSources && item.sources.length) {
			line += ` *(${item.sources.join("; ")})*`;
		}
		return line;
	});
	return lines.join("\n");
}
