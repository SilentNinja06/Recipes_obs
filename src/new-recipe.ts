import { Modal, Notice, TFile, normalizePath } from "obsidian";
import { CATEGORIES } from "./categories";
import { ensureParentFolder } from "./recipes";
import type RecipeManagerPlugin from "./main";

interface NewRecipeInfo {
	title: string;
	/** Category id/label chosen in the modal, or "" when the user skipped it. */
	type: string;
	servings: string;
	prepTime: string;
	cookTime: string;
}

function template(info: NewRecipeInfo, tag: string): string {
	return `---
title: ${info.title}
type: ${info.type}
servings: ${info.servings}
prepTime: ${info.prepTime}
cookTime: ${info.cookTime}
tags: [${tag}]
source:
image:
---

# ${info.title}

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

/** Open the new-recipe modal: name, type, servings, and times — nothing assumed. */
export function newRecipeCommand(plugin: RecipeManagerPlugin): void {
	new NewRecipeModal(plugin).open();
}

class NewRecipeModal extends Modal {
	private selectedType = "";
	private nameInput!: HTMLInputElement;
	private customTypeInput!: HTMLInputElement;
	private servingsInput!: HTMLInputElement;
	private prepInput!: HTMLInputElement;
	private cookInput!: HTMLInputElement;
	private chipEls = new Map<string, HTMLButtonElement>();

	constructor(private plugin: RecipeManagerPlugin) {
		super(plugin.app);
	}

	onOpen(): void {
		this.titleEl.setText("New recipe");
		this.modalEl.addClass("rcpm-new-modal");
		const { contentEl } = this;

		// ── Name ──────────────────────────────────────────────────
		const nameField = contentEl.createDiv("rcpm-field");
		nameField.createEl("label", { text: "Name", cls: "rcpm-field-label" });
		this.nameInput = nameField.createEl("input", {
			type: "text",
			cls: "rcpm-field-input",
			attr: { placeholder: "e.g. Alfredo Sauce" },
		});
		this.nameInput.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				void this.create();
			}
		});

		// ── Type ──────────────────────────────────────────────────
		const typeField = contentEl.createDiv("rcpm-field");
		typeField.createEl("label", { text: "Type", cls: "rcpm-field-label" });
		const chips = typeField.createDiv("rcpm-chips");
		for (const cat of CATEGORIES) {
			const chip = chips.createEl("button", {
				text: cat.label,
				cls: "rcpm-chip",
				attr: { "aria-pressed": "false" },
			});
			chip.addEventListener("click", (evt) => {
				evt.preventDefault();
				this.selectType(this.selectedType === cat.id ? "" : cat.id);
			});
			this.chipEls.set(cat.id, chip);
		}
		this.customTypeInput = typeField.createEl("input", {
			type: "text",
			cls: "rcpm-field-input",
			attr: { placeholder: "…or type your own (optional)" },
		});
		this.customTypeInput.addEventListener("input", () => {
			if (this.customTypeInput.value.trim()) this.selectType("");
		});

		// ── Servings + times ──────────────────────────────────────
		const row = contentEl.createDiv("rcpm-inline-fields");

		const servingsField = row.createDiv("rcpm-field");
		servingsField.createEl("label", { text: "Servings", cls: "rcpm-field-label" });
		this.servingsInput = servingsField.createEl("input", {
			type: "number",
			cls: "rcpm-field-input",
			attr: { placeholder: "4", min: "1", step: "any", inputmode: "numeric" },
		});

		const prepField = row.createDiv("rcpm-field");
		prepField.createEl("label", { text: "Prep time", cls: "rcpm-field-label" });
		this.prepInput = prepField.createEl("input", {
			type: "text",
			cls: "rcpm-field-input",
			attr: { placeholder: "15 min" },
		});

		const cookField = row.createDiv("rcpm-field");
		cookField.createEl("label", { text: "Cook time", cls: "rcpm-field-label" });
		this.cookInput = cookField.createEl("input", {
			type: "text",
			cls: "rcpm-field-input",
			attr: { placeholder: "30 min" },
		});

		// ── Create ────────────────────────────────────────────────
		const buttons = contentEl.createDiv("rcpm-prompt-buttons");
		const create = buttons.createEl("button", { text: "Create", cls: "mod-cta" });
		create.addEventListener("click", () => void this.create());

		window.setTimeout(() => this.nameInput.focus(), 10);
	}

	private selectType(id: string): void {
		this.selectedType = id;
		if (id) this.customTypeInput.value = "";
		for (const [chipId, el] of this.chipEls) {
			const active = chipId === id;
			el.toggleClass("rcpm-active", active);
			el.setAttribute("aria-pressed", String(active));
		}
	}

	private async create(): Promise<void> {
		const title = this.nameInput.value.trim();
		if (!title) {
			new Notice("Give the recipe a name.");
			this.nameInput.focus();
			return;
		}
		const info: NewRecipeInfo = {
			title,
			type: this.selectedType || this.customTypeInput.value.trim(),
			servings: this.servingsInput.value.trim(),
			prepTime: this.prepInput.value.trim(),
			cookTime: this.cookInput.value.trim(),
		};
		this.close();
		await createRecipe(this.plugin, info);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

async function createRecipe(plugin: RecipeManagerPlugin, info: NewRecipeInfo): Promise<void> {
	const { app, settings } = plugin;
	const safeName = info.title.replace(/[\\/:*?"<>|#^[\]]/g, "").trim();
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
	const file = await app.vault.create(path, template(info, settings.recipeTag || "recipe"));
	await app.workspace.getLeaf(false).openFile(file);
}
