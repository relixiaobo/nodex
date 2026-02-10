export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    // Web clipping content script — will be implemented later
    // For now, this is a placeholder to register the content script entry
  },
});
