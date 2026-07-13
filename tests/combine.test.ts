import { describe, expect, it } from "vitest";
import { combineIngredients, groceryListMarkdown } from "../src/combine";
import { parseIngredients } from "../src/parse";

function selection(name: string, multiplier: number, lines: string[]) {
	return { name, multiplier, ingredients: parseIngredients(lines.join("\n")) };
}

describe("combineIngredients", () => {
	it("sums compatible volume units and normalizes", () => {
		const items = combineIngredients(
			[
				selection("Pancakes", 1, ["1 cup flour"]),
				selection("Waffles", 1, ["8 tbsp flour"]),
			],
			true
		);
		expect(items).toHaveLength(1);
		expect(items[0].amountText).toBe("1 1/2 cups");
		expect(items[0].name).toBe("flour");
		expect(items[0].sources).toEqual(["Pancakes", "Waffles"]);
	});

	it("applies per-recipe multipliers", () => {
		const items = combineIngredients(
			[selection("Pancakes", 2, ["1 cup milk"])],
			true
		);
		expect(items[0].amountText).toBe("2 cups");
		expect(items[0].sources).toEqual(["Pancakes ×2"]);
	});

	it("merges singular and plural names", () => {
		const items = combineIngredients(
			[
				selection("A", 1, ["1 onion"]),
				selection("B", 1, ["2 onions"]),
			],
			true
		);
		expect(items).toHaveLength(1);
		expect(items[0].amountText).toBe("3");
		expect(items[0].name).toBe("onions");
	});

	it("keeps incompatible unit families separate", () => {
		const items = combineIngredients(
			[
				selection("A", 1, ["1 cup milk"]),
				selection("B", 1, ["200 g milk"]),
			],
			true
		);
		expect(items).toHaveLength(2);
	});

	it("combines count units only when identical", () => {
		const items = combineIngredients(
			[
				selection("A", 1, ["2 cloves garlic"]),
				selection("B", 1, ["3 cloves garlic"]),
				selection("C", 1, ["1 head garlic"]),
			],
			true
		);
		expect(items).toHaveLength(2);
		const cloves = items.find((i) => i.amountText.includes("cloves"));
		expect(cloves?.amountText).toBe("5 cloves");
	});

	it("prefers the majority measurement system", () => {
		const items = combineIngredients(
			[
				selection("A", 1, ["100 ml cream"]),
				selection("B", 1, ["200 ml cream"]),
				selection("C", 1, ["1 tbsp cream"]),
			],
			true
		);
		expect(items).toHaveLength(1);
		expect(items[0].amountText).toMatch(/ml$/);
	});

	it("merges to-taste entries without amounts", () => {
		const items = combineIngredients(
			[
				selection("A", 1, ["salt, to taste"]),
				selection("B", 3, ["salt, to taste"]),
			],
			true
		);
		expect(items).toHaveLength(1);
		expect(items[0].toTaste).toBe(true);
		expect(items[0].amountText).toBe("");
	});

	it("sums ranges into ranges", () => {
		const items = combineIngredients(
			[
				selection("A", 1, ["2-3 tbsp water"]),
				selection("B", 1, ["1 tbsp water"]),
			],
			true
		);
		expect(items[0].amountText).toBe("3–4 tbsp");
	});
});

describe("groceryListMarkdown", () => {
	it("renders a task list with sources", () => {
		const items = combineIngredients(
			[selection("Pancakes", 1, ["1 cup flour", "salt, to taste"])],
			true
		);
		const md = groceryListMarkdown(items, true);
		expect(md).toContain("- [ ] **1 cup** flour *(Pancakes)*");
		expect(md).toContain("- [ ] salt — to taste *(Pancakes)*");
	});
});
