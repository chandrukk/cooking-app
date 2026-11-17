# Kitchen Steps

A small personal cooking web app. Pick a dish, choose the style, spice level and number of people, and get one exact recipe with a "before you start" checklist and a step-by-step cooking mode with read-aloud.

- No server, no logins, no paid services. Plain HTML, CSS and JavaScript.
- Recipes live in `js/recipes/`, one file per dish. To add a dish, copy a dish file, edit it, and add a `<script>` line for it in `index.html`. The comments at the top of `js/recipes/_shared.js` explain each field.
- Quantities scale automatically for 1 to 8 people and are shown in spoons, cups, counts and pounds (never grams).
- Read-aloud uses the free voice built into the phone or browser.

To try it locally, open `index.html` through any simple web server, e.g. `python3 -m http.server`, then visit http://localhost:8000.

Hosted free on GitHub Pages.

Features: cuisine filters, change spice and people on the recipe page, all-ingredients view while cooking, "continue cooking" on reopen, step timers, and offline use after the first visit (`sw.js`).
