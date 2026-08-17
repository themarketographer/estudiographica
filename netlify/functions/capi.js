const crypto = require('crypto');

const PIXEL_ID = process.env.META_PIXEL_ID;
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const GRAPH_VERSION = 'v21.0';

function sha256(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function normalizePhone(phone) {
  if (!phone) return null;
  return phone.replace(/[^\d]/g, '');
}

async function sendCapiEvent({ eventName, eventId, email, phone, sourceUrl, eventTime }) {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    throw new Error('Faltan META_PIXEL_ID o META_ACCESS_TOKEN en las variables de entorno.');
  }
  
  const userData = {};
  const hashedEmail = sha256(email);
  const hashedPhone = sha256(normalizePhone(phone));
  if (hashedEmail) userData.em = [hashedEmail];
  if (hashedPhone) userData.ph = [hashedPhone];
  
  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: eventTime || Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'system_generated',
        event_source_url: sourceUrl || undefined,
        user_data: userData,
      },
      ],
  };
  
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  
  const result = await response.json();
  if (!response.ok) {
    console.error('Error CAPI Meta:', JSON.stringify(result));
    throw new Error(`Meta CAPI respondio ${response.status}: ${JSON.stringify(result)}`);
  }
  return result;
}

async function findAudienceByName(name) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/act_${AD_ACCOUNT_ID}/customaudiences?fields=id,name&access_token=${ACCESS_TOKEN}`;
  const response = await fetch(url);
  const result = await response.json();
  if (!response.ok) {
    console.error('Error listando audiencias:', JSON.stringify(result));
    throw new Error(`Meta respondio ${response.status} al listar audiencias`);
  }
  const found = (result.data || []).find((a) => a.name === name);
  return found ? found.id : null;
}

async function createAudience(name, description) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/act_${AD_ACCOUNT_ID}/customaudiences`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description: description || '',
      subtype: 'CUSTOM',
      customer_file_source: 'USER_PROVIDED_ONLY',
      access_token: ACCESS_TOKEN,
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    console.error('Error creando audiencia:', JSON.stringify(result));
    throw new Error(`Meta respondio ${response.status} al crear la audiencia`);
  }
  return result.id;
}

async function addUserToAudience(audienceId, { email, phone }) {
  const schema = [];
  const dataRow = [];
  const hashedEmail = sha256(email);
  const hashedPhone = sha256(normalizePhone(phone));
  
  if (hashedEmail) {
    schema.push('EMAIL');
    dataRow.push(hashedEmail);
  }
  if (hashedPhone) {
    schema.push('PHONE');
    dataRow.push(hashedPhone);
  }
  
  if (schema.length === 0) return null;
  
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${audienceId}/users`;
  const payload = {
    payload: {
      schema,
      data: [dataRow],
    },
    access_token: ACCESS_TOKEN,
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) {
    console.error('Error agregando usuario a audiencia:', JSON.stringify(result));
    throw new Error(`Meta respondio ${response.status} al agregar el usuario`);
  }
  return result;
}

async function findOrCreateAudience(name, description) {
 let audienceId = await findAudienceByName(name);
  if (!audienceId) {
    audienceId = await createAudience(name, description);
  }
  return audienceId;
}

module.exports = {
  sha256,
  normalizePhone,
  sendCapiEvent,
  findOrCreateAudience,
  addUserToAudience,
};
