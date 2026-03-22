export interface AudioDevice {
  name: string;
  is_loopback: boolean;
}

export interface DiscoveredHost {
  name: string;
  ip: string;
  port: number;
  session_id: string;
  sample_rate?: number;
  channels?: number;
}

export interface HostState {
  sessionId: string | null;
  signalingPort: number | null;
  status: "idle" | "starting" | "broadcasting" | "error";
  log: LogEntry[];
}

export interface ReceiverState {
  status: "idle" | "discovering" | "connecting" | "receiving" | "error";
  discoveredHosts: DiscoveredHost[];
  selectedHost: DiscoveredHost | null;
  log: LogEntry[];
}

export interface LogEntry {
  time: string;
  message: string;
}
