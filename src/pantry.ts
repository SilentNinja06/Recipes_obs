/**
 * Pantry cross-check for grocery lists.
 * Pure module — no Obsidian imports, so it is unit-testable in Node.
 *
 * The pantry is a normal note using the same ingredient line syntax. A line
 * with an amount ("2 cups flour") covers up to that much; a bare line
 * ("salt") means "always stocked" and fully covers matching items.
 */

import { Ingredient } from "./parse";
import { AggregatedItem, nameKeyCandidates, normalizeName } from "./combine";

interface PantryEntry {
	unlimited: boolean;
	kind: "measurable" | "unit" | "plain";
	family: "volume" | "weight" | null;
	unitId: string | null;
	/** Remaining stock in base units (ml/g) or raw count. */
	remaining: number;
}

export type Pantry = Map<string, PantryEntry[]>;

export function buildPantry(ingredients: Ingredient[]): Pantry {
	const pantry: Pantry = new Map();
	for (const ing of ingredients) {
		if (!ing.name) continue;
		const key = normalizeName(ing.name);
		const measurable =
			ing.amount != null &&
			ing.unit != null &&
			(ing.unit.family === "volume" || ing.unit.family === "weight");
		const entry: PantryEntry = {
			unlimited: ing.amount == null,
			kind: measurable ? "measurable" : ing.unit ? "unit" : "plain",
			family: measurable ? (ing.unit!.family as "volume" | "weight") : null,
			unitId: ing.unit?.id ?? null,
			remaining: ing.amount ? ing.amount.low * (measurable ? ing.unit!.toBase : 1) : Infinity,
		};
		const list = pantry.get(key);
		if (list) list.push(entry);
		else pantry.set(key, [entry]);
	}
	return pantry;
}

function compatible(item: AggregatedItem, entry: PantryEntry): boolean {
	if (entry.unlimited) return true;
	if (item.kind === "taste") return false; // only unlimited entries cover "to taste"
	if (item.kind === "measurable") {
		return entry.kind === "measurable" && entry.family === item.family;
	}
	if (item.kind === "unit") {
		return entry.kind === "unit" && entry.unitId === item.unit?.id;
	}
	// plain ↔ plain ("3 eggs" in the pantry vs "2 eggs" needed)
	return entry.kind === "plain";
}

export interface PantryApplication {
	/** Items still needed (possibly with reduced amounts). */
	needed: AggregatedItem[];
	/** Items fully covered by the pantry. */
	stocked: AggregatedItem[];
	/** Items whose amounts were reduced but not eliminated. */
	reduced: Set<AggregatedItem>;
}

/**
 * Subtract pantry stock from aggregated grocery items. Amounts are mutated
 * in place; stock is consumed so two items can't double-count one entry.
 */
export function applyPantry(items: AggregatedItem[], pantry: Pantry): PantryApplication {
	const needed: AggregatedItem[] = [];
	const stocked: AggregatedItem[] = [];
	const reduced = new Set<AggregatedItem>();

	for (const item of items) {
		let covered = false;
		const seen = new Set<PantryEntry>();
		for (const key of nameKeyCandidates(item.displayName)) {
			const entries = pantry.get(key);
			if (!entries) continue;
			for (const entry of entries) {
				if (seen.has(entry)) continue;
				seen.add(entry);
				if (!compatible(item, entry)) continue;
				if (entry.unlimited) {
					covered = true;
					break;
				}
				if (!item.hasAmount) continue;
				const take = Math.min(entry.remaining, item.high);
				if (take <= 0) continue;
				entry.remaining -= take;
				item.low = Math.max(0, item.low - take);
				item.high = Math.max(0, item.high - take);
				reduced.add(item);
				if (item.high <= 1e-9) {
					covered = true;
					break;
				}
			}
			if (covered) break;
		}

		if (covered) {
			reduced.delete(item);
			stocked.push(item);
		} else {
			needed.push(item);
		}
	}

	return { needed, stocked, reduced };
}
