import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import TrayApp from './TrayApp.tsx'
import './index.css'
import { getCurrentWindow } from '@tauri-apps/api/window'

const appWindow = getCurrentWindow();
const isTray = appWindow.label === 'tray';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        {isTray ? <TrayApp /> : <App />}
    </React.StrictMode>,
)
