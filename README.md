# 3D Room Portfolio

A personal website presented as a realistic 3D room at dusk, seen from the middle of the room as if you were standing in it. Drag to look around. Objects in the room stand for a social profile or a piece of information about me; small markers float over them. Clicking an object (or its name in the row of buttons at the top) walks you over to it, and an info card shows the content and the link.

## What is in the room

| Object | Shows | Opens |
| --- | --- | --- |
| Ultrawide monitor on the desk | Projects, and a computer you can use | GitHub |
| Plaque on the wall | Experience | LinkedIn |
| Framed photos on the ledge | Life outside work | Instagram |
| Floating shelves | About me | Contact |

The desk stands against a wall of wooden slats with two floating shelves lit by warm LED strips. A softbox and a globe lamp light the right side. The window looks out on a lake at dusk, with mountains and town lights, and ambient sound generated in the browser.

## The computer

The green **Go into the computer** button under the monitor (or a click on the screen when you are at the desk) walks you up to the desk. The camera stops in front of the flat 21:9 monitor with the wall, webcam and desk still around it, and the screen becomes a working desktop that looks like macOS, drawn exactly on the monitor:

- **Finder** opens on the Projects folder. Selecting a project shows what it is, its stack and its link; a README is shown formatted.
- **Terminal** is a small zsh-like shell: `ls`, `cd`, `cat`, `tree`, `mkdir`, `touch`, `cp`, `mv`, `rm`, `echo` with `>` and `>>`, tab completion and history. `node file.js` really runs JavaScript (in a sandbox; Ctrl+C stops it). `help`, `projects` and `about` list everything.
- **VS Code** is a real editor (CodeMirror) laid out like VS Code: explorer, tabs, search, quick open (Ctrl+P), command palette (Ctrl+Shift+P), save (Ctrl+S) and a Run button (F5) that runs the file in the terminal panel.

All three work on the same files, so a file saved in VS Code can be run in the terminal and shows up in Finder. Nothing leaves the browser, and everything resets when the page reloads. **Step back** in the desktop's top bar, or a click anywhere in the room around the screen, takes you back to the desk view.

## Run it

```
npm install
npm run dev
```

Then open http://localhost:5173. Use `npm run build` to produce the static site in `dist/`.

Add `?view=desk`, `?view=frame`, `?view=photos`, `?view=shelf`, `?view=room` or `?view=computer` to the URL to skip the welcome screen and jump straight to a view.

## Edit the content

All text and links live in [src/content.js](src/content.js). The current content is placeholder.

The projects on the computer come from the `projects` list in the same file. Each one becomes a folder in Projects with a README written from its fields (`title`, `description`, `about`, `stack`, `year`, `link`); `files` adds more files to the folder, and `readme` replaces the generated README. The first four projects also appear on the desk's info card.

The framed photos on the ledge are placeholders too. To use your own, replace `public/assets/photos/photo-0.jpg` to `photo-3.jpg` with square JPEGs of about 512 x 512 pixels.

## Assets

The scanned models (money tree, pothos and succulent, lounge chair, sideboard, vases, the small picture frame), the surface textures (floor, plaster, oak, walnut, fabrics) and the placeholder photos come from [Poly Haven](https://polyhaven.com) and are CC0. They live in `public/assets` at 1k resolution, re-compressed, about 13 MB in total. Everything else (walls, slat wall, shelves, desk, monitor, laptop, microphone, chair, softbox, lamps, books) is built in code. The fonts, Instrument Serif, Inter and JetBrains Mono (terminal and editor), load from Google Fonts.

## Where things are

- `src/room.js`: the room, furniture, lights and camera positions
- `src/assets.js`: loads the models, textures and photos
- `src/materials.js`: surface materials and the book spines
- `src/textures.js`: what is drawn on the screens, the plaque and the prints
- `src/outside.js`: the lake at dusk outside the window
- `src/audio.js`: the ambient sound
- `src/main.js`: loading, camera movement, clicks, the info card, and framing the monitor and keeping the desktop on its screen
- `src/style.css`: page styling
- `src/computer/`: the computer on the desk
  - `index.js` starts it, `os.js` is the desktop (menu bar, dock, windows, menus)
  - `finder.js`, `terminal.js` and `code.js` are the three apps; `node.js` runs scripts for `node`
  - `fs.js` is the in-memory file system and `seed.js` the files it starts with
  - `computer.css` styles all of it

Add `?quality=low` to the URL to turn off the contact shadows and render at a lower resolution; otherwise the site lowers its quality by itself if the computer struggles.

Built with Three.js, CodeMirror and Vite. The code for the computer (with the editor) loads in the background after you enter the room. Desktop only for now.
