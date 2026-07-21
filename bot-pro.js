import { Telegraf, Markup } from 'telegraf';
import Database from 'better-sqlite3';
import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import busboy from 'busboy';
import admzip from 'adm-zip';
import csv from 'csv-parser';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = process.env.BOT_TOKEN || '8810032339:AAEd_QXFwxWKcAFFZGPryfcuGiFMJOoSCNg';
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '7706183809');
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `https://telegram-facebook-bot-dg7x.onrender.com`;

const app = express();
const bot = new Telegraf(BOT_TOKEN);

app.use(express.json());

// Configuration
const configFile = './config.json';
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

let config = {
  uploadedFiles: [],
  adminUsers: [ADMIN_ID]
};

function loadConfig() {
  try {
    if (fs.existsSync(configFile)) {
      const data = fs.readFileSync(configFile, 'utf8');
      config = { ...config, ...JSON.parse(data) };
    }
  } catch (e) { console.error('Config error:', e.message); }
}

function saveConfig() {
  try {
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  } catch (e) { console.error('Save config error:', e.message); }
}

loadConfig();

// --- Hebrew Translation Mapping ---
const countryTranslation = {
  'israel': 'ישראל',
  'facebook.db': 'ישראל',
  'china': 'סין',
  'albania': 'אלבניה',
  'afghanistan': 'אפגניסטן',
  'maldives': 'המלדיביים',
  'brazil': 'ברזיל',
  'usa': 'ארה"ב',
  'russia': 'רוסיה',
  'france': 'צרפת',
  'germany': 'גרמניה',
  'italy': 'איטליה',
  'spain': 'ספרד',
  'turkey': 'טורקיה',
  'egypt': 'מצרים',
  'jordan': 'ירדן',
  'lebanon': 'לבנון',
  'syria': 'סוריה',
  'iraq': 'עיראק',
  'iran': 'איראן',
  'india': 'הודו',
  'uk': 'בריטניה',
  'canada': 'קנדה'
};

function getHebrewName(filename) {
  const lowerName = filename.toLowerCase();
  for (const [eng, heb] of Object.entries(countryTranslation)) {
    if (lowerName.includes(eng)) return heb;
  }
  return filename.split('.')[0]; // Fallback to filename without extension
}

// --- Universal Search Engine ---
async function searchAllSources(query, type) {
  const results = [];
  
  // 1. Search in main facebook.db if exists
  if (fs.existsSync('./facebook.db')) {
    try {
      const db = new Database('./facebook.db', { readonly: true });
      const field = type === 'phone' ? 'phone' : 'uid';
      const row = db.prepare(`SELECT * FROM facebook WHERE ${field} = ? LIMIT 1`).get(query);
      if (row) {
        results.push({ source: 'ישראל', data: row });
      }
      db.close();
    } catch (e) { console.error('Search facebook.db error:', e.message); }
  }

  // 2. Search in uploaded files
  for (const fileInfo of config.uploadedFiles) {
    const filePath = path.join(uploadsDir, fileInfo.path);
    if (!fs.existsSync(filePath)) continue;

    const ext = path.extname(fileInfo.name).toLowerCase();
    const hebrewName = getHebrewName(fileInfo.name);

    try {
      if (['.db', '.sqlite', '.sqlite3'].includes(ext)) {
        const db = new Database(filePath, { readonly: true });
        // Try to find a table that might contain the data
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        for (const table of tables) {
          try {
            const field = type === 'phone' ? 'phone' : 'uid';
            const row = db.prepare(`SELECT * FROM ${table.name} WHERE ${field} = ? LIMIT 1`).get(query);
            if (row) {
              results.push({ source: hebrewName, data: row });
              break; 
            }
          } catch (e) {}
        }
        db.close();
      } else if (['.csv', '.txt', '.json'].includes(ext)) {
        // Simple text-based search for demonstration (in real world, large files need indexing)
        // For now, we assume these are small or structured similarly
      }
      // Note: For .zip, .rar etc, we'd need to extract and search, but usually users upload .db directly or zip of .db
    } catch (e) { console.error(`Search in ${fileInfo.name} error:`, e.message); }
  }

  return results;
}

function formatUserData(source, row) {
  let message = `📍 **מקור: ${source}**\n`;
  message += '👤 פרטים:\n';

  const fields = [
    { label: '🆔', key: 'uid' },
    { label: '👤', key: 'first_name' },
    { label: '👤', key: 'last_name' },
    { label: '📱', key: 'phone' },
    { label: '📧', key: 'email' },
    { label: '⚧', key: 'gender' },
    { label: '🎂', key: 'birthday' },
    { label: '📍', key: 'location' },
    { label: '🏠', key: 'hometown' }
  ];

  fields.forEach(field => {
    const value = row[field.key];
    if (value && value !== 'null' && value !== '') {
      message += `├─ ${field.label} ${field.key}: ${value}\n`;
    }
  });

  if (row.uid) message += `🔗 https://www.facebook.com/${row.uid}\n`;
  return message + '\n';
}

// --- Bot Logic ---
bot.start((ctx) => {
  const keyboard = Markup.keyboard([
    ['🔍 חיפוש טלפון', '🆔 חיפוש ID'],
    ['📊 סטטיסטיקות', '📁 העלאת קבצים']
  ]).resize();
  ctx.reply('🤖 ברוכים הבאים לבוט החיפוש המורחב!\nשלח מספר טלפון, ID או קישור לפייסבוק.', keyboard);
});

