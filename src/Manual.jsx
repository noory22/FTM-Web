import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Power, Usb, Move, TrendingUp, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, AlertTriangle, Home, Scale, Ruler, Activity, MoveHorizontal } from 'lucide-react';
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
  const activationDoneRef = useRef(false);

  // ── Plugin refs — updated each render, read by the stable plugin ─────────────
  const pluginDistRef  = useRef(NaN);
  const pluginColorRef = useRef('#3b82f6');

  // Stable plugin object — created ONCE so react-chartjs-2 never gets ID conflicts
  const stoppedPositionPlugin = useMemo(() => ({
    id: 'manualPositionDot',
    afterDraw(chart) {
      const dist  = pluginDistRef.current;
      const color = pluginColorRef.current;
      if (isNaN(dist) || !isFinite(dist)) return;

      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.x) return;

      const xPixel = scales.x.getPixelForValue(dist);
      if (xPixel < chartArea.left || xPixel > chartArea.right) return;

      const yPixel = chartArea.bottom;
      const radius = 7;

      ctx.save();

      // White halo for contrast
      ctx.beginPath();
      ctx.arc(xPixel, yPixel, radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Coloured filled dot
      ctx.beginPath();
      ctx.arc(xPixel, yPixel, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Thin coloured border ring
      ctx.beginPath();
      ctx.arc(xPixel, yPixel, radius + 3, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []); // [] = created once, reads live data via refs

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
  const [homeActive, setHomeActive] = useState(false);
  const [tareActive, setTareActive] = useState(false);
  const [machineStatus, setMachineStatus] = useState(1); // 1=IDLE, 2=HOMING, 3=READY

  const [connectionStatus, setConnectionStatus] = useState({
    connected: false,
    port: '--',
    lastCheck: null,
  });
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [showConnectionError, setShowConnectionError] = useState(false);
  const [manualModeActive, setManualModeActive] = useState(false);

  // Track if homing was triggered by user (not auto)
  const [homingTriggered, setHomingTriggered] = useState(false);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { 
        display: true,
        position: 'top',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 20,
          font: { weight: 'bold', size: 12 },
          color: '#333'
        }
      },
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
        displayColors: true,
        callbacks: {
          label: function(context) {
            const label = context.dataset.label || '';
            const force = context.parsed.y.toFixed(2);
            return `${label}: ${force} gf`;
          },
          title: function(context) {
            const distance = context[0].parsed.x.toFixed(2);
            const direction = context[0].dataset.label || '';
            return `${direction} - Distance: ${distance} mm`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        min: 0,  // ← Add this line
        title: {
          display: true,
          text: 'Vertical Distance (mm)',
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
          text: 'Force (gf)',
          color: '#6b7280',
          font: { size: 12, weight: 'bold' },
        },
        grid: { color: 'rgba(229,231,235,0.5)' },
        ticks: { color: '#6b7280', font: { size: 11 }, maxTicksLimit: 8 },
      },
    },
    elements: {
      line: { tension: 0, fill: false },
      point: { radius: 0, hoverRadius: 5 },
    },
  };

  const chartConfig = {
    datasets: [
      {
        label: 'Probe Down ↓',
        data: forwardData.map(p => ({ x: p.probeDistance, y: p.force })),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        fill: false,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#3b82f6',
        borderWidth: probeDown ? 5 : (probeUp ? 2 : 3),
        pointRadius: (context) => {
          if (!probeDown) return 0;
          const index = context.dataIndex;
          const count = context.dataset.data.length;
          return index === count - 1 ? 6 : 3;
        },
        pointHoverRadius: 5,
        order: probeDown ? 2 : 1,
      },
      {
        label: 'Probe Up ↑',
        data: backwardData.map(p => ({ x: p.probeDistance, y: p.force })),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.1)',
        fill: false,
        pointBackgroundColor: '#ef4444',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#ef4444',
        borderWidth: probeUp ? 5 : (probeDown ? 2 : 3),
        pointRadius: (context) => {
          if (!probeUp) return 0;
          const index = context.dataIndex;
          const count = context.dataset.data.length;
          return index === count - 1 ? 6 : 3;
        },
        pointHoverRadius: 5,
        order: probeUp ? 2 : 1,
      },
    ],
  };

  const isComponentMounted = useRef(true);
  useEffect(() => {
    isComponentMounted.current = true;
    return () => {
      isComponentMounted.current = false;
    };
  }, []);

  // Activate Manual Mode on component mount - ONLY ONCE
  useEffect(() => {
    const activateManualMode = async () => {
      // Prevent multiple activations
      if (activationDoneRef.current) {
        console.log("Manual mode already activated, skipping duplicate activation");
        return;
      }
      
      if (connectionStatus.connected && !emergencyActive) {
        try {
          const result = await window.api.manualModeActivate();
          if (result.success) {
            setManualModeActive(true);
            activationDoneRef.current = true;
            console.log("✅ Manual mode activated");
          } else {
            console.error("❌ Manual mode activation failed:", result.message);
          }
        } catch (error) {
          console.error("❌ Failed to activate manual mode:", error);
        }
      }
    };

    activateManualMode();

    // Cleanup - only clear intervals, DO NOT deactivate manual mode here
    return () => {
      if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);
      if (movementTimeoutRef.current) clearTimeout(movementTimeoutRef.current);
      // ❌ DO NOT deactivate manual mode in cleanup
      // Deactivation is handled by the back button
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
    setHomeActive(false);
    setTareActive(false);
    setHomingTriggered(false);
    setMachineStatus(1);
  };

  const handleHome = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive || isAtHomePosition) return;
    // Don't allow homing if already active
    if (homeActive) return;
    
    try {
      // Set homing triggered flag
      setHomingTriggered(true);
      setHomeActive(true);
      
      const result = await window.api.home();
      if (!result.success) {
        setHomeActive(false);
        setHomingTriggered(false);
        console.error("Home command failed:", result.message);
      }
    } catch (error) {
      console.error("Home error:", error);
      setHomeActive(false);
      setHomingTriggered(false);
    }
  };

  // Listen for homing status changes from PLC
  useEffect(() => {
    const handleHomeStatus = (e) => {
      const homeState = Boolean(e.detail);
      
      // Only update if homing was triggered by user
      if (homingTriggered) {
        // If PLC turned off homing (completed), update UI
        if (!homeState) {
          console.log("Homing completed on PLC side");
          setHomeActive(false);
          setHomingTriggered(false);
        }
      } else {
        // If homing was not triggered by us, sync with PLC state
        setHomeActive(homeState);
      }
    };

    window.addEventListener('home-status-change', handleHomeStatus);

    return () => {
      window.removeEventListener('home-status-change', handleHomeStatus);
    };
  }, [homingTriggered]);

  const handleTare = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;
    if (tareActive) return;

    try {
      setTareActive(true);
      const result = await window.api.tare();
      if (result.success) {
        console.log("Tare command executed");
      } else {
        console.error("Tare command failed:", result.message);
      }
    } catch (error) {
      console.error("Tare error:", error);
    } finally {
      setTareActive(false);
    }
  };

  // Helper function to reset homing trigger when user interacts with other controls
  const resetHomingState = () => {
    // If homing was triggered and the user interacts with other controls,
    // we should allow homing to be triggered again
    if (homingTriggered) {
      console.log("User interacted with other controls, resetting homing state");
      setHomingTriggered(false);
    }
  };

  const handleProbeDownStart = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;
    if (movementTimeoutRef.current) clearTimeout(movementTimeoutRef.current);
    if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);
    
    // Reset homing trigger on user interaction
    resetHomingState();
    
    try {
      await window.api.probeDown(true);
    } catch (error) {
      console.error("Probe down error:", error);
    }
  };

  const handleProbeUpStart = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;
    if (movementTimeoutRef.current) clearTimeout(movementTimeoutRef.current);
    if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);
    
    // Reset homing trigger on user interaction
    resetHomingState();
    
    try {
      await window.api.probeUp(true);
    } catch (error) {
      console.error("Probe up error:", error);
    }
  };

  const handleProbeStop = async () => {
    if (movementTimeoutRef.current) clearTimeout(movementTimeoutRef.current);
    if (probeIntervalRef.current) {
      clearInterval(probeIntervalRef.current);
      probeIntervalRef.current = null;
    }
    try {
      await window.api.probeStop();
    } catch (error) {
      console.error("Probe stop error:", error);
    }
  };

  const handleClampToggle = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;
    
    // Reset homing trigger on user interaction
    resetHomingState();
    
    try {
      const newState = !clamp;
      await window.api.clampControl(newState);
    } catch (error) {
      console.error("Clamp toggle error:", error);
    }
  };

  const handleCatheterForwardStart = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;
    
    // Reset homing trigger on user interaction
    resetHomingState();
    
    try {
      await window.api.catheterForward(true);
    } catch (error) {
      console.error("Catheter forward error:", error);
    }
  };

  const handleCatheterForwardStop = async () => {
    try {
      await window.api.catheterForward(false);
    } catch (error) {
      console.error("Catheter forward stop error:", error);
    }
  };

  const handleCatheterBackwardStart = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;
    
    // Reset homing trigger on user interaction
    resetHomingState();
    
    try {
      await window.api.catheterBackward(true);
    } catch (error) {
      console.error("Catheter backward error:", error);
    }
  };

  const handleCatheterBackwardStop = async () => {
    try {
      await window.api.catheterBackward(false);
    } catch (error) {
      console.error("Catheter backward stop error:", error);
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
            activationDoneRef.current = false;
          }
        })
        .catch(() => {
          setConnectionStatus({ connected: false, port: '--', lastCheck: new Date().toISOString() });
          setShowConnectionError(true);
          resetLiveValues();
          setManualModeActive(false);
          activationDoneRef.current = false;
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
        activationDoneRef.current = false;
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
            // ✅ REMOVED: No manual mode re-activation logic here
            // Manual mode is activated only once when the component mounts

            const f = Number(data.force_mN);
            setForce(isFinite(f) ? f.toFixed(2) : '--');

            const pd = Number(data.distance);
            setProbeDistance(isFinite(pd) ? pd : '--');

            const cd = Number(data.catheterDistance);
            setCatheterDistance(isFinite(cd) ? cd : '--');

            if (data.clamp !== undefined) setClamp(Boolean(data.clamp));
            if (data.probeUp !== undefined) setProbeUp(Boolean(data.probeUp));
            if (data.probeDown !== undefined) setProbeDown(Boolean(data.probeDown));
            if (data.catheterForward !== undefined) setCatheterForward(Boolean(data.catheterForward));
            if (data.catheterBack !== undefined) setCatheterBack(Boolean(data.catheterBack));

            // Track machine status (1=IDLE, 2=HOMING, 3=READY)
            if (data.machineStatus !== undefined) setMachineStatus(data.machineStatus);
            
            // Update home state from PLC data (only if not triggered by user)
            if (!homingTriggered && data.home !== undefined) {
              setHomeActive(Boolean(data.home));
            }

            setGraphData(prev => {
              // ── Do NOT plot during homing — clear and block new points ──
              if (data.machineStatus === 2) return [];

              const x = Number(data.distance);
              const y = Number(data.force_mN);
              if (isNaN(x) || isNaN(y)) return prev;
              let direction = 'forward';
              if (prev.length > 0) {
                const lastDir = prev[prev.length - 1].direction;
                const isProbeDown = data.probeDown !== undefined ? Boolean(data.probeDown) : false;
                const isProbeUp = data.probeUp !== undefined ? Boolean(data.probeUp) : false;

                if (isProbeDown) {
                  direction = 'forward';
                } else if (isProbeUp) {
                  direction = 'backward';
                } else {
                  direction = lastDir;
                }
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
  }, [connectionStatus.connected, emergencyActive, homingTriggered]);

  // Clear graph data when machine enters homing state
  useEffect(() => {
    if (machineStatus === 2) { // HOMING state
      setGraphData([]);
      console.log("🧹 Graph data cleared due to homing state");
    }
  }, [machineStatus]);

  const handleReconnect = async () => {
    try {
      const result = await window.api.reconnect();
      if (result.success && result.connected) {
        setShowConnectionError(false);
        setConnectionStatus(prev => ({ ...prev, connected: true }));
        const manualResult = await window.api.manualModeActivate();
        if (manualResult.success) {
          setManualModeActive(true);
          activationDoneRef.current = true;
          console.log("✅ Manual mode re-activated after reconnect");
        }
      }
    } catch (e) {
      console.error('Reconnect error:', e);
    }
  };

  const controlsEnabled = connectionStatus.connected && !emergencyActive && manualModeActive;

  // Motors are at the home/mean position when: machine is READY and both distances are zero
  // In this state homing is unnecessary, so the button is disabled
  const isAtHomePosition =
    machineStatus === 3 &&
    Number(probeDistance) === 0 &&
    Number(catheterDistance) === 0;

  // Combined disable condition for the Homing button
  const isHomingButtonDisabled =
    !connectionStatus.connected ||
    emergencyActive ||
    !manualModeActive ||
    homeActive ||
    isAtHomePosition;

  const handleBackButton = async () => {
    try {
      console.log('🔄 Deactivating manual mode before leaving...');
      const result = await window.api.deactivateManual();
      if (result.success) {
        setManualModeActive(false);
        activationDoneRef.current = false;
        console.log('✅ Manual mode deactivated successfully');
      } else {
        console.error('❌ Failed to deactivate manual mode:', result.message);
      }
    } catch (error) {
      console.error('❌ Failed to deactivate manual mode:', error);
    } finally {
      navigate('/');
    }
  };

  // ── Prominent radio-style status row ────────────────────────────────────────
  const RadioRow = ({ active, dotColor, dotColorRing, label, activeLabel, inactiveLabel }) => (
    <div className={`flex items-center gap-3 transition-opacity duration-300 ${!controlsEnabled ? 'opacity-40' : 'opacity-100'}`}>
      <span
        className={`w-5 h-5 rounded-full flex-shrink-0 border-2 transition-all duration-300
          ${active
            ? `${dotColor} border-transparent animate-pulse shadow-md ${dotColorRing}`
            : 'bg-white border-slate-700'}`}
        style={active ? { boxShadow: '0 0 0 3px rgba(0,0,0,0.08)' } : {}}
      />
      <span className="text-[16px] font-semibold text-slate-700 w-24 flex-shrink-0">{label}</span>
    </div>
  );

  // Update plugin refs synchronously before every paint
  const currentDist  = Number(probeDistance);
  const lastDirection = graphData.length > 0 ? graphData[graphData.length - 1].direction : 'forward';
  const activeDotColor = probeDown
    ? '#3b82f6'
    : probeUp
      ? '#ef4444'
      : lastDirection === 'backward' ? '#ef4444' : '#3b82f6';
  pluginDistRef.current  = currentDist;
  pluginColorRef.current = activeDotColor;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-6 overflow-hidden">
      <div className="w-full mx-auto h-full flex flex-col" style={{ maxHeight: 'calc(100vh - 48px)' }}>

        {/* ══════════════ LIVE READINGS ROW ══════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Ruler className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Vertical Distance</p>
                <p className="text-2xl font-bold text-slate-800">{probeDistance} <span className="text-sm font-medium text-slate-500">mm</span></p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <MoveHorizontal className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Horizontal Distance</p>
                <p className="text-2xl font-bold text-slate-800">{catheterDistance} <span className="text-sm font-medium text-slate-500">mm</span></p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Activity className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Force</p>
                <p className="text-2xl font-bold text-slate-800">{force} <span className="text-sm font-medium text-slate-500">gf</span></p>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════ MAIN GRID ══════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_340px] gap-4 md:gap-6 flex-1 min-h-0">

          {/* ══════════ LEFT: Graph ══════════ */}
          <div className="flex flex-col w-full min-w-0 min-h-0">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col h-full">
              <div className="p-4 md:p-6 flex flex-col h-full">

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 flex-shrink-0">
                  <div className="flex items-center space-x-2 md:space-x-3">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg shadow-sm">
                      <TrendingUp className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-slate-800">Vertical Distance vs Force</h3>
                      <p className="text-slate-500 text-xs font-medium">Real-time analysis</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 sm:space-x-5 bg-slate-50/50 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border border-slate-100 shadow-sm flex-shrink-0">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-2 bg-blue-500 rounded-full" />
                      <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Probe Down</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-3 bg-red-500 rounded-full" />
                      <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Probe Up</span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 w-full min-h-0">
                  <Line data={chartConfig} options={chartOptions} plugins={[stoppedPositionPlugin]} redraw={false} updateMode="none" />
                </div>
              </div>
            </div>
          </div>
          {/* end left column */}

          {/* ══════════ RIGHT: Status Card + Home/Tare ══════════ */}
          <div className="flex flex-col gap-3 md:gap-4 w-full min-h-0 overflow-y-auto pr-1">

            {/* ── Single unified status card ── */}
            <div className="bg-white rounded-xl md:rounded-2xl shadow-md border border-slate-200 p-5 flex-1">

              {/* Card header */}
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-5 rounded-full bg-slate-800" />
                <span className="text-xl font-bold text-slate-800 uppercase tracking-widest">Status</span>
              </div>

              {/* CLAMP */}
              <div className="mb-5">
                <p className="text-[14px] font-bold text-slate-700 uppercase tracking-widest mb-3">Clamp</p>
                <RadioRow
                  active={clamp}
                  dotColor="bg-purple-500"
                  dotColorRing="ring-purple-200"
                  label="Clamp"
                  showLabels={false}
                />
              </div>

              <div className="border-t border-slate-100 mb-5" />

              {/* PROBE */}
              <div className="mb-5">
                <p className="text-[14px] font-bold text-slate-700 uppercase tracking-widest mb-3">Probe</p>
                <div className="flex flex-row gap-3">
                  <RadioRow
                    active={probeUp}
                    dotColor="bg-red-500"
                    dotColorRing="ring-red-200"
                    label="Up"
                    showLabels={false}
                  />
                  <RadioRow
                    active={probeDown}
                    dotColor="bg-blue-500"
                    dotColorRing="ring-green-200"
                    label="Down"
                    showLabels={false}
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 mb-5" />

              {/* CATHETER */}
              <div>
                <p className="text-[14px] font-bold text-slate-700 uppercase tracking-widest mb-3">Catheter</p>
                <div className="flex flex-row gap-3 text-[12px]">
                  <RadioRow
                    active={catheterForward}
                    dotColor="bg-green-500"
                    dotColorRing="ring-red-200"
                    label="Forward"
                    showLabels={false}
                  />
                  <RadioRow
                    active={catheterBack}
                    dotColor="bg-amber-500"
                    dotColorRing="ring-green-200"
                    label="Backward"
                    showLabels={false}
                  />
                </div>
              </div>

            </div>
            {/* end single status card */}

                                    {/* ── System & Jog Controls ── */}
            <div className="bg-white rounded-xl md:rounded-2xl shadow-md border border-slate-200 p-5 flex-shrink-0">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-5 rounded-full bg-slate-700" />
                <span className="text-xl font-bold text-slate-800 uppercase tracking-widest">Controls</span>
              </div>
              
              <div className="flex flex-col gap-5">
                {/* Row 1: Homing, Tare, Clamp */}
                <div className="flex justify-around items-center gap-2">
                  {/* Home Button */}
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={handleHome}
                      disabled={isHomingButtonDisabled}
                      title={isAtHomePosition ? 'Motors are already at home position' : ''}
                      className={`relative group flex items-center justify-center w-20 h-20 rounded-full border-2 font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
                        ${homeActive
                          ? 'bg-indigo-500 border-indigo-600 text-white shadow-lg shadow-indigo-200'
                          : 'bg-indigo-50 border-indigo-300 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-400 hover:shadow-md active:scale-95'}
                        ${isHomingButtonDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                    >
                      {homeActive && (
                        <div className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-20 pointer-events-none" />
                      )}
                      <Home className={`w-7 h-7 transition-transform duration-200 ${!homeActive && controlsEnabled ? 'group-hover:scale-110' : ''}`} />
                    </button>
                    <span className="text-[12px] font-bold uppercase tracking-wider text-slate-700 text-center">
                      {homeActive ? 'Homing...' : 'Homing'}
                    </span>
                  </div>

                  {/* Tare Button */}
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={handleTare}
                      disabled={!connectionStatus.connected || emergencyActive || !manualModeActive || tareActive}
                      className={`relative group flex items-center justify-center w-20 h-20 rounded-full border-2 font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400
                        ${tareActive
                          ? 'bg-teal-500 border-teal-600 text-white shadow-lg shadow-teal-200'
                          : 'bg-teal-50 border-teal-300 text-teal-700 hover:bg-teal-100 hover:border-teal-400 hover:shadow-md active:scale-95'}
                        ${(!connectionStatus.connected || emergencyActive || !manualModeActive || tareActive) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                    >
                      {tareActive && (
                        <div className="absolute inset-0 rounded-full bg-teal-400 animate-ping opacity-20 pointer-events-none" />
                      )}
                      <Scale className={`w-7 h-7 transition-transform duration-200 ${!tareActive && controlsEnabled ? 'group-hover:scale-110' : ''}`} />
                    </button>
                    <span className="text-[12px] font-bold uppercase tracking-wider text-slate-700 text-center">
                      {tareActive ? 'Taring...' : 'Tare'}
                    </span>
                  </div>

                  {/* Clamp Toggle Button */}
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={handleClampToggle}
                      disabled={!controlsEnabled}
                      className={`relative group flex items-center justify-center w-20 h-20 rounded-full border-2 font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400
                        ${clamp
                          ? 'bg-purple-500 border-purple-600 text-white shadow-lg shadow-purple-200'
                          : 'bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100 hover:border-purple-400 hover:shadow-md active:scale-95'}
                        ${!controlsEnabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                    >
                      {clamp && (
                        <div className="absolute inset-0 rounded-full bg-purple-400 animate-ping opacity-20 pointer-events-none" />
                      )}
                      <img
                        src={clampIcon}
                        alt="Clamp"
                        className={`w-7 h-7 object-contain transition-transform duration-200 ${!clamp && controlsEnabled ? 'group-hover:scale-110' : ''} ${clamp ? 'filter invert brightness-0' : ''}`}
                      />
                    </button>
                    <span className="text-[12px] font-bold uppercase tracking-wider text-slate-700 text-center">
                      Clamp
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100" />

                {/* Row 2: Probe & Catheter side-by-side */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Probe Controls */}
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Probe Control</span>
                    <div className="flex gap-2">
                      {/* Probe Up */}
                      <button
                        onMouseDown={handleProbeUpStart}
                        onTouchStart={handleProbeUpStart}
                        onMouseUp={handleProbeStop}
                        onMouseLeave={handleProbeStop}
                        onTouchEnd={handleProbeStop}
                        onTouchCancel={handleProbeStop}
                        disabled={!controlsEnabled}
                        className={`relative group flex items-center justify-center w-14 h-14 rounded-full border-2 font-semibold transition-all duration-200 select-none focus:outline-none
                          ${probeUp
                            ? 'bg-red-500 border-red-600 text-white shadow-lg'
                            : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'}
                          ${!controlsEnabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                      >
                        <ChevronUp className={`w-5 h-5 transition-transform duration-200 ${!probeUp && controlsEnabled ? 'group-hover:scale-110' : ''}`} />
                      </button>

                      {/* Probe Down */}
                      <button
                        onMouseDown={handleProbeDownStart}
                        onTouchStart={handleProbeDownStart}
                        onMouseUp={handleProbeStop}
                        onMouseLeave={handleProbeStop}
                        onTouchEnd={handleProbeStop}
                        onTouchCancel={handleProbeStop}
                        disabled={!controlsEnabled}
                        className={`relative group flex items-center justify-center w-14 h-14 rounded-full border-2 font-semibold transition-all duration-200 select-none focus:outline-none
                          ${probeDown
                            ? 'bg-blue-500 border-blue-600 text-white shadow-lg'
                            : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'}
                          ${!controlsEnabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                      >
                        <ChevronDown className={`w-5 h-5 transition-transform duration-200 ${!probeDown && controlsEnabled ? 'group-hover:scale-110' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Catheter Controls */}
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Catheter Control</span>
                    <div className="flex gap-2">
                      {/* Catheter Backward */}
                      <button
                        onMouseDown={handleCatheterBackwardStart}
                        onTouchStart={handleCatheterBackwardStart}
                        onMouseUp={handleCatheterBackwardStop}
                        onMouseLeave={handleCatheterBackwardStop}
                        onTouchEnd={handleCatheterBackwardStop}
                        onTouchCancel={handleCatheterBackwardStop}
                        disabled={!controlsEnabled}
                        className={`relative group flex items-center justify-center w-14 h-14 rounded-full border-2 font-semibold transition-all duration-200 select-none focus:outline-none
                          ${catheterBack
                            ? 'bg-amber-500 border-amber-600 text-white shadow-lg'
                            : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'}
                          ${!controlsEnabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                      >
                        <ChevronLeft className={`w-5 h-5 transition-transform duration-200 ${!catheterBack && controlsEnabled ? 'group-hover:scale-110' : ''}`} />
                      </button>

                      {/* Catheter Forward */}
                      <button
                        onMouseDown={handleCatheterForwardStart}
                        onTouchStart={handleCatheterForwardStart}
                        onMouseUp={handleCatheterForwardStop}
                        onMouseLeave={handleCatheterForwardStop}
                        onTouchEnd={handleCatheterForwardStop}
                        onTouchCancel={handleCatheterForwardStop}
                        disabled={!controlsEnabled}
                        className={`relative group flex items-center justify-center w-14 h-14 rounded-full border-2 font-semibold transition-all duration-200 select-none focus:outline-none
                          ${catheterForward
                            ? 'bg-green-500 border-green-600 text-white shadow-lg'
                            : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'}
                          ${!controlsEnabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                      >
                        <ChevronRight className={`w-5 h-5 transition-transform duration-200 ${!catheterForward && controlsEnabled ? 'group-hover:scale-110' : ''}`} />
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
            {/* end Home & Tare */}

          </div>
          {/* end right column */}

        </div>
        {/* end main grid */}

        {/* Controls disabled message */}
        {(!controlsEnabled && connectionStatus.connected && !emergencyActive) && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-center flex-shrink-0">
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