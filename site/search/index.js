const dialog = document.querySelector('[data-site-search-dialog]');
const opener = document.querySelector('[data-search-open]');
let closeButton = null;
let input = null;
let status = null;
let items = [];

if (dialog) {
  closeButton = dialog.querySelector('[data-search-close]');
  input = dialog.querySelector('[data-search-input]');
  status = dialog.querySelector('[data-search-status]');
  items = [...dialog.querySelectorAll('[data-search-item]')];
}

if (dialog && opener && input && status) {
  const filterResults = () => {
    const terms = input.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    let visibleCount = 0;
    for (const item of items) {
      const haystack = (item.dataset.searchText || '').toLocaleLowerCase();
      const visible = terms.every((term) => haystack.includes(term));
      item.hidden = !visible;
      if (visible) visibleCount += 1;
    }
    if (terms.length === 0) {
      status.textContent = items.length + ' documentation sections';
    } else if (visibleCount === 1) {
      status.textContent = '1 result';
    } else {
      status.textContent = visibleCount + ' results';
    }
  };

  const openSearch = () => {
    const navigation = document.getElementById('site-navigation');
    const navToggle = document.querySelector('[data-nav-toggle]');
    if (navigation) navigation.classList.remove('is-open');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    input.value = '';
    filterResults();
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    requestAnimationFrame(() => input.focus());
  };

  const closeSearch = () => {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  };

  opener.addEventListener('click', openSearch);
  if (closeButton) closeButton.addEventListener('click', closeSearch);
  input.addEventListener('input', filterResults);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeSearch();
  });
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    }
  });
  filterResults();
}
