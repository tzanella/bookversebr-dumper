const axios = require('axios');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function removeAccents(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const COMMON_FIRST_NAMES = new Set([
  'john', 'bernard', 'george', 'william', 'octavia', 'mary', 'stephen', 'arthur', 'charles', 'david',
  'james', 'robert', 'thomas', 'richard', 'joseph', 'michael', 'paul', 'mark', 'donald', 'steven',
  'andrew', 'joshua', 'kenneth', 'kevin', 'brian', 'edward', 'ronald', 'timothy', 'jason', 'jeffrey',
  'ryan', 'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'larry', 'justin', 'scott', 'brandon',
  'benjamin', 'samuel', 'gregory', 'alexander', 'frank', 'patrick', 'raymond', 'jack', 'dennis',
  'jerry', 'tyler', 'aaron', 'jose', 'adam', 'nathan', 'henry', 'douglas', 'zachary', 'peter',
  'kyle', 'walter', 'ethan', 'jeremy', 'harold', 'keith', 'christian', 'roger', 'noah', 'gerald',
  'carl', 'terry', 'sean', 'austin', 'jesse', 'dylan', 'bryan', 'joe', 'jordan', 'billy', 'bruce',
  'albert', 'willie', 'gabriel', 'logan', 'alan', 'juan', 'wayne', 'roy', 'ralph', 'randy',
  'eugene', 'vincent', 'russell', 'louis', 'philip', 'bobby', 'johnny', 'bradley', 'joao', 'paulo',
  'pedro', 'carlos', 'lucas', 'mateus', 'guilherme', 'felipe', 'rafael', 'bruno', 'gustavo',
  'rodrigo', 'marcelo', 'fernando', 'alexandre', 'andre', 'daniel', 'eduardo', 'leonardo', 'marcos',
  'luiz', 'antonio', 'francisco', 'mario', 'sergio', 'renato', 'ricardo', 'fabio', 'roberto',
  'vitor', 'diego', 'thiago', 'matheus', 'caio', 'vinicius', 'sarah', 'courtney', 'olga', 'ursula',
  'agatha', 'clarice', 'machado', 'jorge', 'erico', 'rachel', 'guimaraes', 'graciliano', 'lima',
  'homer', 'dante', 'virgil'
]);

function normalizeAuthor(authorStr) {
  if (!authorStr) return null;
  let cleaned = String(authorStr).replace(/[\.\s]*\.\.\.$|…$/g, '').trim();
  cleaned = cleaned.replace(/[\(\[\{\}\]\)]/g, '').trim();

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 2) {
    const firstLower = removeAccents(parts[0]);
    const secondLower = removeAccents(parts[1]);
    if (!COMMON_FIRST_NAMES.has(firstLower) && COMMON_FIRST_NAMES.has(secondLower)) {
      return `${parts[1]} ${parts[0]}`;
    }
  }
  return cleaned;
}

function normalizeAuthorString(str) {
  if (!str) return '';
  let norm = removeAccents(str);
  norm = norm.replace(/[^a-z0-9\s]/g, ' ');
  return norm.replace(/\s+/g, ' ').trim();
}

function authorMatches(fileAuthor, resultAuthor) {
  if (!fileAuthor) return true;
  if (!resultAuthor) return false;

  const fileNorm = normalizeAuthorString(fileAuthor);
  const resNorms = Array.isArray(resultAuthor)
    ? resultAuthor.map(normalizeAuthorString)
    : [normalizeAuthorString(resultAuthor)];

  if (!fileNorm || resNorms.length === 0) return false;

  const fileWords = fileNorm.split(' ').filter(w => w.length >= 2);

  for (const resNorm of resNorms) {
    if (!resNorm) continue;
    const resWords = resNorm.split(' ').filter(w => w.length >= 2);

    if (resNorm.includes(fileNorm) || fileNorm.includes(resNorm)) {
      return true;
    }

    if (fileWords.length > 0 && fileWords.every(w => resNorm.includes(w))) {
      return true;
    }

    if (resWords.length > 0 && resWords.every(w => fileNorm.includes(w))) {
      return true;
    }

    if (fileWords.length >= 2 && resWords.length >= 2) {
      const fileLastName = fileWords[fileWords.length - 1];
      const resLastName = resWords[resWords.length - 1];
      const fileFirstName = fileWords[0];
      const resFirstName = resWords[0];

      if ((fileLastName === resLastName || fileLastName === resFirstName) &&
          (fileFirstName === resLastName || fileFirstName === resFirstName || fileWords.some(w => resWords.includes(w)))) {
        return true;
      }
    }
  }

  return false;
}

