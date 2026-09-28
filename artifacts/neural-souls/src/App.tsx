import { type ButtonHTMLAttributes, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, RedirectToSignIn, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import {
  Activity, ArrowLeft, ArrowUpRight, CalendarDays, Check, ChevronRight, CircleAlert,
  Clock3, Command, Compass, FolderKanban, Gauge, LayoutDashboard, Menu, Pencil, Plus,
  RefreshCw, Save, Search, Settings2, ShieldCheck, Sparkles, Trash2, UserRound, Zap,
} from 'lucide-react';
import {
  Project, ProjectInputStatus, getGetCurrentProfileQueryKey, getGetDashboardSummaryQueryKey,
  getGetProjectQueryKey, getHealthCheckQueryKey, getListProjectsQueryKey,
  useCreateProject, useDeleteProject, useGetCurrentProfile, useGetDashboardSummary,
  useGetProject, useHealthCheck, useListProjects, useUpdateCurrentProfile, useUpdateProject,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import '@/index.css';

const queryClient = new QueryClient();
const statuses = ['planning', 'active', 'at_risk', 'completed'] as const;
type Status = typeof statuses[number];
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" data-testid="brand-neural-souls">
      <div className={`grid h-8 w-8 place-items-center rounded-[10px] ${dark ? 'bg-[#f2ecdc] text-[#173b42]' : 'bg-[#0e7168] text-[#f2ecdc]'}`}>
        <span className="display text-sm font-bold">N</span>
      </div>
      <div className={`display text-[15px] font-bold tracking-[-.04em] ${dark ? 'text-[#f2ecdc]' : 'text-[#173b42]'}`}>NEURAL SOULS</div>
    </div>
  );
}

