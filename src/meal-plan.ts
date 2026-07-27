import { FuzzySuggestModal, Modal, Notice, TFile, moment, normalizePath } from "obsidian";
import { getAllTags } from "obsidian";
import { categorize } from "./categories";
import { ensureParentFolder, getRecipeFiles } from "./recipes";
import type RecipeManagerPlugin from "./main";

/** Fuzzy recipe picker — searches name, category, and tags. */
export class RecipeSuggestModal extends FuzzySuggestModal<TFile> {
	constructor(private plugin: RecipeManagerPlugin, private onChoose: (file: TFile) => void) {
		super(plugin.app);
		this.setPlaceholder("Search recipes…");
	}

	getItems(): TFile[] {
		return getRecipeFiles(this.plugin.app, this.plugin.settings);
	}

	getItemText(item: TFile): string {
		const cache = this.plugin.app.metadataCache.getFileCache(item);
		const tags = cache ? getAllTags(cache) ?? [] : [];
		const fm = cache?.frontmatter;
		const category = categorize(fm?.recipe?.category ?? fm?.type, tags);
		return `${item.basename} — ${category.label}`;
	}

	onChooseItem(item: TFile): void {
		this.onChoose(item);
	}
}

/** Command: fuzzy-search recipes and open the pick. */
export function openRecipeCommand(plugin: RecipeManagerPlugin): void {
	new RecipeSuggestModal(plugin, (file) => {
		void plugin.app.workspace.getLeaf(false).openFile(file);
	}).open();
}

/** Command: pick a recipe, pick a day, link it under the Meals heading of that daily note. */
export function addToMealPlanCommand(plugin: RecipeManagerPlugin, recipe?: TFile): void {
	if (recipe) {
		new DayPickerModal(plugin, recipe).open();
		return;
	}
	new RecipeSuggestModal(plugin, (file) => new DayPickerModal(plugin, file).open()).open();
}

class DayPickerModal extends Modal {
	constructor(private plugin: RecipeManagerPlugin, private recipe: TFile) {
		super(plugin.app);
	}

	onOpen(): void {
		this.titleEl.setText(`Plan “${this.recipe.basename}” for…`);
		this.modalEl.addClass("rcpm-day-modal");
		const container = this.contentEl.createDiv("rcpm-day-buttons");
		for (let offset = 0; offset < 7; offset++) {
			const day = moment().add(offset, "days");
			const label =
				offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : day.format("dddd");
			const button = container.createEl("button", { cls: "rcpm-day-btn" });
			button.createSpan({ text: label, cls: "rcpm-day-label" });
			button.createSpan({ text: day.format("MMM D"), cls: "rcpm-day-date" });
			button.addEventListener("click", () => {
				this.close();
				void addRecipeToDailyNote(this.plugin, this.recipe, offset);
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Folder + date format from the core Daily Notes plugin, with sane fallbacks. */
function dailyNoteSettings(plugin: RecipeManagerPlugin): { folder: string; format: string } {
	const internal = (
		plugin.app as unknown as {
			internalPlugins?: {
				plugins?: Record<string, { instance?: { options?: { folder?: string; format?: string } } }>;
			};
		}
	).internalPlugins;
	const options = internal?.plugins?.["daily-notes"]?.instance?.options ?? {};
	return {
		folder: (options.folder ?? "").trim(),
		format: options.format?.trim() || "YYYY-MM-DD",
	};
}

/** Append `line` at the end of the `heading` section, creating the section if needed. */
export function insertUnderHeading(content: string, heading: string, line: string): string {
	// Colon-tolerant (`# Meals` or `# Meals:`) as defense in depth — a stray
	// colon in the daily-note heading must still match instead of appending a
	// duplicate section.
	const headingRe = new RegExp(`^(#{1,6})\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:?\\s*$`, "im");
	const m = headingRe.exec(content);
	if (!m) {
		const base = content.replace(/\s+$/, "");
		return `${base ? base + "\n" : ""}\n## ${heading}\n\n${line}\n`;
	}
	const level = m[1].length;
	const sectionStart = m.index + m[0].length;
	const rest = content.slice(sectionStart);
	const nextHeading = rest.search(new RegExp(`^#{1,${level}}\\s`, "m"));
	const sectionEnd = nextHeading >= 0 ? sectionStart + nextHeading : content.length;
	const before = content.slice(0, sectionEnd).replace(/\s+$/, "");
	const after = content.slice(sectionEnd);
	return `${before}\n${line}\n${after ? "\n" + after : ""}`;
}

async function addRecipeToDailyNote(
	plugin: RecipeManagerPlugin,
	recipe: TFile,
	dayOffset: number
): Promise<void> {
	const { app, settings } = plugin;
	const { folder, format } = dailyNoteSettings(plugin);
	const day = moment().add(dayOffset, "days");
	const noteName = day.format(format);
	const path = normalizePath(`${folder ? folder + "/" : ""}${noteName}.md`);
	const heading = settings.mealHeading || "Meals";
	const line = `- [[${recipe.basename}]]`;

	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		await app.vault.process(existing, (content) => insertUnderHeading(content, heading, line));
	} else {
		await ensureParentFolder(app, path);
		await app.vault.create(path, `## ${heading}\n\n${line}\n`);
	}
	new Notice(`Added ${recipe.basename} to ${noteName}.`);
}
