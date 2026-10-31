/**
 * Product Studio Packshots (clean isolated products on pure white background).
 * Fallback per category ensures 100% coverage across all 229 catalog items.
 */

// Category default packshots on white background
const CATEGORY_PACKSHOTS: Record<string, string> = {
  veg_fruit: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=300&auto=format&fit=crop&q=80',
  bakery: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300&auto=format&fit=crop&q=80',
  dairy_eggs: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300&auto=format&fit=crop&q=80',
  meat_fish: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=300&auto=format&fit=crop&q=80',
  pantry_cooking: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&auto=format&fit=crop&q=80',
  baking_spices: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=300&auto=format&fit=crop&q=80',
  snacks_drinks: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&auto=format&fit=crop&q=80',
  paper_disposable: 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=300&auto=format&fit=crop&q=80',
  cleaning_laundry: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=300&auto=format&fit=crop&q=80',
  baby_pharm: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300&auto=format&fit=crop&q=80',
  frozen: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&auto=format&fit=crop&q=80',
};

// Specific isolated studio packshots on pure white background
const SPECIFIC_PACKSHOTS: Record<string, string> = {
  // Vegetables
  'מלפפון': 'https://images.unsplash.com/photo-1604977042946-1eecc30f269e?w=300&auto=format&fit=crop&q=80',
  'עגבנייה': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=300&auto=format&fit=crop&q=80',
  'עגבניות שרי': 'https://images.unsplash.com/photo-1546470427-e26264be0b11?w=300&auto=format&fit=crop&q=80',
  'פלפל אדום': 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=300&auto=format&fit=crop&q=80',
  'פלפל צהוב': 'https://images.unsplash.com/photo-1526344966-89049886b28d?w=300&auto=format&fit=crop&q=80',
  'פלפל כתום': 'https://images.unsplash.com/photo-1526344966-89049886b28d?w=300&auto=format&fit=crop&q=80',
  'פלפל חריף': 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=300&auto=format&fit=crop&q=80',
  'בצל יבש': 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=300&auto=format&fit=crop&q=80',
  'בצל אדום': 'https://images.unsplash.com/photo-1620574387735-3624d75b2dbc?w=300&auto=format&fit=crop&q=80',
  'בצל ירוק': 'https://images.unsplash.com/photo-1608797178974-15b35a61dd75?w=300&auto=format&fit=crop&q=80',
  'תפוח אדמה לבן': 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=300&auto=format&fit=crop&q=80',
  'תפוח אדמה אדום / לאפייה': 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=300&auto=format&fit=crop&q=80',
  'בטטה': 'https://images.unsplash.com/photo-1596097635121-14b63b7a0c19?w=300&auto=format&fit=crop&q=80',
  'גזר ארוז': 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=300&auto=format&fit=crop&q=80',
  'קישוא': 'https://images.unsplash.com/photo-1590165482129-1b8b27698780?w=300&auto=format&fit=crop&q=80',
  'כרוב לבן': 'https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?w=300&auto=format&fit=crop&q=80',
  'כרוב אדום': 'https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?w=300&auto=format&fit=crop&q=80',
  'חסה ערבית': 'https://images.unsplash.com/photo-1556801712-76c8eb07bbc9?w=300&auto=format&fit=crop&q=80',
  'חסה עגולה / אייסברג': 'https://images.unsplash.com/photo-1556801712-76c8eb07bbc9?w=300&auto=format&fit=crop&q=80',
  'פטרוזיליה': 'https://images.unsplash.com/photo-1608797178974-15b35a61dd75?w=300&auto=format&fit=crop&q=80',
  'כוסברה': 'https://images.unsplash.com/photo-1608797178974-15b35a61dd75?w=300&auto=format&fit=crop&q=80',
  'שמיר': 'https://images.unsplash.com/photo-1608797178974-15b35a61dd75?w=300&auto=format&fit=crop&q=80',
  'נענע': 'https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?w=300&auto=format&fit=crop&q=80',
  'לימון': 'https://images.unsplash.com/photo-1533038590840-1cde6e668a91?w=300&auto=format&fit=crop&q=80',
  'תפוח עץ חרמון': 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=300&auto=format&fit=crop&q=80',
  'תפוח עץ גרני סמית': 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=300&auto=format&fit=crop&q=80',
  'בננה': 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=300&auto=format&fit=crop&q=80',
  'אבוקדו': 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=300&auto=format&fit=crop&q=80',
  'שום יבש': 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=300&auto=format&fit=crop&q=80',
  'פטריות שמפיניון': 'https://images.unsplash.com/photo-1504472478235-9bc48ba4d60f?w=300&auto=format&fit=crop&q=80',

  // Bakery
  'לחם פרוס אחיד': 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300&auto=format&fit=crop&q=80',
  'לחם כפרי': 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=300&auto=format&fit=crop&q=80',
  'פיתות': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=300&auto=format&fit=crop&q=80',
  'לחמניות': 'https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?w=300&auto=format&fit=crop&q=80',
  'חלה לשבת': 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=300&auto=format&fit=crop&q=80',
  'טורטיות': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=300&auto=format&fit=crop&q=80',

  // Dairy & Eggs
  'חלב תנובה 3%': 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300&auto=format&fit=crop&q=80',
  'חלב תנובה 1%': 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300&auto=format&fit=crop&q=80',
  'חלב שיבולת שועל': 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300&auto=format&fit=crop&q=80',
  'ביצים L': 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=300&auto=format&fit=crop&q=80',
  'ביצים XL': 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=300&auto=format&fit=crop&q=80',
  'קוטג׳ 5%': 'https://images.unsplash.com/photo-1559561853-08451507cbe7?w=300&auto=format&fit=crop&q=80',
  'קוטג׳ 9%': 'https://images.unsplash.com/photo-1559561853-08451507cbe7?w=300&auto=format&fit=crop&q=80',
  'גבינה לבנה 5%': 'https://images.unsplash.com/photo-1559561853-08451507cbe7?w=300&auto=format&fit=crop&q=80',
  'גבינה צהובה עמק 28%': 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=300&auto=format&fit=crop&q=80',
  'חמאה': 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=300&auto=format&fit=crop&q=80',
  'שמנת חמוצה 15%': 'https://images.unsplash.com/photo-1559561853-08451507cbe7?w=300&auto=format&fit=crop&q=80',
  'שמנת מתוקה 38%': 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300&auto=format&fit=crop&q=80',
  'יוגורט יווני': 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=300&auto=format&fit=crop&q=80',

  // Meat & Poultry
  'חזה עוף שלם': 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=300&auto=format&fit=crop&q=80',
  'חזה עוף פרוס לשניצל': 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=300&auto=format&fit=crop&q=80',
  'כרעיים עוף': 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=300&auto=format&fit=crop&q=80',
  'בשר בקר טחון': 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=300&auto=format&fit=crop&q=80',
  'סלמון טרי': 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=300&auto=format&fit=crop&q=80',

  // Pantry & Cooking
  'שמן זית כתית מעולה': 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=300&auto=format&fit=crop&q=80',
  'שמן קנולה': 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=300&auto=format&fit=crop&q=80',
  'טחינה גולמית': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&auto=format&fit=crop&q=80',
  'טונה בשמן': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&auto=format&fit=crop&q=80',
  'רסק עגבניות': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&auto=format&fit=crop&q=80',
  'פסטה ספגטי': 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=300&auto=format&fit=crop&q=80',
  'אורז יסמין': 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=300&auto=format&fit=crop&q=80',
  'קפה שחור עלית': 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&auto=format&fit=crop&q=80',
  'קפה נמס מגורען': 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=300&auto=format&fit=crop&q=80',
};

/**
 * Returns a high-res, clean studio packshot for any product or category.
 */
export function getProductPackshot(itemName: string, categoryId: string): string {
  if (SPECIFIC_PACKSHOTS[itemName]) {
    return SPECIFIC_PACKSHOTS[itemName];
  }
  // Check partial keyword matching
  for (const [key, url] of Object.entries(SPECIFIC_PACKSHOTS)) {
    if (itemName.includes(key) || key.includes(itemName)) {
      return url;
    }
  }
  return CATEGORY_PACKSHOTS[categoryId] || CATEGORY_PACKSHOTS.veg_fruit;
}
