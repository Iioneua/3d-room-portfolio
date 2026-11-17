import { HOME, TRASH, join, dirname } from './fs.js';

// The files a visitor finds on the computer. The projects come from content.js.

export const PROJECTS = `${HOME}/Projects`;
export const DESKTOP = `${HOME}/Desktop`;
export const DOCUMENTS = `${HOME}/Documents`;

export function projectReadme(p) {
  if (p.readme) return p.readme;
  const lines = [`# ${p.title || p.name}`, '', p.about || p.description || '', ''];
  if (p.stack?.length) lines.push(`- **Stack:** ${p.stack.join(', ')}`);
  if (p.year) lines.push(`- **Year:** ${p.year}`);
  if (p.link) lines.push(`- **Link:** ${p.link}`);
  lines.push('');
  return lines.join('\n');
}

const WELCOME = `# Welcome to my computer

Have a look around. Everything here works.

- **Projects**, on the desktop and in Finder, holds my projects. Select one to see what it is.
- **Terminal** runs commands. Type \`help\` to see them all; \`ls\`, \`cd\`, \`cat\` and \`node\` work.
- **VS Code** opens any file. Edit it, save with Ctrl+S (⌘S on a Mac) and run JavaScript with the ▷ button.

Your changes stay in this browser tab and are gone when you reload the page.

To step back from the computer, click **Step back** in the top bar, or click anywhere in the room around the screen.
`;

const HELLO = `// Write some JavaScript here and run it.
// In VS Code press the ▷ button (or F5). In the terminal type: node hello.js

const name = 'visitor';
console.log(\`Hello, \${name}!\`);

const squares = [1, 2, 3, 4, 5].map((n) => n * n);
console.log('Squares:', squares);

setTimeout(() => console.log('...and this line came a second later.'), 1000);
`;

const NOTES = `# Notes

- Ideas for the next project
- Things to read
- Places to visit
`;

export function seedFiles(fs, { projects }) {
  const put = (path, content) => {
    fs.mkdir(dirname(path), true);
    fs.write(path, content);
  };
  for (const dir of [DESKTOP, DOCUMENTS, PROJECTS, `${HOME}/Downloads`, TRASH]) fs.mkdir(dir, true);
  put(join(DESKTOP, 'Welcome.md'), WELCOME);
  put(join(DOCUMENTS, 'hello.js'), HELLO);
  put(join(DOCUMENTS, 'notes.md'), NOTES);
  for (const p of projects) {
    const root = join(PROJECTS, p.name);
    put(join(root, 'README.md'), projectReadme(p));
    for (const [path, content] of Object.entries(p.files || {})) put(join(root, path), content);
  }
}
