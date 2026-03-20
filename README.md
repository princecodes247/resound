# Resound - LAN Audio Streaming

A cross-platform audio streaming application built with **Tauri** (Rust + HTML/JS). Resound captures system audio on a **Host** device and streams it to multiple **Receiver** devices over your local area network (LAN) using **WebRTC (Opus)** for low-latency delivery.

## Key Features

- **Real-time Audio Streaming**: Ultra-low-latency streaming over LAN.
- **Easy Discovery**: Receivers automatically find the Host via mDNS.
- **Cross-Platform**: Built with Tauri for native performance on macOS, Windows, and Linux.
- **No Configuration Required**: Minimal setup, just start the host and connect.

## Architecture

Resound consists of a **Tauri** application with a unified Rust backend and a lightweight HTML/JS frontend.

### Backend (Rust)
- **Tauri**: Provides the desktop application framework and native windowing.
- **Axum**: Runs an internal WebSocket server for WebRTC signaling (offers, answers, ICE candidates).
- **mDNS (mdns-sd)**: Handles service discovery, advertising the Host's signaling server as `_resound-audio._tcp.local.`.
- **Custom Commands**: Exposes functions like `start_host` and `discover_hosts` to the frontend.

### Frontend (HTML/JS)
- Located in the `dist/` directory.
- Captures system/display audio via `getDisplayMedia({ audio: true })`.
- Implements WebRTC peer connections using the signaling relay provided by the Rust backend.

## Prerequisites

- **Rust**: [Install Rust](https://www.rust-lang.org/tools/install) (latest stable).
- **Node.js / npm**: Required for running the Tauri CLI.
- **System Dependencies**: See the [Tauri setup guide](https://tauri.app/start/prerequisites/) for your operating system.

## Getting Started

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd resound
    ```

2.  Install the Tauri CLI (if not already installed):
    ```bash
    cargo install tauri-cli
    ```

### Development Mode

Run the following command to start the application in development mode:
```bash
cargo tauri dev
```

### Building for Production

To create a production build (optimized binary and bundle):
```bash
cargo tauri build
```
The output will be located in `src-tauri/target/release/bundle/`.

## Usage

### As a Host
1.  Launch the application.
2.  Click **"Start Host"**.
3.  Grant permission to share your screen/audio when prompted (ensure you select "Share Audio").
4.  Wait for receivers to connect.

### As a Receiver
1.  Launch the application on another device on the same LAN.
2.  Click **"Discover Hosts"**.
3.  Select the desired host from the dropdown.
4.  Click **"Connect & Play"**.

---
*Note: This is an MVP and requires both devices to be on the same local network for discovery and streaming to work.*
