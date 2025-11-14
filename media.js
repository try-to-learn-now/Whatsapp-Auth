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

// For
