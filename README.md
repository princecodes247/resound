# Resound — Ultra-Low Latency LAN Audio

Resound is a premium, high-fidelity audio streaming system built with **Rust (Tauri)** and **TypeScript (Next.js)**. It captures system audio on a **Host** and streams it with sample-aligned synchronization to multiple **Receivers** over a local network.

## 🚀 Key Features

- **Sample-Aligned Sync**: Perfect audio alignment across multiple devices using a fixed 150ms playout delay.
- **Dual-Mode Capture (macOS)**:
  - **Perfect Sync**: High-fidelity loopback via the Resound Audio aggregate driver (powered by BlackHole).
  - **Lightweight Sync (Driverless)**: Zero-configuration capture using `ScreenCaptureKit`.
- **mDNS Auto-Discovery**: Receivers instantly find hosts on the LAN without IP configuration.
- **Premium Web Client**: A mobile-responsive Next.js interface for quick, driverless receiving.
- **Live Status Feedback**: Real-time connection monitoring and "On Air" feedback.
- **Advanced Controls**: Per-client gain boost (1x to 3x) and multi-channel hardware monitoring.

## 🏗️ Technical Architecture

Resound is a modern mono-repo designed for performance and scale:

- **Desktop (`apps/desktop`)**: A Tauri v2 application (Rust/React) providing high-priority native audio capture and playback.
- **Web (`apps/web`)**: A Next.js receiver that uses the Web Audio API for browser-based playback.
- **Landing (`apps/landing`)**: A Next.js 15 + Tailwind 4 landing page with a modern "unearthly" aesthetic.
- **Backend (Rust)**:
  - **Axum**: Powers the WebSocket signaling and binary audio distribution server.
  - **CPAL**: Manages native cross-platform audio streams.
  - **mdns-sd**: Handles local network service advertisement and browsing.

For an in-depth dive into the internals, see [Implementation Details](implementation.md) and [Resound Shorts](shorts.md).

## 🛠️ Prerequisites

- **Rust**: Latest stable toolchain.
- **Node.js**: LTS version (v20+ recommended).
- **macOS Requirements**:
  - [BlackHole 2ch](https://existential.audio/blackhole/) for "Perfect Sync" mode.
  - Resound automatically attempts to create and manage the **`Resound Audio`** aggregate device.

## 🚦 Getting Started

### Installation & Development

```bash
# Clone the repo
git clone https://github.com/princecodes247/resound.git

# Install dependencies
npm install

# Start the full stack (Desktop + Landing + Web)
npm run dev
```

### Building for Production

```bash
# Production build for the desktop client
npm run build:desktop
```

## 🎧 Usage

### Broadcasting (Host)

1. Launch the Desktop app and select **"Broadcast"** mode.
2. Choose your **Sync Mode** (Perfect or Lightweight).
3. Tap the **Power** button to go "On Air".
4. Share the provided QR code or Session ID with listeners.

### Listening (Receiver)

1. Open the [Web Client](https://resound.live) or another Desktop instance.
2. The host will appear automatically in the **"Available Broadcasts"** list.
3. Tap **"Connect"** to start the synchronized audio stream.

---
*Built with ❤️ by the Resound team. Designed for musicians, gamers, and audiophiles.*
