// middleware.js
// Servidor Node.js para integração WhatsApp Web → HubSpot CRM
// Requer: npm install express axios cors dotenv

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());

// Permite requisições da extensão Chrome/Edge
app.use(cors({
  origin: '*', // Em produção, restrinja ao ID da extensão
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

const HUBSPOT_TOKEN = process.env.HUBSPOT_API_KEY;
const HUBSPOT_BASE  = 'https://api.hubapi.com';

// ─────────────────────────────────────────────
// Cabeçalho padrão para todas as chamadas
// ─────────────────────────────────────────────
const headers = () => ({
  'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
  'Content-Type': 'application/json'
});

// ─────────────────────────────────────────────
// 1. Buscar contato pelo telefone ou nome
// ─────────────────────────────────────────────
async function findContact(phone, name) {
  // Tenta primeiro pelo telefone
  if (phone) {
    const res = await axios.post(
      `${HUBSPOT_BASE}/crm/v3/objects/contacts/search`,
      {
        filterGroups: [{
          filters: [{
            propertyName: 'phone',
            operator: 'EQ',
            value: phone
          }]
        }],
        properties: ['firstname', 'lastname', 'phone', 'email']
      },
      { headers: headers() }
    );
    if (res.data.results?.length > 0) return res.data.results[0];
  }

  // Fallback: busca pelo primeiro nome
  if (name) {
    const firstName = name.split(' ')[0];
    const res = await axios.post(
      `${HUBSPOT_BASE}/crm/v3/objects/contacts/search`,
      {
        filterGroups: [{
          filters: [{
            propertyName: 'firstname',
            operator: 'CONTAINS_TOKEN',
            value: firstName
          }]
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

  let text = `📱 CONVERSA WHATSAPP\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `Cliente: ${contactName}\n`;
  text += `Exportado em: ${date}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  messages.forEach(msg => {
    const sender = msg.from === 'vendedor' ? '🧑‍💼 Vendedor' : '👤 Cliente';
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
        types: [{
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: 202  // nota → contato
        }]
      }]
    },
    { headers: headers() }
  );
  return res.data;
}

// ─────────────────────────────────────────────
// ENDPOINT PRINCIPAL
// POST /api/whatsapp-to-hubspot
// ─────────────────────────────────────────────
app.post('/api/whatsapp-to-hubspot', async (req, res) => {
  try {
    const { contactName, phone, messages } = req.body;

    // Validação básica
    if (!contactName || !messages || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos: envie contactName e messages.'
      });
    }

    console.log(`\n📥 Nova exportação recebida`);
    console.log(`   Contato : ${contactName}`);
    console.log(`   Telefone: ${phone || 'não informado'}`);
    console.log(`   Msgs    : ${messages.length}`);

    // Buscar contato no HubSpot
    const contact = await findContact(phone, contactName);

    if (!contact) {
      console.log(`   ❌ Contato não encontrado no HubSpot`);
      return res.status(404).json({
        success: false,
        error: `Contato "${contactName}" não encontrado no HubSpot. Verifique se o número ${phone} está cadastrado.`
      });
    }

    console.log(`   ✅ Contato encontrado: ID ${contact.id}`);

    // Formatar e salvar nota
    const noteBody = formatConversation(contactName, messages);
    const note     = await createNote(contact.id, noteBody);

    console.log(`   ✅ Nota criada: ID ${note.id}`);

    return res.json({
      success: true,
      message: `Conversa salva com sucesso na timeline de ${contactName}!`,
      contactId: contact.id,
      noteId: note.id
    });

  } catch (err) {
    console.error('Erro:', err.response?.data || err.message);

    // Erros específicos do HubSpot
    if (err.response?.status === 401) {
      return res.status(401).json({
        success: false,
        error: 'Token inválido ou expirado. Verifique o HUBSPOT_API_KEY no arquivo .env'
      });
    }
    if (err.response?.status === 403) {
      return res.status(403).json({
        success: false,
        error: 'Permissão negada. Verifique os escopos do Private App no HubSpot.'
      });
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
    message: tokenOk
      ? 'Middleware pronto para uso!'
      : '⚠️ Token não configurado. Verifique o arquivo .env'
  });
});

// ─────────────────────────────────────────────
// INICIAR SERVIDOR
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   WhatsApp → HubSpot Middleware      ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  console.log(`📡 Endpoint   : POST http://localhost:${PORT}/api/whatsapp-to-hubspot`);

  if (!HUBSPOT_TOKEN || !HUBSPOT_TOKEN.startsWith('pat-')) {
    console.log('\n⚠️  ATENÇÃO: Token HubSpot não configurado!');
    console.log('   Crie o arquivo .env com: HUBSPOT_API_KEY=pat-na1-...');
  } else {
    console.log('\n✅ Token HubSpot configurado com sucesso!');
  }
  console.log('\nAguardando requisições...\n');
});
