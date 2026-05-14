import { Icons } from './icons';

type ProviderBrand = {
  label: string;
  colors: string[];
  Icon: React.ComponentType<{ className?: string }>;
  variant?: 'openai' | 'anthropic' | 'gemini' | 'xai' | 'moonshot' | 'qwen' | 'minimax' | 'mimo' | 'kiro' | 'antigravity' | 'generic';
  monogram?: string;
};

const BRANDS: Record<string, ProviderBrand> = {
  openai: { label: 'OpenAI', colors: ['#0b0f19', '#10a37f'], Icon: OpenAIMark, variant: 'openai' },
  anthropic: { label: 'Claude / Anthropic', colors: ['#d97757', '#f4eee4', '#8b5e3c'], Icon: ClaudeMark, variant: 'anthropic' },
  google: { label: 'Google Gemini', colors: ['#4285f4', '#a142f4', '#34a853'], Icon: GeminiMark, variant: 'gemini' },
  xai: { label: 'xAI', colors: ['#030712', '#52525b'], Icon: XaiMark, variant: 'xai' },
  moonshot: { label: 'Moonshot AI', colors: ['#111827', '#2563eb', '#8b5cf6'], Icon: MoonshotMark, variant: 'moonshot' },
  minimax: { label: 'MiniMax', colors: ['#111827', '#f97316', '#facc15'], Icon: MiniMaxMark, variant: 'minimax' },
  zhipu: { label: 'Zhipu GLM', colors: ['#111827', '#14b8a6', '#22c55e'], Icon: GlmMark, monogram: 'GLM' },
  'zhipu-glm': { label: 'Zhipu GLM', colors: ['#111827', '#14b8a6', '#22c55e'], Icon: GlmMark, monogram: 'GLM' },
  mimo: { label: 'Mimo AI', colors: ['#020617', '#38bdf8', '#a78bfa'], Icon: MimoMark, variant: 'mimo' },
  kiro: { label: 'Kiro.dev', colors: ['#9046FF', '#ffffff', '#0b0f19'], Icon: KiroDevMark, variant: 'kiro' },
  antigravity: { label: 'Google Antigravity', colors: ['#111827', '#ea4335', '#fbbc05', '#34a853', '#4285f4'], Icon: AntigravityMark, variant: 'antigravity' },
  mistral: { label: 'Mistral', colors: ['#ffcc00', '#ff7000', '#d71920'], Icon: MonogramMark, monogram: 'M' },
  cohere: { label: 'Cohere', colors: ['#8b5cf6', '#2563eb', '#00c2a8'], Icon: CircleClusterMark },
  deepseek: { label: 'DeepSeek', colors: ['#1d4ed8', '#38bdf8'], Icon: WaveMark },
  groq: { label: 'Groq', colors: ['#f97316', '#dc2626'], Icon: HexMark },
  together: { label: 'Together AI', colors: ['#7c3aed', '#06b6d4'], Icon: InfinityMark },
  fireworks: { label: 'Fireworks', colors: ['#ef4444', '#f59e0b'], Icon: SparkMark },
  perplexity: { label: 'Perplexity', colors: ['#20e3d2', '#4facfe'], Icon: PerplexityMark },
  openrouter: { label: 'OpenRouter', colors: ['#111827', '#8b5cf6'], Icon: RouteMark },
  'azure-openai': { label: 'Azure OpenAI', colors: ['#0078d4', '#50e6ff'], Icon: AzureMark },
  'aws-bedrock': { label: 'AWS Bedrock', colors: ['#232f3e', '#ff9900'], Icon: AwsMark },
  cloudflare: { label: 'Cloudflare', colors: ['#f38020', '#faae40'], Icon: CloudMark },
  huggingface: { label: 'Hugging Face', colors: ['#ffd21e', '#ff9f1c'], Icon: EmojiMark, monogram: '🤗' },
  'nvidia-nim': { label: 'NVIDIA NIM', colors: ['#76b900', '#d9f99d'], Icon: NvidiaMark },
  'alibaba-dashscope': { label: 'Alibaba DashScope', colors: ['#ff6a00', '#b91c1c'], Icon: MonogramMark, monogram: 'Q' },
  'github-models': { label: 'GitHub Models', colors: ['#0d1117', '#30363d'], Icon: GithubMark },
  ollama: { label: 'Ollama', colors: ['#18181b', '#3f3f46'], Icon: LlamaMark },
  lmstudio: { label: 'LM Studio', colors: ['#4f46e5', '#06b6d4'], Icon: MonogramMark, monogram: 'LM' },
  vllm: { label: 'vLLM', colors: ['#0891b2', '#7c3aed'], Icon: MonogramMark, monogram: 'vL' },
  'litellm-proxy': { label: 'LiteLLM', colors: ['#8b5cf6', '#22d3ee'], Icon: Icons.Zap },
};

