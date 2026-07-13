import { Modal, Notice, TFile, normalizePath } from "obsidian";
import { NutritionTotals, computeNutrition } from "./ingredient-data";
import { ensureParentFolder, loadIngredientDataIndex, loadRecipe } from "./recipes";
import { formatQuantity } from "./units";
import type RecipeManagerPlugin from "./main";

function round1(value: number): number {
	return Math.round(value * 10) / 10;
}

function money(value: number, currency: string): string {
	return `${currency}${value.toFixed(2)}`;
}

interface NutritionRow {
	label: string;
	total: string;
	perServing: string;
}

function buildRows(totals: NutritionTotals, servings: number | null, currency: string): NutritionRow[] {
	const per = (value: number) => (servings ? String(round1(value / servings)) : "—");
	const rows: NutritionRow[] = [
		{ label: "Calories", total: String(Math.round(totals.kcal)), perServing: servings ? String(Math.round(totals.kcal / servings)) : "—" },
		{ label: "Protein", total: `${round1(totals.protein)} g`, perServing: `${per(totals.protein)}${servings ? " g" : ""}` },
		{ label: "Carbs", total: `${round1(totals.carbs)} g`, perServing: `${per(totals.carbs)}${servings ? " g" : ""}` },
		{ label: "Fat", total: `${round1(totals.fat)} g`, perServing: `${per(totals.fat)}${servings ? " g" : ""}` },
	];
	if (totals.pricedCount > 0) {
		rows.push({
			label: "Est. cost",
			total: money(totals.cost, currency),
			perServing: servings ? money(totals.cost / servings, currency) : "—",
		});
	}
	return rows;
}

function rowsToMarkdown(title: string, rows: NutritionRow[], servings: number | null, unmatched: string[]): string {
	const lines = [
		`### Nutrition — ${title}`,
		"",
		`| | Total | ${servings ? `Per serving (of ${formatQuantity(servings, false)})` : "Per serving"} |`,
		"| --- | --- | --- |",
		...rows.map((r) => `| ${r.label} | ${r.total} | ${r.perServing} |`),
	];
	if (unmatched.length) {
		lines.push("", `*No data for: ${unmatched.join(", ")}*`);
	}
	return lines.join("\n");
}

/** Shows estimated nutrition + cost for one recipe, per total and per serving. */
export class NutritionModal extends Modal {
	constructor(private plugin: RecipeManagerPlugin, private file: TFile) {
		super(plugin.app);
	}

