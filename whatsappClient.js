// whatsappClient.js
const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  DisconnectReason
} = require('baileys');
const pino = require('pino');
const {
  WA_PHONE_NUMBER,
  USE_CUSTOM_PAIRING_CODE,
  CUSTOM_PAIRING_CODE,
  COMMAND_PREFIX
} = require('./config');

const logger = pino({ level: 'silent' });

let waSock = null;
let waReady = false;

function parseWaText(msg) {
  const m = msg.message || {};
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  return '';
}

// Mention all users in a WA group but only show @everyone in text
async function mentionAllInWaGroup(sock, groupJid, messageText) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const participants = meta.participants || [];
    const mentions = participants.map((p) => p.id);

    await sock.sendMessage(groupJid, {
      text: `${messageText}\n\n@everyone`,
      mentions
    });
  } catch (e) {
    console.error('WA mentionAll error:', e.message);
    await sock.sendMessage(groupJid, {
      text: '⚠️ Failed to mention all users.'
    });
  }
}

async function initWhatsApp() {
  if (!WA_PHONE_NUMBER) {
    console.error('❌ WA_PHONE_NUMBER not set in config.js');
    return;
  }

  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
  const { version } = await fetchLatestBaileysVersion();
  console.log('Using WA version:', version.join('.'));

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    browser: Browsers.macOS('Safari'),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    markOnlineOnConnect: true,
    connectTimeoutMs: 45_000,
    syncFullHistory: false
  });

  waSock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    console.log('WA connection update:', connection || '', lastDisconnect || '');

    if (connection === 'open') {
      waReady = true;
      console.log('📲 WhatsApp connected as:', sock.user?.id);
    } else if (connection === 'close') {
      waReady = false;
      const statusCode =
        lastDisconnect?.error?.output?.statusCode || 0;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('WA reconnecting...');
        setTimeout(() => {
          initWhatsApp().catch((e) =>
            console.error('WA reconnection error:', e)
          );
        }, 2000);
      } else {
        console.log('WA logged out. Delete baileys_auth_info to re-pair.');
      }
    }
  });

  // First-time pairing (code-based, no terminal input)
  if (!sock.authState.creds.registered) {
    try {
      let code;
      if (USE_CUSTOM_PAIRING_CODE) {
        code = await sock.requestPairingCode(WA_PHONE_NUMBER, CUSTOM_PAIRING_CODE);
      } else {
        code = await sock.requestPairingCode(WA_PHONE_NUMBER);
      }

      console.log('===============================');
      console.log('📲 WhatsApp pairing code:', code);
      if (USE_CUSTOM_PAIRING_CODE) {
        console.log('Custom pairing code requested:', CUSTOM_PAIRING_CODE);
      }
      console.log('On your phone: WhatsApp → Linked Devices → Link with phone number');
      console.log('Enter your number:', WA_PHONE_NUMBER);
      console.log('Then enter this code (only once).');
      console.log('===============================');
    } catch (err) {
      console.error('❌ Failed to request pairing code:', err);
    }
  }

  // Simple WA commands: !ping, !all
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      if (!jid) continue;
      if (msg.key.fromMe) continue;

      const text = parseWaText(msg) || '';
      const isGroup = jid.endsWith('@g.us');

      // auto "hello bot"
      if (text.toLowerCase() === 'hello bot') {
        await sock.sendMessage(
          jid,
          { text: 'Hi 👋 I am alive on WhatsApp.' },
          { quoted: msg }
        );
        continue;
      }

      if (!text.startsWith(COMMAND_PREFIX)) continue;

      const [cmd, ...rest] = text.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
      const argText = rest.join(' ');

      if (cmd === 'ping') {
        await sock.sendMessage(
          jid,
          { text: 'Pong from WhatsApp ✅' },
          { quoted: msg }
        );
      } else if (cmd === 'all' || cmd === 'mentionall') {
        if (!isGroup) {
          await sock.sendMessage(
            jid,
            { text: '❌ This command only works in groups.' },
            { quoted: msg }
          );
          continue;
        }
        await mentionAllInWaGroup(sock, jid, argText || '👋 Hello everyone!');
      }
    }
  });

  return sock;
}

function getWhatsAppSocket() {
  return waSock;
}

function isWhatsAppReady() {
  return waReady;
}

module.exports = {
  initWhatsApp,
  getWhatsAppSocket,
  isWhatsAppReady,
  mentionAllInWaGroup
};
