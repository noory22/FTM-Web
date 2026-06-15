import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Power, Usb, Move, TrendingUp, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, AlertTriangle } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

import clampIcon from "./assets/Clamp.png";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const Manual = () => {
  const navigate = useNavigate();
  const streamRef = useRef(null);
  const movementTimeoutRef = useRef(null);
  const probeIntervalRef = useRef(null);

  const [force, setForce] = useState('--');
  const [probeDistance, setProbeDistance] = useState('--');
  const [catheterDistance, setCatheterDistance] = useState('--');

  const [graphData, setGraphData] = useState([]);
  const forwardData = graphData.filter(p => p.direction === 'forward');
  const backwardData = graphData.filter(p => p.direction === 'backward');

  const [clamp, setClamp] = useState(false);
  const [probeDown, setProbeDown] = useState(false);
  const [probeUp, setProbeUp] = useState(false);
  const [catheterForward, setCatheterForward] = useState(false);
  const [catheterBack, setCatheterBack] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState({
    connected: false,
    port: '--',
    lastCheck: null,
  });
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [showConnectionError, setShowConnectionError] = useState(false);
  const [manualModeActive, setManualModeActive] = useState(false);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0,0,0,0.7)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#3b82f6',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        displayColors: false,
        callbacks: {
          label: ctx => `Force: ${ctx.parsed.y.toFixed(2)} mN`,
          title: ctx => `Probe Dist: ${ctx[0].parsed.x.toFixed(2)} mm`,
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        title: {
          display: true,
          text: 'Probe Distance (mm)',
          color: '#6b7280',
          font: { size: 12, weight: 'bold' },
        },
        grid: { color: 'rgba(229,231,235,0.5)' },
        ticks: { color: '#6b7280', font: { size: 11 }, maxTicksLimit: 10 },
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: 'Force (mN)',
          color: '#6b7280',
          font: { size: 12, weight: 'bold' },
        },
        grid: { color: 'rgba(229,231,235,0.5)' },
        ticks: { color: '#6b7280', font: { size: 11 }, maxTicksLimit: 8 },
      },
    },
    elements: {
      line: { tension: 0, borderWidth: 2.5, fill: false },
      point: { radius: 0, hoverRadius: 5 },
    },
  };

  const chartConfig = {
    datasets: [
      {
        label: 'Probe Down',
        data: forwardData.map(p => ({ x: p.probeDistance, y: p.force })),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        fill: false,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#3b82f6',
      },
      {
        label: 'Probe Up',
        data: backwardData.map(p => ({ x: p.probeDistance, y: p.force })),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.1)',
        fill: false,
        pointBackgroundColor: '#ef4444',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#ef4444',
      },
    ],
  };

  // Activate Manual Mode on component mount
  useEffect(() => {
    const activateManualMode = async () => {
      if (connectionStatus.connected && !emergencyActive) {
        try {
          const result = await window.api.manualModeActivate();
          if (result.success) {
            setManualModeActive(true);
            console.log("Manual mode activated");
          }
        } catch (error) {
          console.error("Failed to activate manual mode:", error);
        }
      }
    };

    activateManualMode();

    // Deactivate manual mode on component unmount
    return () => {
      const deactivateManualMode = async () => {
        try {
          if (probeIntervalRef.current) {
            clearInterval(probeIntervalRef.current);
          }
          if (movementTimeoutRef.current) {
            clearTimeout(movementTimeoutRef.current);
          }
          await window.api.manualModeDeactivate();
          setManualModeActive(false);
          console.log("Manual mode deactivated");
        } catch (error) {
          console.error("Failed to deactivate manual mode:", error);
        }
      };
      deactivateManualMode();
    };
  }, [connectionStatus.connected, emergencyActive]);

  const resetLiveValues = () => {
    setForce('--');
    setProbeDistance('--');
    setCatheterDistance('--');
    setClamp(false);
    setProbeDown(false);
    setProbeUp(false);
    setCatheterForward(false);
    setCatheterBack(false);
  };

  // Handle Probe Down with continuous movement
  const handleProbeDownStart = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;

    // Clear any existing timeouts/intervals
    if (movementTimeoutRef.current) {
      clearTimeout(movementTimeoutRef.current);
    }
    if (probeIntervalRef.current) {
      clearInterval(probeIntervalRef.current);
    }

    try {
      // Send probe down command (M5)
      const result = await window.api.probeDown();
      if (result.success) {
        setProbeDown(true);
        setProbeUp(false);

        // Set interval to continuously send command while holding
        probeIntervalRef.current = setInterval(async () => {
          if (probeDown) {
            await window.api.probeDown();
          }
        }, 500);

        // Auto-stop after 5 seconds for safety
        movementTimeoutRef.current = setTimeout(async () => {
          await handleProbeStop();
        }, 5000);
      }
    } catch (error) {
      console.error("Probe down error:", error);
    }
  };

  // Handle Probe Up with continuous movement
  const handleProbeUpStart = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;

    // Clear any existing timeouts/intervals
    if (movementTimeoutRef.current) {
      clearTimeout(movementTimeoutRef.current);
    }
    if (probeIntervalRef.current) {
      clearInterval(probeIntervalRef.current);
    }

    try {
      // Send probe up command (M4)
      const result = await window.api.probeUp();
      if (result.success) {
        setProbeUp(true);
        setProbeDown(false);

        // Set interval to continuously send command while holding
        probeIntervalRef.current = setInterval(async () => {
          if (probeUp) {
            await window.api.probeUp();
          }
        }, 500);

        // Auto-stop after 5 seconds for safety
        movementTimeoutRef.current = setTimeout(async () => {
          await handleProbeStop();
        }, 5000);
      }
    } catch (error) {
      console.error("Probe up error:", error);
    }
  };

  // Handle Probe Stop
  const handleProbeStop = async () => {
    if (movementTimeoutRef.current) {
      clearTimeout(movementTimeoutRef.current);
    }
    if (probeIntervalRef.current) {
      clearInterval(probeIntervalRef.current);
      probeIntervalRef.current = null;
    }

    try {
      await window.api.probeStop();
      setProbeDown(false);
      setProbeUp(false);
    } catch (error) {
      console.error("Probe stop error:", error);
    }
  };

  // Handle Clamp Toggle (M3)
  const handleClampToggle = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;

    try {
      const newState = !clamp;
      const result = await window.api.clampControl(newState);
      if (result.success) {
        setClamp(result.clampState);
      }
    } catch (error) {
      console.error("Clamp toggle error:", error);
    }
  };

  // Handle Catheter Forward (M6)
  const handleCatheterForward = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;

    try {
      const result = await window.api.catheterForward();
      if (result.success) {
        setCatheterForward(true);
        setTimeout(() => setCatheterForward(false), 2000);
      }
    } catch (error) {
      console.error("Catheter forward error:", error);
    }
  };

  // Handle Catheter Backward (M7)
  const handleCatheterBackward = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;

    try {
      const result = await window.api.catheterBackward();
      if (result.success) {
        setCatheterBack(true);
        setTimeout(() => setCatheterBack(false), 2000);
      }
    } catch (error) {
      console.error("Catheter backward error:", error);
    }
  };

  useEffect(() => {
    const checkConnection = () => {
      window.api.checkConnection()
        .then(status => {
          setConnectionStatus({
            connected: status.connected,
            port: status.port || '--',
            lastCheck: status.timestamp,
          });
          if (!status.connected) {
            setShowConnectionError(true);
            resetLiveValues();
            setManualModeActive(false);
          }
        })
        .catch(() => {
          setConnectionStatus({ connected: false, port: '--', lastCheck: new Date().toISOString() });
          setShowConnectionError(true);
          resetLiveValues();
          setManualModeActive(false);
        });
    };

    checkConnection();
    const connInterval = setInterval(checkConnection, 5000);

    const handleModbusStatus = (e) => {
      const connected = e.detail === 'connected';
      setConnectionStatus(prev => ({ ...prev, connected }));
      if (!connected) {
        setShowConnectionError(true);
        resetLiveValues();
        setManualModeActive(false);
      } else {
        setShowConnectionError(false);
      }
    };
    window.addEventListener('modbus-status-change', handleModbusStatus);

    const handleEmergency = (e) => setEmergencyActive(Boolean(e.detail));
    window.addEventListener('emergency-status-change', handleEmergency);

    window.api.checkEmergencyStatus()
      .then(s => setEmergencyActive(Boolean(s.active)))
      .catch(() => { });

    return () => {
      clearInterval(connInterval);
      window.removeEventListener('modbus-status-change', handleModbusStatus);
      window.removeEventListener('emergency-status-change', handleEmergency);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (movementTimeoutRef.current) clearTimeout(movementTimeoutRef.current);
      if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const readData = () => {
      window.api.readData()
        .then(data => {
          if (data.success) {
            // Force from REG_FORCE (R54) — 32-bit float
            const f = Number(data.force_mN);
            setForce(isFinite(f) ? f.toFixed(2) : '--');

            // Probe Distance from REG_DISTANCE (R70)
            const pd = Number(data.distance);
            setProbeDistance(isFinite(pd) ? pd : '--');

            // Catheter Distance from REG_MANUAL_DISTANCE (6550)
            const cd = Number(data.catheterDistance);
            setCatheterDistance(isFinite(cd) ? cd : '--');

            // Update coil indicator states from PLC feedback
            if (data.clamp !== undefined) setClamp(Boolean(data.clamp));
            if (data.probeUp !== undefined) setProbeUp(Boolean(data.probeUp));
            if (data.probeDown !== undefined) setProbeDown(Boolean(data.probeDown));
            if (data.catheterForward !== undefined) setCatheterForward(Boolean(data.catheterForward));
            if (data.catheterBack !== undefined) setCatheterBack(Boolean(data.catheterBack));

            // Update graph: x = probe distance, y = force
            setGraphData(prev => {
              const x = Number(data.distance);
              const y = Number(data.force_mN);
              if (isNaN(x) || isNaN(y)) return prev;

              let direction = 'forward';
              if (prev.length > 0) {
                const lastX = prev[prev.length - 1].probeDistance;
                direction = x < lastX ? 'backward' : 'forward';
              }

              const updated = [...prev, { probeDistance: x, force: y, direction }];
              return updated.length > 200 ? updated.slice(updated.length - 200) : updated;
            });

          } else {
            resetLiveValues();
          }
        })
        .catch(() => resetLiveValues());
    };

    let intervalId;
    if (connectionStatus.connected && !emergencyActive) {
      readData();
      intervalId = setInterval(readData, 500);
    }
    return () => { if (intervalId) clearInterval(intervalId); };
  }, [connectionStatus.connected, emergencyActive]);

  const handleReconnect = async () => {
    try {
      const result = await window.api.reconnect();
      if (result.success && result.connected) {
        setShowConnectionError(false);
        setConnectionStatus(prev => ({ ...prev, connected: true }));
        // Reactivate manual mode
        const manualResult = await window.api.manualModeActivate();
        if (manualResult.success) {
          setManualModeActive(true);
        }
      }
    } catch (e) {
      console.error('Reconnect error:', e);
    }
  };

  const circleClass = (active, activeColor) =>
    `relative w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 flex items-center justify-center transition-all duration-300 shadow-lg ${active ? `${activeColor} text-white` : 'bg-white border-slate-300 text-slate-400'} ${(!connectionStatus.connected || emergencyActive || !manualModeActive) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-slate-400'}`;

  const statusBadge = (active, activeClasses, inactiveClasses, activeLabel, inactiveLabel) => (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${active ? activeClasses : inactiveClasses}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${active ? 'animate-pulse' : ''}`} />
      {active ? activeLabel : inactiveLabel}
    </span>
  );

  // Check if controls should be enabled
  const controlsEnabled = connectionStatus.connected && !emergencyActive && manualModeActive;



  const handleBackButton = async () => {
    try {
      console.log('Deactivating manual mode before leaving...');
      // Call the deactivation API
      await window.api.deactivateManual();
      console.log('Manual mode deactivated successfully');
    } catch (error) {
      console.error('Failed to deactivate manual mode:', error);
    } finally {
      // Navigate back to main menu regardless of deactivation success/failure
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-6">
      <div className="w-full mx-auto">

        {/* ══════════════ HEADER ══════════════ */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-end gap-4 mb-6 md:mb-8">

          {/* <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {emergencyActive && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 text-red-700 border border-red-300 animate-pulse">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-semibold">EMERGENCY</span>
              </div>
            )}

            {manualModeActive && controlsEnabled && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 border border-green-300">
                <span className="text-sm font-semibold">MANUAL MODE ACTIVE</span>
              </div>
            )}

            <div className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg ${connectionStatus.connected ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
              <Usb className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm font-medium">
                {connectionStatus.connected ? 'USB Connected' : 'USB Disconnected'}
              </span>
            </div>

            {!connectionStatus.connected && (
              <button
                onClick={handleReconnect}
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Reconnect
              </button>
            )}

            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to exit?')) window.close();
              }}
              className="group bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl lg:rounded-2xl w-8 h-8 sm:w-12 sm:h-12 lg:w-14 lg:h-14 flex items-center justify-center transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-xl border border-red-400/30 shrink-0"
            >
              <Power className="w-3 h-3 sm:w-5 sm:h-5 lg:w-6 lg:h-6 group-hover:scale-110 transition-transform duration-300" />
            </button>
          </div> */}
        </div>

        {/* ══════════════ MAIN GRID ══════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 items-start">

          {/* ══════════ LEFT: Graph + Live Data ══════════ */}
          <div className="flex flex-col w-full space-y-4 md:space-y-6 min-w-0">

            {/* Graph card */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
              <div className="p-4 md:p-6">

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 md:mb-6">
                  <div className="flex items-center space-x-2 md:space-x-3">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg shadow-sm">
                      <TrendingUp className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-slate-800">Probe Distance vs Force</h3>
                      <p className="text-slate-500 text-xs font-medium">Real-time analysis</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 sm:space-x-5 bg-slate-50/50 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border border-slate-100 shadow-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-1 bg-blue-500 rounded-full" />
                      <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Probe Down</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-1 bg-red-500 rounded-full" />
                      <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Probe Up</span>
                    </div>
                  </div>
                </div>

                <div className="w-full" style={{ height: '320px' }}>
                  <Line data={chartConfig} options={chartOptions} redraw={false} />
                </div>
              </div>
            </div>

            {/* Live Data card */}
            <div className="bg-white rounded-xl md:rounded-2xl shadow-xl border border-slate-200 p-4 md:p-6">
              <div className="grid grid-cols-3 gap-3 md:gap-6">

                {/* Force - R54 */}
                <div className="flex items-center space-x-3 bg-slate-50 p-3 md:p-5 rounded-xl border border-slate-100">
                  <div className="p-2 md:p-3 bg-blue-100 rounded-xl shrink-0">
                    <svg className="w-5 h-5 md:w-6 md:h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-slate-500 text-xs font-medium mb-0.5 truncate">Force (R54)</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-slate-800 font-bold text-lg md:text-2xl">
                        {force === '--' ? '--' : `${parseFloat(force).toFixed(2)}`}
                      </span>
                      <span className="text-slate-400 text-xs">mN</span>
                    </div>
                  </div>
                </div>

                {/* Probe Distance - R70 */}
                <div className="flex items-center space-x-3 bg-slate-50 p-3 md:p-5 rounded-xl border border-slate-100">
                  <div className="p-2 md:p-3 bg-blue-100 rounded-xl shrink-0">
                    <ChevronDown className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-slate-500 text-xs font-medium mb-0.5 truncate">Probe Dist. (R70)</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-slate-800 font-bold text-lg md:text-2xl">
                        {probeDistance === '--' ? '--' : `${probeDistance}`}
                      </span>
                      <span className="text-slate-400 text-xs">mm</span>
                    </div>
                  </div>
                </div>

                {/* Catheter Distance - 6550 */}
                <div className="flex items-center space-x-3 bg-slate-50 p-3 md:p-5 rounded-xl border border-slate-100">
                  <div className="p-2 md:p-3 bg-emerald-100 rounded-xl shrink-0">
                    <Move className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-slate-500 text-xs font-medium mb-0.5 truncate">Catheter Dist. (6550)</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-slate-800 font-bold text-lg md:text-2xl">
                        {catheterDistance === '--' ? '--' : `${catheterDistance}`}
                      </span>
                      <span className="text-slate-400 text-xs">mm</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
          {/* end left column */}

          {/* ══════════ RIGHT: [Probe | Clamp] + Catheter ══════════ */}
          <div className="flex flex-col gap-4 md:gap-6 w-full">

            {/* Top row: Probe + Clamp side by side */}
            <div className="flex gap-4 md:gap-6">

              {/* Probe card */}
              <div className="bg-white rounded-xl md:rounded-2xl shadow-xl border border-slate-200 p-4 md:p-6 flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-800 mb-1 text-center">Probe</h3>
                <p className="text-[10px] text-slate-400 italic mb-4 text-center">
                  Status Indicators
                </p>

                <div className="flex flex-col items-center gap-5">

                  {/* Probe Up - M4 */}
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className={circleClass(probeUp, 'bg-red-500 border-red-600')}
                    >
                      <ChevronUp className="w-7 h-7 sm:w-8 sm:h-8" />
                      {probeUp && (
                        <div className="absolute -inset-1 bg-red-500 rounded-full animate-ping opacity-30 pointer-events-none" />
                      )}
                    </div>
                    <span className="text-xs font-medium text-slate-600">Probe Up (M4)</span>
                  </div>

                  <div className="w-full border-t border-slate-100" />

                  {/* Probe Down - M5 */}
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className={circleClass(probeDown, 'bg-blue-500 border-blue-600')}
                    >
                      <ChevronDown className="w-7 h-7 sm:w-8 sm:h-8" />
                      {probeDown && (
                        <div className="absolute -inset-1 bg-blue-500 rounded-full animate-ping opacity-30 pointer-events-none" />
                      )}
                    </div>
                    <span className="text-xs font-medium text-slate-600">Probe Down (M5)</span>
                  </div>

                </div>
              </div>
              {/* end Probe card */}

              {/* Clamp card */}
              <div className="bg-white rounded-xl md:rounded-2xl shadow-xl border border-slate-200 p-4 md:p-6 flex-1 min-w-0">
                <h3 className="text-base font-semibold text-slate-800 mb-1 text-center">Clamp</h3>
                <p className="text-[10px] text-slate-400 italic mb-4 text-center">Coil 2003 (M3)</p>

                <div className="flex justify-center">
                  <div
                    className={circleClass(clamp, 'bg-purple-500 border-purple-600')}
                  >
                    <img
                      src={clampIcon}
                      alt="Clamp"
                      className="w-8 h-8 sm:w-10 sm:h-10 object-contain"
                      style={{ filter: clamp ? 'brightness(0) invert(1)' : 'none' }}
                    />
                    {clamp && (
                      <div className="absolute -inset-1 bg-purple-500 rounded-full animate-ping opacity-30 pointer-events-none" />
                    )}
                  </div>
                </div>

                <div className="mt-4 flex justify-center">
                  {statusBadge(clamp, 'bg-purple-100 text-purple-700', 'bg-slate-100 text-slate-500', 'CLAMPED', 'UNCLAMPED')}
                </div>
              </div>
              {/* end Clamp card */}

            </div>
            {/* end top row */}

            {/* Catheter card — full width below */}
            <div className="bg-white rounded-xl md:rounded-2xl shadow-xl border border-slate-200 p-4 md:p-6">
              <h3 className="text-base font-semibold text-slate-800 mb-1 text-center">Catheter</h3>
              <p className="text-[10px] text-slate-400 italic mb-4 text-center">
                Status Indicators
              </p>

              <div className="flex items-start justify-around gap-4">

                {/* Catheter Forward - M7 */}
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={circleClass(catheterForward, 'bg-green-500 border-green-600')}
                  >
                    <ChevronLeft className="w-7 h-7 sm:w-8 sm:h-8" />
                    {catheterForward && (
                      <div className="absolute -inset-1 bg-green-500 rounded-full animate-ping opacity-30 pointer-events-none" />
                    )}
                  </div>
                  <span className="text-xs font-medium text-slate-600">Forward (M7)</span>
                </div>

                <div className="self-center w-px h-20 bg-slate-100" />

                {/* Catheter Backward - M6 */}
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={circleClass(catheterBack, 'bg-amber-500 border-amber-600')}
                  >
                    <ChevronRight className="w-7 h-7 sm:w-8 sm:h-8" />
                    {catheterBack && (
                      <div className="absolute -inset-1 bg-amber-500 rounded-full animate-ping opacity-30 pointer-events-none" />
                    )}
                  </div>
                  <span className="text-xs font-medium text-slate-600">Backward (M6)</span>
                </div>

              </div>
            </div>
            {/* end Catheter card */}

          </div>
          {/* end right column */}

        </div>
        {/* end main grid */}

        {/* Controls disabled message */}
        {(!controlsEnabled && connectionStatus.connected && !emergencyActive) && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
            <p className="text-sm text-yellow-800">
              Waiting for manual mode activation... Please ensure connection is stable.
            </p>
          </div>
        )}

      </div>
    </div>
  );
};

export default Manual;