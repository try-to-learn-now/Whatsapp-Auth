// config.js
module.exports = {
  // Telegram bot token
  TELEGRAM_BOT_TOKEN: 'YOUR_TELEGRAM_BOT_TOKEN_HERE',

  // WhatsApp number with country code, NO '+'
  // Example India: '91XXXXXXXXXX'
  WA_PHONE_NUMBER: '91XXXXXXXXXX',

  // Where bot sends stickers/GIFs (usually same number)
  OWNER_WHATSAPP_NUMBER: '91XXXXXXXXXX',

  // Pairing code behavior for WhatsApp (first time only)
  USE_CUSTOM_PAIRING_CODE: true,
  CUSTOM_PAIRING_CODE: 'NITESH1',

  // Sticker pack metadata (universal)
  PACK_AUTHOR: 'Instagram @NiteshJeee | Snap @NiteshJeee',
  PACK_NAME: 'Nitesh Universal Pack',

  // Command prefix for future (WhatsApp side)
  COMMAND_PREFIX: '!'
};
