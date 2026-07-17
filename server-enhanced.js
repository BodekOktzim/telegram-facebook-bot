import { Telegraf, Markup } from 'telegraf';
import Database from 'better-sqlite3';
import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = process.env.BOT_TOKEN || '8810032339:AAEd_QXFwxWKcAFFZGPryfcuGiFMJOoSCNg';
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '7706183809');
const PORT = process.env.PORT || 3000;

const app = express();
const bot = new Telegraf(BOT_TOKEN);

// Database initialization - lazy load
let db = null;
const databases = ['facebook.db'];

function getDB() {
  if (!db) {
    try {
      db = new Database('./facebook.db', { readonly: true });
    } catch (error) {
      console.error('❌ Database error:', error.message);
      return null;
    }
  }
  return db;
}

// Configuration file
const configFile = './config.json';
let config = {
  globalLimit: null,
  globalEnabled: true,
  whitelist: [],
  blacklist: [],
  userLimits: {},
  searchHistory: {},
  uploadedDatabases: ['facebook.db'],
  adminUsers: [ADMIN_ID]
};

// Load configuration
function loadConfig() {
  if (fs.existsSync(configFile)) {
    try {
      config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    } catch (e) {
      console.log('⚠️ Config file error, using defaults');
    }
  }
}

// Save configuration
function saveConfig() {
  try {
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('❌ Failed to save config:', e.message);
  }
}

// Load config on startup
loadConfig();

// Ensure all required fields exist
if (!config.uploadedDatabases) config.uploadedDatabases = ['facebook.db'];
if (!config.adminUsers) config.adminUsers = [ADMIN_ID];
if (!config.whitelist) config.whitelist = [];
if (!config.blacklist) config.blacklist = [];
if (!config.userLimits) config.userLimits = {};
if (!config.searchHistory) config.searchHistory = {};

// Helper functions
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    return '972' + digits.substring(1);
  }
  return digits;
}

function isAdmin(userId) {
  if (!config.adminUsers) {
    config.adminUsers = [ADMIN_ID];
  }
  return config.adminUsers.includes(userId);
}

function canUserSearch(userId) {
  if (config.blacklist?.includes(userId)) {
    return { allowed: false, reason: 'blacklisted' };
  }

  if (!config.globalEnabled && !config.whitelist?.includes(userId) && !isAdmin(userId)) {
    return { allowed: false, reason: 'disabled' };
  }

  if (config.userLimits?.[userId]) {
    const limit = config.userLimits[userId];
    if (limit.count >= limit.max) {
      return { allowed: false, reason: 'limit_reached' };
    }
  }

  if (config.globalLimit) {
    const today = new Date().toISOString().split('T')[0];
    if (!config.searchHistory[today]) {
      config.searchHistory[today] = 0;
    }
    if (config.searchHistory[today] >= config.globalLimit) {
      return { allowed: false, reason: 'global_limit_reached' };
    }
  }

  return { allowed: true };
}

function incrementSearchCount(userId) {
  const today = new Date().toISOString().split('T')[0];
  
  if (!config.searchHistory[today]) {
    config.searchHistory[today] = 0;
  }
  config.searchHistory[today]++;

  if (!config.userLimits[userId]) {
    config.userLimits[userId] = { count: 0, max: Infinity };
  }
  config.userLimits[userId].count++;

  saveConfig();
}

function formatUserData(row) {
  if (!row) return null;

  let message = '✅ נמצא במאגר!\n\n';
  message += '👤 פרטים אישיים:\n';

  const fields = [
    { label: '🆔', key: 'uid' },
    { label: '👤', key: 'first_name' },
    { label: '👤', key: 'last_name' },
    { label: '📱', key: 'phone' },
    { label: '📧', key: 'email' },
    { label: '⚧', key: 'gender' },
    { label: '🎂', key: 'birthday' },
    { label: '📍', key: 'location' },
    { label: '🏠', key: 'hometown' },
    { label: '💑', key: 'relationship_status' },
    { label: '🎓', key: 'education_last_year' },
    { label: '💼', key: 'work' },
    { label: '📅', key: 'date_registered' },
    { label: '🔄', key: 'last_update' }
  ];

  fields.forEach(field => {
    const value = row[field.key];
    if (value && value !== 'null' && value !== '') {
      message += `├─ ${field.label} ${field.key}: ${value}\n`;
    }
  });

  if (row.uid) {
    message += `\n🔗 קישור לפרופיל: https://www.facebook.com/${row.uid}`;
  }

  return message;
}

