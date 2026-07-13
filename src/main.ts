import { Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, RecipeManagerSettingTab, RecipeManagerSettings } from "./settings";
import { IngredientsBlock } from "./render";
import { GroceryModal } from "./grocery";
import { ShareModal } from "./share";
import { createRecipeIndex } from "./index-note";
import { newRecipeCommand } from "./new-recipe";

export default class RecipeManagerPlugin extends Plugin {
	settings: RecipeManagerSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new RecipeManagerSettingTab(this.app, this));

		// Recipes render with no setup: the ingredients block works on open,
		// and scaling / fractions are opt-in taps on top of it.
		this.registerMarkdownCodeBlockProcessor("recipe-ingredients", (source, el, ctx) => {
			ctx.addChild(new IngredientsBlock(el, source, this, ctx.sourcePath));
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

		this.addRibbonIcon("shopping-cart", "Build grocery list", () => {
			new GroceryModal(this).open();
		});
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
