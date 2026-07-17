import { Modal, Notice, TFile } from "obsidian";
import { parseLine, parseMeasure } from "./parse";
import { UnitDef, allUnits, formatAmount, unitById, unitLabel } from "./units";
import type RecipeManagerPlugin from "./main";

/** Location of one recipe-ingredients block inside its note. */
export interface BlockLocation {
	sourcePath: string;
	/** Original block body, used to find the block when line info is unavailable. */
	originalBody: string;
	/** Fence line numbers from getSectionInfo, when the renderer could provide them. */
	lineStart: number | null;
	lineEnd: number | null;
}

const BLOCK_RE =
	/^([ \t]*(?:```+|~~~+)[ \t]*recipe-ingredients[^\n]*)\n([\s\S]*?)^([ \t]*(?:```+|~~~+)[ \t]*)$/gm;

interface IngredientRowInit {
	amount: string;
	unitId: string;
	name: string;
}

function unitGroups(): { label: string; units: UnitDef[] }[] {
	const units = allUnits();
	return [
		{ label: "Volume (US)", units: units.filter((u) => u.family === "volume" && u.system === "us") },
		{ label: "Volume (metric)", units: units.filter((u) => u.family === "volume" && u.system === "metric") },
		{ label: "Weight (metric)", units: units.filter((u) => u.family === "weight" && u.system === "metric") },
		{ label: "Weight (US)", units: units.filter((u) => u.family === "weight" && u.system === "us") },
		{ label: "Count / kitchen", units: units.filter((u) => u.family === "count") },
	];
}

/**
 * Structured editor for a recipe-ingredients block: each ingredient is an
 * amount field + unit picker + name field — no free-text syntax to get
 * wrong. Rows serialize back to canonical lines on save.
 */
export class IngredientEditorModal extends Modal {
	private rowsEl!: HTMLElement;

	constructor(private plugin: RecipeManagerPlugin, private location: BlockLocation) {
		super(plugin.app);
	}