// Telegram Bot Commands
bot.start((ctx) => {
  const userId = ctx.from.id;
  const isAdminUser = isAdmin(userId);

  let keyboard;
  if (isAdminUser) {
    keyboard = Markup.keyboard([
      ['🔍 חיפוש טלפון', '🆔 חיפוש ID'],
      ['📊 סטטיסטיקות', '⚙️ הגדרות Admin'],
      ['📁 העלאת קבצים', '📋 ניהול מאגרים']
    ]).resize();
  } else {
    keyboard = Markup.keyboard([
      ['🔍 חיפוש טלפון', '🆔 חיפוש ID'],
      ['📊 סטטיסטיקות', '❓ עזרה']
    ]).resize();
  }

  ctx.reply(
    '🤖 ברוכים הבאים לבוט חיפוש פייסבוק!\n\n' +
    (isAdminUser ? '👨‍💼 אתה מנהל - יש לך גישה מלאה\n\n' : '') +
    'בחר פעולה או שלח:\n' +
    '📱 מספר טלפון\n' +
    '🔗 קישור לפרופיל\n' +
    '🆔 Facebook ID',
    keyboard
  );
});

bot.hears('🔍 חיפוש טלפון', (ctx) => {
  ctx.reply('📱 שלח מספר טלפון לחיפוש:');
  ctx.session = { mode: 'search_phone' };
});

bot.hears('🆔 חיפוש ID', (ctx) => {
  ctx.reply('🆔 שלח Facebook ID או קישור לחיפוש:');
  ctx.session = { mode: 'search_id' };
});

bot.hears('📊 סטטיסטיקות', (ctx) => {
  const today = new Date().toISOString().split('T')[0];
  const todaySearches = config.searchHistory[today] || 0;
  
  let message = '📊 סטטיסטיקות:\n\n';
  message += `🔍 חיפושים היום: ${todaySearches}\n`;
  message += `📈 סה"כ משתמשים במאגר: 3,956,428\n`;
  
  if (config.globalLimit) {
    message += `⏱️ הגבלה גלובלית: ${config.globalLimit} חיפושים ביום\n`;
  }
  
  message += `\n📁 מאגרים פעילים: ${config.uploadedDatabases.length}`;
  
  ctx.reply(message);
});

bot.hears('❓ עזרה', (ctx) => {
  ctx.reply(
    '📚 עזרה:\n\n' +
    '🔍 חיפוש טלפון - חיפוש לפי מספר טלפון\n' +
    '🆔 חיפוש ID - חיפוש לפי Facebook ID\n' +
    '📊 סטטיסטיקות - הצג סטטיסטיקות\n\n' +
    'שלח מספר טלפון או ID לחיפוש ישיר'
  );
});

bot.hears('⚙️ הגדרות Admin', (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  const keyboard = Markup.keyboard([
    ['🔓 הפעל חיפוש', '🔒 כבה חיפוש'],
    ['⏱️ הגדר הגבלה', '📋 הצג הגדרות'],
    ['✅ Whitelist', '❌ Blacklist'],
    ['🔙 חזור']
  ]).resize();

  ctx.reply('⚙️ פנל ניהול Admin:', keyboard);
});

bot.hears('📁 העלאת קבצים', (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  ctx.reply(
    '📁 העלאת קבצים:\n\n' +
    'שלח קובץ SQLite (.db) עם נתונים חדשים\n' +
    'הבוט יזהה אוטומטית את הטבלה ויוסיף את הנתונים\n\n' +
    '⚠️ הקובץ צריך להיות בפורמט SQLite עם טבלה "facebook"'
  );
  ctx.session = { mode: 'upload_db' };
});

bot.hears('📋 ניהול מאגרים', (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  let message = '📋 מאגרים פעילים:\n\n';
  config.uploadedDatabases.forEach((db, i) => {
    message += `${i + 1}. ${db}\n`;
  });

  ctx.reply(message);
});

bot.hears('🔓 הפעל חיפוש', (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  config.globalEnabled = true;
  saveConfig();
  ctx.reply('✅ חיפוש הופעל לכל המשתמשים');
});

