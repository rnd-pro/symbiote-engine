(() => {
  const mediaQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let observer = null;
  const activeChapters = new Set();
  const chapterElements = document.querySelectorAll('.chapter-row');

  function updatePlayingStates() {
    const isPaused = document.hidden || mediaQuery.matches;
    chapterElements.forEach((el) => {
      if (!isPaused && activeChapters.has(el)) {
        el.classList.add('is-playing');
      } else {
        el.classList.remove('is-playing');
      }
    });
  }

  function updateObserver() {
    const reducedMotion = mediaQuery.matches;
    const hasObserver = typeof IntersectionObserver !== 'undefined';

    if (reducedMotion || !hasObserver) {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      document.documentElement.classList.remove('is-enhanced');
      activeChapters.clear();
      updatePlayingStates();
      chapterElements.forEach((el) => {
        el.classList.add('is-revealed');
      });
    } else {
      document.documentElement.classList.add('is-enhanced');

      if (!observer) {
        observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-revealed');
              activeChapters.add(entry.target);
            } else {
              activeChapters.delete(entry.target);
            }
          });
          updatePlayingStates();
        }, {
          threshold: 0.1,
          rootMargin: '0px 0px -40px 0px',
        });

        chapterElements.forEach((el) => {
          observer.observe(el);
        });
      }
    }
  }

  updateObserver();

  document.addEventListener('visibilitychange', updatePlayingStates);

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', updateObserver);
  } else if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(updateObserver);
  }
})();
