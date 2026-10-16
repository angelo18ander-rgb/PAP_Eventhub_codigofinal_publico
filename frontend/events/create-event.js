/* ==========================================================================
   Valida os dados do formulário e cria ou atualiza eventos de organizadores.
   ========================================================================== */

let editingEventId = null;
let uploadedImageData = '';

document.addEventListener('DOMContentLoaded', async () => {
  await DB.init();
  const session = await Auth.requireAuth('Inicie sessão para criar ou editar um evento.');
  if (!session) {
    setTimeout(() => { if (!DB.getSession()) window.location.href = UI.pageUrl('frontend/home/index.html'); }, 50);
    return;
  }
  if (session.role !== 'organizer') {
    UI.toast('Apenas contas de organizador podem criar eventos.', 'warning');
    window.location.href = UI.pageUrl('frontend/people/profile.html');
    return;
  }

  populateCategorias();
  bindCharCounters();
  bindImageUpload();
  setMinDate();

  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  if (editId) initEditMode(editId);

  bindFormSubmit();
  document.getElementById('cancel-btn').addEventListener('click', () => {
    window.location.href = editingEventId ? UI.pageUrl('frontend/events/my-events.html') : UI.pageUrl('frontend/events/events.html');
  });
});

function setMinDate() {
  // Restringe a data do formulário ao intervalo aceite pela API.
  const dateInput = document.getElementById('ev-date');
  const today = new Date();
  dateInput.min = today.toISOString().slice(0, 10);
  dateInput.max = `${today.getFullYear() + 10}-12-31`;
}

function populateCategorias() {
  // Preenche as opções com os identificadores canónicos de categoria.
  const select = document.getElementById('ev-category');
  DB.CATEGORIES.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.name;
    opt.textContent = UI.categoryLabel(cat.name);
    select.appendChild(opt);
  });
}

function bindCharCounters() {
  // Mantém os contadores de caracteres sincronizados com os campos.
  const title = document.getElementById('ev-title');
  const desc = document.getElementById('ev-description');
  title.addEventListener('input', () => document.getElementById('title-count').textContent = title.value.length);
  desc.addEventListener('input', () => document.getElementById('desc-count').textContent = desc.value.length);
}

function bindImageUpload() {
  // Valida, lê e pré-visualiza a imagem escolhida para o evento.
  const input = document.getElementById('ev-image-input');
  const preview = document.getElementById('image-preview');
  const previewImg = document.getElementById('image-preview-img');

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      UI.toast('A imagem é demasiado grande. O limite é 5 MB.', 'error');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedImageData = e.target.result;
      previewImg.src = uploadedImageData;
      preview.classList.add('show');
      document.getElementById('image-error').parentElement?.classList?.remove('has-error');
      document.querySelector('.image-upload').closest('.form-group').classList.remove('has-error');
    };
    reader.readAsDataURL(file);
  });
}

function initEditMode(id) {
  // Carrega um evento existente e preenche o formulário para edição.
  const event = DB.getEvent(id);
  if (!event) { UI.toast('Evento não encontrado.', 'error'); window.location.href = UI.pageUrl('frontend/events/my-events.html'); return; }

  const session = DB.getSession();
  if (!session || event.createdBy !== session.id) {
    UI.toast('Não tem autorização para editar este evento.', 'error');
    window.location.href = UI.pageUrl('frontend/events/my-events.html');
    return;
  }

  editingEventId = id;
  document.getElementById('page-title').textContent = 'Editar evento';
  document.getElementById('page-subtitle').textContent = 'Atualize os dados do evento abaixo.';
  document.getElementById('submit-btn').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar alterações';

  document.getElementById('ev-title').value = event.title;
  document.getElementById('title-count').textContent = event.title.length;
  document.getElementById('ev-description').value = event.description;
  document.getElementById('desc-count').textContent = event.description.length;
  // Mantém as mesmas restrições de data durante a edição do evento.
  document.getElementById('ev-date').value = event.date;
  document.getElementById('ev-time').value = event.time;
  document.getElementById('ev-location').value = event.location;
  document.getElementById('ev-category').value = event.category;
  document.getElementById('ev-max').value = event.maxParticipants;

  uploadedImageData = event.image;
  const preview = document.getElementById('image-preview');
  const previewImg = document.getElementById('image-preview-img');
  previewImg.src = event.image;
  preview.classList.add('show');
}

