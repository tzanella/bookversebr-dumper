require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

function getEnvConfig(overrides = {}) {
  const apiId = overrides.apiId || process.env.TELEGRAM_API_ID || process.env.API_ID;
  const apiHash = overrides.apiHash || process.env.TELEGRAM_API_HASH || process.env.API_HASH;
  const sessionFile = overrides.sessionFile || process.env.SESSION_FILE || './session.txt';

  if (!apiId || !apiHash) {
    throw new Error('TELEGRAM_API_ID e TELEGRAM_API_HASH devem estar definidos nas variáveis de ambiente (.env).');
  }

  return {
    apiId: Number(apiId),
    apiHash: String(apiHash).trim(),
    sessionFilePath: path.resolve(process.cwd(), sessionFile)
  };
}

function loadSessionString(sessionFilePath) {
  if (fs.existsSync(sessionFilePath)) {
    const content = fs.readFileSync(sessionFilePath, 'utf8').trim();
    if (content.length > 0) {
      return content;
    }
  }
  return '';
}

function saveSessionString(sessionFilePath, sessionString) {
  const dir = path.dirname(sessionFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(sessionFilePath, sessionString, 'utf8');
}

async function promptInput(rl, query) {
  const answer = await rl.question(query);
  return answer.trim();
}

async function authenticateClient(configOverrides = {}) {
  const { apiId, apiHash, sessionFilePath } = getEnvConfig(configOverrides);
  const sessionString = loadSessionString(sessionFilePath);
  const stringSession = new StringSession(sessionString);

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5
  });

  await client.connect();

  const isAuthorized = await client.checkAuthorization();
  if (isAuthorized) {
    console.log('[Login] Sessão autorizada encontrada. Login reaproveitado.');
    return client;
  }

  console.log('[Login] Nenhuma sessão ativa encontrada. Iniciando autenticação interativa...');
  const rl = readline.createInterface({ input, output });

  try {
    await client.start({
      phoneNumber: async () => {
        const defaultPhone = process.env.TELEGRAM_PHONE ? ` (${process.env.TELEGRAM_PHONE})` : '';
        const phone = await promptInput(rl, `Informe seu número de telefone com DDI e DDD${defaultPhone}: `);
        return phone || process.env.TELEGRAM_PHONE;
      },
      password: async () => {
        return await promptInput(rl, 'Informe a senha de verificação em duas etapas (2FA) se houver: ');
      },
      phoneCode: async () => {
        return await promptInput(rl, 'Informe o código de verificação recebido no Telegram: ');
      },
      onError: (err) => {
        console.error('[Login] Erro durante o login:', err.message || err);
      }
    });

    const newSessionString = client.session.save();
    saveSessionString(sessionFilePath, newSessionString);
    console.log(`[Login] Autenticação realizada com sucesso! Sessão salva em: ${sessionFilePath}`);
    return client;
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  (async () => {
    try {
      const client = await authenticateClient();
      const me = await client.getMe();
      console.log(`[Login] Conectado como: ${me.firstName || ''} ${me.lastName || ''} (@${me.username || 'sem username'}, ID: ${me.id})`);
      await client.disconnect();
      process.exit(0);
    } catch (error) {
      console.error('[Login] Falha na autenticação:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  getEnvConfig,
  authenticateClient
};
