// Guarda o evento autorizado e controla a leitura para evitar validar duas vezes.
let activeStaffEventId = null;
let ticketScanner = null;
let processingTicket = false;

document.addEventListener('DOMContentLoaded', async () => {
  await DB.init();
  const session = await Auth.requireAuth('Inicie sessão com uma conta da equipa para validar bilhetes.');
  if (!session) {
    window.location.replace(UI.pageUrl('frontend/events/events.html'));
    return;
  }
  if (session.role !== 'staff') {
    window.location.replace(session.role === 'organizer' ? UI.pageUrl('frontend/events/my-events.html') : UI.pageUrl('frontend/events/events.html'));
    return;
  }

  activeStaffEventId = new URLSearchParams(window.location.search).get('event_id');
  if (!activeStaffEventId) {
    UI.toast('Escolha um evento antes de iniciar a validação.', 'error');
    window.location.replace(UI.pageUrl('frontend/staff/staff.html'));
    return;
  }
  try {
    const [affiliations, event] = await Promise.all([
      API.getMyStaffEvents(),
      API.getEventById(activeStaffEventId),
    ]);
    const affiliation = affiliations.find(item =>
      String(item.eventId) === String(activeStaffEventId) && item.status === 'approved'
    );
    if (!affiliation) throw new Error('Não tem autorização para validar bilhetes neste evento.');
    if (event.status === 'cancelled') throw new Error('Este evento foi cancelado; a validação está indisponível.');
    document.getElementById('checkin-event-title').textContent = event.title;
    document.getElementById('checkin-event-details').textContent =
      `${UI.formatDate(event.date)} · ${UI.formatTime(event.time)} · ${event.location}`;
    document.getElementById('start-scanner-btn').disabled = false;
    document.getElementById('start-scanner-btn').addEventListener('click', startTicketScanner);
    document.getElementById('scan-next-btn').addEventListener('click', resumeTicketScanner);
  } catch (error) {
    UI.toast(error.message || 'Não foi possível confirmar o seu acesso ao evento.', 'error');
    setTimeout(() => window.location.replace(UI.pageUrl('frontend/staff/staff.html')), 900);
  }
});

async function startTicketScanner() {
  // Confirma que o navegador pode usar a câmara e inicia o leitor QR.
  const message = document.getElementById('scanner-message');
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    message.textContent = 'A leitura pela câmara requer uma ligação HTTPS segura (ou localhost).';
    return;
  }
  if (typeof Html5Qrcode !== 'function') {
    message.textContent = 'Não foi possível carregar o leitor de códigos QR. Verifique a ligação e recarregue a página.';
    return;
  }
  const button = document.getElementById('start-scanner-btn');
  button.disabled = true;
  message.textContent = 'A iniciar a câmara…';
  try {
    ticketScanner = new Html5Qrcode('ticket-qr-reader');
    await ticketScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
      handleScannedTicket,
      () => {}
    );
    message.textContent = 'Aponte a câmara para o código QR do bilhete.';
  } catch (error) {
    ticketScanner = null;
    button.disabled = false;
    message.textContent = error.message || 'Não foi possível iniciar a câmara. Verifique as permissões do navegador e tente novamente.';
  }
}

async function handleScannedTicket(decodedText) {
  // Pausa leituras simultâneas e pede ao backend a validação do bilhete.
  if (processingTicket) return;
  processingTicket = true;
  try {
    await ticketScanner.pause(true);
    const result = await API.verifyTicketEntry(activeStaffEventId, decodedText);
    showCheckinFeedback(
      true,
      'Entrada autorizada',
      `${result.attendeeName} tem a entrada validada em «${result.eventTitle}».`
    );
  } catch (error) {
    showCheckinFeedback(false, 'Entrada recusada', error.message || 'Não foi possível validar este bilhete.');
  }
}

function showCheckinFeedback(success, title, message) {
  // Apresenta o resultado da validação e prepara a ação de continuação.
  const overlay = document.getElementById('checkin-feedback');
  overlay.classList.toggle('is-success', success);
  overlay.classList.toggle('is-error', !success);
  document.getElementById('checkin-feedback-icon').className =
    `checkin-feedback-icon fa-solid ${success ? 'fa-circle-check' : 'fa-circle-xmark'}`;
  document.getElementById('checkin-feedback-title').textContent = title;
  document.getElementById('checkin-feedback-message').textContent = message;
  document.getElementById('scan-next-btn').className = `btn btn-lg ${success ? 'btn-primary' : 'btn-danger'}`;
  overlay.hidden = false;
}

function resumeTicketScanner() {
  // Fecha o resultado anterior e retoma a leitura do próximo bilhete.
  document.getElementById('checkin-feedback').hidden = true;
  processingTicket = false;
  if (ticketScanner) {
    ticketScanner.resume();
    document.getElementById('scanner-message').textContent = 'Aponte a câmara para o próximo código QR.';
  }
}
