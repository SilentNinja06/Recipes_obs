import { Modal, Notice, TFile, normalizePath } from "obsidian";
import { RecipeSelection, combineIngredients, groceryListMarkdown } from "./combine";
import { formatQuantity } from "./units";
import { ensureParentFolder, getRecipeFiles, loadRecipe } from "./recipes";
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

		const items = combineIngredients(selections, this.plugin.settings.groceryFractions);
		const markdown = groceryListMarkdown(items, this.plugin.settings.groceryShowSources);
		this.close();
		await writeGroceryList(this.plugin, markdown, selections);
	}

	onClose(): void {
		this.contentEl.empty();
	}
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
