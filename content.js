// content.js — WhatsApp para HubSpot CRM
// Botão fixo no topo direito — funciona no WhatsApp pessoal e Business

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

  const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><polyline points="16 16 12 12 8 16"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path></svg>`;

  btn.innerHTML = svgIcon + '<span id="hubspot-btn-text">Salvar no HubSpot</span>';

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
// Verifica se uma string é um número de telefone válido
// ─────────────────────────────────────────────
function isValidPhone(str) {
  if (!str) return false;
  // Remove tudo que não é dígito ou +
  const cleaned = str.replace(/[^\d+]/g, '');
  // Telefone válido: começa com + ou tem entre 8 e 15 dígitos
  return /^\+?\d{8,15}$/.test(cleaned);
}

function cleanPhone(str) {
  return str.replace(/[^\d+]/g, '');
}

// ─────────────────────────────────────────────
// Captura nome e telefone do contato
// ─────────────────────────────────────────────
function getContactInfo() {
  // ── Captura o NOME ──
  // Tenta vários seletores usados pelo WhatsApp pessoal e Business
  const nameSelectors = [
    // WhatsApp Business
    'span[data-testid="conversation-info-header-chat-title"]',
    // WhatsApp pessoal (header da conversa)
    '#main header span[dir="auto"]:first-of-type',
    '#main header div[data-testid="conversation-info-header"] span[dir="auto"]',
    // Genérico
    'header span[dir="auto"]',
    'div[data-testid="conversation-header"] span[dir="auto"]',
  ];

  let name = null;
  for (const sel of nameSelectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      const txt = el.innerText.trim();
      // Ignora textos muito curtos, status ("online", "digitando...") e vazios
      if (txt && txt.length > 1 && !['online', 'offline', 'digitando...', 'gravando áudio...'].includes(txt.toLowerCase())) {
        name = txt;
        break;
      }
    }
    if (name) break;
  }

  // ── Captura o TELEFONE ──
  // Estratégia 1: subtítulo do header (ex: "+55 11 99999-9999")
  const subtitleSelectors = [
    'span[data-testid="conversation-info-header-subtitle"]',
    '#main header span[dir="auto"]:nth-of-type(2)',
    'header span[title]',
    'div[data-testid="conversation-info-header"] span:nth-child(2)',
  ];

  let phone = null;
  for (const sel of subtitleSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const txt = el.innerText.trim();
      if (isValidPhone(txt)) {
        phone = cleanPhone(txt);
        break;
      }
    }
  }

  // Estratégia 2: se o próprio nome é um número (contato sem nome salvo)
  if (!phone && name && isValidPhone(name)) {
    phone = cleanPhone(name);
  }

  // Estratégia 3: buscar número no título da página
  if (!phone) {
    const titleMatch = document.title.match(/\+?[\d\s\-().]{10,}/);
    if (titleMatch && isValidPhone(titleMatch[0])) {
      phone = cleanPhone(titleMatch[0]);
    }
  }

  // Estratégia 4: buscar na URL atual (WhatsApp às vezes coloca o número na URL)
  if (!phone) {
    const urlMatch = window.location.href.match(/phone=(\+?[\d]+)/);
    if (urlMatch) phone = urlMatch[1];
  }

  return { name: name || 'Desconhecido', phone };
}

// ─────────────────────────────────────────────
// Captura mensagens da conversa
// ─────────────────────────────────────────────
function getMessages() {
  const messages = [];

  // Tenta múltiplos seletores para compatibilidade
  const msgSelectors = [
    'div[data-testid="msg-container"]',
    'div.message-in',
    'div.message-out',
    'div[class*="message-"]',
  ];

  let msgElements = [];
  for (const sel of msgSelectors) {
    const found = document.querySelectorAll(sel);
    if (found.length > 0) {
      msgElements = [...found];
      break;
    }
  }

  // Fallback: busca por copyable-text (presente em todas as versões)
  if (msgElements.length === 0) {
    const copyables = document.querySelectorAll('[data-pre-plain-text]');
    copyables.forEach(el => {
      const preText = el.getAttribute('data-pre-plain-text') || '';
      const timeMatch = preText.match(/\[(\d{2}:\d{2})/);
      const time = timeMatch ? timeMatch[1] : '';
      const textEl = el.querySelector('span.selectable-text') || el;
      const txt = textEl.innerText.trim();
      if (txt) {
        messages.push({ text: txt, time, from: 'desconhecido' });
      }
    });
    return messages;
  }

  msgElements.forEach(el => {
    const textEl =
      el.querySelector('span[data-testid="msg-text"]') ||
      el.querySelector('span.selectable-text') ||
      el.querySelector('.copyable-text span');

    const timeEl =
      el.querySelector("span[data-testid='msg-time']") ||
      el.querySelector('span.x1c4vz4f') ||
      el.querySelector('span[class*="time"]');

    const isOut =
      el.classList.contains('message-out') ||
      el.getAttribute('data-testid') === 'msg-container-out' ||
      !!el.closest('div[class*="out"]');

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
createFixedButton();

const observer = new MutationObserver(() => {
  if (!document.getElementById(BTN_ID)) {
    createFixedButton();
  }
});
observer.observe(document.body, { childList: true, subtree: false });
