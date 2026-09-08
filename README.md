# BookVerseBR Dump Bot

## 1. Visão Geral do Projeto

Este Bot é uma solução automatizada para buscar livros em `.epub` compartilhados em canais ou grupos do Telegram, catalogá-los com metadados oficiais da OpenLibrary e reenviá-los para um grupo privado de destino, evitando duplicidades e mantendo um registro local em banco SQLite.

O sistema utiliza a biblioteca **GramJS** para se comunicar via protocolo MTProto com uma conta real do Telegram (user client), permitindo interagir diretamente com canais e grupos de discussão.

Note que este projeto foi totalmente "VibeCodado", e ele foi criado para um projeto secundário meu que é o **BookVerseBR**, como precisava de uma DB de livros para o projeto, criei esse bot para automatizar a coleta de livros em `.epub` que são compartilhados em canais/grupos do Telegram, catalogando-os e enviando para um grupo privado de destino, onde com uma pequena api que criei, posso baixar os livros.

>[!NOTE]
> Aparentemente o REGEX não está lá grandes coisas, então a busca na API OpenLibrary não está 100&, mas o bot funciona e cumpre o que se propõe a fazer, eu provavelmente não irei corrigir isso e depois faço algum script que corrija os metadados da db

>[!WARNING]
> Este bot em sí, não infringe nenhuma lei e sua automatização se dá apenas pela coleta de arquivos de Canais e Grupo públicos do Telegram, logo não há violação de direitos autorais.

### Objetivos Principais:
1. **Varredura no Grupo/Canal Fonte:** Identificar mensagens que contenham anexos `.epub`.
2. **Prevenção de Duplicidade:** Verificar em banco SQLite local se o arquivo já foi processado anteriormente.
3. **Consulta de Metadados na OpenLibrary:** Obter título oficial, autor(es), ano de publicação e código ISBN (10 ou 13), priorizando edições em português do Brasil (`language=por`).
4. **Download e Renomeação:** Baixar o arquivo e padronizá-lo com o prefixo `_bookversebr_` (exemplo: `_bookversebr_nome_do_livro.epub`).
5. **Persistência em SQLite:** Registrar o arquivo com todos os metadados catalogados na tabela `books`.
6. **Reenvio para Grupo Privado de Destino:** Publicar o `.epub` renomeado com legenda formatada e salvar o ID da mensagem e do grupo de destino no banco de dados.

---

## 2. Estrutura de Arquivos

```
bot-telegram/
├── database.js          # Gerenciamento do banco SQLite (criação da tabela books e CRUD)
├── index.js             # Ponto de entrada da aplicação e parser de argumentos CLI
├── login.js             # Autenticação MTProto interativa e persistência da sessão
├── openLibrary.js       # Integração e tratamento de busca na API OpenLibrary
├── processor.js         # Orquestração do fluxo de processamento de ponta a ponta
├── telegramClient.js    # Conexão GramJS, resolução de entidades, download e upload
├── package.json         # Dependências e scripts de execução
├── .env.example         # Modelo de variáveis de ambiente
├── .env                 # Configurações do ambiente local
├── README.md              # Documentação
```

---

## 3. Instruções de Instalação

