const mediaQuery = matchMedia('(prefers-reduced-motion: reduce)');
let observer = null;
const playedChapters = new WeakSet();
const settleTimers = new WeakMap();
const chapterElements = document.querySelectorAll('.chapter-row');

function settleChapter(el) {
  let timer = settleTimers.get(el);
  if (timer) clearTimeout(timer);
  settleTimers.delete(el);
  el.classList.remove('is-playing');
  el.classList.add('is-played');
}

function playChapter(el) {
  if (playedChapters.has(el)) return;
  playedChapters.add(el);
  observer?.unobserve(el);
  el.classList.add('is-revealed', 'is-playing');
  settleTimers.set(el, setTimeout(() => settleChapter(el), 4000));
}

function updateObserver() {
  let reducedMotion = mediaQuery.matches;

  if (reducedMotion) {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    document.documentElement.classList.remove('is-enhanced');
    chapterElements.forEach((el) => {
      playedChapters.add(el);
      settleChapter(el);
      el.classList.add('is-revealed');
    });
    return;
  }

  document.documentElement.classList.add('is-enhanced');

  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          playChapter(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px',
    });

    chapterElements.forEach((el) => {
      observer.observe(el);
    });
  }
}

updateObserver();

mediaQuery.addEventListener('change', updateObserver);
