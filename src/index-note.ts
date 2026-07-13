import { Notice, TFile, normalizePath } from "obsidian";
import { ensureParentFolder, getRecipeFiles, parseServings } from "./recipes";
import type RecipeManagerPlugin from "./main";

function dataviewEnabled(plugin: RecipeManagerPlugin): boolean {
	const plugins = (plugin.app as unknown as { plugins?: { enabledPlugins?: Set<string> } }).plugins;
	return plugins?.enabledPlugins?.has("dataview") ?? false;
}

function dataviewIndex(plugin: RecipeManagerPlugin): string {
	const { recipesFolder, recipeTag } = plugin.settings;
	const from: string[] = [];
	if (recipesFolder) from.push(`"${recipesFolder}"`);
	if (recipeTag) from.push(`#${recipeTag}`);
	return `# Recipes

\`\`\`dataview
TABLE WITHOUT ID file.link AS Recipe, servings AS Servings, prepTime AS Prep, cookTime AS Cook, join(file.etags, " ") AS Tags
FROM ${from.join(" OR ")}
WHERE file.path != this.file.path
SORT file.name ASC
\`\`\`

> [!tip]- Filter by tag
> Add a line like \`WHERE contains(file.etags, "#dinner")\` above \`SORT\` to filter, or duplicate the query per tag.
`;
}

function staticIndex(plugin: RecipeManagerPlugin): string {
	const files = getRecipeFiles(plugin.app, plugin.settings);
	const rows = files.map((file) => {
		const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
		const servings = parseServings(fm?.servings);
		const tags = Array.isArray(fm?.tags) ? fm.tags.join(", ") : fm?.tags ?? "";
		return `| [[${file.basename}]] | ${servings ?? ""} | ${fm?.prepTime ?? ""} | ${fm?.cookTime ?? ""} | ${tags} |`;
	});
	return `# Recipes

> [!warning] Dataview not detected
> This is a static snapshot — re-run **Recipe Manager: Create or update recipe index** to refresh it, or install the Dataview plugin for a live-updating index.

| Recipe | Servings | Prep | Cook | Tags |
| --- | --- | --- | --- | --- |
${rows.join("\n")}
`;
}

/** Create or overwrite the recipe index note and open it. */
export async function createRecipeIndex(plugin: RecipeManagerPlugin): Promise<void> {
	const { app, settings } = plugin;
	const hasDataview = dataviewEnabled(plugin);
	const content = hasDataview ? dataviewIndex(plugin) : staticIndex(plugin);

	let path = normalizePath(settings.indexPath || "Recipe Index.md");
	if (!path.toLowerCase().endsWith(".md")) path += ".md";
	await ensureParentFolder(app, path);

	const existing = app.vault.getAbstractFileByPath(path);
	let file: TFile;
	if (existing instanceof TFile) {
		await app.vault.modify(existing, content);
		file = existing;
	} else {
		file = await app.vault.create(path, content);
	}
	await app.workspace.getLeaf(false).openFile(file);
	if (!hasDataview) {
		new Notice("Dataview is not installed — generated a static index instead.");
	}
}
