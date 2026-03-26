import { useState, useEffect, useMemo, useRef } from 'react';
import { useAudioHost } from './hooks/useAudioHost';
import { useAudioReceiver } from './hooks/useAudioReceiver';
import { Radio, Headphones, RefreshCw, Power, Settings, X, ChevronDown, Activity, Wifi, Volume2, Globe, Plug } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { invoke } from '@tauri-apps/api/core';
import { QRCodeCanvas } from 'qrcode.react';
import { DriverSetupFlow } from './components/DriverSetupFlow';

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
    const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
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
    const [monitorDevice, setMonitorDevice] = useState<string | null>(null);
    const [monitorGain, setMonitorGain] = useState(1.0);
    const [broadcastGain, setBroadcastGain] = useState(1.0);
    const [outputGain, setOutputGain] = useState(1.0);

    // Auto-select "Resound Audio" for monitor device and blackhole for input device if available
    useEffect(() => {
        if (monitorDevice === null && host.outputDevices?.length > 0) {
            const resoundAudio = host.outputDevices.find((d: any) => d.name.toLowerCase().includes('resound audio'));
            if (resoundAudio) {
                setMonitorDevice(resoundAudio.name);
            }
        }
        if (selectedDevice === null && host.devices?.length > 0) {
            const blackhole = host.devices.find((d: any) => d.name.toLowerCase().includes('blackhole'));
            if (blackhole) {
                setSelectedDevice(blackhole.name);
            }
        }
    }, [host.outputDevices, host.devices]);

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
                <div className="w-full bg-[#141415]/60 backdrop-blur-2xl border border-white/5 rounded-[40px] shadow-2xl overflow-hidden group hover:border-white/10 transition-all">
                    <div className="p-8">
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
                                    setMonitorDevice={setMonitorDevice}
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

                    {/* Status Footer */}
                    <div className="flex items-center justify-between px-8 py-4 border-t bg-white/5 border-white/5">
                        <div className="flex items-center gap-2">
                            <div className={cn(
                                "w-2 h-2 rounded-full",
                                receiver.status === 'receiving' ? "bg-cyan-500 animate-pulse" :
                                    receiver.status === 'disconnected' ? "bg-red-500" : "bg-zinc-600"
                            )} />
                            <span className="text-[10px] font-bold tracking-widest uppercase text-zinc-500">
                                {receiver.status === 'receiving' ? "Streaming Live" :
                                    receiver.status === 'disconnected' ? "Host Disconnected" :
                                        receiver.status === 'discovering' ? "Searching..." : "Ready"}
                            </span>
                        </div>
                        <div className="flex gap-4">
                            <Activity size={14} className="text-zinc-600" />
                            <Plug size={14} className="text-zinc-600" />
                            <Globe size={14} className="text-zinc-600" />
                            <Wifi size={14} className="text-zinc-600" />
                            <Volume2 size={14} className="text-zinc-600" />
                        </div>
                    </div>
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
                                            value={monitorDevice ?? ''}
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

