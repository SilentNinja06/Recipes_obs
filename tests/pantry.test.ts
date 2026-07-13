import { describe, expect, it } from "vitest";
import { aggregateIngredients } from "../src/combine";
import { applyPantry, buildPantry } from "../src/pantry";
import { parseIngredients } from "../src/parse";

function aggregate(lines: string[]) {
	return aggregateIngredients([
		{ name: "Test", multiplier: 1, ingredients: parseIngredients(lines.join("\n")) },
	]);
}

function pantryOf(lines: string[]) {
	return buildPantry(parseIngredients(lines.join("\n")));
}

describe("applyPantry", () => {
	it("fully covers items with enough stock", () => {
		const items = aggregate(["1 cup flour"]);
		const { needed, stocked } = applyPantry(items, pantryOf(["2 cups flour"]));
		expect(needed).toHaveLength(0);
		expect(stocked).toHaveLength(1);
	});

	it("reduces partially covered items", () => {
		const items = aggregate(["2 cups flour"]);
		const { needed, stocked, reduced } = applyPantry(items, pantryOf(["1 cup flour"]));
		expect(stocked).toHaveLength(0);
		expect(needed).toHaveLength(1);
		expect(reduced.has(needed[0])).toBe(true);
		// 1 cup remains, in ml base units
		expect(needed[0].low).toBeCloseTo(236.588, 1);
	});

	it("converts within the family when subtracting", () => {
		const items = aggregate(["4 tbsp butter"]);
		const { needed, stocked } = applyPantry(items, pantryOf(["1 cup butter"]));
		expect(needed).toHaveLength(0);
		expect(stocked).toHaveLength(1);
	});

	it("bare pantry lines cover everything with that name", () => {
		const items = aggregate(["2 tbsp soy sauce", "salt, to taste"]);
		const { needed, stocked } = applyPantry(items, pantryOf(["soy sauce", "salt"]));
		expect(needed).toHaveLength(0);
		expect(stocked).toHaveLength(2);
	});

	it("does not cover across incompatible units", () => {
		const items = aggregate(["200 g milk"]);
		const { needed, stocked } = applyPantry(items, pantryOf(["1 cup milk"]));
		expect(stocked).toHaveLength(0);
		expect(needed).toHaveLength(1);
	});

	it("consumes stock so items can't double-count it", () => {
		const items = aggregate(["1 cup flour", "1 cup bread flour"]);
		// One cup in the pantry; "bread flour" also matches "flour" via suffix keys.
		const { needed, stocked } = applyPantry(items, pantryOf(["1 cup flour"]));
		expect(stocked).toHaveLength(1);
		expect(needed).toHaveLength(1);
	});

	it("matches pantry entries with adjectives dropped from the item name", () => {
		const items = aggregate(["2 cups all-purpose flour"]);
		const { stocked } = applyPantry(items, pantryOf(["3 cups flour"]));
		expect(stocked).toHaveLength(1);
	});
});
