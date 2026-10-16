// Carrega o perfil pedido pelo URL e apresenta os controlos de privacidade e rede.
document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('public-profile-content');
  const userId = new URLSearchParams(window.location.search).get('id');
  if (!userId || !/^\d+$/.test(userId)) {
    renderPublicProfileError(container, 'Perfil não encontrado', 'Esta ligação para o perfil não é válida.');
    return;
  }
  UI.bindOverlayClose(document.getElementById('public-network-modal'));
  try {
    const profile = await API.getPublicUserProfile(userId);
    renderPublicProfile(container, profile);
  } catch (error) {
    renderPublicProfileError(container, 'Perfil indisponível', error.message || 'Este perfil não está disponível.');
  }
});

function renderPublicProfile(container, profile) {
  // Desenha os dados públicos e liga os controlos de rede do perfil.
  const isCreator = profile.role === 'organizer';
  const roleLabel = profile.role === 'staff' ? 'Equipa / segurança' : isCreator ? 'Organizador' : 'Participante';
  const name = isCreator ? (profile.brandName || profile.name) : profile.name;
  const accent = /^#[0-9a-f]{6}$/i.test(profile.profileTheme || '') ? profile.profileTheme : '#7c5cff';
  const avatar = profile.avatarUrl
    ? `<img class="public-profile-avatar frame-${safeFrame(profile.avatarFrame)}" src="${UI.escapeHtml(profile.avatarUrl)}" alt="${UI.escapeHtml(name)}">`
    : `<span class="public-profile-avatar public-profile-avatar-fallback frame-${safeFrame(profile.avatarFrame)}">${UI.escapeHtml(UI.initials(name))}</span>`;
  const interests = (Array.isArray(profile.preferredCategories) ? profile.preferredCategories.slice(0, 8) : [])
    .map(category => `<span class="badge badge-muted">${UI.escapeHtml(UI.categoryLabel(category))}</span>`).join('');
  const socialLinks = [
    ['websiteUrl', 'Site', 'fa-globe'], ['instagramUrl', 'Instagram', 'fa-brands fa-instagram'],
    ['xUrl', 'X', 'fa-brands fa-x-twitter'], ['linkedinUrl', 'LinkedIn', 'fa-brands fa-linkedin'],
    ['spotifyUrl', 'Spotify', 'fa-brands fa-spotify'], ['tiktokUrl', 'TikTok', 'fa-brands fa-tiktok']
  ].map(([field, label, icon]) => profile[field] ? publicLink(profile[field], label, icon) : '').filter(Boolean).join('');
  const badges = (profile.badges || []).map(badge =>
    `<span class="profile-achievement-badge"><i class="fa-solid ${UI.escapeHtml(badge.icon)}"></i> ${UI.escapeHtml(badge.label)}</span>`
  ).join('');
  const followedBy = (profile.followedBy || []).map(person =>
    `<a href="frontend/people/public-profile.html?id=${encodeURIComponent(person.id)}">@${UI.escapeHtml(person.username)}</a>`
  ).join(', ');
  const attended = (profile.attendedEvents || []).map(event =>
    `<a class="public-event-card" href="frontend/events/event-details.html?id=${encodeURIComponent(event.id)}"><strong>${UI.escapeHtml(event.title)}</strong><span>${UI.escapeHtml(UI.formatDate(event.date))} · ${UI.escapeHtml(event.location)}</span></a>`
  ).join('');
  const cover = getPublicCover(profile.coverImage);
  const isPrivate = profile.isPublic === false;
  container.style.setProperty('--profile-accent', accent);
  container.innerHTML = `
    <div class="public-profile-cover"></div>
    <div class="public-profile-identity">${avatar}<div>
      <span class="badge ${isCreator ? 'badge-info' : 'badge-muted'}">${roleLabel}</span>
      <h1>${UI.escapeHtml(name)}</h1>
      <span class="public-profile-username">@${UI.escapeHtml(profile.username || '')}</span>
      ${profile.pronouns ? `<span class="public-profile-pronouns">${UI.escapeHtml(profile.pronouns)}</span>` : ''}
    </div></div>
    ${isPrivate && !profile.following ? '<p class="public-profile-private"><i class="fa-solid fa-lock"></i> Perfil privado — envie um pedido para seguir e consultar mais informações.</p>' : ''}
    ${profile.statusMessage ? `<p class="public-profile-status">${UI.escapeHtml(profile.statusMessage)}</p>` : ''}
    <div class="public-profile-bio">${renderSafeMarkdown(profile.bio || 'Este membro ainda não adicionou uma biografia.')}</div>
    ${badges ? `<div class="profile-badges">${badges}</div>` : ''}
    <div class="person-stats">
      ${profile.canViewNetwork ? `<button type="button" class="public-network-button" data-network-kind="followers"><strong>${Number(profile.followerCount) || 0}</strong> seguidores</button><button type="button" class="public-network-button" data-network-kind="following"><strong>${Number(profile.followingCount) || 0}</strong> a seguir</button>` : ''}
      ${isCreator ? `<span><strong>${Number(profile.hostedEventsCount) || 0}</strong> eventos organizados</span>` : ''}
      ${profile.attendedEventsCount != null ? `<span><strong>${Number(profile.attendedEventsCount) || 0}</strong> eventos frequentados</span>` : ''}
      ${profile.profileLocation ? `<span><i class="fa-solid fa-location-dot"></i> ${UI.escapeHtml(profile.profileLocation)}</span>` : ''}
    </div>
    ${followedBy ? `<p class="public-followed-by"><i class="fa-solid fa-user-group"></i> Seguido por ${followedBy}${Number(profile.followerCount) > profile.followedBy.length ? ` e mais ${Number(profile.followerCount) - profile.followedBy.length}` : ''}</p>` : ''}
      ${profile.showInterests && interests ? `<h2 class="public-profile-subheading">Interesses</h2><div class="person-tags">${interests}</div>` : ''}
    ${socialLinks ? `<div class="person-links">${socialLinks}</div>` : ''}
    ${profile.featuredEvent ? `<section class="public-profile-section"><h2 class="public-profile-subheading">Evento em destaque</h2><a class="public-event-card" href="frontend/events/event-details.html?id=${encodeURIComponent(profile.featuredEvent.id)}"><strong>${UI.escapeHtml(profile.featuredEvent.title)}</strong><span>${UI.escapeHtml(UI.formatDate(profile.featuredEvent.date))} · ${UI.escapeHtml(profile.featuredEvent.location)}</span></a></section>` : ''}
    ${profile.attendedEvents && profile.attendedEvents.length ? `<section class="public-profile-section"><h2 class="public-profile-subheading">Eventos anteriores</h2><div class="public-event-list">${attended}</div></section>` : ''}
    ${profile.isOwner ? '' : `<div class="public-profile-actions">
      <button class="btn ${profile.following ? 'btn-secondary' : 'btn-primary'}" id="public-profile-follow"><i class="fa-solid ${profile.following ? 'fa-user-check' : 'fa-user-plus'}"></i> ${profile.following ? 'A seguir' : profile.requestPending ? 'Pedido enviado · Cancelar' : isPrivate ? 'Pedir para seguir' : 'Seguir'}</button>
      <button class="btn btn-outline" id="public-profile-mute"><i class="fa-solid fa-volume-xmark"></i> Silenciar</button>
      <button class="btn btn-outline" id="public-profile-block"><i class="fa-solid fa-ban"></i> Bloquear</button>
    </div>`}
  `;
  container.querySelector('.public-profile-cover').style.backgroundImage = cover;
  container.querySelectorAll('[data-network-kind]').forEach(button => button.addEventListener('click', () => showPublicNetwork(profile.id, button.dataset.networkKind)));
  const followButton = document.getElementById('public-profile-follow');
  if (followButton) followButton.addEventListener('click', async () => {
    const session = await Auth.requireAuth('Inicie sessão para seguir pessoas.');
    if (!session || String(session.id) === String(profile.id)) return;
    const button = document.getElementById('public-profile-follow');
    button.disabled = true;
    try {
      const result = await API.toggleUserFollow(profile.id);
      profile.following = result.following;
      profile.requestPending = result.requestPending;
      button.className = `btn ${result.following ? 'btn-secondary' : 'btn-primary'}`;
      button.innerHTML = `<i class="fa-solid ${result.following ? 'fa-user-check' : 'fa-user-plus'}"></i> ${result.following ? 'A seguir' : result.requestPending ? 'Pedido enviado · Cancelar' : isPrivate ? 'Pedir para seguir' : 'Seguir'}`;
      const count = container.querySelector('[data-network-kind="followers"] strong');
      if (count) count.textContent = result.followerCount;
    } catch (error) {
      UI.toast(error.message || 'Não foi possível atualizar esta ligação.', 'error');
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById('public-profile-mute')?.addEventListener('click', async () => changePublicRelationship(profile.id, 'mute'));
  document.getElementById('public-profile-block')?.addEventListener('click', async () => changePublicRelationship(profile.id, 'block'));
}

async function showPublicNetwork(userId, kind) {
  // Carrega e apresenta a lista pública de seguidores ou de seguidos.
  const modal = document.getElementById('public-network-modal');
  const list = document.getElementById('public-network-list');
  document.getElementById('public-network-title').textContent = kind === 'followers' ? 'Seguidores' : 'A seguir';
  UI.openModal(modal);
  list.innerHTML = '<p class="public-profile-muted">A carregar…</p>';
  try {
    const users = await API.getUserNetwork(userId, kind);
    list.innerHTML = users.length ? users.map(person => `
      <div class="profile-network-person">
        <a class="profile-network-identity" href="frontend/people/public-profile.html?id=${encodeURIComponent(person.id)}">
          ${person.avatarUrl ? `<img class="profile-network-avatar" src="${UI.escapeHtml(person.avatarUrl)}" alt="">` : `<span class="profile-network-avatar profile-network-avatar-fallback">${UI.escapeHtml(UI.initials(person.name))}</span>`}
          <span>${UI.escapeHtml(person.name)} <small>@${UI.escapeHtml(person.username)}</small></span>
        </a>
        <span class="badge badge-muted">${UI.escapeHtml(roleLabel(person.role))}</span>
        ${API.getToken() ? `<button type="button" class="btn btn-ghost btn-sm" data-follow="${person.id}">${person.following ? 'Deixar de seguir' : 'Seguir'}</button>` : ''}
      </div>`).join('') : '<p class="public-profile-muted">Não existem ligações para apresentar.</p>';
    list.querySelectorAll('[data-follow]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const result = await API.toggleUserFollow(button.dataset.follow);
        button.textContent = result.following ? 'Deixar de seguir' : result.requestPending ? 'Pedido enviado · Cancelar' : 'Seguir';
      } catch (error) {
        UI.toast(error.message || 'Não foi possível atualizar esta ligação.', 'error');
      } finally {
        button.disabled = false;
      }
    }));
  } catch (error) {
    list.innerHTML = `<p class="public-profile-muted">${UI.escapeHtml(error.message)}</p>`;
  }
}

