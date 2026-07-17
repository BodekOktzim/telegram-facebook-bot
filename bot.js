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

// Middleware
app.use(express.json());

// Database initialization
let db = null;

function getDB() {
  if (!db) {
    try {
      db = new Database('./facebook.db', { readonly: true });
      console.log('✅ Database connected');
    } catch (error) {
      console.error('❌ Database error:', error.message);
      return null;
    }
  }
  return db;
}

// Configuration
const configFile = './config.json';
const uploadsDir = './uploads';

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

let config = {
  uploadedFiles: [],
  adminUsers: [ADMIN_ID]
};

function loadConfig() {
  try {
    if (fs.existsSync(configFile)) {
      const data = fs.readFileSync(configFile, 'utf8');
      config = { ...config, ...JSON.parse(data) };
      console.log('✅ Config loaded');
    }
  } catch (e) {
    console.error('⚠️ Config error:', e.message);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('❌ Save config error:', e.message);
  }
}

loadConfig();

// Helpers
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    return '972' + digits.substring(1);
  }
  return digits;
}

function isAdmin(userId) {
  return config.adminUsers?.includes(userId) || userId === ADMIN_ID;
}

function canUserSearch(userId) {
  return { allowed: true };
}

function incrementSearchCount(userId) {
  // No tracking
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

// Bot Commands
bot.start((ctx) => {
  try {
    const userId = ctx.from.id;
    const isAdminUser = isAdmin(userId);

    let keyboard;
    if (isAdminUser) {
      keyboard = Markup.keyboard([
        ['🔍 חיפוש טלפון', '🆔 חיפוש ID'],
        ['📊 סטטיסטיקות', '⚙️ הגדרות'],
        ['📁 העלאת קבצים', '📋 קבצים']
      ]).resize();
    } else {
      keyboard = Markup.keyboard([
        ['🔍 חיפוש טלפון', '🆔 חיפוש ID'],
        ['📊 סטטיסטיקות', '❓ עזרה']
      ]).resize();
    }

    ctx.reply(
      '🤖 ברוכים הבאים לבוט חיפוש!\n\n' +
      (isAdminUser ? '👨‍💼 אתה מנהל\n\n' : '') +
      'בחר פעולה או שלח:\n' +
      '📱 מספר טלפון\n' +
      '🆔 Facebook ID\n' +
      '🔗 קישור לפרופיל',
      keyboard
    );
  } catch (error) {
    console.error('Start command error:', error);
    ctx.reply('❌ שגיאה בהתחלה');
  }
});

// Button handlers
bot.hears('🔍 חיפוש טלפון', (ctx) => {
  ctx.reply('📱 שלח מספר טלפון:');
  ctx.session = { mode: 'search_phone' };
});

bot.hears('🆔 חיפוש ID', (ctx) => {
  ctx.reply('🆔 שלח ID או קישור:');
  ctx.session = { mode: 'search_id' };
});

bot.hears('📊 סטטיסטיקות', (ctx) => {
  try {
    let message = '📊 סטטיסטיקות:\n\n';
    message += `📈 משתמשים במאגר: 3,956,428\n`;
    message += `📁 קבצים: ${config.uploadedFiles?.length || 1}\n`;
    message += `🔓 חיפוש: ללא הגבלות`;
    
    ctx.reply(message);
  } catch (error) {
    ctx.reply('❌ שגיאה בסטטיסטיקות');
  }
});

bot.hears('❓ עזרה', (ctx) => {
  ctx.reply(
    '📚 עזרה:\n\n' +
    '🔍 חיפוש טלפון\n' +
    '🆔 חיפוש ID\n' +
    '📊 סטטיסטיקות\n\n' +
    'שלח מספר או ID לחיפוש'
  );
});

bot.hears('⚙️ הגדרות', (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('❌ רק Admin');
    return;
  }

  const keyboard = Markup.keyboard([
    ['📋 הצג הגדרות'],
    ['🔙 חזור']
  ]).resize();

  ctx.reply('⚙️ הגדרות Admin:', keyboard);
});

bot.hears('📁 העלאת קבצים', (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('❌ רק Admin');
    return;
  }

  ctx.reply(
    '📁 העלאת קבצים:\n\n' +
    'סוגים נתמכים:\n' +
    '✅ SQLite (.db)\n' +
    '✅ CSV (.csv)\n' +
    '✅ JSON (.json)\n' +
    '✅ Excel (.xlsx)\n' +
    '✅ Text (.txt)\n\n' +
    'שלח קובץ עכשיו:'
  );
});