function parseFilename(rawFilename) {
  if (!rawFilename) {
    return { title: '', author: null };
  }

  let cleaned = String(rawFilename).replace(/\.epub$/i, '');
  cleaned = cleaned.replace(/^_bookversebr_/i, '');
  cleaned = cleaned.replace(/\s*[\(\[]?\s*z[\s\-_]*library\s*[\)\]]?/gi, '');
  cleaned = cleaned.replace(/\(\s*\)|\[\s*\]/g, '');
  cleaned = cleaned.replace(/[\.\s]*\.\.\.$|…$/g, '');
  cleaned = cleaned.replace(/[\s_]+/g, ' ').trim();

  if (!cleaned) {
    return { title: rawFilename, author: null };
  }

  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    const title = parts[0].trim();
    let authorPart = parts.slice(1).join(' - ').trim();
    authorPart = authorPart.replace(/\s*[\(\[].*?[\)\]]/g, '').trim();

    return {
      title: title || cleaned,
      author: normalizeAuthor(authorPart)
    };
  }

  const parenMatch = cleaned.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (parenMatch) {
    const title = parenMatch[1].trim();
    const author = parenMatch[2].trim();
    return {
      title: title || cleaned,
      author: normalizeAuthor(author)
    };
  }

  return {
    title: cleaned,
    author: null
  };
}

