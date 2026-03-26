import React from 'react';
import { Hero } from "@/components/Hero";
import { CosmicBackground } from "@/components/CosmicBackground";
import { Activity, Wifi, Shield, Zap, Globe, Github } from "lucide-react";

export default function Home() {
    return (
        <main className="relative min-h-screen">
            <CosmicBackground />

            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-6 border-b backdrop-blur-md bg-black/10 border-white/5">
                <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-8 h-8 italic font-bold text-black rounded-lg bg-linear-to-br from-aurora-cyan to-aurora-purple">R</div>
                    <span className="text-xl font-bold tracking-tighter text-white">Resound</span>
                </div>
                <div className="items-center hidden gap-8 text-sm font-medium md:flex text-zinc-400">
                    <a href="#features" className="transition-colors hover:text-white">Features</a>
                    <a href="#technology" className="transition-colors hover:text-white">Technology</a>
                    <a href="#open-source" className="transition-colors hover:text-white">Open Source</a>
                </div>
                <button className="px-5 py-2 text-sm font-bold text-black transition-all bg-white rounded-full hover:bg-accent hover:scale-105">
                    Download
                </button>
            </nav>

            <Hero />

            {/* Features Grid */}
            <section id="features" className="relative z-10 px-6 py-32 mx-auto max-w-7xl">
                <div className="mb-20 text-center">
                    <h2 className="mb-4 text-4xl font-bold md:text-5xl">Unmatched Performance</h2>
                    <p className="max-w-2xl mx-auto text-zinc-500">Built from the ground up for the lowest possible latency and the highest possible fidelity.</p>
                </div>

                <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                    <FeatureCard
                        Icon={Activity}
                        title="Lossless Audio"
                        description="Sample-aligned, lossless audio streaming across your entire local network."
                        color="text-aurora-cyan"
                    />
                    <FeatureCard
                        Icon={Zap}
                        title="Ultra-Low Latency"
                        description="Less than 150ms delay for perfectly synchronized multi-room playback."
                        color="text-aurora-purple"
                    />
                    <FeatureCard
                        Icon={Wifi}
                        title="Auto-Discovery"
                        description="Tauri-powered mDNS discovery finds broadcasters instantly with zero config."
                        color="text-aurora-pink"
                    />
                    <FeatureCard
                        Icon={Shield}
                        title="Private & Secure"
                        description="Your audio stays on your network. No cloud, no tracking, total privacy."
                        color="text-aurora-blue"
                    />
                    <FeatureCard
                        Icon={Globe}
                        title="Cross-Platform"
                        description="Native apps for macOS and Windows, with a lightweight web receiver."
                        color="text-stellar-white"
                    />
                    <FeatureCard
                        Icon={Github}
                        title="Open Source"
                        description="The entire stack is open source. Built with Rust, TypeScript, and love."
                        color="text-stellar-silver"
                    />
                </div>
            </section>

            {/* CTA Section */}
            <section className="relative z-10 px-6 py-32">
                <div className="max-w-4xl mx-auto glass-prism rounded-[48px] p-12 md:p-20 text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-accent/20 rounded-full blur-[100px] -mr-32 -mt-32" />
                    <h2 className="relative z-10 mb-8 text-4xl font-bold md:text-6xl">Sound better, together.</h2>
                    <p className="relative z-10 mb-12 text-lg text-zinc-400">Join thousands of users sharing high-fidelity audio seamlessly.</p>
                    <div className="relative z-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                        <button className="w-full px-10 py-5 text-lg font-bold text-white rounded-full sm:w-auto aurora-btn">Get Started Now</button>
                        <button className="w-full px-10 py-5 text-lg font-bold transition-all border rounded-full sm:w-auto border-white/10 hover:bg-white/5">View Docs</button>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="relative z-10 px-6 py-20 border-t border-white/5 bg-black/50 backdrop-blur-3xl">
                <div className="flex flex-col items-center justify-between gap-12 mx-auto max-w-7xl md:flex-row">
                    <div className="flex flex-col items-center gap-4 md:items-start">
                        <div className="flex items-center gap-2">
                            <div className="flex items-center justify-center w-8 h-8 italic font-bold text-white rounded-lg bg-white/10">R</div>
                            <span className="text-xl font-bold tracking-tighter text-white">Resound</span>
                        </div>
                        <p className="max-w-xs text-sm text-center text-zinc-500 md:text-left">Elevating your local audio experience with studio-grade streaming technology.</p>
                    </div>
                    <div className="flex gap-8 text-sm text-zinc-500">
                        <a href="#" className="transition-colors hover:text-white">Twitter</a>
                        <a href="#" className="transition-colors hover:text-white">GitHub</a>
                        <a href="#" className="transition-colors hover:text-white">Discord</a>
                    </div>
                    <p className="text-xs text-center text-zinc-600 md:text-right">© 2024 Resound Project. <br />All rights reserved.</p>
                </div>
            </footer>
        </main>
    );
}

function FeatureCard({ Icon, title, description, color }: { Icon: any, title: string, description: string, color: string }) {
    return (
        <div className="p-8 rounded-[32px] bg-white/3 border border-white/5 hover:border-white/10 transition-all hover:bg-white/5 group">
            <div className={`w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-6 ${color} group-hover:scale-110 transition-transform`}>
                <Icon size={24} />
            </div>
            <h3 className="mb-3 text-xl font-bold">{title}</h3>
            <p className="text-sm leading-relaxed text-zinc-500">{description}</p>
        </div>
    );
}
