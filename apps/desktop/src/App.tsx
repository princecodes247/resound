import { useState, useEffect, useMemo } from 'react';
import { useAudioHost } from './hooks/useAudioHost';
import { useAudioReceiver } from './hooks/useAudioReceiver';
import { Radio, Headphones, RefreshCw, Power, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { invoke } from '@tauri-apps/api/core';
import { QRCodeCanvas } from 'qrcode.react';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const ADJECTIVES = ['Resonant', 'Crystal', 'Deep', 'Ethereal', 'Cosmic', 'Neon', 'Phantom', 'Golden', 'Silver', 'Crimson', 'Midnight', 'Sonic', 'Lucid', 'Vibrant', 'Dynamic', 'Magnetic', 'Electric', 'Solar', 'Lunar', 'Astral'];
const NOUNS = ['Echo', 'Wave', 'Frequency', 'Bass', 'Treble', 'Pulse', 'Chord', 'Beat', 'Noise', 'Tone', 'Pitch', 'Chorus', 'Harmony', 'Rhythm', 'Resonance', 'Signal', 'Vibe', 'Static', 'Aura', 'Current'];

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

function generateBroadcastName() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return `${adj} ${noun}`;
}

function getDeterministicName(deviceId: string) {
    let hash = 5381;
    for (let i = 0; i < deviceId.length; i++) {
        hash = ((hash << 5) + hash) + deviceId.charCodeAt(i);
    }
    hash = Math.abs(hash);
    const adj = ADJECTIVES[hash % ADJECTIVES.length];
    const noun = NOUNS[hash % NOUNS.length];
    return `${adj} ${noun}`;
}

export function getThemeForString(seed: string) {
    if (!seed) return COLOR_THEMES[0];
    let hash = 5381;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) + hash) + seed.charCodeAt(i);
    }
    hash = Math.abs(hash);
    return COLOR_THEMES[hash % COLOR_THEMES.length];
}

