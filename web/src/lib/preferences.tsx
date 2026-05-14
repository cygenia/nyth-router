import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { applyDomTranslations, tDom } from './i18nDom';

export type ThemeName = 'aurora' | 'dark' | 'lite';
export type LanguageCode = 'en' | 'zh' | 'ru' | 'id';

type PreferencesContextValue = {
  theme: ThemeName;
  language: LanguageCode;
  setTheme: (theme: ThemeName) => void;
  setLanguage: (language: LanguageCode) => void;
  t: (key: string) => string;
  locale: string;
  formatDate: (value: number | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number | undefined | null, options?: Intl.NumberFormatOptions) => string;
  formatRelativeTime: (value: number | undefined | null) => string;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const THEME_KEY = 'nyth.theme';
const LANGUAGE_KEY = 'nyth.language';

const DICTIONARY: Record<LanguageCode, Record<string, string>> = {
  en: {
    theme: 'Theme', language: 'Language', aurora: 'Aurora', dark: 'Dark', lite: 'Lite', live: 'live', status: 'status',
    english: 'English', chinese: '中文', russian: 'Русский', indonesian: 'Indonesia',
    workspace: 'Workspace', insights: 'Insights', auth: 'Auth', system: 'System',
    home: 'Home', overview: 'Overview', apiProviders: 'API Providers', routes: 'Routes', playground: 'Playground', usage: 'Usage', logs: 'Logs', apiKeys: 'API keys', oauthLogin: 'App access', oauthApps: 'Connected apps', authJson: 'Saved access', settings: 'Settings', about: 'About',
    privateByDefault: 'Private by default', encryptedProviderKeys: 'Provider keys stay encrypted at rest with your master key.', signOut: 'Sign out',
    'A simple view of what is running, what it costs, and what needs attention.': 'A simple view of what is running, what it costs, and what needs attention.',
    welcomeTo: 'Welcome', dashboardPassword: 'Password', sessionDuration: 'Session duration', enterDashboard: 'Continue', couldNotSignIn: 'Could not sign in.', invalidPassword: 'That password is not correct.', loginIntro: 'Keep your models, keys, usage, and daily work in one calm private place.', sessionHelp: 'Choose how long this browser stays signed in.', encryptedVault: 'Encrypted vault', sqliteLocal: 'SQLite (local)',
    never: 'Never', neverDesc: 'Logout automatically when the web page is refreshed.', thirtyMinutes: '30 minutes', thirtyMinutesDesc: 'Keep this browser signed in for 30 minutes.', oneHour: '1 hour', oneHourDesc: 'Keep this browser signed in for 1 hour.', sixHours: '6 hours', sixHoursDesc: 'Keep this browser signed in for 6 hours.', twentyFourHours: '24 hours', twentyFourHoursDesc: 'Keep this browser signed in for 24 hours.', rememberPassword: 'Remember password', rememberPasswordDesc: 'Stay signed in until you press logout.',
  },
  zh: {
    theme: '主题', language: '语言', aurora: '极光', dark: '深色', lite: '浅色', live: '在线', status: '状态',
    english: 'English', chinese: '中文', russian: 'Русский', indonesian: 'Indonesia',
    workspace: '工作区', insights: '洞察', auth: '认证', system: '系统',
    home: '首页', overview: '概览', apiProviders: 'API 提供商', routes: '路由', playground: '调试台', usage: '用量', logs: '日志', apiKeys: 'API 密钥', oauthLogin: 'OAuth 登录', oauthApps: 'OAuth 应用', authJson: '认证 JSON', settings: '设置', about: '关于',
    privateByDefault: '默认私密', encryptedProviderKeys: '提供商密钥会使用主密钥加密并保存在本地。', signOut: '退出登录',
    'A simple view of what is running, what it costs, and what needs attention.': '简单查看正在运行的内容、费用和需要注意的事项。',
    welcomeTo: '欢迎', dashboardPassword: '密码', sessionDuration: '会话时长', enterDashboard: '继续', couldNotSignIn: '无法登录。', invalidPassword: '密码不正确。', loginIntro: '把模型、密钥、用量和日常工作放在一个安静私密的地方。', sessionHelp: '选择此浏览器保留登录状态的时间。', encryptedVault: '加密保险库', sqliteLocal: 'SQLite（本地）',
    never: '从不', neverDesc: '刷新网页时自动退出登录。', thirtyMinutes: '30 分钟', thirtyMinutesDesc: '在此浏览器保持登录 30 分钟。', oneHour: '1 小时', oneHourDesc: '在此浏览器保持登录 1 小时。', sixHours: '6 小时', sixHoursDesc: '在此浏览器保持登录 6 小时。', twentyFourHours: '24 小时', twentyFourHoursDesc: '在此浏览器保持登录 24 小时。', rememberPassword: '记住密码', rememberPasswordDesc: '保持登录，直到你点击退出登录。',
  },
  ru: {
    theme: 'Тема', language: 'Язык', aurora: 'Aurora', dark: 'Dark', lite: 'Lite', live: 'онлайн', status: 'статус',
    english: 'English', chinese: '中文', russian: 'Русский', indonesian: 'Indonesia',
    workspace: 'Рабочая область', insights: 'Аналитика', auth: 'Доступ', system: 'Система',
    home: 'Главная', overview: 'Обзор', apiProviders: 'API-провайдеры', routes: 'Маршруты', playground: 'Песочница', usage: 'Использование', logs: 'Логи', apiKeys: 'API-ключи', oauthLogin: 'OAuth вход', oauthApps: 'OAuth приложения', authJson: 'Saved access', settings: 'Настройки', about: 'О проекте',
    privateByDefault: 'Приватно по умолчанию', encryptedProviderKeys: 'Ключи провайдеров хранятся зашифрованными вашим мастер-ключом.', signOut: 'Выйти',
    'A simple view of what is running, what it costs, and what needs attention.': 'Простой обзор того, что работает, сколько стоит и что требует внимания.',
    welcomeTo: 'Добро пожаловать', dashboardPassword: 'Пароль', sessionDuration: 'Длительность сессии', enterDashboard: 'Продолжить', couldNotSignIn: 'Не удалось войти.', invalidPassword: 'Неверный пароль.', loginIntro: 'Храните модели, ключи, использование и ежедневную работу в одном спокойном приватном месте.', sessionHelp: 'Выберите, как долго браузер будет сохранять вход.', encryptedVault: 'Зашифрованное хранилище', sqliteLocal: 'SQLite (локально)',
    never: 'Никогда', neverDesc: 'Автоматический выход при обновлении страницы.', thirtyMinutes: '30 минут', thirtyMinutesDesc: 'Сохранять вход в этом браузере 30 минут.', oneHour: '1 час', oneHourDesc: 'Сохранять вход в этом браузере 1 час.', sixHours: '6 часов', sixHoursDesc: 'Сохранять вход в этом браузере 6 часов.', twentyFourHours: '24 часа', twentyFourHoursDesc: 'Сохранять вход в этом браузере 24 часа.', rememberPassword: 'Запомнить пароль', rememberPasswordDesc: 'Не выходить, пока вы не нажмете кнопку выхода.',
  },
  id: {
    theme: 'Tema', language: 'Bahasa', aurora: 'Aurora', dark: 'Gelap', lite: 'Terang', live: 'live', status: 'status',
    english: 'English', chinese: '中文', russian: 'Русский', indonesian: 'Indonesia',
    workspace: 'Workspace', insights: 'Insight', auth: 'Auth', system: 'Sistem',
    home: 'Beranda', overview: 'Ringkasan', apiProviders: 'Provider API', routes: 'Rute', playground: 'Playground', usage: 'Pemakaian', logs: 'Log', apiKeys: 'API key', oauthLogin: 'Login OAuth', oauthApps: 'Aplikasi OAuth', authJson: 'Saved access', settings: 'Pengaturan', about: 'Tentang',
    privateByDefault: 'Privat secara default', encryptedProviderKeys: 'Key provider tetap terenkripsi di penyimpanan dengan master key Anda.', signOut: 'Keluar',
    'A simple view of what is running, what it costs, and what needs attention.': 'Tampilan sederhana tentang apa yang berjalan, biayanya, dan hal yang perlu diperhatikan.',
    welcomeTo: 'Selamat datang', dashboardPassword: 'Password', sessionDuration: 'Durasi sesi', enterDashboard: 'Lanjut', couldNotSignIn: 'Tidak bisa masuk.', invalidPassword: 'Password tidak benar.', loginIntro: 'Simpan model, key, pemakaian, dan pekerjaan harian di satu tempat privat yang tenang.', sessionHelp: 'Pilih berapa lama browser ini tetap login.', encryptedVault: 'Vault terenkripsi', sqliteLocal: 'SQLite (lokal)',
    never: 'Never', neverDesc: 'Logout otomatis saat halaman web direfresh.', thirtyMinutes: '30 menit', thirtyMinutesDesc: 'Tetap login di browser ini selama 30 menit.', oneHour: '1 jam', oneHourDesc: 'Tetap login di browser ini selama 1 jam.', sixHours: '6 jam', sixHoursDesc: 'Tetap login di browser ini selama 6 jam.', twentyFourHours: '24 jam', twentyFourHoursDesc: 'Tetap login di browser ini selama 24 jam.', rememberPassword: 'Remember password', rememberPasswordDesc: 'Tetap login sampai Anda menekan tombol logout.',
    'Welcome back.': 'Selamat datang kembali.', gatewayReady: 'Nyth siap.', 'Nyth is ready.': 'Nyth siap.', 'Your personal home base.': 'Ruang kerja personal Anda.', 'Everything is ready when you need it.': 'Semuanya siap saat Anda butuh.',
  },
};

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => readTheme());
  const [language, setLanguageState] = useState<LanguageCode>(() => readLanguage());
  const locale = language === 'zh' ? 'zh-CN' : language === 'id' ? 'id-ID' : language === 'ru' ? 'ru-RU' : 'en-US';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
    localStorage.setItem(LANGUAGE_KEY, language);
    const cleanup = applyDomTranslations(language);
    return cleanup;
  }, [language]);

  const value = useMemo<PreferencesContextValue>(() => ({
    theme,
    language,
    locale,
    setTheme: setThemeState,
    setLanguage: setLanguageState,
    t: (key: string) => tDom(DICTIONARY[language]?.[key] || DICTIONARY.en[key] || key, language),
    formatDate: (value: number | Date, options?: Intl.DateTimeFormatOptions) => new Date(value).toLocaleString(locale, options),
    formatNumber: (value: number | undefined | null, options?: Intl.NumberFormatOptions) => value == null ? '0' : Number(value).toLocaleString(locale, options),
    formatRelativeTime: (value: number | undefined | null) => formatRelativeTime(value, locale),
  }), [theme, language, locale]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}


function formatRelativeTime(ts: number | undefined | null, locale: string) {
  if (!ts) return '-';
  const diff = Date.now() - ts;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diff < 30_000) return rtf.format(0, 'second');
  if (diff < 60_000) return rtf.format(-Math.round(diff / 1000), 'second');
  if (diff < 3_600_000) return rtf.format(-Math.round(diff / 60_000), 'minute');
  if (diff < 86_400_000) return rtf.format(-Math.round(diff / 3_600_000), 'hour');
  return rtf.format(-Math.round(diff / 86_400_000), 'day');
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider');
  return ctx;
}

function readTheme(): ThemeName {
  const value = localStorage.getItem(THEME_KEY);
  return value === 'dark' || value === 'lite' || value === 'aurora' ? value : 'aurora';
}

function readLanguage(): LanguageCode {
  const value = localStorage.getItem(LANGUAGE_KEY);
  return value === 'zh' || value === 'ru' || value === 'id' || value === 'en' ? value : 'en';
}
