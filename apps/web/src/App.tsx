import { useEffect, useMemo } from 'react';
import { useAudioReceiver } from '@resound/shared';
import type { DiscoveredHost } from '@resound/shared';
import { Radio, Headphones, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const COLOR_THEMES = [
  { name: 'Red', bg: 'bg-red-500', text: 'text-red-500', border: 'border-red-500', glow: 'bg-red-500/40', hoverBg: 'hover:bg-red-500/10', hoverText: 'hover:text-red-400', borderHover: 'hover:border-red-500/50', borderPing1: 'border-red-500/30', borderPing2: 'border-red-500/50', iconBg: 'bg-red-500/10', glowLight: 'bg-red-500/30' },
  { name: 'Blue', bg: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-500', glow: 'bg-blue-500/40', hoverBg: 'hover:bg-blue-500/10', hoverText: 'hover:text-blue-400', borderHover: 'hover:border-blue-500/50', borderPing1: 'border-blue-500/30', borderPing2: 'border-blue-500/50', iconBg: 'bg-blue-500/10', glowLight: 'bg-blue-500/30' },
  { name: 'Emerald', bg: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-500', glow: 'bg-emerald-500/40', hoverBg: 'hover:bg-emerald-500/10', hoverText: 'hover:text-emerald-400', borderHover: 'hover:border-emerald-500/50', borderPing1: 'border-emerald-500/30', borderPing2: 'border-emerald-500/50', iconBg: 'bg-emerald-500/10', glowLight: 'bg-emerald-500/30' },
  { name: 'Violet', bg: 'bg-violet-500', text: 'text-violet-500', border: 'border-violet-500', glow: 'bg-violet-500/40', hoverBg: 'hover:bg-violet-500/10', hoverText: 'hover:text-violet-400', borderHover: 'hover:border-violet-500/50', borderPing1: 'border-violet-500/30', borderPing2: 'border-violet-500/50', iconBg: 'bg-violet-500/10', glowLight: 'bg-violet-500/30' },
  { name: 'Amber', bg: 'bg-amber-500', text: 'text-amber-500', border: 'border-amber-500', glow: 'bg-amber-500/40', hoverBg: 'hover:bg-amber-500/10', hoverText: 'hover:text-amber-400', borderHover: 'hover:border-amber-500/50', borderPing1: 'border-amber-500/30', borderPing2: 'border-amber-500/50', iconBg: 'bg-amber-500/10', glowLight: 'bg-amber-500/30' },
  { name: 'Pink', bg: 'bg-pink-500', text: 'text-pink-500', border: 'border-pink-500', glow: 'bg-pink-500/40', hoverBg: 'hover:bg-pink-500/10', hoverText: 'hover:text-pink-400', borderHover: 'hover:border-pink-500/50', borderPing1: 'border-pink-500/30', borderPing2: 'border-pink-500/50', iconBg: 'bg-pink-500/10', glowLight: 'bg-pink-500/30' },
  { name: 'Cyan', bg: 'bg-cyan-500', text: 'text-cyan-500', border: 'border-cyan-500', glow: 'bg-cyan-500/40', hoverBg: 'hover:bg-cyan-500/10', hoverText: 'hover:text-cyan-400', borderHover: 'hover:border-cyan-500/50', borderPing1: 'border-cyan-500/30', borderPing2: 'border-cyan-500/50', iconBg: 'bg-cyan-500/10', glowLight: 'bg-cyan-500/30' },
  { name: 'Rose', bg: 'bg-rose-500', text: 'text-rose-500', border: 'border-rose-500', glow: 'bg-rose-500/40', hoverBg: 'hover:bg-rose-500/10', hoverText: 'hover:text-rose-400', borderHover: 'hover:border-rose-500/50', borderPing1: 'border-rose-500/30', borderPing2: 'border-rose-500/50', iconBg: 'bg-rose-500/10', glowLight: 'bg-rose-500/30' },
];

function getThemeForString(seed: string) {
  if (!seed) return COLOR_THEMES[0];
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash) + seed.charCodeAt(i);
  }
  hash = Math.abs(hash);
  return COLOR_THEMES[hash % COLOR_THEMES.length];
}

export default function App() {
  const receiver = useAudioReceiver();
  const isListening = receiver.status === 'receiving' || receiver.status === 'connecting';

  useEffect(() => {
    if (!isListening) {
      receiver.discoverHosts();
    }
  }, [isListening, receiver]);

  const listenGlowClass = receiver.status === 'receiving' && receiver.selectedHost
    ? getThemeForString(receiver.selectedHost.name).bg
    : 'bg-zinc-800';

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white flex flex-col items-center p-6 font-sans selection:bg-white/20 relative w-full overflow-hidden">
      {/* Background glow effects */}
      <div className="fixed top-0 left-0 w-full h-full z-0 pointer-events-none">
        <div className={cn(
          "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[160px] opacity-20 transition-colors duration-1000",
          listenGlowClass
        )} />
      </div>

      <main className="relative z-10 flex flex-col items-center w-full max-w-md mt-10">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-semibold tracking-tight">Resound Web</h1>
          <p className="mt-1 text-sm text-zinc-400">Join a local broadcast from any device</p>
        </div>

        {/* Active View Container */}
        <div className="w-full bg-[#141415]/80 backdrop-blur-xl border border-white/10 rounded-[32px] p-8 shadow-2xl relative">
          <ListenView receiver={receiver} />
        </div>
      </main>
    </div>
  );
}

