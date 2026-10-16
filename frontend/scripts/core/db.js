/* ==========================================================================
   Normaliza e gere os dados locais, sincronizando-os com a API quando existe.
   ========================================================================== */

const DB = (() => {
  const KEYS = {
    EVENTS: 'eh_events',
    USERS: 'eh_users',
    SESSION: 'eh_session',
    FAVORITES: 'eh_favorites',
    REGISTRATIONS: 'eh_registrations',
    THEME: 'eh_theme',
    SEEDED: 'eh_seeded_v2'
  };

  const CATEGORIES = [
    { name: 'Music', icon: 'fa-music', color: '#8b5cf6' },
    { name: 'Sports', icon: 'fa-futbol', color: '#16a34a' },
    { name: 'Gaming', icon: 'fa-gamepad', color: '#6366f1' },
    { name: 'Technology', icon: 'fa-microchip', color: '#0284c7' },
    { name: 'Education', icon: 'fa-graduation-cap', color: '#d97706' },
    { name: 'Art', icon: 'fa-palette', color: '#ec4899' },
    { name: 'Business', icon: 'fa-briefcase', color: '#334155' },
    { name: 'Entertainment', icon: 'fa-masks-theater', color: '#f43f5e' }
  ];

  const state = {
    events: [],
    users: [],
    session: null,
    favorites: [],
    registrations: [],
    apiLoaded: false
  };

  function read(key, fallback) {
    // Lê e descodifica um valor local, devolvendo alternativa se estiver inválido.
    try {
      const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('Erro ao ler dados locais', key, e);
      return fallback;
    }
  }

  function write(key, value) {
    // Mantém cópias síncronas dos dados nos dois armazenamentos do browser.
    sessionStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(key, JSON.stringify(value));
  }

  function uid(prefix = 'id') {
    // Gera identificadores locais únicos para os dados de demonstração.
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function safeUser(user = {}) {
    // Uniformiza campos de utilizador e compatibiliza nomes da API e do cliente.
    return {
      id: user.id ?? user.userId ?? 'user_' + uid().replace(/^id_/, ''),
      name: user.name || user.full_name || 'Utilizador',
      email: user.email || '',
      avatar: user.avatar || user.avatarUrl || user.avatar_url || '',
      phoneNumber: user.phoneNumber || user.phone_number || '',
      country: user.country || '',
      city: user.city || '',
      profileLocation: user.profileLocation || user.profile_location || '',
      username: user.username || '',
      role: ['organizer', 'staff'].includes(user.role) ? user.role : 'attendee',
      isPublic: Boolean(user.isPublic ?? user.is_public ?? true),
      bio: user.bio || '',
      preferredCategories: Array.isArray(user.preferredCategories)
        ? user.preferredCategories
        : (Array.isArray(user.preferred_categories) ? user.preferred_categories : []),
      brandName: user.brandName || user.brand_name || '',
      websiteUrl: user.websiteUrl || user.website_url || '',
      instagramUrl: user.instagramUrl || user.instagram_url || '',
      contactEmail: user.contactEmail || user.contact_email || '',
      xUrl: user.xUrl || user.x_url || '',
      linkedinUrl: user.linkedinUrl || user.linkedin_url || '',
      spotifyUrl: user.spotifyUrl || user.spotify_url || '',
      tiktokUrl: user.tiktokUrl || user.tiktok_url || '',
      coverImage: user.coverImage || user.cover_image || '',
      profileTheme: user.profileTheme || user.profile_theme || '#7c5cff',
      avatarFrame: user.avatarFrame || user.avatar_frame || 'none',
      pronouns: user.pronouns || '',
      statusMessage: user.statusMessage || user.status_message || '',
      showInterests: Boolean(user.showInterests ?? user.show_interests ?? true),
      showAttendedEvents: Boolean(user.showAttendedEvents ?? user.show_attended_events ?? true),
      showAttendanceCount: Boolean(user.showAttendanceCount ?? user.show_attendance_count ?? true),
      showNetwork: Boolean(user.showNetwork ?? user.show_network ?? true),
      featuredEventId: user.featuredEventId ?? user.featured_event_id ?? null,
      followerCount: Number(user.followerCount ?? user.follower_count ?? 0),
      followingCount: Number(user.followingCount ?? user.following_count ?? 0),
      attendedEventsCount: Number(user.attendedEventsCount ?? user.attended_events_count ?? 0),
      badges: Array.isArray(user.badges) ? user.badges : [],
      createdAt: user.createdAt || Date.now()
    };
  }

  function normalizeEvent(event) {
    // Uniformiza os dados de evento recebidos da API ou do armazenamento local.
    if (!event || typeof event !== 'object') return null;
    const source = event;
    return {
      id: String(source.id ?? source.eventId ?? uid('evt')),
      title: source.title || 'Evento sem título',
      description: source.description || '',
      category: source.category || 'Other',
      date: source.date || '',
      time: source.time || '00:00',
      location: source.location || 'A definir',
      organizer: source.organizer || source.organizer_name || source.organizerName || 'Organizador',
      organizerId: source.organizer_id ?? source.organizerId ?? null,
      maxParticipants: Number(source.max_participants ?? source.maxParticipants ?? source.maxCapacity ?? 0),
      participants: Number(source.participants_count ?? source.participants ?? source.attendeesCount ?? 0),
      image: source.image_url || source.imageUrl || source.image || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30',
      status: source.status || 'active',
      createdBy: source.created_by ?? source.createdBy ?? source.organizer_id ?? source.organizerId ?? null,
      createdAt: source.created_at ? Date.parse(source.created_at) : (source.createdAt || Date.now())
    };
  }

  function normalizeUser(user) {
    // Aplica a normalização comum a qualquer registo de utilizador.
    return safeUser(user);
  }

  function getSeedEvents() {
    // Cria e guarda dados de demonstração usados quando não há API disponível.
    const sampleUsers = [
      { id: 'user_demo', name: 'Organizador de demonstração', email: 'demo@eventhub.com', avatar: '', createdAt: Date.now() }
    ];
    write(KEYS.USERS, sampleUsers);

    const images = {
      Music: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80',
      Sports: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=80',
      Gaming: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80',
      Technology: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80',
      Education: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800&q=80',
      Art: 'https://images.unsplash.com/photo-1531058020387-3be344556be6?w=800&q=80',
      Business: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&q=80',
      Entertainment: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80'
    };

    const addDays = (days) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };

    const sampleEvents = [
      { title: 'Festival Ritmos de Verão', category: 'Music', date: addDays(12), time: '18:00', location: 'Parque Central, Lisboa', description: 'Um dia inteiro de música ao vivo com artistas independentes e eletrónicos em três palcos. Inclui bancas de comida, instalações artísticas e zonas de descanso.', organizer: 'Organizador de demonstração', maxParticipants: 500, participants: 342, image: images.Music, createdBy: 'user_demo' },
      { title: 'Maratona da Cidade 2026', category: 'Sports', date: addDays(25), time: '07:00', location: 'Parque Ribeirinho, Porto', description: 'Maratona anual aberta a todos os níveis, com percursos de 5 km, 10 km e 42 km. Todos os participantes que terminarem recebem medalha e abastecimentos.', organizer: 'Conselho Desportivo da Cidade', maxParticipants: 2000, participants: 1875, image: images.Sports, createdBy: 'user_demo' },
      { title: 'Mostra de Jogos Independentes', category: 'Gaming', date: addDays(8), time: '10:00', location: 'Centro de Congressos, Sala B', description: 'Descubra novos videojogos independentes, conheça os seus criadores e experimente demonstrações exclusivas antes do lançamento.', organizer: 'Estúdios PixelForge', maxParticipants: 300, participants: 300, image: images.Gaming, createdBy: 'system' },
      { title: 'Inteligência Artificial e o Futuro', category: 'Technology', date: addDays(18), time: '09:30', location: 'Auditório do Centro Tecnológico', description: 'Especialistas analisam os avanços recentes na inteligência artificial, a ética e as aplicações práticas para as empresas.', organizer: 'Organizador de demonstração', maxParticipants: 400, participants: 210, image: images.Technology, createdBy: 'user_demo' },
      { title: 'Oficina de Escrita Criativa', category: 'Education', date: addDays(5), time: '14:00', location: 'Biblioteca Pública, Sala 3', description: 'Oficina prática para quem quer escrever, com técnicas de narrativa, desenvolvimento de personagens e revisão de textos.', organizer: 'Coletivo Escrever Bem', maxParticipants: 40, participants: 27, image: images.Education, createdBy: 'system' },
      { title: 'Inauguração da Exposição de Arte Moderna', category: 'Art', date: addDays(15), time: '19:00', location: 'Galeria de Arte da Cidade', description: 'Abertura de uma exposição de pintura e escultura contemporâneas sobre identidade e vida urbana.', organizer: 'Conselho de Arte da Cidade', maxParticipants: 150, participants: 88, image: images.Art, createdBy: 'system' },
      { title: 'Conferência de Crescimento de Empresas', category: 'Business', date: addDays(30), time: '08:30', location: 'Hotel Central', description: 'Aprenda estratégias de crescimento com fundadores de empresas de sucesso. Inclui sessões de contactos e painéis com investidores.', organizer: 'GrowthLabs', maxParticipants: 350, participants: 140, image: images.Business, createdBy: 'system' },
      { title: 'Noite de Comédia ao Vivo', category: 'Entertainment', date: addDays(3), time: '20:30', location: 'Teatro da Gargalhada', description: 'Uma noite de comédia com cinco humoristas em digressão e um convidado surpresa.', organizer: 'Produções Teatro da Gargalhada', maxParticipants: 200, participants: 178, image: images.Entertainment, createdBy: 'system' }
    ];

    const events = sampleEvents.map((e, i) => ({
      id: uid('evt'),
      ...e,
      status: 'active',
      createdAt: Date.now() - (sampleEvents.length - i) * 100000
    }));

    write(KEYS.EVENTS, events);
    write(KEYS.FAVORITES, {});
    write(KEYS.REGISTRATIONS, []);
    write(KEYS.SEEDED, true);
    return events;
  }

  async function apiReady() {
    // Confirma que a camada de pedidos à API está disponível.
    return !!(typeof API !== 'undefined' && API && typeof API.request === 'function');
  }

  async function loadFromApi() {
    // Carrega sessão, eventos, favoritos e inscrições a partir da API.
    if (!(await apiReady())) return false;

    try {
      const currentUser = await API.getMe();
      if (currentUser) {
        state.session = normalizeUser(currentUser);
        write(KEYS.SESSION, state.session);
      }

      const [events, favorites, joinedEvents] = await Promise.all([
        API.getEvents(),
        state.session ? API.getFavorites() : Promise.resolve([]),
        state.session && API.getJoinedEvents ? API.getJoinedEvents() : Promise.resolve([])
      ]);

      state.events = (Array.isArray(events) ? events : []).map(normalizeEvent).filter(Boolean);
      write(KEYS.EVENTS, state.events);
      state.favorites = Array.isArray(favorites) ? favorites.map(e => String(e.id)) : [];
      write(KEYS.FAVORITES, state.favorites);
      state.registrations = (Array.isArray(joinedEvents) ? joinedEvents : []).map(event => ({
        eventId: String(event.id),
        userId: String(state.session.id),
        registeredAt: event.registeredAt ? Date.parse(event.registeredAt) : Date.now(),
        ticketCode: event.ticketCode || '',
        status: 'confirmed'
      }));
      write(KEYS.REGISTRATIONS, state.registrations);
      state.users = state.session ? [state.session] : read(KEYS.USERS, []);
      state.apiLoaded = true;
      return true;
    } catch (error) {
      console.warn('DB: falha ao sincronizar com a API; será mantida a cópia local.', error);
      return false;
    }
  }

  function seedLocalState() {
    // Restaura os dados locais ou inicia os dados de demonstração.
    if (!read(KEYS.SEEDED, false)) {
      state.events = getSeedEvents();
      state.users = read(KEYS.USERS, []);
      state.favorites = read(KEYS.FAVORITES, {});
      state.registrations = read(KEYS.REGISTRATIONS, []);
    } else {
      state.events = read(KEYS.EVENTS, []);
      state.users = read(KEYS.USERS, []);
      state.session = read(KEYS.SESSION, null);
      state.favorites = read(KEYS.FAVORITES, {});
      state.registrations = read(KEYS.REGISTRATIONS, []);
    }
  }

  async function init() {
    // Inicializa o estado escolhendo entre API e armazenamento local.
    if (typeof window === 'undefined') return;
    if (await apiReady()) {
      const loaded = await loadFromApi();
      if (!loaded) {
        state.events = [];
        state.favorites = [];
        state.apiLoaded = true;
        write(KEYS.EVENTS, []);
        write(KEYS.FAVORITES, []);
      }
    } else {
      seedLocalState();
    }
    return state;
  }

  function getEvents() {
    // Devolve a lista de eventos atual do estado ou do armazenamento.
    return state.apiLoaded ? state.events : (state.events.length ? state.events : read(KEYS.EVENTS, []));
  }

  function replaceEvents(events) {
    // Normaliza e substitui a lista de eventos em memória e armazenamento.
    state.events = (Array.isArray(events) ? events : []).map(normalizeEvent).filter(Boolean);
    write(KEYS.EVENTS, state.events);
  }

  function getEvent(id) {
    // Procura um evento pelo identificador.
    const events = getEvents();
    return events.find(e => String(e.id) === String(id)) || null;
  }

  function getUsers() {
    // Devolve utilizadores carregados ou a cópia persistida localmente.
    return state.users.length ? state.users : read(KEYS.USERS, []);
  }

  function getSession() {
    // Devolve a sessão em memória ou recupera a cópia persistida.
    return state.session || read(KEYS.SESSION, null);
  }

  function setSession(user) {
    // Normaliza e guarda a sessão, ou remove-a quando não existe utilizador.
    state.session = user ? normalizeUser(user) : null;
    if (!state.session) {
      sessionStorage.removeItem(KEYS.SESSION);
      localStorage.removeItem(KEYS.SESSION);
      return null;
    }
    write(KEYS.SESSION, state.session);
    return state.session;
  }

  function logout() {
    // Limpa o estado autenticado e as cópias locais da sessão.
    state.session = null;
    sessionStorage.removeItem(KEYS.SESSION);
    localStorage.removeItem(KEYS.SESSION);
  }

  function findUserByEmail(email) {
    // Procura localmente um utilizador pelo endereço de e-mail.
    return getUsers().find(u => (u.email || '').toLowerCase() === String(email || '').toLowerCase()) || null;
  }

  function createUser(data) {
    // Cria e persiste um utilizador local com identificador e data.
    const user = normalizeUser({ ...data, id: data.id || uid('user'), createdAt: Date.now() });
    const users = getUsers();
    users.push(user);
    state.users = users;
    write(KEYS.USERS, users);
    return user;
  }

  function updateUser(id, data) {
    // Atualiza um utilizador local e sincroniza a sessão se necessário.
    const users = getUsers();
    const idx = users.findIndex(u => String(u.id) === String(id));
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...normalizeUser(data), id: String(id) };
    state.users = users;
    write(KEYS.USERS, users);
    if (state.session && String(state.session.id) === String(id)) setSession(users[idx]);
    return users[idx];
  }

  function createEvent(data) {
    // Cria um evento na API ou usa o estado local de demonstração.
    if (typeof API !== 'undefined' && API.createEvent) {
      return API.createEvent(data).then((event) => {
        const normalized = normalizeEvent(event);
        state.events = [normalized, ...state.events.filter(e => String(e.id) !== String(normalized.id))];
        return normalized;
      });
    }

    const full = { ...data, id: uid('evt'), status: 'active', participants: 0, createdBy: state.session?.id || 'system', createdAt: Date.now() };
    const events = getEvents();
    events.unshift(normalizeEvent(full));
    state.events = events;
    write(KEYS.EVENTS, events);
    return full;
  }

  function updateEvent(id, data) {
    // Atualiza um evento remotamente ou na cópia local.
    if (typeof API !== 'undefined' && API.request) {
      return API.request(`/events/${id}`, {
        method: 'PUT',
        body: data
      }).then((event) => {
        const normalized = normalizeEvent(event);
        state.events = state.events.map(item => String(item.id) === String(id) ? normalized : item);
        return normalized;
      });
    }

    const events = getEvents();
    const idx = events.findIndex(e => String(e.id) === String(id));
    if (idx === -1) return null;
    events[idx] = { ...events[idx], ...data };
    state.events = events;
    write(KEYS.EVENTS, events);
    return events[idx];
  }

  function cancelEvent(id) {
    // Marca um evento como cancelado usando a API ou os dados locais.
    if (typeof API !== 'undefined' && API.request) {
      return API.request(`/events/${id}/cancel`, { method: 'POST' }).then((event) => {
        const normalized = normalizeEvent(event);
        state.events = state.events.map(item => String(item.id) === String(id) ? normalized : item);
        return normalized;
      });
    }

    return updateEvent(id, { status: 'cancelled' });
  }

  function deleteEvent(id) {
    // Elimina um evento remotamente ou da lista local.
    if (typeof API !== 'undefined' && API.request) {
      return API.request(`/events/${id}`, { method: 'DELETE' }).then(() => {
        state.events = state.events.filter(item => String(item.id) !== String(id));
        return true;
      });
    }

    state.events = getEvents().filter(e => String(e.id) !== String(id));
    write(KEYS.EVENTS, state.events);
    return true;
  }

  function getRegistrations() {
    // Devolve as inscrições em memória ou as recupera do armazenamento.
    return state.registrations.length ? state.registrations : read(KEYS.REGISTRATIONS, []);
  }

  function saveRegistrations(regs) {
    // Persiste a lista local de inscrições.
    state.registrations = regs;
    write(KEYS.REGISTRATIONS, regs);
  }

  function getRegistrationsForEvent(eventId) {
    // Filtra inscrições associadas a um evento.
    return getRegistrations().filter(r => String(r.eventId) === String(eventId));
  }

  function getRegistrationsForUser(userId) {
    // Filtra inscrições associadas a um utilizador.
    return getRegistrations().filter(r => String(r.userId) === String(userId));
  }

  function isUserRegistered(eventId, userId) {
    // Verifica se existe inscrição confirmada para evento e utilizador.
    return getRegistrations().some(r => String(r.eventId) === String(eventId) && String(r.userId) === String(userId) && r.status === 'confirmed');
  }

  async function registerForEvent(eventId, user) {
    // Inscreve na API ou valida e regista localmente em modo de demonstração.
    if (typeof API !== 'undefined' && API.request) {
      const result = await API.request(`/events/${eventId}/register`, { method: 'POST' });
      const event = getEvent(eventId) || normalizeEvent(result?.event || { id: eventId });
      if (event) {
        const eventList = state.events.map(item => String(item.id) === String(eventId) ? { ...item, participants: Math.max(item.participants, (result && result.participants_count) || item.participants + 1) } : item);
        state.events = eventList;
        write(KEYS.EVENTS, state.events);
      }
      return { ok: true, message: result?.message || 'Inscrição efetuada com sucesso.' };
    }

    const event = getEvent(eventId);
    if (!event) return { ok: false, message: 'Evento não encontrado.' };
    if (event.status === 'cancelled') return { ok: false, message: 'Este evento foi cancelado.' };
    if (isUserRegistered(eventId, user.id)) return { ok: false, message: 'Já está inscrito neste evento.' };
    if (event.participants >= event.maxParticipants) return { ok: false, message: 'O evento está lotado.' };

    const regs = getRegistrations();
    const reg = {
      id: uid('reg'),
      eventId,
      userId: user.id,
      name: user.name,
      email: user.email,
      registeredAt: Date.now(),
      status: 'confirmed'
    };
    regs.push(reg);
    saveRegistrations(regs);
    updateEvent(eventId, { participants: event.participants + 1 });
    return { ok: true, registration: reg };
  }

  async function leaveEvent(eventId, userId) {
    // Cancela uma inscrição através da API ou do estado local.
    if (typeof API !== 'undefined' && API.leaveEvent) {
      const result = await API.leaveEvent(eventId);
      const regs = getRegistrations().filter(r => !(
        String(r.eventId) === String(eventId) &&
        String(r.userId) === String(userId) &&
        r.status === 'confirmed'
      ));
      saveRegistrations(regs);
      const event = getEvent(eventId);
      if (event) {
        updateEvent(eventId, {
          participants: Math.max(0, Number(result?.participantsCount ?? event.participants - 1))
        });
      }
      return { ok: true, message: result?.message || 'A sua inscrição foi cancelada.' };
    }

    return cancelRegistration(eventId, userId);
  }

  function cancelRegistration(eventId, userId) {
    // Cancela localmente a inscrição e atualiza a contagem de participantes.
    const regs = getRegistrations();
    const idx = regs.findIndex(r => String(r.eventId) === String(eventId) && String(r.userId) === String(userId) && r.status === 'confirmed');
    if (idx === -1) return { ok: false };
    regs[idx].status = 'cancelled';
    saveRegistrations(regs);
    const event = getEvent(eventId);
    if (event) updateEvent(eventId, { participants: Math.max(0, event.participants - 1) });
    return { ok: true };
  }

  function getFavoritesMap() {
    // Lê o mapa local que associa utilizadores aos seus favoritos.
    return read(KEYS.FAVORITES, {});
  }

  function saveFavoritesMap(map) {
    // Persiste o mapa local de favoritos.
    write(KEYS.FAVORITES, map);
  }

  function getFavorites(userId) {
    // Devolve os identificadores favoritos do utilizador indicado.
    if (Array.isArray(state.favorites)) return state.favorites.map(String);
    const map = getFavoritesMap();
    const ids = map[userId] || [];
    return ids.map(String);
  }

  function isFavorite(userId, eventId) {
    // Verifica se um evento consta dos favoritos do utilizador.
    return getFavorites(userId).includes(String(eventId));
  }

  async function toggleFavorite(userId, eventId) {
    // Alterna um favorito na API ou no armazenamento local.
    if (typeof API !== 'undefined' && API.request) {
      const result = await API.request(`/favorites/${eventId}`, { method: 'POST' });
      const favs = await API.getFavorites();
      const map = { ...getFavoritesMap() };
      map[userId] = favs.map(e => String(e.id));
      state.favorites = map[userId];
      saveFavoritesMap(map);
      return map[userId].includes(String(eventId));
    }

    const map = getFavoritesMap();
    const list = map[userId] || [];
    const idx = list.indexOf(String(eventId));
    let isFav;
    if (idx === -1) {
      list.push(String(eventId));
      isFav = true;
    } else {
      list.splice(idx, 1);
      isFav = false;
    }
    map[userId] = list;
    saveFavoritesMap(map);
    return isFav;
  }

  // Lê o tema guardado no browser.
  function getTheme() { return localStorage.getItem(KEYS.THEME); }
  // Guarda a preferência visual do utilizador.
  function setTheme(theme) { localStorage.setItem(KEYS.THEME, theme); }

  return {
    KEYS,
    CATEGORIES,
    uid,
    seed: seedLocalState,
    init,
    getEvents,
    replaceEvents,
    getEvent,
    createEvent,
    updateEvent,
    cancelEvent,
    deleteEvent,
    getUsers,
    findUserByEmail,
    createUser,
    updateUser,
    getSession,
    setSession,
    logout,
    getRegistrations,
    getRegistrationsForEvent,
    getRegistrationsForUser,
    isUserRegistered,
    registerForEvent,
    leaveEvent,
    cancelRegistration,
    getFavorites,
    isFavorite,
    toggleFavorite,
    getTheme,
    setTheme
  };
})();

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    await DB.init();
  });
}