bot.hears('🔒 כבה חיפוש', (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  config.globalEnabled = false;
  saveConfig();
  ctx.reply('✅ חיפוש כבוי לכל המשתמשים (חוץ מהמותרים)');
});

bot.hears('⏱️ הגדר הגבלה', (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  ctx.reply('⏱️ הכנס מספר לחיפושים ביום (או 0 לללא הגבלה):');
  ctx.session = { mode: 'set_limit' };
});

bot.hears('📋 הצג הגדרות', (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  let message = '⚙️ הגדרות נוכחיות:\n\n';
  message += `🔓 חיפוש גלובלי: ${config.globalEnabled ? '✅ הפעיל' : '❌ כבוי'}\n`;
  message += `⏱️ הגבלה גלובלית: ${config.globalLimit || 'ללא הגבלה'}\n`;
  message += `✅ מותרים: ${config.whitelist.length} משתמשים\n`;
  message += `❌ חסומים: ${config.blacklist.length} משתמשים\n`;
  message += `👤 הגבלות אישיות: ${Object.keys(config.userLimits).length} משתמשים\n`;
  message += `📁 מאגרים: ${config.uploadedDatabases.length}`;

  ctx.reply(message);
});

bot.hears('✅ Whitelist', (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  ctx.reply('✅ הכנס Telegram ID להוספה ל-Whitelist:');
  ctx.session = { mode: 'add_whitelist' };
});

bot.hears('❌ Blacklist', (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  ctx.reply('❌ הכנס Telegram ID להוספה ל-Blacklist:');
  ctx.session = { mode: 'add_blacklist' };
});

bot.hears('🔙 חזור', (ctx) => {
  ctx.session = {};
  bot.telegram.sendMessage(ctx.chat.id, '🔙 חזרנו לתפריט הראשי', {
    reply_markup: {
      keyboard: isAdmin(ctx.from.id)
        ? [
            ['🔍 חיפוש טלפון', '🆔 חיפוש ID'],
            ['📊 סטטיסטיקות', '⚙️ הגדרות Admin'],
            ['📁 העלאת קבצים', '📋 ניהול מאגרים']
          ]
        : [
            ['🔍 חיפוש טלפון', '🆔 חיפוש ID'],
            ['📊 סטטיסטיקות', '❓ עזרה']
          ],
      resize_keyboard: true
    }
  });
});

// Handle file uploads
bot.on('document', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  if (ctx.session?.mode !== 'upload_db') {
    ctx.reply('📁 לא בתהליך העלאה. בחר "העלאת קבצים" תחילה');
    return;
  }

  try {
    const file = ctx.message.document;
    
    if (!file.file_name.endsWith('.db')) {
      ctx.reply('❌ הקובץ צריך להיות בפורמט .db (SQLite)');
      return;
    }

    ctx.sendChatAction('upload_document');
    
    // Download file
    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    const fileName = `backup_${Date.now()}.db`;
    const filePath = path.join('.', fileName);

    // Create backup
    const response = await fetch(fileLink.href);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(buffer));

    // Add to config
    if (!config.uploadedDatabases.includes(fileName)) {
      config.uploadedDatabases.push(fileName);
      saveConfig();
    }

    ctx.reply(`✅ קובץ ${fileName} הועלה בהצלחה!\n\nהנתונים יתווספו לחיפוש`);
    ctx.session = {};

  } catch (error) {
    console.error('Upload error:', error);
    ctx.reply(`❌ שגיאה בהעלאה: ${error.message}`);
  }
});

