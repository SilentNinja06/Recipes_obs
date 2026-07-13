import { Plugin, TFile } from "obsidian";
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