### Pré-requisitos
- **Node.js**: Versão 18 ou superior instalada.
- **Conta Telegram**: Acesso a uma conta de usuário do Telegram para login MTProto.
- **Credenciais de API Telegram**: `api_id` e `api_hash` obtidos em [https://my.telegram.org](https://my.telegram.org) (na seção *API development tools*).

### Passo 1: Instalar dependências
Execute no terminal dentro da pasta do projeto:

```bash
npm install
```

As dependências instaladas serão:
- `telegram`: Biblioteca GramJS (MTProto)
- `better-sqlite3`: Motor SQLite síncrono de alta performance
- `axios`: Cliente HTTP para chamadas à API OpenLibrary
- `dotenv`: Carregamento de variáveis de ambiente a partir do `.env`

---

## 4. Configuração das Variáveis de Ambiente

Crie ou edite o arquivo `.env` com base no `.env.example`:

```bash
cp .env.example .env
```

Preencha os campos obrigatórios:

```env
# Credenciais MTProto (obtenha em https://my.telegram.org)
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=abcdef1234567890abcdef1234567890

# Telefone da conta do Telegram (com código do país e DDD)
TELEGRAM_PHONE=+5511999999999

# Caminho para salvar a sessão após o primeiro login
SESSION_FILE=./session.txt

# ID numérico do grupo/canal fonte (onde os arquivos estão)
# Dica: Supergrupos/canais normalmente iniciam com -100
SOURCE_GROUP_ID=-1001234567890

# ID numérico do grupo privado de destino
DEST_GROUP_ID=-1009876543210

# Caminho do banco de dados SQLite local
DATABASE_PATH=./books.db

# Diretório para armazenamento local dos arquivos baixados
DOWNLOAD_DIR=./downloads

# Delay em ms entre requisições à OpenLibrary para evitar rate limit
REQUEST_DELAY_MS=1500
```

---

## 5. Comandos para Executar o Bot

### Autenticação Inicial (Primeira Execução)
Para realizar o login de forma interativa via terminal:

```bash
npm run login
```

- O sistema solicitará o número de telefone (se não pré-preenchido no `.env`), a senha de verificação em duas etapas (2FA) se houver, e o código de verificação recebido pelo aplicativo do Telegram.
- A sessão autenticada será salva no arquivo indicado por `SESSION_FILE` (padrão: `./session.txt`).
- Nas próximas execuções, o login será automático e silencioso, reutilizando a sessão salva.

### Execução Padrão (utilizando variáveis do `.env`)
```bash
npm start
```

### Execução com Parâmetros de Linha de Comando (CLI)
Você pode sobrescrever os IDs diretamente pela linha de comando:

```bash
# Sintaxe com flags:
node index.js --source -1001234567890 --dest -1009876543210 --limit 10

# Sintaxe posicional (fonte e destino):
node index.js -1001234567890 -1009876543210

# Visualizar ajuda:
node index.js --help
```

---

## 6. Fluxo de Funcionamento em Etapas Simples

```
[Início]
   │
   ▼
[1. Carregar Configurações] ──► Lê .env e argumentos de linha de comando
   │
   ▼
[2. Conectar ao Telegram] ────► Reutiliza sessão salva ou solicita login interativo
   │
   ▼
[3. Inicializar SQLite] ──────► Garante a existência da tabela "books"
   │
   ▼
[4. Ler Mensagens Fonte] ─────► Itera mensagens do canal/grupo fonte
   │
   ├─► Anexo não é .epub? ───► Ignora mensagem
   │
   ├─► Já existe no banco? ──► Ignora (evita download e envio duplicados)
   │
   ▼
[5. Consultar OpenLibrary] ───► Busca metadados pelo nome do arquivo (prioriza pt-BR)
   │
   ▼
[6. Download & Renomeação] ───► Salva em ./downloads/_bookversebr_<nome>.epub
   │
   ▼
[7. Inserir no Banco] ────────► Registra filename, metadados e file_path local
   │
   ▼
[8. Reenviar ao Destino] ─────► Envia ao grupo privado com legenda formatada
   │
   ▼
[9. Atualizar Registro] ──────► Salva telegram_group_id e telegram_message_id no banco
   │
   ▼
[Fim do Lote] ────────────────► Exibe resumo e desconecta com segurança
```

---

## 7. Banco de Dados SQLite

A tabela `books` criada em `DATABASE_PATH` possui a seguinte estrutura:

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Identificador único do registro |
| `filename_original` | `TEXT UNIQUE NOT NULL` | Nome original do arquivo `.epub` no Telegram |
| `title` | `TEXT` | Título do livro catalogado na OpenLibrary |
| `author` | `TEXT` | Nome do(s) autor(es) |
| `year` | `INTEGER` | Ano de publicação |
| `isbn` | `TEXT` | Código ISBN (ISBN-13 prioritário ou ISBN-10) |
| `file_path` | `TEXT` | Caminho local do arquivo renomeado com prefixo `_bookversebr_` |
| `telegram_group_id` | `TEXT` | ID do grupo privado de destino para onde foi enviado |
| `telegram_message_id` | `INTEGER` | ID da mensagem enviada no grupo de destino |
| `processed_at` | `TEXT NOT NULL` | Data/hora ISO 8601 em que o processamento ocorreu |

---

## 8. Limites da API OpenLibrary e Tratamento de Erros

1. **Rate Limiting & Delays:**
   - A API pública da OpenLibrary (`search.json`) impõe restrições de volume de requisições por IP. Para respeitar essas diretrizes e prevenir bloqueios HTTP 429 ou conexões reiniciadas (`ECONNRESET`), o sistema aplica um atraso configurável (`REQUEST_DELAY_MS`, padrão 1500 ms) antes de cada chamada.

2. **Estratégia Flexível de Busca:**
   - O nome do arquivo passa por sanitização prévia (remoção da extensão `.epub`, do prefixo `_bookversebr_`, colchetes, parênteses e caracteres especiais).
   - Primeira tentativa: busca pelo parâmetro `title` com filtro de idioma `language=por`.
   - Segunda tentativa: busca textual ampla `q` com filtro `language=por`.
   - Terceira tentativa: busca global `q` sem restrição de idioma.

3. **Tolerância a Falhas e Metadados Parciais:**
   - Se a OpenLibrary não retornar resultados ou a requisição falhar (timeout, indisponibilidade ou conexão reiniciada), o processamento **não é interrompido**.
   - O livro é registrado no banco com os dados parciais disponíveis (título sanitizado derivado do nome do arquivo e campos de autor/ano/ISBN como nulos), permitindo que o download e reenvio continuem normalmente.

4. **Tratamento de Mensagens sem Anexo ou Corrompidas:**
   - Mensagens que não sejam documentos `.epub` válidos são ignoradas silenciosamente.
   - Qualquer falha durante o download ou upload de um arquivo específico é capturada e contabilizada no resumo final de erros, sem abortar o processamento dos demais livros do lote.
