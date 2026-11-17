# 3D Room Portfolio

A personal website presented as a cozy, realistic 3D room at sunset, seen from inside as if you were standing in it. Drag to look around. Each corner holds an object that stands for a social profile or a piece of information about me. Clicking an object walks you over to it, and the object and its info card show the content and the link.

## What is in the room

| Object | Shows | Opens |
| --- | --- | --- |
| Desk and monitors | Projects | GitHub |
| Framed page on the wall | Experience | LinkedIn |
| Photos on a string | Life outside work | Instagram |
| Bookshelf | About me | Contact |

The window looks out on a sunset over the sea, with ambient waves, breeze and birds generated in the browser.

## Run it

```
npm install
npm run dev
```

Then open http://localhost:5173. Use `npm run build` to produce the static site in `dist/`.

Add `?view=desk`, `?view=frame`, `?view=photos`, `?view=shelf` or `?view=room` to the URL to skip the welcome screen and jump straight to a view.

## Edit the content

All text and links live in [src/content.js](src/content.js). The current content is placeholder.

The photos on the string and in the desk frame are placeholders too. To use your own, replace `public/assets/photos/photo-0.jpg` to `photo-4.jpg` and `frame.jpg` with square JPEGs of about 512 x 512 pixels.

## Assets

The scanned models (plants, lounge chair, sideboard, lamps, vases, books, photo frame), the surface textures (floor, plaster, oak, walnut, fabrics) and the placeholder photos come from [Poly Haven](https://polyhaven.com) and are CC0. They live in `public/assets` at 1k resolution, re-compressed, about 15 MB in total. The rest of the room (walls, sofa, desk, monitors, keyboard, bookshelf, rug pattern, book spines) is built in code.

## Where things are

- `src/room.js`: the room, furniture, lights and camera positions
- `src/assets.js`: loads the models, textures and photos
- `src/materials.js`: surface materials, the rug and the book spines
- `src/textures.js`: what is drawn on the screens, the framed page and the posters
- `src/outside.js`: the sunset sky and sea outside the window
- `src/audio.js`: the ambient sound
- `src/main.js`: loading, camera movement, clicks and the info card
- `src/style.css`: page styling

Add `?quality=low` to the URL to turn off the contact shadows and render at a lower resolution; otherwise the site lowers its quality by itself if the computer struggles.

Built with Three.js and Vite. Desktop only for now.
