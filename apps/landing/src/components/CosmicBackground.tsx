'use client';

export const CosmicBackground = () => (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="cosmic-bg" />
        <div className="starfield" />

        {/* Animated Blobs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-aurora-purple/20 rounded-full blur-[120px] animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-aurora-cyan/15 rounded-full blur-[100px] animate-pulse-slow animation-delay-2000" />

        {/* Central Breathe */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-aurora-pink/10 rounded-full blur-[150px] animate-breathe" />

        {/* Decorative Rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-white/2 rounded-full animate-spin-slow" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-white/3 rounded-full animate-spin-slow animation-delay-2000" style={{ animationDirection: 'reverse' }} />
    </div>
);

