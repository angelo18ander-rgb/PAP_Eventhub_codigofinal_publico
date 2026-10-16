/* ==========================================================================
   Comunica com a API, converte os dados entre formatos e valida respostas.
   ========================================================================== */

function defaultApiBaseUrl() {
  // Escolhe API local em desenvolvimento e o caminho relativo em produção.
  const localHosts = new Set(['', 'localhost', '127.0.0.1', '[::1]']);
  return localHosts.has(window.location.hostname)
    ? 'http://127.0.0.1:8000/api'
    : `${window.location.origin}/api`;
}

const API_BASE_URL = (window.API_BASE_URL || defaultApiBaseUrl()).replace(/\/+$/, '');

function toCamelCase(obj) {
  // Converte recursivamente chaves snake_case da API para camelCase no cliente.
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      acc[camelKey] = toCamelCase(obj[key]);
      return acc;
    }, {});
  }
  return obj;
}

function toSnakeCase(obj) {
  // Converte os objetos enviados pelo cliente para o formato esperado pela API.
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      acc[snakeKey] = toSnakeCase(obj[key]);
      return acc;
    }, {});
  }
  return obj;
}

function sanitizeEventPayload(eventData) {
  // Normaliza formatos de data, hora, capacidade e imagem antes do envio.
  const payload = { ...eventData };

  if (payload.date) {
    const d = new Date(payload.date);
    if (!isNaN(d.getTime())) {
      payload.date = d.toISOString().split('T')[0];
    }
  }

  if (payload.time && payload.time.length > 5) {
    payload.time = payload.time.substring(0, 5);
  }

  if (payload.maxCapacity !== undefined) {
    payload.max_participants = Number(payload.maxCapacity);
    delete payload.maxCapacity;
  }

  if (payload.maxParticipants !== undefined) {
    payload.max_participants = Number(payload.maxParticipants);
    delete payload.maxParticipants;
  }

  if (payload.image !== undefined) {
    payload.image_url = payload.image;
    delete payload.image;
  }

  return payload;
}

function normalizeEvent(event) {
  // Converte formatos conhecidos de evento para a estrutura do frontend.
  if (!event || typeof event !== 'object') return null;

  return {
    id: event.id || '',
    title: event.title || 'Evento sem título',
    description: event.description || '',
    category: event.category || 'Other',
    date: event.date || '',
    time: event.time || '00:00',
    location: event.location || 'A definir',
    address: event.address || event.location || 'A definir',
    maxCapacity: Number(event.maxCapacity || event.max_capacity || event.maxParticipants || event.max_participants || 0),
    attendeesCount: Number(event.attendeesCount || event.attendees_count || event.participantsCount || event.participants_count || 0),
    imageUrl: event.imageUrl || event.image_url || 'assets/images/placeholder.jpg',
    organizerId: event.organizerId || event.organizer_id || null,
    organizerName: event.organizerName || event.organizer_name || 'Organizador',
    status: event.status || 'active',
    isFavorite: Boolean(event.isFavorite || event.is_favorite),
    isRegistered: Boolean(event.isRegistered || event.is_registered)
  };
}

function normalizeEventList(events) {
  // Normaliza uma lista de eventos e ignora respostas que não sejam listas.
  if (!Array.isArray(events)) return [];
  return events.map(normalizeEvent);
}

