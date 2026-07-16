# 🤖 Telegram Facebook Search Bot

בוט טלגרם לחיפוש בסיס נתונים של פייסבוק עם מערכת הרשאות גמישה.

## ✨ תכונות

- 🔍 **חיפוש מתקדם**: חיפוש לפי מספר טלפון, Facebook ID, או קישור לפרופיל
- 📊 **3.9M משתמשים**: בסיס נתונים ענק של משתמשי פייסבוק
- ⚙️ **פנל ניהול**: שליטה מלאה על הרשאות וחיפושים
- 🔐 **מערכת הרשאות גמישה**:
  - ✅ Whitelist/Blacklist למשתמשים
  - 📈 הגבלות גלובליות וליחידים
  - 🎛️ שליטה מלאה בחיפושים
- 💾 **שמירת הגדרות**: כל ההגדרות נשמרות בקובץ JSON
- 🌐 **API Health Check**: `/health` ו-`/stats` endpoints

## 🚀 התחלה מהירה

### דרישות
- Node.js 18+
- npm או yarn

### התקנה

```bash
npm install
```

### הפעלה

```bash
npm start
```

או בפיתוח:

```bash
npm run dev
```

## ⚙️ הגדרות

### משתנים סביבה (.env)

```
BOT_TOKEN=your_telegram_bot_token
ADMIN_ID=your_telegram_id
PORT=3000
```

### פקודות Admin

- `/admin` - פתח פנל ניהול
- `/set_global_limit <מספר>` - הגדר הגבלה גלובלית
- `/disable_global` - כבה חיפוש לכל המשתמשים
- `/enable_global` - הפעל חיפוש לכל המשתמשים
- `/whitelist_user <ID>` - הוסף משתמש למותרים
- `/blacklist_user <ID>` - חסום משתמש
- `/set_user_limit <ID> <מספר>` - הגדר הגבלה למשתמש
- `/config_status` - הצג הגדרות נוכחיות

### פקודות משתמש

- `/start` - התחלה
- `/help` - עזרה
- `/stats` - סטטיסטיקות

## 📱 שימוש

שלח לבוט:
- **מספר טלפון**: `0526635965` או `+972526635965`
- **Facebook ID**: `1437991444`
- **קישור לפרופיל**: `https://www.facebook.com/username`

## 📊 API Endpoints

### Health Check
```
GET /health
```

Response:
```json
{
  "status": "ok",
  "bot": "running"
}
```

### Statistics
```
GET /stats
```

Response:
```json
{
  "todaySearches": 42,
  "globalLimit": null,
  "globalEnabled": true,
  "whitelistCount": 0,
  "blacklistCount": 0
}
```

## 🔧 מערכת ההרשאות

### מצבים אפשריים

1. **חיפוש פתוח לכל**
   - `globalEnabled: true`
   - `globalLimit: null`

2. **חיפוש עם הגבלה גלובלית**
   - `globalEnabled: true`
   - `globalLimit: 100` (100 חיפושים ביום)

3. **חיפוש כבוי לכל חוץ מהמותרים**
   - `globalEnabled: false`
   - משתמשים ב-whitelist יכולים לחפש

4. **הגבלות אישיות**
   - כל משתמש יכול להיות עם הגבלה שונה

## 📁 מבנה הפרויקט

```
.
├── server.js           # קוד ראשי של הבוט
├── facebook.db         # בסיס הנתונים (1.2GB)
├── config.json         # הגדרות (נוצר אוטומטית)
├── package.json        # תלויות
├── .env               # משתנים סביבה
└── README.md          # תיעוד זה
```

## 🛠️ פיתוח

### בדיקה מקומית

```bash
npm run dev
```

### בדיקת בוט

1. פתח את Telegram
2. חפש את הבוט שלך
3. שלח `/start`
4. שלח מספר טלפון או ID לחיפוש

## 📝 הערות חשובות

- בסיס הנתונים הוא read-only לביטחון
- כל ההגדרות נשמרות בקובץ `config.json`
- ההודעות מעוצבות בעברית
- תמיכה בחיפוש בשלוש שפות (עברית, אנגלית, ערבית)

## 🔒 אבטחה

- ✅ Admin ID מוגן
- ✅ Blacklist/Whitelist
- ✅ הגבלות על חיפושים
- ✅ בסיס נתונים read-only
- ✅ Token מוגן בקובץ .env

## 📞 תמיכה

לשאלות או בעיות, אנא צור issue בפרויקט.

## 📄 רישיון

MIT
