/* ==========================================================================
   Apresenta e mantém atualizada a lista de eventos favoritos do utilizador.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  await DB.init();
  const session = await Auth.requireAuth('Inicie sessão para consultar os seus favoritos.');
  if (!session) {
    setTimeout(() => { if (!DB.getSession()) window.location.href = UI.pageUrl('frontend/home/index.html'); }, 50);
    return;
  }
  renderFavorites();
  document.addEventListener('eh:favorites-changed', renderFavorites);
});

function renderFavorites() {
  // Resolve os IDs favoritos em eventos e atualiza a grelha da página.
  const session = DB.getSession();
  if (!session) return;
  const favIds = DB.getFavorites(session.id);
  const events = favIds.map(id => DB.getEvent(id)).filter(Boolean);

  document.getElementById('favorites-count').textContent = `${events.length} ${events.length === 1 ? 'favorito' : 'favoritos'}`;
  const grid = document.getElementById('favorites-grid');
  EventCard.renderGrid(grid, events, {
    emptyTitle: 'Ainda não tem favoritos',
    emptyMessage: 'Selecione o coração de qualquer evento para o guardar aqui e aceder-lhe rapidamente.'
  });
}
