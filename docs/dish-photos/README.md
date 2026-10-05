# Calgym dish photos: brief for the image generator

**121 photos**, together covering about **1,370 dish names** in English and Arabic. Similar dishes share one photo: Kabsa, Mandi, Machboos, Madfoon, Mathbi and Bukhari rice all use `rice_chicken.png`.

The app shows a dish photo next to a logged meal or recipe when there is no photo of your own. Your own scanned photo always comes first.

## What to send back

- One **ZIP** with all files, named exactly as in `prompts.txt`, for example `rice_chicken.jpg`.
- **Small files:** square **512 × 512**, **JPG at about 80% quality**, so each is about **40–70 KB** and all 121 come to about 5–8 MB in the ZIP. I shrink them again for the app (to about 20 KB each).
  - If the tool can only make large images, that's fine too. Export or resize to 512 × 512 JPG before zipping; any photo editor or website such as squoosh.app does this in bulk.
  - Don't go below 384 × 384, or the photos look soft on large phones.
- If one comes out wrong (text in the picture, the wrong dish, hands, a busy background), regenerate that one. A missing file is fine; that dish keeps today's icon.

## Keep every photo in the same style

This is what makes the list look like one app and not a collage. The style part is the same in every prompt:

> centered and filling about 75% of the frame, seen from a **45-degree angle**, on a **soft light-lavender linen tablecloth**. **Soft natural daylight from the upper left**, gentle soft shadows, realistic home-style portion, appetizing, true colours. **No text, no logos, no watermark, no hands, no people, no other dishes, no cutlery**, plain uncluttered background.

- Plates and bowls: plain round **matte off-white ceramic**. Drinks: a plain clear glass or a plain cup. Breads: a light wooden board.
- Real home or restaurant portions, not styled fine-dining.
- Keep the same lavender cloth and light for all 121, so the photos match each other and Calgym's purple.

## How to run it

1. **Do 6 first** and send them to me: `rice_chicken`, `shawarma_wrap`, `hummus`, `grilled_chicken`, `oats` and `karak`. I'll check them in the real app before you make the rest.
2. Then generate the rest from `prompts.txt`. Each line is `filename | full prompt`, ready to paste.

## Files

- `prompts.txt`: one line per photo, `filename | prompt`.
- `dishes.csv`: the same list with every English and Arabic name each photo covers. The app uses this table to match names, picking the longest name found, so "chicken shawarma wrap" gets the shawarma photo and not plain chicken.
- `build.py`: makes both files. To add a dish later, add a row and run `python3 build.py`.