export function ProviderLogo({ id, name, size = 'md' }: { id: string; name?: string; size?: 'sm' | 'md' | 'lg' }) {
  const brand = BRANDS[id] || fallbackBrand(id, name);
  const sizeClass = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-9 w-9' : 'h-12 w-12';
  const iconClass = size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-5 w-5' : 'h-7 w-7';
  const gradient = `linear-gradient(135deg, ${brand.colors.join(', ')})`;
  const Icon = brand.Icon;
  const isClaude = brand.variant === 'anthropic';
  return (
    <div
      className={`${sizeClass} provider-logo relative grid shrink-0 place-items-center overflow-hidden rounded-2xl border shadow-glow ${isClaude ? 'border-[#d97757]/25' : 'border-white/15'}`}
      style={{ background: isClaude ? '#f4eee4' : gradient, boxShadow: `0 16px 34px ${brand.colors[1] || brand.colors[0]}33` }}
      title={brand.label}
      aria-label={`${brand.label} logo`}
    >
      {!isClaude && brand.variant !== 'kiro' && <div className="absolute inset-0 bg-[radial-gradient(circle_at_26%_18%,rgba(255,255,255,.48),transparent_34%)]" />}
      <Icon className={`${iconClass} relative ${isClaude ? 'text-[#d97757]' : brand.variant === 'kiro' ? 'text-white' : 'text-white drop-shadow-sm'}`} />
      {brand.monogram && brand.Icon === MonogramMark && <span className="absolute inset-0 grid place-items-center font-display text-sm font-black tracking-tight text-white">{brand.monogram}</span>}
      {brand.Icon === EmojiMark && <span className="absolute inset-0 grid place-items-center text-xl">{brand.monogram}</span>}
    </div>
  );
}

export type OAuthProvider = {
  id: string;
  name: string;
  mode: 'Device flow' | 'PKCE callback' | 'Browser session' | 'Token import';
  status: 'ready' | 'manual-callback' | 'planned';
  authUrl: string;
  deviceUrl?: string;
  clientId?: string;
  redirectUri?: string;
  scopes?: string[];
  extraParams?: Record<string, string>;
  description: string;
};

