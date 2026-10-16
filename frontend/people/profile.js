/* ==========================================================================
   Apresenta o perfil próprio, permite editá-lo e gere a rede social.
   ========================================================================== */

let editAvatarData = '';
let editCoverData = '';
let profileTickets = [];
let profileFavorites = [];
let interestOrder = [];

document.addEventListener('DOMContentLoaded', async () => {
  await DB.init();
  const session = await Auth.requireAuth('Inicie sessão para consultar o seu perfil.');
  if (!session) {
    setTimeout(() => { if (!DB.getSession()) window.location.href = UI.pageUrl('frontend/home/index.html'); }, 50);
    return;
  }

  mountTicketModal();
  bindEditProfile();
  bindNetworkControls();
  await renderProfile();
});

async function renderProfile() {
  // Sincroniza os dados da conta antes de apresentar o perfil e o painel.
  const user = DB.setSession(await API.getMe() || DB.getSession());
  document.getElementById('profile-name').textContent = user.name;
  document.getElementById('profile-email').textContent = user.email;
  document.getElementById('profile-username').textContent = user.username ? `@${user.username}` : '';
  document.getElementById('profile-location').textContent = user.profileLocation || '';
  document.getElementById('profile-location').hidden = !user.profileLocation
  document.getElementById('profile-role').textContent = user.role === 'organizer'
    ? 'Organizador de eventos'
    : user.role === 'staff' ? 'Equipa / segurança' : 'Participante';
  document.getElementById('profile-bio').textContent = user.bio || 'Adicione uma breve biografia para personalizar o seu perfil.';
  document.getElementById('profile-status').textContent = user.statusMessage || '';
  document.getElementById('profile-pronouns').textContent = user.pronouns || '';
  const cover = document.getElementById('profile-cover');
  cover.dataset.cover = user.coverImage || '';
  cover.style.backgroundImage = profileCoverCss(user.coverImage);
  document.getElementById('profile-theme').style.setProperty('--profile-accent', user.profileTheme || '#7c5cff');
  document.getElementById('profile-avatar-img').className = `profile-avatar frame-${user.avatarFrame || 'none'}`;
  document.getElementById('profile-avatar-initials').className = `avatar-circle profile-avatar-fallback frame-${user.avatarFrame || 'none'}`;
  const interestContainer = document.getElementById('profile-interests');
  interestContainer.innerHTML = (user.preferredCategories || []).map(category =>
    `<span class="badge badge-muted">${UI.escapeHtml(UI.categoryLabel(category))}</span>`
  ).join('');

  const avatarImg = document.getElementById('profile-avatar-img');
  const avatarFallback = document.getElementById('profile-avatar-initials');
  if (user.avatar) {
    avatarImg.src = user.avatar;
    avatarImg.style.display = 'block';
    avatarFallback.style.display = 'none';
  } else {
    avatarImg.style.display = 'none';
    avatarFallback.style.display = 'flex';
    avatarFallback.textContent = UI.initials(user.name);
  }

  let tickets = [];
  let favorites = [];
  try {
    [tickets, favorites] = await Promise.all([API.listMyTickets(), API.getFavorites()]);
    DB.replaceEvents([...DB.getEvents(), ...tickets, ...favorites]);
  } catch (error) {
    UI.toast(error.message || 'Não foi possível carregar os eventos do seu perfil.', 'error');
  }
  profileTickets = tickets;
  profileFavorites = favorites;

  const createdEvents = DB.getEvents().filter(e => String(e.createdBy) === String(user.id));
  document.getElementById('stat-created').textContent = createdEvents.length;
  document.getElementById('stat-joined').textContent = tickets.length;
  document.getElementById('stat-favorites').textContent = favorites.length;
  try {
    const network = await API.getMyNetworkSummary();
    document.getElementById('stat-followers').textContent = network.followerCount;
    document.getElementById('stat-following').textContent = network.followingCount;
  } catch (error) {
    UI.toast(error.message || 'Não foi possível carregar o resumo da sua rede.', 'error');
  }
  document.getElementById('profile-badges').innerHTML = (user.badges || []).map(badge =>
    `<span class="profile-achievement-badge" title="${UI.escapeHtml(badge.label)}"><i class="fa-solid ${UI.escapeHtml(badge.icon)}"></i> ${UI.escapeHtml(badge.label)}</span>`
  ).join('');
  document.getElementById('profile-social-links').innerHTML = profileSocialLinks(user);
  renderDashboard(user, createdEvents, tickets, favorites);
}

