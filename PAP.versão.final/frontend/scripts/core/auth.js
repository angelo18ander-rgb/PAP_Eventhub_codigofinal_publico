/* ==========================================================================
   Gere o registo, o início de sessão e a seleção do número de telefone.
   ========================================================================== */

const PhoneInput = (() => {
  const countries = [
    ['Argentina', '+54'], ['Austrália', '+61'], ['Áustria', '+43'], ['Bélgica', '+32'],
    ['Brasil', '+55'], ['Bulgária', '+359'], ['Canadá', '+1'], ['Chile', '+56'],
    ['China', '+86'], ['Colômbia', '+57'], ['Croácia', '+385'], ['Chipre', '+357'],
    ['Chéquia', '+420'], ['Dinamarca', '+45'], ['Egito', '+20'], ['Estónia', '+372'],
    ['Finlândia', '+358'], ['França', '+33'], ['Alemanha', '+49'], ['Gana', '+233'],
    ['Grécia', '+30'], ['Hong Kong', '+852'], ['Hungria', '+36'], ['Islândia', '+354'],
    ['Índia', '+91'], ['Indonésia', '+62'], ['Irlanda', '+353'], ['Israel', '+972'],
    ['Itália', '+39'], ['Japão', '+81'], ['Quénia', '+254'], ['Letónia', '+371'],
    ['Lituânia', '+370'], ['Luxemburgo', '+352'], ['Malásia', '+60'], ['Malta', '+356'],
    ['México', '+52'], ['Marrocos', '+212'], ['Nepal', '+977'], ['Países Baixos', '+31'],
    ['Nova Zelândia', '+64'], ['Nigéria', '+234'], ['Noruega', '+47'], ['Paquistão', '+92'],
    ['Peru', '+51'], ['Filipinas', '+63'], ['Polónia', '+48'], ['Portugal', '+351'],
    ['Roménia', '+40'], ['Arábia Saudita', '+966'], ['Singapura', '+65'], ['Eslováquia', '+421'],
    ['Eslovénia', '+386'], ['África do Sul', '+27'], ['Coreia do Sul', '+82'], ['Espanha', '+34'],
    ['Sri Lanka', '+94'], ['Suécia', '+46'], ['Suíça', '+41'], ['Taiwan', '+886'],
    ['Tailândia', '+66'], ['Turquia', '+90'], ['Ucrânia', '+380'], ['Emirados Árabes Unidos', '+971'],
    ['Reino Unido', '+44'], ['Estados Unidos', '+1'], ['Vietname', '+84']
  ];
  let modal;
  let activePicker;
  let selectedCountry;

  function mountModal() {
    // Cria uma janela comum para escolher país e introduzir telefone.
    if (modal) return;
    modal = document.createElement('div');
    modal.id = 'phone-picker-modal-overlay';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="phone-picker-title">
        <div class="modal-header">
          <h3 id="phone-picker-title"><i class="fa-solid fa-phone"></i> Adicionar número de telefone</h3>
          <button type="button" class="modal-close" data-close-modal aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div id="phone-country-step">
            <p class="form-hint">Comece por escolher o país ou o indicativo.</p>
            <div class="form-group">
              <label class="form-label" for="phone-country-select">País</label>
              <select id="phone-country-select" class="form-input">
                <option value="">Selecione um país</option>
                ${countries.map(([name, code]) => `<option value="${name}">${name} (${code})</option>`).join('')}
                <option value="other">Outro país / introduzir indicativo</option>
              </select>
            </div>
            <div id="phone-custom-country-fields" hidden>
              <div class="form-group">
                <label class="form-label" for="phone-custom-country">País</label>
                <input type="text" id="phone-custom-country" class="form-input" autocomplete="country-name" placeholder="Nome do país">
              </div>
              <div class="form-group">
                <label class="form-label" for="phone-custom-calling-code">Indicativo telefónico</label>
                <input type="tel" id="phone-custom-calling-code" class="form-input" inputmode="tel" placeholder="+999">
              </div>
            </div>
            <button type="button" id="phone-country-continue" class="btn btn-primary btn-block" disabled>Continuar</button>
          </div>
          <div id="phone-number-step" hidden>
            <p class="form-hint" id="phone-selected-country"></p>
            <div class="form-group">
              <label class="form-label" for="phone-local-number">Número de telefone</label>
              <div class="input-icon-wrap">
                <i class="fa-solid fa-phone"></i>
                <input type="tel" id="phone-local-number" class="form-input" autocomplete="tel-national" placeholder="Introduza o número sem o indicativo do país">
              </div>
              <div class="form-error" id="phone-modal-error">Introduza um número de telefone válido.</div>
            </div>
            <div class="modal-footer" style="padding:0;">
              <button type="button" id="phone-number-back" class="btn btn-secondary">Voltar</button>
              <button type="button" id="phone-number-confirm" class="btn btn-primary">Utilizar este número</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    UI.bindOverlayClose(modal);

    const countrySelect = modal.querySelector('#phone-country-select');
    const customCountry = modal.querySelector('#phone-custom-country');
    const customCallingCode = modal.querySelector('#phone-custom-calling-code');
    const continueButton = modal.querySelector('#phone-country-continue');
    const updateCountryStep = () => {
      const isCustom = countrySelect.value === 'other';
      modal.querySelector('#phone-custom-country-fields').hidden = !isCustom;
      continueButton.disabled = isCustom
        ? customCountry.value.trim().length < 2 || !/^\+[1-9]\d{0,2}$/.test(customCallingCode.value.trim())
        : !countrySelect.value;
    };
    countrySelect.addEventListener('change', () => {
      updateCountryStep();
    });
    customCountry.addEventListener('input', updateCountryStep);
    customCallingCode.addEventListener('input', updateCountryStep);
    continueButton.addEventListener('click', () => {
      const isCustom = countrySelect.value === 'other';
      selectedCountry = isCustom
        ? [customCountry.value.trim(), customCallingCode.value.trim()]
        : countries.find(([name]) => name === countrySelect.value);
      if (!selectedCountry) return;
      if (isCustom && activePicker.number.startsWith(selectedCountry[1])) {
        modal.querySelector('#phone-local-number').value = activePicker.number.slice(selectedCountry[1].length);
      } else if (isCustom && activePicker.number.startsWith('+')) {
        modal.querySelector('#phone-local-number').value = '';
      }
      modal.querySelector('#phone-country-step').hidden = true;
      modal.querySelector('#phone-number-step').hidden = false;
      modal.querySelector('#phone-selected-country').textContent = `${selectedCountry[0]} (${selectedCountry[1]})`;
      modal.querySelector('#phone-local-number').focus();
    });
    modal.querySelector('#phone-number-back').addEventListener('click', () => {
      modal.querySelector('#phone-number-step').hidden = true;
      modal.querySelector('#phone-country-step').hidden = false;
    });
    modal.querySelector('#phone-number-confirm').addEventListener('click', confirmNumber);
    modal.querySelector('#phone-local-number').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        confirmNumber();
      }
    });
  }

  function open(picker) {
    // Preenche e abre o seletor de telefone associado ao formulário.
    mountModal();
    activePicker = picker;
    const country = countries.find(([name]) => name === picker.country);
    const select = modal.querySelector('#phone-country-select');
    select.value = country ? country[0] : picker.country ? 'other' : '';
    modal.querySelector('#phone-custom-country').value = '';
    modal.querySelector('#phone-custom-calling-code').value = '';
    modal.querySelector('#phone-custom-country').value = country ? '' : picker.country;
    modal.querySelector('#phone-custom-country-fields').hidden = select.value !== 'other';
    modal.querySelector('#phone-country-continue').disabled = select.value === 'other' || !select.value;
    modal.querySelector('#phone-country-step').hidden = false;
    modal.querySelector('#phone-number-step').hidden = true;
    modal.querySelector('#phone-local-number').value = country && picker.number.startsWith(country[1])
      ? picker.number.slice(country[1].length)
      : picker.number.replace(/^\+/, '');
    modal.querySelector('#phone-modal-error').closest('.form-group').classList.remove('has-error');
    UI.openModal(modal);
  }

  function confirmNumber() {
    // Valida o número internacional e devolve-o ao campo de origem.
    if (!activePicker || !selectedCountry) return;
    const enteredNumber = modal.querySelector('#phone-local-number').value.trim();
    if (!/^[0-9() -]+$/.test(enteredNumber)) {
      modal.querySelector('#phone-modal-error').closest('.form-group').classList.add('has-error');
      return;
    }
    let nationalNumber = enteredNumber.replace(/\D/g, '');
    const callingCode = selectedCountry[1];
    if (!callingCode.startsWith('+1') && nationalNumber.startsWith('0')) {
      nationalNumber = nationalNumber.replace(/^0+/, '');
    }
    const internationalNumber = `${callingCode}${nationalNumber}`;
    if (!/^\+[1-9]\d{7,14}$/.test(internationalNumber)) {
      modal.querySelector('#phone-modal-error').closest('.form-group').classList.add('has-error');
      return;
    }
    activePicker.setValue(internationalNumber, selectedCountry[0]);
    UI.closeModal(modal);
  }

  function mount(container) {
    // Monta o botão de seleção e expõe operações para formulários.
    const picker = { number: '', country: '' };
    container.innerHTML = `
      <button type="button" id="${container.id}-trigger" class="phone-picker-trigger" aria-haspopup="dialog">Escolha o país e o número de telefone</button>
      <div class="form-error">Escolha um país e introduza um número de telefone válido.</div>
    `;
    const trigger = container.querySelector('button');
    const error = container.querySelector('.form-error');
    picker.setValue = (number, country) => {
      picker.number = number || '';
      picker.country = country || '';
      trigger.textContent = picker.number ? `${picker.number} · ${picker.country}` : 'Escolha o país e o número de telefone';
      container.classList.remove('has-error');
    };
    picker.setError = (hasError) => container.closest('.form-group').classList.toggle('has-error', hasError);
    picker.getValue = () => ({ phoneNumber: picker.number, country: picker.country });
    trigger.addEventListener('click', () => open(picker));
    error.id = `${container.id}-error`;
    trigger.setAttribute('aria-describedby', error.id);
    return picker;
  }

  function isValid(number) {
    // Confirma que o número corresponde ao formato internacional E.164.
    return /^\+[1-9]\d{7,14}$/.test(number);
  }

  return { mount, isValid };
})();

