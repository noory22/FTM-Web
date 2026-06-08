import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const SafetyAlert = ({ children }) => {
    const [emergencyActive, setEmergencyActive] = useState(false);
    const [powerActive, setPowerActive] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        // Initial check
        const checkStatus = async () => {
            try {
                const emerStatus = await window.api.checkEmergencyStatus();
                setEmergencyActive(emerStatus.active);
                const powStatus = await window.api.checkPowerStatus();
                setPowerActive(powStatus.active);
            } catch (error) {
                console.error('Failed to check initial status:', error);
            }
        };
        checkStatus();

        const handleEmergencyStatus = (event) => {
            setEmergencyActive(event.detail === true);
        };

        const handlePowerStatus = (event) => {
            setPowerActive(event.detail === true);
        };

        window.addEventListener('emergency-status-change', handleEmergencyStatus);
        window.addEventListener('power-status-change', handlePowerStatus);
        return () => {
            window.removeEventListener('emergency-status-change', handleEmergencyStatus);
            window.removeEventListener('power-status-change', handlePowerStatus);
        };
    }, []);

    const isHome = location.pathname === '/';

    // Only show the blocking prompt if NOT on MainMenu
    const showPrompt = (emergencyActive || !powerActive) && !isHome;
    const isPowerStop = !powerActive;

    const handleBackToMenu = () => {
        navigate('/');
    };

    const handleExitApp = () => {
        window.close(); // Or a custom IPC if needed
    };

    return (
        <>
            {children}
            {showPrompt && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 border-t-8 border-red-600 animate-in fade-in zoom-in duration-300">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6 animate-pulse">
                                <svg className="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>

                            <h2 className="text-3xl font-bold text-slate-900 mb-2">
                                {isPowerStop ? "Power Stop" : "Emergency Stop"}
                            </h2>
                            <p className="text-slate-600 text-lg mb-8">
                                {isPowerStop
                                    ? "The button power is pressed. All processes have been stopped."
                                    : "The emergency button is pressed. All processes have been stopped for your safety."}
                            </p>

                            <div className="grid grid-cols-2 gap-4 w-full">
                                <button
                                    onClick={handleBackToMenu}
                                    className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors duration-200"
                                >
                                    Back to Menu
                                </button>
                                <button
                                    onClick={handleExitApp}
                                    className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors duration-200"
                                >
                                    Exit App
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default SafetyAlert;
