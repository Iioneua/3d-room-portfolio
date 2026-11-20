// All the text and links shown in the room live here.
// The text about me (profile and stations) is PLACEHOLDER. Replace it with the real data.

export const profile = {
  name: 'Ilyes',
  role: 'Developer & Designer',
  tagline: 'Step inside. Every corner of this room says something about me.',
};

// The site itself: its name, and the line under it on the welcome screen.
export const site = {
  name: 'Dusk Desk',
  tagline: 'Sit at my desk, focus with your friends and take your breaks together.',
};

// `where` is the short line above each card's title, naming the object you are looking at.
export const stations = {
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
