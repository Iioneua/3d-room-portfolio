# Dusk Desk: progress

Where the project stands, the decisions behind it and what comes next. Read this first when picking the work up again. For how to run the site and where the code lives, see [README.md](README.md).

_Last updated: 20 November 2026._

## What Dusk Desk is

A 3D room at dusk (Three.js) that is the setting for a pomodoro website. You stand in the creator's room; the computer on the desk runs the pomodoro, and soon friends will share a session through a link and play small turn-based games together. The room is there to make the site feel alive; the timer is the product. It started as a portfolio and was turned into Dusk Desk on 20 November 2026.

## Decisions so far

| Topic | Decision |
| --- | --- |
| Devices | Computers only. Phones get a "please open this on a computer" notice (not built yet). |
| Accounts | None. Sessions are joined through a shareable link, with a nickname. |
| Friends in a session | Each person stays in their own room; only the computer screen (timer, members, games) is shared. No avatars. |
| Games | Turn-based only. They can be started at any time, and starting one **pauses the shared timer for everyone**; it continues from the same time when the game ends (no reset). |
| The room | The same for every visitor, no customization. It keeps the creator's personal content (photos, plaque, about, social links) as a way to share himself. That content is placeholder and will be rearranged soon. |
| GitHub link | Removed for now; it comes back when the room's content is rearranged. |
| Name | Dusk Desk. Repository: [github.com/Iioneua/dusk-desk](https://github.com/Iioneua/dusk-desk) (renamed from `3d-room-portfolio`). Domain undecided: duskdesk.com is a premium domain for sale (about $3,499); cheaper options are a `.app` or `.dev`, or the free address of the host. |
| Pomodoro customization | Presets and − / + on the timer, plus exact settings. Task names, sound choices and daily goals were offered and **not** chosen; do not add them unasked. |
| Hosting (planned) | Cloudflare: Pages for the site, Durable Objects (through PartyServer) for the sessions. Vercel and GitHub Pages cannot hold the live connections sessions need. |
| Commits | No "Co-Authored-By: Claude" line in commit messages. |

## Done

1. **Clean-up** (`a9de11e`). The portfolio parts of the computer were removed (Finder, VS Code, the `node` runner, the Projects folder, the desk's info card), and the project was renamed.
2. **Solo pomodoro** (`fb2c6ff`). A Pomodoro app on the computer: focus, short and long breaks, start, pause (Space), reset, skip, phase tabs. The timer lives outside the computer in `src/pomodoro.js` and stores *when the phase ends*, not a running count, so background tabs cannot make it drift; it and its settings survive a reload. The monitor seen from the room shows the live timer, and the green button under it and the tab title show the time left. A chime plays when a phase ends (the room's Sound button does not silence it), with a browser notification if the tab is in the background and a notice on the desktop.
3. **Polish** (the commit after `fb2c6ff`):
   - The desktop's menu bar is thinner and hides itself; it slides in at the top edge and shows briefly on arrival. The dock is smaller (40 units). A zoomed window covers the whole screen, and the dock then waits at the bottom edge.
   - Presets (Classic 25·5, Deep work 50·10, Long focus 90·20) and − / + beside the time before a phase starts. "Custom" (with a small gear) lights up for other lengths and opens the settings, whose numbers have their own − / + buttons.
   - The Pomodoro layout is responsive: the dial is sized from the window's real space, so nothing is pushed out of view from the smallest window to full screen. Checked at window sizes from 440 × 360 to 900 × 600 and full screen on five screen sizes.

## Next steps

1. **Shared sessions by link** (step 3, needs a free Cloudflare account; the user asked to perfect the existing work first, so check before starting). One Durable Object per session holds the members, the timer (`phase`, `endsAt` or time left, `done`: the same shape as `src/pomodoro.js`) and later the game. Every browser works out the time left from the server's clock. Needs automatic reconnecting, long random session ids, a member limit (about 8), and clean-up of empty sessions.
2. **Games** (step 4). One or two turn-based games (tic-tac-toe, Connect Four), with moves checked on the server, and the pause rule above.
3. **Ready to deploy** (step 5):
   - Download size: about 12 MB of assets. The money tree, pothos and cabinet models are 5 MB together (mesh compression would help), and the floor textures are 2048 px where the rest are 1024.
   - A clear message when WebGL is missing or a download fails (today the welcome button would stay on "Setting up the room… 43%").
   - The notice for phones.
   - Link previews: an `og:image` of the room, a favicon (the browser's request for `favicon.ico` currently returns 404), title and description.
   - Self-host the Google Fonts (GDPR), cache headers for `public/assets`, simple analytics, tests in Chrome, Firefox and Safari.
4. **Room content.** The text in `src/content.js` (profile and stations) and the photos in `public/assets/photos` are placeholders until the creator sends real data and rearranges the room.

## Testing notes

- `?view=computer` opens straight at the computer, `?view=desk` at the desk, and `?quality=low` renders lighter. `window.__ready` turns true once the room has drawn a few frames.
- Headless Chrome has no GPU here and renders the room at about 6 seconds per frame (the same before and after the recent changes), so automated tests need long waits, and clicks on elements that move with the camera need forcing. Phase-end tests should give the timer at least 45 seconds, because the page takes a while to become ready.
- Automated tests were run with `playwright-core` driving the installed Chrome, from a scratch folder outside the project; nothing test-related is in the repository.
