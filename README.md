# Recipe Manager for Obsidian

Store, scale, and shop from recipes kept as plain Markdown notes in your
vault. Built mobile-first for one-handed kitchen use: big touch targets, no
hover-dependent UI, and recipes that render with zero setup.

- **Scaling** — tap −/+ (or enter a custom multiplier) to scale every
  ingredient; works with cups, grams, cloves, or pinches alike.
- **Fraction toggle** — flip between `0.67` and `2/3` per view; nothing is
  written back to the file.
- **Metric ⇄ US conversion** — a per-view toggle converts displayed units
  (2 cups → 473 ml); the note itself never changes.
- **Grocery lists** — pick recipes + a multiplier for each, and get one
  consolidated Markdown checklist. Matching ingredients auto-combine across
  recipes (12 tsp → 1/4 cup) when their units are compatible.
- **Pantry cross-check** — keep a pantry note of what's on hand and the
  grocery list subtracts it, moving covered items to "Already stocked".
- **Nutrition & cost estimates** — a vault-native ingredient data note
  drives per-recipe calorie/macro totals and grocery-list price estimates.
- **Meal planning** — link a recipe under a `## Meals` heading in any of the
  next seven daily notes, straight from a fuzzy search.
- **Dashboard** — an interactive index note with category chips (Breakfast,
  Entrées, Sauces, Desserts, …) and search across names, tags, and
  ingredients. No Dataview required.
- **Share & print** — one command: copy as Markdown, copy as plain text, or
  produce a clean print layout (ingredients + steps only).

Everything is plain Markdown — no database, fully syncable, git-friendly.

## Installing with BRAT

1. Install the **BRAT** community plugin.
2. In BRAT: *Add beta plugin* → `SilentNinja06/Recipes_obs`.
3. Enable **Recipe Manager** in *Settings → Community plugins*.

Works on desktop and mobile (`isDesktopOnly: false`).

## Writing a recipe

One recipe = one note. Run **Recipe Manager: Create new recipe** — it asks
for the name, type (tap a category chip or type your own), servings, and
prep/cook times, then scaffolds the note with an empty ingredients block
(tap the ✎ pencil to fill it in — no sample text to delete). A filled-in
recipe looks like this:

````markdown
---
title: Blueberry Pancakes
type: breakfast
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

The `type` field drives the dashboard's category chips. Known types (and
their aliases): `breakfast` (brunch), `appetizer` (starter), `soup` (stew,
chili), `salad`, `entree` (main, main course, dinner), `side` (side dish),
`sauce` (condiment, dressing, marinade, dip), `bread` (baking, pastry),
`dessert` (sweet, cake, cookie), `drink` (beverage, cocktail), `snack`.
Anything else becomes its own custom category, tags like `#dessert` or
`#recipe/dessert` work as a fallback, and untyped recipes land in "Other".

### Ingredient line syntax

Each line inside the ` ```recipe-ingredients ` block is:

```
[amount] [unit] [of] ingredient name [, note]
```

| You write | Parsed as |
| --- | --- |
| `2 cups all-purpose flour` | amount 2, unit cup, name "all-purpose flour" |
| `1 1/2 tbsp olive oil, extra virgin` | mixed number, note "extra virgin" |
| `1 and 1/2 cups parmesan` | spelled-out mixed numbers work too |
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
- **as written / US / metric** shows the unit system currently displayed;
  tapping converts to the next one (`2 cups` → `473 ml`, `250 g` →
  `8.8 oz`). Only conversions that actually change the recipe are offered —
  an all-US recipe cycles *as written ⇄ metric* — so the label always
  matches what's on screen. Count units (cloves, pinches) are left alone,
  and the note is never modified.
- **✎ (pencil)** opens the ingredient editor — a structured modal with an
  amount field, a unit picker, and a name field per ingredient (plus
  add/remove and section rows), so there's no free-text syntax to get wrong
  on a phone. Saving rewrites the block in the note as clean lines.
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
- optionally subtracts your pantry and prices items (see below);
- writes a Markdown task list (checkboxes work on mobile) to the grocery
  note — by default `Grocery List.md`, replaced on each run; switch to
  append-a-dated-section mode in settings.

### Pantry cross-check

Keep a `Pantry.md` note (configurable) listing what you have. Use a
` ```recipe-pantry ` code block with the same line syntax as ingredients, or
just plain list lines:

