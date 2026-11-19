// Specific messages take precedence; unknown messages use localized status text.
export const messages = {
  success: [
    'Request completed successfully',
    'درخواست با موفقیت انجام شد',
    'تم تنفيذ الطلب بنجاح',
    'İstek başarıyla tamamlandı',
  ],
  400: [
    'Invalid request',
    'اطلاعات درخواست نامعتبر است',
    'بيانات الطلب غير صالحة',
    'Geçersiz istek',
  ],
  401: [
    'Authentication required',
    'ورود به حساب کاربری لازم است',
    'تسجيل الدخول مطلوب',
    'Oturum açmanız gerekiyor',
  ],
  403: ['Access denied', 'دسترسی مجاز نیست', 'الوصول غير مسموح', 'Erişim reddedildi'],
  404: ['Not found', 'موردی پیدا نشد', 'غير موجود', 'Bulunamadı'],
  409: ['Conflict', 'اطلاعات با داده‌های موجود تداخل دارد', 'تعارض في البيانات', 'Veri çakışması'],
  413: [
    'Payload too large',
    'حجم درخواست بیش از حد مجاز است',
    'حجم الطلب كبير جداً',
    'İstek boyutu çok büyük',
  ],
  429: [
    'Too many requests',
    'تعداد درخواست‌ها بیش از حد مجاز است؛ بعداً تلاش کنید',
    'طلبات كثيرة جداً، حاول لاحقاً',
    'Çok fazla istek, daha sonra tekrar deneyin',
  ],
  503: [
    'Exchange rates temporarily unavailable',
    'سرویس نرخ ارز موقتاً در دسترس نیست',
    'خدمة أسعار الصرف غير متاحة مؤقتاً',
    'Döviz kuru hizmeti geçici olarak kullanılamıyor',
  ],
  500: ['Internal server error', 'خطای داخلی سرور', 'خطأ داخلي في الخادم', 'Sunucu hatası'],
  'Invalid translations': [
    'Invalid translations',
    'ساختار یا متن ترجمه نامعتبر است',
    'بنية الترجمة أو نصها غير صالح',
    'Çeviri yapısı veya metni geçersiz',
  ],
  'Name is required': ['Name is required', 'نام الزامی است', 'الاسم مطلوب', 'Ad zorunludur'],
  'No Access': ['No access', 'دسترسی ندارید', 'لا تملك صلاحية الوصول', 'Erişim yetkiniz yok'],
  'Access Denied: No Token Provided': [
    'No authentication token provided',
    'توکن ورود ارسال نشده است',
    'لم يتم إرسال رمز المصادقة',
    'Kimlik doğrulama belirteci eksik',
  ],
  'Access Denied: Invalid Token': [
    'Invalid authentication token',
    'توکن ورود نامعتبر است',
    'رمز المصادقة غير صالح',
    'Geçersiz kimlik doğrulama belirteci',
  ],
};
export function translateMessage(original, lang, status, success) {
  const index = ['en', 'fa', 'ar', 'tr'].indexOf(lang);
  if (lang === 'en') return original;
  return (messages[original] || messages[success ? 'success' : status] || messages[500])[index];
}
