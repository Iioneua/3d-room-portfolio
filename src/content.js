// All the text and links shown in the room live here.
// Everything below is PLACEHOLDER content. Replace it with the real data.

export const profile = {
  name: 'Ilyes',
  role: 'Developer & Designer',
  tagline: 'Step inside. Every corner of this room says something about me.',
};

// The projects in the Projects folder on the computer (go into the monitor on the desk).
// Each project becomes a folder with a README.md written from these fields.
// `files` adds more files to the folder: { 'path/in/folder': 'file contents' }.
// The first four also appear on the desk's info card.
export const projects = [
  {
    name: 'sunset-ui',
    title: 'Sunset UI',
    description: 'A calm component library',
    about: 'Placeholder text. A set of quiet, accessible interface components with warm defaults and very few options.',
    stack: ['TypeScript', 'React'],
    year: '2026',
    link: 'https://github.com/Iioneua',
    files: {
      'package.json': '{\n  "name": "sunset-ui",\n  "version": "0.1.0",\n  "type": "module",\n  "main": "src/index.ts"\n}\n',
      'src/index.ts': "export { Button } from './Button';\n",
      'src/Button.tsx':
        "// Placeholder file. Replace it with code from the real project.\ntype ButtonProps = { label: string; tone?: 'calm' | 'warm' };\n\nexport function Button({ label, tone = 'calm' }: ButtonProps) {\n  return <button className={`btn btn-${tone}`}>{label}</button>;\n}\n",
    },
  },
  {
    name: 'pixel-notes',
    title: 'Pixel Notes',
    description: 'Notes app with a tiny footprint',
    about: 'Placeholder text. A note-taking app that loads instantly and works offline.',
    stack: ['JavaScript', 'HTML', 'CSS'],
    year: '2025',
    link: 'https://github.com/Iioneua',
    files: {
      'index.html':
        '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <title>Pixel Notes</title>\n    <link rel="stylesheet" href="style.css" />\n  </head>\n  <body>\n    <main id="notes"></main>\n    <script src="app.js"></script>\n  </body>\n</html>\n',
      'style.css': 'body {\n  margin: 0;\n  font: 16px/1.5 system-ui, sans-serif;\n  background: #faf7f2;\n}\n',
      'app.js':
        "// Placeholder file. Try it in the terminal: node app.js\nconst notes = [];\n\nfunction addNote(text) {\n  notes.push({ text, at: new Date() });\n}\n\naddNote('Buy coffee');\naddNote('Ship the notes app');\n\nconsole.log(`You have ${notes.length} notes:`);\nnotes.forEach((note, i) => console.log(`${i + 1}. ${note.text}`));\n",
    },
  },
  {
    name: 'room-3d',
    title: 'Room 3D',
    description: 'This very room, in Three.js',
    about: 'Placeholder text. The room you are standing in: a desk, a slat wall, a dusk lake and this computer.',
    stack: ['WebGL', 'Three.js'],
    year: '2026',
    link: 'https://github.com/Iioneua/3d-room-portfolio',
    files: {
      'src/main.js':
        "// Placeholder file. The real code for this room is on GitHub.\nimport * as THREE from 'three';\n\nconst scene = new THREE.Scene();\nconst camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.05, 100);\nconst renderer = new THREE.WebGLRenderer({ antialias: true });\n\nrenderer.setAnimationLoop(() => renderer.render(scene, camera));\n",
    },
  },
  {
    name: 'palette-lab',
    title: 'Palette Lab',
    description: 'Colour tools for designers',
    about: 'Placeholder text. Small tools for building colour palettes that work in light and dark mode.',
    stack: ['CSS', 'JavaScript'],
    year: '2025',
    link: 'https://github.com/Iioneua',
    files: {
      'palette.js':
        "// Placeholder file. Try it in the terminal: node palette.js\nconst base = { hue: 24, saturation: 80, lightness: 62 };\n\nfunction shades({ hue, saturation, lightness }, steps = 5) {\n  return Array.from({ length: steps }, (_, i) => {\n    const l = Math.round(lightness + 12 * (2 - i));\n    return `hsl(${hue} ${saturation}% ${l}%)`;\n  });\n}\n\nconsole.log('A palette around', base);\nfor (const colour of shades(base)) console.log('  ', colour);\n",
    },
  },
];

// `where` is the short line above each card's title, naming the object you are looking at.
export const stations = {
  desk: {
    label: 'Projects',
    kicker: 'GitHub',
    where: 'On the desk · Ultrawide monitor',
    title: 'Things I build',
    body: 'Placeholder text. I design and build small, polished things for the web, from interfaces to the code behind them.',
    items: projects.slice(0, 4).map((p) => ({ title: p.name, text: p.description, tag: p.stack[0] })),
    link: { label: 'Open GitHub', url: 'https://github.com/Iioneua' },
    objectHint: 'or go into the computer to open the Projects folder',
  },
  frame: {
    label: 'Experience',
    kicker: 'LinkedIn',
    where: 'On the wall · Framed plaque',
    title: 'Where I have worked',
    body: 'Placeholder text. A short summary of my path so far, the roles I have held and what I am looking for next.',
    items: [
      { title: 'Product Designer', text: 'Studio Example, 2024 to now' },
      { title: 'Front-end Developer', text: 'Sample Labs, 2022 to 2024' },
      { title: 'BSc Computer Science', text: 'Example University' },
    ],
    link: { label: 'Open LinkedIn', url: 'https://www.linkedin.com/' },
    objectHint: 'or click the plaque',
  },
  photos: {
    label: 'Photos',
    kicker: 'Instagram',
    where: 'On the ledge · Framed photos',
    title: 'Life outside the screen',
    body: 'Placeholder text. Sunsets, coffee, trips and the occasional design sketch. The parts of my week that are not code.',
    items: [
      { title: 'Golden hour', text: 'Evenings by the sea' },
      { title: 'On the road', text: 'Mountains and small towns' },
      { title: 'Work in progress', text: 'Sketches and experiments' },
    ],
    link: { label: 'Open Instagram', url: 'https://www.instagram.com/' },
    objectHint: 'or click the photos',
  },
  shelf: {
    label: 'About me',
    kicker: 'About',
    where: 'On the shelves · A few of my things',
    title: 'A few things about me',
    body: 'Placeholder text. I care about calm interfaces, clean code and details that most people only notice when they are missing.',
    items: [
      { title: 'Based in', text: 'Somewhere near the sea' },
      { title: 'Currently reading', text: 'A book about design systems' },
      { title: 'Fuelled by', text: 'Coffee and long walks' },
    ],
    link: { label: 'Say hello', url: 'mailto:hello@example.com' },
    objectHint: 'or click the shelves',
  },
};