function BroadcastView({ host, broadcastName, setBroadcastName, selectedDevice, setSelectedDevice, monitorDevice, setMonitorDevice, monitorGain, broadcastGain, theme, localIp }: any) {
    const isBroadcasting = host.status === 'broadcasting';
    const [showDriverSetup, setShowDriverSetup] = useState(false);
    const [originalDevices, setOriginalDevices] = useState<{ input: string, output: string, volume: number | null } | null>(null);
    const [syncMode, setSyncMode] = useState<'perfect' | 'lightweight'>(selectedDevice?.includes('Driverless') ? 'lightweight' : 'perfect');

    const handleSyncModeChange = (mode: 'perfect' | 'lightweight') => {
        setSyncMode(mode);
        if (mode === 'lightweight') {
            setSelectedDevice('System Audio (Driverless)');
        } else {
            const blackhole = host.devices.find((d: any) => d.name.toLowerCase().includes('blackhole'));
            if (blackhole) {
                setSelectedDevice(blackhole.name);
            } else {
                setSelectedDevice(null);
            }
        }
    };

    const startActualHost = () => {
        host.startHost({
            deviceName: selectedDevice || null,
            name: broadcastName || null,
            monitor: !!monitorDevice,
            monitorDevice: monitorDevice || null,
            monitorSkipChannels: 0,
            monitorGain,
            broadcastGain,
        });
    };

    const handleAutoSwitch = async (previousOutput?: string) => {
        try {
            await invoke('set_default_audio_device', { isInput: false, name: 'BlackHole 2ch' });
            if (previousOutput) {
                setMonitorDevice(previousOutput);
            }
            setSelectedDevice('BlackHole 2ch');
            await invoke('set_system_volume', { volume: 100 }).catch(e => console.error("Volume failed", e));
            setTimeout(() => startActualHost(), 500);
        } catch (e) {
            console.error('Failed to auto switch', e);
            startActualHost();
        }
    };

    const handleStart = async () => {
        if (syncMode === 'perfect') {
            try {
                const installed = await invoke<boolean>('check_driver_installed');
                if (!installed) {
                    setShowDriverSetup(true);
                    return;
                }

                const currentInput = await invoke<string>('get_default_audio_device', { isInput: true });
                const currentOutput = await invoke<string>('get_default_audio_device', { isInput: false });
                const isBlackHole = currentInput.toLowerCase().includes('blackhole');

                if (!isBlackHole) {
                    const currentVolume = await invoke<number>('get_system_volume').catch(() => null);
                    setOriginalDevices({ input: currentInput, output: currentOutput, volume: currentVolume });
                    await handleAutoSwitch(currentOutput);
                    return;
                }
            } catch (e) {
                console.error('Failed to get audio devices', e);
            }
        }
        startActualHost();
    };

    const handleDriverSetupComplete = async () => {
        setShowDriverSetup(false);
        const currentOutput = await invoke<string>('get_default_audio_device', { isInput: false });
        const currentInput = await invoke<string>('get_default_audio_device', { isInput: true });
        const currentVolume = await invoke<number>('get_system_volume').catch(() => null);

        setOriginalDevices({ input: currentInput, output: currentOutput, volume: currentVolume });
        await handleAutoSwitch(currentOutput);
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
                    className="text-xl font-bold text-white mb-2 bg-transparent text-center border-b border-white/0 hover:border-white/20 focus:border-white/50 focus:outline-none transition-all w-full px-2 py-1 max-w-[280px] appearance-none tracking-tight"
                    placeholder="Broadcast Name"
                />
                <p className="text-sm text-zinc-500">Cast your system audio to the network.</p>
            </div>

            {!isBroadcasting ? (
                <div className="flex flex-col items-center w-full space-y-10">
                    <div className="w-full">
                        <div className="relative flex p-1.5 mb-2 border bg-white/[0.03] rounded-[24px] border-white/5 backdrop-blur-md">
                            <div
                                className="absolute bg-white/10 rounded-[18px] h-[calc(100%-12px)] top-[6px] transition-all duration-300 ease-out shadow-sm border border-white/5"
                                style={{
                                    width: 'calc(50% - 6px)',
                                    left: syncMode === 'perfect' ? '6px' : 'calc(50%)',
                                }}
                            />
                            <button
                                onClick={() => handleSyncModeChange('perfect')}
                                className={cn(
                                    "flex-1 py-4 text-sm font-bold rounded-xl relative z-10 transition-colors duration-200 flex flex-col items-center justify-center gap-0.5 focus:outline-none",
                                    syncMode === 'perfect' ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                <span className="text-sm">Perfect Sync</span>
                                <span className="text-[9px] uppercase tracking-widest opacity-60 font-bold">Recommended</span>
                            </button>
                            <button
                                onClick={() => handleSyncModeChange('lightweight')}
                                className={cn(
                                    "flex-1 py-4 text-sm font-bold rounded-xl relative z-10 transition-colors duration-200 flex flex-col items-center justify-center gap-0.5 focus:outline-none",
                                    syncMode === 'lightweight' ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                <span className="text-sm">Lightweight Sync</span>
                                <span className="text-[9px] uppercase tracking-widest opacity-60 font-bold">No-Driver</span>
                            </button>
                        </div>
                        <p className="text-[10px] text-zinc-600 px-4 text-center leading-relaxed">
                            {syncMode === 'perfect'
                                ? "Lossless, sample-aligned audio loopback (requires driver)."
                                : "Zero-configuration capture using system screen recording."}
                        </p>
                    </div>

                    <button
                        onClick={handleStart}
                        className="mt-4 w-28 h-28 rounded-full bg-white text-black flex flex-col items-center justify-center gap-1 hover:scale-105 active:scale-95 transition-all shadow-[0_0_60px_rgba(255,255,255,0.15)] focus:outline-none group relative overflow-hidden"
                    >
                        <div className="absolute inset-0 transition-opacity opacity-0 bg-linear-to-br from-white via-white to-zinc-200 group-hover:opacity-100" />
                        <Power strokeWidth={2.5} size={36} className="relative z-10" />
                    </button>

                    {originalDevices && (
                        <button
                            onClick={handleStop}
                            className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors flex items-center gap-1.5 px-6 py-3 bg-white/5 rounded-full border border-white/5"
                        >
                            Disable {syncMode === 'perfect' ? 'Perfect' : 'Lightweight'} Sync
                        </button>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center w-full py-8 space-y-8">
                    <div className="relative cursor-pointer group" onClick={handleStop}>
                        <div className={`absolute inset-0 ${theme.glow} rounded-full blur-[40px] animate-pulse opacity-40`} />
                        <div className={`relative w-40 h-40 rounded-full border border-white/10 flex flex-col items-center justify-center ${theme.text} ${theme.hoverBg} transition-all bg-[#141415]/80 backdrop-blur-md shadow-2xl`}>
                            <span className="text-xs font-black tracking-[0.2em] uppercase">On Air</span>
                            <span className="text-[9px] font-bold uppercase mt-2 opacity-40 group-hover:opacity-100 transition-opacity">Tap to Stop</span>
                        </div>
                    </div>

                    <div className="flex flex-col items-center w-full max-w-sm gap-4 p-8 text-center border bg-white/[0.03] border-white/5 rounded-[32px] shadow-2xl">
                        <div className="p-4 bg-white shadow-2xl rounded-[24px]">
                            <QRCodeCanvas
                                value={`http://${localIp}:${host.signalingPort}/?host=${localIp}:${host.signalingPort}&sid=${host.sessionId}`}
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

            {showDriverSetup && (
                <DriverSetupFlow
                    onClose={() => setShowDriverSetup(false)}
                    onComplete={handleDriverSetupComplete}
                />
            )}
        </motion.div>
    );
}

function ListenView({ receiver, outputGain }: { receiver: any, outputGain: number }) {
    const isReceiving = receiver.status === 'receiving';
    const isDiscovering = receiver.status === 'discovering';
    const manualIpRef = useRef<HTMLInputElement>(null);

    const activeHostName = useMemo(() => {
        if (!receiver.selectedHost) return 'Broadcaster';
        return receiver.selectedHost.name;
    }, [receiver.selectedHost]);

    const activeTheme = useMemo(() => getThemeForString(activeHostName), [activeHostName]);

    const handleConnect = (hostNode: any) => {
        receiver.connectAndPlay(hostNode, outputGain);
    };

    const handleManualConnect = () => {
        if (manualIpRef.current) {
            const [ip, portStr] = manualIpRef.current.value.split(':');
            const port = portStr ? parseInt(portStr) : 42069;
            if (ip) receiver.probeHost(ip, port);
        }
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
                                <span className="mt-1 text-[10px] text-zinc-600 uppercase tracking-wider text-center">Ensure Host is on the same network</span>
                            </div>
                        ) : (
                            receiver.hosts.map((hostNode: any, i: number) => {
                                const hostTheme = getThemeForString(hostNode.name);
                                return (
                                    <button
                                        key={i}
                                        onClick={() => handleConnect(hostNode)}
                                        className="flex items-center justify-between w-full p-5 text-left transition-all border rounded-[28px] bg-white/[0.03] border-white/5 hover:bg-white/5 hover:border-white/20 group focus:outline-none focus:ring-2 focus:ring-white/10"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-2xl ${hostTheme.iconBg} ${hostTheme.text} flex items-center justify-center shadow-inner`}>
                                                <Headphones size={22} />
                                            </div>
                                            <div>
                                                <div className="text-base font-bold text-white transition-colors group-hover:text-white/90">{hostNode.name}</div>
                                                <div className="text-[11px] font-mono text-zinc-500 mt-0.5">{hostNode.ip}</div>
                                            </div>
                                        </div>
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-white/5 text-zinc-500 group-hover:bg-white/10 group-hover:text-white transition-all`}>
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
                                ref={manualIpRef}
                                type="text"
                                placeholder="Enter IP (e.g. 192.168.1.10)"
                                className="flex-1 px-5 py-4 text-sm text-white transition-all border bg-white/[0.03] border-white/5 rounded-2xl focus:outline-none focus:border-white/20 focus:bg-white/5"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleManualConnect();
                                }}
                            />
                            <button
                                onClick={handleManualConnect}
                                className="px-6 py-4 text-sm font-bold text-black transition-all bg-white shadow-lg rounded-2xl hover:bg-zinc-200 hover:scale-105 active:scale-95"
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
}
