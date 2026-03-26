import React from 'react';
import { Hero } from "@/components/Hero";
import { CosmicBackground } from "@/components/CosmicBackground";
import { Activity, Wifi, Shield, Zap, Globe, Github } from "lucide-react";

export default function Home() {
    return (
        <main className="relative min-h-screen">
            <CosmicBackground />

            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-6 backdrop-blur-md bg-black/10 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-linear-to-br from-aurora-cyan to-aurora-purple flex items-center justify-center font-bold text-black italic">R</div>
                    <span className="text-xl font-bold tracking-tighter text-white">Resound</span>
                </div>
                <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
                    <a href="#features" className="hover:text-white transition-colors">Features</a>
                    <a href="#technology" className="hover:text-white transition-colors">Technology</a>
                    <a href="#open-source" className="hover:text-white transition-colors">Open Source</a>
                </div>
                <button className="px-5 py-2 text-sm font-bold text-black bg-white rounded-full hover:bg-accent hover:scale-105 transition-all">
                    Download
                </button>
            </nav>

            <Hero />

            {/* Features Grid */}
            <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 py-32">
                <div className="text-center mb-20">
                    <h2 className="text-4xl md:text-5xl font-bold mb-4">Unmatched Performance</h2>
                    <p className="text-zinc-500 max-w-2xl mx-auto">Built from the ground up for the lowest possible latency and the highest possible fidelity.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <FeatureCard
                        icon={React.createElement(Activity, { size: 24 } as any)}
                        title="Lossless Audio"
                        description="Sample-aligned, lossless audio streaming across your entire local network."
                        color="text-aurora-cyan"
                    />
                    <FeatureCard
                        icon={React.createElement(Zap, { size: 24 } as any)}
                        title="Ultra-Low Latency"
                        description="Less than 150ms delay for perfectly synchronized multi-room playback."
                        color="text-aurora-purple"
                    />
                    <FeatureCard
                        icon={React.createElement(Wifi, { size: 24 } as any)}
                        title="Auto-Discovery"
                        description="Tauri-powered mDNS discovery finds broadcasters instantly with zero config."
                        color="text-aurora-pink"
                    />
                    <FeatureCard
                        icon={React.createElement(Shield, { size: 24 } as any)}
                        title="Private & Secure"
                        description="Your audio stays on your network. No cloud, no tracking, total privacy."
                        color="text-aurora-blue"
                    />
                    <FeatureCard
                        icon={React.createElement(Globe, { size: 24 } as any)}
                        title="Cross-Platform"
                        description="Native apps for macOS and Windows, with a lightweight web receiver."
                        color="text-stellar-white"
                    />
                    <FeatureCard
                        icon={React.createElement(Github, { size: 24 } as any)}
                        title="Open Source"
                        description="The entire stack is open source. Built with Rust, TypeScript, and love."
                        color="text-stellar-silver"
                    />
                </div>
            </section>

            {/* CTA Section */}
            <section className="relative z-10 py-32 px-6">
                <div className="max-w-4xl mx-auto glass-prism rounded-[48px] p-12 md:p-20 text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-accent/20 rounded-full blur-[100px] -mr-32 -mt-32" />
                    <h2 className="text-4xl md:text-6xl font-bold mb-8 relative z-10">Sound better, together.</h2>
                    <p className="text-zinc-400 text-lg mb-12 relative z-10">Join thousands of users sharing high-fidelity audio seamlessly.</p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
                        <button className="w-full sm:w-auto px-10 py-5 text-lg font-bold text-white rounded-full aurora-btn">Get Started Now</button>
                        <button className="w-full sm:w-auto px-10 py-5 text-lg font-bold border border-white/10 rounded-full hover:bg-white/5 transition-all">View Docs</button>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="relative z-10 border-t border-white/5 bg-black/50 backdrop-blur-3xl py-20 px-6">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12">
                    <div className="flex flex-col items-center md:items-start gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-bold text-white italic">R</div>
                            <span className="text-xl font-bold tracking-tighter text-white">Resound</span>
                        </div>
                        <p className="text-zinc-500 text-sm max-w-xs text-center md:text-left">Elevating your local audio experience with studio-grade streaming technology.</p>
                    </div>
                    <div className="flex gap-8 text-zinc-500 text-sm">
                        <a href="#" className="hover:text-white transition-colors">Twitter</a>
                        <a href="#" className="hover:text-white transition-colors">GitHub</a>
                        <a href="#" className="hover:text-white transition-colors">Discord</a>
                    </div>
                    <p className="text-zinc-600 text-xs text-center md:text-right">© 2024 Resound Project. <br />All rights reserved.</p>
                </div>
            </footer>
        </main>
    );
}

function FeatureCard({ icon, title, description, color }: { icon: any, title: string, description: string, color: string }) {
    return (
        <div className="p-8 rounded-[32px] bg-white/3 border border-white/5 hover:border-white/10 transition-all hover:bg-white/5 group">
            <div className={`w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-6 ${color} group-hover:scale-110 transition-transform`}>
                {icon}
            </div>
            <h3 className="text-xl font-bold mb-3">{title}</h3>
            <p className="text-zinc-500 text-sm leading-relaxed">{description}</p>
        </div>
    );
}
