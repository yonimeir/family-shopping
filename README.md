# 🛒 קניות משפחתיות

PWA לניהול קניות משפחתי (עברית, RTL, Mobile-First), עם סנכרון בזמן אמת בין בני הזוג.

## הרצה
```bash
npm install
npm run dev      # http://localhost:5173 (גם מהטלפון ברשת הביתית: http://<IP-של-המחשב>:5173)
npm run build    # בנייה לפרודקשן → dist/
```

## מצבי עבודה
- **בלי Firebase (ברירת מחדל):** הנתונים נשמרים ב-localStorage ומסונכרנים בין לשוניות באותו דפדפן. כדי לדמות שני בני זוג, פתחו שתי לשוניות.
- **עם Firebase:** סנכרון אמיתי בין מכשירים, עבודה בלי חיבור, ושיתוף בקישור.

## חיבור Firebase (פעם אחת, בערך 5 דקות)
1. https://console.firebase.google.com → **Add project**
2. **Build → Firestore Database → Create database** (production mode, אזור `eur3` או `me-west1`)
3. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable**
4. **Project settings → Your apps → Web (`</>`)** → מעתיקים את ה-config
5. `cp .env.example .env.local` וממלאים את הערכים
6. **Firestore → Rules** → מדביקים את התוכן של `firestore.rules` → **Publish**
7. אחרי פריסה (למשל Firebase Hosting או Vercel), מוסיפים את הדומיין ב-**Authentication → Settings → Authorized domains**

## מבנה נתונים
```
families/{familyId}                { categories[], seedVersion }
families/{familyId}/members/{uid}
families/{familyId}/catalog/{id}   מוצר קבוע (שם, מחלקה, יחידה, כמות ברירת מחדל, isCore)
families/{familyId}/list/{id}      מצב הקנייה (qty, notes, isPurchased, addedBy). קיים רק כשהמוצר ברשימה
```
`inCart` נגזר מכך שקיים מסמך ב-`list`. `currentQty` הוא `list.qty`. איפוס = מחיקת מסמכים מ-`list`.

הקטלוג ההתחלתי (229 מוצרים מ-`shopping_catalog_seed.json`) נמצא ב-`src/data/seed.ts`, ונטען רק בפתיחה הראשונה של משפחה.
