// content.js — WhatsApp para HubSpot CRM
// Injeta botão no header da conversa, ao lado dos ícones nativos

const MIDDLEWARE_URL = 'http://localhost:3000/api/whatsapp-to-hubspot';
const BTN_ID = 'hubspot-save-btn';

// ─────────────────────────────────────────────
// Observer: detecta abertura/troca de conversa
// ─────────────────────────────────────────────
const observer = new MutationObserver(() => {
  injectButton();
});
observer.observe(document.body, { childList: true, subtree: true });
setTimeout(injectButton, 2000);

// ─────────────────────────────────────────────
// Injeta o botão no header da conversa
// ─────────────────────────────────────────────
function injectButton() {
  if (document.getElementById(BTN_ID)) return;

  // Tenta encontrar o container de ícones do header (lado direito)
  const iconContainerSelectors = [
    'div[data-testid="conversation-header-utils"]',
    'header div._amid',
    '#main header > div > div:last-child',
    '#main header > div:last-child',
  ];

  let iconContainer = null;
  for (const sel of iconContainerSelectors) {
    iconContainer = document.querySelector(sel);
    if (iconContainer) break;
  }

  // Fallback: usa o próprio header
  if (!iconContainer) {
    const header = document.querySelector('#main header') || document.querySelector('header');
    if (!header) return;
    iconContainer = header;
  }

  // Cria o botão
  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.title = 'Salvar conversa no HubSpot CRM';
  btn.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background-color: #FF7A59;
    color: #ffffff;
    border: none;
    border-radius: 20px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    margin: 0 8px;
    white-space: nowrap;
    transition: background-color 0.2s, transform 0.1s;
    box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    letter-spacing: 0.2px;
    vertical-align: middle;
    line-height: 1;
  `;

  // Ícone SVG de upload
  const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path></svg>`;
  btn.innerHTML = svgIcon + ' Salvar no HubSpot';

  // Hover
  btn.addEventListener('mouseenter', () => {
    btn.style.backgroundColor = '#e8623a';
    btn.style.transform = 'scale(1.04)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.backgroundColor = '#FF7A59';
    btn.style.transform = 'scale(1)';
  });

  // Clique
  btn.addEventListener('click', handleSave);

  // Insere no início do container de ícones (lado esquerdo dos ícones nativos)
  iconContainer.insertBefore(btn, iconContainer.firstChild);
}

// ─────────────────────────────────────────────
// Captura nome e telefone do contato
// ─────────────────────────────────────────────
function getContactInfo() {
  const nameSelectors = [
    'header span[data-testid="conversation-info-header-chat-title"]',
    'header span[dir="auto"]',
    '#main header span[dir="auto"]',
  ];

  let name = null;
  for (const sel of nameSelectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim()) {
      name = el.innerText.trim();
      break;
    }
  }

  // Tenta extrair telefone do subtítulo
  const subtitleEl = document.querySelector(
    'header span[data-testid="conversation-info-header-subtitle"]'
  );
  let phone = subtitleEl ? subtitleEl.innerText.replace(/\s/g, '') : null;

  // Se o próprio nome for um número de telefone
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
  if (!btn) return;

  const { name, phone } = getContactInfo();
  const messages = getMessages();

  if (messages.length === 0) {
    showToast('Nenhuma mensagem encontrada nesta conversa.', 'error');
    return;
  }

  // Estado de carregamento
  const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path></svg>`;

  btn.innerHTML = 'Salvando...';
  btn.disabled = true;
  btn.style.backgroundColor = '#aaa';
  btn.style.cursor = 'not-allowed';

  try {
    const res = await fetch(MIDDLEWARE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactName: name, phone, messages }),
    });

    const data = await res.json();

    if (data.success) {
      showToast('Conversa salva no HubSpot com sucesso!', 'success');
      btn.innerHTML = svgIcon + ' Salvo!';
      btn.style.backgroundColor = '#25D366';
      setTimeout(() => {
        btn.innerHTML = svgIcon + ' Salvar no HubSpot';
        btn.style.backgroundColor = '#FF7A59';
        btn.disabled = false;
        btn.style.cursor = 'pointer';
      }, 3000);
    } else {
      showToast(data.error || 'Erro ao salvar a conversa.', 'error');
      btn.innerHTML = svgIcon + ' Salvar no HubSpot';
      btn.style.backgroundColor = '#FF7A59';
      btn.disabled = false;
      btn.style.cursor = 'pointer';
    }
  } catch (err) {
    showToast('Middleware offline. Inicie o servidor Node.js.', 'error');
    btn.innerHTML = svgIcon + ' Salvar no HubSpot';
    btn.style.backgroundColor = '#FF7A59';
    btn.disabled = false;
    btn.style.cursor = 'pointer';
  }
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
    font-family: inherit;
    z-index: 99999;
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
