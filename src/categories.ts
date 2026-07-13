/**
 * Recipe categories for the dashboard.
 * Pure module — no Obsidian imports, so it is unit-testable in Node.
 *
 * A recipe's category comes from its `type` frontmatter field first, then
 * from its tags. Unknown `type` values become custom categories so users can
 * invent their own; recipes with no recognizable type land in "Other".
 */

export interface Category {
	id: string;
	label: string;
	aliases: string[];
}

export const CATEGORIES: Category[] = [
	{ id: "breakfast", label: "Breakfast", aliases: ["breakfast", "brunch", "breakfast item"] },
	{ id: "appetizer", label: "Appetizers", aliases: ["appetizer", "starter", "app", "hors doeuvre", "antipasto"] },
	{ id: "soup", label: "Soups", aliases: ["soup", "stew", "chili", "broth"] },
	{ id: "salad", label: "Salads", aliases: ["salad"] },
	{ id: "entree", label: "Entrées", aliases: ["entree", "entrée", "main", "main course", "main dish", "dinner"] },
	{ id: "side", label: "Sides", aliases: ["side", "side dish"] },
	{ id: "sauce", label: "Sauces", aliases: ["sauce", "condiment", "dressing", "marinade", "dip", "salsa"] },
	{ id: "bread", label: "Breads & Baking", aliases: ["bread", "baking", "baked good", "pastry", "dough"] },
	{ id: "dessert", label: "Desserts", aliases: ["dessert", "sweet", "cake", "cookie", "pie"] },
	{ id: "drink", label: "Drinks", aliases: ["drink", "beverage", "cocktail", "smoothie", "juice"] },
	{ id: "snack", label: "Snacks", aliases: ["snack"] },
];

export const OTHER_CATEGORY: { id: string; label: string } = { id: "other", label: "Other" };

function normalizeAlias(value: string): string {
	let key = value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[-_/]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (key.length > 3 && key.endsWith("s") && !key.endsWith("ss")) {
		key = key.slice(0, -1);
	}
	return key;
}

const ALIAS_TO_ID = new Map<string, string>();
for (const cat of CATEGORIES) {
	for (const alias of [cat.id, cat.label, ...cat.aliases]) {
		ALIAS_TO_ID.set(normalizeAlias(alias), cat.id);
	}
}

const LABEL_BY_ID = new Map<string, string>(CATEGORIES.map((c) => [c.id, c.label]));

function titleCase(value: string): string {
	return value.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Determine the category of a recipe from its `type` frontmatter field and
 * tags. A `type` value that isn't a known category becomes its own custom
 * category (id `custom:<key>`), so user-invented types get their own chip.
 */
export function categorize(typeField: unknown, tags: string[]): { id: string; label: string } {
	if (typeof typeField === "string" && typeField.trim()) {
		const key = normalizeAlias(typeField);
		const known = ALIAS_TO_ID.get(key);
		if (known) return { id: known, label: LABEL_BY_ID.get(known)! };
		return { id: `custom:${key}`, label: titleCase(key) };
	}
	for (const tag of tags) {
		// Match "#dessert" and nested tags like "#recipe/dessert".
		for (const part of tag.replace(/^#/, "").split("/")) {
			const known = ALIAS_TO_ID.get(normalizeAlias(part));
			if (known) return { id: known, label: LABEL_BY_ID.get(known)! };
		}
	}
	return { ...OTHER_CATEGORY };
}

/** Sort key: canonical categories in listed order, then custom ones, then Other. */
export function categoryOrder(id: string): number {
	const idx = CATEGORIES.findIndex((c) => c.id === id);
	if (idx >= 0) return idx;
	if (id === OTHER_CATEGORY.id) return 10_000;
	return 1000; // custom categories between canonical and Other (ties broken by label)
}