async function changePublicRelationship(userId, kind) {
  // Bloqueia ou silencia um perfil após confirmar a sessão atual.
  const session = await Auth.requireAuth(`Inicie sessão para ${kind === 'block' ? 'bloquear' : 'silenciar'} esta conta.`);
  if (!session || String(session.id) === String(userId)) return;
  try {
    if (kind === 'block') {
      if (!window.confirm('Bloquear esta conta? Isto remove ambas as ligações e oculta os perfis um do outro.')) return;
      await API.setBlocked(userId, true);
      UI.toast('Conta bloqueada.', 'success');
      window.location.href = UI.pageUrl('frontend/people/people.html');
    } else {
      await API.setMuted(userId, true);
      UI.toast('Conta silenciada. Deixará de aparecer nas suas listas de ligações.', 'success');
      document.getElementById('public-profile-mute').disabled = true;
      document.getElementById('public-profile-mute').textContent = 'Silenciado';
    }
  } catch (error) {
    UI.toast(error.message || `Não foi possível ${kind === 'block' ? 'bloquear' : 'silenciar'} esta conta.`, 'error');
  }
}

function getPublicCover(cover) {
  // Converte temas permitidos ou imagens seguras em fundos CSS.
  const gradients = {
    'preset:aurora': 'linear-gradient(120deg,#2dd4bf,#6366f1,#c084fc)',
    'preset:sunset': 'linear-gradient(120deg,#fb7185,#f97316,#facc15)',
    'preset:ocean': 'linear-gradient(120deg,#0ea5e9,#1d4ed8,#312e81)',
    'preset:night': 'linear-gradient(120deg,#111827,#4338ca,#7c3aed)',
    'preset:forest': 'linear-gradient(120deg,#166534,#10b981,#a3e635)'
  };
  if (!cover) return '';
  if (gradients[cover]) return gradients[cover];
  if (cover.startsWith('data:image/')) return `url(${JSON.stringify(cover)})`;
  try {
    const url = new URL(cover);
    return url.protocol === 'https:' ? `url(${JSON.stringify(url.href)})` : '';
  } catch { return ''; }
}

