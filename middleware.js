// middleware.js
// Servidor Node.js para integracao WhatsApp Web com HubSpot CRM

require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));

const HUBSPOT_TOKEN = process.env.HUBSPOT_API_KEY;
const HUBSPOT_BASE  = 'https://api.hubapi.com';

const headers = () => ({
  'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
  'Content-Type': 'application/json'
});

// ─────────────────────────────────────────────
// 1. Buscar contato pelo telefone ou nome
// ─────────────────────────────────────────────
async function findContact(phone, name) {
  if (phone) {
    const res = await axios.post(
      `${HUBSPOT_BASE}/crm/v3/objects/contacts/search`,
      {
        filterGroups: [{
          filters: [{ propertyName: 'phone', operator: 'EQ', value: phone }]
        }],
        properties: ['firstname', 'lastname', 'phone', 'email']
      },
      { headers: headers() }
    );
    if (res.data.results?.length > 0) return res.data.results[0];
  }

  if (name) {
    const firstName = name.split(' ')[0];
    const res = await axios.post(
      `${HUBSPOT_BASE}/crm/v3/objects/contacts/search`,
      {
        filterGroups: [{
          filters: [{ propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: firstName }]
        }],
        properties: ['firstname', 'lastname', 'phone', 'email']
      },
      { headers: headers() }
    );
    if (res.data.results?.length > 0) return res.data.results[0];
  }

  return null;
}

// ─────────────────────────────────────────────
// 2. Formatar conversa como texto estruturado
// ─────────────────────────────────────────────
function formatConversation(contactName, messages) {
  const date = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  let text = `CONVERSA WHATSAPP\n`;
  text += `----------------------------------\n`;
  text += `Cliente: ${contactName}\n`;
  text += `Exportado em: ${date}\n`;
  text += `----------------------------------\n\n`;

  messages.forEach(msg => {
    const sender = msg.from === 'vendedor' ? 'Vendedor' : 'Cliente';
    const time   = msg.time ? `[${msg.time}]` : '';
    text += `${time} ${sender}:\n${msg.text}\n\n`;
  });

  return text;
}

// ─────────────────────────────────────────────
// 3. Criar nota na timeline do contato
// ─────────────────────────────────────────────
async function createNote(contactId, noteBody) {
  const res = await axios.post(
    `${HUBSPOT_BASE}/crm/v3/objects/notes`,
    {
      properties: {
        hs_note_body: noteBody,
        hs_timestamp: Date.now()
      },
      associations: [{
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
      }]
    },
    { headers: headers() }
  );
  return res.data;
}

// ─────────────────────────────────────────────
// ENDPOINT PRINCIPAL
// ─────────────────────────────────────────────
app.post('/api/whatsapp-to-hubspot', async (req, res) => {
  try {
    const { contactName, phone, messages } = req.body;

    if (!contactName || !messages || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'Dados invalidos: envie contactName e messages.' });
    }

    console.log('Nova exportacao recebida');
    console.log('  Contato : ' + contactName);
    console.log('  Telefone: ' + (phone || 'nao informado'));
    console.log('  Msgs    : ' + messages.length);

    const contact = await findContact(phone, contactName);

    if (!contact) {
      console.log('  Contato nao encontrado no HubSpot');
      return res.status(404).json({
        success: false,
        error: `Contato "${contactName}" nao encontrado no HubSpot. Verifique se o numero ${phone} esta cadastrado.`
      });
    }

    console.log('  Contato encontrado: ID ' + contact.id);

    const noteBody = formatConversation(contactName, messages);
    const note     = await createNote(contact.id, noteBody);

    console.log('  Nota criada: ID ' + note.id);

    return res.json({
      success: true,
      message: `Conversa salva com sucesso na timeline de ${contactName}!`,
      contactId: contact.id,
      noteId: note.id
    });

  } catch (err) {
    console.error('Erro: ' + (err.response?.data?.message || err.message));

    if (err.response?.status === 401) {
      return res.status(401).json({ success: false, error: 'Token invalido ou expirado. Verifique o arquivo .env' });
    }
    if (err.response?.status === 403) {
      return res.status(403).json({ success: false, error: 'Permissao negada. Verifique os escopos do Private App no HubSpot.' });
    }

    return res.status(500).json({
      success: false,
      error: 'Erro interno ao processar a conversa.',
      details: err.response?.data?.message || err.message
    });
  }
});

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  const tokenOk = !!HUBSPOT_TOKEN && HUBSPOT_TOKEN.startsWith('pat-');
  res.json({
    status: 'OK',
    token_configured: tokenOk,
    message: tokenOk ? 'Middleware pronto para uso!' : 'Token nao configurado. Verifique o arquivo .env'
  });
});

// ─────────────────────────────────────────────
// INICIAR SERVIDOR
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('==========================================');
  console.log('  WhatsApp para HubSpot CRM - Middleware');
  console.log('==========================================');
  console.log('');
  console.log('Servidor rodando em http://localhost:' + PORT);
  console.log('Health check : http://localhost:' + PORT + '/health');
  console.log('Endpoint     : POST http://localhost:' + PORT + '/api/whatsapp-to-hubspot');

  if (!HUBSPOT_TOKEN || !HUBSPOT_TOKEN.startsWith('pat-')) {
    console.log('');
    console.log('ATENCAO: Token HubSpot nao configurado!');
    console.log('Edite o arquivo .env e adicione seu token.');
  } else {
    console.log('');
    console.log('Token HubSpot configurado com sucesso!');
  }
  console.log('');
  console.log('Aguardando requisicoes...');
  console.log('');
});
