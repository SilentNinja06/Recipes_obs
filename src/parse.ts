/**
 * Parser for `recipe-ingredients` code blocks.
 * Pure module — no Obsidian imports, so it is unit-testable in Node.
 *
 * Line grammar (all parts after the amount are optional):
 *
 *   [amount] [unit] [of] name [, note]
 *
 *   2 cups all-purpose flour
 *   1 1/2 tbsp olive oil, extra virgin
 *   ½ cup milk
 *   2-3 tbsp water
 *   3 cloves garlic, minced
 *   2 large eggs
 *   salt, to taste
 *   # Sauce          ← section header
 *   // comment       ← ignored
 */

import { Amount, UnitDef, lookupUnit } from "./units";

export interface Ingredient {
	raw: string;
	section: string | null;
	amount: Amount | null;
	unit: UnitDef | null;
	name: string;
	note: string | null;
	toTaste: boolean;
}

const UNICODE_FRACTIONS: Record<string, number> = {
	"¼": 1 / 4,
	"½": 1 / 2,
	"¾": 3 / 4,
	"⅓": 1 / 3,
	"⅔": 2 / 3,
	"⅕": 1 / 5,
	"⅖": 2 / 5,
	"⅗": 3 / 5,
	"⅘": 4 / 5,
	"⅙": 1 / 6,
	"⅚": 5 / 6,
	"⅐": 1 / 7,
	"⅛": 1 / 8,
	"⅜": 3 / 8,
	"⅝": 5 / 8,
	"⅞": 7 / 8,
	"⅑": 1 / 9,
	"⅒": 1 / 10,
};

const UNICODE_CLASS = `[${Object.keys(UNICODE_FRACTIONS).join("")}]`;

function readNumber(s: string): { value: number; rest: string } | null {
	// Spelled-out mixed number: "1 and 1/2", "1 & ½"
	const withAnd = s.match(/^(\d+)\s+(?:and|&)\s+/i);
	if (withAnd) {
		const tail = s.slice(withAnd[0].length);
		let f = tail.match(/^(\d+)\s*\/\s*(\d+)/);
		if (f) {
			return {
				value: Number(withAnd[1]) + Number(f[1]) / Number(f[2]),
				rest: tail.slice(f[0].length),
			};
		}
		f = tail.match(new RegExp(`^(${UNICODE_CLASS})`));
		if (f) {
			return {
				value: Number(withAnd[1]) + UNICODE_FRACTIONS[f[1]],
				rest: tail.slice(f[0].length),
			};
		}
	}
	// Mixed number: "1 1/2"
	let m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
	if (m) {
		return { value: Number(m[1]) + Number(m[2]) / Number(m[3]), rest: s.slice(m[0].length) };
	}
	// Simple fraction: "1/2"
	m = s.match(/^(\d+)\s*\/\s*(\d+)/);
	if (m) {
		return { value: Number(m[1]) / Number(m[2]), rest: s.slice(m[0].length) };
	}
	// Unicode fraction, optionally with a leading whole part: "½", "1½", "1 ½"
	m = s.match(new RegExp(`^(\\d+)?\\s*(${UNICODE_CLASS})`));
	if (m) {
		const whole = m[1] ? Number(m[1]) : 0;
		return { value: whole + UNICODE_FRACTIONS[m[2]], rest: s.slice(m[0].length) };
	}
	// Decimal or integer: "1.5", "1,5", "400"
	m = s.match(/^(\d+[.,]\d+|\d+)/);
	if (m) {
		return { value: parseFloat(m[1].replace(",", ".")), rest: s.slice(m[0].length) };
	}
	return null;
}

function readAmount(s: string): { amount: Amount; rest: string } | null {
	const first = readNumber(s);
	if (!first) return null;
	// Range: "2-3", "2 – 3", "2 to 3"
	const range = first.rest.match(/^\s*(?:[-–—]|to\s)\s*/);
	if (range) {
		const second = readNumber(first.rest.slice(range[0].length));
		if (second) {
			return { amount: { low: first.value, high: second.value }, rest: second.rest };
		}
	}
	return { amount: { low: first.value, high: null }, rest: first.rest };
}

