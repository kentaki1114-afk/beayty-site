// ハンバーガーメニュー
const hamburger = document.querySelector('.hamburger');
const mobileNav = document.querySelector('.mobile-nav');

if (hamburger && mobileNav) {
  hamburger.addEventListener('click', () => {
    mobileNav.classList.toggle('open');
  });

  mobileNav.addEventListener('click', (e) => {
    if (e.target === mobileNav) {
      mobileNav.classList.remove('open');
    }
  });
}

// カテゴリフィルター
const catChips = document.querySelectorAll('.cat-chip[data-cat]');
const rankingCards = document.querySelectorAll('.ranking-card[data-cat]');

catChips.forEach(chip => {
  chip.addEventListener('click', () => {
    const cat = chip.dataset.cat;

    catChips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    rankingCards.forEach(card => {
      if (cat === 'all' || card.dataset.cat === cat) {
        card.style.display = 'grid';
      } else {
        card.style.display = 'none';
      }
    });
  });
});

// スムーズスクロール (古いブラウザ対応補完)
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      mobileNav?.classList.remove('open');
    }
  });
});

// ランキングカード アニメーション (Intersection Observer)
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.ranking-card, .article-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
  observer.observe(el);
});