function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'outline' | 'danger' }) {
  const styles = {
    primary: 'bg-[#0e7168] text-[#f8f3e8] hover:bg-[#0b5d56]',
    quiet: 'bg-transparent text-[#557074] hover:bg-[#e9e7db] hover:text-[#173b42]',
    outline: 'border border-[#d8d6c9] bg-[#faf8f1] text-[#173b42] hover:border-[#0e7168] hover:text-[#0e7168]',
    danger: 'border border-[#e8c8c3] bg-[#fdf3f0] text-[#a33d35] hover:bg-[#f8e4df]',
  };
  return <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`} />;
}

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-[#d9eee8] text-[#0e7168]',
    at_risk: 'bg-[#f9e2d5] text-[#a64b2e]',
    planning: 'bg-[#e5e9e3] text-[#557074]',
    completed: 'bg-[#dce5ef] text-[#315878]',
  };
  const label = status.replace('_', ' ');
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[.08em] ${map[status] ?? map.planning}`} data-testid={`status-${status}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{label}</span>;
}

function LoadingBlock({ lines = 3 }: { lines?: number }) {
  return <div className="space-y-3" data-testid="loading-state">{Array.from({ length: lines }).map((_, i) => <div key={i} className={`skeleton h-12 rounded-xl ${i === 0 ? 'w-3/4' : i === lines - 1 ? 'w-1/2' : 'w-full'}`} />)}</div>;
}

function ErrorState({ onRetry, label = 'Could not load this view.' }: { onRetry?: () => void; label?: string }) {
  return <div className="rounded-2xl border border-[#eccbc5] bg-[#fff6f3] p-7 text-center" data-testid="error-state">
    <CircleAlert className="mx-auto mb-3 h-6 w-6 text-[#b45043]" />
    <p className="font-bold text-[#71372f]">{label}</p><p className="mt-1 text-sm text-[#95655d]">The signal dropped before we got a read.</p>
    {onRetry && <Button variant="outline" className="mt-4" onClick={onRetry} data-testid="button-retry"><RefreshCw className="h-4 w-4" /> Try again</Button>}
  </div>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-[#c9d0c9] bg-[#f8f7ef] px-6 py-14 text-center" data-testid="empty-state">
    <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#dcece5] text-[#0e7168]"><FolderKanban className="h-5 w-5" /></div>
    <h3 className="display text-lg font-bold text-[#173b42]">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#668084]">{body}</p>{action && <div className="mt-5">{action}</div>}
  </div>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const profile = useGetCurrentProfile({ request: { credentials: 'include' } });
  const nav = [
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/projects', label: 'Projects', icon: FolderKanban },
    { href: '/profile', label: 'Profile', icon: UserRound },
  ];
  return <div className="noise min-h-[100dvh] bg-[#f3f1e8] text-[#173b42]">
    <aside className={`fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col bg-[#173b42] px-4 py-5 transition-transform md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="px-2 pb-9"><Logo dark /></div>
      <div className="px-2 pb-3 text-[10px] font-extrabold uppercase tracking-[.18em] text-[#719095]">Command center</div>
      <nav className="space-y-1">
        {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition-colors ${location === href ? 'bg-[#28535a] text-[#f4eee0]' : 'text-[#a6bdbe] hover:bg-[#20474e] hover:text-[#f4eee0]'}`} data-testid={`link-${label.toLowerCase()}`}><Icon className="h-[17px] w-[17px]" />{label}</Link>)}
      </nav>
      <div className="mt-auto rounded-2xl border border-[#2b555b] bg-[#20474e] p-4">
        <div className="mb-3 flex items-center gap-2 text-[#9fc9c0]"><ShieldCheck className="h-4 w-4" /><span className="text-[11px] font-bold uppercase tracking-[.1em]">System status</span></div>
        <div className="flex items-center justify-between text-xs text-[#c9d9d5]"><span>API heartbeat</span><span className="flex items-center gap-1.5 font-bold text-[#83d1bc]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#83d1bc]" /> nominal</span></div>
      </div>
      <Link href="/profile" className="mt-4 flex items-center gap-3 rounded-xl p-2 text-left hover:bg-[#20474e]" data-testid="link-sidebar-profile">
        <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[#ed9b76] text-sm font-extrabold text-[#173b42]">{profile.data?.fullName?.slice(0, 1).toUpperCase() ?? 'S'}</div>
        <div className="min-w-0"><div className="truncate text-xs font-bold text-[#f4eee0]" data-testid="text-sidebar-name">{profile.data?.fullName || 'Your profile'}</div><div className="truncate text-[10px] text-[#89a9ab]">{profile.data?.email || 'Signed-in workspace'}</div></div>
      </Link>
    </aside>
    {mobileOpen && <button className="fixed inset-0 z-20 bg-[#173b42]/40 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu" data-testid="button-close-menu" />}
    <main className="min-h-[100dvh] md:ml-[248px]">
      <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-[#deddd2]/80 bg-[#f3f1e8]/90 px-5 backdrop-blur md:px-9">
        <button className="rounded-lg p-2 md:hidden" onClick={() => setMobileOpen(true)} data-testid="button-open-menu"><Menu className="h-5 w-5" /></button>
        <div className="hidden items-center gap-2 text-xs text-[#789093] md:flex"><Command className="h-4 w-4" /><span>Neural command center</span><span className="text-[#b9c0b9]">/</span><span className="font-bold text-[#173b42]">{nav.find((n) => n.href === location)?.label ?? 'Project signal'}</span></div>
        <div className="ml-auto flex items-center gap-2"><Link href="/" className="hidden rounded-lg px-3 py-2 text-xs font-bold text-[#668084] hover:bg-[#e7e6dc] md:block" data-testid="link-public-home">Public site</Link><Link href="/profile" className="rounded-lg p-2 text-[#668084] hover:bg-[#e7e6dc]" data-testid="link-header-profile"><Settings2 className="h-4 w-4" /></Link><LogoutButton /></div>
      </header>
      <div className="mx-auto max-w-[1320px] px-5 py-8 md:px-9 md:py-10">{children}</div>
    </main>
  </div>;
}

function Home() {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() }, request: { credentials: 'include' } });
  return <div className="min-h-[100dvh] bg-[#f4f0e5] text-[#173b42]">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 md:px-10"><Logo /><div className="flex items-center gap-2"><Link href="/sign-in" className="rounded-xl px-4 py-2.5 text-sm font-bold text-[#557074] hover:bg-[#e7e5d9]" data-testid="link-sign-in">Sign in</Link><Link href="/sign-up" className="rounded-xl bg-[#173b42] px-4 py-2.5 text-sm font-bold text-[#f4f0e5] hover:bg-[#28535a]" data-testid="link-sign-up">Create workspace</Link></div></header>
    <section className="mx-auto grid max-w-7xl items-center gap-16 px-5 pb-20 pt-12 md:grid-cols-[1.05fr_.95fr] md:px-10 md:pb-28 md:pt-24">
      <div className="animate-rise"><div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#b9d7ce] bg-[#e4f0ea] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[.14em] text-[#0e7168]"><span className="h-1.5 w-1.5 rounded-full bg-[#ed9b76]" /> delivery intelligence for small teams</div><h1 className="display max-w-xl text-[clamp(3.2rem,7vw,6.4rem)] font-bold leading-[.93] tracking-[-.075em]">Know what<br /><span className="text-[#0e7168]">slips next.</span></h1><p className="mt-7 max-w-lg text-lg leading-8 text-[#557074]">Neural Souls turns scattered project signals into a clear read on delivery risk, so your team can spend its energy building instead of guessing.</p><div className="mt-9 flex flex-wrap items-center gap-3"><Link href="/sign-up" className="inline-flex items-center gap-2 rounded-xl bg-[#ed9b76] px-5 py-3.5 text-sm font-extrabold text-[#173b42] hover:bg-[#f1aa89]" data-testid="link-hero-start">Start reading your project <ArrowUpRight className="h-4 w-4" /></Link><a href="#how-it-works" className="inline-flex items-center gap-2 px-4 py-3.5 text-sm font-bold text-[#557074]" data-testid="link-how-it-works">See how it works <ChevronRight className="h-4 w-4" /></a></div></div>
      <div className="relative animate-rise animate-rise-2"><div className="absolute -right-3 -top-8 h-32 w-32 rounded-full bg-[#ed9b76]/20 blur-3xl" /><div className="relative overflow-hidden rounded-[28px] border border-[#d4d6c9] bg-[#173b42] p-5 shadow-[0_24px_50px_rgba(23,59,66,.16)] md:p-7"><div className="flex items-center justify-between border-b border-[#315a5e] pb-5"><div><p className="mono text-[10px] uppercase tracking-[.16em] text-[#85aaa7]">signal / alpha 07</p><p className="mt-1 text-sm font-bold text-[#edf0e4]">Project health snapshot</p></div><div className="flex items-center gap-1.5 text-[10px] font-bold text-[#83d1bc]"><span className="h-1.5 w-1.5 rounded-full bg-[#83d1bc]" /> live</div></div><div className="grid grid-cols-2 gap-3 py-6"><div className="rounded-2xl bg-[#20474e] p-4"><p className="text-[10px] uppercase tracking-[.12em] text-[#8eb2b1]">delivery confidence</p><p className="display mt-3 text-4xl font-bold text-[#f4f0e5]">72<span className="text-xl text-[#83d1bc]">%</span></p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#315b60]"><div className="h-full w-[72%] rounded-full bg-[#83d1bc]" /></div></div><div className="rounded-2xl bg-[#20474e] p-4"><p className="text-[10px] uppercase tracking-[.12em] text-[#8eb2b1]">risk signals</p><p className="display mt-3 text-4xl font-bold text-[#ed9b76]">03</p><p className="mt-3 text-xs font-bold text-[#b8cbca]">2 need attention</p></div></div><div className="space-y-2"><div className="flex items-center justify-between rounded-xl border border-[#315a5e] px-3 py-3"><span className="flex items-center gap-2 text-xs text-[#c9dad5]"><span className="h-2 w-2 rounded-full bg-[#83d1bc]" /> API integration</span><span className="text-[10px] font-bold text-[#83d1bc]">on track</span></div><div className="flex items-center justify-between rounded-xl border border-[#315a5e] px-3 py-3"><span className="flex items-center gap-2 text-xs text-[#c9dad5]"><span className="h-2 w-2 rounded-full bg-[#ed9b76]" /> Auth flow</span><span className="text-[10px] font-bold text-[#ed9b76]">at risk</span></div><div className="flex items-center justify-between rounded-xl border border-[#315a5e] px-3 py-3"><span className="flex items-center gap-2 text-xs text-[#c9dad5]"><span className="h-2 w-2 rounded-full bg-[#ed9b76]" /> Launch scope</span><span className="text-[10px] font-bold text-[#ed9b76]">watch</span></div></div></div></div>
    </section>
    <section id="how-it-works" className="border-y border-[#ded9cc] bg-[#ece9dc]"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:grid-cols-[.7fr_1.3fr] md:px-10 md:py-24"><div><p className="mono text-[10px] font-bold uppercase tracking-[.18em] text-[#0e7168]">a calmer way to ship</p><h2 className="display mt-4 max-w-sm text-4xl font-bold leading-tight tracking-[-.05em]">Less status theatre.<br />More useful signal.</h2></div><div className="grid gap-5 md:grid-cols-3">{[['01', 'Bring the work together', 'Your project gets one honest home for the plan, the deadline, and the latest read.'], ['02', 'See pressure early', 'A focused overview makes schedule drag and blocked work visible before standup.'], ['03', 'Move with context', 'Keep decisions close to the signal, not buried in a dozen tools.']].map(([n, t, d]) => <div key={n} className="border-t-2 border-[#b7cbc1] pt-4"><span className="mono text-xs font-bold text-[#ed9b76]">{n}</span><h3 className="mt-5 font-bold">{t}</h3><p className="mt-2 text-sm leading-6 text-[#668084]">{d}</p></div>)}</div></div></section>
    <footer className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-xs text-[#789093] md:flex-row md:items-center md:justify-between md:px-10"><span>Neural Souls — a clearer room for ambitious small teams.</span><span className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${health.isError ? 'bg-[#b45043]' : 'bg-[#0e7168]'}`} /> {health.isError ? 'signal unavailable' : 'systems nominal'}</span></footer>
  </div>;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#0e7168',
    colorForeground: '#173b42',
    colorMutedForeground: '#668084',
    colorDanger: '#a33d35',
    colorBackground: '#faf8f1',
    colorInput: '#f4f0e5',
    colorInputForeground: '#173b42',
    colorNeutral: '#d8d6c9',
    borderRadius: '0.75rem',
    fontFamily: 'Manrope, sans-serif',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#faf8f1] rounded-[24px] w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'display text-3xl font-bold tracking-[-.05em]',
    headerSubtitle: 'text-sm text-[#668084]',
    socialButtonsBlockButtonText: 'text-[#173b42] font-bold',
    formFieldLabel: 'text-[#557074] font-bold',
    footerActionText: 'text-[#668084]',
    formButtonPrimary: 'bg-[#0e7168] hover:bg-[#0b5d56] rounded-xl',
    socialButtonsBlockButton: 'border-[#d8d6c9] rounded-xl bg-[#f4f0e5]',
    formFieldInput: 'rounded-xl border-[#d8d6c9] bg-[#f4f0e5]',
    footerActionLink: 'text-[#0e7168] font-bold',
    dividerText: 'text-[#668084]',
    dividerLine: 'bg-[#d8d6c9]',
    main: 'bg-transparent',
  },
};

