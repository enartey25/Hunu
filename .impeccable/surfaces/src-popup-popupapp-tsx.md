---
version: 1
slug: "src-popup-popupapp-tsx"
primary_target: "src/popup/PopupApp.tsx"
related_targets: ["src/sidepanel/SidepanelApp.tsx","src/content/content-script.ts"]
---

# Hunu extension UI (popup, side panel, modals, in-page assist)

Scope: every extension surface. Mode: Operate. Task: search a product, read the ranked deals, compare up to three, go to the best offer. Must keep: all existing functions and engine behavior. Open: whether the B2B services catalogue stays a secondary mode.

## Direction contract

THESIS: Hunu signs the way to the best deal the way an airport signs the way to a gate: one yellow band, one message, the rank at gate-number scale. It refuses the white rounded-card deal list with a small score badge.

OWN-WORLD: Sign yellow #FFD100 owns the header and every "this way" surface; black #111111 type and black lead band; white pictograms on black squares; result bands in white on a warm grey ground #F1EFE8; blue #1F6FEB only for links. Hind humanist sans, sentence case, 2px black control borders, 4px corners.

STORY: The user types a product, sees which deal wins and why (landed cost, distance, score), compares the top ones, and follows the arrow to the offer.

FIRST VIEWPORT: Yellow header band with wordmark, location pictogram, search field and sort tabs. Below it a black lead band: rank 1 at 76px in yellow, seller name, a yellow "Go to offer" button with arrow, and three facts (landed cost, distance, score). Then white bands for ranks 2 to 4 with 44px numerals, seller, distance line, price and score right-aligned. A yellow foot band carries the compare count and "Open comparison".

SIGNATURE: Monumental rank numerals plus the arrow that points to the offer; changing sort re-signs the bands. Motion: a band update swaps like a split-flap line, once, on re-rank; reduced motion snaps.

FORM: airport wayfinding sign system, a dealt challenger chosen by the user over the assigned direction; seed:eeb0dc5a891371f1.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