	async onOpen(): Promise<void> {
		this.modalEl.addClass("rcpm-nutrition-modal");
		const recipe = await loadRecipe(this.app, this.file);
		if (!recipe) {
			this.titleEl.setText("Nutrition");
			this.contentEl.createEl("p", { text: "No recipe-ingredients block in this note." });
			return;
		}
		this.titleEl.setText(`Nutrition — ${recipe.name}`);

		const index = await loadIngredientDataIndex(this.app, this.plugin.settings);
		if (!index) {
			this.contentEl.createEl("p", {
				text: `No ingredient data note found at "${this.plugin.settings.ingredientDataPath}".`,
			});
			const btn = this.contentEl.createEl("button", {
				text: "Create ingredient data note",
				cls: "mod-cta",
			});
			btn.addEventListener("click", () => {
				this.close();
				void openIngredientDataNote(this.plugin);
			});
			return;
		}

		const totals = computeNutrition(recipe.ingredients, index);
		if (totals.matched.length === 0) {
			this.contentEl.createEl("p", {
				text: "None of this recipe's ingredients matched the data note. Add entries for them and try again.",
			});
			if (totals.unmatched.length) {
				this.contentEl.createEl("p", {
					text: `Missing: ${totals.unmatched.join(", ")}`,
					cls: "rcpm-note",
				});
			}
			return;
		}

		const currency = this.plugin.settings.currency || "$";
		const rows = buildRows(totals, recipe.servings, currency);

		const table = this.contentEl.createEl("table", { cls: "rcpm-nutrition-table" });
		const head = table.createEl("tr");
		head.createEl("th", { text: "" });
		head.createEl("th", { text: "Total" });
		head.createEl("th", {
			text: recipe.servings ? `Per serving (of ${formatQuantity(recipe.servings, false)})` : "Per serving",
		});
		for (const row of rows) {
			const tr = table.createEl("tr");
			tr.createEl("td", { text: row.label });
			tr.createEl("td", { text: row.total });
			tr.createEl("td", { text: row.perServing });
		}

		this.contentEl.createEl("p", {
			text: `Matched ${totals.matched.length} of ${totals.matched.length + totals.unmatched.length} ingredients.`,
			cls: "rcpm-note",
		});
		if (totals.unmatched.length) {
			this.contentEl.createEl("p", {
				text: `No data for: ${totals.unmatched.join(", ")}`,
				cls: "rcpm-note",
			});
		}

		const buttons = this.contentEl.createDiv("rcpm-prompt-buttons");
		const copy = buttons.createEl("button", { text: "Copy as Markdown", cls: "mod-cta" });
		copy.addEventListener("click", async () => {
			await navigator.clipboard.writeText(
				rowsToMarkdown(recipe.name, rows, recipe.servings, totals.unmatched)
			);
			new Notice("Copied nutrition table.");
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Starter ingredient data. Nutrient values are approximate (USDA-style) and
 * per the stated basis; costs are examples the user should adjust.
 */
const STARTER_DATA = `---
tags: [recipe-data]
---

# Ingredient data

Reference data for **Recipe Manager** nutrition and cost estimates. One
ingredient per line inside the block below:

\`name, alias…; per <amount> [unit]; kcal <n>; protein <n>; carbs <n>; fat <n>; cost <n>\`

Nutrients and cost are *per the stated basis* (e.g. per 1 cup). Cost is in
your own currency — the starter values below are rough placeholders, so
adjust them to your store's prices or delete them. Lines starting with
\`//\` are comments.

\`\`\`recipe-ingredient-data
// Baking & dry goods
all-purpose flour, flour; per 1 cup; kcal 455; protein 13; carbs 95; fat 1.2; cost 0.30
sugar, granulated sugar; per 1 cup; kcal 774; carbs 200; cost 0.40
brown sugar; per 1 cup; kcal 829; carbs 214; cost 0.50
baking powder; per 1 tsp; kcal 2; carbs 1.1
baking soda; per 1 tsp; kcal 0
vanilla extract; per 1 tsp; kcal 12; carbs 0.5; cost 0.35
rolled oats, oats; per 1 cup; kcal 307; protein 11; carbs 55; fat 5.3; cost 0.35
chocolate chips; per 1 cup; kcal 805; carbs 106; fat 50; cost 2.50
walnuts, chopped walnuts; per 1 cup; kcal 765; protein 18; carbs 16; fat 76; cost 3.00
rice, white rice; per 1 cup; kcal 675; protein 13; carbs 148; fat 1.2; cost 0.60
pasta, spaghetti; per 100 g; kcal 371; protein 13; carbs 75; fat 1.5; cost 0.45

// Dairy & eggs
butter; per 1 tbsp; kcal 102; protein 0.1; carbs 0; fat 11.5; cost 0.15
milk; per 1 cup; kcal 103; protein 8; carbs 12; fat 2.4; cost 0.25
heavy cream, cream; per 1 tbsp; kcal 51; fat 5.4; cost 0.20
cream cheese; per 1 tbsp; kcal 51; protein 0.9; fat 5; cost 0.20
cheddar cheese, cheddar; per 100 g; kcal 403; protein 25; carbs 1.3; fat 33; cost 1.20
parmesan; per 1 tbsp; kcal 21; protein 1.4; fat 1.4; cost 0.25
greek yogurt, yogurt; per 1 cup; kcal 146; protein 20; carbs 8; fat 4; cost 1.10
egg, eggs, large egg, large eggs; per 1; kcal 72; protein 6.3; carbs 0.4; fat 4.8; cost 0.35

// Oils & condiments
olive oil; per 1 tbsp; kcal 119; fat 13.5; cost 0.25
vegetable oil, canola oil; per 1 tbsp; kcal 124; fat 14; cost 0.10
honey; per 1 tbsp; kcal 64; carbs 17; cost 0.30
maple syrup; per 1 tbsp; kcal 52; carbs 13; cost 0.45
soy sauce; per 1 tbsp; kcal 9; protein 1.3; carbs 0.8; cost 0.10
lemon juice; per 1 tbsp; kcal 3; carbs 1; cost 0.15

// Produce
garlic; per 1 clove; kcal 4; carbs 1; cost 0.08
onion, onions, yellow onion; per 1; kcal 44; protein 1.2; carbs 10; cost 0.60
tomato, tomatoes; per 1; kcal 22; carbs 4.8; cost 0.70
canned tomatoes, crushed tomatoes; per 100 g; kcal 32; carbs 7; cost 0.40
potato, potatoes; per 1; kcal 163; protein 4.3; carbs 37; cost 0.50
carrot, carrots; per 1; kcal 25; carbs 6; cost 0.20
spinach; per 100 g; kcal 23; protein 2.9; carbs 3.6; cost 1.00
blueberries; per 1 cup; kcal 84; carbs 21; cost 2.50
banana, bananas; per 1; kcal 105; carbs 27; cost 0.30
basil, basil leaves; per 1 cup; kcal 6; carbs 0.6; cost 1.50

// Proteins
chicken breast, chicken; per 100 g; kcal 165; protein 31; fat 3.6; cost 1.10
ground beef, beef; per 100 g; kcal 250; protein 26; fat 15; cost 1.30
bacon; per 1 slice; kcal 43; protein 3; fat 3.3; cost 0.50

// Seasoning (effectively zero-calorie at recipe scale)
salt; per 1 tsp; kcal 0; cost 0.01
black pepper, pepper; per 1 tsp; kcal 6; carbs 1.5; cost 0.05
red pepper flakes; per 1 tsp; kcal 6; carbs 1; cost 0.05
\`\`\`
`;

/** Open the ingredient data note, scaffolding it with starter data if missing. */
export async function openIngredientDataNote(plugin: RecipeManagerPlugin): Promise<void> {
	const { app, settings } = plugin;
	let path = normalizePath(settings.ingredientDataPath || "Recipe Ingredient Data.md");
	if (!path.toLowerCase().endsWith(".md")) path += ".md";

	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		await app.workspace.getLeaf(false).openFile(existing);
		return;
	}
	await ensureParentFolder(app, path);
	const file = await app.vault.create(path, STARTER_DATA);
	await app.workspace.getLeaf(false).openFile(file);
	new Notice("Created ingredient data note with starter values — adjust costs to your store.");
}