function ClerkSignInPage() {
  return <AuthFrame><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/dashboard`} appearance={clerkAppearance} /></AuthFrame>;
}

function ClerkSignUpPage() {
  return <AuthFrame><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/dashboard`} appearance={clerkAppearance} /></AuthFrame>;
}

function AuthFrame({ children }: { children: ReactNode }) {
  return <div className="grid min-h-[100dvh] bg-[#173b42] md:grid-cols-[1fr_1fr]"><div className="hidden flex-col justify-between p-10 md:flex"><Logo dark /><div className="max-w-md pb-10"><p className="mono text-[10px] uppercase tracking-[.18em] text-[#83d1bc]">private workspace / authentication</p><h1 className="display mt-5 text-6xl font-bold leading-[.94] tracking-[-.07em] text-[#f4f0e5]">Build with<br /><span className="text-[#ed9b76]">your eyes open.</span></h1><p className="mt-6 max-w-sm text-sm leading-7 text-[#a9c0be]">A quiet command center for the moments when the plan starts to bend.</p></div><div className="text-xs text-[#789b9c]">Protected by Clerk · cookie-based session</div></div><div className="flex items-center justify-center bg-[#f4f0e5] px-5 py-10"><div className="w-full max-w-[440px]"><div className="mb-8 md:hidden"><Logo /></div>{children}<Link href="/" className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#668084]" data-testid="link-clerk-auth-home"><ArrowLeft className="h-3.5 w-3.5" /> Back to public site</Link></div></div></div>;
}

