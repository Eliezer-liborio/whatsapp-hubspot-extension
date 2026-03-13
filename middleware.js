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
// Gera todas as variantes de formato de telefone
// Ex: 5566996215988 → ["5566996215988", "+5566996215988",
//     "+55-66-99621-5988", "66996215988", "996215988"]
// ─────────────────────────────────────────────
function phoneVariants(phone) {
  if (!phone) return [];
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return [];

  const variants = new Set();

  // Somente digitos
  variants.add(digits);

  // Com + na frente
  variants.add('+' + digits);

  // Formato com hifens: +55-DDD-NNNNN-NNNN
  if (digits.length === 13) {
    // +55 + 2 DDD + 9 celular
    const fmt = `+${digits.slice(0,2)}-${digits.slice(2,4)}-${digits.slice(4,9)}-${digits.slice(9)}`;
    variants.add(fmt);
    // Sem o 9 inicial do celular (8 digitos)
    const fmt2 = `+${digits.slice(0,2)}-${digits.slice(2,4)}-${digits.slice(4,8)}-${digits.slice(8)}`;
    variants.add(fmt2);
  }
  if (digits.length === 12) {
    // +55 + 2 DDD + 8 fixo
    const fmt = `+${digits.slice(0,2)}-${digits.slice(2,4)}-${digits.slice(4,8)}-${digits.slice(8)}`;
    variants.add(fmt);
  }

  // Sem o codigo do pais (55)
  if (digits.startsWith('55') && digits.length >= 10) {
    const sem55 = digits.slice(2);
    variants.add(sem55);
    variants.add('+55' + sem55);
  }

  // Ultimos 9 digitos (numero local com 9)
  if (digits.length >= 9) variants.add(digits.slice(-9));
  // Ultimos 8 digitos (numero local sem 9)
  if (digits.length >= 8) variants.add(digits.slice(-8));

  return [...variants];
}

// ─────────────────────────────────────────────
// Busca contato por uma propriedade especifica
// ─────────────────────────────────────────────
async function searchByProperty(prop, value) {
  try {
    const res = await axios.post(
      `${HUBSPOT_BASE}/crm/v3/objects/contacts/search`,
      {
        filterGroups: [{
          filters: [{ propertyName: prop, operator: 'EQ', value: String(value) }]
        }],
        properties: ['firstname', 'lastname', 'phone', 'mobilephone', 'email'],
        limit: 5
      },
      { headers: headers() }
    );
    return res.data.results || [];
  } catch (e) {
    return [];
  }
}

// ─────────────────────────────────────────────
// Busca contato no HubSpot por varias estrategias
// ─────────────────────────────────────────────
async function findContact(phone, name) {
  const variants = phoneVariants(phone);

  // Estrategias 1 e 2: busca por todas as variantes de telefone
  if (variants.length > 0) {
    for (const variant of variants) {
      for (const prop of ['phone', 'mobilephone']) {
        const results = await searchByProperty(prop, variant);
        if (results.length > 0) {
          console.log('  Encontrado por: ' + prop + ' = ' + variant);
          return results[0];
        }
      }
    }
  }

  // Estrategia 3: busca por nome COMPLETO (firstname + lastname juntos)
  // Exige que ambos coincidam para evitar falsos positivos
  if (name && name !== 'Desconhecido') {
    const parts = name.trim().split(/\s+/);

    if (parts.length >= 2) {
      const firstName = parts[0];
      const lastName  = parts[parts.length - 1];

      try {
        const res = await axios.post(
          `${HUBSPOT_BASE}/crm/v3/objects/contacts/search`,
          {
            filterGroups: [{
              filters: [
                { propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: firstName },
                { propertyName: 'lastname',  operator: 'CONTAINS_TOKEN', value: lastName  }
              ]
            }],
            properties: ['firstname', 'lastname', 'phone', 'mobilephone', 'email'],
            limit: 5
          },
          { headers: headers() }
        );
        if (res.data.results?.length > 0) {
          console.log('  Encontrado por: nome completo = ' + firstName + ' ' + lastName);
          return res.data.results[0];
        }
      } catch (e) { /* continua */ }
    }

    // Estrategia 4: busca pelo nome completo no campo "fullname" (se existir)
    // Tenta buscar por firstname com o nome inteiro
    try {
      const res = await axios.post(
        `${HUBSPOT_BASE}/crm/v3/objects/contacts/search`,
        {
          filterGroups: [{
            filters: [{ propertyName: 'firstname', operator: 'EQ', value: parts[0] }]
          }],
          properties: ['firstname', 'lastname', 'phone', 'mobilephone', 'email'],
          limit: 10
        },
        { headers: headers() }
      );

      if (res.data.results?.length > 0) {
        // Se encontrou apenas 1, usa ele
        if (res.data.results.length === 1) {
          console.log('  Encontrado por: unico contato com firstname = ' + parts[0]);
          return res.data.results[0];
        }

        // Se encontrou varios, tenta filtrar pelo sobrenome
        if (parts.length >= 2) {
          const lastName = parts[parts.length - 1].toLowerCase();
          const match = res.data.results.find(c => {
            const ln = (c.properties?.lastname || '').toLowerCase();
            return ln.includes(lastName) || lastName.includes(ln);
          });
          if (match) {
            console.log('  Encontrado por: firstname + filtro lastname = ' + parts[0] + ' ' + parts[parts.length - 1]);
            return match;
          }
        }

        // Nao conseguiu distinguir — nao retorna para evitar falso positivo
        console.log('  ATENCAO: ' + res.data.results.length + ' contatos com nome "' + parts[0] + '" — nao e possivel identificar sem telefone');
        return null;
      }
    } catch (e) { /* continua */ }
  }

  return null;
}

