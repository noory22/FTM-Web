import React, { useState, useEffect, useRef, useCallback } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import {
  Play,
  Pause,
  RotateCcw,
  Info,
  X,
  Activity,
  Gauge,
  Ruler,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

// ── Chart.js registration ──────────────────────────────────────────────────────
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

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_META = {
  IDLE:              { color: "text-slate-500",  dot: "bg-slate-400",              badge: "bg-slate-100 text-slate-600",           pulse: false },
  HOMING:            { color: "text-amber-600",  dot: "bg-amber-500 animate-pulse", badge: "bg-amber-100 text-amber-700",           pulse: true  },
  READY:             { color: "text-green-600",  dot: "bg-green-500",               badge: "bg-green-100 text-green-700",           pulse: false },
  "SEARCHING CONTACT":{ color: "text-sky-600",   dot: "bg-sky-500 animate-pulse",   badge: "bg-sky-100 text-sky-700",              pulse: true  },
  RUNNING:           { color: "text-blue-600",   dot: "bg-blue-500 animate-pulse",  badge: "bg-blue-100 text-blue-700",             pulse: true  },
  RETRACTING:        { color: "text-purple-600", dot: "bg-purple-500 animate-pulse",badge: "bg-purple-100 text-purple-700",         pulse: true  },
  COMPLETED:         { color: "text-teal-600",   dot: "bg-teal-500",                badge: "bg-teal-100 text-teal-700",             pulse: false },
  UNKNOWN:           { color: "text-gray-400",   dot: "bg-gray-300",                badge: "bg-gray-100 text-gray-500",             pulse: false },
};

const getStatusMeta = (status) =>
  STATUS_META[status] || STATUS_META.UNKNOWN;

// Safe statuses where back / navigation is allowed
const SAFE_STATUSES = new Set(["IDLE", "READY", "COMPLETED", "UNKNOWN"]);

const ProcessMode = () => {
  const navigate = useNavigate();

  // ── Connection ───────────────────────────────────────────────────────────────
  const [isConnected, setIsConnected] = useState(false);

  // ── Config ───────────────────────────────────────────────────────────────────
  const [selectedConfig, setSelectedConfig] = useState(null);
  const is3Point = selectedConfig?.testType === "3-point";

  // ── Live sensor data ─────────────────────────────────────────────────────────
  const [liveData, setLiveData] = useState({
    machineStatus: "IDLE",
    probeDistance: "--",
    catheterDistance: "--",
    force: "--",
    stepsToMove: "--",
  });

  // ── Chart data (Force vs Probe Distance) ─────────────────────────────────────
  const [chartData, setChartData] = useState([]);

  // ── CSV logging ───────────────────────────────────────────────────────────────
  const [isLogging, setIsLogging] = useState(false);
  const lastLogRef = useRef({ distance: null, force: null });

  // ── UI ────────────────────────────────────────────────────────────────────────
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const prevStatusRef = useRef("IDLE");

  // ── Screen size ───────────────────────────────────────────────────────────────
  const [screenW, setScreenW] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setScreenW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isXl = screenW >= 1920;
  const isLg = screenW >= 1366 && screenW < 1920;

  // ── Load config from localStorage and activate appropriate mode ─────────────────
  useEffect(() => {
    const loadConfigAndActivateMode = async () => {
      try {
        const raw = localStorage.getItem("selectedConfig");
        if (raw) {
          const config = JSON.parse(raw);
          setSelectedConfig(config);
          
          // Activate the appropriate mode coil based on test type
          if (config.testType === "2-point") {
            await window.api.twoPointActivate();
            console.log("✅ 2-POINT mode activated on PLC");
          } else if (config.testType === "3-point") {
            await window.api.threePointActivate();
            console.log("✅ 3-POINT mode activated on PLC");
          }
        }
      } catch (e) {
        console.error("Error loading config from localStorage:", e);
      }
    };
    
    loadConfigAndActivateMode();
    
    // Cleanup: Deactivate both modes when component unmounts (navigating back)
    return () => {
      const deactivateModes = async () => {
        try {
          await window.api.deactivateManual();
          console.log("✅ Modes deactivated on unmount");
        } catch (e) {
          console.error("Error deactivating modes:", e);
        }
      };
      deactivateModes();
    };
  }, []);

  // ── Connection monitoring ─────────────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      try {
        const res = await window.api.checkConnection();
        setIsConnected(res.connected);
      } catch {
        setIsConnected(false);
      }
    };
    check();

    const handler = (e) => setIsConnected(e.detail === "connected");
    window.addEventListener("modbus-status-change", handler);
    return () => window.removeEventListener("modbus-status-change", handler);
  }, []);

  const handleReconnect = async () => {
    try {
      const res = await window.api.reconnect();
      if (res.success && res.connected) setIsConnected(true);
    } catch (e) {
      console.error("Reconnect error:", e);
    }
  };

  // ── CSV helpers ───────────────────────────────────────────────────────────────
  const startCsvLogging = useCallback(async () => {
    if (!selectedConfig || isLogging) return;
    try {
      const res = await window.api.startCSV(selectedConfig);
      if (res.success) {
        setIsLogging(true);
        lastLogRef.current = { distance: null, force: null };
        console.log("✅ CSV logging started:", res.fileName);
      }
    } catch (e) {
      console.error("Error starting CSV:", e);
    }
  }, [selectedConfig, isLogging]);

  const stopCsvLogging = useCallback(async () => {
    if (!isLogging) return;
    try {
      const res = await window.api.stopCSV();
      if (res.success) {
        setIsLogging(false);
        console.log("🟡 CSV logging stopped:", res.fileName);
      }
    } catch (e) {
      console.error("Error stopping CSV:", e);
    }
  }, [isLogging]);

  // ── Poll PLC data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isConnected) return;

    const poll = async () => {
      try {
        const data = await window.api.readData();
        if (!data?.success) return;

        const status = data.machineStatusDisplay || "IDLE";
        const probeDistance = data.distance !== undefined && data.distance !== null
          ? parseFloat(data.distance)
          : null;
        const catheterDistance = data.catheterDistance !== undefined && data.catheterDistance !== null
          ? parseFloat(data.catheterDistance)
          : null;
        const force = data.force_mN !== undefined && data.force_mN !== null
          ? parseFloat(data.force_mN)
          : null;
        const stepsToMove = data.stepsToMove !== undefined ? data.stepsToMove : "--";

        setLiveData({
          machineStatus: status,
          probeDistance:    probeDistance    !== null ? probeDistance.toFixed(2)    : "--",
          catheterDistance: catheterDistance !== null ? catheterDistance.toFixed(2) : "--",
          force:            force            !== null ? force.toFixed(2)            : "--",
          stepsToMove: stepsToMove,
        });

        // ── Auto CSV: start when RUNNING, stop when COMPLETED or IDLE ───────────
        const prev = prevStatusRef.current;
        if (status === "RUNNING" && prev !== "RUNNING") {
          startCsvLogging();
        }
        if ((status === "COMPLETED" || status === "IDLE") && isLogging) {
          stopCsvLogging();
        }
        prevStatusRef.current = status;

        // ── Chart & log while RUNNING / SEARCHING CONTACT / RETRACTING ───────────
        const activeStatuses = new Set(["SEARCHING CONTACT", "RUNNING", "RETRACTING"]);
        if (activeStatuses.has(status) && probeDistance !== null && force !== null) {
          setChartData((prev) => [
            ...prev,
            { x: probeDistance, y: force },
          ]);

          // CSV row append
          if (
            isLogging &&
            (lastLogRef.current.distance !== probeDistance ||
              lastLogRef.current.force !== force)
          ) {
            try {
              await window.api.appendCSV({
                data: { distance: probeDistance, force_mN: force, temperature: 0 },
                config: selectedConfig,
              });
              lastLogRef.current = { distance: probeDistance, force };
            } catch (e) {
              console.error("CSV append error:", e);
            }
          }
        }

        // ── Clear chart on reset (status goes to HOMING/IDLE from non-idle) ─────
        if (status === "HOMING" && prev !== "HOMING") {
          setChartData([]);
          lastLogRef.current = { distance: null, force: null };
        }
      } catch (e) {
        console.error("Poll error:", e);
      }
    };

    const intervalId = setInterval(poll, 100);
    poll();
    return () => clearInterval(intervalId);
  }, [isConnected, isLogging, selectedConfig, startCsvLogging, stopCsvLogging]);

  // ── Button handlers ───────────────────────────────────────────────────────────
  const handleStart = async () => {
    try {
      const res = await window.api.start();
      if (!res?.success) console.error("Start failed:", res?.message);
    } catch (e) {
      console.error("Start error:", e);
    }
  };

  const handlePause = async () => {
    try {
      const res = await window.api.stop();
      if (!res?.success) console.error("Pause failed:", res?.message);
    } catch (e) {
      console.error("Pause error:", e);
    }
  };

  const handleReset = async () => {
    try {
      const res = await window.api.reset();
      if (res?.success) {
        setChartData([]);
        lastLogRef.current = { distance: null, force: null };
        await stopCsvLogging();
      } else {
        console.error("Reset failed:", res?.message);
      }
    } catch (e) {
      console.error("Reset error:", e);
    }
  };

  // Button enable rules driven purely by R11 status
  const status = liveData.machineStatus;
  const canStart  = isConnected && ["IDLE", "READY", "SEARCHING CONTACT"].includes(status);
  const canPause  = isConnected && ["RUNNING", "SEARCHING CONTACT", "RETRACTING"].includes(status);
  const canReset  = isConnected && SAFE_STATUSES.has(status) && status !== "UNKNOWN";

  // ── Chart config ──────────────────────────────────────────────────────────────
  const chartConfig = {
    datasets: [
      {
        label: "Force (mN)",
        data: chartData,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.08)",
        fill: false,
        tension: 0,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2.5,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        display: true,
        position: "top",
        labels: { usePointStyle: true, pointStyle: "line", color: "#374151", font: { size: 12 } },
      },
      tooltip: {
        backgroundColor: "rgba(15,23,42,0.85)",
        titleColor: "#f1f5f9",
        bodyColor: "#cbd5e1",
        borderColor: "#3b82f6",
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        callbacks: {
          title: (ctx) => `Distance: ${ctx[0].parsed.x.toFixed(2)} mm`,
          label: (ctx) => `Force: ${ctx.parsed.y.toFixed(2)} mN`,
        },
      },
    },
    scales: {
      x: {
        type: "linear",
        title: {
          display: true,
          text: "Probe Distance (mm)",
          color: "#6b7280",
          font: { size: 12, weight: "bold" },
        },
        grid: { color: "rgba(229,231,235,0.5)" },
        ticks: {
          color: "#6b7280",
          font: { size: 11 },
          maxTicksLimit: 10,
          callback: (v) => `${v} mm`,
        },
      },
      y: {
        type: "linear",
        title: {
          display: true,
          text: "Force (mN)",
          color: "#6b7280",
          font: { size: 12, weight: "bold" },
        },
        grid: { color: "rgba(229,231,235,0.5)" },
        ticks: {
          color: "#6b7280",
          font: { size: 11 },
          maxTicksLimit: 8,
          callback: (v) => `${v} mN`,
        },
      },
    },
  };

  // ── Status badge ──────────────────────────────────────────────────────────────
  const meta = getStatusMeta(status);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 text-gray-900 overflow-hidden flex flex-col">

      {/* ── Info Modal ─────────────────────────────────────────────────────────── */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-blue-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Info className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-blue-900">Operation Guidelines</h3>
              </div>
              <button onClick={() => setShowInfoModal(false)} className="p-2 hover:bg-blue-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-blue-600" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3">
              {[
                ["Serial Connection", "Verify \"CONNECTED\" status is shown."],
                ["Status READY", "System must be in READY / IDLE state before starting."],
                ["Machine Position", "Ensure machine is at home position (Distance = 0.0 mm)."],
                ["Sample Placement", "Verify sample is properly positioned and secured."],
                ["Force Sensor", "Verify force reading is at baseline (near 0 mN)."],
                ["Monitor Graph", "Watch real-time Force vs Probe Distance plot for anomalies."],
                ["STOP (Pause)", "Use PAUSE button if any issues are observed."],
                ["Stay Present", "Never leave the machine unattended during operation."],
              ].map(([title, body]) => (
                <div key={title} className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0" />
                  <p className="text-blue-800 text-sm">
                    <span className="font-semibold">{title}:</span> {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Config slide-in panel (small screens) ──────────────────────────────── */}
      {!isXl && (
        <div
          className={`fixed top-0 right-0 h-full w-72 bg-white/95 backdrop-blur-xl shadow-2xl z-40 transform transition-transform duration-300 ${showConfigPanel ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">Active Configuration</h3>
              <button onClick={() => setShowConfigPanel(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-all">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <ConfigDetails config={selectedConfig} is3Point={is3Point} liveData={liveData} />
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-white/80 backdrop-blur-xl border-b border-gray-200/80 shadow-sm">
        <div className={`${isXl ? "px-6 py-4" : isLg ? "px-4 py-3" : "px-3 py-2.5"} flex items-center justify-between`}>
          <div className="flex items-center space-x-3 min-w-0">
            <div className="min-w-0">
              <h1 className={`${isXl ? "text-2xl" : "text-xl"} font-bold bg-gradient-to-r from-gray-900 to-blue-700 bg-clip-text text-transparent truncate`}>
                Process Mode
              </h1>
              {selectedConfig && (
                <p className="text-blue-600 text-xs mt-0.5 font-medium truncate hidden sm:block">
                  {selectedConfig.testType === "3-point" ? "3-Point Test" : "2-Point Test"} — {selectedConfig.configName}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Info button */}
            <button
              onClick={() => setShowInfoModal(true)}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center transition-all duration-200 hover:-translate-y-0.5 shadow-lg border border-blue-400/30"
            >
              <Info className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Config panel trigger (small screens) */}
            {!isXl && (
              <button
                onClick={() => setShowConfigPanel(true)}
                className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center transition-all hover:-translate-y-0.5 shadow-lg border border-indigo-400/30"
                title="View configuration"
              >
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main layout ───────────────────────────────────────────────────────── */}
      <main className={`relative flex ${isXl ? "flex-row" : "flex-col"} flex-1 ${isXl ? "gap-5 p-5" : isLg ? "gap-4 p-4" : "gap-3 p-3"} min-h-0 overflow-hidden`}>

        {/* ── Left / main column ─────────────────────────────────────────────── */}
        <section className={`flex-1 flex flex-col ${isXl ? "gap-5" : "gap-3"} min-w-0 min-h-0`}>

          {/* Status Bar */}
          <div className={`shrink-0 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200/80 shadow-lg ${isXl ? "px-5 py-3" : "px-4 py-2.5"} flex items-center justify-between`}>
            <div className="flex items-center space-x-3">
              <div className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Machine Status</span>
              <span className={`text-sm font-bold ${meta.color}`}>{status}</span>
            </div>
            <div className="flex items-center space-x-3">
              {isLogging && (
                <span className="flex items-center space-x-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span>LOGGING</span>
                </span>
              )}
              {selectedConfig && (
                <span className="text-xs text-gray-400 hidden md:block">
                  Config: <span className="font-semibold text-gray-600">{selectedConfig.configName}</span>
                </span>
              )}
            </div>
          </div>

          {/* Live Telemetry tiles (small screens — above graph) */}
          {!isXl && (
            <div className={`shrink-0 grid gap-2 ${is3Point ? "grid-cols-4" : "grid-cols-3"}`}>
              <TeleTile label="Catheter Dist." value={liveData.catheterDistance} unit="mm" colorClass="from-violet-500 to-indigo-500" bgClass="from-violet-50 to-indigo-50 border-violet-200/60" textClass="text-violet-700" />
              <TeleTile label="Probe Dist."    value={liveData.probeDistance}    unit="mm" colorClass="from-green-500 to-emerald-500" bgClass="from-green-50 to-emerald-50 border-green-200/60"   textClass="text-green-700"  />
              <TeleTile label="Force"          value={liveData.force}            unit="mN" colorClass="from-cyan-500 to-blue-500"     bgClass="from-cyan-50 to-blue-50 border-cyan-200/60"       textClass="text-blue-700"   />
              {is3Point && (
                <TeleTile label="Steps (R72)" value={liveData.stepsToMove} unit="" colorClass="from-orange-500 to-amber-500" bgClass="from-orange-50 to-amber-50 border-orange-200/60" textClass="text-orange-700" />
              )}
            </div>
          )}

          {/* Chart */}
          <div className="flex-1 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200/80 shadow-xl flex flex-col p-3 sm:p-4 min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <div>
                <span className={`${isXl ? "text-base" : "text-sm"} font-bold text-gray-900`}>
                  Force vs Probe Distance
                </span>
                <span className="text-xs text-gray-400 ml-2">Real-time</span>
              </div>
              {chartData.length > 0 && (
                <span className="text-xs text-gray-400">{chartData.length} pts</span>
              )}
            </div>
            <div className="flex-1 min-h-0" style={{ minHeight: isXl ? "500px" : "220px" }}>
              <Line data={chartConfig} options={chartOptions} redraw={false} />
            </div>
          </div>
        </section>

        {/* ── Right sidebar (xl screens) ─────────────────────────────────────── */}
        {isXl && (
          <section className="w-80 flex flex-col gap-5 min-h-0">

            {/* Config card */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 shadow-xl shrink-0">
              <h3 className="text-base font-bold text-gray-900 mb-3">Active Configuration</h3>
              <ConfigDetails config={selectedConfig} is3Point={is3Point} liveData={liveData} />
            </div>

            {/* Live sensors card */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 shadow-xl shrink-0">
              <h3 className="text-base font-bold text-gray-900 mb-1">Real-time Sensors</h3>
              <p className="text-xs text-gray-400 mb-3">Live monitoring data</p>
              <div className={`grid gap-3 ${is3Point ? "grid-cols-2" : "grid-cols-1"}`}>
                <SensorCard label="Catheter Distance" value={liveData.catheterDistance} unit="mm" gradient="from-violet-500 to-indigo-500" bg="from-violet-50 to-indigo-50" border="border-violet-200/60" textColor="text-violet-700" icon={<Ruler className="w-4 h-4 text-white" />} />
                <SensorCard label="Probe Distance"    value={liveData.probeDistance}    unit="mm" gradient="from-green-500 to-emerald-500" bg="from-green-50 to-emerald-50"   border="border-green-200/60"  textColor="text-green-700"  icon={<Ruler className="w-4 h-4 text-white" />} />
                <SensorCard label="Force"             value={liveData.force}            unit="mN" gradient="from-cyan-500 to-blue-500"    bg="from-cyan-50 to-blue-50"       border="border-cyan-200/60"   textColor="text-blue-700"   icon={<Gauge className="w-4 h-4 text-white" />} />
                {is3Point && (
                  <SensorCard label="Steps to Move (R72)" value={liveData.stepsToMove} unit="" gradient="from-orange-500 to-amber-500" bg="from-orange-50 to-amber-50" border="border-orange-200/60" textColor="text-orange-700" icon={<Activity className="w-4 h-4 text-white" />} />
                )}
              </div>
            </div>

            {/* Status card */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 shadow-xl shrink-0">
              <h3 className="text-base font-bold text-gray-900 mb-3">Machine Status</h3>
              <div className={`flex items-center space-x-3 rounded-xl px-4 py-3 border ${meta.badge} border-current/20`}>
                <div className={`w-3 h-3 rounded-full shrink-0 ${meta.dot}`} />
                <span className={`text-lg font-bold tracking-wide ${meta.color}`}>{status}</span>
              </div>
            </div>

            {/* Spacer to push controls down */}
            <div className="flex-1" />
          </section>
        )}

        {/* ── Process Controls ──────────────────────────────────────────────────
            Fixed bottom bar on small screens, inline on xl ─────────────────── */}
        <div className={`${isXl ? "hidden" : "fixed bottom-0 left-0 right-0"} bg-white/95 backdrop-blur-xl border-t border-gray-200/80 shadow-2xl p-3 sm:p-4 z-20 shrink-0`}>
          <ControlButtons
            onStart={handleStart}
            onPause={handlePause}
            onReset={handleReset}
            canStart={canStart}
            canPause={canPause}
            canReset={canReset}
          />
        </div>
      </main>

      {/* xl-screen controls (inside sidebar at bottom) */}
      {isXl && (
        <div className="shrink-0 bg-white/70 backdrop-blur-xl border-t border-gray-200/80 shadow-2xl px-5 py-4">
          <div className="max-w-xl mx-auto">
            <ControlButtons
              onStart={handleStart}
              onPause={handlePause}
              onReset={handleReset}
              canStart={canStart}
              canPause={canPause}
              canReset={canReset}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Small telemetry tile — used on non-xl screens inside the grid above the chart */
const TeleTile = ({ label, value, unit, colorClass, bgClass, textClass }) => (
  <div className={`bg-gradient-to-br ${bgClass} rounded-xl border p-2.5`}>
    <p className="text-gray-500 text-xs font-medium mb-1 truncate">{label}</p>
    <p className={`text-sm font-bold ${textClass}`}>
      {value}{value !== "--" && unit ? <span className="text-xs font-normal ml-0.5">{unit}</span> : null}
    </p>
  </div>
);

/** Larger sensor card for xl sidebar */
const SensorCard = ({ label, value, unit, gradient, bg, border, textColor, icon }) => (
  <div className={`bg-gradient-to-br ${bg} rounded-xl border ${border} p-3`}>
    <div className="flex items-center space-x-2 mb-1.5">
      <div className={`w-7 h-7 bg-gradient-to-br ${gradient} rounded-lg flex items-center justify-center shadow-sm`}>
        {icon}
      </div>
      <p className="text-gray-500 text-xs font-medium">{label}</p>
    </div>
    <p className={`text-lg font-bold ${textColor}`}>
      {value}{value !== "--" && unit ? <span className="text-xs font-normal ml-0.5">{unit}</span> : null}
    </p>
  </div>
);

/** Active config details block — shows ALL parameters based on test type */
const ConfigDetails = ({ config, is3Point, liveData }) => {
  if (!config) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded-r-xl">
        <p className="text-yellow-800 text-sm font-medium">⚠️ No configuration loaded</p>
      </div>
    );
  }

  // For 2-Point config
  if (!is3Point) {
    return (
      <div className="space-y-2">
        <InfoRow label="Config Name" value={config.configName} highlight />
        <InfoRow label="Test Type" value="2-Point" />
        <InfoRow label="Probe Travel Limit" value={config.probeTravelLimit ? `${config.probeTravelLimit} mm` : "--"} />
        <InfoRow label="Force Limit" value={config.forceLimit ? `${config.forceLimit} mN` : "--"} />
        <InfoRow label="Test Speed" value={config.testSpeed ? `${config.testSpeed} mm/min` : "--"} />
      </div>
    );
  }

  // For 3-Point config
  return (
    <div className="space-y-2">
      <InfoRow label="Config Name" value={config.configName} highlight />
      <InfoRow label="Test Type" value="3-Point" />
      <InfoRow label="Test Length" value={config.testLength ? `${config.testLength} mm` : "--"} />
      <InfoRow label="Measurement Interval" value={config.measurementInterval ? `${config.measurementInterval} s` : "--"} />
      <InfoRow label="Probe Travel Limit" value={config.probeTravelLimit ? `${config.probeTravelLimit} mm` : "--"} />
      <InfoRow label="Force Limit" value={config.forceLimit ? `${config.forceLimit} mN` : "--"} />
      <InfoRow label="Test Speed" value={config.testSpeed ? `${config.testSpeed} mm/min` : "--"} />
      <InfoRow label="Support Span" value={config.supportSpan ? `${config.supportSpan} mm` : "--"} />
      <InfoRow label="Horizontal Speed" value={config.horizontalSpeed ? `${config.horizontalSpeed} mm/min` : "--"} />
    </div>
  );
};

const InfoRow = ({ label, value, highlight, accent }) => (
  <div className={`rounded-lg px-3 py-2 border ${highlight ? "bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200/50" : accent ? "bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200/50" : "bg-gray-50/80 border-gray-200/60"}`}>
    <p className="text-gray-400 text-xs mb-0.5">{label}</p>
    <p className={`text-sm font-bold ${highlight ? "text-blue-700" : accent ? "text-orange-700" : "text-gray-700"}`}>{value}</p>
  </div>
);

/** The three control buttons */
const ControlButtons = ({ onStart, onPause, onReset, canStart, canPause, canReset }) => (
  <div className="flex space-x-2 sm:space-x-3 max-w-2xl mx-auto">
    {/* START — M10 */}
    <button
      id="btn-start"
      onClick={onStart}
      disabled={!canStart}
      className={`flex-1 flex items-center justify-center space-x-2 px-3 py-3 rounded-xl font-bold text-sm sm:text-base transition-all transform ${canStart
        ? "bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-xl shadow-green-500/25 border border-green-400/30 hover:scale-[1.02]"
        : "bg-gray-100 cursor-not-allowed text-gray-400 border border-gray-200"
      }`}
    >
      <Play className="w-4 h-4 sm:w-5 sm:h-5" />
      <span>START</span>
    </button>

    {/* PAUSE — M11 */}
    <button
      id="btn-pause"
      onClick={onPause}
      disabled={!canPause}
      className={`flex-1 flex items-center justify-center space-x-2 px-3 py-3 rounded-xl font-bold text-sm sm:text-base transition-all transform ${canPause
        ? "bg-gradient-to-br from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white shadow-xl shadow-yellow-500/25 border border-yellow-400/30 hover:scale-[1.02]"
        : "bg-gray-100 cursor-not-allowed text-gray-400 border border-gray-200"
      }`}
    >
      <Pause className="w-4 h-4 sm:w-5 sm:h-5" />
      <span>PAUSE</span>
    </button>

    {/* RESET — M12 */}
    <button
      id="btn-reset"
      onClick={onReset}
      disabled={!canReset}
      className={`flex-1 flex items-center justify-center space-x-2 px-3 py-3 rounded-xl font-bold text-sm sm:text-base transition-all transform ${canReset
        ? "bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-xl shadow-red-500/25 border border-red-400/30 hover:scale-[1.02]"
        : "bg-gray-100 cursor-not-allowed text-gray-400 border border-gray-200"
      }`}
    >
      <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
      <span>RESET</span>
    </button>
  </div>
);

export default ProcessMode;