function readUnit(s: string): { unit: UnitDef; rest: string } | null {
	// Two-word units first ("fl oz", "fluid ounces")
	const two = s.match(/^([A-Za-z]+\.?[ \t]+[A-Za-z]+)\.?(?=[\s,]|$)/);
	if (two) {
		const unit = lookupUnit(two[1]);
		if (unit) return { unit, rest: s.slice(two[0].length) };
	}
	const one = s.match(/^([A-Za-z]+)\.?(?=[\s,]|$)/);
	if (one) {
		const unit = lookupUnit(one[1]);
		if (unit) return { unit, rest: s.slice(one[0].length) };
	}
	return null;
}

const TO_TASTE = /\bto taste\b/i;

/** Parse a single ingredient line. Returns null for blank lines. */
export function parseLine(rawLine: string, section: string | null = null): Ingredient | null {
	const raw = rawLine.trim();
	if (!raw) return null;
	// Allow (and strip) markdown list bullets so pasted lists still parse.
	let rest = raw.replace(/^[-*+]\s+/, "");

	let amount: Amount | null = null;
	let unit: UnitDef | null = null;

	const a = readAmount(rest);
	if (a) {
		amount = a.amount;
		rest = a.rest.replace(/^\s+/, "");
		const u = readUnit(rest);
		if (u) {
			unit = u.unit;
			rest = u.rest.replace(/^\s+/, "");
		}
		rest = rest.replace(/^of\s+/i, "");
	}

	let name = rest.trim();
	let note: string | null = null;
	const comma = name.indexOf(",");
	if (comma >= 0) {
		note = name.slice(comma + 1).trim() || null;
		name = name.slice(0, comma).trim();
	}

	let toTaste = false;
	if (note && TO_TASTE.test(note)) {
		toTaste = true;
		const stripped = note.replace(TO_TASTE, "").replace(/^[\s,]+|[\s,]+$/g, "");
		note = stripped || null;
	} else if (TO_TASTE.test(name)) {
		toTaste = true;
		name = name.replace(TO_TASTE, "").replace(/^[\s,]+|[\s,]+$/g, "");
	}

	if (!name && note) {
		name = note;
		note = null;
	}

	return { raw, section, amount, unit, name, note, toTaste };
}

/** Parse the body of a `recipe-ingredients` code block. */
export function parseIngredients(source: string): Ingredient[] {
	const out: Ingredient[] = [];
	let section: string | null = null;
	for (const line of source.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (trimmed.startsWith("//")) continue;
		const header = trimmed.match(/^#+\s*(.+)$/);
		if (header) {
			section = header[1].trim();
			continue;
		}
		const ing = parseLine(trimmed, section);
		if (ing) out.push(ing);
	}
	return out;
}

/** Parse a bare "amount + unit" phrase like "1 cup" or "100 g" (used by data notes). */
export function parseMeasure(text: string): { amount: Amount | null; unit: UnitDef | null; rest: string } {
	let rest = text.trim();
	let amount: Amount | null = null;
	let unit: UnitDef | null = null;
	const a = readAmount(rest);
	if (a) {
		amount = a.amount;
		rest = a.rest.replace(/^\s+/, "");
	}
	const u = readUnit(rest);
	if (u) {
		unit = u.unit;
		rest = u.rest.replace(/^\s+/, "");
	}
	return { amount, unit, rest };
}

/** Extract the bodies of all fenced code blocks with the given language tag (empty blocks included). */
export function extractBlocks(content: string, lang: string): string[] {
	const blocks: string[] = [];
	const re = new RegExp(
		`^[ \\t]*(?:\`\`\`+|~~~+)[ \\t]*${lang}[^\\n]*\\n([\\s\\S]*?)^[ \\t]*(?:\`\`\`+|~~~+)[ \\t]*$`,
		"gm"
	);
	let m: RegExpExecArray | null;
	while ((m = re.exec(content)) !== null) {
		blocks.push(m[1].replace(/\r?\n$/, ""));
	}
	return blocks;
}

/** Extract the bodies of all `recipe-ingredients` code blocks in a note. */
export function extractIngredientBlocks(content: string): string[] {
	return extractBlocks(content, "recipe-ingredients");
}
