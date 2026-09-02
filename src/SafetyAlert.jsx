import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const SAFETY_DIALOG_ROUTES = new Set([
  '/manual-mode',
  '/load-config/2-point',
  '/load-config/3-point',
  '/process-mode/2-point',
  '/process-mode/3-point',
]);

const applySafetyFromReadData = (data, setEmergencyActive, setPowerActive) => {
  if (!data?.success) return;
  if (data.emergencyActive !== undefined) {
    setEmergencyActive(Boolean(data.emergencyActive));
  }
  if (data.powerActive !== undefined) {
    setPowerActive(Boolean(data.powerActive));
  }
};

const SafetyAlert = ({ children }) => {
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [powerActive, setPowerActive] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [statusChecked, setStatusChecked] = useState(false);
  const [promptPhase, setPromptPhase] = useState(null);
  const [triggerType, setTriggerType] = useState(null);
  const promptPhaseRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    promptPhaseRef.current = promptPhase;
  }, [promptPhase]);

  const syncSafetyStatus = useCallback(async () => {
    try {
      const [connection, emerStatus, powStatus, readData] = await Promise.all([
        window.api?.checkConnection?.(),
        window.api?.checkEmergencyStatus?.(),
        window.api?.checkPowerStatus?.(),
        window.api?.readData?.(),
      ]);

      setIsConnected(Boolean(connection?.connected));

      if (readData?.success) {
        applySafetyFromReadData(readData, setEmergencyActive, setPowerActive);
      } else {
        setEmergencyActive(Boolean(emerStatus?.active));
        setPowerActive(Boolean(powStatus?.active));
      }

      setStatusChecked(true);
    } catch (error) {
      console.error('Failed to check safety status:', error);
      setStatusChecked(true);
    }
  }, []);

  useEffect(() => {
    syncSafetyStatus();

    const handleEmergencyStatus = (event) => {
      setEmergencyActive(event.detail === true);
    };

    const handlePowerStatus = (event) => {
      setPowerActive(event.detail === true);
    };

    const handleModbusStatus = (event) => {
      const connected = event.detail === 'connected';
      setIsConnected(connected);
      if (connected) {
        syncSafetyStatus();
      }
    };

    window.addEventListener('emergency-status-change', handleEmergencyStatus);
    window.addEventListener('power-status-change', handlePowerStatus);
    window.addEventListener('modbus-status-change', handleModbusStatus);

    return () => {
      window.removeEventListener('emergency-status-change', handleEmergencyStatus);
      window.removeEventListener('power-status-change', handlePowerStatus);
      window.removeEventListener('modbus-status-change', handleModbusStatus);
    };
  }, [syncSafetyStatus]);

  useEffect(() => {
    if (!isConnected) return undefined;

    let cancelled = false;

    const pollSafetyFromPlc = async () => {
      try {
        const data = await window.api.readData();
        if (cancelled) return;
        applySafetyFromReadData(data, setEmergencyActive, setPowerActive);
      } catch (error) {
        console.error('Safety poll error:', error);
      }
    };

    pollSafetyFromPlc();
    const intervalId = setInterval(pollSafetyFromPlc, 250);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [isConnected]);

  const isSafetyRoute = SAFETY_DIALOG_ROUTES.has(location.pathname);
  const safetyActive = emergencyActive || (isConnected && !powerActive);
  const currentTriggerType = emergencyActive ? 'emergency' : 'power';

  useEffect(() => {
    if (!isSafetyRoute) {
      setPromptPhase(null);
      setTriggerType(null);
      return;
    }

    if (emergencyActive) {
      // Auto-navigation directly to Dashboard is handled by AppShell
      setPromptPhase(null);
      setTriggerType(null);
      return;
    }

    if (isConnected && !powerActive) {
      setPromptPhase('active');
      setTriggerType('power');
      return;
    }

    if (promptPhaseRef.current === 'active') {
      setPromptPhase('cleared');
    }
  }, [isSafetyRoute, emergencyActive, isConnected, powerActive]);

  const showPrompt = statusChecked && isSafetyRoute && promptPhase !== null;
  const isClearedPhase = promptPhase === 'cleared';
  const isPowerStop = triggerType === 'power';

  const handleMainMenu = () => {
    setPromptPhase(null);
    setTriggerType(null);
    navigate('/main-menu');
  };

  const handleExitApp = () => {
    window.close();
  };

  return (
    <>
      {children}
      {showPrompt && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div
            className={`bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 border-t-8 animate-in fade-in zoom-in duration-300 ${
              isClearedPhase ? 'border-green-600' : 'border-red-600'
            }`}
          >
            <div className="flex flex-col items-center text-center">
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
                  isClearedPhase
                    ? 'bg-green-100'
                    : 'bg-red-100 animate-pulse'
                }`}
              >
                {isClearedPhase ? (
                  <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
              </div>

              <h2 className="text-3xl font-bold text-slate-900 mb-2">
                {isClearedPhase
                  ? 'Machine Ready'
                  : isPowerStop
                    ? 'Power Stop'
                    : 'Emergency Stop'}
              </h2>
              <p className="text-slate-600 text-lg mb-8">
                {isClearedPhase
                  ? 'Return to the main menu to perform Operation.'
                  : isPowerStop
                    ? 'The button power is pressed. All processes have been stopped.'
                    : 'The emergency button is pressed. All processes have been stopped for your safety.'}
              </p>

              {isClearedPhase ? (
                <button
                  onClick={handleMainMenu}
                  className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors duration-200"
                >
                  Dashboard
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-4 w-full">
                  <button
                    onClick={handleMainMenu}
                    className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors duration-200"
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={handleExitApp}
                    className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors duration-200"
                  >
                    Exit App
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SafetyAlert;
