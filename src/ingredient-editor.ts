import { Modal, Notice, TFile } from "obsidian";
import { parseLine } from "./parse";
import { formatAmount, unitLabel } from "./units";
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
	/^([ \t]*(?:```+|~~~+)[ \t]*recipe-ingredients[^\n]*)\n([\s\S]*?)\n([ \t]*(?:```+|~~~+)[ \t]*)$/gm;

/** How a line will be understood, shown under each input so edits are predictable. */
function parseHint(text: string): string {
	const trimmed = text.trim();
	if (!trimmed) return "";
	if (trimmed.startsWith("#")) return "— section header";
	if (trimmed.startsWith("//")) return "— comment (ignored)";
	const ing = parseLine(trimmed);
	if (!ing) return "";
	const bits: string[] = [];
	if (ing.amount) {
		let amount = formatAmount(ing.amount, 1, true);
		if (ing.unit) amount += ` ${unitLabel(ing.unit, ing.amount.high ?? ing.amount.low)}`;
		bits.push(amount);
	}
	bits.push(ing.name || "?");
	if (ing.toTaste) bits.push("to taste");
	return `— ${bits.join(" · ")}${ing.amount ? "" : " (won't scale)"}`;
}

/**
 * Mobile-friendly editor for a recipe-ingredients block: one input per
 * line with add/remove and live parse hints, saving back into the note.
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
		if (lines.length === 0) lines.push("");
		for (const line of lines) this.addRow(line, false);

		const adders = this.contentEl.createDiv("rcpm-ing-adders");
		const addIng = adders.createEl("button", { text: "+ Ingredient", cls: "rcpm-btn" });
		addIng.addEventListener("click", () => this.addRow("", true));
		const addSection = adders.createEl("button", { text: "+ Section", cls: "rcpm-btn" });
		addSection.addEventListener("click", () => this.addRow("# ", true));

		const buttons = this.contentEl.createDiv("rcpm-prompt-buttons");
		const save = buttons.createEl("button", { text: "Save", cls: "mod-cta" });
		save.addEventListener("click", () => void this.save());
	}

	private addRow(value: string, focus: boolean): void {
		const row = this.rowsEl.createDiv("rcpm-ing-row");
		const main = row.createDiv("rcpm-ing-main");
		const input = main.createEl("input", {
			type: "text",
			cls: "rcpm-field-input",
			attr: { placeholder: "e.g. 2 cups heavy cream", enterkeyhint: "next" },
		});
		input.value = value;
		const hint = main.createDiv({ text: parseHint(value), cls: "rcpm-ing-hint" });
		input.addEventListener("input", () => hint.setText(parseHint(input.value)));
		input.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				this.addRow("", true);
			}
		});

		const remove = row.createEl("button", {
			text: "×",
			cls: "rcpm-btn rcpm-ing-remove",
			attr: { "aria-label": "Remove line" },
		});
		remove.addEventListener("click", () => row.remove());

		if (focus) window.setTimeout(() => input.focus(), 10);
	}

	private collectBody(): string {
		const values: string[] = [];
		this.rowsEl.querySelectorAll("input").forEach((input) => {
			const text = (input as HTMLInputElement).value.replace(/\s+$/, "");
			if (text.trim() !== "") values.push(text);
		});
		return values.join("\n");
	}

	private async save(): Promise<void> {
		const newBody = this.collectBody();
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
		const normalize = (s: string) => s.replace(/\r\n/g, "\n");
		const target = normalize(this.location.originalBody);
		let replaced = false;
		const updated = content.replace(BLOCK_RE, (match, open: string, body: string, close: string) => {
			if (!replaced && normalize(body) === target) {
				replaced = true;
				return `${open}\n${newBody}\n${close}`;
			}
			return match;
		});
		return replaced ? updated : null;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
