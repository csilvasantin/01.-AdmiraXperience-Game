(() => {
  const root = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis);
  // Version format: AdmiraNext vYY.DD.MM.R.
  // YY is the year, DD.MM is the current day/month, R restarts at 1 each day.
  root.XTANCO_APP = Object.freeze({
    name: 'Admira XP // The Xpace OS',
    version: 'AdmiraNext v26.02.05.7',
    build: '20260502-1830',
    cacheName: 'admiranext-v26-02-05-7-20260502-1830',
  });
})();
