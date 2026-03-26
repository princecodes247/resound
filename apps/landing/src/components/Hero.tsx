'use client';

import { motion } from 'framer-motion';
import { Radio, Download } from 'lucide-react';

export const Hero = () => {
    return (
        <section className="relative flex flex-col items-center justify-center min-h-screen px-6 overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute w-2 h-2 rounded-full top-1/4 left-1/4 bg-aurora-cyan/50 animate-pulse" />
                <div className="absolute w-1 h-1 rounded-full top-1/3 right-1/3 bg-aurora-purple/50 animate-pulse animation-delay-1000" />
                <div className="absolute bottom-1/3 left-1/3 w-1.5 h-1.5 rounded-full bg-aurora-pink/50 animate-pulse animation-delay-2000" />
            </div>

            <div className="relative z-10 max-w-5xl mx-auto text-center">
                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="mb-6 text-6xl font-bold tracking-tight md:text-8xl lg:text-9xl font-display"
                >
                    <span className="text-white">Resound</span>
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="max-w-2xl mx-auto mb-12 text-xl leading-relaxed md:text-2xl text-stellar-silver"
                >
                    The next evolution of
                    <span className="text-white"> local audio streaming.</span> Studio-grade fidelity, zero configuration.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                    className="flex flex-col items-center justify-center gap-4 mb-16 sm:flex-row"
                >
                    <button className="flex items-center gap-3 px-8 py-4 text-lg font-semibold transition-all border rounded-full glass-prism text-stellar-white hover:bg-white/10 border-white/20">
                        {/* <Download className="w-5 h-5" /> */}
                        Get Desktop App
                    </button>
                </motion.div>
            </div>
        </section>
    );
};
