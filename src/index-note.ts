import { TFile, normalizePath } from "obsidian";
import { ensureParentFolder } from "./recipes";
import type RecipeManagerPlugin from "./main";

/**
 * The index note hosts the plugin's own interactive dashboard block —
 * category chips, search, and the recipe list — so it needs no Dataview.
 * Users who want Dataview queries can add them alongside the block.
 */
const INDEX_CONTENT = `# Recipes

\`\`\`recipe-dashboard
\`\`\`

> [!tip]- About this dashboard
> This note is rendered by the **Recipe Manager** plugin: tap a category chip
> to filter by type, or search by recipe name, tag, or ingredient. Recipes
> are grouped by the \`type\` frontmatter field (breakfast, salad, entree,
> sauce, dessert, …) or, failing that, by their tags. Re-running the
> *Create or update recipe index* command regenerates this note.
`;

/** Create or overwrite the recipe index note and open it. */
export async function createRecipeIndex(plugin: RecipeManagerPlugin): Promise<void> {
	const { app, settings } = plugin;

	let path = normalizePath(settings.indexPath || "Recipe Index.md");
	if (!path.toLowerCase().endsWith(".md")) path += ".md";
	await ensureParentFolder(app, path);

	const existing = app.vault.getAbstractFileByPath(path);
	let file: TFile;
	if (existing instanceof TFile) {
		await app.vault.modify(existing, INDEX_CONTENT);
		file = existing;
	} else {
		file = await app.vault.create(path, INDEX_CONTENT);
	}
	await app.workspace.getLeaf(false).openFile(file);
}