function safeFrame(frame) {
  // Aceita apenas os identificadores de moldura definidos pela aplicação.
  return ['none', 'glow', 'double', 'creator', 'staff'].includes(frame) ? frame : 'none';
}

// Traduz as funções internas para que a API continue a receber os valores originais.
function roleLabel(role) {
  // Apresenta em português o papel mantendo intactos os valores da API.
  return ({ attendee: 'Participante', organizer: 'Organizador', staff: 'Equipa' })[role] || role;
}

function renderSafeMarkdown(value) {
  // Escapa o texto antes de converter a pequena sintaxe Markdown suportada.
  let escaped = UI.escapeHtml(value);
  escaped = escaped.replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
  return escaped;
}

function publicLink(value, label, icon) {
  // Cria uma ligação externa segura ou não apresenta valor inválido.
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    const iconClass = icon.includes('brands') ? icon : `fa-solid ${icon}`;
    return `<a href="${UI.escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer"><i class="${iconClass}"></i> ${label}</a>`;
  } catch { return ''; }
}

function renderPublicProfileError(container, title, message) {
  // Apresenta um estado de erro para perfis inválidos ou indisponíveis.
  container.innerHTML = `
    <div class="empty-state">
      <i class="fa-solid fa-user-slash"></i>
      <h1>${UI.escapeHtml(title)}</h1>
      <p>${UI.escapeHtml(message)}</p>
      <a href="frontend/people/people.html" class="btn btn-primary">Encontrar pessoas</a>
    </div>`;
}