// --- Main App ---
export default function App() {
    const host = useAudioHost();
    const receiver = useAudioReceiver();

    // Mode: 'broadcast' or 'listen'
    const [mode, setMode] = useState<'broadcast' | 'listen'>('broadcast');

    // Settings State
    const [showSettings, setShowSettings] = useState(false);
    const [broadcastName, setBroadcastName] = useState('');
    const [selectedDevice, setSelectedDevice] = useState('');
    const [localIp, setLocalIp] = useState<string | null>(null);

    useEffect(() => {
        invoke<string>('get_local_ip')
            .then(setLocalIp)
            .catch(e => console.error("Failed to get local IP", e));
    }, []);

    useEffect(() => {
        invoke<string>('get_device_id')
            .then(id => setBroadcastName(getDeterministicName(id)))
            .catch(() => setBroadcastName(generateBroadcastName()));
    }, []);
    const [monitorDevice, setMonitorDevice] = useState('');
    const [monitorGain, setMonitorGain] = useState(1.0);
    const [broadcastGain, setBroadcastGain] = useState(1.0);
    const [outputGain, setOutputGain] = useState(1.0);

    // Auto-select "Resound Audio" for monitor device if available
    useEffect(() => {
        if (!monitorDevice && host.outputDevices?.length > 0) {
            const testDev = host.outputDevices.find((d: any) => d.name.toLowerCase().includes('resound audio'));
            if (testDev) {
                setMonitorDevice(testDev.name);
            }
        }
    }, [host.outputDevices]);

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

    // Calculate dynamic glowing theme
    const myTheme = useMemo(() => getThemeForString(broadcastName), [broadcastName]);
    const listenGlowClass = receiver.status === 'receiving' && receiver.selectedHost
        ? getThemeForString(receiver.selectedHost.name).bg
        : 'bg-zinc-800';

    const ambientGlowClass = isBroadcasting ? myTheme.bg : isListening ? listenGlowClass : 'bg-zinc-800';

    return (
        <div className="min-h-screen bg-[#0A0A0B] text-white flex flex-col items-center justify-center p-6 font-sans selection:bg-white/20 relative">

            {/* Background glow effects */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className={cn(
                    "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[160px] opacity-20 transition-colors duration-1000",
                    ambientGlowClass
                )} />
            </div>

            <main className="relative z-10 flex flex-col items-center w-full max-w-md">

                {/* Header */}
                <div className="flex items-start justify-between w-full px-2 mb-10">
                    <div className="w-10" /> {/* Spacer */}
                    <div className="text-center">
                        <h1 className="text-2xl font-semibold tracking-tight">Resound</h1>
                        <p className="mt-1 text-sm text-zinc-400">Local Network Audio</p>
                    </div>
                    <button
                        onClick={() => setShowSettings(true)}
                        className="flex items-center justify-center w-10 h-10 transition-colors border rounded-full bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 focus:outline-none"
                    >
                        <Settings size={18} />
                    </button>
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
                                "w-36 py-2.5 text-sm font-medium rounded-full relative z-10 transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none",
                                mode === 'broadcast' ? "text-black" : "text-zinc-400 hover:text-white"
                            )}
                        >
                            <Radio size={16} /> Broadcast
                        </button>
                        <button
                            onClick={() => handleModeSwitch('listen')}
                            className={cn(
                                "w-36 py-2.5 text-sm font-medium rounded-full relative z-10 transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none",
                                mode === 'listen' ? "text-black" : "text-zinc-400 hover:text-white"
                            )}
                        >
                            <Headphones size={16} /> Listen
                        </button>
                    </div>
                )}

                {/* Active View Container */}
                <div className="w-full bg-[#141415]/80 backdrop-blur-xl border border-white/10 rounded-[32px] p-8 shadow-2xl relative">
                    <AnimatePresence mode="wait">
                        {mode === 'broadcast' ? (
                            <BroadcastView
                                key="broadcast"
                                host={host}
                                broadcastName={broadcastName}
                                setBroadcastName={setBroadcastName}
                                selectedDevice={selectedDevice}
                                setSelectedDevice={setSelectedDevice}
                                monitorDevice={monitorDevice}
                                monitorGain={monitorGain}
                                broadcastGain={broadcastGain}
                                theme={myTheme}
                                localIp={localIp}
                            />
                        ) : (
                            <ListenView
                                key="listen"
                                receiver={receiver}
                                outputGain={outputGain}
                            />
                        )}
                    </AnimatePresence>
                </div>

            </main>

            {/* Settings Modal */}
            <AnimatePresence>
                {showSettings && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="w-full max-w-sm bg-[#141415] border border-white/10 rounded-3xl p-6 shadow-2xl relative"
                        >
                            <button onClick={() => setShowSettings(false)} className="absolute p-2 transition-colors rounded-full top-4 right-4 text-zinc-400 hover:text-white bg-white/5 focus:outline-none">
                                <X size={16} />
                            </button>
                            <h3 className="mb-6 text-lg font-medium">Audio Settings</h3>

                            <div className="space-y-6">
                                {/* Monitor Device */}
                                <div>
                                    <label className="block mb-2 text-xs font-semibold tracking-wider uppercase text-zinc-500">Local Monitor Output</label>
                                    <div className="relative">
                                        <select
                                            value={monitorDevice}
                                            onChange={(e) => setMonitorDevice(e.target.value)}
                                            className="w-full px-4 py-3 text-sm text-white transition-colors border appearance-none cursor-pointer bg-zinc-900/50 border-white/10 rounded-xl focus:outline-none focus:border-white/30"
                                        >
                                            <option value="">None (Disabled)</option>
                                            {host.outputDevices.map((d: any) => (
                                                <option key={d.name} value={d.name}>{d.name}</option>
                                            ))}
                                        </select>
                                        <div className="absolute -translate-y-1/2 pointer-events-none right-4 top-1/2 text-zinc-500">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 mt-2">Outputs your broadcast to a local device (e.g., headphones) to hear exactly what is being sent.</p>
                                </div>

                                <div className="w-full h-px bg-white/5" />

                                {/* Gains */}
                                <SettingsSlider label="Monitor Boost" value={monitorGain} onChange={setMonitorGain} />
                                <SettingsSlider label="Broadcast Boost" value={broadcastGain} onChange={setBroadcastGain} />
                                <div className="w-full h-px bg-white/5" />
                                <SettingsSlider label="Receiver Output Boost" value={outputGain} onChange={setOutputGain} />

                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}