```markdown
- 2 cups flour
- 6 eggs
- salt
- olive oil
```

Tick **Subtract pantry stock** in the grocery builder: amounts you have are
deducted (converting within unit families), partially covered items show the
reduced amount tagged *after pantry*, fully covered items move to an
**Already stocked** section, and bare lines like `salt` count as unlimited.

### Nutrition & cost estimates

Run **Open ingredient data note** once — it scaffolds a note with a
`recipe-ingredient-data` block containing ~40 common ingredients
(USDA-style nutrition, placeholder prices to adjust). One line per
ingredient:

```
all-purpose flour, flour; per 1 cup; kcal 455; protein 13; carbs 95; fat 1.2; cost 0.30
egg, eggs; per 1; kcal 72; protein 6.3; fat 4.8; carbs 0.4; cost 0.35
chicken breast; per 100 g; kcal 165; protein 31; fat 3.6
```

Then **Show nutrition and cost for current recipe** gives total and
per-serving calories, protein, carbs, fat, and estimated cost, with a
"Copy as Markdown" button and an honest list of ingredients it couldn't
match. The grocery list also prices items that have `cost` data and prints
an estimated total. Matching converts within unit families only — data per
100 g never guesses at a recipe's cups — and drops leading adjectives, so
"large eggs" finds "egg".

### Meal planning

**Add recipe to meal plan (daily note)** — fuzzy-search a recipe (or run it
with a recipe open), pick Today/Tomorrow/any of the next 7 days, and the
plugin appends `- [[Recipe]]` under the `## Meals` heading of that daily
note (created if needed, honoring your Daily Notes folder and date format).

### Finding recipes

- **Open recipe (search)** command (and the book ribbon icon) — fuzzy
  search over recipe names and categories from anywhere.
- The **dashboard** (below) searches deeper: names, tags, and ingredients.

### Share / print

**Share or export current note** opens one modal with all formats:

- **Copy as Markdown** — frontmatter stripped, ingredients flattened to a
  plain list; paste anywhere.
- **Copy as plain text** — same, with Markdown syntax removed; for Messages
  or email.
- **Print…** (desktop) — clean ingredients-and-steps layout with print CSS.
- **Export print-ready HTML** — saves `<recipe> (print).html` next to the
  note; on mobile, open/share it from your file manager.

### Recipe dashboard

**Create or update recipe index** generates a note containing a
` ```recipe-dashboard ` block that the plugin renders as an interactive
dashboard: a search box (matching recipe names, tags, categories, and
ingredients — type "chicken" to see everything you can cook with it),
category chips with counts (Breakfast, Soups, Salads, Entrées, Sides,
Sauces, Desserts, …), and a tappable list showing servings and prep/cook
times at a glance. You can also paste that code block into any note of your
own. No Dataview needed; Dataview users can still add their own queries
alongside it.

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
| Show estimated costs | on | Price items with cost data |
| Ingredient data note | `Recipe Ingredient Data.md` | Nutrition + price data |
| Currency symbol | `$` | For cost estimates |
| Pantry note | `Pantry.md` | What you have on hand |
| Subtract pantry by default | off | Pre-checks the grocery option |
| Daily-note heading | `Meals` | Where meal-plan links go |
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
- **Nutrition/cost data**: a plain vault note rather than a bundled
  database or web API — editable anywhere, syncs like everything else,
  works offline, and prices reflect *your* store. Estimates are refused
  rather than guessed when units can't be reconciled.
- **Dashboard**: rendered natively by the plugin instead of relying on
  Dataview, since interactive search and category chips can't be expressed
  in a Dataview table anyway.
