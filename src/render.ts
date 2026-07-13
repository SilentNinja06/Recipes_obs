import { MarkdownRenderChild } from "obsidian";
import { Ingredient, parseIngredients } from "./parse";
import { formatAmount, formatQuantity, unitLabel } from "./units";
import { parseServings } from "./recipes";
import { PromptModal } from "./modals";
import type RecipeManagerPlugin from "./main";

/** Multiplier presets the +/− stepper walks through. */
const STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12];

/**
 * Renders a `recipe-ingredients` code block: scaling stepper, fraction
 * toggle, and the ingredient list itself. Multiplier and fraction state are
 * per-view only — nothing is written back to the file.
 */
export class IngredientsBlock extends MarkdownRenderChild {
	private multiplier = 1;
	private fractions: boolean;
	private ingredients: Ingredient[];

	constructor(
		containerEl: HTMLElement,
		source: string,
		private plugin: RecipeManagerPlugin,
		private sourcePath: string
	) {
		super(containerEl);
		this.ingredients = parseIngredients(source);
		this.fractions = plugin.settings.defaultFractions;
	}

	onload(): void {
		this.render();
	}

	private get servings(): number | null {
		const fm = this.plugin.app.metadataCache.getCache(this.sourcePath)?.frontmatter;
		return parseServings(fm?.servings);
	}

	private setMultiplier(value: number): void {
		if (!isFinite(value) || value <= 0) return;
		this.multiplier = Math.round(value * 1000) / 1000;
		this.render();
	}

	private step(direction: 1 | -1): void {
		if (direction > 0) {
			const next = STEPS.find((s) => s > this.multiplier + 1e-9);
			this.setMultiplier(next ?? this.multiplier + 1);
		} else {
			const prev = [...STEPS].reverse().find((s) => s < this.multiplier - 1e-9);
			if (prev != null) this.setMultiplier(prev);
		}
	}

	private render(): void {
		const el = this.containerEl;
		el.empty();
		el.addClass("rcpm-block");

		// ── Controls ──────────────────────────────────────────────
		const controls = el.createDiv("rcpm-controls");

		const scale = controls.createDiv("rcpm-scale");
		const minus = scale.createEl("button", {
			text: "−",
			cls: "rcpm-btn",
			attr: { "aria-label": "Scale down" },
		});
		minus.addEventListener("click", () => this.step(-1));

		const mult = scale.createEl("button", {
			text: `${formatQuantity(this.multiplier, false)}×`,
			cls: "rcpm-btn rcpm-mult",
			attr: { "aria-label": "Set custom multiplier" },
		});
		mult.addEventListener("click", () => {
			new PromptModal(
				this.plugin.app,
				{
					title: "Scale recipe",
					placeholder: "e.g. 1.5",
					initial: String(this.multiplier),
					cta: "Scale",
					inputType: "number",
				},
				(value) => this.setMultiplier(parseFloat(value.replace(",", ".")))
			).open();
		});

		const plus = scale.createEl("button", {
			text: "+",
			cls: "rcpm-btn",
			attr: { "aria-label": "Scale up" },
		});
		plus.addEventListener("click", () => this.step(1));

		const frac = controls.createEl("button", {
			text: "½",
			cls: "rcpm-btn rcpm-frac",
			attr: {
				"aria-label": "Toggle fraction display",
				"aria-pressed": String(this.fractions),
			},
		});
		if (this.fractions) frac.addClass("rcpm-active");
		frac.addEventListener("click", () => {
			this.fractions = !this.fractions;
			this.render();
		});

		const servings = this.servings;
		if (servings != null) {
			controls.createSpan({
				text: `Serves ${formatQuantity(servings * this.multiplier, false)}`,
				cls: "rcpm-servings",
			});
		}

		// ── Ingredient list ───────────────────────────────────────
		const list = el.createEl("ul", { cls: "rcpm-list" });
		let currentSection: string | null = null;
		for (const ing of this.ingredients) {
			if (ing.section !== currentSection) {
				currentSection = ing.section;
				if (currentSection) {
					list.createEl("li", { text: currentSection, cls: "rcpm-section" });
				}
			}
			const li = list.createEl("li", { cls: "rcpm-item" });
			if (ing.amount) {
				const value = (ing.amount.high ?? ing.amount.low) * this.multiplier;
				let text = formatAmount(ing.amount, this.multiplier, this.fractions);
				if (ing.unit) text += ` ${unitLabel(ing.unit, value)}`;
				li.createSpan({ text, cls: "rcpm-amount" });
				li.appendText(" ");
			}
			li.appendText(ing.name);
			if (ing.toTaste) {
				li.createSpan({ text: ", to taste", cls: "rcpm-note" });
			}
			if (ing.note) {
				li.createSpan({ text: `, ${ing.note}`, cls: "rcpm-note" });
			}
		}
	}
}
