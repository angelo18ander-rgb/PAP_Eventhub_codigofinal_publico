/* ==========================================================================
   Carrega os eventos em destaque e gere a pesquisa da página inicial.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  await DB.init();
  renderStats();
  renderCategorias();
  renderFeatured();
  renderUpcoming();
  bindHeroSearch();
});

function renderStats() {
  // Atualiza os indicadores da página inicial a partir dos eventos ativos.
  const events = DB.getEvents().filter(e => e.status === 'active');
  const totalRegistrations = events.reduce((sum, e) => sum + e.participants, 0);
  animateCount('stat-events', events.length);
  animateCount('stat-registrations', totalRegistrations);
}

function animateCount(id, target) {
  // Anima um indicador numérico até ao valor final indicado.
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step = Math.max(1, Math.ceil(target / 40));
  const timer = setInterval(() => {
    current += step;
    if (current >= target) { current = target; clearInterval(timer); }
    el.textContent = current.toLocaleString();
  }, 25);
}

function renderCategorias() {
  // Cria os cartões de categoria e encaminha para a respetiva filtragem.
  const grid = document.getElementById('category-grid');
  const events = DB.getEvents();
  grid.innerHTML = DB.CATEGORIES.map(cat => {
    const count = events.filter(e => e.category === cat.name && e.status === 'active').length;
    return `
      <div class="category-card" data-cat="${cat.name}">
        <div class="cat-icon" style="background:${cat.color};"><i class="fa-solid ${cat.icon}"></i></div>
        <h4>${UI.escapeHtml(UI.categoryLabel(cat.name))}</h4>
        <span>${count} ${count === 1 ? 'evento' : 'eventos'}</span>
      </div>
    `;
  }).join('');
  grid.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      window.location.href = UI.pageUrl(`frontend/events/events.html?category=${encodeURIComponent(card.dataset.cat)}`);
    });
  });
}

function renderFeatured() {
  // Mostra os eventos ativos com mais inscrições.
  const grid = document.getElementById('featured-events-grid');
  const events = DB.getEvents()
    .filter(e => e.status === 'active')
    .sort((a, b) => b.participants - a.participants)
    .slice(0, 6);
  EventCard.renderGrid(grid, events);
}

function renderUpcoming() {
  // Mostra os três eventos ativos mais próximos da data atual.
  const grid = document.getElementById('upcoming-events-grid');
  const today = new Date().toISOString().slice(0, 10);
  const events = DB.getEvents()
    .filter(e => e.status === 'active' && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  EventCard.renderGrid(grid, events);
}

function bindHeroSearch() {
  // Envia a pesquisa principal para a página de listagem de eventos.
  const form = document.getElementById('hero-search-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('hero-search-input').value.trim();
    window.location.href = UI.pageUrl(`frontend/events/events.html${q ? '?search=' + encodeURIComponent(q) : ''}`);
  });
}
