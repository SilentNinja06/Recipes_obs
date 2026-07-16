import { Plugin, TFile, moment, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS, RecipeManagerSettingTab, RecipeManagerSettings } from "./settings";
import { IngredientsBlock } from "./render";
import { DashboardBlock } from "./dashboard";
import { GroceryModal } from "./grocery";
import { ShareModal } from "./share";
import { createRecipeIndex } from "./index-note";
import { newRecipeCommand } from "./new-recipe";
import { NutritionModal, openIngredientDataNote } from "./nutrition";
import { addToMealPlanCommand, openRecipeCommand } from "./meal-plan";

export default class RecipeManagerPlugin extends Plugin {
	settings: RecipeManagerSettings = DEFAULT_SETTINGS;

	/**
	 * Read-only API for companion plugins (e.g. the MERIDIAN dashboard).
	 * Consumers check `version` and fall back to reading the vault directly if it
	 * is absent. The grocery/pantry logic itself is untouched.
	 */
	public api = {
		version: 1,
		/** Recipes planned under the meal heading of `date`'s daily note. */
		getPlannedMeals: async (date: string) => {
			const path = this.dailyNotePathFor(date);
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) return [];
			const content = await this.app.vault.cachedRead(file);
			return extractMealLinks(content, this.settings.mealHeading || "Meals");
		},
		/** The current grocery list: checkbox items with their line indices. */
		getGroceryList: async () => {
			let path = normalizePath(this.settings.groceryListPath || "Grocery List.md");
			if (!path.toLowerCase().endsWith(".md")) path += ".md";
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) return { path, exists: false, items: [] };
			const content = await this.app.vault.cachedRead(file);
			const items: Array<{ name: string; checked: boolean; line: number }> = [];
			content.split("\n").forEach((raw, line) => {
				const m = raw.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
				if (m) items.push({ name: m[2].trim(), checked: m[1].toLowerCase() === "x", line });
			});
			return { path, exists: true, items };
		},
		getGroceryListPath: () => this.settings.groceryListPath,
		getMealHeading: () => this.settings.mealHeading || "Meals",
	};

	/** Today's (or `date`'s) daily-note path from the core Daily Notes options. */
	private dailyNotePathFor(date: string): string {
		const options =
			(
				this.app as unknown as {
					internalPlugins?: {
						getPluginById?: (id: string) => { instance?: { options?: { folder?: string; format?: string } } };
					};
				}
			).internalPlugins?.getPluginById?.("daily-notes")?.instance?.options ?? {};
		const folder = (options.folder ?? "").trim().replace(/\/+$/, "");
		const format = (options.format ?? "").trim() || "YYYY-MM-DD";
		const name = moment(date, "YYYY-MM-DD").format(format);
		return normalizePath((folder ? folder + "/" : "") + name + ".md");
	}

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new RecipeManagerSettingTab(this.app, this));

		// Recipes render with no setup: the ingredients block works on open,
		// and scaling / fractions are opt-in taps on top of it.
		this.registerMarkdownCodeBlockProcessor("recipe-ingredients", (source, el, ctx) => {
			ctx.addChild(new IngredientsBlock(el, source, this, ctx));
		});

		// Interactive dashboard: category chips + search, no Dataview needed.
		this.registerMarkdownCodeBlockProcessor("recipe-dashboard", (_source, el, ctx) => {
			ctx.addChild(new DashboardBlock(el, this));
		});

		this.addCommand({
			id: "new-recipe",
			name: "Create new recipe",
			callback: () => newRecipeCommand(this),
		});

		this.addCommand({
			id: "grocery-list",
			name: "Build grocery list",
			callback: () => new GroceryModal(this).open(),
		});

		this.addCommand({
			id: "share",
			name: "Share or export current note",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!(file instanceof TFile) || file.extension !== "md") return false;
				if (!checking) new ShareModal(this, file).open();
				return true;
			},
		});

		this.addCommand({
			id: "recipe-index",
			name: "Create or update recipe index",
			callback: () => void createRecipeIndex(this),
		});

		this.addCommand({
			id: "open-recipe",
			name: "Open recipe (search)",
			callback: () => openRecipeCommand(this),
		});

		this.addCommand({
			id: "nutrition",
			name: "Show nutrition and cost for current recipe",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!(file instanceof TFile) || file.extension !== "md") return false;
				if (!checking) new NutritionModal(this, file).open();
				return true;
			},
		});

		this.addCommand({
			id: "ingredient-data",
			name: "Open ingredient data note",
			callback: () => void openIngredientDataNote(this),
		});

		this.addCommand({
			id: "meal-plan",
			name: "Add recipe to meal plan (daily note)",
			callback: () => {
				const active = this.app.workspace.getActiveFile();
				const isRecipe =
					active instanceof TFile &&
					active.extension === "md" &&
					active.path.startsWith(this.settings.recipesFolder + "/");
				addToMealPlanCommand(this, isRecipe ? active : undefined);
			},
		});

		this.addRibbonIcon("shopping-cart", "Build grocery list", () => {
			new GroceryModal(this).open();
		});

		this.addRibbonIcon("book-open", "Open recipe (search)", () => {
			openRecipeCommand(this);
		});
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

/** Wikilinked recipes under the (colon-tolerant) meal heading of a note. */
function extractMealLinks(content: string, heading: string): Array<{ name: string; link: string }> {
	const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const lines = content.split("\n");
	const start = lines.findIndex((l) => new RegExp(`^#{1,6}\\s+${esc}:?\\s*$`, "i").test(l));
	if (start === -1) return [];
	const out: Array<{ name: string; link: string }> = [];
	for (let i = start + 1; i < lines.length; i++) {
		if (/^#{1,6}\s/.test(lines[i])) break;
		const m = lines[i].match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
		if (m) out.push({ name: (m[2] ?? m[1]).trim(), link: m[1].trim() });
	}
	return out;
}
