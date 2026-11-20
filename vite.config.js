// Relative base so the build works on any static host.
// Three.js is a big library (about 750 kB before compression) and loads as one file,
// so the size warning starts at 1 MB.
export default { base: './', build: { chunkSizeWarningLimit: 1000 } };
