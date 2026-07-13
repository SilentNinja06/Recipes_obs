import { App, TFile, TFolder, getAllTags, normalizePath } from "obsidian";
import { Ingredient, extractBlocks, extractIngredientBlocks, parseIngredients, parseLine } from "./parse";
import { IngredientData, buildDataIndex, parseIngredientData } from "./ingredient-data";
import type { RecipeManagerSettings } from "./settings";

export interface LoadedRecipe {
	file: TFile;
	name: string;
	servings: number | null;
	ingredients: Ingredient[];
}

/** Read a numeric servings value out of frontmatter ("4", 4, "4-6" → 4). */
export function parseServings(value: unknown): number | null {
	if (typeof value === "number" && isFinite(value)) return value;
	if (typeof value === "string") {
		const m = value.match(/\d+(?:\.\d+)?/);
		if (m) return parseFloat(m[0]);
	}
	return null;
}

/** All notes considered recipes: inside the recipes folder, or carrying the recipe tag. */
export function getRecipeFiles(app: App, settings: RecipeManagerSettings): TFile[] {
	const folder = settings.recipesFolder ? normalizePath(settings.recipesFolder) : "";
	const tag = settings.recipeTag ? `#${settings.recipeTag}` : "";
	const files = app.vault.getMarkdownFiles().filter((file) => {
		if (folder && (file.path === folder || file.path.startsWith(folder + "/"))) return true;
		if (tag) {
			const cache = app.metadataCache.getFileCache(file);
			if (cache && (getAllTags(cache) ?? []).includes(tag)) return true;
		}
		return false;
	});
	files.sort((a, b) => a.basename.localeCompare(b.basename));
	return files;
}

/** Load and parse a recipe note. Returns null if it has no recipe-ingredients block. */
export async function loadRecipe(app: App, file: TFile): Promise<LoadedRecipe | null> {
	const content = await app.vault.cachedRead(file);
	const blocks = extractIngredientBlocks(content);
	if (blocks.length === 0) return null;
	const ingredients = blocks.flatMap((block) => parseIngredients(block));
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	const name = typeof fm?.title === "string" && fm.title.trim() ? fm.title.trim() : file.basename;
	return { file, name, servings: parseServings(fm?.servings), ingredients };
}

/** Extract the markdown body of a `## Heading` section (until the next same-or-higher heading). */
export function extractSection(content: string, heading: string): string | null {
	const re = new RegExp(`^#{1,6}\\s+${heading}\\s*$`, "im");
	const m = re.exec(content);
	if (!m) return null;
	const level = (m[0].match(/^#+/) as RegExpMatchArray)[0].length;
	const start = m.index + m[0].length;
	const rest = content.slice(start);
	const next = rest.search(new RegExp(`^#{1,${level}}\\s`, "m"));
	const body = next >= 0 ? rest.slice(0, next) : rest;
	return body.trim() || null;
}

/** Strip YAML frontmatter from note content. */
export function stripFrontmatter(content: string): string {
	return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

/**
 * Load the pantry note's ingredient lines. Prefers `recipe-pantry` code
 * blocks; without any, every list line in the note is treated as stock.
 * Returns null when the note doesn't exist.
 */
export async function loadPantryIngredients(
	app: App,
	settings: RecipeManagerSettings
): Promise<Ingredient[] | null> {
	const file = app.vault.getAbstractFileByPath(normalizePath(settings.pantryPath));
	if (!(file instanceof TFile)) return null;
	const content = await app.vault.cachedRead(file);
	const blocks = extractBlocks(content, "recipe-pantry");
	if (blocks.length > 0) {
		return blocks.flatMap((block) => parseIngredients(block));
	}
	const ingredients: Ingredient[] = [];
	for (const line of stripFrontmatter(content).split(/\r?\n/)) {
		const m = line.match(/^\s*[-*+]\s+(?:\[.\]\s+)?(.+)$/);
		if (!m) continue;
		const ing = parseLine(m[1]);
		if (ing) ingredients.push(ing);
	}
	return ingredients;
}

/** Load and index the ingredient data note. Returns null when it doesn't exist. */
export async function loadIngredientDataIndex(
	app: App,
	settings: RecipeManagerSettings
): Promise<Map<string, IngredientData> | null> {
	const file = app.vault.getAbstractFileByPath(normalizePath(settings.ingredientDataPath));
	if (!(file instanceof TFile)) return null;
	const content = await app.vault.cachedRead(file);
	const blocks = extractBlocks(content, "recipe-ingredient-data");
	if (blocks.length === 0) return null;
	return buildDataIndex(blocks.flatMap((block) => parseIngredientData(block)));
}

/** Create intermediate folders for a note path if they don't exist. */
export async function ensureParentFolder(app: App, path: string): Promise<void> {
	const parts = normalizePath(path).split("/");
	parts.pop();
	if (parts.length === 0) return;
	const folderPath = parts.join("/");
	const existing = app.vault.getAbstractFileByPath(folderPath);
	if (existing instanceof TFolder) return;
	try {
		await app.vault.createFolder(folderPath);
	} catch (e) {
		// Folder may have been created concurrently; only real failures matter later.
	}
}