bot.hears('📋 קבצים', (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('❌ רק Admin');
    return;
  }

  try {
    let message = '📋 קבצים:\n\n';
    if (config.uploadedFiles?.length > 0) {
      config.uploadedFiles.forEach((file, i) => {
        message += `${i + 1}. ${file.name}\n   📊 ${file.type} | 📅 ${file.date}\n`;
      });
    } else {
      message = '📁 אין קבצים';
    }
    ctx.reply(message);
  } catch (error) {
    ctx.reply('❌ שגיאה');
  }
});

bot.hears('📋 הצג הגדרות', (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  let msg = '⚙️ הגדרות:\n\n';
  msg += `🔓 חיפוש: ללא הגבלות\n`;
  msg += `📁 קבצים: ${config.uploadedFiles?.length || 1}\n`;
  msg += `👥 משתמשים במאגר: 3,956,428`;
  ctx.reply(msg);
});

bot.hears('🔙 חזור', (ctx) => {
  ctx.session = {};
  const isAdminUser = isAdmin(ctx.from.id);
  const keyboard = isAdminUser
    ? Markup.keyboard([
        ['🔍 חיפוש טלפון', '🆔 חיפוש ID'],
        ['📊 סטטיסטיקות', '⚙️ הגדרות'],
        ['📁 העלאת קבצים', '📋 קבצים']
      ]).resize()
    : Markup.keyboard([
        ['🔍 חיפוש טלפון', '🆔 חיפוש ID'],
        ['📊 סטטיסטיקות', '❓ עזרה']
      ]).resize();

  ctx.reply('🔙 חזרנו', keyboard);
});

// File upload handler
bot.on('document', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('❌ רק Admin');
    return;
  }

  try {
    const file = ctx.message.document;
    const fileName = file.file_name;
    const fileExt = path.extname(fileName).toLowerCase();

    // Supported formats
    const supported = ['.db', '.csv', '.json', '.xlsx', '.txt'];
    if (!supported.includes(fileExt)) {
      ctx.reply(`❌ סוג קובץ לא נתמך: ${fileExt}\n✅ נתמכים: ${supported.join(', ')}`);
      return;
    }

    ctx.sendChatAction('upload_document');

    // Download file
    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    const response = await fetch(fileLink.href);
    const buffer = await response.arrayBuffer();

    // Save file
    const uniqueName = `${Date.now()}_${fileName}`;
    const filePath = path.join(uploadsDir, uniqueName);
    fs.writeFileSync(filePath, Buffer.from(buffer));

    // Add to config
    config.uploadedFiles = config.uploadedFiles || [];
    config.uploadedFiles.push({
      name: fileName,
      path: uniqueName,
      type: fileExt.substring(1).toUpperCase(),
      date: new Date().toISOString().split('T')[0],
      size: buffer.byteLength
    });
    saveConfig();

    ctx.reply(`✅ קובץ ${fileName} הועלה!\n📊 סוג: ${fileExt}\n💾 גודל: ${(buffer.byteLength / 1024 / 1024).toFixed(2)}MB`);

  } catch (error) {
    console.error('Upload error:', error);
    ctx.reply(`❌ שגיאה: ${error.message}`);
  }
});

// Text message handler
bot.on('text', (ctx) => {
  try {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    // No restrictions - everyone can search

    ctx.sendChatAction('typing');

    let searchType = 'phone';
    let searchQuery = text;

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

    const database = getDB();
    if (!database) {
      ctx.reply('❌ בעיה בבסיס נתונים');
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
      ctx.reply('לא נמצא ❌');
      incrementSearchCount(userId);
    }
  } catch (error) {
    console.error('Text handler error:', error);
    ctx.reply('❌ שגיאה');
  }
});

// Express endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'ok', bot: 'running', timestamp: new Date().toISOString() });
});

app.get('/stats', (req, res) => {
  res.json({
    status: 'ok',
    databaseRecords: 3956428,
    uploadedFiles: config.uploadedFiles?.length || 1,
    restrictions: 'none',
    timestamp: new Date().toISOString()
  });
});

// Error handler
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ שגיאה בבוט').catch(e => console.error('Reply error:', e));
});

// Start services
async function start() {
  try {
    // Test database
    const testDb = getDB();
    if (testDb) {
      const count = testDb.prepare('SELECT COUNT(*) as cnt FROM facebook').get();
      console.log(`✅ Database ready: ${count.cnt} records`);
    }

    // Start server first
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🌐 Server on port ${PORT}`);
      console.log(`👨‍💼 Admin: ${ADMIN_ID}`);
    });

    // Launch bot with error handling
    try {
      await bot.launch();
      console.log('🤖 Bot launched');
    } catch (botError) {
      console.warn('⚠️ Bot warning:', botError.message);
    }

    console.log('✅ Bot fully operational!');
  } catch (error) {
    console.error('❌ Startup error:', error);
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down...');
  if (db) db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  if (db) db.close();
  process.exit(0);
});
