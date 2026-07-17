import { Telegraf, Markup } from 'telegraf';
import Database from 'better-sqlite3';
import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import busboy from 'busboy';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = process.env.BOT_TOKEN || '8810032339:AAEd_QXFwxWKcAFFZGPryfcuGiFMJOoSCNg';
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '7706183809');
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `https://telegram-facebook-bot-dg7x.onrender.com`;

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
  adminUsers: [ADMIN_ID],
  fileHashes: {} // Track file hashes for duplicates
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
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function getTotalSize() {
  if (!config.uploadedFiles || config.uploadedFiles.length === 0) return '0 B';
  
  let total = 0;
  config.uploadedFiles.forEach(file => {
    const sizeStr = file.size;
    const parts = sizeStr.split(' ');
    const num = parseFloat(parts[0]);
    const unit = parts[1];
    
    const multipliers = { 'B': 1, 'KB': 1024, 'MB': 1024*1024, 'GB': 1024*1024*1024, 'TB': 1024*1024*1024*1024 };
    total += num * (multipliers[unit] || 1);
  });
  
  return formatFileSize(total);
}

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
});

bot.hears('🆔 חיפוש ID', (ctx) => {
  ctx.reply('🆔 שלח ID או קישור:');
});

bot.hears('📊 סטטיסטיקות', (ctx) => {
  try {
    let message = '📊 סטטיסטיקות:\n\n';
    message += `📈 משתמשים במאגר: 3,956,428\n`;
    message += `📁 קבצים מועלים: ${config.uploadedFiles?.length || 0}\n`;
    message += `💾 גודל כולל: ${getTotalSize()}\n`;
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

  const uploadUrl = `${BASE_URL}/upload-page?adminId=${ctx.from.id}`;
  ctx.reply(
    '📁 העלאת קבצים ללא הגבלה:\n\n' +
    '✅ ניתן להעלות קבצים בכל גודל (גם כמה GB!)\n' +
    '✅ העלאה מתבצעת דרך הדפדפן כדי לעקוף את מגבלת טלגרם\n\n' +
    'לחץ על הקישור להעלאה:\n' +
    uploadUrl,
    Markup.inlineKeyboard([
      Markup.button.url('🌐 פתח דף העלאה', uploadUrl)
    ])
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
      config.uploadedFiles.slice(-20).forEach((file, i) => {
        message += `${i + 1}. ${file.name}\n   📊 ${file.type} | 💾 ${file.size} | 📅 ${file.date}\n`;
      });
      if (config.uploadedFiles.length > 20) {
        message += `\n... ועוד ${config.uploadedFiles.length - 20} קבצים`;
      }
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
  msg += `📁 קבצים: ${config.uploadedFiles?.length || 0}\n`;
  msg += `👥 משתמשים במאגר: 3,956,428\n`;
  msg += `💾 גודל כולל: ${getTotalSize()}`;
  ctx.reply(msg);
});

bot.hears('🔙 חזור', (ctx) => {
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

// Document upload handler (Still kept for small files via Telegram)
bot.on('document', async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('❌ רק Admin');
    return;
  }

  try {
    ctx.sendChatAction('upload_document');

    const file = ctx.message.document;
    const fileName = file.file_name;
    const fileExt = path.extname(fileName).toLowerCase();

    // Download file
    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    const response = await fetch(fileLink.href);
    const buffer = await response.arrayBuffer();
    const bufferObj = Buffer.from(buffer);

    // Save file
    const uniqueName = `${Date.now()}_${fileName}`;
    const filePath = path.join(uploadsDir, uniqueName);
    fs.writeFileSync(filePath, bufferObj);

    // Add to config
    config.uploadedFiles = config.uploadedFiles || [];
    config.uploadedFiles.push({
      name: fileName,
      path: uniqueName,
      type: fileExt.substring(1).toUpperCase() || 'FILE',
      date: new Date().toISOString().split('T')[0],
      size: formatFileSize(bufferObj.byteLength)
    });

    saveConfig();

    ctx.reply(
      `✅ קובץ ${fileName} הועלה בהצלחה!\n\n` +
      `📊 סוג: ${fileExt || 'לא ידוע'}\n` +
      `💾 גודל: ${formatFileSize(bufferObj.byteLength)}`
    );

  } catch (error) {
    console.error('Upload error:', error);
    ctx.reply(`❌ שגיאה בהעלאה: ${error.message}`);
  }
});

// Text message handler
bot.on('text', (ctx) => {
  try {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return; // Ignore commands

    ctx.sendChatAction('typing');

    let searchType = 'phone';
    let searchQuery = text;

    if (text.includes('facebook.com')) {
      let match = text.match(/(?:facebook\.com\/(?:profile\.php\?id=|groups\/|pages\/[^\/]+\/|)([a-zA-Z0-9.]+))/);
      if (match && match[1]) {
        searchQuery = match[1];
        searchType = "uid";
      } else {
        match = text.match(/(?:facebook\.com\/)([a-zA-Z0-9.]+)/);
        if (match && match[1]) {
          searchQuery = match[1];
          searchType = "uid";
        }
      }
    } else if (/^\d+$/.test(text) && text.length > 8) {
      searchType = "uid";
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
      ctx.reply(formatUserData(result));
    } else {
      ctx.reply('לא נמצא ❌');
    }
  } catch (error) {
    console.error('Text handler error:', error);
    ctx.reply('❌ שגיאה');
  }
});

// --- Web Server Endpoints for Large File Uploads ---

app.get('/upload-page', (req, res) => {
  const adminId = parseInt(req.query.adminId);
  if (!isAdmin(adminId)) {
    return res.status(403).send('Unauthorized');
  }

  res.send(`
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>העלאת קבצים גדולים</title>
      <style>
        body { font-family: sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); width: 100%; max-width: 400px; text-align: center; }
        h1 { color: #1c1e21; font-size: 1.5rem; }
        input[type="file"] { margin: 1.5rem 0; width: 100%; }
        button { background: #0088cc; color: white; border: none; padding: 0.8rem 1.5rem; border-radius: 4px; cursor: pointer; font-size: 1rem; width: 100%; }
        button:disabled { background: #ccc; }
        #progress-container { margin-top: 1.5rem; display: none; }
        #progress-bar { background: #e9ecef; border-radius: 4px; height: 20px; width: 100%; overflow: hidden; }
        #progress-fill { background: #0088cc; height: 100%; width: 0%; transition: width 0.3s; }
        #status { margin-top: 1rem; font-size: 0.9rem; color: #65676b; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>📁 העלאת קבצים ללא הגבלה</h1>
        <p>בחר קובץ (בכל גודל) להעלאה לשרת</p>
        <input type="file" id="fileInput">
        <button id="uploadBtn">התחל העלאה</button>
        
        <div id="progress-container">
          <div id="progress-bar"><div id="progress-fill"></div></div>
          <p id="status">מכין העלאה...</p>
        </div>
      </div>

      <script>
        const fileInput = document.getElementById('fileInput');
        const uploadBtn = document.getElementById('uploadBtn');
        const progressContainer = document.getElementById('progress-container');
        const progressFill = document.getElementById('progress-fill');
        const status = document.getElementById('status');

        uploadBtn.onclick = async () => {
          if (!fileInput.files.length) return alert('אנא בחר קובץ');
          
          const file = fileInput.files[0];
          uploadBtn.disabled = true;
          progressContainer.style.display = 'block';
          
          const formData = new FormData();
          formData.append('file', file);

          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/upload-stream?adminId=${adminId}', true);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              progressFill.style.width = percent + '%';
              status.innerText = 'מעלה: ' + percent + '% (' + formatSize(e.loaded) + ' מתוך ' + formatSize(e.total) + ')';
            }
          };

          xhr.onload = () => {
            if (xhr.status === 200) {
              status.innerText = '✅ ההעלאה הושלמה בהצלחה!';
              status.style.color = 'green';
            } else {
              status.innerText = '❌ שגיאה בהעלאה: ' + xhr.responseText;
              status.style.color = 'red';
              uploadBtn.disabled = false;
            }
          };

          xhr.onerror = () => {
            status.innerText = '❌ שגיאה בחיבור לשרת';
            status.style.color = 'red';
            uploadBtn.disabled = false;
          };

          xhr.send(formData);
        };

        function formatSize(bytes) {
          if (bytes === 0) return '0 B';
          const k = 1024;
          const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
        }
      </script>
    </body>
    </html>
  `);
});

app.post('/upload-stream', (req, res) => {
  const adminId = parseInt(req.query.adminId);
  if (!isAdmin(adminId)) {
    return res.status(403).send('Unauthorized');
  }

  const bb = busboy({ headers: req.headers });
  let fileName = '';
  let filePath = '';
  let fileSize = 0;

  bb.on('file', (name, file, info) => {
    fileName = info.filename;
    const uniqueName = `${Date.now()}_${fileName}`;
    filePath = path.join(uploadsDir, uniqueName);
    const saveTo = fs.createWriteStream(filePath);
    
    file.on('data', (data) => {
      fileSize += data.length;
    });

    file.pipe(saveTo);
  });

  bb.on('finish', () => {
    const fileExt = path.extname(fileName).toLowerCase();
    config.uploadedFiles = config.uploadedFiles || [];
    config.uploadedFiles.push({
      name: fileName,
      path: path.basename(filePath),
      type: fileExt.substring(1).toUpperCase() || 'FILE',
      date: new Date().toISOString().split('T')[0],
      size: formatFileSize(fileSize)
    });
    saveConfig();

    // Notify admin via bot
    bot.telegram.sendMessage(ADMIN_ID, `✅ קובץ גדול הועלה בהצלחה!\n\n📄 שם: ${fileName}\n💾 גודל: ${formatFileSize(fileSize)}`);
    
    res.status(200).send('Success');
  });

  req.pipe(bb);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', bot: 'running', timestamp: new Date().toISOString() });
});

// Start services
async function start() {
  try {
    const database = getDB();
    if (database) {
      const count = database.prepare('SELECT COUNT(*) as cnt FROM facebook').get();
      console.log(`✅ Database ready: ${count.cnt} records`);
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🌐 Server on port ${PORT}`);
    });

    await bot.launch();
    console.log('🤖 Bot launched');
  } catch (error) {
    console.error('❌ Startup error:', error);
    process.exit(1);
  }
}

start();

process.on('SIGINT', () => {
  bot.stop();
  if (db) db.close();
  process.exit(0);
});
