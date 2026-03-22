import { useState } from 'react';
import { useAudioHost } from './hooks/useAudioHost';
import { useAudioReceiver } from './hooks/useAudioReceiver';
import { Radio, Download, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export default function App() {
    const host = useAudioHost();
    const receiver = useAudioReceiver();

    // Local UI State
    const [monitor, setMonitor] = useState(true);
    const [monitorDevice, setMonitorDevice] = useState('');
    const [skipChannels, setSkipChannels] = useState(0);
    const [monitorGain, setMonitorGain] = useState(1.5);
    const [broadcastGain, setBroadcastGain] = useState(3.0);
    const [outputGain, setOutputGain] = useState(1.2);
    const [selectedDevice, setSelectedDevice] = useState('');
    const [selectedHostIdx, setSelectedHostIdx] = useState<number | null>(null);

    const isBroadcasting = host.status === 'broadcasting';
    const isReceiving = receiver.status === 'receiving';

    return (
        <div className="min-h-screen bg-black text-zinc-100 font-sans p-8 selection:bg-accent selection:text-black">
            <header className="max-w-5xl mx-auto flex justify-between items-center mb-12">
                <div>
                    <h1 className="text-xs font-bold tracking-[0.3em] text-zinc-500 uppercase">Resound Studio</h1>
                    <p className="text-zinc-600 text-[11px] mt-1 italic">Professional Broadcast Engine</p>
                </div>

                <div className="flex gap-4">
                    <StatusBadge active={isBroadcasting} label="NATIVE_HOST" />
                    <StatusBadge active={isReceiving} label="RX_ENGINE" />
                </div>
            </header>

            <main className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12">
                {/* Broadcast Section */}
                <section className="space-y-8">
                    <div className="flex items-center gap-3 text-xs font-bold tracking-widest text-zinc-400 uppercase">
                        <Radio size={14} className={isBroadcasting ? 'text-accent animate-pulse' : 'text-zinc-600'} />
                        Transmission
                    </div>

                    <div className="space-y-6">
                        <Field label="Input Source">
                            <select
                                value={selectedDevice}
                                onChange={(e) => setSelectedDevice(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm focus:border-zinc-500 transition-colors cursor-pointer"
                            >
                                <option value="">Default Input</option>
                                {host.devices.map(d => (
                                    <option key={d.name} value={d.name}>{d.is_loopback ? `[System] ${d.name}` : d.name}</option>
                                ))}
                            </select>
                        </Field>

                        <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setMonitor(!monitor)}>
                            <div className={cn(
                                "w-3 h-3 rounded-full border transition-all",
                                monitor ? "bg-accent border-accent shadow-[0_0_8px_rgba(0,255,102,0.4)]" : "border-zinc-700"
                            )} />
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 group-hover:text-zinc-200 transition-colors">Local Monitoring</span>
                        </div>

                        <AnimatePresence>
                            {monitor && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="pl-6 border-l border-zinc-800 space-y-4 overflow-hidden"
                                >
                                    <Field label="Monitor Output">
                                        <select
                                            value={monitorDevice}
                                            onChange={(e) => setMonitorDevice(e.target.value)}
                                            className="w-full bg-zinc-900/50 border border-zinc-800 rounded px-3 py-1.5 text-xs focus:border-zinc-500 transition-colors"
                                        >
                                            <option value="">Default Output</option>
                                            {host.outputDevices.map(d => (
                                                <option key={d.name} value={d.name}>{d.name}</option>
                                            ))}
                                        </select>
                                    </Field>
                                    <Field label="Channel Offset">
                                        <input
                                            type="number"
                                            value={skipChannels}
                                            onChange={(e) => setSkipChannels(Number(e.target.value))}
                                            className="w-20 bg-zinc-900/50 border border-zinc-800 rounded px-3 py-1 text-xs focus:border-zinc-500 transition-colors"
                                        />
                                    </Field>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <Slider label="Monitor Gain" value={monitorGain} onChange={setMonitorGain} />
                        <Slider label="Broadcast Gain" value={broadcastGain} onChange={setBroadcastGain} />

                        <div className="pt-4">
                            {!isBroadcasting ? (
                                <button
                                    onClick={() => host.startHost({
                                        deviceName: selectedDevice || null,
                                        monitor,
                                        monitorDevice: monitorDevice || null,
                                        monitorSkipChannels: skipChannels,
                                        monitorGain,
                                        broadcastGain
                                    })}
                                    className="w-full bg-white text-black font-bold text-[11px] uppercase tracking-[0.2em] py-3 rounded hover:bg-zinc-200 active:scale-[0.98] transition-all"
                                >
                                    Start Broadcast
                                </button>
                            ) : (
                                <button
                                    onClick={host.stopHost}
                                    className="w-full border border-red-500/50 text-red-500 font-bold text-[11px] uppercase tracking-[0.2em] py-3 rounded hover:bg-red-500 hover:text-white transition-all"
                                >
                                    Terminate Engine
                                </button>
                            )}
                        </div>
                    </div>

                    <Log logs={host.logs} />
                </section>

                {/* Receive Section */}
                <section className="space-y-8">
                    <div className="flex items-center justify-between text-xs font-bold tracking-widest text-zinc-400 uppercase">
                        <div className="flex items-center gap-3">
                            <Download size={14} className={isReceiving ? 'text-accent animate-pulse' : 'text-zinc-600'} />
                            Reception
                        </div>
                        <button
                            onClick={receiver.discoverHosts}
                            className="text-[10px] bg-zinc-900 px-3 py-1 rounded border border-zinc-800 hover:border-zinc-600 transition-all flex items-center gap-2"
                        >
                            <Search size={10} /> Scan
                        </button>
                    </div>

                    <div className="space-y-6">
                        <Field label="Available Nodes">
                            <select
                                onChange={(e) => setSelectedHostIdx(Number(e.target.value))}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm focus:border-zinc-500 transition-colors disabled:opacity-50"
                                disabled={receiver.hosts.length === 0}
                            >
                                <option value="">{receiver.hosts.length === 0 ? 'No discovered nodes' : 'Select a node...'}</option>
                                {receiver.hosts.map((h, i) => (
                                    <option key={i} value={i}>{h.name} • {h.ip}</option>
                                ))}
                            </select>
                        </Field>

                        <Slider label="Output Gain" value={outputGain} onChange={setOutputGain} />

                        <div className="pt-4">
                            {!isReceiving ? (
                                <button
                                    disabled={selectedHostIdx === null}
                                    onClick={() => selectedHostIdx !== null && receiver.connectAndPlay(receiver.hosts[selectedHostIdx], outputGain)}
                                    className="w-full bg-zinc-100 text-black disabled:bg-zinc-800 disabled:text-zinc-600 font-bold text-[11px] uppercase tracking-[0.2em] py-3 rounded active:scale-[0.98] transition-all"
                                >
                                    Connect & Receive
                                </button>
                            ) : (
                                <button
                                    onClick={receiver.stopReceiver}
                                    className="w-full border border-red-500/50 text-red-500 font-bold text-[11px] uppercase tracking-[0.2em] py-3 rounded hover:bg-red-500 hover:text-white transition-all"
                                >
                                    Stop Reception
                                </button>
                            )}
                        </div>
                    </div>

                    <Log logs={receiver.logs} />
                </section>
            </main>

            <footer className="max-w-5xl mx-auto mt-20 pt-8 border-t border-zinc-900 text-[10px] text-zinc-600 flex justify-between uppercase tracking-widest">
                <div>Signal: Stable</div>
                <div>Resound Engine v0.1.0</div>
            </footer>
        </div>
    );
}

function StatusBadge({ active, label }: { active: boolean, label: string }) {
    return (
        <div className={cn(
            "px-3 py-1 rounded-full text-[9px] font-bold tracking-tighter border flex items-center gap-2",
            active ? "border-accent/30 bg-accent/5 text-accent" : "border-zinc-800 text-zinc-600"
        )}>
            <div className={cn("w-1 h-1 rounded-full", active ? "bg-accent" : "bg-zinc-700")} />
            {label}
        </div>
    );
}

function Field({ label, children }: { label: string, children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">{label}</label>
            {children}
        </div>
    );
}

function Slider({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) {
    return (
        <div className="space-y-3">
            <div className="flex justify-between items-end text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                <span>{label}</span>
                <span className="text-zinc-400 font-mono text-[11px]">{value.toFixed(1)}x</span>
            </div>
            <input
                type="range"
                min={1} max={3} step={0.1}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full h-px bg-zinc-800 appearance-none cursor-pointer accent-white"
            />
        </div>
    );
}

function Log({ logs }: { logs: any[] }) {
    return (
        <div className="bg-zinc-950/50 border border-zinc-900 rounded-lg p-4 h-32 overflow-y-auto font-mono text-[9px] text-zinc-500 space-y-1 custom-scrollbar">
            {logs.length === 0 && <div className="italic opacity-30">Waiting for status logs...</div>}
            {logs.map((log, i) => (
                <div key={i} className="flex gap-4">
                    <span className="text-zinc-800 shrink-0">{log.time}</span>
                    <span className="text-zinc-400 leading-relaxed">{log.message}</span>
                </div>
            ))}
        </div>
    );
}
