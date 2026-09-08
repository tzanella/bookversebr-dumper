require('dotenv').config();
const { run } = require('./processor');

function parseCommandLineArgs(argv) {
  const options = {};
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--source' || arg === '-s') {
      options.sourceGroupId = argv[++i];
    } else if (arg.startsWith('--source=')) {
      options.sourceGroupId = arg.split('=')[1];
    } else if (arg === '--dest' || arg === '-d') {
      options.destGroupId = argv[++i];
    } else if (arg.startsWith('--dest=')) {
      options.destGroupId = arg.split('=')[1];
    } else if (arg === '--limit' || arg === '-l') {
      options.limit = parseInt(argv[++i], 10);
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (!options.sourceGroupId && positional.length > 0) {
    options.sourceGroupId = positional[0];
  }
  if (!options.destGroupId && positional.length > 1) {
    options.destGroupId = positional[1];
  }

  return options;
}

function printHelp() {
  console.log(`
Uso:
  node index.js [opções]
  npm start -- [opções]

Opções:
  -s, --source <id>   ID numérico ou username do canal/grupo de origem
  -d, --dest <id>     ID numérico ou username do grupo privado de destino
  -l, --limit <n>      Limite de mensagens para processar
  -h, --help          Exibe esta ajuda

Exemplos:
  node index.js --source -1001234567890 --dest -1009876543210
  node index.js -1001234567890 -1009876543210
  npm start
`);
}

async function main() {
  const cliArgs = process.argv.slice(2);
  const options = parseCommandLineArgs(cliArgs);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  console.log('=== BookverseBR Telegram Bot ===');
  console.log('Iniciando processamento automatizado de livros .epub...');

  try {
    await run(options);
    console.log('Processamento finalizado com êxito.');
    process.exit(0);
  } catch (error) {
    console.error('Erro durante a execução do bot:', error.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\nExecução interrompida pelo usuário.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nSinal de término recebido.');
  process.exit(0);
});

main();
