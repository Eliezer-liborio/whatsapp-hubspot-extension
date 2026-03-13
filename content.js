// content.js

// Adiciona botão "Salvar conversa no CRM" ao lado do nome do contato
function addExportButton() {
  const header = document.querySelector('header');
  if (!header || document.getElementById('hubspot-export-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'hubspot-export-btn';
  btn.innerText = '📤 Salvar no HubSpot';
  btn.className = 'hubspot-btn';
  
  btn.onclick = () => {
    const data = extractConversation();
    if (data) {
      chrome.runtime.sendMessage({ action: "exportToHubSpot", data: data }, response => {
        if (response.success) {
          alert("Conversa exportada com sucesso para o HubSpot!");
        } else {
          alert("Erro ao exportar conversa.");
        }
      });
    } else {
      alert("Nenhuma conversa encontrada.");
    }
  };

  header.appendChild(btn);
}

// Extrai as mensagens da tela atual
function extractConversation() {
  const messages = [];
  
  // Usando data-testid selectors como recomendado
  const msgElements = document.querySelectorAll("div.message-in, div.message-out");
  
  if (msgElements.length === 0) return null;

  msgElements.forEach(msg => {
    const textElement = msg.querySelector(".selectable-text");
    const text = textElement ? textElement.innerText : "";
    
    const timeElement = msg.querySelector("span[data-testid='msg-time']");
    const time = timeElement ? timeElement.innerText : "";

    const from = msg.classList.contains("message-out") ? "vendedor" : "cliente";

    if (text) {
      messages.push({ from, text, time });
    }
  });

  // Tentar pegar o nome/telefone do contato
  const contactNameElement = document.querySelector('header span[dir="auto"]');
  const contactName = contactNameElement ? contactNameElement.innerText : "Desconhecido";

  return {
    contactName,
    messages
  };
}

// Observa mudanças no DOM para adicionar o botão quando abrir um chat
const observer = new MutationObserver(() => {
  addExportButton();
});

observer.observe(document.body, { childList: true, subtree: true });
