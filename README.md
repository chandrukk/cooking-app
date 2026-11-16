# Kitchen Steps

A small personal cooking web app. Pick a dish, choose the style, spice level and number of people, and get one exact recipe with a "before you start" checklist and a step-by-step cooking mode with read-aloud.

- No server, no logins, no paid services. Plain HTML, CSS and JavaScript.
- Recipes live in `js/recipes.js`. To add a dish, copy an existing dish block and edit it; the comments at the top of the file explain each field.
- Quantities scale automatically for 1 to 8 people and are shown in spoons, cups, counts and pounds (never grams).
- Read-aloud uses the free voice built into the phone or browser.

To try it locally, open `index.html` through any simple web server, e.g. `python3 -m http.server`, then visit http://localhost:8000.

Hosted free on GitHub Pages.