// --- Components ---

function SettingsSlider({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) {
    return (
        <div>
            <div className="flex items-end justify-between mb-2">
                <label className="block text-xs font-semibold tracking-wider uppercase text-zinc-500">{label}</label>
                <span className="font-mono text-xs text-zinc-400">{value.toFixed(1)}x</span>
            </div>
            <input
                type="range" min={1} max={3} step={0.1}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer bg-zinc-800 accent-white focus:outline-none focus:ring-2 focus:ring-white/50"
            />
        </div>
    );
}

function BroadcastView({ host, broadcastName, setBroadcastName, selectedDevice, setSelectedDevice, monitorDevice, monitorGain, broadcastGain, theme, localIp }: any) {
    const isBroadcasting = host.status === 'broadcasting';
    const [showAudioPrompt, setShowAudioPrompt] = useState(false);
    const [originalDevices, setOriginalDevices] = useState<{ input: string, output: string, volume: number | null } | null>(null);

    const handleStart = async () => {
        try {
            const currentInput = await invoke<string>('get_default_audio_device', { isInput: true });
            const currentOutput = await invoke<string>('get_default_audio_device', { isInput: false });

            const isBlackHole = currentInput.toLowerCase().includes('blackhole');
            const isTestDev = currentOutput.toLowerCase().includes('resound audio');

            if (!isBlackHole || !isTestDev) {
                const currentVolume = await invoke<number>('get_system_volume').catch(() => null);
                setOriginalDevices({ input: currentInput, output: currentOutput, volume: currentVolume });
                setShowAudioPrompt(true);
                return;
            }
        } catch (e) {
            console.error('Failed to get audio devices', e);
        }

        startActualHost();
    };

    const startActualHost = () => {
        host.startHost({
            deviceName: selectedDevice || null,
            name: broadcastName || null,
            monitor: monitorDevice !== '',
            monitorDevice: monitorDevice || null,
            monitorSkipChannels: 0,
            monitorGain,
            broadcastGain,
        });
    };

    const handleAutoSwitch = async () => {
        try {
            await invoke('set_system_volume', { volume: 100 }).catch(e => console.error("Volume failed", e));
            await invoke('set_default_audio_device', { isInput: false, name: 'blackhole' });
            // await invoke('set_default_audio_device', { isInput: false, name: 'resound audio' });
        } catch (e) {
            console.error('Failed to auto switch', e);
        }
        setShowAudioPrompt(false);
        setTimeout(() => startActualHost(), 500);
    };

    const handleStop = async () => {
        host.stopHost();
        if (originalDevices) {
            try {
                await invoke('set_default_audio_device', { isInput: true, name: originalDevices.input });
                await invoke('set_default_audio_device', { isInput: false, name: originalDevices.output });
                if (originalDevices.volume !== null) {
                    await invoke('set_system_volume', { volume: originalDevices.volume });
                }
            } catch (e) {
                console.error('Failed to restore audio devices', e);
            }
            setOriginalDevices(null);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center"
        >
            <div className="w-full mb-10 text-center">
                <input
                    type="text"
                    value={broadcastName}
                    onChange={(e) => setBroadcastName(e.target.value)}
                    disabled={isBroadcasting}
                    className="text-xl font-medium text-white mb-2 bg-transparent text-center border-b border-white/0 hover:border-white/20 focus:border-white/50 focus:outline-none transition-colors w-full px-2 py-1 max-w-[240px] appearance-none"
                    placeholder="Broadcast Name"
                />
                <p className="text-sm text-zinc-400">Cast your system audio to the network.</p>
            </div>

            {!isBroadcasting ? (
                <div className="flex flex-col items-center w-full space-y-6">
                    <div className="w-full">
                        <label className="block px-2 mb-3 text-xs font-semibold tracking-wider uppercase text-zinc-500">Input Source</label>
                        <div className="relative">
                            <select
                                value={selectedDevice}
                                onChange={(e) => setSelectedDevice(e.target.value)}
                                className="w-full px-5 py-4 text-sm text-white transition-colors border appearance-none cursor-pointer bg-zinc-900/50 border-white/10 rounded-2xl focus:outline-none focus:border-white/30"
                            >
                                <option value="">System Default</option>
                                {host.devices.map((d: any) => (
                                    <option key={d.name} value={d.name}>{d.is_loopback ? `[System] ${d.name}` : d.name}</option>
                                ))}
                            </select>
                            <div className="absolute -translate-y-1/2 pointer-events-none right-5 top-1/2 text-zinc-500">
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
                        className="mt-4 w-24 h-24 rounded-full bg-white text-black flex flex-col items-center justify-center gap-1 hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)] focus:outline-none"
                    >
                        <Power strokeWidth={2.5} size={32} />
                    </button>
                </div>
            ) : (
                <div className="flex flex-col items-center w-full py-6 space-y-6">
                    <div className="relative cursor-pointer group" onClick={handleStop}>
                        <div className={`absolute inset-0 ${theme.glow} rounded-full blur-xl animate-pulse`} />
                        <div className={`relative w-32 h-32 rounded-full border-2 ${theme.border} flex flex-col items-center justify-center ${theme.text} ${theme.hoverBg} transition-colors bg-[#141415]`}>
                            <span className="text-sm font-bold tracking-widest uppercase">On Air</span>
                            <span className="text-[10px] uppercase mt-1 opacity-70 group-hover:opacity-100 transition-opacity">Tap to Stop</span>
                        </div>
                    </div>

                    <div className="flex flex-col items-center w-full max-w-sm gap-4 p-6 text-center border bg-white/5 border-white/10 rounded-3xl">
                        <div className="p-3 bg-white shadow-xl rounded-2xl">
                            <QRCodeCanvas
                                value={`http://${localIp}:5174/?host=${localIp}:${host.signalingPort}&sid=${host.sessionId}`}
                                size={140}
                                level="M"
                            />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <p className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500 mb-1">Web Client Connection</p>
                            <code className="font-mono text-sm text-zinc-300">
                                {localIp ? `${localIp}:${host.signalingPort || '...'}` : 'Loading IP...'}
                            </code>
                            <p className="text-[9px] text-zinc-500 max-w-[200px] mt-1">Scan the code or enter the address on your mobile device to join.</p>
                        </div>
                    </div>
                </div>
            )}

            {showAudioPrompt && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#141415]/90 backdrop-blur-md rounded-[32px] p-6 text-center animate-in fade-in duration-200">
                    <div className="flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-white/10">
                        <Headphones className="text-white" size={24} />
                    </div>
                    <p className="mb-6 font-medium text-white">Resound needs to route your audio to share it</p>

                    <button
                        onClick={handleAutoSwitch}
                        className="bg-white text-black px-6 py-3 rounded-xl font-medium shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:scale-105 active:scale-95 transition-transform flex items-center gap-2"
                    >
                        <span>👉</span> Switch Audio Automatically
                    </button>

                    <button
                        onClick={() => setShowAudioPrompt(false)}
                        className="mt-6 text-xs transition-colors text-zinc-500 hover:text-white"
                    >
                        Cancel
                    </button>
                </div>
            )}
        </motion.div>
    );
}

function ListenView({ receiver, outputGain }: any) {
    const isReceiving = receiver.status === 'receiving';
    const isDiscovering = receiver.status === 'discovering';

    // Memoize active host info
    const activeHostName = useMemo(() => {
        if (!receiver.selectedHost) return 'Broadcaster';
        return receiver.selectedHost.name;
    }, [receiver.selectedHost]);

    const activeTheme = useMemo(() => getThemeForString(activeHostName), [activeHostName]);

    const handleConnect = (hostNode: any) => {
        receiver.connectAndPlay(hostNode, outputGain);
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
                <p className="text-sm text-zinc-400">Discover and play local broadcasts.</p>

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
                            receiver.hosts.map((hostNode: any, i: number) => {
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
