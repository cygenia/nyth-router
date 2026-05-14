import { Icons } from '../lib/icons';
import { LanguageCode, ThemeName, usePreferences } from '../lib/preferences';
import { Dropdown } from './Dropdown';

interface Props {
  onMenu: () => void;
  health?: { promptLogMode?: string; uptime?: number } | null;
}

const THEMES: { value: ThemeName; labelKey: string }[] = [
  { value: 'aurora', labelKey: 'aurora' },
  { value: 'dark', labelKey: 'dark' },
  { value: 'lite', labelKey: 'lite' },
];

const LANGUAGES: { value: LanguageCode; labelKey: string }[] = [
  { value: 'en', labelKey: 'english' },
  { value: 'zh', labelKey: 'chinese' },
  { value: 'ru', labelKey: 'russian' },
  { value: 'id', labelKey: 'indonesian' },
];

export function Topbar({ onMenu, health }: Props) {
  const { theme, language, setTheme, setLanguage, t } = usePreferences();
  const uptimeLabel = health?.uptime != null ? formatUptime(health.uptime) : '-';
  const logMode = health?.promptLogMode || 'preview';

  const languageOptions = LANGUAGES.map((item) => ({
    value: item.value,
    label: t(item.labelKey),
  }));
  const themeOptions = THEMES.map((item) => ({
    value: item.value,
    label: t(item.labelKey),
  }));

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-ink-950/58 px-4 py-3 backdrop-blur-md md:px-6">
      <button
        onClick={onMenu}
        className="rounded-full border border-white/10 bg-white/5 p-2 text-ink-100 hover:bg-white/10 md:hidden"
        aria-label="Open navigation"
      >
        <Icons.Menu className="h-4 w-4" />
      </button>
      <div className="flex flex-1 items-center gap-3">
        <span className="pill md:hidden">
          <Icons.Sparkles className="h-3 w-3 text-aurora-mint" /> NYTH
        </span>
        <div className="hidden items-center gap-2 text-xs text-ink-300 lg:flex" title={`Uptime ${uptimeLabel}, prompt logs ${logMode}`}>
          <Icons.Info className="h-3.5 w-3.5" />
          <span>{t('status')}: {uptimeLabel}, {logMode}</span>
        </div>
      </div>
      <div className="relative flex items-center gap-2">
        <label className="sr-only" id="language-select-label">{t('language')}</label>
        <Dropdown
          value={language}
          options={languageOptions}
          onChange={(value) => setLanguage(value as LanguageCode)}
          placeholder={t('language')}
          className="w-9"
          buttonClassName="!h-9 !w-9 !justify-center !gap-0 !rounded-full !bg-white/5 !px-0 !py-0 !text-lg !font-semibold !text-ink-100 hover:!bg-white/10"
          menuClassName="!min-w-32"
          ariaLabelledBy="language-select-label"
          menuAlign="right"
          icon={<span aria-hidden="true" className="inline-block grayscale brightness-0 invert">🌐</span>}
        />
        <label className="sr-only" id="theme-select-label">{t('theme')}</label>
        <Dropdown
          value={theme}
          options={themeOptions}
          onChange={(value) => setTheme(value as ThemeName)}
          placeholder={t('theme')}
          className="w-24 sm:w-28"
          buttonClassName="!rounded-full !bg-white/5 !px-3 !py-1.5 !text-xs !font-semibold !text-ink-100 hover:!bg-white/10"
          ariaLabelledBy="theme-select-label"
          menuAlign="right"
        />
        <span className="pill-mint hidden md:inline-flex">
          <Icons.Zap className="h-3 w-3" /> {t('live')}
        </span>
      </div>
    </header>
  );
}

function formatUptime(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
