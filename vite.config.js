// Relative base so the build works on both Vercel and GitHub Pages.
// Three.js and the code editor are big libraries; each loads as its own file
// (the editor only after you enter the room), so the size warning starts at 1 MB.
export default { base: './', build: { chunkSizeWarningLimit: 1000 } };
