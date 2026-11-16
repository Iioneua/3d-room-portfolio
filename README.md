# 3D Room Portfolio

A personal website presented as a cozy, low-poly 3D room. Each corner holds an object that stands for a social profile or a piece of information about me. Clicking an object flies the camera to it, and the object and its info card show the content and the link.

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

## Where things are

- `src/room.js`: the room, furniture, lights and camera positions
- `src/textures.js`: what is drawn on the screens, the frame and the photos
- `src/windowView.js`: the sunset outside the window
- `src/audio.js`: the ambient sound
- `src/main.js`: camera movement, clicks and the info card
- `src/style.css`: page styling

Built with Three.js and Vite. Desktop only for now.
