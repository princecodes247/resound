# Resound - LAN Audio Streaming

A cross-platform audio streaming application built with **Tauri** (Rust + React/TypeScript). Resound captures system audio on a **Host** device and streams it to multiple **Receiver** devices over your local area network (LAN) using **WebRTC (Opus)** for low-latency delivery.

## Key Features

- **Real-time Audio Streaming**: Ultra-low-latency streaming over LAN.
- **Easy Discovery**: Receivers automatically find the Host via mDNS.
- **System Audio Capture**: Transmits your system's audio output (e.g., music, browser audio) to receivers.
- **Adjustable Controls**: Output gain/boost controls for the monitor and remote receivers.
- **Cross-Platform**: Built with Tauri for native performance on macOS (Windows and Linux support planned).
- **Tray Menu Integration**: Quick access to sharing and joining a broadcast via a dedicated menu bar tray.

## Architecture

Resound consists of a **Tauri** application with a unified Rust backend and a lightweight React/TypeScript frontend.

### Backend (Rust)
- **Tauri**: Provides the desktop application framework, native windowing, and tray integration.
- **Axum**: Runs an internal WebSocket server for WebRTC signaling (offers, answers, ICE candidates).
- **mDNS (mdns-sd)**: Handles service discovery, advertising the Host's signaling server as `_resound-audio._tcp.local.`.
- **System Audio Capture (macOS Focus)**: Uses `coreaudio` to capture output from a specific aggregate device.

### Frontend (React + TypeScript + Tailwind)
- Handled by Vite and built to the `dist/` directory.
- Captures system and mic audio via native WebRTC peer connections using the signaling relay provided by the Rust backend.
- Provides a clean, dynamic, and modern interface for Host controls (boost adjustments) and Receiver management.

## Prerequisites

- **Rust**: [Install Rust](https://www.rust-lang.org/tools/install) (latest stable).
- **Node.js / npm**: Required for running the frontend and Tauri CLI.
- **System Dependencies**: See the [Tauri setup guide](https://tauri.app/start/prerequisites/) for your operating system.
- **macOS Audio Setup**: Since Resound natively captures system audio on macOS via loopback, you must manually create an **Aggregate Device**. (See details below).

### System Audio Capture Requirements (macOS)
To broadcast system audio on macOS natively, Resound requires a virtual audio loopback device like **BlackHole** and a manually created **Aggregate Device** named `resound audio`.

1. **Install BlackHole**:
   - Download and install [BlackHole 2ch](https://existential.audio/blackhole/). (Or install via Homebrew: `brew install blackhole-2ch`).

2. **Create the Aggregate Device**:
   - Open **Audio MIDI Setup** (located in `/System/Applications/Utilities/`).
   - Click the **+** button in the bottom left corner and select **Create Aggregate Device**.
   - Double-click the newly created device name and rename it exactly to **`resound audio`**.
   - In the subdevice list on the right, check the box for your **Default Output Device** (e.g., *MacBook Pro Speakers* or *External Headphones*).
   - Check the box for **BlackHole 2ch**.
   - Ensure the "Clock Source" (Master) is set to your primary output device, and enable **Drift Correction** for BlackHole.

*Note: Once created, Resound will look for the `resound audio` aggregate device and BlackHole respectively to properly capture and monitor audio without feedback loops. If this is missing, initialization may fail or system audio capture will not work.*

## Getting Started

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd resound
    ```

2.  Install the NPM dependencies:
    ```bash
    npm install
    ```

### Development Mode

Run the following command to start both the Vite development server and the Tauri application automatically:
```bash
npm run dev
# Or start via cargo directly: `cargo tauri dev`
```

### Building for Production

To create a production build (optimized binary and bundle):
```bash
npm run build
# Then build Tauri: `cargo tauri build`
```
The output will be located in `src-tauri/target/release/bundle/`.

## Usage

### As a Host
1. Set your system output device to the **`resound audio`** aggregate device.
2. Launch the application.
3. Click **"Start Host"**.
4. Grant permissions if prompted. 
5. The system audio playing to your `resound audio` stream will automatically broadcast to connected receivers.
6. You can adjust the stream and local monitor boost/gain in the Host dashboard.

### As a Receiver
1. Launch the application on another device connected to the same LAN.
2. Click **"Discover Hosts"** to populate the list via mDNS.
3. Select the desired host from the dropdown.
4. Click **"Connect & Play"**.

---
*Note: This project is an MVP and requires both devices to be on the same local network for mDNS discovery and WebRTC streaming.*
