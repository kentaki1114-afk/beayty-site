/**
 * BeautyBests - 記事フィルター・ページネーション・インライン検索
 */
(function () {
  const CARDS_PER_PAGE = 12;

  const grid = document.getElementById('article-grid');
  const pagination = document.getElementById('pagination');
  const filterBar = document.getElementById('filter-bar');
  const searchInput = document.getElementById('article-search');
  const searchCount = document.getElementById('search-count');

  if (!grid) return;

  const allCards = Array.from(grid.querySelectorAll('.article-card'));

  let currentFilter = 'all';
  let currentQuery = '';
  let currentPage = 1;

  // ===== フィルタリング =====

  function getVisibleCards() {
    return allCards.filter((card) => {
      const cat = card.dataset.category || '';
      const title = card.querySelector('.article-title')?.textContent || '';
      const tags = card.querySelector('.article-tags')?.textContent || '';

      const matchFilter = currentFilter === 'all' || cat === currentFilter;
      const matchSearch =
        currentQuery === '' ||
        title.includes(currentQuery) ||
        tags.includes(currentQuery);

      return matchFilter && matchSearch;
    });
  }

  // ===== ページネーション描画 =====

  function renderPage() {
    const visible = getVisibleCards();
    const total = visible.length;
    const totalPages = Math.max(1, Math.ceil(total / CARDS_PER_PAGE));

    if (currentPage > totalPages) currentPage = 1;

    const start = (currentPage - 1) * CARDS_PER_PAGE;
    const end = start + CARDS_PER_PAGE;

    allCards.forEach((c) => (c.style.display = 'none'));
    visible.forEach((c, i) => {
      c.style.display = i >= start && i < end ? '' : 'none';
    });

    // 検索件数表示
    if (currentQuery || currentFilter !== 'all') {
      searchCount.textContent = `${total} 件`;
    } else {
      searchCount.textContent = '';
    }

    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    if (!pagination) return;

    if (totalPages <= 1) {
      pagination.innerHTML = '';
      return;
    }

    const items = [];

    // 前へ
    items.push(
      `<button class="page-btn${currentPage === 1 ? ' disabled' : ''}" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>‹ 前へ</button>`
    );

    // ページ番号（最大7個表示）
    const range = pageRange(currentPage, totalPages);
    let prev = null;
    range.forEach((p) => {
      if (prev !== null && p - prev > 1) {
        items.push('<span class="page-ellipsis">…</span>');
      }
      items.push(
        `<button class="page-btn${p === currentPage ? ' active' : ''}" data-page="${p}">${p}</button>`
      );
      prev = p;
    });

    // 次へ
    items.push(
      `<button class="page-btn${currentPage === totalPages ? ' disabled' : ''}" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>次へ ›</button>`
    );

    pagination.innerHTML = items.join('');

    pagination.querySelectorAll('.page-btn:not(.disabled)').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentPage = parseInt(btn.dataset.page, 10);
        renderPage();
        document.getElementById('articles')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function pageRange(current, total) {
    const delta = 2;
    const pages = new Set();
    pages.add(1);
    pages.add(total);
    for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
      pages.add(i);
    }
    return Array.from(pages).sort((a, b) => a - b);
  }

  // ===== フィルターボタン =====

  if (filterBar) {
    filterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;

      filterBar.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      currentPage = 1;
      renderPage();
    });
  }

  // ===== インライン検索 =====

  if (searchInput) {
    let timer;
    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        currentQuery = searchInput.value.trim();
        currentPage = 1;
        renderPage();
      }, 200);
    });
  }

  // ===== 初期描画 =====
  renderPage();
})();