const CityInput = (() => {
  function mount(input) {
    // Monta autocomplete acessível e validação de cidades no campo recebido.
    const group = input.closest('.form-group');
    const error = group.querySelector('.form-error');
    const wrapper = document.createElement('div');
    const list = document.createElement('div');
    const status = document.createElement('div');
    const help = document.createElement('p');
    const listId = `${input.id}-suggestions`;
    const helpId = `${input.id}-city-help`;
    const errorId = error.id || `${input.id}-error`;
    let results = [];
    let highlightedIndex = -1;
    let selectedCity = '';
    let initialCity = input.value.trim();
    let modified = false;
    let requestNumber = 0;
    let searchTimer;

    wrapper.className = 'city-input-wrap';
    list.className = 'city-suggestions';
    list.id = listId;
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    status.className = 'city-input-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    help.className = 'form-hint city-input-help';
    help.id = helpId;
    help.innerHTML = 'Escreva pelo menos duas letras e selecione uma cidade válida. Dados geográficos: <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a>.';

    input.parentNode.insertBefore(wrapper, input);
    wrapper.append(input, list, status);
    input.autocomplete = 'off';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-describedby', `${helpId} ${errorId}`);
    error.id = errorId;
    group.appendChild(help);

    function closeList() {
      // Fecha sugestões e remove a indicação da opção ativa.
      // Fecha sugestões e limpa a opção ativa do leitor de ecrã.
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      highlightedIndex = -1;
    }

    function setStatus(message, isError = false) {
      // Atualiza a mensagem de estado acessível do campo.
      // Atualiza a mensagem acessível associada ao campo.
      status.textContent = message;
      status.classList.toggle('is-error', isError);
    }

    function choose(city) {
      // Confirma a sugestão selecionada e atualiza o campo.
      // Define a cidade escolhida e marca a seleção como válida.
      input.value = city.name;
      selectedCity = city.name;
      modified = true;
      results = [];
      closeList();
      setStatus(`Cidade confirmada: ${city.name}${city.region ? `, ${city.region}` : ''}, ${city.country}.`);
      group.classList.remove('has-error');
    }

    function highlight(index) {
      // Move a opção ativa pelas sugestões com as setas do teclado.
      // Move a seleção ativa pelas sugestões com o teclado.
      if (!results.length) return;
      highlightedIndex = (index + results.length) % results.length;
      const options = list.querySelectorAll('[role="option"]');
      options.forEach((option, optionIndex) => {
        option.setAttribute('aria-selected', String(optionIndex === highlightedIndex));
      });
      const activeOption = options[highlightedIndex];
      input.setAttribute('aria-activedescendant', activeOption.id);
      activeOption.scrollIntoView({ block: 'nearest' });
    }

    async function search(query, currentRequest) {
      // Obtém sugestões e descarta resultados de pesquisas já ultrapassadas.
      // Pesquisa cidades e ignora respostas antigas de pedidos anteriores.
      setStatus('A procurar cidades…');
      try {
        const cities = await API.searchCities(query);
        if (currentRequest !== requestNumber) return;
        results = Array.isArray(cities) ? cities : [];
        highlightedIndex = -1;
        if (!results.length) {
          closeList();
          setStatus('Não foram encontradas cidades com esse nome.');
          return;
        }

        list.innerHTML = results.map((city, index) => {
          const detail = [city.region, city.country].filter(Boolean).join(', ');
          return `<button type="button" class="city-suggestion" id="${listId}-option-${index}" role="option" aria-selected="false" data-city-index="${index}">
            <span class="city-suggestion-name">${UI.escapeHtml(city.name)}</span>
            <span class="city-suggestion-detail">${UI.escapeHtml(detail)}</span>
          </button>`;
        }).join('');
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        setStatus('Selecione a cidade e a região corretas.');
        list.querySelectorAll('.city-suggestion').forEach(option => {
          option.addEventListener('mousedown', event => event.preventDefault());
          option.addEventListener('click', () => choose(results[Number(option.dataset.cityIndex)]));
        });
      } catch (requestError) {
        if (currentRequest !== requestNumber) return;
        closeList();
        setStatus(requestError.message || 'Não foi possível procurar cidades. Tente novamente.', true);
      }
    }

    input.addEventListener('input', () => {
      modified = true;
      selectedCity = '';
      group.classList.remove('has-error');
      results = [];
      closeList();
      setStatus('');
      const query = input.value.trim();
      const currentRequest = ++requestNumber;
      window.clearTimeout(searchTimer);
      if (query.length < 2) return;
      searchTimer = window.setTimeout(() => search(query, currentRequest), 300);
    });

    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' && results.length) {
        event.preventDefault();
        highlight(highlightedIndex + 1);
      } else if (event.key === 'ArrowUp' && results.length) {
        event.preventDefault();
        highlight(highlightedIndex < 0 ? results.length - 1 : highlightedIndex - 1);
      } else if (event.key === 'Escape') {
        closeList();
      } else if (event.key === 'Enter' && (results.length || (modified && input.value.trim() !== selectedCity))) {
        event.preventDefault();
        if (results.length) choose(results[highlightedIndex < 0 ? 0 : highlightedIndex]);
        else setError('Aguarde pelas sugestões e selecione uma cidade válida.');
      }
    });

    input.addEventListener('blur', () => window.setTimeout(closeList, 120));

    function setError(message = 'Selecione uma cidade válida nas sugestões.') {
      // Apresenta o erro junto do campo e no estado acessível.
      // Apresenta o erro de validação do campo de cidade.
      error.textContent = message;
      group.classList.add('has-error');
      setStatus(message, true);
    }

    function isValid() {
      // Aceita apenas cidade inicial inalterada ou uma sugestão escolhida.
      // Aceita valor inicial inalterado ou uma sugestão explicitamente escolhida.
      const value = input.value.trim();
      const valid = value.length >= 2 && (
        (!modified && value === initialCity) ||
        (selectedCity && value === selectedCity)
      );
      if (!valid) setError('Selecione uma cidade válida nas sugestões.');
      else group.classList.remove('has-error');
      return Boolean(valid);
    }

    return {
      getValue: () => input.value.trim(),
      hasChanged: () => modified,
      isValid,
      setError,
      setValue(value) {
        initialCity = (value || '').trim();
        input.value = initialCity;
        selectedCity = '';
        modified = false;
        results = [];
        closeList();
        setStatus(initialCity ? 'Localização guardada. Selecione uma sugestão se alterar o nome.' : '');
        group.classList.remove('has-error');
      },
      reset() {
        this.setValue('');
      },
    };
  }

  return { mount };
})();

