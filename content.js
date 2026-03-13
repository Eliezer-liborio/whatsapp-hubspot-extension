// content.js
// Script injetado no WhatsApp Web para capturar conversas e enviar ao HubSpot

const MIDDLEWARE_URL = 'http://localhost:3000/api/whatsapp-to-hubspot';

// ─────────────────────────────────────────────
// Adiciona botão "Salvar no HubSpot" ao header
// ─────────────────────────────────────────────
function addExportButton() {
  const header = document.querySelector('header');
  if (!header || document.getElementById('hubspot-export-btn')) return;

  const btn = document.createElement('button');
  btn.id        = 'hubspot-export-btn';
  btn.innerHTML = '📤 Salvar no HubSpot';
  btn.className = 'hubspot-btn';
  btn.title     = 'Exportar conversa para a timeline do HubSpot CRM';

  btn.onclick = async () => {
    const data = extractConversation();

    if (!data || data.messages.length === 0) {
      showToast('⚠️ Nenhuma mensagem encontrada nesta conversa.', 'warning');
      return;
    }

    btn.disabled  = true;
    btn.innerHTML = '⏳ Enviando...';

    try {
      const response = await fetch(MIDDLEWARE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (result.success) {
        showToast(`✅ ${result.message}`, 'success');
        btn.innerHTML = '✅ Salvo!';
        setTimeout(() => { btn.innerHTML = '📤 Salvar no HubSpot'; btn.disabled = false; }, 3000);
      } else {
        showToast(`❌ ${result.error}`, 'error');
        btn.innerHTML = '📤 Salvar no HubSpot';
        btn.disabled  = false;
      }
    } catch (err) {
      showToast('❌ Middleware offline. Inicie o servidor Node.js.', 'error');
      console.error('[HubSpot Extension] Erro ao conectar ao middleware:', err);
      btn.innerHTML = '📤 Salvar no HubSpot';
      btn.disabled  = false;
    }
  };

  header.appendChild(btn);
}

// ─────────────────────────────────────────────
// Extrai dados da conversa aberta
// ─────────────────────────────────────────────
function extractConversation() {
  const messages = [];

  // Seletores baseados em data-testid (mais estáveis)
  const msgElements = document.querySelectorAll(
    'div[data-testid="msg-container"], div.message-in, div.message-out'
  );

  msgElements.forEach(msg => {
    // Texto da mensagem
    const textEl = msg.querySelector(
      'span.selectable-text, [data-testid="conversation-compose-box-input"], .copyable-text span'
    );
    const text = textEl ? textEl.innerText.trim() : '';

    // Horário
    const timeEl = msg.querySelector("span[data-testid='msg-time']");
    const time   = timeEl ? timeEl.innerText.trim() : '';

    // Remetente
    const from = msg.classList.contains('message-out') ? 'vendedor' : 'cliente';

    if (text) {
      messages.push({ from, text, time });
    }
  });

  // Nome do contato no header
  const nameEl = document.querySelector(
    'header span[data-testid="conversation-info-header-chat-title"], header span[dir="auto"]'
  );
  const contactName = nameEl ? nameEl.innerText.trim() : 'Desconhecido';

  // Tenta extrair número do subtítulo do header
  const subtitleEl = document.querySelector(
    'header span[data-testid="conversation-info-header-subtitle"]'
  );
  const phone = subtitleEl ? subtitleEl.innerText.replace(/\s/g, '') : '';

  return { contactName, phone, messages };
}

// ─────────────────────────────────────────────
// Toast de notificação visual
// ─────────────────────────────────────────────
function showToast(message, type = 'info') {
  const existing = document.getElementById('hubspot-toast');
  if (existing) existing.remove();

  const colors = {
    success: '#25D366',
    error:   '#e74c3c',
    warning: '#f39c12',
    info:    '#3498db'
  };

  const toast = document.createElement('div');
  toast.id = 'hubspot-toast';
  toast.innerText = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    background: ${colors[type] || colors.info};
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: bold;
    z-index: 99999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transition: opacity 0.5s;
  `;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 4000);
}

// ─────────────────────────────────────────────
// Observer: detecta abertura de conversas
// ─────────────────────────────────────────────
const observer = new MutationObserver(() => {
  addExportButton();
});

observer.observe(document.body, { childList: true, subtree: true });

// Tenta adicionar na carga inicial
setTimeout(addExportButton, 2000);
