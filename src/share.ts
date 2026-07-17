import { MarkdownRenderer, Modal, Notice, Platform, TFile, normalizePath } from "obsidian";
import { extractIngredientBlocks, parseIngredients } from "./parse";
import { formatAmount, unitLabel } from "./units";
import { extractSection, parseServings, stripFrontmatter } from "./recipes";
import type RecipeManagerPlugin from "./main";

/**
 * Single share entry point: one modal, user picks the format.
 * Copy actions work everywhere; printing uses a hidden iframe on desktop and
 * falls back to exporting a print-ready HTML file into the vault on mobile.
 */
export class ShareModal extends Modal {
	constructor(private plugin: RecipeManagerPlugin, private file: TFile) {
		super(plugin.app);
	}

	onOpen(): void {
		this.titleEl.setText(`Share “${this.file.basename}”`);
		this.modalEl.addClass("rcpm-share-modal");

		const options = this.contentEl.createDiv("rcpm-share-options");

		this.option(options, "Copy as Markdown", "Frontmatter stripped, ingredients as a plain list", async () => {
			await navigator.clipboard.writeText(await toShareMarkdown(this.plugin, this.file));
			new Notice("Copied as Markdown.");
		});

		this.option(options, "Copy as plain text", "For Messages, email, and anywhere without Markdown", async () => {
			await navigator.clipboard.writeText(markdownToPlainText(await toShareMarkdown(this.plugin, this.file)));
			new Notice("Copied as plain text.");
		});

		if (Platform.isDesktop) {
			this.option(options, "Print…", "Clean ingredients-and-steps layout", async () => {
				await printRecipe(this.plugin, this.file);
			});
		}

		this.option(options, "Export print-ready HTML", "Saves an HTML file next to the note", async () => {
			const path = await exportPrintHtml(this.plugin, this.file);
			new Notice(`Exported to ${path}`);
		});
	}

