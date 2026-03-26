import { useEffect, useMemo, memo, useRef } from 'react';
import { useWebReceiver } from './hooks/useWebReceiver';
import type { DiscoveredHost } from '@resound/shared';
import { Radio, Headphones, RefreshCw, ChevronDown, Activity, Wifi, Volume2, Globe, Plug } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const receiver = useWebReceiver();
  const isListening = receiver.status === 'receiving' || receiver.status === 'connecting';
  const appSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hostParam = params.get('host');

    if (hostParam && !isListening) {
      const [ip, portStr] = hostParam.split(':');
      const port = portStr ? parseInt(portStr) : 42069;
      if (ip) {
        receiver.probeHost(ip, port);
        // Clean up URL
        // window.history.replaceState({}, '', window.location.pathname);
      }
    } else if (!isListening) {
      receiver.discoverHosts();
    }
  }, [isListening]);

  return (
    <div className=" bg-[#0A0A0B] text-white flex flex-col items-center font-sans selection:bg-accent/30 relative w-full overflow-x-hidden bg-mesh bg-grain">
      <CosmicBackground />

      {/* App Section */}
      <section
        ref={appSectionRef}
        className="relative z-10 flex flex-col items-center w-full min-h-screen px-6 pt-20 pb-40 -mt-28"
      >
        <div className="w-full max-w-xl">
          <div className="my-12 text-center">
            <h2 className="mb-2 text-3xl font-bold tracking-tight text-white">Connect to Host</h2>
            <p className="text-zinc-400">Join a local broadcast from any device</p>
          </div>

          {/* Main Interface */}
          <div className="w-full bg-[#141415]/60 backdrop-blur-2xl border border-white/5 rounded-[40px] shadow-2xl overflow-hidden group hover:border-white/10 transition-colors">
            <div className="p-8 md:p-10">
              <ListenView receiver={receiver} />
            </div>

            {/* Status Footer */}
            <div className="flex items-center justify-between px-8 py-4 border-t bg-white/5 border-white/5">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  receiver.status === 'receiving' ? "bg-accent animate-pulse" :
                    receiver.status === 'disconnected' ? "bg-red-500" : "bg-zinc-600"
                )} />
                <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-500">
                  {receiver.status === 'receiving' ? "Streaming Live" :
                    receiver.status === 'disconnected' ? "Host Disconnected" :
                      receiver.status === 'discovering' ? "Searching..." : "Ready"}
                </span>
              </div>
              <div className="flex gap-4">
                <Globe size={14} className="text-zinc-600" />
                <Wifi size={14} className="text-zinc-600" />
                <Volume2 size={14} className="text-zinc-600" />
              </div>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 gap-6 mt-12 md:grid-cols-3">
            <div className="p-6 border rounded-3xl bg-white/5 border-white/5">
              <div className="flex items-center justify-center w-10 h-10 mb-4 rounded-2xl bg-accent/10 text-accent">
                <Activity size={20} />
              </div>
              <h3 className="mb-1 text-sm font-bold">Low Latency</h3>
              <p className="text-xs text-zinc-500">Optimized for real-time local audio streaming.</p>
            </div>
            <div className="p-6 border rounded-3xl bg-white/5 border-white/5">
              <div className="flex items-center justify-center w-10 h-10 mb-4 text-blue-400 rounded-2xl bg-blue-500/10">
                <Wifi size={20} />
              </div>
              <h3 className="mb-1 text-sm font-bold">Auto Discovery</h3>
              <p className="text-xs text-zinc-500">Automatically finds broadcasters on your network.</p>
            </div>
            <div className="p-6 border rounded-3xl bg-white/5 border-white/5">
              <div className="flex items-center justify-center w-10 h-10 mb-4 text-purple-400 rounded-2xl bg-purple-500/10">
                <Plug size={20} />
              </div>
              <h3 className="mb-1 text-sm font-bold">Plug and Play</h3>
              <p className="text-xs text-zinc-500">No installation required. Just open and start listening.</p>
            </div>
          </div>

          {/* Logs (Hidden by default, toggleable or just smaller) */}
          {receiver.logs.length > 0 && (
            <details className="mt-12 group">
              <summary className="flex items-center justify-center gap-2 cursor-pointer text-zinc-500 hover:text-zinc-400 transition-colors text-[10px] font-bold tracking-widest uppercase py-2">
                <span>View Debug Logs</span>
                <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-4 bg-black/40 backdrop-blur-md border border-white/5 rounded-2xl p-4 max-h-40 overflow-y-auto font-mono text-[10px] text-zinc-500">
                {receiver.logs.map((log, i) => (
                  <div key={i} className="mb-1">
                    <span className="mr-2 text-zinc-600">[{log.time}]</span>
                    <span>{log.message}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </section>
    </div>
  );
}

interface ListenViewProps {
  receiver: ReturnType<typeof useWebReceiver>;
}

const ListenView = memo(({ receiver }: ListenViewProps) => {
  const isReceiving = receiver.status === 'receiving';
  const isDiscovering = receiver.status === 'discovering';

  const activeHostName = useMemo(() => {
    if (!receiver.selectedHost) return 'Broadcaster';
    return receiver.selectedHost.name;
  }, [receiver.selectedHost]);

  const activeTheme = useMemo(() => getThemeForString(activeHostName), [activeHostName]);

  const handleConnect = (hostNode: DiscoveredHost) => {
    receiver.connectAndPlay(hostNode);
  };

  return (
    <AnimatePresence mode="wait">
      {!isReceiving ? (
        <motion.div
          key="discovery"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          className="flex flex-col w-full"
        >
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500">Available Broadcasts</h3>
            <button
              onClick={() => receiver.discoverHosts()}
              disabled={isDiscovering}
              className="p-2 transition-all rounded-full bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isDiscovering ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="space-y-3 mb-8 min-h-[160px]">
            {receiver.hosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 border border-dashed border-white/5 rounded-[24px] bg-white/[0.02]">
                <div className="flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-white/5 text-zinc-600">
                  <Radio size={20} />
                </div>
                <span className="text-sm text-zinc-500">No broadcasts found</span>
                <span className="mt-1 text-[10px] text-zinc-600 uppercase tracking-wider">Ensure Host is on the same network</span>
              </div>
            ) : (
              receiver.hosts.map((hostNode: DiscoveredHost, i: number) => {
                const hostTheme = getThemeForString(hostNode.name);
                return (
                  <button
                    key={i}
                    onClick={() => handleConnect(hostNode)}
                    className="flex items-center justify-between w-full p-5 text-left transition-all border rounded-[28px] glass hover:bg-white/5 hover:border-accent/30 group focus:outline-none focus:ring-2 focus:ring-accent/20"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl ${hostTheme.iconBg} ${hostTheme.text} flex items-center justify-center shadow-inner`}>
                        <Headphones size={22} />
                      </div>
                      <div>
                        <div className="text-base font-bold text-white transition-colors group-hover:text-accent">{hostNode.name}</div>
                        <div className="text-[11px] font-mono text-zinc-500 mt-0.5">{hostNode.ip}</div>
                      </div>
                    </div>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-white/5 text-zinc-500 group-hover:bg-accent group-hover:text-black transition-all`}>
                      <ChevronDown size={20} className="-rotate-90" />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="pt-8 border-t border-white/5">
            <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500 mb-6 text-center">Manual Connection</h3>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Enter IP (e.g. 192.168.1.10)"
                className="flex-1 px-5 py-4 text-sm text-white transition-all border glass rounded-2xl focus:outline-none focus:border-accent/50 focus:bg-white/10"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const target = e.currentTarget;
                    const [ip, portStr] = target.value.split(':');
                    const port = portStr ? parseInt(portStr) : 42069;
                    if (ip) receiver.probeHost(ip, port);
                  }
                }}
                id="manualHostIp"
              />
              <button
                onClick={() => {
                  const input = document.getElementById('manualHostIp') as HTMLInputElement;
                  const [ip, portStr] = input.value.split(':');
                  const port = portStr ? parseInt(portStr) : 42069;
                  if (ip) receiver.probeHost(ip, port);
                }}
                className="px-6 py-4 text-sm font-bold text-black transition-all bg-white shadow-lg rounded-2xl hover:bg-accent hover:scale-105 active:scale-95"
              >
                Connect
              </button>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="playing"
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="flex flex-col items-center justify-center w-full"
        >
          <div className="relative w-48 h-48 mb-12">
            <div className={`absolute inset-0 ${activeTheme.glowLight} rounded-full blur-3xl animate-pulse`} />

            {/* Audio Visualization Circles */}
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className={`absolute inset-0 rounded-full border border-white/10`}
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className={`absolute inset-0 rounded-full border border-white/5`}
            />

            <div className={`relative w-full h-full rounded-full bg-black/80 flex items-center justify-center ${activeTheme.text} border border-white/10 shadow-2xl overflow-hidden backdrop-blur-sm`}>
              <div className="flex items-end h-12 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <motion.div
                    key={i}
                    className={`w-2 ${activeTheme.bg} rounded-full shadow-[0_0_10px_rgba(var(--tw-shadow-color),0.5)]`}
                    animate={{ height: ['20%', '100%', '20%'] }}
                    transition={{ duration: 0.6 + (i * 0.1), repeat: Infinity, ease: 'easeInOut' }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mb-12 text-center">
            <div className="mb-2 text-[10px] font-bold tracking-[0.3em] uppercase text-zinc-500">Receiving From</div>
            <div className="text-4xl font-bold tracking-tight text-white">{activeHostName}</div>
            <div className="mt-2 font-mono text-sm text-zinc-500">{receiver.selectedHost?.ip}</div>
          </div>

          <button
            onClick={receiver.stopReceiver}
            className={`group w-full py-5 rounded-[28px] bg-white text-black hover:bg-red-500 hover:text-white transition-all text-sm font-black flex items-center justify-center gap-2 shadow-xl hover:shadow-red-500/20 active:scale-[0.98]`}
          >
            <span>Disconnect</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// Icons
const SignalIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path d="M12 20a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" />
    <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" opacity="0.5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);

// Animated Background
const CosmicBackground = memo(() => (
  <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
    <div className="cosmic-bg" />
    <div className="starfield" />
    <div className="absolute top-0 left-1/4 w-96 h-96 bg-aurora-purple/20 rounded-full blur-[120px] animate-pulse-slow" />
    <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-aurora-cyan/15 rounded-full blur-[100px] animate-pulse-slow animation-delay-2000" />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-aurora-pink/10 rounded-full blur-[150px] animate-breathe" />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-white/[0.02] rounded-full animate-spin-slow" />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-white/[0.03] rounded-full animate-spin-slow animation-delay-2000" style={{ animationDirection: 'reverse' }} />
  </div>
));

const HeroSection = ({ onScrollToApp }: { onScrollToApp: () => void }) => {
  return (
    <section className="relative flex flex-col items-center justify-center min-h-screen px-6 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute w-2 h-2 rounded-full top-1/4 left-1/4 bg-aurora-cyan/50 animate-pulse" />
        <div className="absolute w-1 h-1 rounded-full top-1/3 right-1/3 bg-aurora-purple/50 animate-pulse animation-delay-1000" />
        <div className="absolute bottom-1/3 left-1/3 w-1.5 h-1.5 rounded-full bg-aurora-pink/50 animate-pulse animation-delay-2000" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto text-center">
        <h1 className="mb-6 text-6xl font-bold tracking-tight md:text-8xl lg:text-9xl font-display animate-fade-in-up">
          <span className="text-white">Resound</span>
        </h1>

        <p className="max-w-2xl mx-auto mb-12 text-xl leading-relaxed md:text-2xl text-stellar-silver animate-fade-in-up animation-delay-200">
          Stream audio across your local network with
          <span className="text-stellar-white"> studio-grade fidelity</span>
        </p>

        <div className="flex flex-col items-center justify-center gap-4 mb-16 sm:flex-row animate-fade-in-up animation-delay-300">
          <button
            onClick={onScrollToApp}
            className="flex items-center gap-3 px-8 py-4 text-lg font-semibold text-white rounded-full aurora-btn"
          >
            <SignalIcon className="relative z-10 w-5 h-5" />
            <span className="relative z-10">Connect to Host</span>
          </button>
          <a
            href="#download"
            className="flex items-center gap-3 px-8 py-4 text-lg font-semibold transition-all border rounded-full glass-prism text-stellar-white hover:bg-white/10 border-white/20"
          >
            <DownloadIcon className="w-5 h-5" />
            Get Desktop App
          </a>
        </div>

        {/* <div id="download" className="max-w-3xl p-8 mx-auto glass-prism rounded-3xl animate-fade-in-up animation-delay-400">
          <p className="mb-6 text-sm tracking-widest uppercase text-stellar-dim">Download for your platform</p>
          <div className="grid grid-cols-3 gap-4">
            <a href="#" className="flex items-center gap-3 px-6 py-3 transition-all border group rounded-2xl bg-white/5 hover:bg-white/10 border-white/5 hover:border-aurora-cyan/30">
              <AppleIcon className="w-8 h-8 transition-colors text-stellar-silver group-hover:text-aurora-cyan" />
              <span className="text-sm font-medium text-stellar-silver group-hover:text-stellar-white">macOS</span>
            </a>
            <a href="#" className="flex items-center gap-3 px-6 py-3 transition-all border group rounded-2xl bg-white/5 hover:bg-white/10 border-white/5 hover:border-aurora-purple/30">
              <WindowsIcon className="w-8 h-8 transition-colors text-stellar-silver group-hover:text-aurora-purple" />
              <span className="text-sm font-medium text-stellar-silver group-hover:text-stellar-white">Windows</span>
            </a>
            <a href="#" className="flex items-center gap-3 px-6 transition-all border group rounded-2xl bg-white/5 hover:bg-white/10 border-white/5 hover:border-aurora-pink/30">
              <LinuxIcon className="w-8 h-8 transition-colors text-stellar-silver group-hover:text-aurora-pink" />
              <span className="text-sm font-medium text-stellar-silver group-hover:text-stellar-white">Linux</span>
            </a>
          </div>
        </div> */}
      </div>
    </section>
  );
};