import { MarkdownRenderChild } from "obsidian";
import { Ingredient, parseIngredients } from "./parse";
import {
	formatAmount,
	formatQuantity,
	formatQuantityForUnit,
	normalizeBase,
	unitLabel,
} from "./units";
import { parseServings } from "./recipes";
import { PromptModal } from "./modals";
import type RecipeManagerPlugin from "./main";

/** Multiplier presets the +/− stepper walks through. */
const STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12];

type DisplaySystem = "original" | "us" | "metric";

const SYSTEM_CYCLE: DisplaySystem[] = ["original", "us", "metric"];
const SYSTEM_LABEL: Record<DisplaySystem, string> = {
	original: "as written",
	us: "US",
	metric: "metric",
};

/**
 * Renders a `recipe-ingredients` code block: scaling stepper, fraction
 * toggle, unit-system toggle, and the ingredient list itself. All state is
 * per-view only — nothing is written back to the file.
 */
export class IngredientsBlock extends MarkdownRenderChild {
	private multiplier = 1;
	private fractions: boolean;
	private system: DisplaySystem = "original";
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

	/** Amount + unit text for one ingredient, honoring scale, fractions, and unit system. */
	private amountText(ing: Ingredient): string | null {
		if (!ing.amount) return null;
		const mult = this.multiplier;
		const convertible =
			this.system !== "original" &&
			ing.unit != null &&
			(ing.unit.family === "volume" || ing.unit.family === "weight");

		if (convertible) {
			const family = ing.unit!.family as "volume" | "weight";
			const system = this.system as "us" | "metric";
			const norm = normalizeBase(ing.amount.low * mult * ing.unit!.toBase, family, system);
			let text = formatQuantityForUnit(norm.value, norm.unit, this.fractions);
			let labelValue = norm.value;
			if (ing.amount.high != null) {
				const high = (ing.amount.high * mult * ing.unit!.toBase) / norm.unit.toBase;
				text += `–${formatQuantityForUnit(high, norm.unit, this.fractions)}`;
				labelValue = high;
			}
			return `${text} ${unitLabel(norm.unit, labelValue)}`;
		}

		let text = formatAmount(ing.amount, mult, this.fractions);
		if (ing.unit) {
			const value = (ing.amount.high ?? ing.amount.low) * mult;
			text += ` ${unitLabel(ing.unit, value)}`;
		}
		return text;
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

		const system = controls.createEl("button", {
			text: SYSTEM_LABEL[this.system],
			cls: "rcpm-btn rcpm-system",
			attr: { "aria-label": "Convert units (as written / US / metric)" },
		});
		if (this.system !== "original") system.addClass("rcpm-active");
		system.addEventListener("click", () => {
			const idx = SYSTEM_CYCLE.indexOf(this.system);
			this.system = SYSTEM_CYCLE[(idx + 1) % SYSTEM_CYCLE.length];
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
			const amount = this.amountText(ing);
			if (amount) {
				li.createSpan({ text: amount, cls: "rcpm-amount" });
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
