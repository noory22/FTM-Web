import React, { useState, useEffect, useRef } from 'react';
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

    return () => {
      const deactivateManualMode = async () => {
        try {
          if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);
          if (movementTimeoutRef.current) clearTimeout(movementTimeoutRef.current);
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
    setHomeActive(false);
    setTareActive(false);
  };

  const handleHome = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;
    try {
      setHomeActive(true);
      const result = await window.api.home();
      if (result.success) {
        console.log("Home command executed");
        setTimeout(() => setHomeActive(false), 3000);
      } else {
        setHomeActive(false);
        console.error("Home command failed:", result.message);
      }
    } catch (error) {
      console.error("Home error:", error);
      setHomeActive(false);
    }
  };

  const handleTare = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;
    try {
      setTareActive(true);
      const result = await window.api.tare();
      if (result.success) {
        console.log("Tare command executed");
        setTimeout(() => setTareActive(false), 3000);
      } else {
        setTareActive(false);
        console.error("Tare command failed:", result.message);
      }
    } catch (error) {
      console.error("Tare error:", error);
      setTareActive(false);
    }
  };

  const handleProbeDownStart = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;
    if (movementTimeoutRef.current) clearTimeout(movementTimeoutRef.current);
    if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);
    try {
      const result = await window.api.probeDown();
      if (result.success) {
        setProbeDown(true);
        setProbeUp(false);
        probeIntervalRef.current = setInterval(async () => {
          if (probeDown) await window.api.probeDown();
        }, 500);
        movementTimeoutRef.current = setTimeout(async () => {
          await handleProbeStop();
        }, 5000);
      }
    } catch (error) {
      console.error("Probe down error:", error);
    }
  };

  const handleProbeUpStart = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;
    if (movementTimeoutRef.current) clearTimeout(movementTimeoutRef.current);
    if (probeIntervalRef.current) clearInterval(probeIntervalRef.current);
    try {
      const result = await window.api.probeUp();
      if (result.success) {
        setProbeUp(true);
        setProbeDown(false);
        probeIntervalRef.current = setInterval(async () => {
          if (probeUp) await window.api.probeUp();
        }, 500);
        movementTimeoutRef.current = setTimeout(async () => {
          await handleProbeStop();
        }, 5000);
      }
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
      setProbeDown(false);
      setProbeUp(false);
    } catch (error) {
      console.error("Probe stop error:", error);
    }
  };

  const handleClampToggle = async () => {
    if (!connectionStatus.connected || emergencyActive || !manualModeActive) return;
    try {
      const newState = !clamp;
      const result = await window.api.clampControl(newState);
      if (result.success) setClamp(result.clampState);
    } catch (error) {
      console.error("Clamp toggle error:", error);
    }
  };

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
        const manualResult = await window.api.manualModeActivate();
        if (manualResult.success) setManualModeActive(true);
      }
    } catch (e) {
      console.error('Reconnect error:', e);
    }
  };

  const controlsEnabled = connectionStatus.connected && !emergencyActive && manualModeActive;

  const handleBackButton = async () => {
    try {
      console.log('Deactivating manual mode before leaving...');
      await window.api.deactivateManual();
      console.log('Manual mode deactivated successfully');
    } catch (error) {
      console.error('Failed to deactivate manual mode:', error);
    } finally {
      navigate('/');
    }
  };

  // ── Prominent radio-style status row ────────────────────────────────────────
  const RadioRow = ({ active, dotColor, dotColorRing, label, activeLabel, inactiveLabel }) => (
    <div className={`flex items-center gap-3 transition-opacity duration-300 ${!controlsEnabled ? 'opacity-40' : 'opacity-100'}`}>
      {/* Radio dot — larger and more impactful */}
      <span
        className={`w-5 h-5 rounded-full flex-shrink-0 border-2 transition-all duration-300
          ${active
            ? `${dotColor} border-transparent animate-pulse shadow-md ${dotColorRing}`
            : 'bg-white border-slate-700'}`}
        style={active ? { boxShadow: '0 0 0 3px rgba(0,0,0,0.08)' } : {}}
      />
      {/* Label — larger, bolder */}
      <span className="text-[16px] font-semibold text-slate-700 w-24 flex-shrink-0">{label}</span>
      {/* Status pill — more substantial */}
      
    </div>
  );

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
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Probe Distance</p>
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
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Catheter Distance</p>
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
                <p className="text-2xl font-bold text-slate-800">{force} <span className="text-sm font-medium text-slate-500">mN</span></p>
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
                      <h3 className="text-xl font-semibold text-slate-800">Probe Distance vs Force</h3>
                      <p className="text-slate-500 text-xs font-medium">Real-time analysis</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 sm:space-x-5 bg-slate-50/50 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border border-slate-100 shadow-sm flex-shrink-0">
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

                <div className="flex-1 w-full min-h-0">
                  <Line data={chartConfig} options={chartOptions} redraw={false} />
                </div>
              </div>
            </div>
          </div>
          {/* end left column */}

          {/* ══════════ RIGHT: Status Card + Home/Tare ══════════ */}
          <div className="flex flex-col gap-3 md:gap-4 w-full min-h-0">

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

            {/* ── Home & Tare buttons ── */}
            <div className="bg-white rounded-xl md:rounded-2xl shadow-md border border-slate-200 p-5 flex-shrink-0">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-5 rounded-full bg-slate-700" />
                <span className="text-xl font-bold text-slate-800 uppercase tracking-widest">System Controls</span>
              </div>
              <div className="flex justify-around items-center gap-4">

                {/* Home Button — circular */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={handleHome}
                    disabled={!connectionStatus.connected || emergencyActive || !manualModeActive}
                    className={`relative group flex items-center justify-center w-20 h-20 rounded-full border-2 font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
                      ${homeActive
                        ? 'bg-indigo-500 border-indigo-600 text-white shadow-lg shadow-indigo-200'
                        : 'bg-indigo-50 border-indigo-300 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-400 hover:shadow-md active:scale-95'}
                      ${(!connectionStatus.connected || emergencyActive || !manualModeActive) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    {homeActive && (
                      <div className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-20 pointer-events-none" />
                    )}
                    <Home className={`w-7 h-7 transition-transform duration-200 ${!homeActive && controlsEnabled ? 'group-hover:scale-110' : ''}`} />
                  </button>
                  <span className="text-[14px] font-bold uppercase tracking-wider text-slate-700">Homing</span>
                </div>

                {/* Tare Button — circular */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={handleTare}
                    disabled={!connectionStatus.connected || emergencyActive || !manualModeActive}
                    className={`relative group flex items-center justify-center w-20 h-20 rounded-full border-2 font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400
                      ${tareActive
                        ? 'bg-teal-500 border-teal-600 text-white shadow-lg shadow-teal-200'
                        : 'bg-teal-50 border-teal-300 text-teal-700 hover:bg-teal-100 hover:border-teal-400 hover:shadow-md active:scale-95'}
                      ${(!connectionStatus.connected || emergencyActive || !manualModeActive) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    {tareActive && (
                      <div className="absolute inset-0 rounded-full bg-teal-400 animate-ping opacity-20 pointer-events-none" />
                    )}
                    <Scale className={`w-7 h-7 transition-transform duration-200 ${!tareActive && controlsEnabled ? 'group-hover:scale-110' : ''}`} />
                  </button>
                  <span className="text-[14px] font-bold uppercase tracking-wider text-slate-700">Tare</span>
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