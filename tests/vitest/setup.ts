// Shared jsdom setup for all Vitest suites.
// Keep this minimal to avoid hiding production behavior.
beforeEach(() => {
  localStorage.clear();
});