function LogoutButton() {
  const { signOut } = useClerk();
  return <button type="button" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="rounded-lg px-3 py-2 text-xs font-bold text-[#668084] hover:bg-[#e7e6dc]" data-testid="button-logout">Log out</button>;
}

function AuthLoading() {
  return <div className="grid min-h-[100dvh] place-items-center bg-[#f4f0e5]"><div className="text-center"><div className="mx-auto h-8 w-8 animate-pulse rounded-xl bg-[#0e7168]" /><p className="mt-4 text-sm font-bold text-[#557074]">Loading your workspace...</p></div></div>;
}

function Protected({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <AuthLoading />;
  if (!isSignedIn) return <RedirectToSignIn />;
  return <>{children}</>;
}

function StatCard({ label, value, detail, tone = 'teal', icon: Icon }: { label: string; value: number; detail: string; tone?: string; icon: typeof Activity }) {
  return <div className="rounded-2xl border border-[#deddd2] bg-[#faf8f1] p-5 shadow-[var(--shadow-sm)]"><div className="flex items-start justify-between"><p className="text-xs font-bold text-[#668084]">{label}</p><div className={`rounded-lg p-2 ${tone === 'coral' ? 'bg-[#f9e2d5] text-[#a64b2e]' : tone === 'blue' ? 'bg-[#dce5ef] text-[#315878]' : 'bg-[#d9eee8] text-[#0e7168]'}`}><Icon className="h-4 w-4" /></div></div><div className="display mt-5 text-4xl font-bold tracking-[-.06em]" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</div><p className="mt-2 text-xs text-[#789093]">{detail}</p></div>;
}

function Dashboard() {
  const summary = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() }, request: { credentials: 'include' } });
  const profile = useGetCurrentProfile({ query: { queryKey: getGetCurrentProfileQueryKey() }, request: { credentials: 'include' } });
  const recent = summary.data?.recentProjects ?? [];
  return <Shell><div className="animate-rise"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mono text-[10px] font-bold uppercase tracking-[.17em] text-[#0e7168]">overview / today</p><h1 className="display mt-3 text-4xl font-bold tracking-[-.06em] md:text-5xl">Good signal, {profile.data?.fullName?.split(' ')[0] || 'builder'}.</h1><p className="mt-3 text-sm text-[#668084]">Here is where your delivery deserves attention.</p></div><Link href="/projects/new" className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-[#ed9b76] px-4 py-3 text-sm font-extrabold text-[#173b42] hover:bg-[#f1aa89] md:self-auto" data-testid="link-create-project"><Plus className="h-4 w-4" /> New project</Link></div>{summary.isLoading ? <div className="mt-9"><LoadingBlock lines={4} /></div> : summary.isError ? <div className="mt-9"><ErrorState onRetry={() => summary.refetch()} /></div> : <><div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="Active projects" value={summary.data?.activeProjects ?? 0} detail="currently in motion" icon={Zap} /><StatCard label="Due soon" value={summary.data?.tasksDueSoon ?? 0} detail="next 7 days" icon={Clock3} tone="blue" /><StatCard label="Overdue tasks" value={summary.data?.overdueTasks ?? 0} detail="need a decision" icon={CircleAlert} tone="coral" /><StatCard label="Blocked tasks" value={summary.data?.blockedTasks ?? 0} detail={`${summary.data?.completedTasks ?? 0} completed recently`} icon={ShieldCheck} /></div><div className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_.65fr]"><section className="rounded-2xl border border-[#deddd2] bg-[#faf8f1] p-5 shadow-[var(--shadow-sm)] md:p-6"><div className="flex items-center justify-between"><div><p className="mono text-[10px] uppercase tracking-[.15em] text-[#789093]">work in motion</p><h2 className="display mt-2 text-xl font-bold tracking-[-.04em]">Recent projects</h2></div><Link href="/projects" className="text-xs font-bold text-[#0e7168]" data-testid="link-dashboard-projects">View all <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" /></Link></div>{recent.length === 0 ? <div className="py-12"><EmptyState title="No projects in the room yet" body="Start a project to give your next idea a clear place to land." action={<Link href="/projects/new" className="inline-flex rounded-xl bg-[#0e7168] px-4 py-2.5 text-sm font-bold text-[#f8f3e8]" data-testid="link-empty-create">Create first project</Link>} /></div> : <div className="mt-5 divide-y divide-[#e5e2d8]">{recent.map((project) => <ProjectRow key={project.id} project={project} />)}</div>}</section><section className="rounded-2xl bg-[#173b42] p-6 text-[#f4f0e5]"><div className="flex items-center gap-2 text-[#83d1bc]"><Gauge className="h-4 w-4" /><span className="mono text-[10px] uppercase tracking-[.15em]">reading the room</span></div><h2 className="display mt-5 text-2xl font-bold leading-tight tracking-[-.05em]">Your next clear move is worth more than another status update.</h2><p className="mt-4 text-sm leading-6 text-[#a9c0be]">Use project status as a decision: what is moving, what needs care, and what can wait.</p><Link href="/projects" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-[#ed9b76]" data-testid="link-dashboard-explore">Explore project signals <ArrowUpRight className="h-4 w-4" /></Link></section></div></>}</div></Shell>;
}

