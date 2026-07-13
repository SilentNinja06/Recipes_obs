import { describe, expect, it } from "vitest";
import { formatAmount, formatQuantity, lookupUnit, normalizeBase, unitById } from "../src/units";

describe("formatQuantity", () => {
	it("renders decimals when fractions are off", () => {
		expect(formatQuantity(0.25, false)).toBe("0.25");
		expect(formatQuantity(2, false)).toBe("2");
		expect(formatQuantity(2.5, false)).toBe("2.5");
		expect(formatQuantity(0.667, false)).toBe("0.67");
	});

	it("renders kitchen fractions when on", () => {
		expect(formatQuantity(0.25, true)).toBe("1/4");
		expect(formatQuantity(0.667, true)).toBe("2/3");
		expect(formatQuantity(1.5, true)).toBe("1 1/2");
		expect(formatQuantity(2.25, true)).toBe("2 1/4");
		expect(formatQuantity(3, true)).toBe("3");
	});

	it("falls back to decimals for awkward values", () => {
		expect(formatQuantity(0.43, true)).toBe("0.43");
	});
});

describe("formatAmount", () => {
	it("scales and formats ranges", () => {
		expect(formatAmount({ low: 2, high: 3 }, 2, false)).toBe("4–6");
		expect(formatAmount({ low: 0.5, high: null }, 0.5, true)).toBe("1/4");
	});
});

describe("lookupUnit", () => {
	it("resolves aliases, plurals and periods", () => {
		expect(lookupUnit("cups")?.id).toBe("cup");
		expect(lookupUnit("Tablespoons")?.id).toBe("tbsp");
		expect(lookupUnit("tbsp.")?.id).toBe("tbsp");
		expect(lookupUnit("grams")?.id).toBe("g");
		expect(lookupUnit("cloves")?.id).toBe("clove");
		expect(lookupUnit("banana")).toBeNull();
	});
});

describe("normalizeBase", () => {
	it("normalizes 12 tsp to 1/4 cup", () => {
		const base = 12 * unitById("tsp").toBase;
		const norm = normalizeBase(base, "volume", "us");
		expect(norm.unit.id).toBe("cup");
		expect(formatQuantity(norm.value, true)).toBe("1/4");
	});

	it("uses spoons below a quarter cup", () => {
		const base = 2 * unitById("tbsp").toBase;
		const norm = normalizeBase(base, "volume", "us");
		expect(norm.unit.id).toBe("tbsp");
		expect(norm.value).toBeCloseTo(2);
	});

	it("normalizes metric volume and weight", () => {
		expect(normalizeBase(1500, "volume", "metric").unit.id).toBe("l");
		expect(normalizeBase(250, "volume", "metric").unit.id).toBe("ml");
		expect(normalizeBase(1200, "weight", "metric").unit.id).toBe("kg");
		expect(normalizeBase(500, "weight", "metric").unit.id).toBe("g");
	});

	it("normalizes US weight", () => {
		const norm = normalizeBase(24 * unitById("oz").toBase, "weight", "us");
		expect(norm.unit.id).toBe("lb");
		expect(norm.value).toBeCloseTo(1.5);
	});
});