export const OAUTH_PROVIDERS: OAuthProvider[] = [
  {
    id: 'codex', name: 'OpenAI Codex', mode: 'Device flow', status: 'manual-callback',
    authUrl: 'https://auth.openai.com/oauth/authorize', deviceUrl: 'https://auth.openai.com/codex/device',
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann', redirectUri: 'http://localhost:1455/auth/callback',
    scopes: ['openid', 'email', 'profile', 'offline_access'],
    extraParams: { codex_cli_simplified_flow: 'true', id_token_add_organizations: 'true', prompt: 'login' },
    description: 'Codex CLI style auth. Best UX is device flow; PKCE callback needs pasting the localhost callback URL unless a local bridge is running.',
  },
  {
    id: 'anthropic', name: 'Claude Code', mode: 'PKCE callback', status: 'manual-callback',
    authUrl: 'https://claude.ai/oauth/authorize', clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e', redirectUri: 'http://localhost:54545/callback',
    scopes: ['user:profile', 'user:inference', 'user:sessions:claude_code', 'user:mcp_servers', 'user:file_upload'],
    extraParams: { code: 'true' },
    description: 'Claude Code PKCE auth. Remote browser mode must paste the final localhost callback URL back into Nyth.',
  },
  {
    id: 'google', name: 'Gemini CLI', mode: 'PKCE callback', status: 'manual-callback',
    authUrl: 'https://accounts.google.com/o/oauth2/auth', clientId: '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com', redirectUri: 'http://localhost:8085/oauth2callback',
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
    extraParams: { access_type: 'offline', prompt: 'consent' },
    description: 'Gemini CLI / Google account auth with offline access. Callback paste is required in remote browser mode.',
  },
  { id: 'antigravity', name: 'Google Antigravity', mode: 'Browser session', status: 'planned', authUrl: 'https://antigravity.google.com', description: 'Account-login connector placeholder until an official or stable CLI auth flow is available.' },
  { id: 'kiro', name: 'Kiro.dev', mode: 'Kiro Connect', status: 'manual-callback', authUrl: 'https://kiro.dev', description: 'Connect using browser/cache auto-detect or secure local refreshToken paste. Tokens are encrypted and never shown again.' },
  { id: 'mimo', name: 'Mimo', mode: 'Browser session', status: 'planned', authUrl: 'https://mimo.org', description: 'Mimo account-login connector placeholder.' },
  { id: 'moonshot', name: 'Moonshot / Kimi', mode: 'Browser session', status: 'planned', authUrl: 'https://kimi.moonshot.cn', description: 'Kimi account-login connector placeholder for quota-style access.' },
  { id: 'xai', name: 'xAI / Grok', mode: 'Browser session', status: 'planned', authUrl: 'https://grok.com', description: 'Grok account-login connector placeholder.' },
  { id: 'zhipu', name: 'GLM / Z.ai', mode: 'Token import', status: 'planned', authUrl: 'https://chatglm.cn', description: 'GLM account/token import connector placeholder.' },
  { id: 'minimax', name: 'MiniMax', mode: 'Token import', status: 'planned', authUrl: 'https://www.minimax.io', description: 'MiniMax account/token import connector placeholder.' },
];

function fallbackBrand(id: string, name?: string): ProviderBrand {
  const seed = id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const hue = seed * 47 % 360;
  return {
    label: name || id,
    colors: [`hsl(${hue}, 82%, 48%)`, `hsl(${(hue + 80) % 360}, 76%, 56%)`],
    Icon: GenericMark,
  };
}

