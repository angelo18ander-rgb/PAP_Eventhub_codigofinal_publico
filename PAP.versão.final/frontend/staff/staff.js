// Mantém os eventos e o estado do pedido de acesso do membro da equipa.
let staffEvents = [];
let staffEventStatuses = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  await DB.init();
  const session = await Auth.requireAuth('Inicie sessão com uma conta da equipa para continuar.');
  if (!session) {
    window.location.replace(UI.pageUrl('frontend/events/events.html'));
    return;
  }
  if (session.role !== 'staff') {
    UI.toast('As ferramentas da equipa só estão disponíveis para contas de equipa.', 'error');
    window.location.replace(session.role === 'organizer' ? UI.pageUrl('frontend/events/my-events.html') : UI.pageUrl('frontend/events/events.html'));
    return;
  }

  document.getElementById('staff-event-search').addEventListener('input', renderStaffEvents);
  await loadStaffEvents();
});

async function loadStaffEvents() {
  // Carrega eventos e permissões da equipa antes de atualizar a lista.
  const list = document.getElementById('staff-event-list');
  try {
    const [events, affiliations] = await Promise.all([API.getEvents(), API.getMyStaffEvents()]);
    staffEvents = events;
    staffEventStatuses = new Map(affiliations.map(item => [String(item.eventId), item.status]));
    renderStaffEvents();
  } catch (error) {
    list.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${UI.escapeHtml(error.message || 'Não foi possível carregar os eventos.')}</p></div>`;
  }
}

function renderStaffEvents() {
  // Filtra os eventos e mostra a ação permitida para cada estado de acesso.
  const query = document.getElementById('staff-event-search').value.trim().toLowerCase();
  const list = document.getElementById('staff-event-list');
  const events = staffEvents.filter(event =>
    `${event.title} ${event.location} ${event.organizerName}`.toLowerCase().includes(query)
  );
  if (!events.length) {
    list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-calendar-xmark"></i><p>Não foram encontrados eventos.</p></div>';
    return;
  }
  list.innerHTML = events.map(event => {
    const status = staffEventStatuses.get(String(event.id));
    const isCancelled = event.status === 'cancelled';
    let action;
    if (isCancelled) {
      action = '<span class="badge badge-danger staff-event-action">Evento cancelado</span>';
    } else if (status === 'approved') {
      action = `<a class="btn btn-primary staff-event-action" href="frontend/staff/staff-checkin.html?event_id=${encodeURIComponent(event.id)}"><i class="fa-solid fa-qrcode"></i> Abrir leitor de bilhetes</a>`;
    } else if (status === 'pending') {
      action = '<span class="badge badge-warning staff-event-action">Pedido pendente</span>';
    } else {
      action = `<button type="button" class="btn btn-outline staff-event-action request-staff-access-btn" data-event-id="${UI.escapeHtml(event.id)}"><i class="fa-solid fa-paper-plane"></i> ${status === 'rejected' ? 'Pedir novamente' : 'Pedir acesso'}</button>`;
    }
    return `
      <article class="card staff-event-card">
        <div class="staff-event-copy">
          <h2>${UI.escapeHtml(event.title)}</h2>
          <p><i class="fa-solid fa-calendar"></i> ${UI.escapeHtml(UI.formatDate(event.date))} · ${UI.escapeHtml(UI.formatTime(event.time))}</p>
          <p><i class="fa-solid fa-location-dot"></i> ${UI.escapeHtml(event.location)}</p>
          <p><i class="fa-solid fa-user-tie"></i> ${UI.escapeHtml(event.organizerName)}</p>
        </div>
        ${action}
      </article>`;
  }).join('');
  list.querySelectorAll('.request-staff-access-btn').forEach(button => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const result = await API.requestStaffAccess(button.dataset.eventId);
        staffEventStatuses.set(String(button.dataset.eventId), result.status);
        UI.toast(result.message, 'success');
        renderStaffEvents();
      } catch (error) {
        button.disabled = false;
        UI.toast(error.message || 'Não foi possível pedir acesso ao evento.', 'error');
      }
    });
  });
}