// ─────────────────────────────────────────────
// Formatar conversa como texto estruturado
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
  text += `Total de mensagens: ${messages.length}\n`;
  text += `----------------------------------\n\n`;

  messages.forEach(msg => {
    const sender = msg.from === 'vendedor' ? 'Vendedor' : msg.from === 'cliente' ? 'Cliente' : 'Participante';
    const time   = msg.time ? `[${msg.time}] ` : '';
    text += `${time}${sender}:\n${msg.text}\n\n`;
  });

  return text;
}

// ─────────────────────────────────────────────
// Criar nota na timeline do contato
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

    const variants = phoneVariants(phone);

    console.log('');
    console.log('Nova exportacao recebida');
    console.log('  Contato : ' + contactName);
    console.log('  Telefone: ' + (phone || 'nao capturado'));
    if (variants.length > 0) {
      console.log('  Variantes: ' + variants.slice(0, 4).join(', '));
    }
    console.log('  Msgs    : ' + messages.length);

    const contact = await findContact(phone, contactName);

    if (!contact) {
      console.log('  ATENCAO: Contato nao encontrado no HubSpot');

      const dica = variants.length === 0
        ? 'O telefone nao foi capturado. Certifique-se de que o contato esta salvo com o nome completo no WhatsApp.'
        : `Verifique se o contato tem o telefone cadastrado no HubSpot. Formatos tentados: ${variants.slice(0,3).join(', ')}`;

      return res.status(404).json({
        success: false,
        error: `Contato "${contactName}" nao encontrado no HubSpot. ${dica}`
      });
    }

    const fullName = [
      contact.properties?.firstname,
      contact.properties?.lastname
    ].filter(Boolean).join(' ') || contactName;

    console.log('  Contato encontrado: ' + fullName + ' (ID ' + contact.id + ')');

    const noteBody = formatConversation(contactName, messages);
    const note     = await createNote(contact.id, noteBody);

    console.log('  Nota criada: ID ' + note.id);

    return res.json({
      success: true,
      message: `Conversa salva com sucesso na timeline de ${fullName}!`,
      contactId: contact.id,
      contactName: fullName,
      noteId: note.id
    });

  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error('  ERRO: ' + errMsg);

    if (err.response?.status === 401) {
      return res.status(401).json({ success: false, error: 'Token invalido ou expirado. Verifique o arquivo .env' });
    }
    if (err.response?.status === 403) {
      return res.status(403).json({ success: false, error: 'Permissao negada. Verifique os escopos do Private App no HubSpot.' });
    }

    return res.status(500).json({
      success: false,
      error: 'Erro interno ao processar a conversa.',
      details: errMsg
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
