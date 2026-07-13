import { Modal, Notice, TFile, normalizePath } from "obsidian";
import {
	AggregatedItem,
	CombinedItem,
	RecipeSelection,
	aggregateIngredients,
	renderCombinedItem,
} from "./combine";
import { aggregatedFactor, findIngredientData } from "./ingredient-data";
import { applyPantry, buildPantry } from "./pantry";
import { formatQuantity } from "./units";
import {
	ensureParentFolder,
	getRecipeFiles,
	loadIngredientDataIndex,
	loadPantryIngredients,
	loadRecipe,
} from "./recipes";
import type RecipeManagerPlugin from "./main";

const MULT_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];

interface Row {
	file: TFile;
	checked: boolean;
	multiplier: number;
}

/** Pick recipes + a multiplier for each, then write a consolidated grocery list note. */
export class GroceryModal extends Modal {
	private rows: Row[] = [];
	private listEl!: HTMLElement;
	private filter = "";

	constructor(private plugin: RecipeManagerPlugin) {
		super(plugin.app);
	}

	onOpen(): void {
		this.titleEl.setText("Build grocery list");
		this.modalEl.addClass("rcpm-grocery-modal");

		const files = getRecipeFiles(this.app, this.plugin.settings);
		this.rows = files.map((file) => ({ file, checked: false, multiplier: 1 }));

		if (this.rows.length === 0) {
			this.contentEl.createEl("p", {
				text: `No recipes found. Put recipes in "${this.plugin.settings.recipesFolder}" or tag them with #${this.plugin.settings.recipeTag}.`,
			});
			return;
		}

		const search = this.contentEl.createEl("input", {
			type: "search",
			cls: "rcpm-search",
			attr: { placeholder: "Filter recipes…" },
		});
		search.addEventListener("input", () => {
			this.filter = search.value.toLowerCase();
			this.renderList();
		});

		this.listEl = this.contentEl.createDiv("rcpm-recipe-list");
		this.renderList();

		const pantryRow = this.contentEl.createDiv("rcpm-pantry-row");
		const pantryToggle = pantryRow.createEl("input", {
			type: "checkbox",
			attr: { id: "rcpm-pantry-toggle" },
		});
		pantryToggle.checked = this.plugin.settings.usePantry;
		pantryToggle.addEventListener("change", () => {
			this.plugin.settings.usePantry = pantryToggle.checked;
			void this.plugin.saveSettings();
		});
		pantryRow.createEl("label", {
			text: `Subtract pantry stock (${this.plugin.settings.pantryPath})`,
			attr: { for: "rcpm-pantry-toggle" },
		});

		const footer = this.contentEl.createDiv("rcpm-grocery-footer");
		const generate = footer.createEl("button", {
			text: "Generate grocery list",
			cls: "mod-cta rcpm-generate",
		});
		generate.addEventListener("click", () => void this.generate());
	}

	private renderList(): void {
		this.listEl.empty();
		for (const row of this.rows) {
			if (this.filter && !row.file.basename.toLowerCase().includes(this.filter)) continue;

			const rowEl = this.listEl.createDiv("rcpm-recipe-row");

			const checkbox = rowEl.createEl("input", { type: "checkbox" });
			checkbox.checked = row.checked;
			checkbox.addEventListener("change", () => {
				row.checked = checkbox.checked;
			});

			const name = rowEl.createSpan({ text: row.file.basename, cls: "rcpm-recipe-name" });
			name.addEventListener("click", () => {
				row.checked = !row.checked;
				checkbox.checked = row.checked;
			});

			const stepper = rowEl.createDiv("rcpm-row-stepper");
			const minus = stepper.createEl("button", {
				text: "−",
				cls: "rcpm-btn rcpm-btn-sm",
				attr: { "aria-label": `Less ${row.file.basename}` },
			});
			const value = stepper.createSpan({
				text: `${formatQuantity(row.multiplier, false)}×`,
				cls: "rcpm-row-mult",
			});
			const plus = stepper.createEl("button", {
				text: "+",
				cls: "rcpm-btn rcpm-btn-sm",
				attr: { "aria-label": `More ${row.file.basename}` },
			});

			const update = (mult: number) => {
				row.multiplier = mult;
				row.checked = true;
				checkbox.checked = true;
				value.setText(`${formatQuantity(mult, false)}×`);
			};
			minus.addEventListener("click", () => {
				const prev = [...MULT_STEPS].reverse().find((s) => s < row.multiplier - 1e-9);
				if (prev != null) update(prev);
			});
			plus.addEventListener("click", () => {
				const next = MULT_STEPS.find((s) => s > row.multiplier + 1e-9);
				update(next ?? row.multiplier + 1);
			});
		}
	}

