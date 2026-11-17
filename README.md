# 3D Room Portfolio

A personal website presented as a realistic 3D room at dusk, seen from the middle of the room as if you were standing in it. Drag to look around. Objects in the room stand for a social profile or a piece of information about me; small markers float over them. Clicking an object (or its name in the row of buttons at the top) walks you over to it, and an info card shows the content and the link.

## What is in the room

| Object | Shows | Opens |
| --- | --- | --- |
| Ultrawide monitor on the desk | Projects | GitHub |
| Plaque on the wall | Experience | LinkedIn |
| Framed photos on the ledge | Life outside work | Instagram |
| Floating shelves | About me | Contact |

The desk stands against a wall of wooden slats with two floating shelves lit by warm LED strips. A softbox and a globe lamp light the right side. The window looks out on a lake at dusk, with mountains and town lights, and ambient sound generated in the browser.

## Run it

```
npm install
npm run dev
```

Then open http://localhost:5173. Use `npm run build` to produce the static site in `dist/`.

Add `?view=desk`, `?view=frame`, `?view=photos`, `?view=shelf` or `?view=room` to the URL to skip the welcome screen and jump straight to a view.

## Edit the content

All text and links live in [src/content.js](src/content.js). The current content is placeholder.

The framed photos on the ledge are placeholders too. To use your own, replace `public/assets/photos/photo-0.jpg` to `photo-3.jpg` with square JPEGs of about 512 x 512 pixels.

## Assets

The scanned models (money tree, pothos and succulent, lounge chair, sideboard, vases, the small picture frame), the surface textures (floor, plaster, oak, walnut, fabrics) and the placeholder photos come from [Poly Haven](https://polyhaven.com) and are CC0. They live in `public/assets` at 1k resolution, re-compressed, about 13 MB in total. Everything else (walls, slat wall, shelves, desk, monitor, laptop, microphone, chair, softbox, lamps, books) is built in code. The fonts, Instrument Serif and Inter, load from Google Fonts.

## Where things are

- `src/room.js`: the room, furniture, lights and camera positions
- `src/assets.js`: loads the models, textures and photos
- `src/materials.js`: surface materials and the book spines
- `src/textures.js`: what is drawn on the screens, the plaque and the prints
- `src/outside.js`: the lake at dusk outside the window
- `src/audio.js`: the ambient sound
- `src/main.js`: loading, camera movement, clicks and the info card
- `src/style.css`: page styling

Add `?quality=low` to the URL to turn off the contact shadows and render at a lower resolution; otherwise the site lowers its quality by itself if the computer struggles.

Built with Three.js and Vite. Desktop only for now.
