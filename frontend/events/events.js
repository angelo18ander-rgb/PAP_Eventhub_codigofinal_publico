/* ==========================================================================
   Pesquisa, filtra, ordena e apresenta os eventos disponíveis.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  await DB.init();
  populateFilterOptions();
  applyUrlParams();
  bindControls();
  renderResults();

  document.addEventListener('eh:favorites-changed', renderResults);
});

function populateFilterOptions() {
  // Preenche os filtros com categorias e localizações disponíveis.
  const catSelect = document.getElementById('filter-category');
  DB.CATEGORIES.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.name;
    opt.textContent = UI.categoryLabel(cat.name);
    catSelect.appendChild(opt);
  });

  const locSelect = document.getElementById('filter-location');
  const locations = [...new Set(DB.getEvents().map(e => e.location))].sort();
  locations.forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc;
    opt.textContent = loc;
    locSelect.appendChild(opt);
  });
}

function applyUrlParams() {
  // Inicializa pesquisa e categoria a partir dos parâmetros da página.
  const params = new URLSearchParams(window.location.search);
  const search = params.get('search');
  const category = params.get('category');
  if (search) document.getElementById('search-input').value = search;
  if (category) document.getElementById('filter-category').value = category;
}

function bindControls() {
  // Liga pesquisa, filtros, limpeza e expansão dos controlos.
  const searchInput = document.getElementById('search-input');
  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderResults, 250);
  });

  ['filter-category', 'filter-date', 'filter-location', 'filter-sort'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderResults);
  });

  document.getElementById('clear-filters-btn').addEventListener('click', () => {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-date').value = '';
    document.getElementById('filter-location').value = '';
    document.getElementById('filter-sort').value = 'date-asc';
    renderResults();
  });

  document.getElementById('filters-toggle-btn').addEventListener('click', () => {
    document.getElementById('filters-grid').classList.toggle('open');
  });
}

function matchesDateFilter(evt, filter) {
  // Verifica se a data do evento corresponde ao intervalo escolhido.
  if (!filter) return true;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const evtDate = new Date(evt.date + 'T00:00:00');
  const diffDays = Math.round((evtDate - today) / 86400000);

  switch (filter) {
    case 'today': return diffDays === 0;
    case 'week': return diffDays >= 0 && diffDays <= 7;
    case 'month': return diffDays >= 0 && diffDays <= 31;
    case 'past': return diffDays < 0;
    default: return true;
  }
}

function renderResults() {
  // Aplica os critérios atuais, ordena os resultados e atualiza a grelha.
  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const category = document.getElementById('filter-category').value;
  const dateFilter = document.getElementById('filter-date').value;
  const location = document.getElementById('filter-location').value;
  const sort = document.getElementById('filter-sort').value;

  let events = DB.getEvents();

  if (search) {
    events = events.filter(e =>
      e.title.toLowerCase().includes(search) ||
      e.description.toLowerCase().includes(search) ||
      e.location.toLowerCase().includes(search) ||
      e.category.toLowerCase().includes(search)
    );
  }
  if (category) events = events.filter(e => e.category === category);
  if (location) events = events.filter(e => e.location === location);
  if (dateFilter) events = events.filter(e => matchesDateFilter(e, dateFilter));

  switch (sort) {
    case 'date-asc': events.sort((a, b) => a.date.localeCompare(b.date)); break;
    case 'date-desc': events.sort((a, b) => b.date.localeCompare(a.date)); break;
    case 'popularity': events.sort((a, b) => b.participants - a.participants); break;
    case 'title': events.sort((a, b) => a.title.localeCompare(b.title)); break;
    case 'spots': events.sort((a, b) => (b.maxParticipants - b.participants) - (a.maxParticipants - a.participants)); break;
  }

  document.getElementById('results-count').textContent = `${events.length} ${events.length === 1 ? 'evento encontrado' : 'eventos encontrados'}`;
  renderActiveFilterChips({ search, category, dateFilter, location });

  const grid = document.getElementById('events-grid');
  EventCard.renderGrid(grid, events, { emptyTitle: 'Não há eventos que correspondam aos filtros', emptyMessage: 'Limpe alguns filtros ou experimente outros termos de pesquisa.' });
}

function renderActiveFilterChips({ search, category, dateFilter, location }) {
  // Mostra os filtros aplicados como etiquetas que podem ser removidas.
  const wrap = document.getElementById('active-filters');
  const chips = [];
  if (search) chips.push({ label: `Pesquisar: "${search}"`, clear: () => document.getElementById('search-input').value = '' });
  if (category) chips.push({ label: `Categoria: ${UI.categoryLabel(category)}`, clear: () => document.getElementById('filter-category').value = '' });
  if (dateFilter) chips.push({ label: `Data: ${dateFilter}`, clear: () => document.getElementById('filter-date').value = '' });
  if (location) chips.push({ label: `Localização: ${location}`, clear: () => document.getElementById('filter-location').value = '' });

  if (!chips.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = chips.map((c, i) => `<span class="chip" data-idx="${i}">${UI.escapeHtml(c.label)} <button aria-label="Remover filtro"><i class="fa-solid fa-xmark"></i></button></span>`).join('');
  wrap.querySelectorAll('.chip button').forEach((btn, i) => {
    btn.addEventListener('click', () => { chips[i].clear(); renderResults(); });
  });
}
