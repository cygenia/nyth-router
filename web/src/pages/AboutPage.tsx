import { Page } from '../components/Page';
import { Icons } from '../lib/icons';

const version = '0.2.0';
const githubUrl = 'https://github.com/cygenia/nyth-router';

export default function AboutPage() {
  return (
    <Page title="About" description="Product details, documentation, and repository reference.">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="panel p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-aurora-violet/30 bg-aurora-violet/15 text-aurora-violet shadow-glow">
              <Icons.Info className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-aurora-mint">Nyth</p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-50">A calmer place for your models</h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-300">
                Nyth keeps your providers, routes, accounts, keys, usage, and logs in one private place.
              </p>
            </div>
          </div>
        </section>

        <section className="panel p-6 md:p-8">
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-ink-300">Version</span>
              <span className="font-mono text-ink-50">v{version}</span>
            </div>
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-ink-100 transition hover:border-aurora-violet/40 hover:bg-aurora-violet/10"
            >
              <span className="flex items-center gap-2"><Icons.GitBranch className="h-4 w-4 text-aurora-violet" /> GitHub</span>
              <span className="font-mono text-xs text-ink-300">github.com/cygenia/nyth-router</span>
            </a>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center gap-2 font-semibold text-ink-50"><Icons.BookText className="h-4 w-4 text-aurora-mint" /> Docs</div>
              <p className="mt-2 text-xs leading-relaxed text-ink-300">
                Docs live in the repository docs folder: API, OAuth, providers, routing, and security notes.
              </p>
            </div>
          </div>
        </section>
      </div>
    </Page>
  );
}
