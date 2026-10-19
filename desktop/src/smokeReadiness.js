// A visible canvas can belong to the previous scene while the next one is downloading or setting up.
export function exampleReady(state, sample) {
  return Boolean(state && !state.galleryOpen && state.state === "running" && state.errors === 0 && sample?.litFraction > 0.01);
}