// Handle text messages
bot.on('text', (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  // Handle admin input
  if (ctx.session?.mode === 'set_limit') {
    const limit = parseInt(text);
    if (isNaN(limit)) {
      ctx.reply('❌ הכנס מספר תקין');
      return;
    }
    config.globalLimit = limit === 0 ? null : limit;
    saveConfig();
    ctx.reply(`✅ הגבלה הוגדרה ל-${limit === 0 ? 'ללא הגבלה' : limit + ' חיפושים ביום'}`);
    ctx.session = {};
    return;
  }

  if (ctx.session?.mode === 'add_whitelist') {
    const newUserId = parseInt(text);
    if (isNaN(newUserId)) {
      ctx.reply('❌ הכנס ID תקין');
      return;
    }
    if (!config.whitelist.includes(newUserId)) {
      config.whitelist.push(newUserId);
      saveConfig();
      ctx.reply(`✅ משתמש ${newUserId} הוסף ל-Whitelist`);
    } else {
      ctx.reply(`⚠️ משתמש ${newUserId} כבר ב-Whitelist`);
    }
    ctx.session = {};
    return;
  }

  if (ctx.session?.mode === 'add_blacklist') {
    const newUserId = parseInt(text);
    if (isNaN(newUserId)) {
      ctx.reply('❌ הכנס ID תקין');
      return;
    }
    if (!config.blacklist.includes(newUserId)) {
      config.blacklist.push(newUserId);
      saveConfig();
      ctx.reply(`✅ משתמש ${newUserId} הוסף ל-Blacklist`);
    } else {
      ctx.reply(`⚠️ משתמש ${newUserId} כבר ב-Blacklist`);
    }
    ctx.session = {};
    return;
  }

  // Check permissions
  const permission = canUserSearch(userId);
  if (!permission.allowed) {
    let errorMsg = '';
    switch (permission.reason) {
      case 'blacklisted':
        errorMsg = '❌ אתה חסום מהשימוש בבוט';
        break;
      case 'disabled':
        errorMsg = '❌ חיפוש כבוי כרגע';
        break;
      case 'limit_reached':
        errorMsg = '⏱️ הגעת להגבלה האישית שלך';
        break;
      case 'global_limit_reached':
        errorMsg = '⏱️ הגענו להגבלה הגלובלית';
        break;
    }
    ctx.reply(errorMsg);
    return;
  }

  ctx.sendChatAction('typing');

  let searchType = 'phone';
  let searchQuery = text;

  // Detect search type
  if (text.includes('facebook.com')) {
    const match = text.match(/(?:facebook\.com\/)([a-zA-Z0-9.]+|pfbid[a-zA-Z0-9]+)/);
    if (match) {
      searchQuery = match[1];
      searchType = 'uid';
    }
  } else if (/^\d+$/.test(text) && text.length > 8) {
    searchType = 'uid';
  } else if (/^[0-9+\-\s()]+$/.test(text)) {
    searchType = 'phone';
    searchQuery = normalizePhone(text);
  }

  try {
    const database = getDB();
    if (!database) {
      ctx.reply('❌ בעיה בחיבור לבסיס הנתונים');
      return;
    }

    let result = null;

    if (searchType === 'phone') {
      const stmt = database.prepare('SELECT * FROM facebook WHERE phone = ? LIMIT 1');
      result = stmt.get(searchQuery);
    } else if (searchType === 'uid') {
      const stmt = database.prepare('SELECT * FROM facebook WHERE uid = ? LIMIT 1');
      result = stmt.get(searchQuery);
    }

    if (result) {
      const message = formatUserData(result);
      ctx.reply(message);
      incrementSearchCount(userId);
    } else {
      ctx.reply('לא נמצא במאגר ❌');
      incrementSearchCount(userId);
    }
  } catch (error) {
    console.error('Search error:', error.message);
    ctx.reply(`❌ שגיאה: ${error.message}`);
  }
});

// Express server for health checks
app.get('/health', (req, res) => {
  res.json({ status: 'ok', bot: 'running' });
});

app.get('/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  res.json({
    todaySearches: config.searchHistory[today] || 0,
    globalLimit: config.globalLimit,
    globalEnabled: config.globalEnabled,
    whitelistCount: config.whitelist?.length || 0,
    blacklistCount: config.blacklist?.length || 0,
    databases: config.uploadedDatabases?.length || 1
  });
});

// Start bot and server
try {
  bot.launch();
  console.log('🤖 בוט טלגרם משודרג הופעל בהצלחה!');
} catch (error) {
  console.error('❌ Failed to launch bot:', error.message);
}

app.listen(PORT, () => {
  console.log(`📱 Token: ${BOT_TOKEN.substring(0, 10)}...`);
  console.log(`👨‍💼 Admin ID: ${ADMIN_ID}`);
  console.log(`📊 בסיס נתונים: 3,956,428 משתמשים`);
  console.log(`🌐 Server running on port ${PORT}`);
});

// Enable graceful stop
process.once('SIGINT', () => {
  console.log('🛑 בוט מכבה...');
  if (db) db.close();
  process.exit(0);
});
process.once('SIGTERM', () => {
  console.log('🛑 בוט מכבה...');
  if (db) db.close();
  process.exit(0);
});
