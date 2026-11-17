# Review: Hunu TikTok ad

Render: `renders/tiktok-ad_2026-11-14_20-34-56.mp4`, 1080x1920, 30 fps, 34.7 s, H.264 + AAC.

## Creative calls

- Story: a price is already in front of you; open Hunu; it ranks that price and compares. Not a search story.
- Voice: cheeky. Frames 1 and 3 use Hunu's own verdict headlines; the three sign-off lines are the owner's.
- Data: one real run of the "Rank this deal" flow on 14 Nov 2026 ($9.97 ESP32 development board page, buyer in Accra). Shipping figures are Hunu's estimates. The shop page in scene 1 is a neutral stand-in with a shortened product title.
- Pace: every scene is authored at full speed and played at 0.72x (`tl.timeScale(0.72)` in each scene file), after two requests to slow it down.
- Layout: all text sits inside TikTok's safe area (x 120-960 for y 240-840; x 120-780 for y 840-1260), which is why the comparison table is left-weighted.
- End card says "Coming soon to your browser".

## Sound

- Music: "Arcade Aroma" by Touda (Freesound, CC0), loudness-normalised. It plays for the first second, stops on the record scratch, and returns when Hunu opens.
- Record scratch: "record_scratch.wav" by ludvique (Freesound, CC0). Other effects are from the bundled HyperFrames library.
- Measured, not heard: -17.5 LUFS integrated, true peak -1.8 dBTP, no clipping. Whether the music and the scratch feel right needs a human ear.

## Checked

- `hyperframes check`: no errors. TikTok safe-area warnings: none.
- Looked at 22 frames across every scene and cut after the slowdown.

## Kept on purpose

- `line_unread` on the verdict detail ("5 deals score higher. The cheapest of them is 62% less, delivered."): 2.4 s on screen against a 3.1 s floor. It is product UI text; the headline above it carries the read.
- Safe-area warnings for Instagram Reels and YouTube Shorts: the target is TikTok. Re-check before cross-posting.

## Weakest shot

Scene 4 (comparison table). The table is narrow because TikTok's right-hand buttons take the lower right of the frame. With more time: restack it as one deal per row so the numbers can be larger.

## Open

- Store names were replaced with neutral labels (Online store, Seller A, Seller B, Overseas) at the owner's request.
