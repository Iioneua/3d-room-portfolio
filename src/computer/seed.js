import { HOME, join } from './fs.js';

// The files a visitor finds on the computer, for the Terminal to explore.

export const DESKTOP = `${HOME}/Desktop`;
const DOCUMENTS =`${HOME}/Documents`;
export const WELCOME = join(HOME, 'welcome.txt');

const WELCOME_TEXT = `Welcome to my computer.

Soon this is where you will run focus sessions (pomodoro) with your friends,
and play a few small games together on your breaks.

For now the Terminal works: type help to see what it can do.
Your changes stay in this browser tab and are gone when you reload the page.

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
