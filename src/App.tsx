import { useState, useEffect, useMemo } from 'react';
import { useAudioHost } from './hooks/useAudioHost';
import { useAudioReceiver } from './hooks/useAudioReceiver';
import { Radio, Headphones, RefreshCw, Power } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// --- Main App ---
export default function App() {
    const host = useAudioHost();
    const receiver = useAudioReceiver();

    // Mode: 'broadcast' or 'listen'
    const [mode, setMode] = useState<'broadcast' | 'listen'>('broadcast');

    // Broadcast Defaults
    const [selectedDevice, setSelectedDevice] = useState('');

    // Prevent mode switching if mid-operation
    const isBroadcasting = host.status === 'broadcasting' || host.status === 'starting';
    const isListening = receiver.status === 'receiving' || receiver.status === 'connecting';
    const isBusy = isBroadcasting || isListening;

    // Auto-scan on listen mode entry
    useEffect(() => {
        if (mode === 'listen' && !isListening) {
            receiver.discoverHosts();
        }
    }, [mode]);

    // Handle mode switch intent
    const handleModeSwitch = (newMode: 'broadcast' | 'listen') => {
        if (isBusy) return; // Disallow switching while active
        setMode(newMode);
    };

    return (
        <div className="min-h-screen bg-[#0A0A0B] text-white flex flex-col items-center justify-center p-6 font-sans selection:bg-white/20">

            {/* Background glow effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className={cn(
                    "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] opacity-20 transition-colors duration-1000",
                    isBroadcasting ? "bg-red-500" : isListening ? "bg-blue-500" : "bg-zinc-800"
                )} />
            </div>

            <main className="w-full max-w-md z-10 relative flex flex-col items-center">

                {/* Title */}
                <div className="mb-10 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">Resound</h1>
                    <p className="text-sm text-zinc-400 mt-1">Local Network Audio</p>
                </div>

                {/* Mode Toggle (Segmented Control) */}
                {!isBusy && (
                    <div className="flex bg-zinc-900/80 p-1.5 rounded-full mb-8 relative border border-white/5 backdrop-blur-md">
                        <div
                            className="absolute bg-white rounded-full h-[calc(100%-12px)] top-[6px] transition-all duration-300 ease-out shadow-sm"
                            style={{
                                width: 'calc(50% - 6px)',
                                left: mode === 'broadcast' ? '6px' : 'calc(50%)',
                            }}
                        />
                        <button
                            onClick={() => handleModeSwitch('broadcast')}
                            className={cn(
                                "w-36 py-2.5 text-sm font-medium rounded-full relative z-10 transition-colors duration-200 flex items-center justify-center gap-2",
                                mode === 'broadcast' ? "text-black" : "text-zinc-400 hover:text-white"
                            )}
                        >
                            <Radio size={16} /> Broadcast
                        </button>
                        <button
                            onClick={() => handleModeSwitch('listen')}
                            className={cn(
                                "w-36 py-2.5 text-sm font-medium rounded-full relative z-10 transition-colors duration-200 flex items-center justify-center gap-2",
                                mode === 'listen' ? "text-black" : "text-zinc-400 hover:text-white"
                            )}
                        >
                            <Headphones size={16} /> Listen
                        </button>
                    </div>
                )}

                {/* Active View Container */}
                <div className="w-full bg-[#141415]/80 backdrop-blur-xl border border-white/10 rounded-[32px] p-8 shadow-2xl">
                    <AnimatePresence mode="wait">
                        {mode === 'broadcast' ? (
                            <BroadcastView
                                key="broadcast"
                                host={host}
                                selectedDevice={selectedDevice}
                                setSelectedDevice={setSelectedDevice}
                            />
                        ) : (
                            <ListenView
                                key="listen"
                                receiver={receiver}
                            />
                        )}
                    </AnimatePresence>
                </div>

            </main>
        </div>
    );
}