function ListenView({ receiver }: { receiver: any }) {
  const isReceiving = receiver.status === 'receiving';
  const isDiscovering = receiver.status === 'discovering';

  // Memoize active host info
  const activeHostName = useMemo(() => {
    if (!receiver.selectedHost) return 'Broadcaster';
    return receiver.selectedHost.name;
  }, [receiver.selectedHost]);

  const activeTheme = useMemo(() => getThemeForString(activeHostName), [activeHostName]);

  const handleConnect = (hostNode: DiscoveredHost) => {
    receiver.connectAndPlay(hostNode, 1.0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col items-center w-full min-h-[300px]"
    >
      <div className="relative w-full mb-8 text-center">
        <h2 className="mb-2 text-xl font-medium text-white">Listen</h2>
        <p className="text-sm text-zinc-400">Discover broadcasts.</p>

        {!isReceiving && (
          <button
            onClick={() => receiver.discoverHosts()}
            disabled={isDiscovering}
            className="absolute top-0 right-0 p-2 transition-colors text-zinc-400 hover:text-white disabled:opacity-50 focus:outline-none"
          >
            <RefreshCw size={18} className={isDiscovering ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {!isReceiving ? (
        <div className="flex flex-col flex-1 w-full">
          <label className="block px-2 mb-4 text-xs font-semibold tracking-wider uppercase text-zinc-500">Available Broadcasts</label>

          <div className="w-full space-y-3">
            {receiver.hosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 border border-dashed border-white/10 rounded-2xl bg-white/5">
                <Radio size={24} className="mb-3 text-zinc-600" />
                <span className="text-sm text-zinc-400">No broadcasts found</span>
                <span className="mt-1 text-xs text-zinc-600">Make sure a host is on the same network.</span>
              </div>
            ) : (
              receiver.hosts.map((hostNode: DiscoveredHost, i: number) => {
                const hostTheme = getThemeForString(hostNode.name);
                return (
                  <button
                    key={i}
                    onClick={() => handleConnect(hostNode)}
                    className="flex items-center justify-between w-full p-4 text-left transition-all border rounded-2xl bg-zinc-900/50 border-white/5 hover:bg-white/5 hover:border-white/20 group focus:outline-none focus:ring-2 focus:ring-white/20"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full ${hostTheme.iconBg} ${hostTheme.text} flex items-center justify-center`}>
                        <Headphones size={20} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{hostNode.name}</div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">{hostNode.ip}</div>
                      </div>
                    </div>
                    <div className={`text-[11px] font-bold uppercase tracking-wider ${hostTheme.text} opacity-0 group-hover:opacity-100 transition-opacity pr-2`}>
                      Connect
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 w-full py-4">
          <div className="relative w-32 h-32 mb-8">
            <div className={`absolute inset-0 ${activeTheme.glowLight} rounded-full blur-xl animate-pulse`} />
            <div className={`absolute inset-4 rounded-full border ${activeTheme.borderPing1} animate-[ping_3s_ease-out_infinite]`} />
            <div className={`absolute inset-8 rounded-full border ${activeTheme.borderPing2} animate-[ping_3s_ease-out_infinite_500ms]`} />
            <div className={`relative w-full h-full rounded-full bg-zinc-900 flex items-center justify-center ${activeTheme.text} border border-white/5 shadow-xl overflow-hidden`}>
              <div className="flex items-end h-8 gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <motion.div
                    key={i}
                    className={`w-1.5 ${activeTheme.bg} rounded-full`}
                    animate={{ height: ['20%', '100%', '20%'] }}
                    transition={{ duration: 0.8 + (i * 0.1), repeat: Infinity, ease: 'easeInOut' }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mb-8 text-center">
            <div className="mb-1 text-xs font-semibold tracking-widest uppercase text-zinc-400">Listening To</div>
            <div className="text-xl font-medium text-white">{activeHostName}</div>
          </div>

          <button
            onClick={receiver.stopReceiver}
            className={`w-full py-4 rounded-2xl bg-zinc-900 border border-white/10 ${activeTheme.borderHover} ${activeTheme.hoverBg} ${activeTheme.hoverText} transition-all text-sm font-medium text-white flex justify-center focus:outline-none`}
          >
            Disconnect
          </button>
        </div>
      )}
    </motion.div>
  );
}