	private option(parent: HTMLElement, title: string, desc: string, action: () => Promise<void>): void {
		const button = parent.createEl("button", { cls: "rcpm-share-option" });
		button.createDiv({ text: title, cls: "rcpm-share-title" });
		button.createDiv({ text: desc, cls: "rcpm-share-desc" });
		button.addEventListener("click", async () => {
			try {
				await action();
			} catch (e) {
				console.error("Recipe Manager share failed", e);
				new Notice("Share failed — see console for details.");
			}
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Note content with frontmatter stripped and ingredient blocks flattened to plain lists. */
export async function toShareMarkdown(plugin: RecipeManagerPlugin, file: TFile): Promise<string> {
	const content = await plugin.app.vault.cachedRead(file);
	let md = stripFrontmatter(content);
	md = md.replace(
		/^[ \t]*(?:```+|~~~+)[ \t]*recipe-ingredients[^\n]*\n([\s\S]*?)^[ \t]*(?:```+|~~~+)[ \t]*$/gm,
		(_match, body: string) => flattenIngredients(body)
	);
	return md.trim() + "\n";
}

function flattenIngredients(body: string): string {
	const lines: string[] = [];
	for (const ing of parseIngredients(body)) {
		lines.push(`- ${ingredientText(ing, 1, true)}`);
	}
	return lines.join("\n");
}

function ingredientText(
	ing: ReturnType<typeof parseIngredients>[number],
	multiplier: number,
	fractions: boolean
): string {
	let text = "";
	if (ing.amount) {
		text += formatAmount(ing.amount, multiplier, fractions);
		if (ing.unit) {
			const value = (ing.amount.high ?? ing.amount.low) * multiplier;
			text += ` ${unitLabel(ing.unit, value)}`;
		}
		text += " ";
	}
	text += ing.name;
	if (ing.toTaste) text += ", to taste";
	if (ing.note) text += `, ${ing.note}`;
	return text;
}

/** Very light markdown → plain text conversion, good enough for texting a recipe. */
export function markdownToPlainText(md: string): string {
	return md
		.replace(/^#{1,6}\s+(.+)$/gm, (_m, h: string) => h.toUpperCase())
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/\*([^*]+)\*/g, "$1")
		.replace(/__([^_]+)__/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/!\[\[([^\]]+)\]\]/g, "")
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
		.replace(/\[\[([^\]]+)\]\]/g, "$1")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/^- \[ \] /gm, "☐ ")
		.replace(/^- \[x\] /gim, "☑ ")
		.replace(/^>\s?/gm, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim() + "\n";
}

const PRINT_CSS = `
	* { box-sizing: border-box; }
	body {
		font-family: Georgia, "Times New Roman", serif;
		color: #1a1a1a;
		max-width: 44rem;
		margin: 0 auto;
		padding: 2rem 1.5rem;
		line-height: 1.5;
	}
	h1 { font-size: 1.8rem; margin: 0 0 0.25rem; }
	.meta { color: #555; font-size: 0.95rem; margin-bottom: 1.5rem; }
	.meta span + span::before { content: " · "; }
	h2 {
		font-size: 1.1rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border-bottom: 1px solid #999;
		padding-bottom: 0.2rem;
		margin: 1.5rem 0 0.75rem;
	}
	ul.ingredients { padding-left: 1.2rem; margin: 0; }
	ul.ingredients li { margin: 0.25rem 0; }
	ul.ingredients li.section {
		list-style: none;
		margin-left: -1.2rem;
		font-weight: bold;
		margin-top: 0.75rem;
	}
	ol li, .steps li { margin: 0.5rem 0; }
	.amount { font-weight: bold; }
	.note { color: #555; }
	a { color: inherit; }
	@media print {
		body { padding: 0; }
		@page { margin: 1.6cm; }
	}
`;

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * Build a print-ready HTML document: title, meta line, ingredients, steps.
 * Frontmatter, tags, buttons and everything else are left out by design.
 * Falls back to rendering the whole note if it has no ingredients block.
 */
export async function buildPrintHtml(plugin: RecipeManagerPlugin, file: TFile): Promise<string> {
	const { app } = plugin;
	const content = await app.vault.cachedRead(file);
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	const title = typeof fm?.title === "string" && fm.title.trim() ? fm.title.trim() : file.basename;

	const metaBits: string[] = [];
	const servings = parseServings(fm?.servings);
	if (servings != null) metaBits.push(`Serves ${servings}`);
	if (fm?.prepTime) metaBits.push(`Prep ${escapeHtml(String(fm.prepTime))}`);
	if (fm?.cookTime) metaBits.push(`Cook ${escapeHtml(String(fm.cookTime))}`);
	if (typeof fm?.source === "string" && fm.source.trim()) {
		metaBits.push(escapeHtml(fm.source.trim()));
	}

	const blocks = extractIngredientBlocks(content);
	let bodyHtml = "";

	if (blocks.length > 0) {
		const items: string[] = [];
		let currentSection: string | null = null;
		for (const block of blocks) {
			for (const ing of parseIngredients(block)) {
				if (ing.section !== currentSection) {
					currentSection = ing.section;
					if (currentSection) items.push(`<li class="section">${escapeHtml(currentSection)}</li>`);
				}
				items.push(`<li>${escapeHtml(ingredientText(ing, 1, true))}</li>`);
			}
		}
		bodyHtml += `<h2>Ingredients</h2>\n<ul class="ingredients">\n${items.join("\n")}\n</ul>\n`;

		const stepsMd = extractSection(content, "Steps");
		if (stepsMd) {
			bodyHtml += `<h2>Steps</h2>\n<div class="steps">${await renderMarkdown(plugin, stepsMd, file.path)}</div>\n`;
		}
	} else {
		bodyHtml = await renderMarkdown(plugin, stripFrontmatter(content), file.path);
	}

	const meta = metaBits.length
		? `<div class="meta">${metaBits.map((b) => `<span>${b}</span>`).join("")}</div>`
		: "";

	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${meta}
${bodyHtml}
</body>
</html>
`;
}

async function renderMarkdown(plugin: RecipeManagerPlugin, md: string, sourcePath: string): Promise<string> {
	const holder = createDiv();
	await MarkdownRenderer.render(plugin.app, md, holder, sourcePath, plugin);
	return holder.innerHTML;
}

/** Desktop: print via a hidden iframe so no window juggling is needed. */
export async function printRecipe(plugin: RecipeManagerPlugin, file: TFile): Promise<void> {
	const html = await buildPrintHtml(plugin, file);
	const iframe = activeDocument.createElement("iframe");
	iframe.style.position = "fixed";
	iframe.style.right = "100%";
	iframe.style.bottom = "100%";
	activeDocument.body.appendChild(iframe);
	const doc = iframe.contentWindow?.document;
	if (!doc) {
		iframe.remove();
		throw new Error("Could not create print frame");
	}
	doc.open();
	doc.write(html);
	doc.close();
	// Give the frame a beat to lay out before invoking the print dialog.
	window.setTimeout(() => {
		iframe.contentWindow?.focus();
		iframe.contentWindow?.print();
		window.setTimeout(() => iframe.remove(), 60_000);
	}, 150);
}

/** Everywhere (incl. mobile): write the print HTML next to the note. */
export async function exportPrintHtml(plugin: RecipeManagerPlugin, file: TFile): Promise<string> {
	const html = await buildPrintHtml(plugin, file);
	const dir = file.parent && file.parent.path !== "/" ? file.parent.path + "/" : "";
	const path = normalizePath(`${dir}${file.basename} (print).html`);
	await plugin.app.vault.adapter.write(path, html);
	return path;
}
