/* ==========================================================================
   Constrói cartões de eventos e associa os respetivos controlos interativos.
   ========================================================================== */

const EventCard = (() => {

  function render(evt, options = {}) {
    // Constrói o HTML de um cartão de evento com estado e capacidade.
    const session = DB.getSession();
    const cat = UI.categoryMeta(evt.category);
    const isFav = session ? DB.isFavorite(session.id, evt.id) : false;
    const capacity = Math.max(1, Number(evt.maxParticipants) || 0);
    const participants = Math.max(0, Number(evt.participants) || 0);
    const isFull = participants >= capacity;
    const isCancelled = evt.status === 'cancelled';
    const pct = Math.min(100, Math.round((participants / capacity) * 100));

    let statusBadge = '';
    if (isCancelled) statusBadge = `<span class="badge badge-danger card-status-badge">Cancelado</span>`;
    else if (isFull) statusBadge = `<span class="badge badge-warning card-status-badge">Lotado</span>`;

    return `
      <article class="event-card ${isCancelled ? 'is-cancelled' : ''}" data-event-id="${evt.id}">
        <div class="card-img-wrap">
          <img src="${evt.image}" alt="${UI.escapeHtml(evt.title)}" loading="lazy">
          <span class="badge card-cat-badge" style="background:${cat.color}22; color:${cat.color};"><i class="fa-solid ${cat.icon}"></i> ${cat.name}</span>
          ${statusBadge}
          <button class="favorite-btn ${isFav ? 'is-fav' : ''}" data-fav-id="${evt.id}" aria-label="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
            <i class="fa-solid fa-heart"></i><i class="fa-regular fa-heart"></i>
          </button>
        </div>
        <div class="card-body">
          <h3 class="card-title">${UI.escapeHtml(evt.title)}</h3>
          <div class="card-meta">
            <span><i class="fa-solid fa-calendar"></i> ${UI.formatDate(evt.date)}</span>
            <span><i class="fa-solid fa-clock"></i> ${UI.formatTime(evt.time)}</span>
            <span><i class="fa-solid fa-location-dot"></i> ${UI.escapeHtml(evt.location)}</span>
          </div>
          <p class="card-desc">${UI.escapeHtml(evt.description).slice(0, 90)}${evt.description.length > 90 ? '…' : ''}</p>
          <div class="capacity-bar-wrap">
            <div class="capacity-bar"><div class="capacity-bar-fill ${isFull ? 'full' : ''}" style="width:${pct}%"></div></div>
            <div class="capacity-label"><span>${participants} / ${evt.maxParticipants} participantes</span><span>${pct}%</span></div>
          </div>
          <div class="card-actions">
            <button class="btn btn-primary view-details-btn" data-view-id="${evt.id}">Ver detalhes</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderGrid(container, events, options = {}) {
    // Apresenta cartões numa grelha ou uma mensagem quando não há resultados.
    if (!events.length) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <i class="fa-solid fa-calendar-xmark"></i>
          <h3>${options.emptyTitle || 'Não foram encontrados eventos'}</h3>
          <p>${options.emptyMessage || 'Experimente ajustar os filtros ou os termos de pesquisa.'}</p>
        </div>`;
      return;
    }
    container.innerHTML = events.map(evt => render(evt, options)).join('');
    bindCardEvents(container);
  }

  function bindCardEvents(container) {
    // Liga navegação para detalhes e ações para guardar favoritos.
    container.querySelectorAll('.view-details-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.href = UI.pageUrl(`frontend/events/event-details.html?id=${btn.dataset.viewId}`);
      });
    });
    container.querySelectorAll('.event-card .card-img-wrap img, .event-card .card-title').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        const card = el.closest('.event-card');
        window.location.href = UI.pageUrl(`frontend/events/event-details.html?id=${card.dataset.eventId}`);
      });
    });
    container.querySelectorAll('.favorite-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const session = DB.getSession();
        if (!session) { Auth.requireAuth('Inicie sessão para guardar eventos favoritos.'); return; }
        const isFav = await DB.toggleFavorite(session.id, btn.dataset.favId);
        btn.classList.toggle('is-fav', isFav);
        UI.toast(isFav ? 'Evento adicionado aos favoritos.' : 'Evento removido dos favoritos.', isFav ? 'success' : 'info');
        document.dispatchEvent(new CustomEvent('eh:favorites-changed'));
      });
    });
  }

  return { render, renderGrid, bindCardEvents };
})();
