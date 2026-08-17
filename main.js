// ── NAV ──
const projectDirectory = document.getElementById('project-directory');

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.target).classList.add('active');
    if (projectDirectory) {
      projectDirectory.classList.toggle('visible', btn.dataset.target === 'projects');
    }
    // Close drawer on mobile after nav
    closeMobileMenu();
  });
});

// ── MOBILE HAMBURGER ──
const hamburger = document.getElementById('hamburger');
const sidebar   = document.getElementById('sidebar');
const overlay   = document.getElementById('mobile-overlay');

function openMobileMenu() {
  sidebar.classList.add('open');
  hamburger.classList.add('open');
  overlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeMobileMenu() {
  sidebar.classList.remove('open');
  hamburger.classList.remove('open');
  overlay.classList.remove('visible');
  document.body.style.overflow = '';
}

hamburger.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeMobileMenu() : openMobileMenu();
});

overlay.addEventListener('click', closeMobileMenu);

// ── CAROUSEL ──
const carouselState = {};

function initCarousel(id, count) {
  carouselState[id] = { index: 0, count };
}

function updateCarousel(id) {
  const { index } = carouselState[id];
  const track = document.getElementById('track-' + id);
  const dots  = document.querySelectorAll('#dots-' + id + ' .carousel-dot');
  if (track) track.style.transform = `translateX(-${index * 100}%)`;
  dots.forEach((d, i) => d.classList.toggle('active', i === index));
}

function slide(id, dir) {
  const s = carouselState[id];
  s.index = (s.index + dir + s.count) % s.count;
  updateCarousel(id);
}

function goTo(id, i) {
  carouselState[id].index = i;
  updateCarousel(id);
}

// ── PAIR CAROUSEL (Bandit tile) ──
const pairState = {};

function slidePair(id, dir) { slide(id, dir); }
function goToPair(id, i)    { goTo(id, i); }

// ── PROJECT DIRECTORY (scroll-spy) ──
if (projectDirectory) {
  const directoryLinks = projectDirectory.querySelectorAll('.project-directory-link');

  const setActiveLink = (link) => {
    directoryLinks.forEach(l => {
      l.classList.remove('active');
      l.removeAttribute('aria-current');
    });
    link.classList.add('active');
    link.setAttribute('aria-current', 'true');
  };

  directoryLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(link.getAttribute('href').slice(1));
      if (!target) return;
      setActiveLink(link);
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  const tileObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const link = projectDirectory.querySelector(`.project-directory-link[href="#${entry.target.id}"]`);
      if (link) setActiveLink(link);
    });
  }, { rootMargin: '-40% 0px -50% 0px', threshold: 0 });

  document.querySelectorAll('#projects .news-tile[id]').forEach(tile => tileObserver.observe(tile));
}

// Initialise carousels — add a new line here for each trip you add
initCarousel('nz', 5);
initCarousel('tw', 4);
initCarousel('ihk', 5);
initCarousel('np', 5);
initCarousel('te', 6);
initCarousel('ce', 6);
initCarousel('ic', 5);
initCarousel('food', 4);
initCarousel('math', 2);
initCarousel('bandit', 3);
initCarousel('api-lab', 3);

