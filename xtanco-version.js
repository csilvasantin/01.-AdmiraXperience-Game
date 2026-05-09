(() => {
  const root = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis);
  // Version format: AdmiraNext vYY.DD.MM.R.
  // YY is the year, DD.MM is the current day/month, R restarts at 1 each day.
  root.XTANCO_APP = Object.freeze({
    name: 'Admira XP // The Xpace OS',
    version: 'AdmiraNext v26.09.05.2',
    build: '20260509-2000',
    cacheName: 'admiranext-v26-09-05-2-20260509-2000',
  });
})();
