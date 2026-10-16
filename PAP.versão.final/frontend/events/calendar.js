/* ==========================================================================
   Gere o calendário mensal e os eventos associados à data selecionada.
   ========================================================================== */

let calViewDate = new Date();
let calSelectedDate = null;
let cachedEvents = [];

document.addEventListener('DOMContentLoaded', async () => {
  populateSelectors();
  bindControls();
  await loadAndRenderCalendar();
  selectDate(new Date().toISOString().slice(0, 10));
});

function populateSelectors() {
  // Preenche os seletores com meses localizados e anos próximos do atual.
  const monthSelect = document.getElementById('cal-month-select');
  const monthNames = Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat('pt-PT', { month: 'long' }).format(new Date(2024, month, 1))
  );
  monthSelect.innerHTML = '';
  monthNames.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = m;
    monthSelect.appendChild(opt);
  });

  const yearSelect = document.getElementById('cal-year-select');
  yearSelect.innerHTML = '';
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 3; y <= currentYear + 5; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }
}

function bindControls() {
  // Liga os controlos de navegação do calendário ao estado da vista.
  document.getElementById('cal-prev-btn').addEventListener('click', async () => {
    calViewDate.setMonth(calViewDate.getMonth() - 1);
    await loadAndRenderCalendar();
  });
  document.getElementById('cal-next-btn').addEventListener('click', async () => {
    calViewDate.setMonth(calViewDate.getMonth() + 1);
    await loadAndRenderCalendar();
  });
  document.getElementById('cal-today-btn').addEventListener('click', async () => {
    calViewDate = new Date();
    await loadAndRenderCalendar();
    selectDate(new Date().toISOString().slice(0, 10));
  });
  document.getElementById('cal-month-select').addEventListener('change', async (e) => {
    calViewDate.setMonth(parseInt(e.target.value, 10));
    await loadAndRenderCalendar();
  });
  document.getElementById('cal-year-select').addEventListener('change', async (e) => {
    calViewDate.setFullYear(parseInt(e.target.value, 10));
    await loadAndRenderCalendar();
  });
}

function eventsForDate(dateStr) {
  // Devolve os eventos cuja data coincide com a data ISO recebida.
  return cachedEvents.filter(e => e.date === dateStr);
}

async function loadAndRenderCalendar() {
  // Obtém novamente os eventos e redesenha o calendário e a data selecionada.
  try {
    // Obtém os eventos através da API FastAPI.
    cachedEvents = await API.getEvents();
  } catch (err) {
    console.error('Erro ao carregar eventos da API:', err);
    cachedEvents = [];
  }
  renderCalendar();
  if (calSelectedDate) {
    selectDate(calSelectedDate);
  }
}

function renderCalendar() {
  // Desenha a grelha do mês, assinalando hoje, seleção e dias com eventos.
  document.getElementById('cal-month-select').value = calViewDate.getMonth();
  document.getElementById('cal-year-select').value = calViewDate.getFullYear();

  const grid = document.getElementById('calendar-grid');
  const year = calViewDate.getFullYear();
  const month = calViewDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  let html = '';
  for (let i = 0; i < startOffset; i++) html += `<div class="cal-day empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = eventsForDate(dateStr);
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === calSelectedDate;
    const isPast = dateStr < todayStr;

    const dots = dayEvents.slice(0, 4).map(e => {
      const cat = UI.categoryMeta(e.category);
      return `<span class="dot" style="background:${cat.color}"></span>`;
    }).join('');
    const moreLabel = dayEvents.length > 4 ? `<span class="cal-day-more">+${dayEvents.length - 4} mais</span>` : '';

    html += `
      <div class="cal-day ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''} ${isPast ? 'is-past' : ''}" data-date="${dateStr}">
        <span class="day-num">${day}</span>
        <div class="cal-day-dots">${dots}</div>
        ${moreLabel}
      </div>`;
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.cal-day:not(.empty)').forEach(el => {
    el.addEventListener('click', () => selectDate(el.dataset.date));
  });
}

function selectDate(dateStr) {
  // Atualiza a seleção e apresenta a lista de eventos desse dia.
  calSelectedDate = dateStr;
  document.querySelectorAll('.cal-day').forEach(el => el.classList.toggle('is-selected', el.dataset.date === dateStr));

  const title = document.getElementById('day-detail-title');
  const container = document.getElementById('day-detail-events');
  const dateObj = new Date(dateStr + 'T00:00:00');
  title.textContent = dateObj.toLocaleDateString('pt-PT', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const events = eventsForDate(dateStr);
  if (!events.length) {
    container.innerHTML = `
      <div class="empty-state" style="padding:30px 10px;">
        <i class="fa-solid fa-calendar-day"></i>
        <h3 style="font-size:0.95rem;">Sem eventos</h3>
        <p style="font-size:0.82rem;">Não há eventos agendados para este dia.</p>
      </div>`;
    return;
  }

  container.innerHTML = events.map(e => {
    const cat = UI.categoryMeta(e.category);
    return `
      <div class="day-event-item" data-id="${e.id}">
        <span class="dot" style="background:${cat.color}"></span>
        <div>
          <div class="dei-title">${UI.escapeHtml(e.title)} ${e.status === 'cancelled' ? '<span class="badge badge-danger" style="font-size:0.6rem;">Cancelado</span>' : ''}</div>
          <div class="dei-meta"><i class="fa-solid fa-clock"></i> ${UI.formatTime(e.time)} · <i class="fa-solid fa-location-dot"></i> ${UI.escapeHtml(e.location)}</div>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.day-event-item').forEach(el => {
    el.addEventListener('click', () => window.location.href = UI.pageUrl(`frontend/events/event-details.html?id=${el.dataset.id}`));
  });
}
