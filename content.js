// content.js — WhatsApp para HubSpot CRM
// Botão fixo no topo direito da conversa — funciona no WhatsApp pessoal e Business

const MIDDLEWARE_URL = 'http://localhost:3000/api/whatsapp-to-hubspot';
const BTN_ID = 'hubspot-save-btn';

// ─────────────────────────────────────────────
// Cria o botão fixo assim que a página carregar
// ─────────────────────────────────────────────
function createFixedButton() {
  if (document.getElementById(BTN_ID)) return;

  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.title = 'Salvar conversa no HubSpot CRM';

  // Ícone SVG HubSpot (sprocket)
  const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><polyline points="16 16 12 12 8 16"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path></svg>`;

  btn.innerHTML = svgIcon + '<span id="hubspot-btn-text">Salvar no HubSpot</span>';

  // Estilo: fixo no topo direito, acima do header do WhatsApp
  btn.style.cssText = `
    position: fixed;
    top: 12px;
    right: 80px;
    z-index: 99999;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background-color: #FF7A59;
    color: #ffffff;
    border: none;
    border-radius: 20px;
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 700;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 3px 10px rgba(0,0,0,0.30);
    letter-spacing: 0.2px;
    transition: background-color 0.2s, transform 0.15s, box-shadow 0.2s;
    user-select: none;
  `;

  // Hover
  btn.addEventListener('mouseenter', () => {
    btn.style.backgroundColor = '#e8623a';
    btn.style.transform = 'scale(1.05)';
    btn.style.boxShadow = '0 5px 16px rgba(0,0,0,0.35)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.backgroundColor = currentColor;
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 3px 10px rgba(0,0,0,0.30)';
  });

  btn.addEventListener('click', handleSave);

  document.body.appendChild(btn);
}

let currentColor = '#FF7A59';

// ─────────────────────────────────────────────
// Captura nome e telefone do contato
// ─────────────────────────────────────────────
function getContactInfo() {
  const nameSelectors = [
    'span[data-testid="conversation-info-header-chat-title"]',
    'div[data-testid="conversation-header"] span[dir="auto"]',
    'header span[dir="auto"]',
    '#main header span[dir="auto"]',
    'div._amid span[dir="auto"]',
  ];

  let name = null;
  for (const sel of nameSelectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim()) {
      name = el.innerText.trim();
      break;
    }
  }

  const subtitleEl = document.querySelector(
    'span[data-testid="conversation-info-header-subtitle"], header span[title]'
  );
  let phone = subtitleEl ? subtitleEl.innerText.replace(/\s/g, '') : null;

  if (!phone && name && /^\+?[\d\s\-().]+$/.test(name)) {
    phone = name.replace(/\D/g, '');
  }

  return { name: name || 'Desconhecido', phone };
}

// ─────────────────────────────────────────────
// Captura mensagens da conversa
// ─────────────────────────────────────────────
function getMessages() {
  const messages = [];

  const msgElements = document.querySelectorAll(
    'div[data-testid="msg-container"], div.message-in, div.message-out'
  );

  msgElements.forEach(el => {
    const textEl =
      el.querySelector('span[data-testid="msg-text"]') ||
      el.querySelector('span.selectable-text') ||
      el.querySelector('.copyable-text span');

    const timeEl = el.querySelector("span[data-testid='msg-time']");
    const isOut = el.classList.contains('message-out');

    if (textEl && textEl.innerText.trim()) {
      messages.push({
        text: textEl.innerText.trim(),
        time: timeEl ? timeEl.innerText.trim() : '',
        from: isOut ? 'vendedor' : 'cliente',
      });
    }
  });

  return messages;
}

// ─────────────────────────────────────────────
// Ação do botão
// ─────────────────────────────────────────────
async function handleSave() {
  const btn = document.getElementById(BTN_ID);
  const btnText = document.getElementById('hubspot-btn-text');
  if (!btn || !btnText) return;

  const { name, phone } = getContactInfo();
  const messages = getMessages();

  if (messages.length === 0) {
    showToast('Abra uma conversa antes de salvar.', 'error');
    return;
  }

  // Estado: carregando
  btnText.innerText = 'Salvando...';
  btn.disabled = true;
  currentColor = '#aaaaaa';
  btn.style.backgroundColor = currentColor;
  btn.style.cursor = 'not-allowed';

  try {
    const res = await fetch(MIDDLEWARE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactName: name, phone, messages }),
    });

    const data = await res.json();

    if (data.success) {
      showToast('Conversa salva no HubSpot!', 'success');
      btnText.innerText = 'Salvo!';
      currentColor = '#25D366';
      btn.style.backgroundColor = currentColor;
      setTimeout(() => {
        btnText.innerText = 'Salvar no HubSpot';
        currentColor = '#FF7A59';
        btn.style.backgroundColor = currentColor;
        btn.disabled = false;
        btn.style.cursor = 'pointer';
      }, 3000);
    } else {
      showToast(data.error || 'Erro ao salvar.', 'error');
      reset(btn, btnText);
    }
  } catch (err) {
    showToast('Middleware offline. Inicie o servidor Node.js.', 'error');
    reset(btn, btnText);
  }
}

function reset(btn, btnText) {
  btnText.innerText = 'Salvar no HubSpot';
  currentColor = '#FF7A59';
  btn.style.backgroundColor = currentColor;
  btn.disabled = false;
  btn.style.cursor = 'pointer';
}

// ─────────────────────────────────────────────
// Toast de notificação
// ─────────────────────────────────────────────
function showToast(message, type = 'success') {
  const existing = document.getElementById('hubspot-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'hubspot-toast';
  toast.innerText = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    background-color: ${type === 'success' ? '#25D366' : '#e53935'};
    color: white;
    padding: 12px 28px;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    z-index: 999999;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    opacity: 1;
    transition: opacity 0.4s;
    max-width: 440px;
    text-align: center;
  `;

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// ─────────────────────────────────────────────
// Inicialização
// ─────────────────────────────────────────────
// Cria o botão imediatamente
createFixedButton();

// Garante que o botão persiste mesmo com re-renders do WhatsApp
const observer = new MutationObserver(() => {
  if (!document.getElementById(BTN_ID)) {
    createFixedButton();
  }
});
observer.observe(document.body, { childList: true, subtree: false });