// --- Broadcast View ---
function BroadcastView({ host, selectedDevice, setSelectedDevice }: any) {
    const isBroadcasting = host.status === 'broadcasting';

    // Use optimal defaults under the hood, hidden from user
    const handleStart = () => {
        host.startHost({
            deviceName: selectedDevice || null,
            monitor: false, // Don't monitor locally by default for simple consumer app
            monitorDevice: null,
            monitorSkipChannels: 0,
            monitorGain: 1.0,
            broadcastGain: 1.0,
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center"
        >
            <div className="mb-10 text-center">
                <h2 className="text-xl font-medium text-white mb-2">Share Audio</h2>
                <p className="text-sm text-zinc-400">Cast your system audio to the network.</p>
            </div>

            {!isBroadcasting ? (
                <div className="w-full space-y-6 flex flex-col items-center">
                    <div className="w-full">
                        <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-2">Input Source</label>
                        <div className="relative">
                            <select
                                value={selectedDevice}
                                onChange={(e) => setSelectedDevice(e.target.value)}
                                className="w-full appearance-none bg-zinc-900/50 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-white/30 transition-colors cursor-pointer"
                            >
                                <option value="">System Default</option>
                                {host.devices.map((d: any) => (
                                    <option key={d.name} value={d.name}>{d.is_loopback ? `[System] ${d.name}` : d.name}</option>
                                ))}
                            </select>
                            <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                            </div>
                        </div>
                        {host.devices.some((d: any) => d.is_loopback) === false && (
                            <p className="text-[11px] text-zinc-500 mt-2 px-2 text-center">
                                Need to cast system audio? Install <a href="https://existential.audio/blackhole/" target="_blank" className="underline text-zinc-300">BlackHole</a>.
                            </p>
                        )}
                    </div>

                    <button
                        onClick={handleStart}
                        className="mt-4 w-24 h-24 rounded-full bg-white text-black flex flex-col items-center justify-center gap-1 hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)]"
                    >
                        <Power strokeWidth={2.5} size={32} />
                    </button>
                </div>
            ) : (
                <div className="w-full flex justify-center py-6">
                    <div className="relative group cursor-pointer" onClick={host.stopHost}>
                        <div className="absolute inset-0 bg-red-500 rounded-full blur-xl opacity-40 animate-pulse" />
                        <div className="relative w-32 h-32 rounded-full border-2 border-red-500 flex flex-col items-center justify-center text-red-500 hover:bg-red-500/10 transition-colors bg-[#141415]">
                            <span className="text-sm font-bold tracking-widest uppercase">On Air</span>
                            <span className="text-[10px] uppercase mt-1 opacity-70 group-hover:opacity-100 transition-opacity">Tap to Stop</span>
                        </div>
                    </div>
                </div>
            )}
        </motion.div>
    );
}

// --- Listen View ---
function ListenView({ receiver }: any) {
    const isReceiving = receiver.status === 'receiving';
    const isDiscovering = receiver.status === 'discovering';

    // Memoize active host info
    const activeHostName = useMemo(() => {
        if (!receiver.selectedHost) return 'Broadcaster';
        return receiver.selectedHost.name;
    }, [receiver.selectedHost]);

    const handleConnect = (hostNode: any) => {
        receiver.connectAndPlay(hostNode, 1.0); // Clean default 1.0x gain
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center w-full min-h-[300px]"
        >
            <div className="mb-8 text-center w-full relative">
                <h2 className="text-xl font-medium text-white mb-2">Listen</h2>
                <p className="text-sm text-zinc-400">Discover and play local broadcasts.</p>

                {!isReceiving && (
                    <button
                        onClick={() => receiver.discoverHosts()}
                        disabled={isDiscovering}
                        className="absolute right-0 top-0 p-2 text-zinc-400 hover:text-white disabled:opacity-50 transition-colors"
                    >
                        <RefreshCw size={18} className={isDiscovering ? 'animate-spin' : ''} />
                    </button>
                )}
            </div>

            {!isReceiving ? (
                <div className="w-full flex-1 flex flex-col">
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 px-2">Available Broadcasts</label>

                    <div className="space-y-3 w-full">
                        {receiver.hosts.length === 0 ? (
                            <div className="py-12 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl bg-white/5">
                                <Radio size={24} className="text-zinc-600 mb-3" />
                                <span className="text-sm text-zinc-400">No broadcasts found</span>
                                <span className="text-xs text-zinc-600 mt-1">Make sure a host is on the same network.</span>
                            </div>
                        ) : (
                            receiver.hosts.map((hostNode: any, i: number) => (
                                <button
                                    key={i}
                                    onClick={() => handleConnect(hostNode)}
                                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-zinc-900/50 border border-white/5 hover:bg-white/5 hover:border-white/20 transition-all group text-left"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center">
                                            <Headphones size={20} />
                                        </div>
                                        <div>
                                            <div className="font-medium text-white text-sm">{hostNode.name}</div>
                                            <div className="text-[11px] text-zinc-500 mt-0.5">{hostNode.ip}</div>
                                        </div>
                                    </div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                                        Connect
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            ) : (
                <div className="w-full flex flex-col items-center justify-center flex-1 py-4">
                    <div className="relative w-32 h-32 mb-8">
                        <div className="absolute inset-0 bg-blue-500 rounded-full blur-xl opacity-30 animate-pulse" />
                        <div className="absolute inset-4 rounded-full border border-blue-500/30 animate-[ping_3s_ease-out_infinite]" />
                        <div className="absolute inset-8 rounded-full border border-blue-500/50 animate-[ping_3s_ease-out_infinite_500ms]" />
                        <div className="relative w-full h-full rounded-full bg-zinc-900 flex items-center justify-center text-blue-400 border border-blue-500/20 shadow-xl overflow-hidden">
                            <div className="flex gap-1 items-end h-8">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <motion.div
                                        key={i}
                                        className="w-1.5 bg-blue-400 rounded-full"
                                        animate={{ height: ['20%', '100%', '20%'] }}
                                        transition={{ duration: 0.8 + (i * 0.1), repeat: Infinity, ease: 'easeInOut' }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="text-center mb-8">
                        <div className="text-zinc-400 text-xs mb-1 uppercase tracking-widest font-semibold">Listening To</div>
                        <div className="text-xl font-medium text-white">{activeHostName}</div>
                    </div>

                    <button
                        onClick={receiver.stopReceiver}
                        className="w-full py-4 rounded-2xl bg-zinc-900 border border-white/10 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 transition-all text-sm font-medium text-white flex justify-center"
                    >
                        Disconnect
                    </button>
                </div>
            )}
        </motion.div>
    );
}
