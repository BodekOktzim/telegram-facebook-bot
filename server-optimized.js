import { Telegraf } from 'telegraf';
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
  searchHistory: {}
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

// Helper functions
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    return '972' + digits.substring(1);
  }
  return digits;
}

function canUserSearch(userId) {
  if (config.blacklist.includes(userId)) {
    return { allowed: false, reason: 'blacklisted' };
  }

  if (!config.globalEnabled && !config.whitelist.includes(userId) && userId !== ADMIN_ID) {
    return { allowed: false, reason: 'disabled' };
  }

  if (config.userLimits[userId]) {
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
  ctx.reply(
    '🤖 ברוכים הבאים לבוט חיפוש פייסבוק!\n\n' +
    'שלח לי:\n' +
    '📱 מספר טלפון\n' +
    '🔗 קישור לפרופיל\n' +
    '🆔 Facebook ID\n\n' +
    'או בחר פקודה:\n' +
    '/help - עזרה\n' +
    '/stats - סטטיסטיקות'
  );
});

bot.command('help', (ctx) => {
  ctx.reply(
    '📚 עזרה:\n\n' +
    '/start - התחלה\n' +
    '/help - עזרה\n' +
    '/stats - סטטיסטיקות\n' +
    '/admin - פנל ניהול (רק למנהל)\n\n' +
    'שלח מספר טלפון או ID לחיפוש'
  );
});

bot.command('stats', (ctx) => {
  const today = new Date().toISOString().split('T')[0];
  const todaySearches = config.searchHistory[today] || 0;
  
  let message = '📊 סטטיסטיקות:\n\n';
  message += `🔍 חיפושים היום: ${todaySearches}\n`;
  message += `📈 סה"כ משתמשים במאגר: 3,956,428\n`;
  
  if (config.globalLimit) {
    message += `⏱️ הגבלה גלובלית: ${config.globalLimit} חיפושים ביום\n`;
  }
  
  ctx.reply(message);
});

bot.command('admin', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  ctx.reply(
    '⚙️ פנל ניהול:\n\n' +
    '/set_global_limit <מספר> - הגדר הגבלה גלובלית\n' +
    '/disable_global - כבה חיפוש לכל המשתמשים\n' +
    '/enable_global - הפעל חיפוש לכל המשתמשים\n' +
    '/whitelist_user <ID> - הוסף למותר\n' +
    '/blacklist_user <ID> - הוסף לחסום\n' +
    '/set_user_limit <ID> <מספר> - הגדר הגבלה למשתמש\n' +
    '/config_status - הצג הגדרות נוכחיות'
  );
});

bot.command('set_global_limit', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  const limit = parseInt(ctx.message.text.split(' ')[1]);
  if (isNaN(limit)) {
    ctx.reply('❌ הגדר מספר תקין');
    return;
  }

  config.globalLimit = limit;
  saveConfig();
  ctx.reply(`✅ הגבלה גלובלית הוגדרה ל-${limit} חיפושים ביום`);
});

bot.command('disable_global', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  config.globalEnabled = false;
  saveConfig();
  ctx.reply('✅ חיפוש כבוי לכל המשתמשים (חוץ מהמותרים)');
});

bot.command('enable_global', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  config.globalEnabled = true;
  saveConfig();
  ctx.reply('✅ חיפוש הופעל לכל המשתמשים');
});

bot.command('whitelist_user', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  const userId = parseInt(ctx.message.text.split(' ')[1]);
  if (isNaN(userId)) {
    ctx.reply('❌ הגדר ID תקין');
    return;
  }

  if (!config.whitelist.includes(userId)) {
    config.whitelist.push(userId);
    saveConfig();
    ctx.reply(`✅ משתמש ${userId} הוסף למותרים`);
  } else {
    ctx.reply(`⚠️ משתמש ${userId} כבר במותרים`);
  }
});

bot.command('blacklist_user', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  const userId = parseInt(ctx.message.text.split(' ')[1]);
  if (isNaN(userId)) {
    ctx.reply('❌ הגדר ID תקין');
    return;
  }

  if (!config.blacklist.includes(userId)) {
    config.blacklist.push(userId);
    saveConfig();
    ctx.reply(`✅ משתמש ${userId} חסום`);
  } else {
    ctx.reply(`⚠️ משתמש ${userId} כבר חסום`);
  }
});

bot.command('set_user_limit', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  const args = ctx.message.text.split(' ');
  const userId = parseInt(args[1]);
  const limit = parseInt(args[2]);

  if (isNaN(userId) || isNaN(limit)) {
    ctx.reply('❌ הגדר ID ומספר תקינים');
    return;
  }

  config.userLimits[userId] = { count: 0, max: limit };
  saveConfig();
  ctx.reply(`✅ הגבלה למשתמש ${userId} הוגדרה ל-${limit}`);
});

bot.command('config_status', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    ctx.reply('❌ אתה לא מנהל');
    return;
  }

  let message = '⚙️ הגדרות נוכחיות:\n\n';
  message += `🔓 חיפוש גלובלי: ${config.globalEnabled ? '✅ הפעיל' : '❌ כבוי'}\n`;
  message += `⏱️ הגבלה גלובלית: ${config.globalLimit || 'ללא הגבלה'}\n`;
  message += `✅ מותרים: ${config.whitelist.length} משתמשים\n`;
  message += `❌ חסומים: ${config.blacklist.length} משתמשים\n`;
  message += `👤 הגבלות אישיות: ${Object.keys(config.userLimits).length} משתמשים\n`;

  ctx.reply(message);
});

// Handle text messages
bot.on('text', (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

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
    whitelistCount: config.whitelist.length,
    blacklistCount: config.blacklist.length
  });
});

// Start bot and server
try {
  bot.launch();
  console.log('🤖 בוט טלגרם הופעל בהצלחה!');
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
