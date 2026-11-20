import { HOME, join } from './fs.js';

// The files a visitor finds on the computer, for the Terminal to explore.

export const DESKTOP = `${HOME}/Desktop`;
const DOCUMENTS =`${HOME}/Documents`;
const WELCOME = join(HOME, 'welcome.txt');

const WELCOME_TEXT = `Welcome to my computer.

The Pomodoro app in the dock is a focus timer: focus for a while, take a short
break, and a longer one after a few rounds. It keeps running when you step back
from the computer, and a chime tells you when it is time to switch.

Soon you will be able to share a session with your friends through a link,
and play a few small games together on your breaks.

The Terminal works too: type help to see what it can do. Files you make here
stay in this browser tab and are gone when you reload the page.

To step back from the computer, click Step back in the top bar,
or click anywhere in the room around the screen.
`;

const NOTES = `# Notes

- Ideas for the next project
- Things to read
- Places to visit
`;

export function seedFiles(fs) {
  for (const dir of [DESKTOP, DOCUMENTS, `${HOME}/Downloads`]) fs.mkdir(dir, true);
  fs.write(WELCOME, WELCOME_TEXT);
  fs.write(join(DOCUMENTS, 'notes.md'), NOTES);
}
