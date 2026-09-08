const fs = require('fs');
const path = require('path');
const { authenticateClient } = require('./login');

async function createTelegramClient(configOverrides = {}) {
  const client = await authenticateClient(configOverrides);
  try {
    await client.getDialogs({ limit: 100 });
  } catch (error) {
    console.warn('[Telegram] Aviso ao carregar diálogos iniciais:', error.message);
  }
  return client;
}

async function resolveEntity(client, peer) {
  if (!peer) {
    throw new Error('Identificador do canal/grupo não pode ser vazio.');
  }

  const raw = String(peer).trim();

  try {
    return await client.getEntity(raw);
  } catch (initialError) {
    if (/^-?\d+$/.test(raw)) {
      try {
        return await client.getEntity(BigInt(raw));
      } catch (bigIntError) {
        throw new Error(`Não foi possível encontrar a entidade Telegram para o ID ${raw}: ${bigIntError.message}`);
      }
    }
    throw new Error(`Não foi possível encontrar a entidade Telegram para "${raw}": ${initialError.message}`);
  }
}

function extractFilenameFromMessage(message) {
  if (message && message.file && message.file.name) {
    return message.file.name;
  }

  const document = message && (message.media?.document || message.document);
  if (document && Array.isArray(document.attributes)) {
    for (const attr of document.attributes) {
      if (attr && attr.fileName) {
        return attr.fileName;
      }
      if (attr && attr.className === 'DocumentAttributeFilename' && attr.fileName) {
        return attr.fileName;
      }
    }
  }

  return null;
}

function extractFileUniqueId(message) {
  if (!message) {
    return null;
  }

  const document = message.document || (message.media && message.media.document);
  if (!document) {
    return null;
  }

  if (document.fileUniqueId) {
    return String(document.fileUniqueId);
  }

  if (document.file_unique_id) {
    return String(document.file_unique_id);
  }

  if (document.id) {
    return String(document.id);
  }

  return null;
}

function isEpubMessage(message) {
  const filename = extractFilenameFromMessage(message);
  if (filename && filename.toLowerCase().endsWith('.epub')) {
    return true;
  }

  const document = message && (message.media?.document || message.document);
  if (document && document.mimeType && document.mimeType.toLowerCase() === 'application/epub+zip') {
    return true;
  }

  return false;
}

async function* iterateSourceMessages(client, sourceGroupId, options = {}) {
  const sourceEntity = await resolveEntity(client, sourceGroupId);
  const iterParams = {
    reverse: true
  };

  if (options.minId !== undefined && options.minId !== null && Number(options.minId) >= 0) {
    const minId = Number(options.minId);
    iterParams.minId = minId;
    iterParams.offsetId = minId;
  }

  if (options.limit && Number.isInteger(options.limit) && options.limit > 0) {
    iterParams.limit = options.limit;
  }

  for await (const message of client.iterMessages(sourceEntity, iterParams)) {
    if (!message) {
      continue;
    }
    yield message;
  }
}

async function* iterateSourceEpubMessages(client, sourceGroupId, options = {}) {
  for await (const message of iterateSourceMessages(client, sourceGroupId, options)) {
    if (isEpubMessage(message)) {
      let filename = extractFilenameFromMessage(message);
      if (!filename) {
        filename = `livro_${message.id}.epub`;
      }

      yield {
        message,
        messageId: message.id,
        filenameOriginal: filename,
        fileUniqueId: extractFileUniqueId(message),
        date: message.date
      };
    }
  }
}

async function downloadEpubFile(client, message, destinationFilePath) {
  const dir = path.dirname(destinationFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const result = await client.downloadMedia(message, {
    outputFile: destinationFilePath
  });

  if (Buffer.isBuffer(result)) {
    fs.writeFileSync(destinationFilePath, result);
  }

  if (!fs.existsSync(destinationFilePath) || fs.statSync(destinationFilePath).size === 0) {
    throw new Error(`Falha no download: o arquivo ${destinationFilePath} não foi criado ou está vazio.`);
  }

  return destinationFilePath;
}

function buildCaption(bookMetadata) {
  const parts = [];
  if (bookMetadata.title) {
    parts.push(`📖 ${bookMetadata.title}`);
  }
  if (bookMetadata.author) {
    parts.push(`✍️ Autor: ${bookMetadata.author}`);
  }
  if (bookMetadata.year) {
    parts.push(`📅 Ano: ${bookMetadata.year}`);
  }
  if (bookMetadata.isbn) {
    parts.push(`🔢 ISBN: ${bookMetadata.isbn}`);
  }
  parts.push(`#bookversebr`);
  return parts.join('\n');
}

async function sendEpubFile(client, destGroupId, filePath, bookMetadata = {}) {
  const destEntity = await resolveEntity(client, destGroupId);
  const caption = buildCaption(bookMetadata);

  console.log(`[Telegram] Enviando arquivo ${path.basename(filePath)} para o grupo de destino...`);

  const sentMessage = await client.sendFile(destEntity, {
    file: filePath,
    caption: caption,
    forceDocument: true
  });

  return {
    messageId: sentMessage.id,
    destGroupId: String(destGroupId)
  };
}

module.exports = {
  createTelegramClient,
  resolveEntity,
  extractFilenameFromMessage,
  extractFileUniqueId,
  isEpubMessage,
  iterateSourceMessages,
  iterateSourceEpubMessages,
  downloadEpubFile,
  buildCaption,
  sendEpubFile
};
