(() => {
  const root = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis);
  // Version format: AdmiraNext vYY.DD.MM.R.
  // YY is the year, DD.MM is the current day/month, R restarts at 1 each day.
  root.XTANCO_APP = Object.freeze({
    name: 'Admira XP // The Xpace OS',
    version: 'AdmiraNext v26.27.04.4',
    build: '20260427-0900',
    cacheName: 'admiranext-v26-27-04-4-20260427-0900',
  });
})();