function ProjectRow({ project }: { project: Project }) {
  return <Link href={`/projects/${project.id}`} className="group flex items-center justify-between gap-4 py-4" data-testid={`row-project-${project.id}`}><div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e6eee8] text-[#0e7168]"><FolderKanban className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-sm font-extrabold text-[#173b42]">{project.name}</p><p className="mt-1 truncate text-xs text-[#789093]">{project.description || 'No project brief yet'}</p></div></div><div className="flex shrink-0 items-center gap-3"><Badge status={project.status} /><ChevronRight className="h-4 w-4 text-[#a5b0aa] transition-transform group-hover:translate-x-1" /></div></Link>;
}

function Projects() {
  const projects = useListProjects({ query: { queryKey: getListProjectsQueryKey() }, request: { credentials: 'include' } });
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => (projects.data ?? []).filter((p) => `${p.name} ${p.description ?? ''}`.toLowerCase().includes(search.toLowerCase())), [projects.data, search]);
  return <Shell><div className="animate-rise"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mono text-[10px] font-bold uppercase tracking-[.17em] text-[#0e7168]">workspace / projects</p><h1 className="display mt-3 text-4xl font-bold tracking-[-.06em]">Projects</h1><p className="mt-3 text-sm text-[#668084]">Every active idea, with its pressure points in view.</p></div><Link href="/projects/new" className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-[#0e7168] px-4 py-3 text-sm font-extrabold text-[#f8f3e8]" data-testid="link-projects-new"><Plus className="h-4 w-4" /> New project</Link></div><div className="mt-8 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3.5 top-3 h-4 w-4 text-[#8ba09e]" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-xl border border-[#d8d6c9] bg-[#faf8f1] py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#0e7168]" placeholder="Search projects..." data-testid="input-project-search" /></div><div className="flex items-center gap-2 rounded-xl border border-[#d8d6c9] bg-[#faf8f1] px-3 text-xs text-[#668084]"><Activity className="h-4 w-4 text-[#0e7168]" /> {projects.data?.length ?? 0} projects</div></div><div className="mt-5">{projects.isLoading ? <LoadingBlock lines={5} /> : projects.isError ? <ErrorState onRetry={() => projects.refetch()} /> : filtered.length === 0 ? <EmptyState title={search ? 'No matching projects' : 'Your workspace is clear'} body={search ? 'Try a different phrase or clear the search.' : 'Create a project to start seeing delivery signal here.'} action={!search ? <Link href="/projects/new" className="inline-flex rounded-xl bg-[#0e7168] px-4 py-2.5 text-sm font-bold text-[#f8f3e8]" data-testid="link-projects-empty-create">Create project</Link> : undefined} /> : <div className="overflow-hidden rounded-2xl border border-[#deddd2] bg-[#faf8f1] shadow-[var(--shadow-sm)]">{filtered.map((project) => <ProjectRow key={project.id} project={project} />)}</div>}</div></div></Shell>;
}

