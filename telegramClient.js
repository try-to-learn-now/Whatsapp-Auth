// telegramClient.js
const { Telegraf } = require('telegraf');
const { TELEGRAM_BOT_TOKEN, PACK_AUTHOR } = require('./config');
const {
  handlePhoto,
  handleAnimation,
  handleSticker,
  handleText
} = require('./media');

let tgBot = null;

async function initTelegram() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN not set in config.js');
    return;
  }

  const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

  bot.start((ctx) =>
    ctx.reply(
      '👋 Yo!\n' +
        'Send me:\n' +
        '• Photo → I make sticker on WhatsApp\n' +
        '• Static sticker → I send sticker or full pack on WhatsApp\n' +
        '• GIF/animation → I send GIF on WhatsApp\n\n' +
        `Sticker author: ${PACK_AUTHOR}`
    )
  );

  // Debug log
  bot.on('message', (ctx, next) => {
    console.log(
      'TG message from',
      ctx.from.username || ctx.from.id,
      'type:',
      Object.keys(ctx.message)
    );
    return next();
  });

  bot.on('photo', handlePhoto);
  bot.on('animation', handleAnimation);
  bot.on('sticker', handleSticker);

  bot.on('text', async (ctx) => {
    const text = (ctx.message.text || '').trim().toLowerCase();

    // Simple ping
    if (text === '/ping') {
      await ctx.reply('Pong from Telegram ✅');
      return;
    }

    // Let media.js handle "one"/"pack" and pack links
    const handled = await handleText(ctx);
    if (handled) return;
  });

  await bot.launch();
  console.log('🤖 Telegram bot is ready.');
  tgBot = bot;
}

function getTelegramBot() {
  return tgBot;
}

module.exports = { initTelegram, getTelegramBot };
