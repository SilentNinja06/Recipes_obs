import { describe, expect, it } from "vitest";
import {
	basisFactor,
	buildDataIndex,
	computeNutrition,
	findIngredientData,
	parseIngredientData,
} from "../src/ingredient-data";
import { parseIngredients, parseLine } from "../src/parse";

const DATA = parseIngredientData(
	[
		"// comment line",
		"all-purpose flour, flour; per 1 cup; kcal 455; protein 13; carbs 95; fat 1.2; cost 0.30",
		"egg, eggs; per 1; kcal 72; protein 6.3; fat 4.8; carbs 0.4; cost 0.35",
		"chicken breast, chicken; per 100 g; kcal 165; protein 31; fat 3.6",
		"garlic; per 1 clove; kcal 4; carbs 1; cost 0.08",
		"butter; per 1 tbsp; kcal 102; fat 11.5",
	].join("\n")
);
const INDEX = buildDataIndex(DATA);

describe("parseIngredientData", () => {
	it("parses names, basis, and fields", () => {
		const flour = DATA[0];
		expect(flour.names).toEqual(["all-purpose flour", "flour"]);
		expect(flour.basisAmount).toBe(1);
		expect(flour.basisUnit?.id).toBe("cup");
		expect(flour.kcal).toBe(455);
		expect(flour.cost).toBeCloseTo(0.3);
	});

	it("parses per-piece and per-weight bases", () => {
		expect(DATA[1].basisUnit).toBeNull();
		expect(DATA[2].basisAmount).toBe(100);
		expect(DATA[2].basisUnit?.id).toBe("g");
	});
});

describe("findIngredientData", () => {
	it("matches aliases and singular/plural", () => {
		expect(findIngredientData(INDEX, "flour")?.kcal).toBe(455);
		expect(findIngredientData(INDEX, "eggs")?.kcal).toBe(72);
	});

	it("drops leading adjectives to find a match", () => {
		expect(findIngredientData(INDEX, "large eggs")?.kcal).toBe(72);
		expect(findIngredientData(INDEX, "boneless chicken breast")?.kcal).toBe(165);
	});

	it("returns null for unknown ingredients", () => {
		expect(findIngredientData(INDEX, "dragon fruit")).toBeNull();
	});
});

describe("basisFactor", () => {
	it("converts within a unit family", () => {
		const ing = parseLine("8 tbsp flour")!; // 8 tbsp = 1/2 cup
		const factor = basisFactor(ing, findIngredientData(INDEX, "flour")!);
		expect(factor).toBeCloseTo(0.5, 2);
	});

	it("matches counts against per-piece bases", () => {
		const eggs = parseLine("3 large eggs")!;
		expect(basisFactor(eggs, findIngredientData(INDEX, "eggs")!)).toBe(3);
		const garlic = parseLine("2 cloves garlic")!;
		expect(basisFactor(garlic, findIngredientData(INDEX, "garlic")!)).toBe(2);
	});

	it("refuses cross-family conversion", () => {
		const ing = parseLine("1 cup chicken breast")!; // data is per 100 g
		expect(basisFactor(ing, findIngredientData(INDEX, "chicken")!)).toBeNull();
	});
});

describe("computeNutrition", () => {
	it("totals matched ingredients and reports unmatched", () => {
		const ingredients = parseIngredients(
			["2 cups flour", "2 eggs", "1 tbsp butter", "1 cup unicorn tears", "salt, to taste"].join("\n")
		);
		const totals = computeNutrition(ingredients, INDEX);
		expect(totals.kcal).toBeCloseTo(455 * 2 + 72 * 2 + 102, 1);
		expect(totals.cost).toBeCloseTo(0.3 * 2 + 0.35 * 2, 2);
		expect(totals.pricedCount).toBe(2); // butter has no cost
		expect(totals.matched).toHaveLength(3);
		expect(totals.unmatched).toEqual(["unicorn tears"]);
	});
});