function cleanBookTitle(rawFilename) {
  const parsed = parseFilename(rawFilename);
  return parsed.title;
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

function extractTags(subject) {
  if (!Array.isArray(subject) || subject.length === 0) {
    return null;
  }
  const cleaned = subject.map(s => String(s).trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return null;
  }
  return cleaned.join(',');
}

function extractCoverInfo(coverI) {
  if (coverI !== undefined && coverI !== null && String(coverI).trim() !== '') {
    const idNum = Number(coverI);
    if (!isNaN(idNum)) {
      return {
        cover_url: `https://covers.openlibrary.org/b/id/${idNum}-L.jpg`,
        cover_id: idNum
      };
    }
  }
  return {
    cover_url: null,
    cover_id: null
  };
}

function isPortugueseLanguage(langField) {
  if (!langField) return false;
  const langs = Array.isArray(langField) ? langField : [langField];
  return langs.some(l => {
    const norm = String(l).toLowerCase();
    return norm.includes('por') || norm.includes('pt') || norm.includes('portuguese') || norm.includes('languages/por');
  });
}

function isEnglishOnlyLanguage(langField) {
  if (!langField) return false;
  const langs = Array.isArray(langField) ? langField : [langField];
  const normLangs = langs.map(l => String(l).toLowerCase());
  const hasEng = normLangs.some(l => l.includes('eng') || l.includes('en') || l.includes('english') || l.includes('languages/eng'));
  const hasPor = isPortugueseLanguage(langField);
  return hasEng && !hasPor;
}

async function requestWithRetry(fn, maxRetries = 3, label = '') {
  const delays = [1000, 3000, 6000];
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[OpenLibrary] Tentativa ${attempt}/${maxRetries} para "${label}"...`);
      return await fn();
    } catch (error) {
      const isNetworkError =
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNREFUSED' ||
        error.message?.includes('timeout') ||
        (error.response && error.response.status >= 500);

      if (isNetworkError && attempt < maxRetries) {
        const delay = delays[attempt - 1] || 6000;
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
}

async function fetchPortugueseEdition(workKey) {
  if (!workKey) return null;
  const cleanKey = workKey.startsWith('/') ? workKey.replace('/works/', '') : workKey;
  const url = `https://openlibrary.org/works/${cleanKey}/editions.json?limit=50`;
  try {
    const data = await requestWithRetry(
      async () => {
        const response = await axios.get(url, {
          timeout: 20000,
          headers: {
            'User-Agent': 'BookverseBRBot/1.0 (contact@bookversebr.local)'
          }
        });
        return response.data;
      },
      3,
      `editions:${cleanKey}`
    );

    if (data && Array.isArray(data.entries)) {
      const ptEdition = data.entries.find(ed => isPortugueseLanguage(ed.languages));
      if (ptEdition) {
        console.log(`[OpenLibrary] Edição PT-BR selecionada para o work ${cleanKey}`);
        let ptCoverId = null;
        if (Array.isArray(ptEdition.covers) && ptEdition.covers.length > 0) {
          ptCoverId = ptEdition.covers.find(c => c && c > 0) || ptEdition.covers[0];
        }
        let ptIsbn = null;
        if (Array.isArray(ptEdition.isbn_13) && ptEdition.isbn_13.length > 0) {
          ptIsbn = ptEdition.isbn_13[0];
        } else if (Array.isArray(ptEdition.isbn_10) && ptEdition.isbn_10.length > 0) {
          ptIsbn = ptEdition.isbn_10[0];
        }
        return {
          title: ptEdition.title || null,
          isbn: ptIsbn,
          cover_id: ptCoverId
        };
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function fetchWorkDescription(workKey) {
  if (!workKey) {
    return null;
  }
  const cleanKey = workKey.startsWith('/') ? workKey : `/works/${workKey}`;
  const url = `https://openlibrary.org${cleanKey}.json`;
  try {
    const response = await axios.get(url, {
      timeout: 20000,
      headers: {
        'User-Agent': 'BookverseBRBot/1.0 (contact@bookversebr.local)'
      }
    });
    const data = response.data;
    if (!data || !data.description) {
      return null;
    }
    if (typeof data.description === 'string') {
      return data.description.trim() || null;
    }
    if (typeof data.description === 'object' && data.description.value) {
      return String(data.description.value).trim() || null;
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function requestOpenLibrary(params) {
  const url = 'https://openlibrary.org/search.json';
  const response = await axios.get(url, {
    params: {
      ...params,
      fields: 'title,author_name,first_publish_year,publish_year,isbn,language,key,cover_i,subject'
    },
    timeout: 20000,
    headers: {
      'User-Agent': 'BookverseBRBot/1.0 (contact@bookversebr.local)'
    }
  });
  return response.data;
}

function calculateScore(doc, expectedTitle, expectedAuthor) {
  let score = 0;
  const docTitleNorm = removeAccents(doc.title);
  const expTitleNorm = removeAccents(expectedTitle);
  const docAuthors = Array.isArray(doc.author_name)
    ? doc.author_name.map(removeAccents)
    : doc.author_name ? [removeAccents(doc.author_name)] : [];

  const hasPor = isPortugueseLanguage(doc.language);
  const isEngOnly = isEnglishOnlyLanguage(doc.language);

  if (hasPor) {
    score += 10;
  } else if (isEngOnly) {
    score -= 10;
  }

  let titleMatches = false;
  if (docTitleNorm && expTitleNorm) {
    if (docTitleNorm === expTitleNorm) {
      titleMatches = true;
      score += 5;
    } else if (docTitleNorm.includes(expTitleNorm) || expTitleNorm.includes(docTitleNorm)) {
      titleMatches = true;
      score += 3;
    }
  }

  if (doc.isbn && Array.isArray(doc.isbn) && doc.isbn.length > 0) {
    score += 1;
  }

  if (!titleMatches && !hasPor) {
    score -= 5;
  }

  return { doc, score, hasPor, isEngOnly };
}

function evaluateAndPickBestDoc(docs, expectedTitle, expectedAuthor) {
  if (!Array.isArray(docs) || docs.length === 0) return null;

  const validDocs = [];

  for (const doc of docs) {
    const resAuthor = extractAuthor(doc.author_name);
    if (expectedAuthor) {
      const match = authorMatches(expectedAuthor, resAuthor || doc.author_name);
      if (!match) {
        console.log(`[OpenLibrary] Filtro de autor: arquivo="${expectedAuthor}" | resultado="${resAuthor || 'N/A'}" → REJEITADO`);
        continue;
      } else {
        console.log(`[OpenLibrary] Filtro de autor: arquivo="${expectedAuthor}" | resultado="${resAuthor || 'N/A'}" → ACEITO`);
      }
    }
    validDocs.push(doc);
  }

  if (validDocs.length === 0) {
    return null;
  }

  const scored = validDocs.map(d => calculateScore(d, expectedTitle, expectedAuthor));
  scored.sort((a, b) => b.score - a.score);

  for (const item of scored) {
    if (item.isEngOnly && !item.hasPor) {
      console.log(`[OpenLibrary] Resultado descartado (idioma: eng)`);
      continue;
    }
    if (item.score > 0) {
      console.log(`[OpenLibrary] Resultado aceito (score ${item.score}): "${item.doc.title}" | ${extractAuthor(item.doc.author_name) || 'N/A'}`);
      return item.doc;
    }
  }
  return null;
}

async function fetchBookMetadata(rawFilename, delayMs = 1500) {
  const parsed = parseFilename(rawFilename);
  if (!parsed.title) {
    console.log('Nenhuma descrição encontrada.');
    console.log('Nenhuma tag disponível.');
    console.log('Nenhuma capa disponível para este livro.');
    return {
      title: rawFilename,
      author: null,
      year: null,
      isbn: null,
      description: null,
      tags: null,
      cover_url: null,
      cover_id: null
    };
  }

  try {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    console.log(`[OpenLibrary] Filtrando por idioma: por/pt`);

    const strategies = [];
    if (parsed.author) {
      strategies.push({
        name: `Estratégia 1: title="${parsed.title}" author="${parsed.author}"`,
        params: { title: parsed.title, author: parsed.author, language: 'por', limit: 5 }
      });
      strategies.push({
        name: `Estratégia 2: q="${parsed.title} ${parsed.author}"`,
        params: { q: `${parsed.title} ${parsed.author}`, language: 'por', limit: 5 }
      });
    }
    strategies.push({
      name: `Estratégia 3: title="${parsed.title}"`,
      params: { title: parsed.title, language: 'por', limit: 5 }
    });
    strategies.push({
      name: `Estratégia 4: q="${parsed.title}"`,
      params: { q: parsed.title, language: 'por', limit: 5 }
    });

    let bestDoc = null;

    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      console.log(`[OpenLibrary] ${strategy.name}`);
      try {
        const data = await requestWithRetry(
          () => requestOpenLibrary(strategy.params),
          3,
          parsed.title
        );

        if (data && Array.isArray(data.docs) && data.docs.length > 0) {
          bestDoc = evaluateAndPickBestDoc(data.docs, parsed.title, parsed.author);
          if (bestDoc) {
            break;
          }
        }
      } catch (reqErr) {
        console.warn(`[OpenLibrary] Falha na ${strategy.name}: ${reqErr.message}`);
      }

      if (i < strategies.length - 1) {
        await sleep(300);
      }
    }

    if (bestDoc) {
      const ptEdition = await fetchPortugueseEdition(bestDoc.key);

      let description = null;
      if (bestDoc.key) {
        description = await requestWithRetry(
          () => fetchWorkDescription(bestDoc.key),
          3,
          bestDoc.key
        ).catch(() => null);
      }

      if (description) {
        console.log(`Descrição obtida: ${description.length} caracteres`);
      } else {
        console.log('Nenhuma descrição encontrada.');
      }

      const tags = extractTags(bestDoc.subject);
      if (tags) {
        console.log(`Tags: ${tags}`);
      } else {
        console.log('Nenhuma tag disponível.');
      }

      const finalCoverId = (ptEdition && ptEdition.cover_id) || bestDoc.cover_i;
      const coverInfo = extractCoverInfo(finalCoverId);
      if (coverInfo.cover_url) {
        console.log(`URL da capa: ${coverInfo.cover_url}`);
      } else {
        console.log('Nenhuma capa disponível para este livro.');
      }

      let finalTitle = parsed.title;
      if (ptEdition && ptEdition.title) {
        finalTitle = ptEdition.title;
      } else if (bestDoc.title) {
        const normDocTitle = removeAccents(bestDoc.title);
        const normParsedTitle = removeAccents(parsed.title);
        if (normDocTitle === normParsedTitle || normDocTitle.includes(normParsedTitle) || normParsedTitle.includes(normDocTitle)) {
          finalTitle = bestDoc.title;
        } else {
          console.log(`[OpenLibrary] Título do work ("${bestDoc.title}") difere do nome em PT. Usando "${parsed.title}".`);
          finalTitle = parsed.title;
        }
      }

      const fetchedAuthor = extractAuthor(bestDoc.author_name);
      const finalIsbn = (ptEdition && ptEdition.isbn) || extractIsbn(bestDoc.isbn);

      return {
        title: finalTitle || parsed.title,
        author: fetchedAuthor || parsed.author || null,
        year: extractYear(bestDoc),
        isbn: finalIsbn,
        description: description,
        tags: tags,
        cover_url: coverInfo.cover_url,
        cover_id: coverInfo.cover_id
      };
    }

    console.log(`[OpenLibrary] Nenhum resultado com autor correspondente. Usando dados do nome do arquivo.`);
    console.log('Nenhuma descrição encontrada.');
    console.log('Nenhuma tag disponível.');
    console.log('Nenhuma capa disponível para este livro.');
    return {
      title: parsed.title,
      author: parsed.author || null,
      year: null,
      isbn: null,
      description: null,
      tags: null,
      cover_url: null,
      cover_id: null
    };
  } catch (error) {
    console.error(`Erro ao consultar OpenLibrary para "${parsed.title}":`, error.message);
    console.log('[OpenLibrary] Nenhum resultado com autor correspondente. Usando dados do nome do arquivo.');
    console.log('Nenhuma descrição encontrada.');
    console.log('Nenhuma tag disponível.');
    console.log('Nenhuma capa disponível para este livro.');
    return {
      title: parsed.title,
      author: parsed.author || null,
      year: null,
      isbn: null,
      description: null,
      tags: null,
      cover_url: null,
      cover_id: null
    };
  }
}

module.exports = {
  parseFilename,
  cleanBookTitle,
  authorMatches,
  fetchBookMetadata
};
