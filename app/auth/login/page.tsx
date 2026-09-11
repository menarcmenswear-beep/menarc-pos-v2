'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Lock, Mail, Loader2 } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const configError = params.get('config_error') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/menarc-logo.jpg" alt="MENARC" className="h-20 w-auto mx-auto rounded-lg mb-3" />
          <p className="text-xs italic text-neutral-400">Never go unnoticed</p>
          <p className="text-xs text-neutral-500 mt-2">Staff Login</p>
        </div>

        {configError && (
          <div className="mb-4 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 px-3 py-2 rounded">
            Server isn&apos;t configured yet (missing Supabase environment variables). Contact whoever manages deployment.
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-4 shadow-lg">
          <div>
            <label className="text-xs text-neutral-400 block mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
              <input
                type="email"
                required
                className="w-full bg-neutral-950 border border-neutral-700 rounded pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-white"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@menarc.com"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-400 block mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
              <input
                type="password"
                required
                className="w-full bg-neutral-950 border border-neutral-700 rounded pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-white"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-white text-black font-bold py-2.5 rounded hover:bg-neutral-200 transition text-sm disabled:opacity-60"
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Signing in...</> : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-neutral-600 mt-6">
          Staff accounts are created in the Supabase dashboard, not here.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
