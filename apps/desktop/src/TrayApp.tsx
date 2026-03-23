import { useState, useEffect, useMemo } from 'react';
import { useAudioHost } from './hooks/useAudioHost';
import { useAudioReceiver } from './hooks/useAudioReceiver';
import { Radio, Headphones, RefreshCw, Power } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getThemeForString } from './App';
import { invoke } from '@tauri-apps/api/core';

export default function TrayApp() {
    const host = useAudioHost();
    const receiver = useAudioReceiver();
    const [mode, setMode] = useState<'broadcast' | 'listen'>('broadcast');
    const [broadcastName, setBroadcastName] = useState('');

    useEffect(() => {
        invoke<string>('get_device_id')
            .then(id => {
                let hash = 5381;
                for (let i = 0; i < id.length; i++) hash = ((hash << 5) + hash) + id.charCodeAt(i);
                setBroadcastName(`Resonant Wave ${Math.abs(hash) % 100}`); // fallback simple name
            })
            .catch(() => setBroadcastName('My Broadcast'));
    }, []);

    const isBroadcasting = host.status === 'broadcasting' || host.status === 'starting';
    const isListening = receiver.status === 'receiving' || receiver.status === 'connecting';
    const isBusy = isBroadcasting || isListening;

    useEffect(() => {
        if (mode === 'listen' && !isListening) receiver.discoverHosts();
    }, [mode]);

    const activeHostName = useMemo(() => receiver.selectedHost ? receiver.selectedHost.name : 'Broadcaster', [receiver.selectedHost]);
    const myTheme = useMemo(() => getThemeForString(broadcastName), [broadcastName]);
    const activeTheme = useMemo(() => getThemeForString(activeHostName), [activeHostName]);

    return (
        <div className="h-screen w-full bg-[#141415]/90 backdrop-blur-xl border border-white/10 rounded-2xl flex flex-col p-4 text-white overflow-hidden shadow-2xl items-center relative select-none">
            {/* Header */}
            <div className="flex items-center justify-center w-full mb-6">
                <h1 className="text-xl font-semibold tracking-tight">Resound</h1>
            </div>

            {/* Mode Switcher */}
            {!isBusy && (
                <div className="relative flex w-full p-1 mb-6 border rounded-full bg-zinc-900/80 border-white/5">
                    <div
                        className="absolute bg-white rounded-full h-[calc(100%-8px)] top-[4px] transition-all duration-300 shadow-sm"
                        style={{ width: 'calc(50% - 4px)', left: mode === 'broadcast' ? '4px' : 'calc(50%)' }}
                    />
                    <button
                        onClick={() => setMode('broadcast')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-full relative z-10 flex items-center justify-center gap-1.5 ${mode === 'broadcast' ? 'text-black' : 'text-zinc-400'}`}
                    >
                        <Radio size={14} /> Broadcast
                    </button>
                    <button
                        onClick={() => setMode('listen')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-full relative z-10 flex items-center justify-center gap-1.5 ${mode === 'listen' ? 'text-black' : 'text-zinc-400'}`}
                    >
                        <Headphones size={14} /> Listen
                    </button>
                </div>
            )}

            {/* Content */}
            <AnimatePresence mode="wait">
                {mode === 'broadcast' ? (
                    <motion.div key="broadcast" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col items-center flex-1 w-full">
                        {!isBroadcasting ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 mt-4">
                                <div className="text-sm text-center text-zinc-400">Ready to cast</div>
                                <button
                                    onClick={() => host.startHost({
                                        deviceName: null,
                                        name: broadcastName,
                                        monitor: false, monitorDevice: null, monitorSkipChannels: 0,
                                        monitorGain: 1.0, broadcastGain: 1.0
                                    })}
                                    className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                                >
                                    <Power size={28} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full gap-4 mt-4">
                                <div onClick={() => host.stopHost()} className="relative cursor-pointer group">
                                    <div className={`absolute inset-0 ${myTheme.glow} rounded-full blur-xl animate-pulse`} />
                                    <div className={`relative w-24 h-24 rounded-full border-2 ${myTheme.border} flex flex-col items-center justify-center ${myTheme.text} ${myTheme.hoverBg} transition-colors bg-[#141415]`}>
                                        <span className="text-xs font-bold uppercase">On Air</span>
                                        <span className="text-[9px] uppercase mt-1 opacity-70 group-hover:opacity-100 transition-opacity">Stop</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div key="listen" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col items-center flex-1 w-full">
                        {!isListening ? (
                            <div className="flex flex-col w-full h-full pt-2">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-semibold uppercase text-zinc-500">Available</span>
                                    <button onClick={() => receiver.discoverHosts()} className="text-zinc-400 hover:text-white"><RefreshCw size={14} /></button>
                                </div>
                                <div className="flex-1 w-full space-y-2 overflow-y-auto no-scrollbar">
                                    {receiver.hosts.length === 0 ? (
                                        <div className="py-8 text-xs text-center text-zinc-500">No broadcasts found</div>
                                    ) : (
                                        receiver.hosts.map((hostNode: any, i: number) => {
                                            const ht = getThemeForString(hostNode.name);
                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => receiver.connectAndPlay(hostNode, 1.0)}
                                                    className="flex items-center w-full p-3 text-left transition-all border rounded-xl bg-zinc-900/50 hover:bg-white/5 border-white/5 hover:border-white/20"
                                                >
                                                    <div className={`w-8 h-8 rounded-full ${ht.iconBg} ${ht.text} flex items-center justify-center mr-3 shrink-0`}><Headphones size={14} /></div>
                                                    <div className="flex-1 truncate">
                                                        <div className="text-xs font-medium text-white truncate">{hostNode.name}</div>
                                                        <div className="text-[10px] text-zinc-500">{hostNode.ip}</div>
                                                    </div>
                                                </button>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center w-full h-full gap-4 mt-4">
                                <div className="relative w-24 h-24 mb-4">
                                    <div className={`absolute inset-0 ${activeTheme.glowLight} rounded-full blur-xl animate-pulse`} />
                                    <div className={`relative w-full h-full rounded-full bg-zinc-900 flex items-center justify-center ${activeTheme.text} border border-white/5 shadow-xl`}>
                                        <Headphones size={28} />
                                    </div>
                                </div>
                                <div className="w-full text-center">
                                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-1">Listening To</div>
                                    <div className="text-base font-medium text-white truncate">{activeHostName}</div>
                                </div>
                                <button
                                    onClick={() => receiver.stopReceiver()}
                                    className={`w-full py-2.5 mt-2 rounded-xl bg-zinc-900 border border-white/10 ${activeTheme.borderHover} ${activeTheme.hoverBg} ${activeTheme.hoverText} transition-all text-sm font-medium focus:outline-none`}
                                >
                                    Disconnect
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