	onOpen(): void {
		this.titleEl.setText("Edit ingredients");
		this.modalEl.addClass("rcpm-editor-modal");

		this.rowsEl = this.contentEl.createDiv("rcpm-ing-rows");
		const lines = this.location.originalBody.split(/\r?\n/).filter((l) => l.trim() !== "");
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith("#") || trimmed.startsWith("//")) {
				this.addTextRow(trimmed, false);
				continue;
			}
			const ing = parseLine(trimmed);
			if (!ing) continue;
			let name = ing.name;
			if (ing.note) name += `, ${ing.note}`;
			if (ing.toTaste) name += ", to taste";
			this.addIngredientRow(
				{
					amount: ing.amount ? formatAmount(ing.amount, 1, true) : "",
					unitId: ing.unit?.id ?? "",
					name,
				},
				false
			);
		}
		if (this.rowsEl.childElementCount === 0) {
			this.addIngredientRow({ amount: "", unitId: "", name: "" }, false);
		}

		const adders = this.contentEl.createDiv("rcpm-ing-adders");
		const addIng = adders.createEl("button", { text: "+ Ingredient", cls: "rcpm-btn" });
		addIng.addEventListener("click", () =>
			this.addIngredientRow({ amount: "", unitId: "", name: "" }, true)
		);
		const addSection = adders.createEl("button", { text: "+ Section", cls: "rcpm-btn" });
		addSection.addEventListener("click", () => this.addTextRow("# ", true));

		const buttons = this.contentEl.createDiv("rcpm-prompt-buttons");
		const save = buttons.createEl("button", { text: "Save", cls: "mod-cta" });
		save.addEventListener("click", () => void this.save());
	}

	private removeButton(row: HTMLElement): void {
		const remove = row.createEl("button", {
			text: "×",
			cls: "rcpm-btn rcpm-ing-remove",
			attr: { "aria-label": "Remove line" },
		});
		remove.addEventListener("click", () => row.remove());
	}

	private addIngredientRow(init: IngredientRowInit, focus: boolean): void {
		const row = this.rowsEl.createDiv("rcpm-ing-row");
		row.dataset.kind = "ingredient";

		const amount = row.createEl("input", {
			type: "text",
			cls: "rcpm-field-input rcpm-ing-amount",
			attr: { placeholder: "1 1/2", inputmode: "decimal", "aria-label": "Amount" },
		});
		amount.value = init.amount;

		const unit = row.createEl("select", {
			cls: "dropdown rcpm-ing-unit",
			attr: { "aria-label": "Unit" },
		});
		unit.createEl("option", { text: "unit (none)", value: "" });
		for (const group of unitGroups()) {
			const optgroup = unit.createEl("optgroup", { attr: { label: group.label } });
			for (const u of group.units) {
				optgroup.createEl("option", { text: u.plural !== u.singular ? `${u.singular} / ${u.plural}` : u.singular, value: u.id });
			}
		}
		unit.value = init.unitId;

		this.removeButton(row);

		const name = row.createEl("input", {
			type: "text",
			cls: "rcpm-field-input rcpm-ing-name",
			attr: { placeholder: "ingredient, note (e.g. garlic, pressed)", enterkeyhint: "next" },
		});
		name.value = init.name;
		name.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				this.addIngredientRow({ amount: "", unitId: "", name: "" }, true);
			}
		});

		if (focus) window.setTimeout(() => amount.focus(), 10);
	}

	private addTextRow(value: string, focus: boolean): void {
		const row = this.rowsEl.createDiv("rcpm-ing-row rcpm-ing-textrow");
		row.dataset.kind = "text";
		const input = row.createEl("input", {
			type: "text",
			cls: "rcpm-field-input rcpm-ing-text",
			attr: { placeholder: "# Section name", "aria-label": "Section or comment" },
		});
		input.value = value;
		this.removeButton(row);
		if (focus) {
			window.setTimeout(() => {
				input.focus();
				input.setSelectionRange(input.value.length, input.value.length);
			}, 10);
		}
	}

	/** Serialize rows to block lines; returns null (with fields marked) when invalid. */
	private collectBody(): string | null {
		const lines: string[] = [];
		let valid = true;

		for (const row of Array.from(this.rowsEl.children) as HTMLElement[]) {
			if (row.dataset.kind === "text") {
				const input = row.querySelector("input") as HTMLInputElement;
				const text = input.value.trim();
				if (text && text !== "#") lines.push(text);
				continue;
			}

			const amountEl = row.querySelector(".rcpm-ing-amount") as HTMLInputElement;
			const unitEl = row.querySelector(".rcpm-ing-unit") as HTMLSelectElement;
			const nameEl = row.querySelector(".rcpm-ing-name") as HTMLInputElement;
			amountEl.removeClass("rcpm-invalid");
			nameEl.removeClass("rcpm-invalid");

			let amountText = amountEl.value.trim();
			let unitId = unitEl.value;
			const nameText = nameEl.value.trim().replace(/,$/, "");

			if (!amountText && !unitId && !nameText) continue;

			if (!nameText) {
				nameEl.addClass("rcpm-invalid");
				new Notice("Every ingredient needs a name.");
				valid = false;
				continue;
			}

			let amountValue: number | null = null;
			if (amountText) {
				const measure = parseMeasure(amountText);
				// Accept "1 cup" typed into the amount box: adopt its unit.
				if (measure.unit && !unitId) unitId = measure.unit.id;
				if (!measure.amount || measure.rest.trim() || (measure.unit && unitId !== measure.unit.id)) {
					amountEl.addClass("rcpm-invalid");
					new Notice(`Couldn't read the amount "${amountText}" — try "1 1/2", "0.75", or "2-3".`);
					valid = false;
					continue;
				}
				amountValue = measure.amount.high ?? measure.amount.low;
				amountText = formatAmount(measure.amount, 1, true);
			}

			if (unitId && !amountText) {
				amountEl.addClass("rcpm-invalid");
				new Notice("A unit needs an amount to go with it.");
				valid = false;
				continue;
			}

			const parts: string[] = [];
			if (amountText) parts.push(amountText);
			if (unitId) parts.push(unitLabel(unitById(unitId), amountValue ?? 1));
			parts.push(nameText);
			lines.push(parts.join(" "));
		}

		return valid ? lines.join("\n") : null;
	}

	private async save(): Promise<void> {
		const newBody = this.collectBody();
		if (newBody == null) return;

		const file = this.app.vault.getAbstractFileByPath(this.location.sourcePath);
		if (!(file instanceof TFile)) {
			new Notice("Couldn't find the recipe note to save into.");
			return;
		}

		let saved = false;
		await this.app.vault.process(file, (content) => {
			const updated = this.replaceBlock(content, newBody);
			saved = updated !== null;
			return updated ?? content;
		});

		if (saved) {
			this.close();
		} else {
			new Notice("Couldn't locate the ingredients block — it may have been edited elsewhere.");
		}
	}

	/** Returns the updated note content, or null when the block can't be located. */
	private replaceBlock(content: string, newBody: string): string | null {
		const { lineStart, lineEnd } = this.location;
		const lines = content.split("\n");

		// Preferred: exact fence lines from the renderer's section info.
		if (
			lineStart != null &&
			lineEnd != null &&
			lineEnd < lines.length &&
			/^[ \t]*(?:```+|~~~+)[ \t]*recipe-ingredients/.test(lines[lineStart] ?? "") &&
			/^[ \t]*(?:```+|~~~+)[ \t]*$/.test(lines[lineEnd] ?? "")
		) {
			const before = lines.slice(0, lineStart + 1);
			const after = lines.slice(lineEnd);
			return [...before, ...(newBody ? newBody.split("\n") : []), ...after].join("\n");
		}

		// Fallback: find the block whose body still matches what we opened with.
		const normalize = (s: string) => s.replace(/\r\n/g, "\n").replace(/\n$/, "");
		const target = normalize(this.location.originalBody);
		let replaced = false;
		const updated = content.replace(BLOCK_RE, (match, open: string, body: string, close: string) => {
			if (!replaced && normalize(body) === target) {
				replaced = true;
				return `${open}\n${newBody ? newBody + "\n" : ""}${close}`;
			}
			return match;
		});
		return replaced ? updated : null;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
