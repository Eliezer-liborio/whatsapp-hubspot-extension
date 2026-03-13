// popup.js

document.getElementById('exportBtn').addEventListener('click', () => {
  const statusMsg = document.getElementById('statusMsg');
  const btn = document.getElementById('exportBtn');
  
  btn.disabled = true;
  statusMsg.style.display = 'block';
  statusMsg.innerText = 'Processando...';

  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    const tab = tabs[0];
    
    if (!tab.url.includes("web.whatsapp.com")) {
      statusMsg.innerText = 'Abra o WhatsApp Web primeiro!';
      statusMsg.style.color = 'red';
      btn.disabled = false;
      return;
    }

    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      function: () => {
        // Lógica injetada no content script
        const btn = document.getElementById('hubspot-export-btn');
        if (btn) {
          btn.click();
          return true;
        } else {
          return false;
        }
      }
    }, (results) => {
      if (chrome.runtime.lastError || !results || !results[0].result) {
        statusMsg.innerText = 'Erro ao exportar ou botão não encontrado.';
        statusMsg.style.color = 'red';
      } else {
        statusMsg.innerText = 'Conversa exportada com sucesso!';
        statusMsg.style.color = 'green';
      }
      btn.disabled = false;
    });
  });
});
