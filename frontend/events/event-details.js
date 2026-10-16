/* ==========================================================================
   Apresenta detalhes do evento, inscrições, organizador e ligações sociais.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  await DB.init();
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get('id');
  const root = document.getElementById('event-details-root');

  const event = eventId ? DB.getEvent(eventId) : null;

  if (!event) {
    root.innerHTML = `
      <a href="frontend/events/events.html" class="back-link"><i class="fa-solid fa-arrow-left"></i> Voltar aos eventos</a>
      <div class="empty-state">
        <i class="fa-solid fa-circle-question"></i>
        <h3>Evento não encontrado</h3>
        <p>O evento que procura não existe ou pode ter sido removido.</p>
        <a href="frontend/events/events.html" class="btn btn-primary" style="margin-top:14px;">Explorar eventos</a>
      </div>`;
    return;
  }

  render(event);
});

function render(event) {
  // Compõe a página de detalhes com ações adequadas ao estado e ao papel.
  const root = document.getElementById('event-details-root');
  const session = DB.getSession();
  const isOrganizer = session && String(event.organizerId) === String(session.id);
  const cat = UI.categoryMeta(event.category);
  const isFav = session ? DB.isFavorite(session.id, event.id) : false;
  const isRegistered = session ? DB.isUserRegistered(event.id, session.id) : false;
  const capacity = Math.max(1, Number(event.maxParticipants) || 0);
  const participants = Math.max(0, Number(event.participants) || 0);
  const isFull = participants >= capacity;
  const isCancelled = event.status === 'cancelled';
  const remaining = Math.max(0, capacity - participants);
  const pct = Math.min(100, Math.round((participants / capacity) * 100));

  root.innerHTML = `
    <a href="frontend/events/events.html" class="back-link"><i class="fa-solid fa-arrow-left"></i> Voltar aos eventos</a>

    ${isCancelled ? `<div class="alert alert-danger"><i class="fa-solid fa-ban"></i> Este evento foi cancelado pelo organizador.</div>` : ''}

    <div class="details-layout">
      <div class="details-main">
        <div class="details-hero-img">
          <img src="${event.image}" alt="${UI.escapeHtml(event.title)}">
          <span class="badge" style="background:${cat.color}; color:#fff;"><i class="fa-solid ${cat.icon}"></i> ${cat.name}</span>
        </div>

        <div class="details-title-row">
          <div>
            <h1>${UI.escapeHtml(event.title)}</h1>
            <span class="badge ${isCancelled ? 'badge-danger' : isFull ? 'badge-warning' : 'badge-success'}">
              ${isCancelled ? 'Cancelado' : isFull ? 'Lotado' : 'Inscrições abertas'}
            </span>
          </div>
          <button class="details-fav-btn ${isFav ? 'is-fav' : ''}" id="details-fav-btn" aria-label="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
            <i class="fa-solid fa-heart"></i><i class="fa-regular fa-heart"></i>
          </button>
        </div>

        <div class="details-info-grid">
          <div class="info-item"><i class="fa-solid fa-calendar"></i><div><div class="info-label">Data</div><div class="info-value">${UI.formatDate(event.date)}</div></div></div>
          <div class="info-item"><i class="fa-solid fa-clock"></i><div><div class="info-label">Hora</div><div class="info-value">${UI.formatTime(event.time)}</div></div></div>
          <div class="info-item"><i class="fa-solid fa-location-dot"></i><div><div class="info-label">Localização</div><div class="info-value">${UI.escapeHtml(event.location)}</div></div></div>
          <div class="info-item"><i class="fa-solid fa-user-tie"></i><div><div class="info-label">Organizador</div><div class="info-value">${UI.escapeHtml(event.organizer)}</div></div></div>
        </div>

        <h3>Sobre este evento</h3>
        <p class="details-desc">${UI.escapeHtml(event.description)}</p>
      </div>

      <div class="details-sidebar">
        <div class="card sidebar-card">
          <div class="capacity-summary">
            <div class="big-number">${participants}<span> / ${event.maxParticipants}</span></div>
            <div class="capacity-sub">participantes inscritos</div>
            <div class="capacity-bar-wrap" style="margin-top:14px;">
              <div class="capacity-bar"><div class="capacity-bar-fill ${isFull ? 'full' : ''}" style="width:${pct}%"></div></div>
              <div class="capacity-label"><span>${remaining} lugares disponíveis</span><span>${pct}%</span></div>
            </div>
          </div>
          ${isOrganizer
            ? `<button class="btn btn-primary btn-block btn-lg" id="edit-event-btn">
                <i class="fa-solid fa-pen"></i> Editar evento
              </button>`
            : `<button class="btn btn-block btn-lg ${isRegistered ? 'btn-secondary' : 'btn-primary'}" id="register-btn" ${isCancelled ? 'disabled' : ''}>
                ${registerBtnLabel(isRegistered, isFull, isCancelled)}
              </button>`}
          <button class="btn btn-outline btn-block" id="fav-btn-sidebar" style="margin-top:10px;">
            <i class="fa-${isFav ? 'solid' : 'regular'} fa-heart"></i> ${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          </button>
          <div id="register-confirmation" class="alert alert-success" style="display:none; margin-top:14px; margin-bottom:0;">
            <i class="fa-solid fa-circle-check"></i> <span>A sua inscrição está confirmada. Até lá!</span>
          </div>
        </div>

        ${isOrganizer ? `
          <div class="card sidebar-card event-qr-card">
            <h4><i class="fa-solid fa-qrcode"></i> Partilhar este evento</h4>
            <p class="event-qr-hint">Leia este código para abrir a página pública do evento.</p>
            <div id="event-qr-code" class="event-qr-code" role="img" aria-label="Código QR da página pública do evento"></div>
            <div id="event-qr-error" class="form-error event-qr-error" role="alert"></div>
            <button type="button" class="btn btn-outline btn-block" id="download-event-qr" disabled>
              <i class="fa-solid fa-download"></i> Transferir código QR
            </button>
          </div>` : ''}

        <div class="card sidebar-card creator-profile-card" id="creator-profile-card" data-organizer-id="${event.organizerId || ''}">
          <h4><i class="fa-solid fa-store"></i> Organizador</h4>
          <div class="creator-profile-loading">A carregar o perfil do organizador…</div>
        </div>
      </div>
    </div>
  `;

  bindActions(event);
  loadOrganizerCard(event, isOrganizer);
  if (session && API.getMutualEventAttendees) loadMutualAttendees(event);
}

async function loadMutualAttendees(event) {
  // Mostra pessoas seguidas que também se inscreveram no evento.
  try {
    const attendees = await API.getMutualEventAttendees(event.id);
    if (!attendees.length) return;
    const sidebar = document.querySelector('.details-sidebar');
    const card = document.createElement('section');
    card.className = 'card sidebar-card mutual-attendees-card';
    card.innerHTML = `<h4><i class="fa-solid fa-user-group"></i> Pessoas que segue e vão participar</h4>
      <div class="mutual-attendee-list">${attendees.map(person => `
        <a class="mutual-attendee" href="frontend/people/public-profile.html?id=${encodeURIComponent(person.id)}">
          ${person.avatarUrl ? `<img src="${UI.escapeHtml(person.avatarUrl)}" alt="">` : `<span class="avatar-circle">${UI.escapeHtml(UI.initials(person.name))}</span>`}
          <span>${UI.escapeHtml(person.name)}</span>
        </a>`).join('')}</div>`;
    sidebar.insertBefore(card, document.getElementById('creator-profile-card'));
  } catch (error) {
    console.error('Não foi possível carregar participantes da sua rede:', error);
  }
}

async function loadOrganizerCard(event, isOwnEvent) {
  // Carrega a apresentação pública do organizador e o controlo de seguimento.
  const card = document.getElementById('creator-profile-card');
  if (!card) return;
  if (!event.organizerId || !API.getOrganizerProfile) {
    card.innerHTML = `<h4><i class="fa-solid fa-user-tie"></i> Organizado por</h4><div class="organizer-row"><span class="avatar-circle">${UI.escapeHtml(UI.initials(event.organizer))}</span><div><div class="org-name">${UI.escapeHtml(event.organizer)}</div><div class="org-role">Organizador de eventos</div></div></div>`;
    return;
  }
  try {
    const profile = await API.getOrganizerProfile(event.organizerId);
    const session = DB.getSession();
    const hasSession = Boolean(session && API.getToken());
    const isFollowing = hasSession && !isOwnEvent && Boolean(profile.following);
    const requestPending = hasSession && !isOwnEvent && Boolean(profile.requestPending);
    const avatar = profile.avatarUrl
      ? `<img class="creator-avatar" src="${UI.escapeHtml(profile.avatarUrl)}" alt="${UI.escapeHtml(profile.brandName)}">`
      : `<span class="avatar-circle creator-avatar-fallback">${UI.escapeHtml(UI.initials(profile.brandName || profile.name))}</span>`;
    const links = [
      profile.websiteUrl ? safeCreatorLink(profile.websiteUrl, 'Site', 'fa-globe') : '',
      profile.instagramUrl ? safeCreatorLink(profile.instagramUrl, 'Instagram', 'fa-brands fa-instagram') : '',
      profile.contactEmail ? `<a href="mailto:${encodeURIComponent(profile.contactEmail)}"><i class="fa-solid fa-envelope"></i> Contactos</a>` : ''
    ].filter(Boolean).join('');
    card.innerHTML = `
      <div class="creator-identity">
        ${avatar}
        <div><h4>${UI.escapeHtml(profile.brandName || profile.name)}</h4><div class="org-role">Organizador de eventos</div></div>
      </div>
      <p class="creator-bio">${UI.escapeHtml(profile.bio || 'Este organizador ainda não adicionou uma biografia.')}</p>
      <div class="creator-stats"><strong>${Number(profile.hostedEventsCount) || 0}</strong> eventos organizados <span aria-hidden="true">·</span> <strong id="creator-follower-count">${Number(profile.followerCount) || 0}</strong> seguidores</div>
      ${links ? `<div class="creator-links">${links}</div>` : ''}
      ${!isOwnEvent ? `<button type="button" class="btn ${isFollowing ? 'btn-secondary' : 'btn-primary'} btn-block creator-follow-btn" id="creator-follow-btn" ${hasSession ? '' : 'data-requires-auth="true"'}>${isFollowing ? 'A seguir' : requestPending ? 'Pedido enviado · Cancelar' : 'Seguir organizador'}</button>` : '<span class="creator-self-label">O seu perfil de organizador</span>'}`;
    const followButton = document.getElementById('creator-follow-btn');
    if (followButton) followButton.addEventListener('click', async () => {
      const user = await Auth.requireAuth('Inicie sessão para seguir este organizador.');
      if (!user) return;
      try {
        const result = await API.toggleOrganizerFollow(profile.id);
        followButton.textContent = result.following ? 'A seguir' : result.requestPending ? 'Pedido enviado · Cancelar' : 'Seguir organizador';
        followButton.classList.toggle('btn-primary', !result.following);
        followButton.classList.toggle('btn-secondary', result.following);
        document.getElementById('creator-follower-count').textContent = result.followerCount;
      } catch (error) {
        UI.toast(error.message || 'Não foi possível atualizar a ligação ao organizador.', 'error');
      }
    });
  } catch (error) {
    card.innerHTML = `<h4><i class="fa-solid fa-user-tie"></i> Organizado por</h4><div class="organizer-row"><span class="avatar-circle">${UI.escapeHtml(UI.initials(event.organizer))}</span><div><div class="org-name">${UI.escapeHtml(event.organizer)}</div><div class="org-role">Perfil do organizador indisponível</div></div></div>`;
    console.error('Não foi possível carregar o perfil do organizador:', error);
  }
}

function safeCreatorLink(value, label, icon) {
  // Gera uma ligação externa segura para os dados públicos do organizador.
  try {
    const link = document.createElement('a');
    link.href = value;
    if (!['http:', 'https:'].includes(link.protocol)) return '';
    return `<a href="${UI.escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer"><i class="${icon.includes('brands') ? 'fa-brands' : 'fa-solid'} ${icon.includes('brands') ? icon.split(' ')[1] : icon}"></i> ${label}</a>`;
  } catch {
    return '';
  }
}

function registerBtnLabel(isRegistered, isFull, isCancelled) {
  // Escolhe o texto do botão de inscrição conforme o estado do evento.
  if (isCancelled) return '<i class="fa-solid fa-ban"></i> Evento cancelado';
  if (isRegistered) return '<i class="fa-solid fa-right-from-bracket"></i> Cancelar inscrição';
  if (isFull) return '<i class="fa-solid fa-lock"></i> Evento lotado';
  return '<i class="fa-solid fa-ticket"></i> Inscrever-me no evento';
}

function bindActions(event) {
  // Liga geração de QR, favoritos, inscrição e edição do evento.
  const favBtn = document.getElementById('details-fav-btn');
  const favBtnSidebar = document.getElementById('fav-btn-sidebar');
  const registerBtn = document.getElementById('register-btn');
  const editBtn = document.getElementById('edit-event-btn');

  const qrContainer = document.getElementById('event-qr-code');
  const downloadQrBtn = document.getElementById('download-event-qr');
  if (qrContainer && downloadQrBtn) {
    try {
      if (typeof QRCode !== 'function') throw new Error('O gerador de códigos QR não está disponível.');
      const eventPageUrl = document.createElement('a');
      eventPageUrl.href = 'frontend/events/event-details.html';
      eventPageUrl.search = `?id=${encodeURIComponent(event.id)}`;
      const publicUrl = eventPageUrl.href;
      new QRCode(qrContainer, {
        text: publicUrl,
        width: 224,
        height: 224,
        correctLevel: QRCode.CorrectLevel.M
      });
      const canvas = qrContainer.querySelector('canvas');
      if (!canvas) throw new Error('Não foi possível gerar o código QR.');
      downloadQrBtn.disabled = false;
      downloadQrBtn.addEventListener('click', () => {
        canvas.toBlob((blob) => {
          if (!blob) {
            UI.toast('Não foi possível criar a transferência PNG deste código QR.', 'error');
            return;
          }
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          const safeTitle = event.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'event';
          link.href = downloadUrl;
          link.download = `${safeTitle}-qr-code.png`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
        }, 'image/png');
      });
    } catch (error) {
      downloadQrBtn.disabled = true;
      document.getElementById('event-qr-error').textContent = error.message || 'Não foi possível gerar o código QR do evento.';
    }
  }

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      window.location.href = UI.pageUrl(`frontend/events/create-event.html?edit=${encodeURIComponent(event.id)}`);
    });
  }

  const toggleFav = async () => {
    const session = DB.getSession();
    if (!session) { Auth.requireAuth('Inicie sessão para guardar eventos favoritos.'); return; }
    const isFav = await DB.toggleFavorite(session.id, event.id);
    UI.toast(isFav ? 'Evento adicionado aos favoritos.' : 'Evento removido dos favoritos.', isFav ? 'success' : 'info');
    render(event);
  };
  favBtn.addEventListener('click', toggleFav);
  favBtnSidebar.addEventListener('click', toggleFav);

  if (!registerBtn) return;

  registerBtn.addEventListener('click', async () => {
    const session = await Auth.requireAuth('Inicie sessão para se inscrever neste evento.');
    if (!session) return;

    const currentEvent = DB.getEvent(event.id);
    if (DB.isUserRegistered(event.id, session.id)) {
      const confirmed = await UI.confirmDialog({
        title: 'Cancelar inscrição?',
        message: `Tem a certeza de que pretende cancelar a inscrição em «${currentEvent.title}»?`,
        okText: 'Sim, cancelar inscrição',
        icon: 'fa-right-from-bracket',
        tone: 'danger'
      });
      if (!confirmed) return;

      try {
        const result = await DB.leaveEvent(event.id, session.id);
        if (result.ok) {
          UI.toast('A sua inscrição foi cancelada.', 'success');
          render(DB.getEvent(event.id));
        } else {
          UI.toast(result.message || 'Não foi possível cancelar a inscrição.', 'error');
        }
      } catch (error) {
        UI.toast(error.message || 'Não foi possível cancelar a inscrição.', 'error');
      }
      return;
    }
    if (currentEvent.status === 'cancelled') {
      UI.toast('Este evento foi cancelado.', 'error');
      return;
    }
    if (currentEvent.participants >= currentEvent.maxParticipants) {
      UI.toast('Lamentamos, mas o evento está lotado.', 'warning');
      return;
    }

    try {
      const result = await DB.registerForEvent(event.id, session);
      if (result.ok) {
        UI.toast('Inscrição efetuada com sucesso!', 'success');
        const updated = DB.getEvent(event.id);
        render(updated);
        const confirmBox = document.getElementById('register-confirmation');
        if (confirmBox) confirmBox.style.display = 'flex';
      } else {
        UI.toast(result.message, 'error');
      }
    } catch (error) {
      const message = error && error.message ? error.message : '';
      if (/already registered|já está inscrito/i.test(message)) {
        UI.toast('Já está inscrito neste evento.', 'info');
      } else {
        UI.toast(message || 'Não foi possível efetuar a inscrição neste evento.', 'error');
      }
    }
  });
}