	private async generate(): Promise<void> {
		const picked = this.rows.filter((r) => r.checked);
		if (picked.length === 0) {
			new Notice("Select at least one recipe.");
			return;
		}

		const selections: RecipeSelection[] = [];
		for (const row of picked) {
			const recipe = await loadRecipe(this.app, row.file);
			if (!recipe) {
				new Notice(`Skipped "${row.file.basename}" — no recipe-ingredients block found.`);
				continue;
			}
			selections.push({
				name: recipe.name,
				multiplier: row.multiplier,
				ingredients: recipe.ingredients,
			});
		}
		if (selections.length === 0) return;

		const markdown = await buildGroceryMarkdown(this.plugin, selections);
		this.close();
		await writeGroceryList(this.plugin, markdown, selections);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Aggregate → pantry cross-check → cost estimate → markdown checklist. */
export async function buildGroceryMarkdown(
	plugin: RecipeManagerPlugin,
	selections: RecipeSelection[]
): Promise<string> {
	const { settings } = plugin;
	let needed = aggregateIngredients(selections);
	let stocked: AggregatedItem[] = [];

	if (settings.usePantry) {
		const pantryIngredients = await loadPantryIngredients(plugin.app, settings);
		if (pantryIngredients == null) {
			new Notice(`Pantry note "${settings.pantryPath}" not found — skipping pantry check.`);
		} else {
			const result = applyPantry(needed, buildPantry(pantryIngredients));
			needed = result.needed;
			stocked = result.stocked;
			for (const item of result.reduced) item.sources.push("after pantry");
		}
	}

	const dataIndex = settings.groceryShowCosts
		? await loadIngredientDataIndex(plugin.app, settings)
		: null;
	const currency = settings.currency || "$";

	const pairs = needed
		.map((agg) => ({ agg, item: renderCombinedItem(agg, settings.groceryFractions) }))
		.sort((a, b) => a.item.name.localeCompare(b.item.name));

	let total = 0;
	let pricedCount = 0;
	const lines = pairs.map(({ agg, item }) => {
		let line = itemLine(item, settings.groceryShowSources);
		if (dataIndex) {
			const data = findIngredientData(dataIndex, agg.displayName);
			const factor = data?.cost != null ? aggregatedFactor(agg, data) : null;
			if (data?.cost != null && factor != null) {
				const cost = data.cost * factor;
				total += cost;
				pricedCount++;
				line += ` — ~${currency}${cost.toFixed(2)}`;
			}
		}
		return line;
	});

	let markdown = lines.join("\n");

	if (stocked.length > 0) {
		const stockedLines = stocked
			.map((item) => `- [x] ${item.displayName} *(already stocked)*`)
			.sort((a, b) => a.localeCompare(b));
		markdown += `\n\n### Already stocked\n\n${stockedLines.join("\n")}`;
	}

	if (pricedCount > 0) {
		markdown += `\n\n**Estimated cost: ~${currency}${total.toFixed(2)}**`;
		if (pricedCount < pairs.length) {
			markdown += ` *(${pricedCount} of ${pairs.length} items priced)*`;
		}
	}

	return markdown;
}

function itemLine(item: CombinedItem, showSources: boolean): string {
	let line = "- [ ] ";
	if (item.amountText) line += `**${item.amountText}** `;
	line += item.name;
	if (item.toTaste) line += " — to taste";
	if (showSources && item.sources.length) {
		line += ` *(${item.sources.join("; ")})*`;
	}
	return line;
}

/** Write (or append) the grocery list note and open it. */
export async function writeGroceryList(
	plugin: RecipeManagerPlugin,
	markdown: string,
	selections: RecipeSelection[]
): Promise<void> {
	const { app, settings } = plugin;
	let path = normalizePath(settings.groceryListPath || "Grocery List.md");
	if (!path.toLowerCase().endsWith(".md")) path += ".md";

	const date = new Date().toISOString().slice(0, 10);
	const recipeNames = selections
		.map((s) => (Math.abs(s.multiplier - 1) < 1e-9 ? s.name : `${s.name} ×${s.multiplier}`))
		.join(", ");
	const section = `## Grocery list — ${date}\n\n*Recipes: ${recipeNames}*\n\n${markdown}\n`;

	await ensureParentFolder(app, path);
	const existing = app.vault.getAbstractFileByPath(path);
	let file: TFile;
	if (existing instanceof TFile) {
		if (settings.groceryMode === "append") {
			await app.vault.process(existing, (content) => `${content.replace(/\s+$/, "")}\n\n${section}`);
		} else {
			await app.vault.modify(existing, section);
		}
		file = existing;
	} else {
		file = await app.vault.create(path, section);
	}

	await app.workspace.getLeaf(false).openFile(file);
	new Notice("Grocery list ready.");
}
