// index.js
const { initTelegram } = require('./telegramClient');
const { initWhatsApp, isWhatsAppReady, getWhatsAppSocket } = require('./whatsappClient');
const { OWNER_WHATSAPP_NUMBER } = require('./config');

const OWNER_JID = OWNER_WHATSAPP_NUMBER + '@s.whatsapp.net';

async function main() {
  console.log('🚀 Starting TG ↔ WA media bot...');

  // Start WhatsApp
  await initWhatsApp();

  // Start Telegram
  await initTelegram();

  // Wait until WA is ready
  const check = setInterval(async () => {
    if (isWhatsAppReady()) {
      clearInterval(check);
      console.log('✅ Both Telegram & WhatsApp are ready. I am ready to work!');

      // Send ready message to your WhatsApp
      const sock = getWhatsAppSocket();
      if (sock) {
        try {
          await sock.sendMessage(OWNER_JID, {
            text: 'Bot: ✅ fully initialized & ready.'
          });
        } catch (e) {
          console.error('WA ready-msg error:', e);
        }
      }
    }
  }, 2000);

  process.once('SIGINT', () => process.exit(0));
  process.once('SIGTERM', () => process.exit(0));
}

main().catch((err) => console.error('Fatal error in main:', err));
