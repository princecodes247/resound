import { useEffect, useMemo, memo, useRef } from 'react';
import { useWebReceiver } from './hooks/useWebReceiver';
import type { DiscoveredHost } from '@resound/shared';
import { Radio, Headphones, RefreshCw, ChevronDown, Activity, Wifi, Volume2, Globe } from 'lucide-react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
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

  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.2], [1, 0.9]);

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

  const listenGlowClass = receiver.status === 'receiving' && receiver.selectedHost
    ? getThemeForString(receiver.selectedHost.name).bg
    : 'bg-accent/20';

  const scrollToApp = () => {
    appSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-[200vh] bg-[#0A0A0B] text-white flex flex-col items-center font-sans selection:bg-accent/30 relative w-full overflow-x-hidden bg-mesh bg-grain">
      {/* Background glow effects */}
      <div className="fixed top-0 left-0 z-0 w-full h-full overflow-hidden pointer-events-none">
        <div className={cn(
          "absolute top-[20%] left-[-10%] w-[1000px] h-[1000px] rounded-full blur-[180px] opacity-10 transition-colors duration-1000 bg-accent/20",
          listenGlowClass
        )} />
        <div className="absolute top-[-10%] right-[-10%] w-[800px] h-[800px] bg-blue-500/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-20%] left-[20%] w-[1200px] h-[1200px] bg-purple-500/10 rounded-full blur-[160px]" />
      </div>

      {/* Hero Section */}
      <motion.section
        style={{ opacity, scale }}
        className="relative z-10 flex flex-col items-center justify-center w-full h-screen px-6 overflow-hidden"
      >
        {/* Animated Background Elements */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute border rounded-full top-1/2 left-1/2 border-white/5"
              style={{
                width: 400 + i * 200,
                height: 400 + i * 200,
                x: "-50%",
                y: "-50%",
              }}
              animate={{
                rotate: [0, 360],
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: 20 + i * 10,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 flex flex-col items-center max-w-5xl text-center"
        >
          {/* Resonance Core Visualization */}
          <div className="relative w-32 h-32 mb-12">
            <motion.div
              animate={{
                scale: [1, 1.4, 1],
                opacity: [0.3, 0.6, 0.3],
                rotate: [0, 180, 360]
              }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-full bg-gradient-to-tr from-accent to-blue-500 blur-2xl"
            />
            <div className="absolute flex items-center justify-center border rounded-full inset-2 bg-black/80 backdrop-blur-xl border-white/20">
              <Activity size={40} className="text-accent text-glow" />
            </div>

            {/* Orbital Rings */}
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute inset-[-20px] rounded-full border border-white/10"
                style={{ rotate: i * 45 }}
                animate={{ rotate: [i * 45, i * 45 + 360] }}
                transition={{ duration: 15 + i * 5, repeat: Infinity, ease: "linear" }}
              />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 border glass rounded-full text-accent shadow-[0_0_20px_rgba(var(--accent),0.1)]">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
              <span className="text-[10px] font-black tracking-[0.4em] uppercase">Phase 1: Zero Latency</span>
            </div>

            <h1 className="mb-8 font-black leading-none tracking-tighter text-7xl md:text-9xl">
              <span className="inline-block hover:scale-[1.02] transition-transform cursor-default">Resound</span>
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-blue-400 to-purple-500 animate-gradient-x bg-[length:200%_200%] text-glow">
                Web Native
              </span>
            </h1>

            <p className="max-w-2xl mx-auto text-lg font-light leading-relaxed tracking-wide mb-14 md:text-2xl text-zinc-400">
              Experience the future of personal audio.
              <span className="text-white"> Studio-grade fidelity</span> beamed from your desktop to any device, instantly.
            </p>

            <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
              <button
                onClick={scrollToApp}
                className="group relative px-10 py-5 text-sm font-black text-black transition-all rounded-full bg-accent overflow-hidden shadow-[0_0_40px_rgba(var(--accent),0.4)]"
              >
                <div className="absolute inset-0 transition-transform duration-300 translate-y-full bg-white/20 group-hover:translate-y-0" />
                <span className="relative z-10 flex items-center gap-2">
                  START LISTENING <ChevronDown size={16} className="-rotate-90" />
                </span>
              </button>
              <a
                href="#"
                className="px-10 py-5 text-sm font-bold text-white transition-all rounded-full glass hover:bg-white/10 hover:border-white/30"
              >
                GET DESKTOP APP
              </a>
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          animate={{ y: [0, 15, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute z-10 bottom-12"
        >
          <button onClick={scrollToApp} className="flex flex-col items-center gap-2 transition-colors group text-zinc-500 hover:text-white">
            <span className="text-[10px] font-black tracking-[0.3em] uppercase opacity-50 group-hover:opacity-100 transition-opacity">SCROLL TO CONNECT</span>
            <ChevronDown size={24} className="stroke-[1.5px]" />
          </button>
        </motion.div>
      </motion.section>

      {/* App Section */}
      <section
        ref={appSectionRef}
        className="relative z-10 flex flex-col items-center w-full min-h-screen px-6 pt-20 pb-40"
      >
        <div className="w-full max-w-xl">
          <div className="mb-12 text-center">
            <h2 className="mb-2 text-3xl font-bold tracking-tight text-white">Connect to Host</h2>
            <p className="text-zinc-400">Join a local broadcast from any device</p>
          </div>

          {/* Main Interface */}
          <div className="w-full bg-[#141415]/60 backdrop-blur-2xl border border-white/5 rounded-[40px] p-1 shadow-2xl overflow-hidden group hover:border-white/10 transition-colors">
            <div className="p-8 md:p-10">
              <ListenView receiver={receiver} />
            </div>

            {/* Status Footer */}
            <div className="flex items-center justify-between px-8 py-4 border-t bg-white/5 border-white/5">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  receiver.status === 'receiving' ? "bg-accent animate-pulse" : "bg-zinc-600"
                )} />
                <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-500">
                  {receiver.status === 'receiving' ? "Streaming Live" : receiver.status === 'discovering' ? "Searching..." : "Ready"}
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
                <Globe size={20} />
              </div>
              <h3 className="mb-1 text-sm font-bold">Web Native</h3>
              <p className="text-xs text-zinc-500">No installation required. Works in any modern browser.</p>
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

      {/* Footer */}
      <footer className="relative z-10 flex flex-col items-center w-full py-12 bg-black border-t border-white/5">
        <p className="text-sm text-zinc-500">© 2024 Resound. Built for the audiophiles.</p>
      </footer>
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
                Probe
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