function ProjectForm({ project, isNew = false }: { project?: Project; isNew?: boolean }) {
  const [, setLocation] = useLocation();
  const client = useQueryClient();
  const create = useCreateProject({ request: { credentials: 'include' } });
  const update = useUpdateProject({ request: { credentials: 'include' } });
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [startDate, setStartDate] = useState(project?.startDate?.slice(0, 10) ?? '');
  const [deadline, setDeadline] = useState(project?.deadline?.slice(0, 10) ?? '');
  const [status, setStatus] = useState<Status>((project?.status as Status) ?? 'planning');
  const pending = create.isPending || update.isPending;
  const submit = (e: FormEvent) => { e.preventDefault(); if (!name.trim()) return; const data = { name: name.trim(), description: description.trim() || null, startDate: startDate || null, deadline: deadline || null, status: status as ProjectInputStatus }; if (isNew) create.mutate({ data }, { onSuccess: (created) => { client.invalidateQueries({ queryKey: getListProjectsQueryKey() }); client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); setLocation(`/projects/${created.id}`); } }); else if (project) update.mutate({ projectId: project.id, data }, { onSuccess: (updated) => { client.setQueryData(getGetProjectQueryKey(project.id), updated); client.invalidateQueries({ queryKey: getListProjectsQueryKey() }); setLocation(`/projects/${updated.id}`); } }); };
  return <Shell><div className="mx-auto max-w-3xl animate-rise"><Link href={isNew ? '/projects' : `/projects/${project?.id}`} className="inline-flex items-center gap-2 text-xs font-bold text-[#668084]" data-testid="link-form-back"><ArrowLeft className="h-3.5 w-3.5" /> Back to projects</Link><div className="mt-7"><p className="mono text-[10px] font-bold uppercase tracking-[.17em] text-[#0e7168]">{isNew ? 'new project' : 'edit project'}</p><h1 className="display mt-3 text-4xl font-bold tracking-[-.06em]">{isNew ? 'Give the work a home.' : 'Tune the project signal.'}</h1><p className="mt-3 text-sm text-[#668084]">{isNew ? 'A name and a deadline are enough to begin reading the room.' : 'Keep the shared context sharp as the work changes.'}</p></div><form onSubmit={submit} className="mt-8 space-y-5 rounded-2xl border border-[#deddd2] bg-[#faf8f1] p-5 shadow-[var(--shadow-sm)] md:p-7"><label className="block text-sm font-bold">Project name<input required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d8d6c9] bg-[#f4f0e5] px-3.5 py-3 text-sm outline-none focus:border-[#0e7168]" placeholder="e.g. Campus Cart" data-testid="input-project-name" /></label><label className="block text-sm font-bold">Description<span className="ml-2 text-xs font-normal text-[#8aa09d]">optional</span><textarea maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} className="mt-2 min-h-28 w-full resize-y rounded-xl border border-[#d8d6c9] bg-[#f4f0e5] px-3.5 py-3 text-sm outline-none focus:border-[#0e7168]" placeholder="What does done look like?" data-testid="input-project-description" /></label><div className="grid gap-5 md:grid-cols-2"><label className="block text-sm font-bold">Start date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d8d6c9] bg-[#f4f0e5] px-3.5 py-3 text-sm outline-none focus:border-[#0e7168]" data-testid="input-project-start-date" /></label><label className="block text-sm font-bold">Deadline<input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d8d6c9] bg-[#f4f0e5] px-3.5 py-3 text-sm outline-none focus:border-[#0e7168]" data-testid="input-project-deadline" /></label></div><label className="block text-sm font-bold">Current status<select value={status} onChange={(e) => setStatus(e.target.value as Status)} className="mt-2 w-full rounded-xl border border-[#d8d6c9] bg-[#f4f0e5] px-3.5 py-3 text-sm outline-none focus:border-[#0e7168]" data-testid="select-project-status">{statuses.map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}</select></label><div className="flex flex-col-reverse justify-end gap-3 border-t border-[#e5e2d8] pt-5 sm:flex-row"><Link href={isNew ? '/projects' : `/projects/${project?.id}`} className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold text-[#668084]" data-testid="link-form-cancel">Cancel</Link><Button type="submit" disabled={pending} data-testid="button-save-project">{pending ? 'Saving...' : <><Save className="h-4 w-4" /> Save project</>}</Button></div>{(create.isError || update.isError) && <p className="text-sm font-bold text-[#a33d35]" data-testid="text-form-error">Could not save this project. Try again.</p>}</form></div></Shell>;
}

