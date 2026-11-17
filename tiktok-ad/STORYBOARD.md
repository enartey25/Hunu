---
format: 1080x1920
duration: 23s
message: "You already have a price in front of you. Open Hunu before you pay."
arc: Hook (the price in front of you) → Open Hunu → Verdict → Comparison → Score → Best deal → Wordplay → End card
audience: Students and buyers in Ghana shopping in a browser, on TikTok
voice: cheeky, built on Hunu's own verdict lines
---

Data on every frame is one real run of Hunu's "Rank this deal" flow on 14 Nov 2026
(a $9.97 ESP32 development board page, buyer in Accra, GHS at 11.756 to the dollar).
Shipping figures are Hunu's own estimates.

## Frame 1: Step away (0-2.6s)

- act: The price in front of you
- status: built
- src: compositions/s1-hook.html
- duration: 2.6s
- poster: 1.8s
- transition_in: cut
- scene: A shop page, $9.97, the cursor a hair from "Add to cart"
- reads: the price and the cursor heading for "Add to cart" (0-0.8s); "Step away from the checkout button" (0.8-2.6s)
- sound: near silence, one record-scratch stop as the cursor freezes

The shop page is a neutral stand-in, not a real store's design. The line is one of Hunu's own verdict headlines.

## Frame 2: Second opinion (2.6-5.0s)

- act: Open Hunu
- status: built
- src: compositions/s2-open.html
- duration: 2.4s
- poster: 1.6s
- transition_in: the page slides aside as the Hunu panel docks
- scene: Hunu has already spotted the price on the page; the cursor clicks "Rank this deal"
- reads: "Get a second opinion first" (0-1.2s); "On this page · $9.97" then the click on "Rank this deal" (1.2-2.4s)
- sound: bed enters; click on the button

## Frame 3: The verdict (5.0-8.2s)

- act: The verdict
- status: built
- src: compositions/s3-verdict.html
- duration: 3.2s
- poster: 2.2s
- transition_in: the button becomes the verdict band
- scene: 72%, #6 of 26, "Not bad, but do not settle just yet."
- reads: 72% counts up, "#6 of 26" (0-1.0s); "Not bad, but do not settle just yet." (1.0-2.4s); "5 deals score higher… 62% less, delivered" (2.4-3.2s)
- sound: flap ticks under the count; pop on the highlight

## Frame 4: The other tab (8.2-12.2s)

- act: The comparison
- status: built
- src: compositions/s4-matrix.html
- duration: 4s
- poster: 3s
- transition_in: the verdict band folds down into the comparison header
- scene: This page against two better deals: price, shipping, total landed cost
- reads: "The grass is greener on the other tab" (0-1.4s); prices, then shipping (1.4-2.6s); total landed cost GH₵153 / GH₵173 / GH₵399 (2.6-4.0s)
- sound: soft tick per row; the bed lifts on the landed-cost row

## Frame 5: Shows its working (12.2-15.0s)

- act: The comparison
- status: built
- src: compositions/s5-score.html
- duration: 2.8s
- poster: 1.8s
- transition_in: punch in on the value score row
- scene: 87 / 87 / 72, "Best value" lands, and the four reasons behind the score
- reads: "Yes, it shows its working" (0-1.0s); the scores and "Best value" (1.0-1.8s); the four bars (1.8-2.8s)
- sound: pop on the badge

## Frame 6: The best deal (15.0-17.8s)

- act: The payoff
- status: built
- src: compositions/s6-winner.html
- duration: 2.8s
- poster: 1.8s
- transition_in: the winning column grows into the rank 1 card
- scene: Rank 1: GH₵153 delivered, 87 / 100; the cursor clicks "Go to offer"
- reads: "Now you may check out" (0-1.0s); GH₵153 and 87 / 100 (1.0-2.0s); click on "Go to offer" (2.0-2.8s)
- sound: riser into the click, once

## Frame 7: Hunu it (17.8-20.2s)

- act: The sign-off
- status: built
- src: compositions/s7-claim.html
- duration: 2.4s
- poster: 1.6s
- transition_in: hard cut on the click
- scene: "Cute product. Ugly price. Hunu it."
- reads: "Cute product." (0-0.7s); "Ugly price." (0.7-1.4s); "Hunu it." (1.4-2.4s)
- sound: one hit per line, on the beat

## Frame 8: End card (20.2-23.0s)

- act: The sign-off
- status: built
- src: compositions/s8-end.html
- duration: 2.8s
- poster: 1.8s
- transition_in: the black "Hunu it." block grows to fill the frame
- scene: The mark, "Your wallet called. It said Hunu.", the call to action
- reads: the mark lands (0-0.6s); "Your wallet called. It said Hunu." (0.6-2.0s); "Add Hunu to your browser" (2.0-2.8s)
- sound: bed resolves and fades under the hold