function OpenAIMark({ className = '' }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3.5c2.1 0 3.4 1 4.2 2.4 1.7.2 3.1 1.4 3.7 3 .6 1.7.1 3.4-1.1 4.6.2 1.7-.6 3.4-2.1 4.4-1.5 1-3.3 1-4.7.2-1.5.8-3.3.8-4.7-.2-1.5-1-2.3-2.7-2.1-4.4-1.2-1.2-1.7-2.9-1.1-4.6.6-1.6 2-2.8 3.7-3 .8-1.4 2.1-2.4 4.2-2.4Z"/><path d="M8 6.2l8 4.6v5.1M16 6.2 8 10.8v5.1M6.2 12l5.8 3.4 5.8-3.4"/></svg>; }
function ClaudeMark({ className = '' }) { return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d="M12 2.6 21.1 21.4h-4.2l-1.7-3.9H8.7L7 21.4H2.9L12 2.6Zm-1.9 11.7h3.8L12 9.7l-1.9 4.6Z"/><path d="M12 2.6 8.7 17.5h6.5L12 2.6Z" opacity="0.28"/></svg>; }
function GeminiMark({ className = '' }) { return <svg viewBox="0 0 24 24" className={className} fill="currentColor"><path d="M12 2c.9 5.4 4.6 9.1 10 10-5.4.9-9.1 4.6-10 10-.9-5.4-4.6-9.1-10-10 5.4-.9 9.1-4.6 10-10Z"/></svg>; }
function XaiMark({ className = '' }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 19 19 4M7 4l13 16M4 4l6.5 7"/></svg>; }
function MoonshotMark({ className = '' }) { return <svg viewBox="0 0 24 24" className={className} fill="currentColor"><path d="M14.5 2.5a9.5 9.5 0 1 0 7 15.9A8.2 8.2 0 1 1 14.5 2.5Z"/><circle cx="16" cy="9" r="1.5"/></svg>; }
function MiniMaxMark({ className = '' }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 18V6l8 8 8-8v12M4 6l8 8 8-8"/></svg>; }
function MimoMark({ className = '' }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 18V6l8 8 8-8v12"/><circle cx="12" cy="14" r="2" fill="currentColor"/></svg>; }
function KiroDevMark({ className = '' }) { return <svg viewBox="0 0 1200 1200" className={className} fill="none" aria-hidden="true"><path d="M398.554 818.914C316.315 1001.03 491.477 1046.74 620.672 940.156C658.687 1059.66 801.052 970.473 852.234 877.795C964.787 673.567 919.318 465.357 907.64 422.374C827.637 129.443 427.623 128.946 358.8 423.865C342.651 475.544 342.402 534.18 333.458 595.051C328.986 625.86 325.507 645.488 313.83 677.785C306.873 696.424 297.68 712.819 282.773 740.645C259.915 783.881 269.604 867.113 387.87 823.883L399.051 818.914H398.554Z" fill="currentColor"/><path d="M636.123 549.353C603.328 549.353 598.359 510.097 598.359 486.742C598.359 465.623 602.086 448.977 609.293 438.293C615.504 428.852 624.697 424.131 636.123 424.131C647.555 424.131 657.492 428.852 664.447 438.541C672.398 449.474 676.623 466.12 676.623 486.742C676.623 525.998 661.471 549.353 636.375 549.353H636.123Z" fill="#0b0f19"/><path d="M771.24 549.353C738.445 549.353 733.477 510.097 733.477 486.742C733.477 465.623 737.203 448.977 744.41 438.293C750.621 428.852 759.814 424.131 771.24 424.131C782.672 424.131 792.609 428.852 799.564 438.541C807.516 449.474 811.74 466.12 811.74 486.742C811.74 525.998 796.588 549.353 771.492 549.353H771.24Z" fill="#0b0f19"/></svg>; }
function AntigravityMark({ className = '' }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5"/></svg>; }
function GlmMark({ className = '' }) { return <Icons.Hexagon className={className} />; }
function MonogramMark({ className = '' }) { return <span className={className} />; }
function EmojiMark({ className = '' }) { return <span className={className} />; }
function CircleClusterMark({ className = '' }) { return <svg viewBox="0 0 24 24" className={className} fill="currentColor"><circle cx="8" cy="8" r="4"/><circle cx="16" cy="8" r="4" opacity=".75"/><circle cx="12" cy="16" r="4" opacity=".55"/></svg>; }
function WaveMark({ className = '' }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 13c3-6 6 6 9 0s6 6 9 0"/><path d="M3 8c3-6 6 6 9 0s6 6 9 0"/></svg>; }
function HexMark({ className = '' }) { return <Icons.Hexagon className={className} />; }
function InfinityMark({ className = '' }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M7 8c-3 0-5 2-5 4s2 4 5 4c4 0 6-8 10-8 3 0 5 2 5 4s-2 4-5 4c-4 0-6-8-10-8Z"/></svg>; }
function SparkMark({ className = '' }) { return <Icons.Sparkles className={className} />; }
function PerplexityMark({ className = '' }) { return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 4h14v16H5z"/><path d="M5 12h14M12 4v16M5 4l7 8 7-8M5 20l7-8 7 8"/></svg>; }
function RouteMark({ className = '' }) { return <Icons.Route className={className} />; }
function AzureMark({ className = '' }) { return <Icons.Cloud className={className} />; }
function AwsMark({ className = '' }) { return <svg viewBox="0 0 24 24" className={className} fill="currentColor"><path d="M5 16c4 3 10 3 14 0l1.2 1.6c-4.8 3.7-11.6 3.7-16.4 0L5 16Zm1-8h3l1 7H8.2l-.2-1.5H6L5.8 15H4l2-7Zm.2 4h1.6l-.6-2.6h-.4L6.2 12Zm5.2-4h2.2l1.1 4.4L16 8h2.1l-2.2 7h-2.1l-1.1-4.2-1.1 4.2H9.5l-1-7h1.8l.4 4.3L11.4 8Z"/></svg>; }
function CloudMark({ className = '' }) { return <Icons.Cloud className={className} />; }
function NvidiaMark({ className = '' }) { return <Icons.Eye className={className} />; }
function GithubMark({ className = '' }) { return <Icons.Code2 className={className} />; }
function LlamaMark({ className = '' }) { return <Icons.Cpu className={className} />; }
function GenericMark({ className = '' }) { return <Icons.Sparkles className={className} />; }