function setFieldError(inputEl, hasError) {
  // Alterna o estilo de erro no grupo que contém o campo.
  const group = inputEl.closest('.form-group');
  if (group) group.classList.toggle('has-error', hasError);
}

function bindFormSubmit() {
  // Valida os dados e cria um evento ou grava as alterações existentes.
  const form = document.getElementById('event-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const session = DB.getSession();
    if (!session) { Auth.requireAuth('Inicie sessão para criar um evento.'); return; }

    const title = document.getElementById('ev-title');
    const description = document.getElementById('ev-description');
    const date = document.getElementById('ev-date');
    const time = document.getElementById('ev-time');
    const location = document.getElementById('ev-location');
    const category = document.getElementById('ev-category');
    const max = document.getElementById('ev-max');

    let valid = true;

    if (title.value.trim().length < 3) { setFieldError(title, true); valid = false; } else setFieldError(title, false);
    if (description.value.trim().length < 20) { setFieldError(description, true); valid = false; } else setFieldError(description, false);

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const maxDate = `${today.getFullYear() + 10}-12-31`;
    if (!date.value || date.value < todayStr || date.value > maxDate) { setFieldError(date, true); valid = false; } else setFieldError(date, false);
    if (!time.value) { setFieldError(time, true); valid = false; } else setFieldError(time, false);
    const locationParts = location.value.split(',').map(part => part.trim());
    if (locationParts.length < 3 || locationParts.slice(0, 3).some(part => part.length < 2)) { setFieldError(location, true); valid = false; } else setFieldError(location, false);
    if (!category.value) { setFieldError(category, true); valid = false; } else setFieldError(category, false);

    const maxNum = parseInt(max.value, 10);
    const currentEvent = editingEventId ? DB.getEvent(editingEventId) : null;
    if (!maxNum || maxNum < 1) { setFieldError(max, true); valid = false; }
    else if (currentEvent && maxNum < currentEvent.participants) {
      setFieldError(max, true);
      max.closest('.form-group').querySelector('.form-error').textContent = `O limite não pode ser inferior aos ${currentEvent.participants} participantes atuais.`;
      valid = false;
    } else setFieldError(max, false);

    const imageGroup = document.getElementById('ev-image-input').closest('.form-group');
    if (!uploadedImageData) { imageGroup.classList.add('has-error'); valid = false; } else imageGroup.classList.remove('has-error');

    if (!valid) {
      UI.toast('Corrija os erros assinalados no formulário.', 'error');
      return;
    }

    const submitBtn = document.getElementById('submit-btn');
    const originalLabel = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> A guardar…';

    try {
      const payload = {
        title: title.value.trim(),
        description: description.value.trim(),
        date: date.value,
        time: time.value,
        location: location.value.trim(),
        category: category.value,
        maxParticipants: maxNum,
        image: uploadedImageData
      };

      if (editingEventId) {
        await DB.updateEvent(editingEventId, payload);
        UI.toast('Evento atualizado com sucesso!', 'success');
        setTimeout(() => window.location.href = UI.pageUrl(`frontend/events/event-details.html?id=${editingEventId}`), 700);
      } else {
        const newEvent = await DB.createEvent({
          ...payload,
          organizer: session.name,
          createdBy: session.id
        });
        UI.toast('Evento criado com sucesso e publicado!', 'success');
        setTimeout(() => window.location.href = UI.pageUrl(`frontend/events/event-details.html?id=${newEvent.id}`), 700);
      }
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalLabel;
    } catch (error) {
      UI.toast(error.message || 'Não foi possível guardar o evento.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalLabel;
    }
  });
}
