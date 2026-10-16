// Limita cada resposta de pesquisa para manter a lista rápida e paginada.
const PEOPLE_PAGE_SIZE = 12;
let peopleSearchTimer = null;
let peopleSearchSequence = 0;
let peopleSearchRole = 'all';
let peopleSearchPage = 1;
let peopleSearchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('people-search-input');
  input.addEventListener('input', () => {
    peopleSearchQuery = input.value.trim();
    peopleSearchPage = 1;
    document.getElementById('people-search-clear').hidden = !input.value;
    window.clearTimeout(peopleSearchTimer);
    if (peopleSearchQuery.length < 2) {
      peopleSearchSequence++;
      clearPessoasResults(peopleSearchQuery.length ? 'Introduza pelo menos 2 caracteres para pesquisar.' : 'Comece a escrever para descobrir pessoas.');
      return;
    }
    setSearchStatus('A pesquisar…');
    peopleSearchTimer = window.setTimeout(searchPessoas, 300);
  });

  document.getElementById('people-search-clear').addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input'));
    input.focus();
  });

  document.querySelectorAll('.people-filter').forEach(button => {
    button.addEventListener('click', () => {
      window.clearTimeout(peopleSearchTimer);
      peopleSearchRole = button.dataset.role;
      peopleSearchPage = 1;
      document.querySelectorAll('.people-filter').forEach(tab => {
        const active = tab === button;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      if (peopleSearchQuery.length >= 2) searchPessoas();
    });
  });

  document.getElementById('people-previous').addEventListener('click', () => {
    if (peopleSearchPage <= 1) return;
    peopleSearchPage--;
    searchPessoas();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.getElementById('people-next').addEventListener('click', () => {
    peopleSearchPage++;
    searchPessoas();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const initialQuery = new URLSearchParams(window.location.search).get('q');
  if (initialQuery) {
    input.value = initialQuery.slice(0, 100);
    input.dispatchEvent(new Event('input'));
  }
});

async function searchPessoas() {
  // Pesquisa perfis com paginação e ignora respostas de pedidos antigos.
  const requestSequence = ++peopleSearchSequence;
  const requestedPage = peopleSearchPage;
  try {
    const result = await API.searchUsers(peopleSearchQuery, peopleSearchRole, requestedPage, PEOPLE_PAGE_SIZE);
    if (requestSequence !== peopleSearchSequence) return;
    renderPessoas(result, requestSequence);
  } catch (error) {
    if (requestSequence !== peopleSearchSequence) return;
    document.getElementById('people-results').replaceChildren();
    setSearchStatus(error.message || 'Não foi possível pesquisar perfis públicos.');
    updatePessoasPagination(0, false);
  }
}

async function renderPessoas(result, requestSequence) {
  // Desenha os resultados e sincroniza o estado dos botões de seguir.
  const container = document.getElementById('people-results');
  const items = Array.isArray(result.items) ? result.items : [];
  if (!items.length) {
    container.innerHTML = `<div class="empty-state people-empty"><i class="fa-solid fa-user-group"></i><h2>Não foram encontrados perfis</h2><p>Experimente outro nome, biografia ou interesse em eventos.</p></div>`;
    setSearchStatus('Não foram encontrados resultados.');
    updatePessoasPagination(result.total || 0, false);
    return;
  }

  container.innerHTML = items.map(renderPersonCard).join('');
  const followButtons = container.querySelectorAll('.person-follow-btn');
  if (API.getToken() && followButtons.length) {
    followButtons.forEach(button => { button.disabled = true; });
    try {
      const followedIds = (await API.getFollowedOrganizers()).map(String);
      if (requestSequence !== peopleSearchSequence) return;
      followButtons.forEach(button => {
        setFollowButton(button, followedIds.includes(String(button.dataset.userId)));
        button.disabled = false;
      });
    } catch (error) {
      UI.toast(error.message || 'Não foi possível carregar os organizadores que segue.', 'error');
      followButtons.forEach(button => { button.disabled = false; });
    }
  }
  followButtons.forEach(button => {
    button.addEventListener('click', () => followPerson(button));
  });
  const start = (result.page - 1) * result.limit + 1;
  const end = Math.min(result.page * result.limit, result.total);
  setSearchStatus(`A mostrar ${start}–${end} de ${result.total} perfis públicos.`);
  updatePessoasPagination(result.total, result.hasMore);
}

function renderPersonCard(person) {
  // Cria um cartão público com biografia, interesses e ações de rede.
  const isCreator = person.role === 'organizer';
  const roleLabel = person.role === 'staff' ? 'Equipa / segurança' : isCreator ? 'Organizador' : 'Participante';
  const name = isCreator ? (person.brandName || person.name) : person.name;
  const avatar = person.avatarUrl
    ? `<img class="person-avatar" src="${UI.escapeHtml(person.avatarUrl)}" alt="${UI.escapeHtml(name)}">`
    : `<span class="person-avatar person-avatar-fallback">${UI.escapeHtml(UI.initials(name))}</span>`;
  const categories = Array.isArray(person.preferredCategories) ? person.preferredCategories : [];
  const tags = categories.length
    ? `<div class="person-tags">${categories.map(tag => `<span class="badge badge-muted">${UI.escapeHtml(UI.categoryLabel(tag))}</span>`).join('')}</div>`
    : '';

  const links = isCreator ? [
      person.websiteUrl ? publicLink(person.websiteUrl, 'Site') : '',
      person.instagramUrl ? publicLink(person.instagramUrl, 'Instagram') : '',
      person.contactEmail ? `<a href="mailto:${encodeURIComponent(person.contactEmail)}">Contactos</a>` : ''
    ].filter(Boolean).join('') : '';

  return `
    <article class="card person-card">
      <div class="person-identity">${avatar}<div class="person-title"><h2>${UI.escapeHtml(name)}</h2><span>${UI.escapeHtml(roleLabel)} · @${UI.escapeHtml(person.username || '')}</span></div></div>
      <p class="person-bio">${UI.escapeHtml(person.bio || (isCreator ? 'Este organizador ainda não adicionou uma biografia.' : person.role === 'staff' ? 'Este membro da equipa ainda não adicionou uma biografia.' : 'Este participante ainda não adicionou uma biografia.'))}</p>
      ${tags}
      ${links ? `<div class="person-links">${links}</div>` : ''}
      <div class="person-stats">${person.followerCount != null ? `<span><strong class="person-follower-count">${Number(person.followerCount) || 0}</strong> seguidores</span>` : ''}${isCreator ? `<span><strong>${Number(person.hostedEventsCount) || 0}</strong> eventos organizados</span>` : ''}</div>
      <div class="person-card-actions">
        <span class="badge badge-muted">${roleLabel}</span>
        <button type="button" class="btn btn-primary person-follow-btn" data-user-id="${person.id}"><i class="fa-solid fa-user-plus"></i> Seguir</button>
        <a class="btn btn-outline" href="frontend/people/public-profile.html?id=${encodeURIComponent(person.id)}"><i class="fa-solid fa-id-badge"></i> Ver perfil</a>
      </div>
    </article>`;
}

async function followPerson(button) {
  // Segue ou pede para seguir a pessoa associada ao botão.
  const session = await Auth.requireAuth('Inicie sessão para seguir pessoas.');
  if (!session) return;
  if (String(session.id) === String(button.dataset.userId)) {
    UI.toast('Não pode seguir o seu próprio perfil.', 'info');
    return;
  }
  button.disabled = true;
  try {
    const result = await API.toggleUserFollow(button.dataset.userId);
    setFollowButton(button, result.following, result.requestPending);
    const count = button.closest('.person-card').querySelector('.person-follower-count');
    if (count) count.textContent = result.followerCount;
  } catch (error) {
    UI.toast(error.message || 'Não foi possível atualizar esta ligação.', 'error');
  } finally {
    button.disabled = false;
  }

}

function setFollowButton(button, following, requestPending = false) {
  // Atualiza o texto e o estilo do botão segundo o estado da relação.
  button.innerHTML = following
    ? '<i class="fa-solid fa-user-check"></i> A seguir'
    : requestPending
      ? '<i class="fa-solid fa-hourglass-half"></i> Pedido enviado'
      : '<i class="fa-solid fa-user-plus"></i> Seguir';
  button.classList.toggle('btn-primary', !following && !requestPending);
  button.classList.toggle('btn-secondary', following || requestPending);
}

function publicLink(value, label) {
  // Gera uma ligação externa apenas quando o protocolo é HTTP(S).
  try {
    const url = new URL(value, window.location.href);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return `<a href="${UI.escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  } catch {
    return '';
  }
}

function setSearchStatus(message) {
  // Atualiza o texto acessível que descreve o estado da pesquisa.
  document.getElementById('people-search-status').textContent = message;
}

function clearPessoasResults(message) {
  // Limpa resultados e paginação quando ainda não há pesquisa válida.
  document.getElementById('people-results').replaceChildren();
  setSearchStatus(message);
  updatePessoasPagination(0, false);
}

function updatePessoasPagination(total, hasMore) {
  // Ativa ou desativa os controlos conforme a página de resultados.
  document.getElementById('people-previous').disabled = peopleSearchPage <= 1;
  document.getElementById('people-next').disabled = !hasMore;
  document.getElementById('people-page-label').textContent = total ? `Página ${peopleSearchPage}` : '';
}