function renderDashboard(user, createdEvents, tickets, favorites) {
  // Renderiza conteúdo personalizado ao papel e à atividade da conta.
  const main = document.getElementById('profile-dashboard-content');
  if (user.role === 'organizer') {
    main.innerHTML = `
      <div class="card profile-section-card">
        <h3><i class="fa-solid fa-calendar-check"></i> Atividade recente</h3>
        <div id="recent-activity-list"></div>
      </div>
      <div class="card profile-section-card organizer-profile-preview">
        <h3><i class="fa-solid fa-store"></i> Perfil público de organizador</h3>
        <p>As páginas dos seus eventos apresentam o seu perfil e as respetivas ligações.</p>
        <strong>${UI.escapeHtml(user.brandName || user.name)}</strong>
        <p>${UI.escapeHtml(user.bio || 'Adicione uma breve biografia para apresentar a sua organização.')}</p>
        <div>${profileLink(user.websiteUrl, 'Site')} ${profileLink(user.instagramUrl, 'Instagram')} ${user.contactEmail ? `<a href="mailto:${encodeURIComponent(user.contactEmail)}">E-mail</a>` : ''}</div>
      </div>`;
    renderRecentActivity(createdEvents, tickets);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = tickets.filter(event => event.date >= today && event.status !== 'cancelled');
  const past = tickets.filter(event => event.date < today || event.status === 'cancelled');
  main.innerHTML = `
    <div class="card profile-section-card">
      <h3><i class="fa-solid fa-ticket"></i> Próximos eventos <span class="profile-section-count">${upcoming.length}</span></h3>
      <div id="attendee-upcoming-list"></div>
    </div>
    <div class="card profile-section-card">
      <h3><i class="fa-solid fa-heart"></i> Eventos favoritos <span class="profile-section-count">${favorites.length}</span></h3>
      <div id="attendee-favorites-list"></div>
    </div>
    <div class="card profile-section-card">
      <h3><i class="fa-solid fa-clock-rotate-left"></i> Eventos anteriores <span class="profile-section-count">${past.length}</span></h3>
      <div id="attendee-past-list"></div>
    </div>`;

  renderTicketList(document.getElementById('attendee-upcoming-list'), upcoming);
  renderTicketList(document.getElementById('attendee-past-list'), past);
  renderFavoriteList(document.getElementById('attendee-favorites-list'), favorites);
}

function renderTicketList(container, events) {
  // Apresenta inscrições e permite abrir o QR de cada bilhete.
  if (!events.length) {
    container.innerHTML = `<div class="empty-state profile-empty"><i class="fa-solid fa-ticket"></i><p>Ainda não tem bilhetes.</p><a href="frontend/events/events.html" class="btn btn-outline btn-sm">Explorar eventos</a></div>`;
    return;
  }
  container.innerHTML = events.map(event => {
    const ticket = profileTickets.find(item => String(item.id) === String(event.id));
    return `
      <article class="profile-event-item">
        <div class="profile-event-copy">
          <a class="profile-event-title" href="frontend/events/event-details.html?id=${encodeURIComponent(event.id)}">${UI.escapeHtml(event.title)}</a>
          <span>${UI.escapeHtml(UI.formatDate(event.date))} · ${UI.escapeHtml(event.location)}</span>
        </div>
        ${ticket && ticket.ticketCode ? `<button type="button" class="btn btn-primary btn-sm show-ticket-btn" data-ticket-code="${UI.escapeHtml(ticket.ticketCode)}" data-event-title="${UI.escapeHtml(event.title)}"><i class="fa-solid fa-qrcode"></i> Bilhete QR</button>` : ''}
      </article>`;
  }).join('');
  container.querySelectorAll('.show-ticket-btn').forEach(button => {
    button.addEventListener('click', () => openTicketQr(button.dataset.ticketCode, button.dataset.eventTitle));
  });
}

function renderFavoriteList(container, events) {
  // Apresenta os eventos guardados como favoritos.
  if (!events.length) {
    container.innerHTML = `<div class="empty-state profile-empty"><i class="fa-solid fa-heart"></i><p>Ainda não guardou nenhum evento.</p><a href="frontend/events/events.html" class="btn btn-outline btn-sm">Explorar eventos</a></div>`;
    return;
  }
  container.innerHTML = events.map(event => `
    <article class="profile-event-item">
      <div class="profile-event-copy">
        <a class="profile-event-title" href="frontend/events/event-details.html?id=${encodeURIComponent(event.id)}">${UI.escapeHtml(event.title)}</a>
        <span>${UI.escapeHtml(UI.formatDate(event.date))} · ${UI.escapeHtml(event.location)}</span>
      </div>
      <a class="btn btn-outline btn-sm" href="frontend/events/event-details.html?id=${encodeURIComponent(event.id)}">Ver evento</a>
    </article>
  `).join('');
}

function renderRecentActivity(createdEvents, joinedEvents) {
  // Combina e ordena a atividade recente do organizador.
  const list = document.getElementById('recent-activity-list');
  const items = [];
  createdEvents.forEach(event => items.push({ type: 'created', date: event.createdAt, event }));
  joinedEvents.forEach(event => items.push({
    type: 'joined',
    date: event.registeredAt ? Date.parse(event.registeredAt) : Date.now(),
    event
  }));
  items.sort((a, b) => b.date - a.date);
  if (!items.length) {
    list.innerHTML = `<div class="empty-state profile-empty"><i class="fa-solid fa-clock-rotate-left"></i><p>Ainda não tem atividade. Crie ou participe num evento para a consultar aqui.</p></div>`;
    return;
  }
  list.innerHTML = items.slice(0, 8).map(item => `
    <div class="activity-item">
      <span class="act-icon"><i class="fa-solid ${item.type === 'created' ? 'fa-plus' : 'fa-ticket'}"></i></span>
      <div>
        <div class="act-title">${item.type === 'created' ? 'Criou' : 'Inscreveu-se em'} «${UI.escapeHtml(item.event.title)}»</div>
        <div class="act-sub">${Number.isNaN(item.date) ? '' : new Date(item.date).toLocaleDateString('pt-PT', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
      </div>
      <a class="btn btn-ghost btn-sm act-link" href="frontend/events/event-details.html?id=${encodeURIComponent(item.event.id)}">Ver</a>
    </div>
  `).join('');
}

function profileLink(value, label) {
  // Gera uma ligação externa apenas para URLs HTTP ou HTTPS.
  if (!value) return '';
  try {
    const link = document.createElement('a');
    link.href = value;
    if (!['https:', 'http:'].includes(link.protocol)) return '';
    return `<a href="${UI.escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  } catch {
    return '';
  }
}

function mountTicketModal() {
  // Monta a janela reutilizável para apresentar o QR do bilhete.
  const modal = document.createElement('div');
  modal.id = 'profile-ticket-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="profile-ticket-title">
      <div class="modal-header">
        <h3 id="profile-ticket-title"><i class="fa-solid fa-ticket"></i> Bilhete do evento</h3>
        <button type="button" class="modal-close" data-close-modal aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body ticket-modal-body">
        <h4 id="profile-ticket-event-name"></h4>
        <div id="profile-ticket-qr" class="event-qr-code" role="img" aria-label="Código QR do bilhete"></div>
        <p>Apresente este código à entrada do evento.</p>
        <a id="profile-ticket-open-link" class="btn btn-outline btn-block" target="_blank" rel="noopener noreferrer">Abrir detalhes do bilhete</a>
      </div>
    </div>`;
  document.body.appendChild(modal);
  UI.bindOverlayClose(modal);
}

function openTicketQr(ticketCode, eventTitle) {
  // Gera o QR e mostra a ligação pública do bilhete.
  const qr = document.getElementById('profile-ticket-qr');
  qr.replaceChildren();
  document.getElementById('profile-ticket-event-name').textContent = eventTitle;
  const ticketUrl = document.createElement('a');
  ticketUrl.href = `frontend/tickets/ticket.html?code=${encodeURIComponent(ticketCode)}`;
  document.getElementById('profile-ticket-open-link').href = ticketUrl.href;
  try {
    if (typeof QRCode !== 'function') throw new Error('O gerador de códigos QR não está disponível.');
    new QRCode(qr, { text: ticketUrl.href, width: 224, height: 224, correctLevel: QRCode.CorrectLevel.M });
    UI.openModal(document.getElementById('profile-ticket-modal'));
  } catch (error) {
    UI.toast(error.message || 'Não foi possível gerar o código QR do bilhete.', 'error');
  }
}

function bindEditProfile() {
  // Liga e valida os controlos que atualizam os dados do perfil.
  const overlay = document.getElementById('edit-profile-modal-overlay');
  const phonePicker = PhoneInput.mount(document.getElementById('edit-phone-picker'));
  const cityInput = CityInput.mount(document.getElementById('edit-city'));
  const interestOptions = document.getElementById('edit-preferred-categories');
  const orderedInterests = document.getElementById('edit-interest-order');
  interestOptions.innerHTML = DB.CATEGORIES.map(category => `
    <label class="profile-category-option">
      <input type="checkbox" value="${UI.escapeHtml(category.name)}">
      <span>${UI.escapeHtml(category.name)}</span>
    </label>
  `).join('');
  UI.bindOverlayClose(overlay);
  interestOptions.addEventListener('change', event => {
    if (event.target.matches('input[type="checkbox"]')) {
      const selected = Array.from(interestOptions.querySelectorAll('input:checked')).map(input => input.value);
      if (selected.length > 8) {
        event.target.checked = false;
        UI.toast('Escolha, no máximo, 8 interesses.', 'error');
        return;
      }
      interestOrder = interestOrder.filter(item => selected.includes(item));
      if (event.target.checked) interestOrder.push(event.target.value);
      renderInterestOrder(orderedInterests);
    }
  });

  document.getElementById('edit-profile-btn').addEventListener('click', () => {
    const user = DB.getSession();
    document.getElementById('edit-name').value = user.name;
    document.getElementById('edit-email').value = user.email;
    document.getElementById('edit-username').value = user.username || '';
    document.getElementById('edit-is-public').checked = user.isPublic !== false;
    phonePicker.setValue(user.phoneNumber || '', user.country || '');
    cityInput.setValue(user.city || '');
    document.getElementById('edit-profile-location').value = user.profileLocation || '';
    document.getElementById('edit-bio').value = user.bio || '';
    document.getElementById('edit-status-message').value = user.statusMessage || '';
    document.getElementById('edit-pronouns').value = user.pronouns || '';
    document.getElementById('edit-profile-theme').value = user.profileTheme || '#7c5cff';
    const frameSelect = document.getElementById('edit-avatar-frame');
    frameSelect.querySelector('option[value="creator"]').hidden = user.role !== 'organizer';
    frameSelect.querySelector('option[value="staff"]').hidden = user.role !== 'staff';
    frameSelect.value = user.avatarFrame || 'none';
    if (frameSelect.selectedOptions[0]?.hidden) frameSelect.value = 'none';
    document.getElementById('edit-show-interests').checked = user.showInterests !== false;
    document.getElementById('edit-show-attended').checked = user.showAttendedEvents !== false;
    document.getElementById('edit-show-attendance-count').checked = user.showAttendanceCount !== false;
    document.getElementById('edit-show-network').checked = user.showNetwork !== false;
    interestOptions.querySelectorAll('input').forEach(input => {
      input.checked = (user.preferredCategories || []).includes(input.value);
    });
    interestOrder = (user.preferredCategories || []).slice(0, 8);
    renderInterestOrder(orderedInterests);
    document.getElementById('edit-cover-preset').value = user.coverImage && user.coverImage.startsWith('preset:') ? user.coverImage : '';
    editCoverData = user.coverImage || '';
    const featuredCandidates = [...profileTickets, ...profileFavorites, ...DB.getEvents().filter(event => String(event.createdBy || event.organizerId) === String(user.id))];
    document.getElementById('edit-featured-event').innerHTML = '<option value="">Nenhuma</option>' + [...new Map(featuredCandidates.map(event => [String(event.id), event])).values()].map(event =>
      `<option value="${UI.escapeHtml(String(event.id))}">${UI.escapeHtml(event.title)}</option>`
    ).join('');
    document.getElementById('edit-featured-event').value = user.featuredEventId ? String(user.featuredEventId) : '';
    document.getElementById('organizer-profile-fields').hidden = user.role !== 'organizer';
    document.getElementById('edit-brand-name').value = user.brandName || '';
    document.getElementById('edit-website-url').value = user.websiteUrl || '';
    document.getElementById('edit-instagram-url').value = user.instagramUrl || '';
    document.getElementById('edit-x-url').value = user.xUrl || '';
    document.getElementById('edit-linkedin-url').value = user.linkedinUrl || '';
    document.getElementById('edit-spotify-url').value = user.spotifyUrl || '';
    document.getElementById('edit-tiktok-url').value = user.tiktokUrl || '';
    document.getElementById('edit-contact-email').value = user.contactEmail || '';
    editAvatarData = user.avatar || '';
    const preview = document.getElementById('edit-avatar-preview');
    const previewImg = document.getElementById('edit-avatar-preview-img');
    if (editAvatarData) { previewImg.src = editAvatarData; preview.classList.add('show'); }
    else { preview.classList.remove('show'); }
    UI.openModal(overlay);
  });

  document.getElementById('edit-cover-input').addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { UI.toast('A imagem de capa é demasiado grande. O limite é 3 MB.', 'error'); return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { UI.toast('Utilize uma imagem de capa PNG, JPEG ou WebP.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = result => {
      editCoverData = result.target.result;
      document.getElementById('edit-cover-preset').value = '';
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('edit-cover-preset').addEventListener('change', event => {
    if (event.target.value === '__remove__') editCoverData = '';
    else if (event.target.value) editCoverData = event.target.value;
  });

  document.getElementById('edit-avatar-input').addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { UI.toast('A imagem é demasiado grande. O limite é 3 MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = result => {
      editAvatarData = result.target.result;
      document.getElementById('edit-avatar-preview-img').src = editAvatarData;
      document.getElementById('edit-avatar-preview').classList.add('show');
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('edit-profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    const nameEl = document.getElementById('edit-name');
    const emailEl = document.getElementById('edit-email');
    const usernameEl = document.getElementById('edit-username');
    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
    const username = usernameEl.value.trim().toLowerCase();
    const { phoneNumber, country } = phonePicker.getValue();
    const city = cityInput.getValue();
    let valid = true;
    if (name.length < 2) { nameEl.closest('.form-group').classList.add('has-error'); valid = false; } else nameEl.closest('.form-group').classList.remove('has-error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { emailEl.closest('.form-group').classList.add('has-error'); valid = false; } else emailEl.closest('.form-group').classList.remove('has-error');
    if (!/^[a-z0-9][a-z0-9._-]{1,39}$/.test(username)) { usernameEl.closest('.form-group').classList.add('has-error'); valid = false; } else usernameEl.closest('.form-group').classList.remove('has-error');
    if (!PhoneInput.isValid(phoneNumber) || country.length < 2) { phonePicker.setError(true); valid = false; } else phonePicker.setError(false);
    if (!cityInput.isValid()) valid = false;
    if (!valid) return;

    const user = DB.getSession();
    const existing = DB.findUserByEmail(email);
    if (existing && String(existing.id) !== String(user.id)) {
      emailEl.closest('.form-group').classList.add('has-error');
      UI.toast('Este endereço de e-mail já está associado a outra conta.', 'error');
      return;
    }
    const preferredCategories = Array.from(interestOptions.querySelectorAll('input:checked')).map(input => input.value);
    try {
      const updatedUser = await API.updateProfile({
        name, email, username, isPublic: document.getElementById('edit-is-public').checked, avatar: editAvatarData, phoneNumber, country,
        city: cityInput.hasChanged() ? city : undefined,
        profileLocation: document.getElementById('edit-profile-location').value.trim() || null,
        bio: document.getElementById('edit-bio').value.trim(),
        preferredCategories: interestOrder.filter(category => preferredCategories.includes(category)),
        coverImage: document.getElementById('edit-cover-preset').value === '__remove__' ? null : document.getElementById('edit-cover-preset').value || editCoverData || null,
        profileTheme: document.getElementById('edit-profile-theme').value,
        avatarFrame: document.getElementById('edit-avatar-frame').value,
        pronouns: document.getElementById('edit-pronouns').value.trim(),
        statusMessage: document.getElementById('edit-status-message').value.trim(),
        showInterests: document.getElementById('edit-show-interests').checked,
        showAttendedEvents: document.getElementById('edit-show-attended').checked,
        showAttendanceCount: document.getElementById('edit-show-attendance-count').checked,
        showNetwork: document.getElementById('edit-show-network').checked,
        featuredEventId: document.getElementById('edit-featured-event').value || null,
        brandName: document.getElementById('edit-brand-name').value.trim(),
        websiteUrl: document.getElementById('edit-website-url').value.trim(),
        instagramUrl: document.getElementById('edit-instagram-url').value.trim(),
        xUrl: document.getElementById('edit-x-url').value.trim(),
        linkedinUrl: document.getElementById('edit-linkedin-url').value.trim(),
        spotifyUrl: document.getElementById('edit-spotify-url').value.trim(),
        tiktokUrl: document.getElementById('edit-tiktok-url').value.trim(),
        contactEmail: document.getElementById('edit-contact-email').value.trim() || null
      });
      DB.setSession(updatedUser);
      UI.toast('Perfil atualizado com sucesso!', 'success');
      UI.closeModal(overlay);
      UI.renderNavbar();
      await renderProfile();
    } catch (error) {
      UI.toast(error.message || 'Não foi possível atualizar o seu perfil.', 'error');
      if (/phone|telefone/i.test(error.message || '')) phonePicker.setError(true);
      else if (/cidade|localização/i.test(error.message || '')) cityInput.setError(error.message);
    }
  });
}

function renderInterestOrder(container) {
  // Apresenta os interesses e permite alterar a sua ordem.
  container.innerHTML = interestOrder.map((category, index) => `
    <span class="interest-order-item">${UI.escapeHtml(UI.categoryLabel(category))}
      <button type="button" data-move="${index}" data-direction="-1" aria-label="Mover ${UI.escapeHtml(UI.categoryLabel(category))} para cima" ${index === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
      <button type="button" data-move="${index}" data-direction="1" aria-label="Mover ${UI.escapeHtml(UI.categoryLabel(category))} para baixo" ${index === interestOrder.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
    </span>`).join('');
  container.querySelectorAll('button[data-move]').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.move);
    const next = index + Number(button.dataset.direction);
    [interestOrder[index], interestOrder[next]] = [interestOrder[next], interestOrder[index]];
    renderInterestOrder(container);
  }));
}

function profileCoverCss(cover) {
  // Converte uma capa predefinida ou imagem em estilo CSS.
  if (!cover) return '';
  const presets = {
    'preset:aurora': 'linear-gradient(120deg,#2dd4bf,#6366f1,#c084fc)',
    'preset:sunset': 'linear-gradient(120deg,#fb7185,#f97316,#facc15)',
    'preset:ocean': 'linear-gradient(120deg,#0ea5e9,#1d4ed8,#312e81)',
    'preset:night': 'linear-gradient(120deg,#111827,#4338ca,#7c3aed)',
    'preset:forest': 'linear-gradient(120deg,#166534,#10b981,#a3e635)'
  };
  return presets[cover] || (cover.startsWith('data:image/') || cover.startsWith('https://') ? `url("${cover.replace(/["\\]/g, '')}")` : '');
}

function profileSocialLinks(user) {
  // Renderiza as ligações sociais públicas disponíveis.
  const links = [
    ['websiteUrl', 'fa-globe', 'Site'], ['instagramUrl', 'fa-brands fa-instagram', 'Instagram'],
    ['xUrl', 'fa-brands fa-x-twitter', 'X'], ['linkedinUrl', 'fa-brands fa-linkedin', 'LinkedIn'],
    ['spotifyUrl', 'fa-brands fa-spotify', 'Spotify'], ['tiktokUrl', 'fa-brands fa-tiktok', 'TikTok']
  ];
  return links.map(([key, icon, label]) => profileLink(user[key], `<i class="${icon}"></i> ${label}`)).filter(Boolean).join('');
}

function bindNetworkControls() {
  // Liga a navegação entre listas de relações e pedidos sociais.
  const modal = document.getElementById('profile-network-modal');
  UI.bindOverlayClose(modal);
  document.getElementById('show-profile-followers').addEventListener('click', () => showProfileNetwork('followers'));
  document.getElementById('show-profile-following').addEventListener('click', () => showProfileNetwork('following'));
  document.getElementById('manage-blocked').addEventListener('click', () => showManagedAccounts('blocked'));
  document.getElementById('manage-follow-requests').addEventListener('click', showFollowRequests);
}

async function showProfileNetwork(kind) {
  // Carrega e apresenta seguidores ou contas seguidas.
  const list = document.getElementById('profile-network-list');
  document.getElementById('profile-network-title').textContent = kind === 'followers' ? 'Seguidores' : 'A seguir';
  UI.openModal(document.getElementById('profile-network-modal'));
  list.innerHTML = '<p class="public-profile-muted">A carregar…</p>';
  try {
    const users = await API.getUserNetwork(DB.getSession().id, kind);
    list.innerHTML = users.length ? users.map(person => `
      <div class="profile-network-person">
        <a class="profile-network-identity" href="frontend/people/public-profile.html?id=${encodeURIComponent(person.id)}">
          ${person.avatarUrl ? `<img class="profile-network-avatar" src="${UI.escapeHtml(person.avatarUrl)}" alt="">` : `<span class="profile-network-avatar profile-network-avatar-fallback">${UI.escapeHtml(UI.initials(person.name))}</span>`}
          <span>${UI.escapeHtml(person.name)} <small>@${UI.escapeHtml(person.username)}</small></span>
        </a>
        <span class="badge badge-muted">${UI.escapeHtml(roleLabel(person.role))}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-follow-user="${person.id}">${person.following ? 'Deixar de seguir' : 'Seguir'}</button>
        ${kind === 'followers' ? `<button class="btn btn-ghost btn-sm" data-remove-follower="${person.id}">Remover</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-block-user="${person.id}">Bloquear</button>
        <button type="button" class="btn btn-ghost btn-sm" data-mute-user="${person.id}">Silenciar</button>
      </div>`).join('') : '<p class="public-profile-muted">Não existem ligações para apresentar.</p>';
    list.querySelectorAll('[data-follow-user]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const result = await API.toggleUserFollow(button.dataset.followUser);
        button.textContent = result.following ? 'Deixar de seguir' : result.requestPending ? 'Pedido enviado · Cancelar' : 'Seguir';
        if (kind === 'following' && !result.following && !result.requestPending) {
          button.closest('.profile-network-person').remove();
        }
        await refreshNetworkStats();
      } catch (error) {
        UI.toast(error.message || 'Não foi possível atualizar esta ligação.', 'error');
      } finally {
        button.disabled = false;
      }
    }));
    list.querySelectorAll('[data-remove-follower]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await API.removeFollower(button.dataset.removeFollower);
        button.closest('.profile-network-person').remove();
        await refreshNetworkStats();
      } catch (error) {
        UI.toast(error.message || 'Não foi possível remover este seguidor.', 'error');
        button.disabled = false;
      }
    }));
    list.querySelectorAll('[data-block-user]').forEach(button => button.addEventListener('click', async () => {
      if (!window.confirm('Bloquear esta conta? Isto remove as duas ligações de seguimento.')) return;
      button.disabled = true;
      try {
        await API.setBlocked(button.dataset.blockUser, true);
        button.closest('.profile-network-person').remove();
        await refreshNetworkStats();
      } catch (error) {
        UI.toast(error.message || 'Não foi possível bloquear esta conta.', 'error');
        button.disabled = false;
      }
    }));
    list.querySelectorAll('[data-mute-user]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await API.setMuted(button.dataset.muteUser, true);
        button.closest('.profile-network-person').remove();
      } catch (error) {
        UI.toast(error.message || 'Não foi possível silenciar esta conta.', 'error');
        button.disabled = false;
      }
    }));
  } catch (error) {
    list.innerHTML = `<p class="public-profile-muted">${UI.escapeHtml(error.message)}</p>`;
  }
}

async function showFollowRequests() {
  // Apresenta pedidos de seguimento pendentes e respetivas ações.
  const list = document.getElementById('profile-network-list');
  document.getElementById('profile-network-title').textContent = 'Pedidos para seguir';
  UI.openModal(document.getElementById('profile-network-modal'));
  list.innerHTML = '<p class="public-profile-muted">A carregar…</p>';
  try {
    const users = await API.getFollowRequests();
    list.innerHTML = users.length ? users.map(person => `
      <div class="profile-network-person"><a href="frontend/people/public-profile.html?id=${encodeURIComponent(person.id)}">${UI.escapeHtml(person.name)} <small>@${UI.escapeHtml(person.username)}</small></a>
        <button class="btn btn-primary btn-sm" data-approve-request="${person.id}">Aprovar</button>
        <button class="btn btn-outline btn-sm" data-reject-request="${person.id}">Recusar</button></div>`).join('') : '<p class="public-profile-muted">Não existem pedidos pendentes.</p>';
    list.querySelectorAll('[data-approve-request], [data-reject-request]').forEach(button => button.addEventListener('click', async () => {
      try {
        await API.decideFollowRequest(button.dataset.approveRequest || button.dataset.rejectRequest, button.hasAttribute('data-approve-request'));
        button.closest('.profile-network-person').remove();
        await refreshNetworkStats();
      } catch (error) {
        UI.toast(error.message || 'Não foi possível atualizar este pedido para seguir.', 'error');
      }
    }));
  } catch (error) {
    list.innerHTML = `<p class="public-profile-muted">${UI.escapeHtml(error.message)}</p>`;
  }
}

async function showManagedAccounts(kind) {
  // Gere contas bloqueadas ou silenciadas pelo utilizador.
  const list = document.getElementById('profile-network-list');
  document.getElementById('profile-network-title').textContent = kind === 'blocked' ? 'Contas bloqueadas' : 'Contas silenciadas';
  UI.openModal(document.getElementById('profile-network-modal'));
  list.innerHTML = '<p class="public-profile-muted">A carregar…</p>';
  try {
    const users = kind === 'blocked' ? await API.getBlockedUsers() : await API.getMutedUsers();
    list.innerHTML = users.length ? users.map(person => `
      <div class="profile-network-person"><span>${UI.escapeHtml(person.name)} <small>@${UI.escapeHtml(person.username)}</small></span>
        <button class="btn btn-outline btn-sm" data-unmanage="${person.id}">${kind === 'blocked' ? 'Desbloquear' : 'Deixar de silenciar'}</button></div>`).join('') : '<p class="public-profile-muted">Esta lista não contém contas.</p>';
    list.querySelectorAll('[data-unmanage]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        if (kind === 'blocked') await API.setBlocked(button.dataset.unmanage, false);
        else await API.setMuted(button.dataset.unmanage, false);
        button.closest('.profile-network-person').remove();
      } catch (error) {
        UI.toast(error.message || 'Não foi possível atualizar esta conta.', 'error');
        button.disabled = false;
      }
    }));
  } catch (error) {
    list.innerHTML = `<p class="public-profile-muted">${UI.escapeHtml(error.message)}</p>`;
  }
}

async function refreshNetworkStats() {
  // Atualiza as contagens da rede após alterações sociais.
  try {
    const summary = await API.getMyNetworkSummary();
    document.getElementById('stat-followers').textContent = summary.followerCount;
    document.getElementById('stat-following').textContent = summary.followingCount;
  } catch (error) {
    UI.toast(error.message || 'Não foi possível atualizar as suas ligações.', 'error');
  }
}

// Converte os códigos de função da API em rótulos compreensíveis no perfil.
function roleLabel(role) {
  return ({ attendee: 'Participante', organizer: 'Organizador', staff: 'Equipa' })[role] || role;
}