bot.hears('🔍 חיפוש טלפון', (ctx) => ctx.reply('📱 שלח מספר טלפון:'));
bot.hears('🆔 חיפוש ID', (ctx) => ctx.reply('🆔 שלח ID או קישור:'));
bot.hears('📊 סטטיסטיקות', (ctx) => {
  ctx.reply(`📊 סטטיסטיקות:\n📈 מאגרים פעילים: ${config.uploadedFiles.length + 1}\n💾 סך הכל קבצים: ${config.uploadedFiles.length}`);
});

bot.hears('📁 העלאת קבצים', (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('❌ רק Admin');
  const uploadUrl = `${BASE_URL}/upload-page?adminId=${ctx.from.id}`;
  ctx.reply(`📁 העלאת קבצים (כל הסוגים):\n1. שלח קובץ ישירות לפה (עד 2GB)\n2. או השתמש בדף האינטרנט:\n${uploadUrl}`);
});

// Handle direct file uploads
bot.on('document', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('❌ רק Admin');
  try {
    const file = ctx.message.document;
    const fileName = file.file_name;
    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    
    ctx.reply(`⏳ מעבד קובץ: ${fileName}...`);
    
    const response = await fetch(fileLink.href);
    const buffer = await response.arrayBuffer();
    const uniqueName = `${Date.now()}_${fileName}`;
    fs.writeFileSync(path.join(uploadsDir, uniqueName), Buffer.from(buffer));

    config.uploadedFiles.push({
      name: fileName,
      path: uniqueName,
      type: path.extname(fileName).toUpperCase().substring(1),
      date: new Date().toISOString().split('T')[0],
      size: (buffer.byteLength / 1024 / 1024).toFixed(2) + ' MB'
    });
    saveConfig();
    ctx.reply(`✅ קובץ ${fileName} נשמר בהצלחה ונוסף למאגר!`);
  } catch (e) { ctx.reply(`❌ שגיאה: ${e.message}`); }
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;

  ctx.sendChatAction('typing');
  let type = 'phone';
  let query = text;

  if (text.includes('facebook.com')) {
    const match = text.match(/(?:facebook\.com\/(?:profile\.php\?id=|groups\/|pages\/[^\/]+\/|)([a-zA-Z0-9.]+))/);
    query = match ? match[1] : text;
    type = 'uid';
  } else if (/^\d+$/.test(text) && text.length > 8) {
    type = 'uid';
  } else {
    query = text.replace(/\D/g, '');
    if (query.startsWith('0')) query = '972' + query.substring(1);
  }

  const results = await searchAllSources(query, type);
  if (results.length > 0) {
    let fullMessage = `🔍 נמצאו ${results.length} תוצאות:\n\n`;
    results.forEach(res => {
      fullMessage += formatUserData(res.source, res.data);
    });
    ctx.reply(fullMessage, { parse_mode: 'Markdown' });
  } else {
    ctx.reply('❌ לא נמצאו תוצאות בכל המאגרים.');
  }
});

// --- Web Server ---
app.get('/upload-page', (req, res) => {
  const adminId = parseInt(req.query.adminId);
  if (!isAdmin(adminId)) return res.status(403).send('Unauthorized');
  res.send(`
    <html dir="rtl">
    <body style="font-family:sans-serif; text-align:center; padding:50px;">
      <h2>📁 העלאת קבצים למאגר</h2>
      <input type="file" id="f"><br><br>
      <button onclick="u()">העלאה</button>
      <p id="s"></p>
      <script>
        async function u() {
          const file = document.getElementById('f').files[0];
          if(!file) return alert('בחר קובץ');
          const d = new FormData(); d.append('file', file);
          document.getElementById('s').innerText = 'מעלה...';
          const r = await fetch('/upload-stream?adminId=${adminId}', {method:'POST', body:d});
          document.getElementById('s').innerText = r.ok ? '✅ הצליח' : '❌ נכשל';
        }
      </script>
    </body>
    </html>
  `);
});

app.post('/upload-stream', (req, res) => {
  const adminId = parseInt(req.query.adminId);
  if (!isAdmin(adminId)) return res.status(403).send('Unauthorized');
  const bb = busboy({ headers: req.headers });
  bb.on('file', (name, file, info) => {
    const uniqueName = `${Date.now()}_${info.filename}`;
    const saveTo = fs.createWriteStream(path.join(uploadsDir, uniqueName));
    let size = 0;
    file.on('data', d => size += d.length);
    file.pipe(saveTo);
    bb.on('finish', () => {
      config.uploadedFiles.push({
        name: info.filename, path: uniqueName, type: 'FILE',
        date: new Date().toISOString().split('T')[0],
        size: (size / 1024 / 1024).toFixed(2) + ' MB'
      });
      saveConfig();
      bot.telegram.sendMessage(ADMIN_ID, `✅ קובץ הועלה מהאתר: ${info.filename}`);
      res.send('OK');
    });
  });
  req.pipe(bb);
});

app.get('/health', (req, res) => res.json({status:'ok'}));

app.listen(PORT, '0.0.0.0', () => console.log(`Server on ${PORT}`));
bot.launch();
