const path = require('path');
const fs = require('fs');
const {
  createTelegramClient,
  iterateSourceMessages,
  isEpubMessage,
  extractFilenameFromMessage,
  extractFileUniqueId,
  downloadEpubFile,
  sendEpubFile
} = require('./telegramClient');
const { fetchBookMetadata } = require('./openLibrary');
const {
  initDatabase,
  bookExists,
  getState,
  setState,
  findBookByFileUniqueId,
  insertBook,
  updateTelegramInfo
} = require('./database');

function sanitizeFilename(filename) {
  return filename.replace(/[/\\?%*:|"<>]/g, '_');
}

function sanitizeLocalFilename(filename) {
  if (!filename) {
    return filename;
  }

  const safe = sanitizeFilename(filename);
  let ext = '';
  let base = safe;

  if (safe.toLowerCase().endsWith('.epub')) {
    ext = '.epub';
    base = safe.slice(0, -5);
  }

  base = base.replace(/^_bookversebr_/i, '');
  base = base.replace(/\s*[\(\[]?\s*z[\s\-_]*library\s*[\)\]]?/gi, '');
  base = base.replace(/\(\s*\)|\[\s*\]/g, '');
  base = base.replace(/[\s_]+/g, ' ').trim();
  base = base.replace(/^[-_\s]+|[-_\s]+$/g, '');

  if (!base) {
    base = 'livro';
  }

  return `_bookversebr_${base}${ext}`;
}

async function processSourceGroup(client, config) {
  const { sourceGroupId, destGroupId, downloadDir, delayMs, limit } = config;
  const resolvedDownloadDir = path.resolve(process.cwd(), downloadDir);

  if (!fs.existsSync(resolvedDownloadDir)) {
    fs.mkdirSync(resolvedDownloadDir, { recursive: true });
  }

  const savedCheckpoint = getState('last_processed_message_id');
  const lastProcessedId = savedCheckpoint ? parseInt(savedCheckpoint, 10) : 0;
  console.log(`[Processador] Checkpoint atual: last_processed_id = ${lastProcessedId}`);
  console.log(`[Processador] Conectando ao canal/grupo fonte: ${sourceGroupId}`);
  console.log(`[Processador] Grupo de destino configurado: ${destGroupId}`);

  let totalScanned = 0;
  let totalFound = 0;
  let processedCount = 0;
  let skippedDuplicate = 0;
  let errorCount = 0;

  const minId = lastProcessedId > 0 ? lastProcessedId : 0;

  for await (const message of iterateSourceMessages(client, sourceGroupId, { minId: minId + 1, limit })) {
    if (!message || message.id <= lastProcessedId) {
      continue;
    }

    totalScanned++;
    const messageId = message.id;

    try {
      setState('last_processed_message_id', String(messageId));
      console.log(`[Processador] Progresso salvo: mensagem ${messageId} processada.`);
    } catch (stateError) {
      console.error(`[Processador] Erro ao salvar estado da mensagem ${messageId}:`, stateError.message);
    }

    if (!isEpubMessage(message)) {
      continue;
    }

    totalFound++;
    let originalFilename = extractFilenameFromMessage(message);
    if (!originalFilename) {
      originalFilename = `livro_${messageId}.epub`;
    }

    const fileUniqueId = extractFileUniqueId(message);

    if (fileUniqueId) {
      const existingBook = findBookByFileUniqueId(fileUniqueId);
      if (existingBook) {
        console.log(`[Deduplicação] Arquivo duplicado encontrado (ID único: ${fileUniqueId}), pulando...`);
        skippedDuplicate++;
        continue;
      }
    }

    if (bookExists(originalFilename)) {
      console.log(`[Deduplicação] Arquivo já existente pelo nome original: "${originalFilename}". Pulando.`);
      skippedDuplicate++;
      continue;
    }

    console.log('--------------------------------------------------');
    console.log(`[Processador] [${totalFound}] Novo livro encontrado: "${originalFilename}" (Mensagem ID: ${messageId})`);

    try {
      console.log(`[OpenLibrary] Buscando metadados para "${originalFilename}"...`);
      const metadata = await fetchBookMetadata(originalFilename, delayMs);
      console.log(`[OpenLibrary] Metadados: Título="${metadata.title}" | Autor="${metadata.author || 'N/A'}" | Ano=${metadata.year || 'N/A'} | ISBN=${metadata.isbn || 'N/A'}`);

      const localFileName = sanitizeLocalFilename(originalFilename);
      const localFilePath = path.resolve(resolvedDownloadDir, localFileName);

      console.log(`[Telegram] Baixando arquivo para: ${localFilePath}...`);
      await downloadEpubFile(client, message, localFilePath);
      console.log(`[Telegram] Download concluído com sucesso: ${localFilePath}`);

      const bookRecordId = insertBook({
        filename_original: originalFilename,
        title: metadata.title,
        author: metadata.author,
        year: metadata.year,
        isbn: metadata.isbn,
        description: metadata.description,
        tags: metadata.tags,
        cover_url: metadata.cover_url,
        cover_id: metadata.cover_id,
        file_path: localFilePath,
        telegram_group_id: null,
        telegram_message_id: null,
        telegram_file_unique_id: fileUniqueId,
        processed_at: new Date().toISOString()
      });
      console.log(`[Banco] Registro inserido no SQLite com ID: ${bookRecordId} (ID Único Telegram: ${fileUniqueId || 'N/A'})`);

      const sendResult = await sendEpubFile(client, destGroupId, localFilePath, metadata);
      updateTelegramInfo(bookRecordId, sendResult.destGroupId, sendResult.messageId);
      console.log(`[Telegram] Reenviado com sucesso! Grupo: ${sendResult.destGroupId} | Mensagem ID: ${sendResult.messageId}`);
      fs.unlinkSync(localFilePath);
      console.log(`[Sistema] Arquivo local deletado: ${localFilePath}`);
      console.log(`[Banco] Registro ID ${bookRecordId} atualizado com os dados do reenvio.`);

      processedCount++;
    } catch (processError) {
      errorCount++;
      console.error(`[Processador] Erro ao processar "${originalFilename}":`, processError.message);
    }
  }

  console.log('==================================================');
  console.log('[Processador] Finalizado resumo da execução:');
  console.log(`  - Total de mensagens escaneadas: ${totalScanned}`);
  console.log(`  - Total de arquivos .epub encontrados: ${totalFound}`);
  console.log(`  - Novos livros processados e reenviados: ${processedCount}`);
  console.log(`  - Arquivos duplicados/já existentes (pulados): ${skippedDuplicate}`);
  console.log(`  - Erros encontrados: ${errorCount}`);
  console.log(`  - Último checkpoint salvo: ${getState('last_processed_message_id') || lastProcessedId}`);
  console.log('==================================================');

  return {
    totalScanned,
    totalFound,
    processedCount,
    skippedDuplicate,
    errorCount,
    lastProcessedId: getState('last_processed_message_id') || lastProcessedId
  };
}

async function run(options = {}) {
  const sourceGroupId = options.sourceGroupId || process.env.SOURCE_GROUP_ID;
  const destGroupId = options.destGroupId || process.env.DEST_GROUP_ID;
  const downloadDir = options.downloadDir || process.env.DOWNLOAD_DIR || './downloads';
  const databasePath = options.databasePath || process.env.DATABASE_PATH || './books.db';
  const delayMs = Number(options.delayMs || process.env.REQUEST_DELAY_MS || 1500);
  const limit = options.limit ? Number(options.limit) : null;

  if (!sourceGroupId) {
    throw new Error('ID do grupo fonte não informado. Defina SOURCE_GROUP_ID no .env ou passe via argumento.');
  }

  if (!destGroupId) {
    throw new Error('ID do grupo destino não informado. Defina DEST_GROUP_ID no .env ou passe via argumento.');
  }

  initDatabase(databasePath);
  console.log(`[Banco] SQLite inicializado em: ${databasePath}`);

  const client = await createTelegramClient();

  try {
    return await processSourceGroup(client, {
      sourceGroupId,
      destGroupId,
      downloadDir,
      delayMs,
      limit
    });
  } finally {
    try {
      await client.disconnect();
      console.log('[Telegram] Conexão encerrada com sucesso.');
    } catch (disconnectError) {
      console.warn('[Telegram] Aviso ao encerrar conexão:', disconnectError.message);
    }
  }
}

module.exports = {
  run,
  processSourceGroup,
  sanitizeLocalFilename
};