function NewProject() { return <ProjectForm isNew />; }

function ProjectDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const client = useQueryClient();
  const project = useGetProject(id, { query: { enabled: !!id, queryKey: getGetProjectQueryKey(id) }, request: { credentials: 'include' } });
  const remove = useDeleteProject({ request: { credentials: 'include' } });
  const [editing, setEditing] = useState(false);
  if (project.isLoading) return <Shell><LoadingBlock lines={5} /></Shell>;
  if (project.isError || !project.data) return <Shell><ErrorState onRetry={() => project.refetch()} label="This project signal is unavailable." /></Shell>;
  if (editing) return <ProjectForm project={project.data} />;
  const p = project.data;
  const days = p.deadline ? Math.ceil((new Date(p.deadline).getTime() - Date.now()) / 86400000) : null;
  const deleteIt = () => { if (window.confirm(`Delete "${p.name}"? This cannot be undone.`)) remove.mutate({ projectId: p.id }, { onSuccess: () => { client.invalidateQueries({ queryKey: getListProjectsQueryKey() }); client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); setLocation('/projects'); } }); };
  return <Shell><div className="animate-rise"><Link href="/projects" className="inline-flex items-center gap-2 text-xs font-bold text-[#668084]" data-testid="link-detail-back"><ArrowLeft className="h-3.5 w-3.5" /> All projects</Link><div className="mt-7 flex flex-col justify-between gap-5 md:flex-row md:items-start"><div><div className="flex flex-wrap items-center gap-3"><Badge status={p.status} /><span className="mono text-[10px] uppercase tracking-[.12em] text-[#91a09c]">project / {p.id.slice(0, 8)}</span></div><h1 className="display mt-4 text-4xl font-bold tracking-[-.06em] md:text-5xl" data-testid="text-project-name">{p.name}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-[#668084]">{p.description || 'No project brief yet. Add context so the team can make better decisions.'}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setEditing(true)} data-testid="button-edit-project"><Pencil className="h-4 w-4" /> Edit</Button><Button variant="danger" onClick={deleteIt} disabled={remove.isPending} data-testid="button-delete-project"><Trash2 className="h-4 w-4" /> {remove.isPending ? 'Deleting' : 'Delete'}</Button></div></div><div className="mt-9 grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-[#deddd2] bg-[#faf8f1] p-5"><div className="flex items-center gap-2 text-[#668084]"><CalendarDays className="h-4 w-4" /><span className="text-xs font-bold">Deadline</span></div><p className="display mt-4 text-2xl font-bold">{p.deadline ? new Date(p.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}</p><p className={`mt-2 text-xs font-bold ${days !== null && days < 0 ? 'text-[#b45043]' : 'text-[#0e7168]'}`}>{days === null ? 'Choose a date to create a horizon' : days < 0 ? `${Math.abs(days)} days overdue` : `${days} days remaining`}</p></div><div className="rounded-2xl border border-[#deddd2] bg-[#faf8f1] p-5"><div className="flex items-center gap-2 text-[#668084]"><Compass className="h-4 w-4" /><span className="text-xs font-bold">Project status</span></div><p className="mt-4"><Badge status={p.status} /></p><p className="mt-3 text-xs text-[#789093]">Updated {new Date(p.updatedAt).toLocaleDateString()}</p></div><div className="rounded-2xl border border-[#deddd2] bg-[#faf8f1] p-5"><div className="flex items-center gap-2 text-[#668084]"><Activity className="h-4 w-4" /><span className="text-xs font-bold">Signal note</span></div><p className="mt-4 text-sm leading-6 text-[#557074]">{p.status === 'at_risk' ? 'This project has a visible pressure point. Make the next decision explicit.' : p.status === 'completed' ? 'The work is marked complete. Capture what you learned before the next build.' : 'No active risk signal has been marked. Keep the context current.'}</p></div></div><div className="mt-5 rounded-2xl border border-[#deddd2] bg-[#ece9dc] p-6"><p className="mono text-[10px] uppercase tracking-[.15em] text-[#789093]">project timeline</p><div className="mt-6 flex items-center gap-3"><div className="grid h-8 w-8 place-items-center rounded-full bg-[#0e7168] text-[#f8f3e8]"><Check className="h-4 w-4" /></div><div><p className="text-sm font-bold">Project created</p><p className="text-xs text-[#789093]">{new Date(p.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p></div><div className="h-px flex-1 bg-[#cfd3c8]" /><div className={`grid h-8 w-8 place-items-center rounded-full ${p.status === 'completed' ? 'bg-[#0e7168] text-[#f8f3e8]' : 'bg-[#d8ddd4] text-[#789093]'}`}>{p.status === 'completed' ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</div><div className="text-right"><p className="text-sm font-bold">{p.status === 'completed' ? 'Completed' : 'In progress'}</p><p className="text-xs text-[#789093]">{p.status === 'completed' ? 'Signal closed' : 'Keep moving'}</p></div></div></div></div></Shell>;
}