const Auth = (() => {
  let overlayEl = null;

  function mountModal() {
    // Cria a janela de autenticação e liga os seus formulários e controlos.
    if (document.getElementById('auth-modal-overlay')) {
      overlayEl = document.getElementById('auth-modal-overlay');
      return;
    }
    overlayEl = document.createElement('div');
    overlayEl.id = 'auth-modal-overlay';
    overlayEl.className = 'modal-overlay';
    overlayEl.innerHTML = `
      <div class="modal-box modal-md">
        <div class="modal-header">
          <h3><i class="fa-solid fa-calendar-days"></i> Bem-vindo ao EventHub</h3>
          <button class="modal-close" data-close-modal aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div class="auth-tabs">
            <button class="auth-tab-btn active" data-tab="login">Iniciar sessão</button>
            <button class="auth-tab-btn" data-tab="signup">Criar conta</button>
          </div>

          <div class="auth-panel active" id="login-panel">
            <form id="login-form" novalidate>
              <div class="form-group">
                <label class="form-label" for="login-email">E-mail <span class="req">*</span></label>
                <div class="input-icon-wrap">
                  <i class="fa-solid fa-envelope"></i>
                  <input type="email" id="login-email" class="form-input" placeholder="nome@exemplo.pt" autocomplete="email">
                </div>
                <div class="form-error">Introduza um endereço de e-mail válido.</div>
              </div>
              <div class="form-group">
                <label class="form-label" for="login-password">Palavra-passe <span class="req">*</span></label>
                <div class="input-icon-wrap">
                  <i class="fa-solid fa-lock"></i>
                  <input type="password" id="login-password" class="form-input" placeholder="••••••••" autocomplete="current-password">
                  <button type="button" class="toggle-visibility" data-target="login-password" aria-label="Mostrar palavra-passe"><i class="fa-solid fa-eye"></i></button>
                </div>
                <div class="form-error">A palavra-passe deve ter pelo menos 6 caracteres.</div>
              </div>
              <div class="form-group" style="display:flex; justify-content:space-between; align-items:center;">
                <label class="checkbox-row"><input type="checkbox" id="login-remember"> Manter sessão iniciada</label>
                <a href="#" style="font-size:0.82rem; color:var(--primary-color); font-weight:600;">Esqueceu-se da palavra-passe?</a>
              </div>
              <div class="alert alert-info" id="login-demo-hint">
                <i class="fa-solid fa-circle-info"></i>
                <span>Utilize a sua conta EventHub para iniciar sessão.</span>
              </div>
              <button type="submit" class="btn btn-primary btn-block btn-lg" id="login-submit-btn">Iniciar sessão</button>
            </form>
          </div>

          <div class="auth-panel" id="signup-panel">
            <form id="signup-form" novalidate>
              <div class="form-group">
                <label class="form-label">Escolha o seu tipo de conta <span class="req">*</span></label>
                <div class="role-choice-list">
                  <label class="role-choice">
                    <input type="radio" name="signup-role" value="attendee" checked>
                    <span><i class="fa-solid fa-ticket"></i><strong>Participante</strong><small>Participe em eventos e gira os seus bilhetes</small></span>
                  </label>
                  <label class="role-choice">
                    <input type="radio" name="signup-role" value="organizer">
                    <span><i class="fa-solid fa-calendar-plus"></i><strong>Organizador</strong><small>Crie eventos e construa a sua comunidade</small></span>
                  </label>
                  <label class="role-choice">
                    <input type="radio" name="signup-role" value="staff">
                    <span><i class="fa-solid fa-shield-halved"></i><strong>Equipa / Segurança</strong><small>Peça acesso aos eventos e valide bilhetes</small></span>
                  </label>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label" for="signup-name">Nome completo <span class="req">*</span></label>
                <div class="input-icon-wrap">
                  <i class="fa-solid fa-user"></i>
                  <input type="text" id="signup-name" class="form-input" placeholder="Nome e apelido" autocomplete="name">
                </div>
                <div class="form-error">Introduza o seu nome completo.</div>
              </div>
              <div class="form-group">
                <label class="form-label" for="signup-email">E-mail <span class="req">*</span></label>
                <div class="input-icon-wrap">
                  <i class="fa-solid fa-envelope"></i>
                  <input type="email" id="signup-email" class="form-input" placeholder="nome@exemplo.pt" autocomplete="email">
                </div>
                <div class="form-error">Introduza um endereço de e-mail válido.</div>
              </div>
              <div class="form-group">
                <label class="form-label" for="signup-phone-picker-trigger">Número de telefone e país <span class="req">*</span></label>
                <div id="signup-phone-picker"></div>
              </div>
              <div class="form-group">
                <label class="form-label" for="signup-city">Cidade <span class="req">*</span></label>
                <input type="text" id="signup-city" class="form-input" placeholder="Escreva para procurar" autocomplete="address-level2">
                <div class="form-error" id="signup-city-error">Escolha uma cidade válida nas sugestões.</div>
              </div>
              <div class="form-group">
                <label class="form-label" for="signup-password">Palavra-passe <span class="req">*</span></label>
                <div class="input-icon-wrap">
                  <i class="fa-solid fa-lock"></i>
                  <input type="password" id="signup-password" class="form-input" placeholder="Pelo menos 6 caracteres" autocomplete="new-password">
                  <button type="button" class="toggle-visibility" data-target="signup-password" aria-label="Mostrar palavra-passe"><i class="fa-solid fa-eye"></i></button>
                </div>
                <div class="form-error">A palavra-passe deve ter pelo menos 6 caracteres.</div>
              </div>
              <div class="form-group">
                <label class="form-label" for="signup-confirm">Confirmar palavra-passe <span class="req">*</span></label>
                <div class="input-icon-wrap">
                  <i class="fa-solid fa-lock"></i>
                  <input type="password" id="signup-confirm" class="form-input" placeholder="Repita a palavra-passe" autocomplete="new-password">
                  <button type="button" class="toggle-visibility" data-target="signup-confirm" aria-label="Mostrar palavra-passe"><i class="fa-solid fa-eye"></i></button>
                </div>
                <div class="form-error">As palavras-passe não coincidem.</div>
              </div>
              <button type="submit" class="btn btn-primary btn-block btn-lg" id="signup-submit-btn">Criar conta</button>
            </form>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlayEl);
    UI.bindOverlayClose(overlayEl);
    bindTabSwitch();
    bindPasswordToggles();
    bindLoginForm();
    bindSignupForm();
  }

  function bindTabSwitch() {
    // Liga separadores da janela aos respetivos painéis.
    overlayEl.querySelectorAll('.auth-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  function switchTab(tab) {
    // Ativa o painel de início de sessão ou de criação de conta.
    overlayEl.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    overlayEl.querySelector('#login-panel').classList.toggle('active', tab === 'login');
    overlayEl.querySelector('#signup-panel').classList.toggle('active', tab === 'signup');
  }

  function bindPasswordToggles() {
    // Liga controlos que alternam a visibilidade das palavras-passe.
    overlayEl.querySelectorAll('.toggle-visibility').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        const icon = btn.querySelector('i');
        if (input.type === 'password') { input.type = 'text'; icon.className = 'fa-solid fa-eye-slash'; }
        else { input.type = 'password'; icon.className = 'fa-solid fa-eye'; }
      });
    });
  }

  function setFieldError(inputEl, hasError) {
    // Marca visualmente o grupo de um campo como válido ou inválido.
    const group = inputEl.closest('.form-group');
    group.classList.toggle('has-error', hasError);
  }

  // Verifica o formato básico de um endereço de e-mail.
  function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

  function bindLoginForm() {
    // Valida e envia as credenciais do formulário de início de sessão.
    const form = overlayEl.querySelector('#login-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailEl = document.getElementById('login-email');
      const passEl = document.getElementById('login-password');
      const email = emailEl.value.trim();
      const password = passEl.value;

      let valid = true;
      if (!isValidEmail(email)) { setFieldError(emailEl, true); valid = false; } else setFieldError(emailEl, false);
      if (password.length < 6) { setFieldError(passEl, true); valid = false; } else setFieldError(passEl, false);
      if (!valid) return;

      const submitBtn = document.getElementById('login-submit-btn');
      setLoading(submitBtn, true, 'Iniciar sessão');

      try {
        const user = await API.login(email, password);
        setLoading(submitBtn, false, 'Iniciar sessão');
        UI.toast(`Bem-vindo de volta, ${user.name ? user.name.split(' ')[0] : 'Utilizador'}!`, 'success');
        closeModalAndRefresh(form);
      } catch (err) {
        setLoading(submitBtn, false, 'Iniciar sessão');
        UI.toast(err.message || 'E-mail ou palavra-passe inválidos.', 'error');
        setFieldError(passEl, true);
      }
    });
  }

  function bindSignupForm() {
    // Valida os dados da nova conta e envia o registo à API.
    const form = overlayEl.querySelector('#signup-form');
    const phonePicker = PhoneInput.mount(overlayEl.querySelector('#signup-phone-picker'));
    const cityInput = CityInput.mount(overlayEl.querySelector('#signup-city'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameEl = document.getElementById('signup-name');
      const emailEl = document.getElementById('signup-email');
      const passEl = document.getElementById('signup-password');
      const confirmEl = document.getElementById('signup-confirm');

      const name = nameEl.value.trim();
      const email = emailEl.value.trim();
      const { phoneNumber, country } = phonePicker.getValue();
      const city = cityInput.getValue();
      const password = passEl.value;
      const confirm = confirmEl.value;
      const role = form.querySelector('input[name="signup-role"]:checked').value;

      let valid = true;
      if (name.length < 2) { setFieldError(nameEl, true); valid = false; } else setFieldError(nameEl, false);
      if (!isValidEmail(email)) { setFieldError(emailEl, true); valid = false; } else setFieldError(emailEl, false);
      if (!PhoneInput.isValid(phoneNumber) || country.length < 2) { phonePicker.setError(true); valid = false; } else phonePicker.setError(false);
      if (!cityInput.isValid()) valid = false;
      if (password.length < 6) { setFieldError(passEl, true); valid = false; } else setFieldError(passEl, false);
      if (confirm !== password || confirm.length < 6) { setFieldError(confirmEl, true); valid = false; } else setFieldError(confirmEl, false);
      if (!valid) return;

      const submitBtn = document.getElementById('signup-submit-btn');
      setLoading(submitBtn, true, 'Criar conta');

      try {
        const user = await API.register(name, email, password, phoneNumber, country, city, role);
        UI.toast(`Conta criada! Bem-vindo, ${name.split(' ')[0]}.`, 'success');
        form.reset();
        cityInput.reset();
        UI.closeModal(overlayEl);
        if (typeof UI.renderNavbar === 'function') UI.renderNavbar();
        document.dispatchEvent(new CustomEvent('eh:auth-changed'));
        window.location.assign(user.role === 'organizer' ? UI.pageUrl('frontend/events/my-events.html') : user.role === 'staff' ? UI.pageUrl('frontend/staff/staff.html') : UI.pageUrl('frontend/events/events.html'));
      } catch (err) {
        setLoading(submitBtn, false, 'Criar conta');
        UI.toast(err.message || 'Ocorreu um erro ao criar a conta.', 'error');
        if (/phone|telefone/i.test(err.message || '')) phonePicker.setError(true);
        else if (/cidade|localização/i.test(err.message || '')) cityInput.setError(err.message);
        else setFieldError(emailEl, true);
      }
    });
  }

  function setLoading(btn, isLoading, label) {
    // Apresenta o estado de carregamento e evita envios repetidos.
    btn.disabled = isLoading;
    btn.innerHTML = isLoading ? `<span class="spinner"></span> Aguarde...` : label;
  }

  function closeModalAndRefresh(form) {
    // Fecha o formulário após autenticação e atualiza o estado da página.
    form.reset();
    UI.closeModal(overlayEl);
    if (typeof UI.renderNavbar === 'function') UI.renderNavbar();
    if (typeof UI.renderFooter === 'function') UI.renderFooter();
    document.dispatchEvent(new CustomEvent('eh:auth-changed'));
    
    // Aguarda meio segundo para que o Toast seja visível e depois atualiza a página
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }

  function openModal(tab = 'login') {
    // Abre a janela de autenticação no separador pedido.
    mountModal();
    switchTab(tab);
    overlayEl.querySelectorAll('.form-group').forEach(g => g.classList.remove('has-error'));
    UI.openModal(overlayEl);
  }

  async function requireAuth(message = 'Inicie sessão para continuar.') {
    // Exige sessão antes de continuar e abre a autenticação se necessário.
    const user = await API.getMe();
    if (!user) {
      UI.toast(message, 'warning');
      openModal('login');
      return null;
    }
    return user;
  }

  return { mountModal, openModal, requireAuth };
})();
