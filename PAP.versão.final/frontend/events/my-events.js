/* ==========================================================================
   Carrega e gere eventos organizados e eventos em que o utilizador participa.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  await DB.init();
  const session = await Auth.requireAuth('Inicie sessão para consultar os seus eventos.');
  if (!session) {
    setTimeout(() => { if (!DB.getSession()) window.location.href = UI.pageUrl('frontend/home/index.html'); }, 50);
    return;
  }
  if (session.role === 'staff') {
    window.location.replace(UI.pageUrl('frontend/staff/staff.html'));
    return;
  }

  bindTabs();
  await loadCreatedEvents();
  await loadJoinedEvents();
  UI.bindOverlayClose(document.getElementById('participants-modal-overlay'));
  UI.bindOverlayClose(document.getElementById('staff-modal-overlay'));
  bindStaffInviteForm();
});

function bindTabs() {
  // Alterna entre os painéis de eventos criados e eventos inscritos.
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(`${btn.dataset.tab}-panel`).classList.add('active');
    });
  });
}

async function loadJoinedEvents() {
  // Sincroniza inscrições e códigos de bilhete antes de desenhar a lista.
  try {
    const events = await API.getJoinedEvents();
    const session = DB.getSession();
    const allEventos = DB.getEvents();
    DB.replaceEvents([...allEventos, ...events]);
    const registrations = events.map(event => ({
      eventId: String(event.id),
      userId: String(session.id),
      registeredAt: event.registeredAt ? Date.parse(event.registeredAt) : Date.now(),
      ticketCode: event.ticketCode || '',
      status: 'confirmed'
    }));
    sessionStorage.setItem('eh_registrations', JSON.stringify(registrations));
    localStorage.setItem('eh_registrations', JSON.stringify(registrations));
  } catch (error) {
    UI.toast(error.message || 'Não foi possível carregar os eventos em que participa.', 'error');
  }
  renderJoinedEvents();
}

function statusBadge(event) {
  // Escolhe a etiqueta visual adequada ao estado do evento.
  if (event.status === 'cancelled') return '<span class="badge badge-danger">Cancelado</span>';
  if (event.participants >= event.maxParticipants) return '<span class="badge badge-warning">Lotado</span>';
  const today = new Date().toISOString().slice(0, 10);
  if (event.date < today) return '<span class="badge badge-muted">Anterior</span>';
  return '<span class="badge badge-success">Ativo</span>';
}

async function loadCreatedEvents() {
  // Carrega da API os eventos do organizador e atualiza a lista.
  try {
    const events = await API.getMyEvents();
    DB.replaceEvents(events);
  } catch (error) {
    UI.toast(error.message || 'Não foi possível carregar os eventos que criou.', 'error');
  }
  renderCreatedEvents();
}

function renderCreatedEvents() {
  // Desenha os eventos do organizador e as ações de gestão disponíveis.
  const session = DB.getSession();
  const events = DB.getEvents().filter(e => String(e.createdBy) === String(session.id)).sort((a, b) => b.createdAt - a.createdAt);
  document.getElementById('created-count').textContent = `${events.length} ${events.length === 1 ? 'evento' : 'eventos'}`;
  const list = document.getElementById('created-list');

  if (!events.length) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-calendar-plus"></i>
        <h3>Ainda não criou eventos</h3>
        <p>Crie o seu primeiro evento e reúna pessoas.</p>
        <a href="frontend/events/create-event.html" class="btn btn-primary" style="margin-top:14px;">Criar o primeiro evento</a>
      </div>`;
    return;
  }

  list.innerHTML = events.map(evt => `
    <div class="managed-item ${evt.status === 'cancelled' ? 'is-cancelled' : ''}" data-id="${evt.id}">
      <img class="mi-thumb" src="${evt.image}" alt="${UI.escapeHtml(evt.title)}">
      <div class="mi-info">
        <div class="mi-title">${UI.escapeHtml(evt.title)} ${statusBadge(evt)}</div>
        <div class="mi-meta">
          <span><i class="fa-solid fa-calendar"></i> ${UI.formatDate(evt.date)}</span>
          <span><i class="fa-solid fa-location-dot"></i> ${UI.escapeHtml(evt.location)}</span>
          <span><i class="fa-solid fa-users"></i> ${evt.participants} / ${evt.maxParticipants}</span>
        </div>
      </div>
      <div class="mi-actions">
        <button class="btn btn-secondary btn-sm view-participants-btn" data-id="${evt.id}"><i class="fa-solid fa-users"></i> Participantes</button>
        <button class="btn btn-secondary btn-sm manage-staff-btn" data-id="${evt.id}"><i class="fa-solid fa-shield-halved"></i> Equipa do evento</button>
        <button class="btn btn-outline btn-sm edit-event-btn" data-id="${evt.id}" ${evt.status === 'cancelled' ? 'disabled' : ''}><i class="fa-solid fa-pen"></i> Editar</button>
        <button class="btn btn-danger btn-sm cancel-event-btn" data-id="${evt.id}" ${evt.status === 'cancelled' ? 'disabled' : ''}><i class="fa-solid fa-ban"></i> Cancelar</button>
        <button class="btn btn-danger btn-sm delete-event-btn" data-id="${evt.id}"><i class="fa-solid fa-trash"></i> Eliminar</button>
      </div>
    </div>
  `).join('');

  bindCreatedActions();
}

function bindCreatedActions() {
  // Liga gestão de participantes/equipa e ações de editar/cancelar/eliminar.
  document.querySelectorAll('.view-participants-btn').forEach(btn => {
    btn.addEventListener('click', () => openParticipantsModal(btn.dataset.id));
  });
  document.querySelectorAll('.manage-staff-btn').forEach(btn => {
    btn.addEventListener('click', () => openStaffModal(btn.dataset.id));
  });
  document.querySelectorAll('.edit-event-btn').forEach(btn => {
    btn.addEventListener('click', () => window.location.href = UI.pageUrl(`frontend/events/create-event.html?edit=${btn.dataset.id}`));
  });
  document.querySelectorAll('.cancel-event-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const event = DB.getEvent(btn.dataset.id);
      const confirmed = await UI.confirmDialog({
        title: 'Cancelar este evento?',
        message: `Tem a certeza de que pretende cancelar «${event.title}»? As pessoas inscritas deixarão de poder participar e não serão aceites novas inscrições. O evento não será eliminado.`,
        okText: 'Sim, cancelar evento',
        icon: 'fa-ban',
        tone: 'danger'
      });
      if (confirmed) {
        try {
          await DB.cancelEvent(btn.dataset.id);
          UI.toast('O evento foi cancelado.', 'warning');
          renderCreatedEvents();
        } catch (error) {
          UI.toast(error.message || 'Não foi possível cancelar o evento.', 'error');
        }
      }
    });
  });
  document.querySelectorAll('.delete-event-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const event = DB.getEvent(btn.dataset.id);
      if (!event) return;

      const confirmed = await UI.confirmDialog({
        title: 'Eliminar este evento permanentemente?',
        message: `O evento «${event.title}» será eliminado de forma permanente. Esta ação não pode ser anulada.`,
        okText: 'Sim, eliminar evento',
        icon: 'fa-trash',
        tone: 'danger'
      });
      if (!confirmed) return;

      try {
        await DB.deleteEvent(btn.dataset.id);
        UI.toast('Evento eliminado permanentemente.', 'success');
        await loadCreatedEvents();
      } catch (error) {
        UI.toast(error.message || 'Não foi possível eliminar o evento.', 'error');
      }
    });
  });
}

async function openStaffModal(eventId) {
  // Abre a janela da equipa e carrega pedidos de acesso ao evento.
  const event = DB.getEvent(eventId);
  if (!event) return;
  const modal = document.getElementById('staff-modal-overlay');
  const list = document.getElementById('event-staff-list');
  document.getElementById('staff-event-title').textContent = event.title;
  document.getElementById('staff-invite-form').dataset.eventId = eventId;
  list.innerHTML = '<p class="staff-list-loading">A carregar os pedidos da equipa…</p>';
  UI.openModal(modal);
  try {
    renderEventStaff(eventId, await API.getEventStaff(eventId));
  } catch (error) {
    list.innerHTML = `<p class="form-error">${UI.escapeHtml(error.message || 'Não foi possível carregar os pedidos da equipa.')}</p>`;
  }
}

function renderEventStaff(eventId, staff) {
  // Mostra os membros da equipa e permite decidir pedidos pendentes.
  const list = document.getElementById('event-staff-list');
  if (!staff.length) {
    list.innerHTML = '<p>Ainda não existem pedidos nem membros da equipa atribuídos.</p>';
    return;
  }
  list.innerHTML = staff.map(person => `
    <div class="event-staff-row">
      <div><strong>${UI.escapeHtml(person.name)}</strong><small>${UI.escapeHtml(person.email)}</small></div>
      <span class="badge ${person.status === 'approved' ? 'badge-success' : person.status === 'rejected' ? 'badge-danger' : 'badge-warning'}">${UI.escapeHtml(person.status)}</span>
      ${person.status === 'pending' ? `
        <div class="event-staff-actions">
          <button type="button" class="btn btn-primary btn-sm staff-decision-btn" data-staff-id="${person.staffId}" data-decision="approved">Aprovar</button>
          <button type="button" class="btn btn-outline btn-sm staff-decision-btn" data-staff-id="${person.staffId}" data-decision="rejected">Rejeitar</button>
        </div>` : ''}
    </div>`).join('');
  list.querySelectorAll('.staff-decision-btn').forEach(button => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await API.decideEventStaffRequest(eventId, button.dataset.staffId, button.dataset.decision);
        UI.toast(`Pedido da equipa ${button.dataset.decision === 'approved' ? 'aprovado' : 'rejeitado'}.`, 'success');
        renderEventStaff(eventId, await API.getEventStaff(eventId));
      } catch (error) {
        button.disabled = false;
        UI.toast(error.message || 'Não foi possível atualizar este pedido da equipa.', 'error');
      }
    });
  });
}

function bindStaffInviteForm() {
  // Envia o convite de um membro da equipa para o evento selecionado.
  document.getElementById('staff-invite-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const emailInput = document.getElementById('staff-invite-email');
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const result = await API.inviteEventStaff(form.dataset.eventId, emailInput.value.trim());
      emailInput.value = '';
      UI.toast(`${result.name} foi adicionado à equipa do evento.`, 'success');
      renderEventStaff(form.dataset.eventId, await API.getEventStaff(form.dataset.eventId));
    } catch (error) {
      UI.toast(error.message || 'Não foi possível adicionar este membro à equipa.', 'error');
    } finally {
      submitButton.disabled = false;
    }
  });
}

function formatParticipantTimestamp(value) {
  // Formata uma data de inscrição ou entrada segundo a localidade.
  if (!value) return '—';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return '—';
  return timestamp.toLocaleString('pt-PT', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

async function openParticipantsModal(eventId) {
  // Carrega e apresenta inscritos, bilhetes e estado de entrada.
  const event = DB.getEvent(eventId);
  if (!event) return;

  document.getElementById('participants-event-title').textContent = event.title;
  const counter = document.getElementById('participants-counter');
  const tbody = document.getElementById('participants-tbody');
  const modal = document.getElementById('participants-modal-overlay');
  modal.dataset.eventId = String(eventId);
  counter.textContent = 'A carregar participantes…';
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--muted-text-color); padding:30px;">A carregar participantes…</td></tr>';
  UI.openModal(modal);

  try {
    const participants = await API.getEventParticipants(eventId);
    if (modal.dataset.eventId !== String(eventId)) return;

    counter.textContent = `${participants.length} / ${event.maxParticipants} Participantes`;
    if (!participants.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--muted-text-color); padding:30px;">Ainda não existem participantes inscritos.</td></tr>`;
      return;
    }

    tbody.innerHTML = participants.map(person => `
      <tr>
        <td>${UI.escapeHtml(person.name)}</td>
        <td>${UI.escapeHtml(person.email)}</td>
        <td>${UI.escapeHtml(formatParticipantTimestamp(person.registeredAt))}</td>
        <td>
          <span class="badge ${person.checkedIn ? 'badge-success' : 'badge-muted'}">${person.checkedIn ? 'Validado à entrada' : 'Confirmado'}</span>
          ${person.checkedInAt ? `<small>${UI.escapeHtml(formatParticipantTimestamp(person.checkedInAt))}</small>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (error) {
    if (modal.dataset.eventId !== String(eventId)) return;
    counter.textContent = 'Não foi possível carregar os participantes';
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--danger-color); padding:30px;">${UI.escapeHtml(error.message || 'Não foi possível carregar os participantes. Tente novamente.')}</td></tr>`;
  }
}

function renderJoinedEvents() {
  // Desenha as inscrições confirmadas e liga cada evento aos seus detalhes.
  const session = DB.getSession();
  const regs = DB.getRegistrationsForUser(session.id).filter(r => r.status === 'confirmed');
  const events = regs.map(r => ({ reg: r, event: DB.getEvent(r.eventId) })).filter(x => x.event);
  events.sort((a, b) => b.reg.registeredAt - a.reg.registeredAt);

  document.getElementById('joined-count').textContent = `${events.length} ${events.length === 1 ? 'evento' : 'eventos'}`;
  const list = document.getElementById('joined-list');

  if (!events.length) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-ticket"></i>
        <h3>Ainda não participa em eventos</h3>
        <p>Explore eventos e inscreva-se para os consultar aqui.</p>
        <a href="frontend/events/events.html" class="btn btn-primary" style="margin-top:14px;">Explorar eventos</a>
      </div>`;
    return;
  }

  list.innerHTML = events.map(({ event }) => `
    <div class="managed-item ${event.status === 'cancelled' ? 'is-cancelled' : ''}" data-id="${event.id}">
      <img class="mi-thumb" src="${event.image}" alt="${UI.escapeHtml(event.title)}">
      <div class="mi-info">
        <div class="mi-title">${UI.escapeHtml(event.title)} ${statusBadge(event)}</div>
        <div class="mi-meta">
          <span><i class="fa-solid fa-calendar"></i> ${UI.formatDate(event.date)}</span>
          <span><i class="fa-solid fa-location-dot"></i> ${UI.escapeHtml(event.location)}</span>
          <span><i class="fa-solid fa-user-tie"></i> ${UI.escapeHtml(event.organizer)}</span>
        </div>
      </div>
      <div class="mi-actions">
        <button class="btn btn-primary btn-sm view-event-btn" data-id="${event.id}"><i class="fa-solid fa-eye"></i> Ver evento</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.view-event-btn').forEach(btn => {
    btn.addEventListener('click', () => window.location.href = UI.pageUrl(`frontend/events/event-details.html?id=${btn.dataset.id}`));
  });
}
