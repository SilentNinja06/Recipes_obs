import { App, Modal } from "obsidian";

interface PromptOptions {
	title: string;
	placeholder?: string;
	initial?: string;
	cta?: string;
	inputType?: "text" | "number";
}

/** Small single-input prompt used for recipe names and custom multipliers. */
export class PromptModal extends Modal {
	private options: PromptOptions;
	private onSubmit: (value: string) => void;
	private submitted = false;

	constructor(app: App, options: PromptOptions, onSubmit: (value: string) => void) {
		super(app);
		this.options = options;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		this.titleEl.setText(this.options.title);
		this.modalEl.addClass("rcpm-prompt");

		const input = this.contentEl.createEl("input", {
			type: this.options.inputType ?? "text",
			cls: "rcpm-prompt-input",
		});
		if (this.options.inputType === "number") {
			input.setAttribute("step", "any");
			input.setAttribute("min", "0");
			input.setAttribute("inputmode", "decimal");
		}
		if (this.options.placeholder) input.placeholder = this.options.placeholder;
		if (this.options.initial != null) input.value = this.options.initial;

		const submit = () => {
			const value = input.value.trim();
			if (!value) return;
			this.submitted = true;
			this.close();
			this.onSubmit(value);
		};

		input.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				submit();
			}
		});

		const buttons = this.contentEl.createDiv("rcpm-prompt-buttons");
		const button = buttons.createEl("button", {
			text: this.options.cta ?? "OK",
			cls: "mod-cta",
		});
		button.addEventListener("click", submit);

		window.setTimeout(() => {
			input.focus();
			input.select();
		}, 10);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
