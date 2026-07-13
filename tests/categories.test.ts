import { describe, expect, it } from "vitest";
import { categorize, categoryOrder } from "../src/categories";

describe("categorize", () => {
	it("maps type field aliases to canonical categories", () => {
		expect(categorize("entree", []).id).toBe("entree");
		expect(categorize("Entrée", []).id).toBe("entree");
		expect(categorize("main course", []).id).toBe("entree");
		expect(categorize("mains", []).id).toBe("entree");
		expect(categorize("Desserts", []).id).toBe("dessert");
		expect(categorize("side-dish", []).id).toBe("side");
		expect(categorize("dressing", []).id).toBe("sauce");
		expect(categorize("Breakfast", []).label).toBe("Breakfast");
	});

	it("keeps unknown types as custom categories", () => {
		const custom = categorize("fermentation", []);
		expect(custom.id).toBe("custom:fermentation");
		expect(custom.label).toBe("Fermentation");
	});

	it("falls back to tags, including nested tags", () => {
		expect(categorize(undefined, ["#recipe", "#salad"]).id).toBe("salad");
		expect(categorize(undefined, ["#recipe/dessert"]).id).toBe("dessert");
		expect(categorize("", ["#soup"]).id).toBe("soup");
	});

	it("returns Other when nothing matches", () => {
		expect(categorize(undefined, ["#recipe"]).id).toBe("other");
	});
});

describe("categoryOrder", () => {
	it("orders canonical before custom before Other", () => {
		expect(categoryOrder("breakfast")).toBeLessThan(categoryOrder("dessert"));
		expect(categoryOrder("dessert")).toBeLessThan(categoryOrder("custom:fermentation"));
		expect(categoryOrder("custom:fermentation")).toBeLessThan(categoryOrder("other"));
	});
});
