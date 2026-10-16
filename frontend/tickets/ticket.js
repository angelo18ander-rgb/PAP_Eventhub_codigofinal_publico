// Obtém os dados do bilhete e apresenta o seu estado e os detalhes do evento.
document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('ticket-content');
  const ticketCode = new URLSearchParams(window.location.search).get('code');
  if (!ticketCode) {
    renderTicketError(container, 'Bilhete não encontrado', 'Esta ligação não contém o código do bilhete.');
    return;
  }

  try {
    const ticket = await API.getTicket(ticketCode);
    const isCancelled = ticket.status === 'cancelled';
    const isCheckedIn = ticket.status === 'checked_in';
    const statusClass = isCancelled ? 'ticket-status-cancelled' : isCheckedIn ? 'ticket-status-used' : '';
    container.innerHTML = `
      <div class="ticket-status ${statusClass}">
        <i class="fa-solid ${isCancelled ? 'fa-circle-xmark' : 'fa-circle-check'}"></i>
        ${isCancelled ? 'Evento cancelado' : isCheckedIn ? 'Bilhete já validado à entrada' : 'Bilhete de evento válido'}
      </div>
      ${isCheckedIn && ticket.checkedInAt ? `<p class="ticket-checked-in-at">Validado à entrada em ${UI.escapeHtml(new Date(ticket.checkedInAt).toLocaleString('pt-PT'))}</p>` : ''}
      <h1>${UI.escapeHtml(ticket.eventTitle)}</h1>
      <div class="ticket-details">
        <div><i class="fa-solid fa-user"></i><span><strong>Participante</strong>${UI.escapeHtml(ticket.attendeeName)}</span></div>
        <div><i class="fa-solid fa-calendar"></i><span><strong>Data</strong>${UI.escapeHtml(UI.formatDate(ticket.eventDate))}</span></div>
        <div><i class="fa-solid fa-clock"></i><span><strong>Hora</strong>${UI.escapeHtml(UI.formatTime(ticket.eventTime))}</span></div>
        <div><i class="fa-solid fa-location-dot"></i><span><strong>Localização</strong>${UI.escapeHtml(ticket.eventLocation)}</span></div>
      </div>
      <a class="btn btn-outline btn-block" href="frontend/events/event-details.html?id=${encodeURIComponent(ticket.eventId || '')}">Ver página do evento</a>
    `;
  } catch (error) {
    renderTicketError(container, 'Bilhete indisponível', error.message || 'Este bilhete não é válido ou já não está disponível.');
  }
});

function renderTicketError(container, title, message) {
  // Apresenta um estado de erro seguro para ligações ou bilhetes inválidos.
  container.innerHTML = `
    <div class="empty-state">
      <i class="fa-solid fa-ticket"></i>
      <h1>${UI.escapeHtml(title)}</h1>
      <p>${UI.escapeHtml(message)}</p>
      <a href="frontend/events/events.html" class="btn btn-primary">Explorar eventos</a>
    </div>
  `;
}
