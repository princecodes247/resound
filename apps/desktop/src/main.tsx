import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import TrayApp from './TrayApp.tsx'
import './index.css'
import { getCurrentWindow } from '@tauri-apps/api/window'

function Root() {
    const [isTray, setIsTray] = React.useState<boolean | null>(null);

    React.useEffect(() => {
        try {
            const appWindow = getCurrentWindow();
            setIsTray(appWindow.label === 'tray');
        } catch (e) {
            console.error("Failed to get window label", e);
            setIsTray(false);
        }
    }, []);

    if (isTray === null) return null; // Or a splash screen

    return (
        <React.StrictMode>
            {isTray ? <TrayApp /> : <App />}
        </React.StrictMode>
    );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
