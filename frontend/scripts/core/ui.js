/* ==========================================================================
   Interface partilhada: navegação, rodapé, diálogos, notificações e formatos.
   ========================================================================== */

const UI = (() => {

  const NAV_ITEMS = [
    { href: 'frontend/home/index.html', label: 'Início', match: ['index.html', ''] },
    { href: 'frontend/events/events.html', label: 'Eventos', match: ['events.html'] },
    { href: 'frontend/people/people.html', label: 'Pessoas', match: ['people.html', 'public-profile.html'] },
    { href: 'frontend/events/calendar.html', label: 'Calendário', match: ['calendar.html'] },
    { href: 'frontend/events/my-events.html', label: 'Os meus eventos', match: ['my-events.html'] },
    { href: 'frontend/staff/staff.html', label: 'Ferramentas da equipa', match: ['staff.html', 'staff-checkin.html'] },
    { href: 'frontend/events/favorites.html', label: 'Favoritos', match: ['favorites.html'] }
  ];

  function currentPage() {
    // Obtém o nome do documento atual para realçar a navegação.
    const path = window.location.pathname.split('/').pop();
    return path || 'index.html';
  }

  function pageUrl(path) {
    return new URL(path, document.baseURI).href;
  }

  // ---------------- Tema ----------------
  function initTheme() {
    // Escolhe o tema guardado ou segue a preferência do dispositivo.
    let theme = typeof DB !== 'undefined' && DB.getTheme ? DB.getTheme() : localStorage.getItem('eh_theme');
    if (!theme) {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    applyTheme(theme, false);
  }

  function applyTheme(theme, persist = true) {
    // Aplica o tema ao documento e, opcionalmente, guarda a escolha.
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) {
      if (typeof DB !== 'undefined' && DB.setTheme) DB.setTheme(theme);
      else localStorage.setItem('eh_theme', theme);
    }
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.setAttribute('aria-label', theme === 'dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro');
  }

  function toggleTheme() {
    // Alterna entre os modos claro e escuro.
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
  }

  // ---------------- Barra de navegação ----------------
  async function renderNavbar() {
    // Desenha a navegação com opções adequadas à sessão atual.
    const mount = document.getElementById('navbar-placeholder');
    if (!mount) return;
    const page = currentPage();

    // Procura a sessão atual através da API FastAPI se existir um token
    let session = null;
    if (typeof API !== 'undefined' && API.getToken()) {
      try {
        session = await API.getMe();
      } catch (e) {
        console.warn('Sessão expirada ou erro ao ligar à API:', e);
        session = null;
      }
    }

    const visibleNavItems = NAV_ITEMS.filter(item => {
      if (item.match.includes('my-events.html')) return session?.role === 'organizer';
      if (item.match.includes('staff.html')) return session?.role === 'staff';
      return true;
    });
    const linksHtml = visibleNavItems.map(item =>
      `<a href="${item.href}" class="${item.match.includes(page) ? 'active' : ''}">${item.label}</a>`
    ).join('');

    const authArea = session 
      ? userMenuHtml(session) 
      : `<button class="btn btn-primary" id="open-auth-btn"><i class="fa-solid fa-user"></i> Registar / Iniciar sessão</button>`;

    mount.innerHTML = `
      <nav class="navbar">
        <div class="container nav-inner">
          <a href="frontend/home/index.html" class="brand">
            <span class="brand-icon"><i class="fa-solid fa-calendar-days"></i></span>
            EventHub
          </a>
          <div class="nav-links">${linksHtml}</div>
          <div class="nav-right">
            <button class="theme-toggle" id="theme-toggle-btn" aria-label="Alternar modo escuro">
              <i class="fa-solid fa-moon"></i>
              <i class="fa-solid fa-sun"></i>
            </button>
            ${authArea}
            <button class="nav-toggle" id="nav-toggle-btn" aria-label="Abrir menu" aria-expanded="false">
              <i class="fa-solid fa-bars"></i>
            </button>
          </div>
        </div>
        <div class="mobile-drawer" id="mobile-drawer">
          ${visibleNavItems.map(item => `<a href="${item.href}" class="${item.match.includes(page) ? 'active' : ''}">${item.label}</a>`).join('')}
          ${session ? '' : '<a href="#" id="mobile-auth-btn">Registar / Iniciar sessão</a>'}
        </div>
      </nav>
    `;

    bindNavbarEvents();
  }

  function userMenuHtml(session) {
    // Cria o menu de conta com ligações adequadas ao papel do utilizador.
    const name = session.name || session.email || 'Utilizador';
    const userInitials = initials(name);
    const avatarInner = session.avatar
      ? `<img src="${session.avatar}" alt="${escapeHtml(name)}">`
      : `<span class="avatar-circle" style="width:28px; height:28px; background:var(--primary-color); color:#fff; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:bold;">${userInitials}</span>`;
    
    return `
      <div class="user-menu" style="position:relative; display:inline-block;">
        <button class="user-avatar-btn" id="user-menu-btn" aria-haspopup="true" aria-expanded="false" style="display:flex; align-items:center; gap:8px; background:transparent; border:none; cursor:pointer; color:inherit;">
          ${avatarInner}
          <span class="user-menu-name" style="font-weight:600;">${escapeHtml(name.split(' ')[0])}</span>
          <i class="fa-solid fa-chevron-down" style="font-size:0.7rem;"></i>
        </button>
        <div class="user-dropdown" id="user-dropdown">
          <a href="frontend/people/profile.html"><i class="fa-solid fa-id-badge"></i> O meu perfil</a>
          ${session.role === 'organizer' ? '<a href="frontend/events/my-events.html"><i class="fa-solid fa-calendar-check"></i> Os meus eventos</a>' : ''}
          ${session.role === 'staff' ? '<a href="frontend/staff/staff.html"><i class="fa-solid fa-shield-halved"></i> Ferramentas da equipa</a>' : ''}
          <a href="frontend/events/favorites.html"><i class="fa-solid fa-heart"></i> Favoritos</a>
          ${session.role === 'organizer' ? '<a href="frontend/events/create-event.html"><i class="fa-solid fa-plus"></i> Criar evento</a>' : ''}
          <div class="divider"></div>
          <button class="logout-item" id="logout-btn"><i class="fa-solid fa-right-from-bracket"></i> Terminar sessão</button>
        </div>
      </div>
    `;
  }

  function bindNavbarEvents() {
    // Liga os controlos de tema, menu móvel, conta e saída.
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    const navToggle = document.getElementById('nav-toggle-btn');
    const drawer = document.getElementById('mobile-drawer');
    if (navToggle && drawer) {
      navToggle.addEventListener('click', () => {
        const isOpen = drawer.classList.toggle('open');
        navToggle.setAttribute('aria-expanded', isOpen);
      });
    }

    const openAuthBtn = document.getElementById('open-auth-btn');
    if (openAuthBtn) openAuthBtn.addEventListener('click', () => Auth.openModal('login'));
    
    const mobileAuthBtn = document.getElementById('mobile-auth-btn');
    if (mobileAuthBtn) mobileAuthBtn.addEventListener('click', (e) => { e.preventDefault(); Auth.openModal('login'); });

    const userMenuBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-dropdown');
    if (userMenuBtn && userDropdown) {
      userMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = userDropdown.classList.toggle('open');
        userMenuBtn.setAttribute('aria-expanded', isOpen);
      });
      document.addEventListener('click', () => {
        userDropdown.classList.remove('open');
        userMenuBtn.setAttribute('aria-expanded', 'false');
      });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => {
      logoutBtn.disabled = true;
      if (typeof API !== 'undefined' && API.logout) {
        API.logout();
      } else if (typeof DB !== 'undefined' && DB.logout) {
        DB.logout();
      }
      toast('A sessão foi terminada.', 'info');
      setTimeout(() => window.location.reload(), 500);
    });
  }

  // ---------------- Rodapé ----------------
  function renderFooter() {
    // Desenha o rodapé partilhado e liga a ação de autenticação.
    const mount = document.getElementById('footer-placeholder');
    if (!mount) return;
    mount.innerHTML = `
      <footer class="site-footer">
        <div class="container">
          <div class="footer-grid">
            <div class="footer-brand">
              <a href="frontend/home/index.html" class="brand">
                <span class="brand-icon"><i class="fa-solid fa-calendar-days"></i></span>
                EventHub
              </a>
              <p>Descubra, crie e organize eventos importantes para si. O EventHub é a plataforma que aproxima pessoas.</p>
            </div>
            <div class="footer-col">
              <h5>Explorar</h5>
              <ul>
                <li><a href="frontend/events/events.html">Todos os eventos</a></li>
                <li><a href="frontend/events/calendar.html">Calendário</a></li>
                ${DB.getSession()?.role === 'organizer' ? '<li><a href="frontend/events/create-event.html">Criar evento</a></li>' : ''}
                <li><a href="frontend/events/favorites.html">Favoritos</a></li>
              </ul>
            </div>
            <div class="footer-col">
              <h5>Conta</h5>
              <ul>
                <li><a href="frontend/people/profile.html">O meu perfil</a></li>
                ${DB.getSession()?.role === 'organizer' ? '<li><a href="frontend/events/my-events.html">Os meus eventos</a></li>' : ''}
                ${DB.getSession()?.role === 'staff' ? '<li><a href="frontend/staff/staff.html">Ferramentas da equipa</a></li>' : ''}
                <li><a href="#" id="footer-auth-link">Registar / Iniciar sessão</a></li>
              </ul>
            </div>
            <div class="footer-col">
              <h5>Empresa</h5>
              <ul>
                <li><a href="frontend/company/about.html">Sobre nós</a></li>
                <li><a href="frontend/company/contact.html">Contactos</a></li>
                <li><a href="frontend/company/privacy.html">Política de privacidade</a></li>
                <li><a href="frontend/company/terms.html">Termos de utilização</a></li>
              </ul>
            </div>
          </div>
          <div class="footer-bottom">
            <span>&copy; ${new Date().getFullYear()} EventHub. Todos os direitos reservados.</span>
            <span>Ligado ao serviço FastAPI.</span>
          </div>
        </div>
      </footer>
    `;
    const footerAuthLink = document.getElementById('footer-auth-link');
    if (footerAuthLink) {
      footerAuthLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof API !== 'undefined' && API.getToken()) window.location.href = pageUrl('frontend/people/profile.html');
        else Auth.openModal('login');
      });
    }
  }

  // ---------------- Notificações ----------------
  function ensureToastContainer() {
    // Cria ou devolve o contentor partilhado das notificações.
    let c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }
  const TOAST_ICONS = { success: 'fa-circle-check', error: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  function toast(message, type = 'info', duration = 3800) {
    // Apresenta uma notificação temporária do tipo indicado.
    const container = ensureToastContainer();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<i class="fa-solid ${TOAST_ICONS[type] || TOAST_ICONS.info}"></i><span>${message}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 320);
    }, duration);
  }

  // ---------------- Funções auxiliares para janelas modais ----------------
  function openModal(overlayEl) {
    // Abre uma janela modal e impede o scroll do conteúdo de fundo.
    if (!overlayEl) return;
    overlayEl.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(overlayEl) {
    // Fecha uma janela modal e repõe o scroll quando nenhuma resta aberta.
    if (!overlayEl) return;
    overlayEl.classList.remove('open');
    if (!document.querySelector('.modal-overlay.open')) document.body.style.overflow = '';
  }
  function bindOverlayClose(overlayEl) {
    // Liga o fecho da janela ao clique exterior e aos botões de fechar.
    if (!overlayEl) return;
    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) closeModal(overlayEl);
    });
    overlayEl.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(overlayEl));
    });
  }

  // ---------------- Janela modal de confirmação reutilizável ----------------
  function ensureConfirmModal() {
    // Reutiliza ou cria a janela comum de confirmação.
    let el = document.getElementById('confirm-modal-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'confirm-modal-overlay';
    el.className = 'modal-overlay';
    el.innerHTML = `
      <div class="modal-box" style="max-width:420px;">
        <div class="modal-body" style="text-align:center; padding-top:32px;">
          <div class="confirm-icon danger" id="confirm-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <h3 id="confirm-title" style="margin-bottom:8px;">Tem a certeza?</h3>
          <p id="confirm-message">Esta ação não pode ser anulada.</p>
        </div>
        <div class="modal-footer" style="justify-content:center;">
          <button class="btn btn-secondary" id="confirm-cancel-btn">Cancelar</button>
          <button class="btn btn-danger" id="confirm-ok-btn">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    return el;
  }

  function confirmDialog({ title = 'Tem a certeza?', message = 'Esta ação não pode ser anulada.', okText = 'Confirmar', icon = 'fa-triangle-exclamation', tone = 'danger' } = {}) {
    // Pede confirmação e resolve com a escolha feita pelo utilizador.
    return new Promise((resolve) => {
      const el = ensureConfirmModal();
      el.querySelector('#confirm-title').textContent = title;
      el.querySelector('#confirm-message').textContent = message;
      const okBtn = el.querySelector('#confirm-ok-btn');
      const cancelBtn = el.querySelector('#confirm-cancel-btn');
      okBtn.textContent = okText;
      const iconWrap = el.querySelector('#confirm-icon');
      iconWrap.className = `confirm-icon ${tone}`;
      iconWrap.innerHTML = `<i class="fa-solid ${icon}"></i>`;

      const cleanup = (result) => {
        closeModal(el);
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancelar);
        resolve(result);
      };
      const onOk = () => cleanup(true);
      const onCancelar = () => cleanup(false);
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancelar);
      el.onclick = (e) => { if (e.target === el) cleanup(false); };
      openModal(el);
    });
  }

  // ---------------- Funções auxiliares de formatação ----------------
  function formatDate(dateStr) {
    // Formata uma data completa segundo a localização portuguesa.
    if (!dateStr) return '';
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('pt-PT', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateShort(dateStr) {
    // Formata uma data curta segundo a localização portuguesa.
    if (!dateStr) return '';
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('pt-PT', { month: 'short', day: 'numeric' });
  }

  function formatTime(timeStr) {
    // Normaliza a hora para o formato de 24 horas HH:MM.
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function categoryMeta(catName) {
    // Devolve rótulo, ícone e cor de apresentação de uma categoria.
    const categories = (typeof DB !== 'undefined' && DB.CATEGORIES) ? DB.CATEGORIES : [
      { name: 'Music', icon: 'fa-music', color: '#8b5cf6' },
      { name: 'Technology', icon: 'fa-laptop-code', color: '#3b82f6' },
      { name: 'Arts & Culture', icon: 'fa-palette', color: '#ec4899' },
      { name: 'Sports & Fitness', icon: 'fa-person-running', color: '#10b981' },
      { name: 'Food & Drink', icon: 'fa-utensils', color: '#f59e0b' },
      { name: 'Business & Networking', icon: 'fa-briefcase', color: '#6366f1' },
      { name: 'Community', icon: 'fa-people-group', color: '#14b8a6' },
      { name: 'Education', icon: 'fa-graduation-cap', color: '#06b6d4' }
    ];
    const category = categories.find(c => c.name === catName);
    return category
      ? { ...category, name: categoryLabel(category.name) }
      : { name: categoryLabel(catName), icon: 'fa-tag', color: '#6366f1' };
  }

  // Traduz apenas o rótulo apresentado; a chave inglesa continua a ser usada pela API.
  function categoryLabel(name) {
    // Traduz o identificador canónico para o rótulo apresentado.
    const labels = {
      Music: 'Música', Sports: 'Desporto', Gaming: 'Jogos', Technology: 'Tecnologia',
      Education: 'Educação', Art: 'Arte', Business: 'Negócios', Entertainment: 'Entretenimento',
      Other: 'Outro', 'Arts & Culture': 'Artes e cultura', 'Sports & Fitness': 'Desporto e fitness',
      'Food & Drink': 'Comida e bebida', 'Business & Networking': 'Negócios e contactos',
      Community: 'Comunidade'
    };
    return labels[name] || name;
  }

  function escapeHtml(str) {
    // Codifica texto para inserção segura em conteúdo HTML.
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function initials(name) {
    // Extrai até duas iniciais para avatares sem imagem.
    return (name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  }

  // ---------------- Inicialização da página ----------------
  async function initPage() {
    // Inicializa tema, navegação, rodapé e janela de autenticação.
    initTheme();
    await renderNavbar();
    renderFooter();
    if (typeof Auth !== 'undefined' && Auth.mountModal) {
      Auth.mountModal();
    }
  }

  return {
    NAV_ITEMS, currentPage, pageUrl, initTheme, applyTheme, toggleTheme,
    renderNavbar, renderFooter, toast,
    openModal, closeModal, bindOverlayClose, confirmDialog,
    formatDate, formatDateShort, formatTime, categoryMeta, categoryLabel, escapeHtml, initials,
    initPage
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  UI.initPage();
});