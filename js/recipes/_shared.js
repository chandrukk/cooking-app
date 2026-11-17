/*
  Recipe library.

  How to add a dish: copy one of the dish files in this folder, change it,
  and add a <script> line for it in index.html (nothing else needs changing).
  Everything is plain data; the app does the scaling and formatting.

  Ingredient fields
    k     key, used in step text as {key}
    n     name (plural form for counted things, e.g. "medium onions")
    one   singular form, if different (e.g. "medium onion")
    q     quantity for the style's base servings (usually 4).
          Can be { mild, medium, hot }. A 0 hides the line at that spice level.
    u     unit: tsp, tbsp, cup, lb, count, inch, sprig
    c     shopping group: meat, veg, spice, dairy, pantry, none (none = not on shopping list, e.g. water)
    s     recipe section heading (e.g. "Marinade")
    note  prep note shown after the name (e.g. "thinly sliced")
    sc    scaling: "whole" for whole spices (grows more slowly than servings), "fixed" for never scaled
    m     only for these cooking methods, e.g. ["pc", "ip"]

  Step fields
    t     text. {key} inserts the scaled ingredient. {@vessel} inserts text from the chosen method.
    h     heat (string, or { methodId: string })
    d     time (string, or { methodId: string })
    m     only for these methods
    sp    only for these spice levels
    list  show the ingredients of this recipe section under the step
*/

// ---------- shared pieces ----------

const PC_IP_POT = [
  { id: 'pc', name: 'Pressure cooker', blurb: 'Fastest on the gas stove.', vessel: 'pressure cooker' },
  { id: 'ip', name: 'Instant Pot', blurb: 'Hands-off, no whistles to count.', vessel: 'Instant Pot' },
  { id: 'pot', name: 'Heavy pot, no pressure', blurb: 'Slow and simple. Takes longest.', vessel: 'heavy pan' },
];

const OVEN_PAN = [
  { id: 'oven', name: 'Oven', blurb: 'Smoky charred tikka, less splatter.' },
  { id: 'pan', name: 'Pan on the stove', blurb: 'No oven needed. Cook in two batches.' },
];

// Tikka steps shared by both tikka masala styles
function tikkaSteps() {
  return [
    { t: 'Cut the {chicken} into 1½-inch pieces. Pat them dry with paper towel.', d: '5 min' },
    { t: 'In a large bowl, mix the chicken with everything listed below until every piece is coated. Cover and marinate.', list: 'Tikka marinade', d: '30 min (or up to 24 hours in the fridge)' },
    { m: ['oven'], t: 'Heat the oven to 475°F. Line a baking tray with foil and brush the foil with {trayoil}.', d: '10 min to heat' },
    { m: ['oven'], t: 'Spread the chicken on the tray in a single layer, pieces not touching. Bake on the top rack.', h: '475°F', d: '15 min' },
    { m: ['oven'], t: 'Switch the oven to Broil (High). Broil until the edges have dark charred spots. Watch closely so it does not burn. Set aside.', h: 'Broil, High', d: '3–4 min' },
    { m: ['pan'], t: 'Heat {panoil} in a large non-stick or cast-iron pan until it shimmers. Add half the chicken in a single layer.', h: 'Medium-high flame', d: '2 min' },
    { m: ['pan'], t: 'Cook without moving for 3 minutes until charred underneath. Turn the pieces and cook 2 to 3 minutes more. Move to a plate. Repeat with the rest of the chicken. It finishes cooking in the sauce.', h: 'Medium-high flame', d: '12 min total' },
  ];
}

function tikkaMarinade(chilli) {
  return [
    { k: 'chicken', n: 'boneless skinless chicken thighs', q: 2, u: 'lb', c: 'meat', s: 'Tikka marinade', note: 'or breasts' },
    { k: 'tyog', n: 'thick plain yogurt (Greek)', q: 0.5, u: 'cup', c: 'dairy', s: 'Tikka marinade' },
    { k: 'tggp', n: 'ginger garlic paste', q: 1, u: 'tbsp', c: 'pantry', s: 'Tikka marinade' },
    { k: 'tchilli', n: 'Kashmiri red chilli powder', q: chilli, u: 'tsp', c: 'spice', s: 'Tikka marinade' },
    { k: 'tgaram', n: 'garam masala', q: 1, u: 'tsp', c: 'spice', s: 'Tikka marinade' },
    { k: 'tcumin', n: 'ground cumin', q: 1, u: 'tsp', c: 'spice', s: 'Tikka marinade' },
    { k: 'tturmeric', n: 'turmeric powder', q: 0.5, u: 'tsp', c: 'spice', s: 'Tikka marinade' },
    { k: 'tsalt', n: 'salt', q: 1, u: 'tsp', c: 'spice', s: 'Tikka marinade' },
    { k: 'tlemon', n: 'lemon juice', q: 1, u: 'tbsp', c: 'pantry', s: 'Tikka marinade' },
    { k: 'toil', n: 'neutral oil', q: 1, u: 'tbsp', c: 'pantry', s: 'Tikka marinade' },
    { k: 'trayoil', n: 'neutral oil', q: 1, u: 'tbsp', c: 'pantry', s: 'Cooking the tikka', m: ['oven'], note: 'for the tray' },
    { k: 'panoil', n: 'neutral oil', q: 2, u: 'tbsp', c: 'pantry', s: 'Cooking the tikka', m: ['pan'], note: 'used in two batches' },
  ];
}

// Dal cooking steps shared by the three sambar styles
function dalSteps() {
  return [
    { t: 'Wash the {dal} in a bowl of water, rubbing gently, 3 times until the water is only slightly cloudy. Drain.', d: '2 min' },
    { m: ['pc'], t: 'Put the dal in the pressure cooker with {dalwater}, {dturmeric} and {doil}. Close with the weight on. Cook for 4 whistles, then turn off and let the pressure drop by itself.', h: 'Medium flame', d: 'about 15 min + 10 min to release' },
    { m: ['ip'], t: 'Put the dal in the Instant Pot with {dalwater}, {dturmeric} and {doil}. Close, set the valve to Sealing, and Pressure Cook on High. Let the pressure release naturally.', h: 'Pressure Cook, High', d: '10 min + 10 min natural release' },
    { m: ['pot'], t: 'Put the dal in a pot with {dalwaterpot}, {dturmeric} and {doil}. Bring to a boil, then partly cover and simmer, stirring every 10 minutes, until the dal is very soft and falls apart. Add ½ cup hot water if it gets dry.', h: 'High to boil, then low flame', d: '40–45 min' },
    { t: 'Mash the cooked dal smooth with the back of a ladle or a whisk. Set aside.', d: '1 min' },
  ];
}

function dalIngredients() {
  return [
    { k: 'dal', n: 'toor dal (split pigeon peas)', q: 0.5, u: 'cup', c: 'pantry', s: 'Dal' },
    { k: 'dalwater', n: 'water', q: 1.5, u: 'cup', c: 'none', s: 'Dal', m: ['pc', 'ip'] },
    { k: 'dalwaterpot', n: 'water', q: 2.5, u: 'cup', c: 'none', s: 'Dal', m: ['pot'] },
    { k: 'dturmeric', n: 'turmeric powder', q: 0.25, u: 'tsp', c: 'spice', s: 'Dal' },
    { k: 'doil', n: 'oil', q: 0.5, u: 'tsp', c: 'pantry', s: 'Dal' },
  ];
}

window.RECIPES = [];
const RECIPES = window.RECIPES;
