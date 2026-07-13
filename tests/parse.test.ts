import { describe, expect, it } from "vitest";
import { extractIngredientBlocks, parseIngredients, parseLine } from "../src/parse";

describe("parseLine", () => {
	it("parses amount + unit + name", () => {
		const ing = parseLine("2 cups all-purpose flour")!;
		expect(ing.amount).toEqual({ low: 2, high: null });
		expect(ing.unit?.id).toBe("cup");
		expect(ing.name).toBe("all-purpose flour");
		expect(ing.note).toBeNull();
	});

	it("parses mixed numbers", () => {
		const ing = parseLine("1 1/2 tbsp olive oil, extra virgin")!;
		expect(ing.amount?.low).toBeCloseTo(1.5);
		expect(ing.unit?.id).toBe("tbsp");
		expect(ing.name).toBe("olive oil");
		expect(ing.note).toBe("extra virgin");
	});

	it("parses spelled-out mixed numbers", () => {
		const ing = parseLine("1 and 1/2 cups Freshly grated Parmesan")!;
		expect(ing.amount?.low).toBeCloseTo(1.5);
		expect(ing.unit?.id).toBe("cup");
		expect(ing.name).toBe("Freshly grated Parmesan");
		expect(parseLine("2 and ¾ cups sugar")!.amount?.low).toBeCloseTo(2.75);
		expect(parseLine("1 & 1/4 tsp salt")!.amount?.low).toBeCloseTo(1.25);
	});

	it("parses unicode fractions, alone and attached", () => {
		expect(parseLine("½ cup milk")!.amount?.low).toBeCloseTo(0.5);
		expect(parseLine("1½ cups sugar")!.amount?.low).toBeCloseTo(1.5);
		expect(parseLine("1 ½ cups sugar")!.amount?.low).toBeCloseTo(1.5);
	});

	it("parses simple fractions", () => {
		const ing = parseLine("3/4 tsp baking soda")!;
		expect(ing.amount?.low).toBeCloseTo(0.75);
		expect(ing.unit?.id).toBe("tsp");
	});

	it("parses decimals including comma decimals", () => {
		expect(parseLine("1.5 l water")!.amount?.low).toBeCloseTo(1.5);
		expect(parseLine("1,5 l water")!.amount?.low).toBeCloseTo(1.5);
	});

	it("parses ranges", () => {
		const dash = parseLine("2-3 tbsp water")!;
		expect(dash.amount).toEqual({ low: 2, high: 3 });
		const to = parseLine("2 to 3 tbsp water")!;
		expect(to.amount).toEqual({ low: 2, high: 3 });
	});

	it("parses count units and notes", () => {
		const ing = parseLine("3 cloves garlic, minced")!;
		expect(ing.amount?.low).toBe(3);
		expect(ing.unit?.id).toBe("clove");
		expect(ing.name).toBe("garlic");
		expect(ing.note).toBe("minced");
	});

	it("keeps qualifiers that are not units in the name", () => {
		const ing = parseLine("2 large eggs")!;
		expect(ing.amount?.low).toBe(2);
		expect(ing.unit).toBeNull();
		expect(ing.name).toBe("large eggs");
	});

	it("handles two-word units", () => {
		const ing = parseLine("2 fl oz rum")!;
		expect(ing.unit?.id).toBe("floz");
		expect(ing.name).toBe("rum");
	});

	it("skips 'of' after the unit", () => {
		const ing = parseLine("2 cups of flour")!;
		expect(ing.unit?.id).toBe("cup");
		expect(ing.name).toBe("flour");
	});

	it("detects to-taste lines", () => {
		const ing = parseLine("salt, to taste")!;
		expect(ing.amount).toBeNull();
		expect(ing.name).toBe("salt");
		expect(ing.toTaste).toBe(true);
	});

	it("parses weight units", () => {
		const ing = parseLine("400 g canned tomatoes")!;
		expect(ing.unit?.id).toBe("g");
		expect(ing.unit?.family).toBe("weight");
	});

	it("tolerates markdown bullets", () => {
		const ing = parseLine("- 2 cups flour")!;
		expect(ing.amount?.low).toBe(2);
		expect(ing.name).toBe("flour");
	});
});

describe("parseIngredients", () => {
	it("tracks sections and skips comments/blanks", () => {
		const ings = parseIngredients(
			["2 cups flour", "", "// a comment", "# Sauce", "1 tbsp butter"].join("\n")
		);
		expect(ings).toHaveLength(2);
		expect(ings[0].section).toBeNull();
		expect(ings[1].section).toBe("Sauce");
		expect(ings[1].name).toBe("butter");
	});
});

describe("extractIngredientBlocks", () => {
	it("finds fenced blocks", () => {
		const note = [
			"---",
			"title: Test",
			"---",
			"",
			"```recipe-ingredients",
			"2 cups flour",
			"```",
			"",
			"## Steps",
			"",
			"```recipe-ingredients",
			"1 tsp salt",
			"```",
		].join("\n");
		const blocks = extractIngredientBlocks(note);
		expect(blocks).toEqual(["2 cups flour", "1 tsp salt"]);
	});
});