function Profile() {
  const client = useQueryClient();
  const profile = useGetCurrentProfile({ query: { queryKey: getGetCurrentProfileQueryKey() }, request: { credentials: 'include' } });
  const update = useUpdateCurrentProfile({ request: { credentials: 'include' } });
  const [fullName, setFullName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const currentName = fullName ?? profile.data?.fullName ?? '';
  const currentAvatar = avatarUrl ?? profile.data?.avatarUrl ?? '';
  const save = (e: FormEvent) => { e.preventDefault(); update.mutate({ data: { fullName: currentName.trim() || null, avatarUrl: currentAvatar.trim() || null } }, { onSuccess: (next) => { client.setQueryData(getGetCurrentProfileQueryKey(), next); setFullName(next.fullName ?? ''); setAvatarUrl(next.avatarUrl ?? ''); } }); };
  if (profile.isLoading) return <Shell><LoadingBlock lines={4} /></Shell>;
  if (profile.isError || !profile.data) return <Shell><ErrorState onRetry={() => profile.refetch()} label="We could not load your profile." /></Shell>;
  return <Shell><div className="mx-auto max-w-2xl animate-rise"><p className="mono text-[10px] font-bold uppercase tracking-[.17em] text-[#0e7168]">workspace / profile</p><h1 className="display mt-3 text-4xl font-bold tracking-[-.06em]">Your profile</h1><p className="mt-3 text-sm text-[#668084]">The name your team sees in the room.</p><form onSubmit={save} className="mt-8 rounded-2xl border border-[#deddd2] bg-[#faf8f1] p-6 shadow-[var(--shadow-sm)] md:p-8"><div className="flex items-center gap-4 border-b border-[#e5e2d8] pb-7"><div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-[#ed9b76] text-2xl font-extrabold text-[#173b42]">{currentAvatar ? <img src={currentAvatar} alt="" className="h-full w-full object-cover" /> : currentName.slice(0, 1).toUpperCase() || <UserRound className="h-7 w-7" />}</div><div><p className="font-bold" data-testid="text-profile-email">{profile.data.email}</p><p className="mt-1 text-xs text-[#789093]">Member since {new Date(profile.data.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p></div></div><div className="mt-7 space-y-5"><label className="block text-sm font-bold">Full name<input maxLength={120} value={currentName} onChange={(e) => setFullName(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d8d6c9] bg-[#f4f0e5] px-3.5 py-3 text-sm outline-none focus:border-[#0e7168]" placeholder="Your name" data-testid="input-profile-name" /></label><label className="block text-sm font-bold">Avatar URL<span className="ml-2 text-xs font-normal text-[#8aa09d]">optional</span><input type="url" value={currentAvatar} onChange={(e) => setAvatarUrl(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d8d6c9] bg-[#f4f0e5] px-3.5 py-3 text-sm outline-none focus:border-[#0e7168]" placeholder="https://..." data-testid="input-profile-avatar" /></label></div><div className="mt-7 flex flex-col items-start justify-between gap-3 border-t border-[#e5e2d8] pt-5 sm:flex-row sm:items-center"><p className="text-xs text-[#789093]">{update.isSuccess ? 'Profile saved.' : 'Changes apply across your workspace.'}</p><Button type="submit" disabled={update.isPending} data-testid="button-save-profile"><Save className="h-4 w-4" /> {update.isPending ? 'Saving...' : 'Save profile'}</Button></div>{update.isError && <p className="mt-4 text-sm font-bold text-[#a33d35]" data-testid="text-profile-error">Could not save your profile. Try again.</p>}</form></div></Shell>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={HomeRedirect} /><Route path="/sign-in/*?" component={ClerkSignInPage} /><Route path="/sign-up/*?" component={ClerkSignUpPage} /><Route path="/dashboard"><Protected><Dashboard /></Protected></Route><Route path="/projects/new"><Protected><NewProject /></Protected></Route><Route path="/projects/:id"><Protected><ProjectDetail /></Protected></Route><Route path="/projects"><Protected><Projects /></Protected></Route><Route path="/profile"><Protected><Profile /></Protected></Route><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <Home />;
  return isSignedIn ? <Redirect to="/dashboard" /> : <Home />;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        client.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkQueryClientCacheInvalidator />
      <Router />
    </QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  if (!clerkPubKey) {
    throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  }
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}

export default App;