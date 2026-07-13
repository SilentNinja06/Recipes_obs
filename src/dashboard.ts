import { MarkdownRenderChild, getAllTags } from "obsidian";
import type { TFile } from "obsidian";
import { categorize, categoryOrder } from "./categories";
import { extractIngredientBlocks, parseIngredients } from "./parse";
import { getRecipeFiles, parseServings } from "./recipes";
import type RecipeManagerPlugin from "./main";

interface DashboardEntry {
	file: TFile;
	name: string;
	categoryId: string;
	categoryLabel: string;
	servings: number | null;
	prep: string | null;
	cook: string | null;
	/** Lowercased haystack for search: name, tags, category, ingredients. */
	search: string;
}

/**
 * Renders a `recipe-dashboard` code block: a search box, category chips
 * (Breakfast, Entrées, Sauces, …), and the filtered recipe list. Needs no
 * Dataview — it reads the vault's metadata cache directly. Search also
 * covers ingredient names (loaded in the background), so "chicken" finds
 * every recipe that cooks with it.
 */
export class DashboardBlock extends MarkdownRenderChild {
	private entries: DashboardEntry[] = [];
	private filter = "";
	private selectedCategory: string | null = null;
	private listEl!: HTMLElement;
	private chipsEl!: HTMLElement;

	constructor(containerEl: HTMLElement, private plugin: RecipeManagerPlugin) {
		super(containerEl);
	}

	onload(): void {
		this.build();
	}

	private build(): void {
		const { app, settings } = this.plugin;
		this.entries = getRecipeFiles(app, settings).map((file) => {
			const cache = app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			const tags = cache ? getAllTags(cache) ?? [] : [];
			const category = categorize(fm?.type, tags);
			const name =
				typeof fm?.title === "string" && fm.title.trim() ? fm.title.trim() : file.basename;
			return {
				file,
				name,
				categoryId: category.id,
				categoryLabel: category.label,
				servings: parseServings(fm?.servings),
				prep: fm?.prepTime != null ? String(fm.prepTime) : null,
				cook: fm?.cookTime != null ? String(fm.cookTime) : null,
				search: `${name} ${tags.join(" ")} ${category.label}`.toLowerCase(),
			};
		});
		this.renderShell();
		void this.loadIngredientSearchText();
	}

	/** Fold ingredient names into the search text after first paint. */
	private async loadIngredientSearchText(): Promise<void> {
		for (const entry of this.entries) {
			try {
				const content = await this.plugin.app.vault.cachedRead(entry.file);
				const names = extractIngredientBlocks(content)
					.flatMap((block) => parseIngredients(block))
					.map((ing) => ing.name.toLowerCase());
				if (names.length) entry.search += " " + names.join(" ");
			} catch (e) {
				// Unreadable file — leave its search text as-is.
			}
		}
		if (this.filter) this.renderList();
	}

	private renderShell(): void {
		const el = this.containerEl;
		el.empty();
		el.addClass("rcpm-dashboard");

		const search = el.createEl("input", {
			type: "search",
			cls: "rcpm-search",
			attr: { placeholder: "Search recipes or ingredients…" },
		});
		search.addEventListener("input", () => {
			this.filter = search.value.toLowerCase().trim();
			this.renderList();
		});

		this.chipsEl = el.createDiv("rcpm-chips");
		this.renderChips();

		this.listEl = el.createDiv("rcpm-dash-list");
		this.renderList();
	}

	private categoriesPresent(): { id: string; label: string; count: number }[] {
		const byId = new Map<string, { id: string; label: string; count: number }>();
		for (const entry of this.entries) {
			const existing = byId.get(entry.categoryId);
			if (existing) existing.count++;
			else byId.set(entry.categoryId, { id: entry.categoryId, label: entry.categoryLabel, count: 1 });
		}
		return [...byId.values()].sort(
			(a, b) => categoryOrder(a.id) - categoryOrder(b.id) || a.label.localeCompare(b.label)
		);
	}

	private renderChips(): void {
		this.chipsEl.empty();
		const chip = (id: string | null, label: string, count?: number) => {
			const btn = this.chipsEl.createEl("button", {
				cls: "rcpm-chip",
				text: count != null ? `${label} ${count}` : label,
				attr: { "aria-pressed": String(this.selectedCategory === id) },
			});
			if (this.selectedCategory === id) btn.addClass("rcpm-active");
			btn.addEventListener("click", () => {
				this.selectedCategory = this.selectedCategory === id ? null : id;
				this.renderChips();
				this.renderList();
			});
		};
		chip(null, "All", this.entries.length);
		for (const cat of this.categoriesPresent()) {
			chip(cat.id, cat.label, cat.count);
		}
	}

	private renderList(): void {
		this.listEl.empty();
		const visible = this.entries.filter((entry) => {
			if (this.selectedCategory && entry.categoryId !== this.selectedCategory) return false;
			if (this.filter && !entry.search.includes(this.filter)) return false;
			return true;
		});

		if (visible.length === 0) {
			this.listEl.createDiv({ text: "No matching recipes.", cls: "rcpm-dash-empty" });
			return;
		}

		for (const entry of visible) {
			const row = this.listEl.createDiv("rcpm-dash-row");
			row.createDiv({ text: entry.name, cls: "rcpm-dash-name" });
			const bits: string[] = [entry.categoryLabel];
			if (entry.servings != null) bits.push(`serves ${entry.servings}`);
			if (entry.prep) bits.push(`prep ${entry.prep}`);
			if (entry.cook) bits.push(`cook ${entry.cook}`);
			row.createDiv({ text: bits.join(" · "), cls: "rcpm-dash-meta" });
			row.addEventListener("click", () => {
				void this.plugin.app.workspace.getLeaf(false).openFile(entry.file);
			});
		}
	}
}
