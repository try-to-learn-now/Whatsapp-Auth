// media.js
const axios = require('axios');
const sharp = require('sharp');
const {
  PACK_AUTHOR,
  PACK_NAME,
  OWNER_WHATSAPP_NUMBER
} = require('./config');
const { getWhatsAppSocket, isWhatsAppReady } = require('./whatsappClient');

const OWNER_JID = OWNER_WHATSAPP_NUMBER + '@s.whatsapp.net';

// For Telegram sticker "one/pack" selection
const pendingStickerChoice = new Map(); // userId -> { ctx, sticker, packName, timeout }

// -------- WhatsApp send helpers --------
async function sendStickerToWhatsApp(webpBuffer) {
  const sock = getWhatsAppSocket();
  if (!sock) throw new Error('WA socket not ready');
  await sock.sendMessage(OWNER_JID, {
    sticker: webpBuffer,
    packname: PACK_NAME,
    author: PACK_AUTHOR
  });
}

async function sendGifToWhatsApp(videoBuffer) {
  const sock = getWhatsAppSocket();
  if (!sock) throw new Error('WA socket not ready');
  await sock.sendMessage(OWNER_JID, {
    video: videoBuffer,
    gifPlayback: true,
    caption: 'GIF from Telegram'
  });
}

// -------- TG helpers --------
async function downloadTelegramFile(ctx, fileId) {
  const link = await ctx.telegram.getFileLink(fileId);
  const res = await axios.get(link.href, { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
}

async function convertImageToWebpSticker(buffer) {
  return sharp(buffer)
    .resize(512, 512, { fit: 'inside' })
    .webp({ lossless: true })
    .toBuffer();
}

// -------- Handlers exported to telegramClient --------

async function handlePhoto(ctx) {
  if (!isWhatsAppReady()) {
    await ctx.reply('⚠️ WhatsApp not ready yet. Try again in a moment.');
    return;
  }

  const chatId = ctx.chat.id;

  try {
    const photos = ctx.message.photo || [];
    if (!photos.length) return;
    const best = photos[photos.length - 1];
    const fileId = best.file_id;

    const buf = await downloadTelegramFile(ctx, fileId);
    const webp = await convertImageToWebpSticker(buf);
    await sendStickerToWhatsApp(webp);

    await ctx.telegram.sendMessage(
      chatId,
      '✅ Converted photo to sticker & sent to WhatsApp.'
    );
  } catch (e) {
    console.error('TG photo->sticker error:', e);
    await ctx.reply('❌ Failed to convert photo to sticker.');
  }
}

async function handleAnimation(ctx) {
  if (!isWhatsAppReady()) {
    await ctx.reply('⚠️ WhatsApp not ready yet. Try again in a moment.');
    return;
  }

  const chatId = ctx.chat.id;

  try {
    const anim = ctx.message.animation;
    if (!anim || !anim.file_id) return;

    const buf = await downloadTelegramFile(ctx, anim.file_id);
    await sendGifToWhatsApp(buf);

    await ctx.telegram.sendMessage(
      chatId,
      '✅ Sent this GIF/animation to your WhatsApp as GIF.'
    );
  } catch (e) {
    console.error('TG animation->gif error:', e);
    await ctx.reply('❌ Failed to send GIF to WhatsApp.');
  }
}

async function handleSticker(ctx) {
  const sticker = ctx.message.sticker;
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  if (!isWhatsAppReady()) {
    await ctx.reply('⚠️ WhatsApp not ready yet. Try again in a moment.');
    return;
  }

  if (sticker.is_animated || sticker.is_video) {
    await ctx.reply(
      '⚠️ Telegram animated/video stickers (.tgs/.webm) not supported as WA stickers yet.\nSend it as GIF instead.'
    );
    return;
  }

  const packName = sticker.set_name || null;

  // clear previous choice
  const old = pendingStickerChoice.get(userId);
  if (old && old.timeout) clearTimeout(old.timeout);

  await ctx.reply(
    '🧩 What do you want to convert?\n\n' +
      'Reply within 5 seconds:\n' +
      '👉 "one"  – only this sticker\n' +
      '👉 "pack" – full sticker pack' +
      (packName ? ` (${packName})` : '') +
      '\n\n' +
      '⏰ Default (no reply): full pack (if pack exists)'
  );

  const timeout = setTimeout(async () => {
    const entry = pendingStickerChoice.get(userId);
    if (!entry) return;

    pendingStickerChoice.delete(userId);

    if (packName) {
      await ctx.telegram.sendMessage(
        chatId,
        '⏰ No answer, converting full pack by default...'
      );
      await processStickerPack(ctx, packName);
    } else {
      await ctx.telegram.sendMessage(
        chatId,
        '⏰ No answer & no pack name found. Sending only this sticker.'
      );
      await processSingleSticker(ctx, sticker);
    }
  }, 5000);

  pendingStickerChoice.set(userId, {
    ctx,
    sticker,
    packName,
    timeout
  });
}

// text handler used for "one"/"pack" + pack links
async function handleText(ctx) {
  const text = (ctx.message.text || '').trim().toLowerCase();
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  const entry = pendingStickerChoice.get(userId);
  if (entry) {
    if (entry.timeout) clearTimeout(entry.timeout);
    pendingStickerChoice.delete(userId);

    if (text.includes('one')) {
      await ctx.reply('✅ Converting only this sticker...');
      await processSingleSticker(entry.ctx, entry.sticker);
      return true;
    }

    if (text.includes('pack')) {
      if (entry.packName) {
        await ctx.reply(`✅ Converting full pack (${entry.packName})...`);
        await processStickerPack(entry.ctx, entry.packName);
        return true;
      } else {
        await ctx.reply(
          '⚠️ No pack name found. Converting only this sticker.'
        );
        await processSingleSticker(entry.ctx, entry.sticker);
        return true;
      }
    }
    // if other random text, fall through
  }

  // Check for pack link: https://t.me/addstickers/PackName
  const maybePack = extractPackNameFromLink(ctx.message.text || '');
  if (maybePack) {
    if (!isWhatsAppReady()) {
      await ctx.reply('⚠️ WhatsApp not ready yet. Try again in a moment.');
      return true;
    }

    await ctx.reply(
      `🔗 Pack link detected. Converting full pack: ${maybePack} ...`
    );
    await processStickerPack(ctx, maybePack);
    return true;
  }

  // not handled
  return false;
}

// ---- internal sticker converters ----
async function processSingleSticker(ctx, sticker) {
  const chatId = ctx.chat.id;
  try {
    const inputBuf = await downloadTelegramFile(ctx, sticker.file_id);
    const webp = await convertImageToWebpSticker(inputBuf);
    await sendStickerToWhatsApp(webp);

    await ctx.telegram.sendMessage(
      chatId,
      '✅ Sent this sticker to your WhatsApp.'
    );
  } catch (e) {
    console.error('processSingleSticker error:', e);
    await ctx.telegram.sendMessage(
      chatId,
      '❌ Failed to convert/send this sticker.'
    );
  }
}

async function processStickerPack(ctx, packName) {
  const chatId = ctx.chat.id;

  try {
    const set = await ctx.telegram.getStickerSet(packName);
    await ctx.telegram.sendMessage(
      chatId,
      `⏳ Converting full pack: "${set.title}" (${set.stickers.length} stickers)...`
    );

    for (const st of set.stickers) {
      if (st.is_animated || st.is_video) {
        console.log('Skipping animated/video sticker in pack');
        continue;
      }
      try {
        const buf = await downloadTelegramFile(ctx, st.file_id);
        const webp = await convertImageToWebpSticker(buf);
        await sendStickerToWhatsApp(webp);
        await new Promise((res) => setTimeout(res, 300));
      } catch (e) {
        console.error('Error in one sticker from pack:', e);
      }
    }

    await ctx.telegram.sendMessage(
      chatId,
      `✅ Finished sending full pack "${set.title}" to your WhatsApp.`
    );
  } catch (e) {
    console.error('processStickerPack error:', e);
    await ctx.telegram.sendMessage(
      chatId,
      '❌ Failed to fetch or convert full sticker pack.'
    );
  }
}

// ---- utils ----
function extractPackNameFromLink(text) {
  const match = text.match(/t\.me\/addstickers\/([A-Za-z0-9_]+)/);
  return match ? match[1] : null;
}

module.exports = {
  handlePhoto,
  handleAnimation,
  handleSticker,
  handleText
};
