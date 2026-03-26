import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Loader2, X, ChevronRight } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface DriverSetupFlowProps {
    onClose: () => void;
    onComplete: () => void;
}

type Step = 'intro' | 'installing' | 'success' | 'error';

export function DriverSetupFlow({ onClose, onComplete }: DriverSetupFlowProps) {
    const [step, setStep] = useState<Step>('intro');
    const [error, setError] = useState<string | null>(null);

    const handleStartInstall = async () => {
        try {
            setStep('installing');
            await invoke('install_driver');
        } catch (e: any) {
            console.error('Failed to start install', e);
            setError(e.toString());
            setStep('error');
        }
    };

    // Polling for driver detection
    useEffect(() => {
        let interval: number | null = null;
        if (step === 'installing') {
            interval = window.setInterval(async () => {
                const installed = await invoke<boolean>('check_driver_installed');
                if (installed) {
                    setStep('success');
                    if (interval) clearInterval(interval);
                }
            }, 2000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [step]);

    const handleFinalize = async () => {
        onComplete();
    };

    return (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0A0A0B]/95 backdrop-blur-xl h-full rounded-[32px] p-8 text-center overflow-hidden">
            <button
                onClick={onClose}
                className="absolute p-2 transition-colors rounded-full top-6 right-6 text-zinc-500 hover:text-white bg-white/5"
            >
                <X size={20} />
            </button>

            <AnimatePresence mode="wait">
                {step === 'intro' && (
                    <motion.div
                        key="intro"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="flex flex-col items-center max-w-sm"
                    >


                        <h2 className="mt-4 mb-3 text-2xl font-semibold text-white">Enable Perfect Sync</h2>
                        {/* <p className="mb-8 leading-relaxed text-zinc-400">
                            Get zero-lag audio across all devices. No echo, perfectly in sync, works with any app (Spotify, YouTube, etc).
                        </p> */}

                        <div className="grid w-full grid-cols-1 gap-1 mb-8">
                            {[
                                "No echo or delay",
                                "Perfectly sample-aligned sync",
                                "Works with Spotify, YouTube & Zoom"
                            ].map((text, i) => (
                                <div key={i} className="flex items-center gap-3 px-4 py-3 text-left border bg-white/5 border-white/10 rounded-2xl">
                                    <CheckCircle2 className="text-emerald-500 shrink-0" size={18} />
                                    <span className="text-sm text-zinc-300">{text}</span>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={handleStartInstall}
                            className="w-full bg-white text-black py-4 rounded-2xl font-semibold shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            Enable Now <ChevronRight size={18} />
                        </button>
                        <p className="mt-6 text-xs text-zinc-500">
                            Safe, open-source, and used by thousands of apps.
                            <br />You can remove it anytime in Audio Settings.
                        </p>
                    </motion.div>
                )}

                {step === 'installing' && (
                    <motion.div
                        key="installing"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.1 }}
                        className="flex flex-col items-center max-w-xs"
                    >
                        <div className="relative w-24 h-24 mb-10">
                            <div className="absolute inset-0 border-4 rounded-full border-white/10" />
                            <motion.div
                                className="absolute inset-0 border-4 rounded-full border-t-white"
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="text-zinc-500 animate-spin" size={32} />
                            </div>
                        </div>

                        <h2 className="mb-6 text-xl font-medium text-white">Installing Audio Driver...</h2>

                        <div className="w-full p-6 space-y-4 text-left border bg-zinc-900/50 border-white/5 rounded-3xl">
                            <div className="flex gap-4">
                                <span className="flex items-center justify-center w-6 h-6 text-xs font-bold text-white rounded-full bg-white/10">1</span>
                                <p className="text-sm text-zinc-300">Follow the installer steps</p>
                            </div>
                            <div className="flex gap-4">
                                <span className="flex items-center justify-center w-6 h-6 text-xs font-bold text-white rounded-full bg-white/10">2</span>
                                <p className="text-sm text-zinc-300">Enter your password if asked</p>
                            </div>
                            <div className="flex gap-4">
                                <span className="flex items-center justify-center w-6 h-6 text-xs font-bold text-white rounded-full bg-white/10">3</span>
                                <p className="text-sm text-zinc-300">Come back here when done</p>
                            </div>
                        </div>

                        <p className="mt-8 text-xs text-zinc-500 animate-pulse">Checking installation status automatically...</p>
                    </motion.div>
                )}

                {step === 'success' && (
                    <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center max-w-sm"
                    >
                        <div className="relative flex items-center justify-center w-20 h-20 mb-8 border rounded-full bg-emerald-500/10 border-emerald-500/20">
                            <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-2xl" />
                            <CheckCircle2 className="relative z-10 text-emerald-500" size={40} />
                        </div>

                        <h2 className="mb-3 text-2xl font-semibold text-white">Perfect Sync Enabled</h2>
                        <p className="mb-10 leading-relaxed text-zinc-400">
                            We've configured everything for you. Your system audio is now perfectly synced across all devices.
                        </p>

                        <button
                            onClick={handleFinalize}
                            className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-semibold shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            Get Started
                        </button>
                    </motion.div>
                )}

                {step === 'error' && (
                    <motion.div
                        key="error"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center max-w-sm"
                    >
                        <div className="flex items-center justify-center w-20 h-20 mb-8 border rounded-full bg-rose-500/10 border-rose-500/20">
                            <AlertCircle className="text-rose-500" size={40} />
                        </div>

                        <h2 className="mb-3 text-xl font-semibold text-white">Installation Failed</h2>
                        <p className="mb-8 text-sm text-zinc-400">
                            {error || "We couldn't launch the installer. Please try again or download it manually."}
                        </p>

                        <div className="flex flex-col w-full gap-3">
                            <button
                                onClick={handleStartInstall}
                                className="w-full py-4 font-semibold text-black transition-colors bg-white rounded-2xl hover:bg-zinc-200"
                            >
                                Retry Installation
                            </button>
                            <button
                                onClick={onClose}
                                className="w-full py-4 font-medium transition-colors rounded-2xl text-zinc-400 hover:text-white"
                            >
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
