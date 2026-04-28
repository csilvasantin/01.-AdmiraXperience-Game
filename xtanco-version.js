(() => {
  const root = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis);
  // Version format: AdmiraNext vYY.DD.MM.R.
  // YY is the year, DD.MM is the current day/month, R restarts at 1 each day.
  root.XTANCO_APP = Object.freeze({
    name: 'Admira XP // The Xpace OS',
    version: 'AdmiraNext v26.28.04.6',
    build: '20260428-0510',
    cacheName: 'admiranext-v26-28-04-6-20260428-0510',
  });
})();
