import { Notice, TFile, normalizePath } from "obsidian";
import { PromptModal } from "./modals";
import { ensureParentFolder } from "./recipes";
import type RecipeManagerPlugin from "./main";

function template(title: string, tag: string): string {
	return `---
title: ${title}
servings: 4
prepTime: 15 min
cookTime: 30 min
tags: [${tag}]
source:
image:
---

# ${title}

\`\`\`recipe-ingredients
2 cups example ingredient
1 tbsp another ingredient
salt, to taste
\`\`\`

## Steps

1.

## Notes

-
`;
}

/** Prompt for a title and create a new recipe note from the template. */
export function newRecipeCommand(plugin: RecipeManagerPlugin): void {
	new PromptModal(
		plugin.app,
		{ title: "New recipe", placeholder: "Recipe name", cta: "Create" },
		(name) => void createRecipe(plugin, name)
	).open();
}

async function createRecipe(plugin: RecipeManagerPlugin, title: string): Promise<void> {
	const { app, settings } = plugin;
	const safeName = title.replace(/[\\/:*?"<>|#^[\]]/g, "").trim();
	if (!safeName) {
		new Notice("That name can't be used for a file.");
		return;
	}
	const folder = settings.recipesFolder ? normalizePath(settings.recipesFolder) + "/" : "";
	const path = normalizePath(`${folder}${safeName}.md`);

	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		new Notice("A recipe with that name already exists — opening it.");
		await app.workspace.getLeaf(false).openFile(existing);
		return;
	}

	await ensureParentFolder(app, path);
	const file = await app.vault.create(path, template(title.trim(), settings.recipeTag || "recipe"));
	await app.workspace.getLeaf(false).openFile(file);
}
