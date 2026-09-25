# Room imagery

All assets are bundled here and served locally. Codespaces does not need image-generation credentials or runtime image downloads.

- `floor.jpg`: [Large Floor Tiles 02](https://polyhaven.com/a/large_floor_tiles_02), Rob Tuytel / Poly Haven. CC0, public domain. Downloaded 2026-09-24 from [the 1K diffuse map](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/large_floor_tiles_02/large_floor_tiles_02_diff_1k.jpg). [License](https://polyhaven.com/license).
- `robot.png`, `parcel.png`, `key.png`: generated using the built-in imagegen tool on 2026-09-24. These are realistic synthetic images, not photographs. Original transparent PNGs retained without conversion.
- Raised walls, door panels, markings and score overlays are CSS/HTML so that they follow the editable grid.

## Generation prompts (built-in tool, no CLI)

### robot.png

Use case: product-mockup. Asset type: room planning simulator sprite. Primary request: one small autonomous warehouse robot, compact circular white body, dark rubber wheels and green status light, seen directly from above in orthographic top-down view. Realistic industrial product photography, detailed plastic and metal surfaces, soft studio lighting. Single centered object occupies 75 percent of a square canvas. Fully transparent background with alpha; no floor, no text, no logos, no other objects. This will be displayed at 45 pixels wide so silhouette must be clear.

### parcel.png

Use case: product-mockup. Asset type: room planning simulator parcel sprite. Primary request: one sealed small square brown corrugated cardboard shipping box with tan packing tape across the top. Viewed directly from above orthographic, photorealistic materials, soft studio lighting, crisp readable silhouette at 45 pixels. Centered object occupying 75 percent of square canvas. Transparent alpha background, no floor, no text, no labels, no logos, no other objects.

### key.png

Use case: product-mockup. Asset type: room planning simulator key sprite. Primary request: a single realistic brass door key with broad round bow and clearly cut teeth, lying diagonally, photographed directly from above. Photorealistic warm brass with fine scratches, soft studio lighting, crisp silhouette readable at 45 pixels. Centered single key occupies 75 percent of a square canvas. Fully transparent alpha background, no floor, no ring, no text, no logos, no additional objects.
