/*
 * Seed داده‌ی آزمایشی روی MongoDB محلی (localhost:27017) — فقط برای تست محلی.
 * استفاده: node scripts/seed-local.js
 * هشدار: پایگاه‌داده‌ی «alibaba» محلی را پاک و از نو می‌سازد؛ روی سرور واقعی اجرا نکنید.
 */
import { MongoClient, ObjectId } from 'mongodb';
import crypto from 'node:crypto';

const URI = process.env.SEED_MONGO_URI || 'mongodb://localhost:27017/?directConnection=true';
const DB_NAME = process.env.SEED_DB || 'alibaba';

const client = new MongoClient(URI);

/* ---------- تصویر SVG ساده برای محصولات ---------- */
const PALETTE = [
  ['#f5c518', '#0a1736'],
  ['#2b6cb0', '#ffffff'],
  ['#38a169', '#ffffff'],
  ['#e0533d', '#ffffff'],
  ['#7c3aed', '#ffffff'],
  ['#0d9488', '#042f2e'],
  ['#f97316', '#1f2937'],
  ['#db2777', '#ffffff'],
];

function svgImage(label, index) {
  const [bg, fg] = PALETTE[index % PALETTE.length];
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
  <rect width="640" height="640" fill="${bg}"/>
  <circle cx="520" cy="120" r="90" fill="${fg}" opacity="0.12"/>
  <circle cx="110" cy="540" r="130" fill="${fg}" opacity="0.10"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, sans-serif" font-size="120" font-weight="bold" fill="${fg}">${label}</text>
</svg>`,
    'utf8',
  );
}

/* ---------- داده‌های پایه ---------- */
const CATEGORIES = [
  ['Surveying Instruments', 'ابزار نقشه‌برداری'],
  ['Total Stations', 'دوربین توتال استیشن'],
  ['GPS & GNSS', 'جی‌پی‌اس و ژن‌اس'],
  ['Levels', 'دوربین تراز'],
  ['Theodolites', 'دوربین تئودولیت'],
  ['Accessories', 'لوازم جانبی'],
  ['Tripods & Staffs', 'سه‌پایه و شاخص'],
  ['Software & Data', 'نرم‌افزار و داده'],
];

const PRODUCT_NAMES = [
  ['Total Station GTS-255', 'توتال استیشن GTS-255'],
  ['GNSS Receiver RTK Pro', 'گیرنده جی‌پی‌اس RTK حرفه‌ای'],
  ['Automatic Level AL-32', 'تراز خودکار AL-32'],
  ['Digital Theodolite DT-05', 'تئودولیت دیجیتال DT-05'],
  ['Prism Set with Case', 'ست منشور با جعبه'],
  ['Fiberglass Measuring Tape 100m', 'متر نواری فایبرگلاس ۱۰۰ متری'],
  ['Aluminum Tripod Heavy Duty', 'سه‌پایه آلومینیومی سنگین'],
  ['Leveling Staff 5m', 'شاخص تراز ۵ متری'],
  ['Survey Data Collector Tablet', 'تبلت برداشت داده نقشه‌برداری'],
  ['Laser Distance Meter 200m', 'متر لیزری ۲۰۰ متری'],
  ['Prism Pole 2.6m Telescopic', 'میله منشور تلسکوپی ۲.۶ متر'],
  ['Reflectionless Total Station X2', 'توتال استیشن بدون منشور X2'],
  ['Dual-Frequency GNSS Antenna', 'آنتن GNSS دو فرکانس'],
  ['Rotary Laser Level RL-8', 'تراز لیزری گردان RL-8'],
  ['Field Book Waterproof', 'دفترچه برداشت ضدآب'],
  ['Surveying Software License', 'لایسنس نرم‌افزار نقشه‌برداری'],
  ['Concrete Test Hammer', 'چکش آزمایش بتن'],
  ['Underground Cable Locator', 'ردیاب کابل زیرزمینی'],
  ['Mine Surveying Lamp Set', 'ست چراغ نقشه‌برداری معادن'],
  ['Topographic Map Printer A1', 'پرینتر نقشه توپوگرافی A1'],
  ['Angle Prism 360°', 'منشور زاویه ۳۶۰ درجه'],
  ['Height Meter Ultrasonic', 'ارتفاع‌سنج التراسونیک'],
  ['Compass Geological BR-1', 'قطب‌نما زمین‌شناسی BR-1'],
  ['Tripod Ball Head Adapter', 'آداپتور سر کروی سه‌پایه'],
];

const BRANDS = ['GeoCala', 'TopoLine', 'SurveyMax', 'GeoTech'];
const STORE_SEED = [
  {
    key: 'geo',
    name: { en: 'GeoCala Main Store', fa: 'فروشگاه مرکزی ژئوکالا' },
    desc: { en: 'Official GeoCala surveying equipment store.', fa: 'فروشگاه رسمی تجهیزات نقشه‌برداری ژئوکالا.' },
    address: {
      en: 'No. 12, Mapping St., Tehran, Iran',
      fa: 'تهران، خیابان نقشه‌برداری، پلاک ۱۲',
      ar: 'طهران، شارع المساحة، رقم ١٢',
    },
  },
  {
    key: 'topo',
    name: { en: 'TopoLine Instruments', fa: 'تجهیزات توپولاین' },
    desc: { en: 'Trusted supplier of total stations and GNSS.', fa: 'تأمین‌کننده معتبر توتال استیشن و GNSS.' },
    address: {
      en: 'Unit 3, Isfahan Industrial Zone',
      fa: ' اصفهان، منطقه صنعتی، واحد ۳',
      tr: 'Isfahan Sanayi Bölgesi, Ünite 3',
    },
  },
  {
    key: 'survey',
    name: { en: 'SurveyMax Depot', fa: 'انبار سروی‌مکس' },
    desc: { en: 'Everything for field surveying.', fa: 'هر آنچه برای نقشه‌برداری صحرایی نیاز دارید.' },
    address: { en: 'Mashhad, Ahmadabad Blvd, No. 45', fa: 'مشهد، بلوار احمدآباد، پلاک ۴۵' },
  },
];

const MARKDOWN_EN = (name) =>
  `## ${name}\n\nProfessional-grade **surveying equipment** with a 12-month warranty.\n\n- Calibrated before shipping\n- Full accessory set\n- Free software updates`;

const MARKDOWN_FA = (name) =>
  `## ${name}\n\nتجهیزات **حرفه‌ای نقشه‌برداری** با ۱۲ ماه گارانتی.\n\n- کالیبره‌شده قبل از ارسال\n- همراه با کامل‌ترین لوازم جانبی\n- به‌روزرسانی رایگان نرم‌افزار`;

async function main() {
  await client.connect();
  const db = client.db(DB_NAME);

  // پاک‌سازی کامل پایگاه‌داده محلی
  const collections = await db.collections();
  for (const collection of collections) await collection.deleteMany({});

  const now = new Date();
  const hashOTP = (code) =>
    crypto.createHmac('sha256', process.env.OTP_SECRET || 'dev-otp-secret').update(code).digest('hex');

  /* ---------- کاربران ---------- */
  const admin = {
    _id: new ObjectId(),
    phone: '+989120000001',
    username: 'admin',
    role: 'admin',
    firstname: { en: 'Site', fa: 'مدیر' },
    lastname: { en: 'Admin', fa: 'سایت' },
    create_at: now,
    update_at: now,
  };
  const seller = {
    _id: new ObjectId(),
    phone: '+989120000002',
    username: 'seller_demo',
    role: 'user',
    is_seller: true,
    seller_approved_status: true,
    seller_active_status: 'active',
    firstname: { en: 'Demo', fa: 'دمو' },
    lastname: { en: 'Seller', fa: 'فروشنده' },
    seller_trust: true,
    create_at: now,
    update_at: now,
  };
  const buyer = {
    _id: new ObjectId(),
    phone: '+989120000003',
    username: 'buyer_demo',
    role: 'user',
    firstname: { en: 'Demo', fa: 'دمو' },
    lastname: { en: 'Buyer', fa: 'خریدار' },
    create_at: now,
    update_at: now,
  };
  await db.collection('users').insertMany([admin, seller, buyer]);

  /* ---------- پلن ---------- */
  const plan = {
    _id: new ObjectId(),
    name: { en: 'Gold Seller Plan', fa: 'پلن طلایی فروشندگان' },
    duration_days: 365,
    price: { currency: 'USD', amount: 29 },
    description: { en: 'Full-featured seller plan with high product limits.', fa: 'پلن کامل برای فروشندگان حرفه‌ای' },
    is_featured: true,
    status: 'ACTIVE',
    sort_order: 1,
    discount: null,
    features: { max_products: 200, max_shops: 5, max_images_per_product: 20 },
    create_at: now,
    update_at: now,
  };
  await db.collection('plans').insertOne(plan);

  await db.collection('users').updateOne(
    { _id: seller._id },
    { $set: { seller_plan: { plan_id: plan._id, start_at: now } } },
  );

  /* ---------- تصاویر ---------- */
  const imageIds = [];
  for (let i = 0; i < 26; i += 1) {
    const buffer = svgImage(String(i + 1).padStart(2, '0'), i);
    const res = await db.collection('storage').insertOne({
      name: `seed-${i + 1}.svg`,
      contentType: 'image/svg+xml',
      size: buffer.length,
      data: buffer,
      create_at: now,
      update_at: now,
    });
    imageIds.push(res.insertedId);
  }

  /* ---------- دسته‌بندی‌ها ---------- */
  const categoryIds = [];
  for (let i = 0; i < CATEGORIES.length; i += 1) {
    const [en, fa] = CATEGORIES[i];
    const res = await db.collection('categories').insertOne({
      name: { en, fa },
      slug: en.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      parent_id: null,
      ancestors: [],
      level: 0,
      path: String(i + 1),
      sort_order: i,
      status: 'ACTIVE',
      product_count: 0,
      create_at: now,
      update_at: now,
    });
    categoryIds.push(res.insertedId);
  }

  /* ---------- فروشگاه‌ها (آدرس چندزبانه) ---------- */
  const storeIds = {};
  for (let i = 0; i < STORE_SEED.length; i += 1) {
    const s = STORE_SEED[i];
    const res = await db.collection('stores').insertOne({
      user: seller._id,
      /* فرمت field-first — همان چیزی که contentModel هنگام insert می‌سازد */
      name: { en: s.name.en, fa: s.name.fa },
      status: 'ENABLE',
      profile_image_id: imageIds[i],
      banner_image_id: imageIds[i + 3],
      description: { en: s.desc.en, fa: s.desc.fa },
      /* آدرس چندزبانه — قابلیت جدید */
      address: s.address,
      contact_info: {
        address: s.address.en,
        email: `${s.key}@geocala.example`,
        phone: '09120000000',
        fax: null,
      },
      create_at: now,
      update_at: now,
    });
    storeIds[s.key] = res.insertedId;
  }

  /* ---------- محصولات ---------- */
  const products = PRODUCT_NAMES.map(([en, fa], index) => {
    const storeKeys = ['geo', 'topo', 'survey'];
    const storeKey = storeKeys[index % storeKeys.length];
    const storeId = storeIds[storeKey];
    const categoryId = categoryIds[index % categoryIds.length];
    const stock = [0, 3, 8, 15, 42][index % 5];
    const discounted = index % 4 === 1;
    const images = [imageIds[index % imageIds.length], imageIds[(index + 7) % imageIds.length]];
    return {
      name: { en, fa },
      brand: { en: BRANDS[index % BRANDS.length], fa: BRANDS[index % BRANDS.length] },
      short_description: {
        en: `${en} — professional surveying gear`,
        fa,
      },
      description: { en: MARKDOWN_EN(en), fa: MARKDOWN_FA(fa) },
      seller_id: seller._id,
      store_id: storeId,
      store_name: STORE_SEED.find((s) => s.key === storeKey).name.en,
      category_id: categoryId,
      category_ids: [categoryId],
      production: 2022 + (index % 3),
      images_id: images,
      price: { currency: 'USD', amount: 50 + index * 37 },
      discount: discounted
        ? { percentage: 10 + (index % 3) * 5, expirationDate: new Date(now.getTime() + 30 * 864e5) }
        : null,
      stock,
      stock_status: stock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
      status: 'ACTIVE',
      visibility: 'PUBLIC',
      warranty: index % 3 !== 2,
      tags: [['survey', 'gnss'], ['laser'], ['tripod'], []][index % 4],
      dimensions: {
        width: { value: 20 + (index % 5) * 5, unit: 'CM' },
        height: { value: 10 + (index % 4) * 3, unit: 'CM' },
      },
      weight: { value: 300 + index * 50, unit: 'G' },
      sold: index,
      create_at: new Date(now.getTime() - index * 36e5),
      update_at: now,
    };
  });
  await db.collection('products').insertMany(products);

  console.log('Seed complete:');
  console.log(`  users: 3 (admin=${admin.phone}, seller=${seller.phone}, buyer=${buyer.phone})`);
  console.log(`  plan: ${plan.name}`);
  console.log(`  stores: ${Object.keys(storeIds).length} (multilingual address)`);
  console.log(`  categories: ${categoryIds.length}`);
  console.log(`  products: ${products.length}`);
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
