const register = require('../core/register');
const logger = require('./logger');
const { select } = require('@inquirer/prompts');
const fs = require('fs');
const path = require('path');
const settings = require('../config/config');
const proxies = require('../config/proxies');
const { program, Option } = require('commander');
const { TelegramClient } = require('telegram');
const Tapper = require('../core/tapper');
const { StringSession } = require('telegram/sessions');
const logger2 = require('./TldLogger');
const os = require('os');
const sleep = require('./sleep');
const _ = require('lodash');
const proxiesConvertor = require('./proxiesConvertor');
const NonSessionTapper = require('../core/nonSessionTapper');

class Luncher {
  #start_text;

  constructor() {
    this.#start_text = `
███████  █████  ██    ██  █████  ███    ██ 
██      ██   ██ ██    ██ ██   ██ ████   ██ 
███████ ███████ ██    ██ ███████ ██ ██  ██ 
     ██ ██   ██  ██  ██  ██   ██ ██  ██ ██ 
███████ ██   ██   ████   ██   ██ ██   ████ 
made by @savanop 
`;
  }

  #printStartText() {
    try {
      const sessionsCount = this.#get_sessions().length;
      const proxiesCount = this.#get_proxies() && Array.isArray(this.#get_proxies()) ? this.#get_proxies().length : 0;
      
      logger.info(`Detected <lb>${sessionsCount}</lb> sessions | <pi>${proxiesCount}</pi> proxies`);
      
      logger.paragraph('<ye><u><b>SAVANOP</b></u></ye> <br />\n<b><bl>en:</bl></b> JISNE SELL KIYA VO GAY\n<b><bl>ru:</bl></b> JO SELL KIYA VO GAY \n<b><bl>es:</bl></b> JO SELL KIYA VO GAY \n<b><bl>fr:</bl></b> JO SELL KIYA VO GAY\n<b><bl>it:</bl></b> JO SELL KIYA VO GAY\n<b><bl>gh:</bl></b>  JO SELL KIYA VO GAY\n\n<b>JO TELEGRAM JOIN KARE VO BHADWA</b> \n<la>https://t.me/savan121op</la>\n');
      
      console.log(this.#start_text);
    } catch (error) {
      console.error('Error in printStartText:', error.message);
    }
  }

  async process() {
    let action;
    program
      .addOption(new Option('--action <action>', 'Action type').choices(['1', '2', '3']))
      .showHelpAfterError(true);
    program.parse();
    const options = program.opts();
    action = options ? parseInt(options.action) : null;

    if (!action) {
      this.#printStartText();
      let choice = '';
      while (true) {
        choice = await select({
          message: 'What would you like to do:\n',
          choices: [
            { name: 'Create session', value: '1', description: '\nCreate a new session for the bot' },
            { name: 'Run bot with sessions', value: '2', description: '\nStart the bot' },
            { name: 'Run bot with query ids', value: '3', description: '\nStart the bot' }
          ]
        });
        if (!choice.trim().match(/^[1-3]$/)) {
          logger.warning('Action must be 1 or 2 or 3');
        } else {
          break;
        }
      }
      action = parseInt(choice.trim());
    }

    if (action === 1) {
      register.start();
    } else if (action === 2) {
      const tgClients = await this.#get_tg_clients();
      await this.#run_tasks(tgClients);
    } else if (action === 3) {
      await this.#run_tasks_query();
    }
  }

  async #get_tg_clients() {
    const sessions = this.#get_sessions();
    const clients = sessions.map(sessionName => {
      try {
        const sessionData = fs.readFileSync(path.join(process.cwd(), 'sessions', sessionName + '.session'), 'utf8');
        if (!sessionData) {
          logger.error(`<la><b>${sessionName}</b></la> | Session is empty or expired. Create a new one.`);
          return;
        }
        const parsedData = JSON.parse(sessionData);
        if (!settings.API_ID || !settings.API_HASH) {
          logger.error('API_ID and API_HASH must be provided.');
          process.exit(1);
        }
        if (!parsedData.sessionString || !parsedData.apiId || !parsedData.apiHash) {
          logger.error(`<la><b>${sessionName}</b></la> | Invalid session data. Create a new one.`);
          process.exit(1);
        }
        if (!/^\d+$/.test(parsedData.apiId)) {
          logger.error(`<la><b>${sessionName}</b></la> | Invalid session data. Create a new one.`);
          process.exit(1);
        }
        const stringSession = new StringSession(parsedData.sessionString);
        const client = new TelegramClient(stringSession, parsedData.apiId, parsedData.apiHash, {
          connectionRetries: 5,
          deviceModel: 'Freddy Bots - ' + os.type(),
          appVersion: '1.0.0',
          systemVersion: '1.0.0',
          langCode: 'en',
          baseLogger: logger2
        });
        return { tg_client: client, session_name: sessionName };
      } catch (error) {
        logger.error(`<la><b>${sessionName}</b></la> | Error: ${error.message}`);
      }
    });
    return clients;
  }

  #get_sessions() {
    const sessionsDir = path.join(process.cwd(), 'sessions');
    if (!fs.existsSync(sessionsDir)) return [];
    const sessions = fs.readdirSync(sessionsDir).map(file => {
      const sessionName = file.endsWith('.session') ? file.split('.')[0] : null;
      return sessionName;
    });
    return sessions;
  }

  #get_proxies() {
    if (!settings.USE_PROXY_FROM_JS_FILE && !settings.USE_PROXY_FROM_TXT_FILE) return null;
    if (settings.USE_PROXY_FROM_JS_FILE && settings.USE_PROXY_FROM_TXT_FILE) {
      logger.error("You can't use both USE_PROXY_FROM_JS_FILE and USE_PROXY_FROM_TXT_FILE");
      process.exit(1);
    }
    if (settings.USE_PROXY_FROM_TXT_FILE) {
      try {
        const proxiesData = proxiesConvertor.readProxiesFromFile();
        return proxiesConvertor(proxiesData);
      } catch (error) {
        logger.error('Error reading file: ' + error.message);
        process.exit(1);
      }
    }
    return proxies;
  }

  async #run_tasks(clients) {
    if (_.isEmpty(clients) || _.size(clients) < 1) {
      logger.error('No sessions found. Create a new session.');
      process.exit(1);
    }
    const proxiesList = this.#get_proxies();
    let proxiesIterator = proxiesList ? proxiesList[Symbol.iterator]() : null;
    const tasks = clients.map(async (client, index) => {
      const proxy = proxiesIterator ? proxiesIterator.next().value : null;
      try {
        const delay = _.random(settings.DELAY_BETWEEN_STARTING_BOT[0], settings.DELAY_BETWEEN_STARTING_BOT[1]);
        logger.info(`<ye>[memefi]</ye> | ${client.session_name} | Sleeping ${delay} seconds before starting the bot`);
        await sleep(delay);
        await new Tapper(client).run(proxy);
      } catch (error) {
        logger.error(`Error in task for tg_client: ${error.message}`);
      }
    });
    await Promise.all(tasks);
  }

  async #run_tasks_query() {
    const proxiesList = this.#get_proxies();
    let proxiesIterator = proxiesList ? proxiesList[Symbol.iterator]() : null;
    const queryIdsPath = path.join(process.cwd(), 'queryIds.json');
    if (!fs.existsSync(queryIdsPath)) {
      logger.error('queryIds.json file is not missing in the current directory. Please add it and try again.');
      process.exit(1);
    }
    const queryIds = require(queryIdsPath);
    const entries = Object.entries(queryIds);
    if (!entries || _.isEmpty(entries)) {
      logger.error('queryIds.json file is empty. Add some query ids and try again.');
      process.exit(1);
    }
    const tasks = entries?.map(async ([queryId, data], index) => {
      const proxy = proxiesIterator ? proxiesIterator.next().value : null;
      try {
        const delay = _.random(settings.DELAY_BETWEEN_STARTING_BOT[0], settings.DELAY_BETWEEN_STARTING_BOT[1]);
        logger.info(`<ye>[memefi]</ye> | ${queryId} | Sleeping ${delay} seconds before starting the bot`);
        await sleep(delay);
        new NonSessionTapper(data, queryId).run(proxy);
      } catch (error) {
        logger.error(`Error in task for query_id: ${error.message}`);
      }
    });
    await Promise.all(tasks);
  }
}

const luncher = new Luncher();
module.exports = luncher;
