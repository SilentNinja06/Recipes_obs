# Recipe Manager for Obsidian

Store, scale, and shop from recipes kept as plain Markdown notes in your
vault. Built mobile-first for one-handed kitchen use: big touch targets, no
hover-dependent UI, and recipes that render with zero setup.

- **Scaling** — tap −/+ (or enter a custom multiplier) to scale every
  ingredient; works with cups, grams, cloves, or pinches alike.
- **Fraction toggle** — flip between `0.67` and `2/3` per view; nothing is
  written back to the file.
- **Grocery lists** — pick recipes + a multiplier for each, and get one
  consolidated Markdown checklist. Matching ingredients auto-combine across
  recipes (12 tsp → 1/4 cup) when their units are compatible.
- **Share & print** — one command: copy as Markdown, copy as plain text, or
  produce a clean print layout (ingredients + steps only).
- **Recipe index** — generated dashboard note, Dataview-powered when
  Dataview is installed, static table otherwise.

Everything is plain Markdown — no database, fully syncable, git-friendly.

## Installing with BRAT

1. Install the **BRAT** community plugin.
2. In BRAT: *Add beta plugin* → `SilentNinja06/Recipes_obs`.
3. Enable **Recipe Manager** in *Settings → Community plugins*.

Works on desktop and mobile (`isDesktopOnly: false`).

## Writing a recipe

One recipe = one note. Run **Recipe Manager: Create new recipe** to get this
scaffold:

````markdown
---
title: Blueberry Pancakes
servings: 4
prepTime: 10 min
cookTime: 15 min
tags: [recipe, breakfast]
source: https://example.com/blueberry-pancakes
image:
---

# Blueberry Pancakes

```recipe-ingredients
# Batter
2 cups all-purpose flour
1 3/4 cups milk
2 large eggs
3 tbsp butter, melted

# Add-ins
1 cup blueberries, fresh or frozen
maple syrup, to taste
```

## Steps

1. Whisk the dry ingredients…

## Notes

- Variations, substitutions, whatever.
````

A note counts as a recipe if it lives in the recipes folder **or** carries
the recipe tag (both configurable in settings).

### Ingredient line syntax

Each line inside the ` ```recipe-ingredients ` block is:

```
[amount] [unit] [of] ingredient name [, note]
```

| You write | Parsed as |
| --- | --- |
| `2 cups all-purpose flour` | amount 2, unit cup, name "all-purpose flour" |
| `1 1/2 tbsp olive oil, extra virgin` | mixed number, note "extra virgin" |
| `½ cup milk` / `1½ cups sugar` | unicode fractions work |
| `2-3 tbsp water` / `2 to 3 tbsp water` | a range; both ends scale |
| `3 cloves garlic, minced` | count unit "clove" — scales, never converts |
| `2 large eggs` | amount 2, no unit; "large eggs" stays in the name |
| `400 g canned tomatoes` | metric weight |
| `salt, to taste` | unscaled "to taste" item |
| `# Sauce` | section header inside the list |
| `// only for weekends` | comment, ignored |

Amounts are stored as decimals internally, so scaling is exact regardless of
how you wrote the number. Recognized units: tsp/tbsp/fl oz/cup/pint/quart/
gallon, ml/dl/l, mg/g/kg, oz/lb, plus count-style measures (clove, can,
slice, bunch, pinch, dash, …). Unrecognized words are simply part of the
ingredient name — the line still renders and scales if it starts with a
number.

## Using it

### Scaling & fractions

Every rendered ingredients block gets a control row:

- **− / +** step through common multipliers (0.25×–12×); tap the middle
  **1×** button to type any custom value.
- **½** toggles fraction display (`0.75` ↔ `3/4`). Per-view only; the
  default is configurable in settings.
- The *Serves N* label updates with the multiplier (from `servings` in
  frontmatter).

### Grocery list

Run **Build grocery list** (command palette or the cart ribbon icon), tick
recipes, set a multiplier per recipe, generate. The plugin:

- sums ingredients whose name matches and whose units are compatible
  (volume↔volume, weight↔weight), normalizing to a sensible unit — e.g.
  `1 cup flour` + `8 tbsp flour` → `1 1/2 cups flour`;
- combines count units only when identical (`cloves` + `cloves`, never
  `cloves` + `heads`), and lists incompatible pairs (like `1 cup milk` +
  `200 g milk`) separately instead of guessing;
- merges `salt, to taste` style items into a single line;
- writes a Markdown task list (checkboxes work on mobile) to the grocery
  note — by default `Grocery List.md`, replaced on each run; switch to
  append-a-dated-section mode in settings.

### Share / print

**Share or export current note** opens one modal with all formats:

- **Copy as Markdown** — frontmatter stripped, ingredients flattened to a
  plain list; paste anywhere.
- **Copy as plain text** — same, with Markdown syntax removed; for Messages
  or email.
- **Print…** (desktop) — clean ingredients-and-steps layout with print CSS.
- **Export print-ready HTML** — saves `<recipe> (print).html` next to the
  note; on mobile, open/share it from your file manager.

### Recipe index

**Create or update recipe index** generates a dashboard note. With Dataview
installed you get a live table (recipe, servings, prep, cook, tags —
filterable by editing the query); without it, a static snapshot table plus a
warning callout.

## Settings

| Setting | Default | |
| --- | --- | --- |
| Recipes folder | `Knowledge base/Recipes` | Notes here are recipes |
| Recipe tag | `recipe` | Tagged notes anywhere are recipes too |
| Show fractions by default | off | Per-view toggle always overrides |
| Grocery list note | `Grocery List.md` | Where lists are written |
| Existing-note behavior | Replace | Or append a dated section |
| Show source recipes | on | Annotate items with their recipes |
| Fractions in grocery list | on | Kitchen fractions for US units |
| Index note | `Recipe Index.md` | Where the dashboard goes |

## Development

```bash
npm install
npm test        # vitest: parser, units, combining engine
npm run build   # type-check + bundle to main.js
npm run dev     # watch mode
```

Copy `main.js`, `manifest.json`, and `styles.css` into
`<vault>/.obsidian/plugins/recipe-manager/` to test locally. The
`examples/` folder has two sample recipes to drop into a vault.

### Releasing

```bash
npm version patch   # bumps manifest.json + versions.json too
git push && git push --tags
```

The GitHub Action builds and attaches `main.js`, `manifest.json`, and
`styles.css` to a release named after the tag — the layout BRAT expects.

## Design decisions

- **Ingredient syntax**: natural free text with a leading amount, parsed
  against a unit-alias table — human-editable first, with parse reliability
  coming from the structured code block boundary rather than rigid syntax.
- **Unit interchange scope**: only within a family — volume (tsp…gallon,
  ml/dl/l) and weight (mg…kg, oz/lb). Volume↔weight is never guessed (no
  density table), count units never convert. Combined totals display in the
  measurement system most of the sources used.
- **Grocery note**: persistent, re-run into (replace or append modes) rather
  than transient — so it syncs to your phone and survives restarts.
