# Dusk Desk

A realistic 3D room at dusk, seen from the middle of the room as if you were standing in it. The computer on the desk is where you focus: pomodoro sessions you can share with friends through a link, with small turn-based games to play together.

**Status:** the room, the computer and a solo pomodoro timer work. Shared sessions and games are next (see [Roadmap](#roadmap)).

## The room

Drag to look around. Some objects say something about me; small markers float over them, and clicking one (or its name in the row of buttons at the top) walks you over to it and shows an info card with a link.

| Object | Shows | Opens |
| --- | --- | --- |
| Plaque on the wall | Experience | LinkedIn |
| Framed photos on the ledge | Life outside work | Instagram |
| Floating shelves | About me | Contact |

The desk stands against a wall of wooden slats with two floating shelves lit by warm LED strips. A softbox and a globe lamp light the right side. The window looks out on a lake at dusk, with mountains and town lights, and ambient sound generated in the browser.

## The computer

The green button under the monitor, or a click on the desk, walks you up to it. The camera stops in front of the flat 21:9 monitor with the wall, webcam and desk still around it, and the screen becomes a working desktop drawn exactly on the monitor. It has two apps:

- **Pomodoro**, which opens on your first visit: focus, then a short break, with a long break after every few focus sessions (25, 5 and 15 minutes, and 4 sessions, by default; all can be changed in its settings). Start, pause (also with Space), reset, skip, or pick a phase by hand.
- **Terminal**: a small zsh-like shell over an in-memory file system, with `ls`, `cd`, `cat`, `tree`, `mkdir`, `touch`, `cp`, `mv`, `rm`, `echo` with `>` and `>>`, tab completion and history. `help` lists everything and `about` shows who I am. Its files reset when the page reloads.

The timer keeps running when you close the app or step back into the room. The monitor seen from the room shows it, the green button under the monitor shows the time left, and so does the tab's title. When a phase ends a soft chime plays (it can be turned off in the timer's settings, and the room's Sound button does not silence it), and if the tab is in the background the browser shows a notification (the page asks once, the first time you press Start). The timer and its settings are kept in the browser, so a reload carries on where it was.

**Step back** in the desktop's top bar, or a click anywhere in the room around the screen, takes you back to the desk view.

## Roadmap

1. ~~**Pomodoro on the computer.** A focus and break timer with sound and notifications.~~ Done.
2. **Sessions by link.** Create a session, share the link, friends join with a nickname. One shared timer for everyone, no accounts. Each person stays in their own room; only the computer screen is shared.
3. **Games.** Small turn-based games for the people in a session. Starting a game pauses the shared timer for everyone, and it continues from the same time when the game ends.
4. **Ready to deploy.** Smaller downloads, a clear message when WebGL is missing or a download fails, a link preview image, and a notice for phones (Dusk Desk is for computers only).

## Run it

```
npm install
npm run dev
```

Then open http://localhost:5173. Use `npm run build` to produce the static site in `dist/`.

Add `?view=desk`, `?view=frame`, `?view=photos`, `?view=shelf` or `?view=computer` to the URL to skip the welcome screen and jump straight to a view. Add `?quality=low` to turn off the contact shadows and render at a lower resolution; otherwise the site lowers its quality by itself if the computer struggles.

## Edit the content

All text and links live in [src/content.js](src/content.js): `site` is the name and tagline of Dusk Desk, `profile` and `stations` are about me. The text about me is placeholder for now.

The framed photos on the ledge are placeholders too. To use your own, replace `public/assets/photos/photo-0.jpg` to `photo-3.jpg` with square JPEGs of about 512 x 512 pixels.

## Assets

The scanned models (money tree, pothos and succulent, lounge chair, sideboard, vases, the small picture frame), the surface textures (floor, plaster, oak, walnut, fabrics) and the placeholder photos come from [Poly Haven](https://polyhaven.com) and are CC0. They live in `public/assets` at 1k resolution, re-compressed, about 13 MB in total. Everything else (walls, slat wall, shelves, desk, monitor, laptop, microphone, chair, softbox, lamps, books) is built in code. The fonts, Instrument Serif, Inter and JetBrains Mono (the terminal), load from Google Fonts.

## Where things are

- `src/room.js`: the room, furniture, lights and camera positions
- `src/assets.js`: loads the models, textures and photos
- `src/materials.js`: surface materials and the book spines
- `src/textures.js`: what is drawn on the screens, the plaque and the prints
- `src/outside.js`: the lake at dusk outside the window
- `src/audio.js`: the ambient sound and the timer's chime
- `src/pomodoro.js`: the pomodoro timer (it stores when a phase ends, not a running count, so background tabs cannot make it drift)
- `src/main.js`: loading, camera movement, clicks, the info card, the timer's alerts and title, and framing the monitor and keeping the desktop on its screen
- `src/style.css`: page styling
- `src/computer/`: the computer on the desk
  - `index.js` starts it, `os.js` is the desktop (menu bar, dock, windows, menus, notifications)
  - `pomodoro-app.js` is the Pomodoro app, the timer's face on the desktop
  - `terminal.js` is the Terminal, `fs.js` the in-memory file system and `seed.js` the files it starts with
  - `computer.css` styles all of it

Built with Three.js and Vite. The code for the computer loads in the background after you enter the room. Desktop only.
