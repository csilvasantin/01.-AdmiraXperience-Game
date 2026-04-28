(() => {
  const root = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis);
  // Version format: AdmiraNext vYY.DD.MM.R.
  // YY is the year, DD.MM is the current day/month, R restarts at 1 each day.
  root.XTANCO_APP = Object.freeze({
    name: 'Admira XP // The Xpace OS',
    version: 'AdmiraNext v26.28.04.3',
    build: '20260428-0250',
    cacheName: 'admiranext-v26-28-04-3-20260428-0250',
  });
})();
