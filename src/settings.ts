import { App, PluginSettingTab, Setting } from "obsidian";
import type RecipeManagerPlugin from "./main";

export interface RecipeManagerSettings {
	recipesFolder: string;
	recipeTag: string;
	groceryListPath: string;
	groceryMode: "replace" | "append";
	groceryShowSources: boolean;
	groceryFractions: boolean;
	groceryShowCosts: boolean;
	indexPath: string;
	defaultFractions: boolean;
	ingredientDataPath: string;
	currency: string;
	pantryPath: string;
	usePantry: boolean;
	mealHeading: string;
}

export const DEFAULT_SETTINGS: RecipeManagerSettings = {
	recipesFolder: "Knowledge base/Recipes",
	recipeTag: "recipe",
	groceryListPath: "Grocery List.md",
	groceryMode: "replace",
	groceryShowSources: true,
	groceryFractions: true,
	groceryShowCosts: true,
	indexPath: "Recipe Index.md",
	defaultFractions: false,
	ingredientDataPath: "Recipe Ingredient Data.md",
	currency: "$",
	pantryPath: "Pantry.md",
	usePantry: false,
	mealHeading: "Meals",
};

export class RecipeManagerSettingTab extends PluginSettingTab {
	plugin: RecipeManagerPlugin;

	constructor(app: App, plugin: RecipeManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Recipes folder")
			.setDesc("Notes in this folder are treated as recipes.")
			.addText((text) =>
				text
					.setPlaceholder("Knowledge base/Recipes")
					.setValue(this.plugin.settings.recipesFolder)
					.onChange(async (value) => {
						this.plugin.settings.recipesFolder = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Recipe tag")
			.setDesc("Notes with this tag (anywhere in the vault) are also treated as recipes. Without the #.")
			.addText((text) =>
				text
					.setPlaceholder("recipe")
					.setValue(this.plugin.settings.recipeTag)
					.onChange(async (value) => {
						this.plugin.settings.recipeTag = value.trim().replace(/^#/, "");
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show fractions by default")
			.setDesc("Render ingredient amounts as fractions (1/4, 2/3) when a recipe is opened. The per-recipe toggle always overrides this.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.defaultFractions).onChange(async (value) => {
					this.plugin.settings.defaultFractions = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl).setName("Grocery list").setHeading();

		new Setting(containerEl)
			.setName("Grocery list note")
			.setDesc("Path of the note the grocery list is written to.")
			.addText((text) =>
				text
					.setPlaceholder("Grocery List.md")
					.setValue(this.plugin.settings.groceryListPath)
					.onChange(async (value) => {
						this.plugin.settings.groceryListPath = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("When the note already exists")
			.setDesc("Replace rewrites the whole note each time; append adds a new dated section at the bottom.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("replace", "Replace contents")
					.addOption("append", "Append a dated section")
					.setValue(this.plugin.settings.groceryMode)
					.onChange(async (value) => {
						this.plugin.settings.groceryMode = value === "append" ? "append" : "replace";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show source recipes")
			.setDesc("Note which recipes each grocery item came from.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.groceryShowSources).onChange(async (value) => {
					this.plugin.settings.groceryShowSources = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Fractions in grocery list")
			.setDesc("Use kitchen fractions (1/4 cup) instead of decimals for US units in the grocery list.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.groceryFractions).onChange(async (value) => {
					this.plugin.settings.groceryFractions = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Show estimated costs")
			.setDesc("Price grocery items using the ingredient data note, when cost data exists.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.groceryShowCosts).onChange(async (value) => {
					this.plugin.settings.groceryShowCosts = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl).setName("Nutrition & cost data").setHeading();

		new Setting(containerEl)
			.setName("Ingredient data note")
			.setDesc("Note holding the recipe-ingredient-data block (nutrition facts and prices). Run 'Open ingredient data note' to scaffold it.")
			.addText((text) =>
				text
					.setPlaceholder("Recipe Ingredient Data.md")
					.setValue(this.plugin.settings.ingredientDataPath)
					.onChange(async (value) => {
						this.plugin.settings.ingredientDataPath = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Currency symbol")
			.setDesc("Used for cost estimates.")
			.addText((text) =>
				text
					.setPlaceholder("$")
					.setValue(this.plugin.settings.currency)
					.onChange(async (value) => {
						this.plugin.settings.currency = value.trim() || "$";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Pantry").setHeading();

		new Setting(containerEl)
			.setName("Pantry note")
			.setDesc("Note listing what you have on hand. Lines with amounts cover that much; bare lines (like 'salt') always cover.")
			.addText((text) =>
				text
					.setPlaceholder("Pantry.md")
					.setValue(this.plugin.settings.pantryPath)
					.onChange(async (value) => {
						this.plugin.settings.pantryPath = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Subtract pantry by default")
			.setDesc("Pre-check the pantry option in the grocery list builder.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.usePantry).onChange(async (value) => {
					this.plugin.settings.usePantry = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl).setName("Meal plan").setHeading();

		new Setting(containerEl)
			.setName("Daily-note heading")
			.setDesc("Recipes are linked under this heading in your daily note.")
			.addText((text) =>
				text
					.setPlaceholder("Meals")
					.setValue(this.plugin.settings.mealHeading)
					.onChange(async (value) => {
						this.plugin.settings.mealHeading = value.trim() || "Meals";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Recipe index").setHeading();

		new Setting(containerEl)
			.setName("Index note")
			.setDesc("Path of the generated recipe index note.")
			.addText((text) =>
				text
					.setPlaceholder("Recipe Index.md")
					.setValue(this.plugin.settings.indexPath)
					.onChange(async (value) => {
						this.plugin.settings.indexPath = value.trim();
						await this.plugin.saveSettings();
					})
			);
	}
}
