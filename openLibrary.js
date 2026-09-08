const axios = require('axios');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanBookTitle(rawFilename) {
  if (!rawFilename) {
    return '';
  }

  let cleaned = rawFilename.replace(/\.epub$/i, '');
  cleaned = cleaned.replace(/^_bookversebr_/i, '');
  cleaned = cleaned.replace(/\[.*?\]|\(.*?\)/g, ' ');
  cleaned = cleaned.replace(/[_\-]+/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

function extractIsbn(isbnList) {
  if (!Array.isArray(isbnList) || isbnList.length === 0) {
    return null;
  }
  const isbn13 = isbnList.find(code => typeof code === 'string' && code.replace(/[^0-9X]/gi, '').length === 13);
  if (isbn13) {
    return isbn13;
  }
  const isbn10 = isbnList.find(code => typeof code === 'string' && code.replace(/[^0-9X]/gi, '').length === 10);
  if (isbn10) {
    return isbn10;
  }
  return isbnList[0] || null;
}

function extractAuthor(authorName) {
  if (Array.isArray(authorName)) {
    return authorName.filter(Boolean).join(', ');
  }
  if (typeof authorName === 'string') {
    return authorName;
  }
  return null;
}

function extractYear(doc) {
  if (doc.first_publish_year) {
    return Number(doc.first_publish_year);
  }
  if (Array.isArray(doc.publish_year) && doc.publish_year.length > 0) {
    return Number(doc.publish_year[0]);
  }
  return null;
}

async function requestOpenLibrary(params) {
  const url = 'https://openlibrary.org/search.json';
  const response = await axios.get(url, {
    params: {
      ...params,
      fields: 'title,author_name,first_publish_year,publish_year,isbn,language'
    },
    timeout: 10000,
    headers: {
      'User-Agent': 'BookverseBRBot/1.0 (contact@bookversebr.local)'
    }
  });
  return response.data;
}

async function fetchBookMetadata(rawFilename, delayMs = 1500) {
  const cleanedTitle = cleanBookTitle(rawFilename);
  if (!cleanedTitle) {
    return {
      title: rawFilename,
      author: null,
      year: null,
      isbn: null
    };
  }

  try {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    let searchResult = await requestOpenLibrary({
      title: cleanedTitle,
      language: 'por',
      limit: 5
    });

    if (!searchResult || !Array.isArray(searchResult.docs) || searchResult.docs.length === 0) {
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      searchResult = await requestOpenLibrary({
        q: cleanedTitle,
        language: 'por',
        limit: 5
      });
    }

    if (!searchResult || !Array.isArray(searchResult.docs) || searchResult.docs.length === 0) {
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      searchResult = await requestOpenLibrary({
        q: cleanedTitle,
        limit: 5
      });
    }

    if (searchResult && Array.isArray(searchResult.docs) && searchResult.docs.length > 0) {
      const bestDoc = searchResult.docs.find(doc => {
        if (!doc.language) return false;
        if (Array.isArray(doc.language)) return doc.language.includes('por');
        return doc.language === 'por';
      }) || searchResult.docs[0];

      return {
        title: bestDoc.title || cleanedTitle,
        author: extractAuthor(bestDoc.author_name),
        year: extractYear(bestDoc),
        isbn: extractIsbn(bestDoc.isbn)
      };
    }

    console.log(`OpenLibrary: nenhum metadado encontrado para "${cleanedTitle}". Usando dados parciais.`);
    return {
      title: cleanedTitle,
      author: null,
      year: null,
      isbn: null
    };
  } catch (error) {
    console.error(`Erro ao consultar OpenLibrary para "${cleanedTitle}":`, error.message);
    return {
      title: cleanedTitle,
      author: null,
      year: null,
      isbn: null
    };
  }
}

module.exports = {
  cleanBookTitle,
  fetchBookMetadata
};