const API = {
  // Lê o token de sessão usado para autenticar pedidos protegidos.
  getToken() {
    return sessionStorage.getItem('eh_jwt_token');
  },

  // Guarda ou remove o token de autenticação do separador atual.
  setToken(token) {
    if (token) {
      sessionStorage.setItem('eh_jwt_token', token);
    } else {
      sessionStorage.removeItem('eh_jwt_token');
    }
  },

  // Executa pedidos HTTP com autenticação, JSON e mensagens de erro uniformes.
  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-EventHub-Token'] = token;
    }

    let body = options.body;
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      body = JSON.stringify(toSnakeCase(body));
    }

    const config = {
      ...options,
      headers,
      body,
    };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = { detail: await response.text() };
      }

      if (!response.ok) {
        let errorMsg = 'Ocorreu um erro no pedido.';
        if (typeof data.detail === 'string') {
          errorMsg = data.detail;
        } else if (Array.isArray(data.detail) && data.detail.length > 0) {
          errorMsg = data.detail[0].msg || 'Os dados enviados não são válidos.';
        }
        throw new Error(errorMsg);
      }

      return toCamelCase(data);
    } catch (error) {
      console.error(`[API Error] ${endpoint}:`, error);
      throw error;
    }
  },

  // Autentica uma conta e carrega os dados atualizados do utilizador.
  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    this.setToken(data.accessToken || data.access_token);
    const user = await this.getMe();
    if (user && typeof DB !== 'undefined' && DB.setSession) {
      DB.setSession(user);
    }
    return user;
  },

  // Cria uma conta e guarda a sessão devolvida pela API.
  async register(name, email, password, phoneNumber, country, city, role) {
    const response = await this.request('/auth/register', {
      method: 'POST',
      body: { name, email, password, phoneNumber, country, city, role },
    });
    const token = response.accessToken || response.access_token;
    if (!token) throw new Error('O registo foi concluído, mas não foi recebido um token de autenticação.');
    this.setToken(token);

    const user = { ...response };
    delete user.accessToken;
    delete user.access_token;
    if (typeof DB !== 'undefined' && DB.setSession) DB.setSession(user);
    return user;
  },

  // Obtém o perfil autenticado e encerra a sessão se o token for inválido.
  async getMe() {
    if (!this.getToken()) return null;
    try {
      const user = await this.request('/users/me');
      if (user && typeof DB !== 'undefined' && DB.setSession) {
        DB.setSession(user);
      }
      return user;
    } catch {
      this.setToken(null);
      if (typeof DB !== 'undefined' && DB.logout) DB.logout();
      return null;
    }
  },

  // Atualiza o perfil e substitui a sessão local pela resposta da API.
  async updateProfile(profile) {
    const response = await this.request('/users/me', {
      method: 'PATCH',
      body: { ...profile, avatarUrl: profile.avatar || null },
    });
    if (response.accessToken) this.setToken(response.accessToken);
    const user = { ...response };
    delete user.accessToken;
    if (typeof DB !== 'undefined' && DB.setSession) DB.setSession(user);
    return user;
  },

  // Obtém os dados públicos de um utilizador identificado.
  async getPublicUserProfile(id) {
    return this.request(`/users/${encodeURIComponent(id)}/public-profile`);
  },

  // Alterna a relação de seguimento com um utilizador.
  async toggleUserFollow(id) {
    return this.request(`/users/${encodeURIComponent(id)}/follow`, { method: 'POST' });
  },

  // Obtém a lista de seguidores ou de pessoas seguidas por um utilizador.
  async getUserNetwork(id, kind) {
    return this.request(`/users/${encodeURIComponent(id)}/network?kind=${encodeURIComponent(kind)}`);
  },

  // Lista os pedidos de seguimento recebidos pelo utilizador atual.
  async getFollowRequests() {
    return this.request('/users/me/follow-requests');
  },

  // Aprova ou rejeita um pedido de seguimento recebido.
  async decideFollowRequest(id, approve) {
    return this.request(`/users/me/follow-requests/${encodeURIComponent(id)}`, { method: approve ? 'POST' : 'DELETE' });
  },

  // Remove uma pessoa da lista de seguidores do utilizador atual.
  async removeFollower(id) {
    return this.request(`/users/me/followers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // Bloqueia ou desbloqueia outra conta.
  async setBlocked(id, enabled) {
    return this.request(`/users/me/blocks/${encodeURIComponent(id)}`, { method: enabled ? 'POST' : 'DELETE' });
  },

  // Lista as contas bloqueadas pelo utilizador atual.
  async getBlockedUsers() {
    return this.request('/users/me/blocks');
  },

  // Silencia ou deixa de silenciar outra conta.
  async setMuted(id, enabled) {
    return this.request(`/users/me/mutes/${encodeURIComponent(id)}`, { method: enabled ? 'POST' : 'DELETE' });
  },

  // Lista as contas silenciadas pelo utilizador atual.
  async getMutedUsers() {
    return this.request('/users/me/mutes');
  },

  // Obtém contagens agregadas da rede e das presenças do utilizador.
  async getMyNetworkSummary() {
    return this.request('/users/me/network-summary');
  },

  // Pesquisa cidades existentes para alimentar os campos de localização.
  async searchCities(query) {
    return this.request(`/locations/cities?q=${encodeURIComponent(query)}`);
  },

  // Lista participantes seguidos que também estão inscritos no evento.
  async getMutualEventAttendees(eventId) {
    return this.request(`/events/${encodeURIComponent(eventId)}/mutual-attendees`);
  },

  // Remove o token e encerra a autenticação deste separador.
  logout() {
    this.setToken(null);
    if (typeof DB !== 'undefined' && DB.logout) DB.logout();
    document.dispatchEvent(new CustomEvent('eh:auth-changed'));
  },

  // Pesquisa eventos aplicando texto e categoria opcionais.
  async getEvents(search = '', category = '') {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (category) params.append('category', category);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const rawData = await this.request(`/events${queryString}`);
    return normalizeEventList(rawData);
  },

  // Obtém os detalhes normalizados de um evento pelo identificador.
  async getEventById(id) {
    const rawData = await this.request(`/events/${id}`);
    return normalizeEvent(rawData);
  },

  // Cria um evento após normalizar o payload do formulário.
  async createEvent(eventData) {
    const cleanData = sanitizeEventPayload(eventData);
    const rawData = await this.request('/events', {
      method: 'POST',
      body: cleanData,
    });
    return normalizeEvent(rawData);
  },

  // Lista os eventos criados pelo organizador autenticado.
  async getMyEvents() {
    const rawData = await this.request('/users/me/events');
    return normalizeEventList(rawData);
  },

  // Lista os eventos guardados como favoritos pelo utilizador.
  async getFavorites() {
    const rawData = await this.request('/users/me/favorites');
    return normalizeEventList(rawData);
  },

  // Lista eventos inscritos e os códigos associados aos bilhetes.
  async getJoinedEvents() {
    const rawData = await this.request('/users/me/joined-events');
    return Array.isArray(rawData) ? rawData.map(event => ({
      ...normalizeEvent(event),
      ticketCode: event.ticketCode || '',
      registeredAt: event.registeredAt || null
    })) : [];
  },

  // Obtém o perfil público de um organizador.
  async getOrganizerProfile(organizerId) {
    return this.request(`/organizers/${encodeURIComponent(organizerId)}`);
  },

  // Pesquisa perfis públicos com filtros de papel e paginação.
  async searchUsers(query, role = 'all', page = 1, limit = 12) {
    const params = new URLSearchParams({
      q: query,
      role,
      page: String(page),
      limit: String(limit)
    });
    return this.request(`/users/search?${params.toString()}`);
  },

  // Obtém o perfil público de um utilizador pelo seu identificador.
  async getPublicUserProfile(userId) {
    return this.request(`/users/${encodeURIComponent(userId)}/public-profile`);
  },

  // Lista os organizadores seguidos pelo utilizador autenticado.
  async getFollowedOrganizers() {
    return this.request('/users/me/following-organizers');
  },

  // Alterna o seguimento de um organizador.
  async toggleOrganizerFollow(organizerId) {
    return this.request(`/organizers/${encodeURIComponent(organizerId)}/follow`, { method: 'POST' });
  },

  // Obtém os dados públicos e o estado atual de um bilhete.
  async getTicket(ticketCode) {
    return this.request(`/tickets/${encodeURIComponent(ticketCode)}`);
  },

  // Devolve os bilhetes do utilizador usando a lista de inscrições.
  async listMyTickets() {
    return this.getJoinedEvents();
  },

  // Inscreve o utilizador autenticado num evento.
  async registerForEvent(eventId) {
    return await this.request(`/events/${eventId}/register`, {
      method: 'POST',
    });
  },

  // Cancela a inscrição do utilizador num evento.
  async leaveEvent(eventId) {
    return await this.request(`/events/${eventId}/register`, {
      method: 'DELETE',
    });
  },

  // Lista os eventos aos quais o membro da equipa tem acesso.
  async getMyStaffEvents() {
    return this.request('/users/me/staff-events');
  },

  // Solicita acesso de equipa para validar entradas num evento.
  async requestStaffAccess(eventId) {
    return this.request(`/events/${encodeURIComponent(eventId)}/staff-requests`, { method: 'POST' });
  },

  // Lista membros da equipa e o estado dos respetivos pedidos.
  async getEventStaff(eventId) {
    return this.request(`/events/${encodeURIComponent(eventId)}/staff`);
  },

  // Obtém os participantes inscritos num evento gerido pelo organizador.
  async getEventParticipants(eventId) {
    return this.request(`/events/${encodeURIComponent(eventId)}/participants`);
  },

  // Convida uma conta da equipa para colaborar num evento.
  async inviteEventStaff(eventId, email) {
    return this.request(`/events/${encodeURIComponent(eventId)}/staff`, {
      method: 'POST',
      body: { email },
    });
  },

  // Regista a decisão do organizador sobre um pedido de acesso da equipa.
  async decideEventStaffRequest(eventId, staffId, status) {
    return this.request(`/events/${encodeURIComponent(eventId)}/staff/${encodeURIComponent(staffId)}/decision`, {
      method: 'POST',
      body: { status },
    });
  },

  // Valida um QR de bilhete para o evento autorizado.
  async verifyTicketEntry(eventId, ticketPayload) {
    return this.request('/tickets/verify-entry', {
      method: 'POST',
      body: { eventId: Number(eventId), ticketPayload },
    });
  },

  // Alterna o estado favorito de um evento.
  async toggleFavorite(eventId) {
    return await this.request(`/favorites/${eventId}`, {
      method: 'POST',
    });
  }
};
