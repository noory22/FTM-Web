import React, { useState, useEffect, useRef, useCallback } from "react";
import { Line, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
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
} from "lucide-react";
import { useNavigate } from "react-router-dom";

// ── Chart.js registration ──────────────────────────────────────────────────────
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController,
  Title,
  Tooltip,
  Legend,
  Filler
);

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_META = {
  IDLE:               { color: "text-slate-500",  dot: "bg-slate-400",               badge: "bg-slate-100 text-slate-600",  pulse: false },
  HOMING:             { color: "text-amber-600",  dot: "bg-amber-500 animate-pulse",  badge: "bg-amber-100 text-amber-700",  pulse: true  },
  READY:              { color: "text-green-600",  dot: "bg-green-500",                badge: "bg-green-100 text-green-700",  pulse: false },
  "SEARCHING CONTACT":{ color: "text-sky-600",   dot: "bg-sky-500 animate-pulse",    badge: "bg-sky-100 text-sky-700",     pulse: true  },
  RUNNING:            { color: "text-blue-600",   dot: "bg-blue-500 animate-pulse",   badge: "bg-blue-100 text-blue-700",   pulse: true  },
  RETRACTING:         { color: "text-purple-600", dot: "bg-purple-500 animate-pulse", badge: "bg-purple-100 text-purple-700",pulse: true  },
  COMPLETED:          { color: "text-teal-600",   dot: "bg-teal-500",                 badge: "bg-teal-100 text-teal-700",   pulse: false },
  "CATHETER MOVEMENT": { color: "text-violet-600", dot: "bg-violet-500 animate-pulse", badge: "bg-violet-100 text-violet-700", pulse: true  },
  UNKNOWN:            { color: "text-gray-400",   dot: "bg-gray-300",                 badge: "bg-gray-100 text-gray-500",   pulse: false },
};

const getStatusMeta = (status) =>
  STATUS_META[status] || STATUS_META.UNKNOWN;

// Safe statuses where back / navigation is allowed
const SAFE_STATUSES = new Set(["IDLE", "READY", "COMPLETED", "UNKNOWN"]);

// Statuses where START is allowed
const START_ALLOWED = new Set(["IDLE", "READY"]);

// Statuses where PAUSE is allowed
const PAUSE_ALLOWED = new Set(["SEARCHING CONTACT", "RUNNING"]);

// Statuses where RESUME is allowed
const RESUME_ALLOWED = new Set(["PAUSED"]);

// Statuses where RESET is allowed
const RESET_ALLOWED = new Set(["SEARCHING CONTACT", "RUNNING", "PAUSED", "RETRACTING", "COMPLETED", "CATHETER MOVEMENT"]);

// Statuses where graph data should be collected
const GRAPH_ACTIVE = new Set(["SEARCHING CONTACT", "RUNNING"]);

// Statuses where CSV logging should be active
const CSV_ACTIVE = new Set(["SEARCHING CONTACT", "RUNNING"]);

// Statuses that indicate test in progress (block navigation)
const TEST_IN_PROGRESS = new Set(["SEARCHING CONTACT", "RUNNING", "PAUSED", "RETRACTING", "CATHETER MOVEMENT"]);

// ── Peak colour palette (cycles through if more than 10 steps) ──────────────────
const PEAK_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#f97316", // orange
  "#6366f1", // indigo
];

// ── 3-Point Process Mode Component ────────────────────────────────────────────
const ProcessModeThreePoint = () => {
  const navigate = useNavigate();

  // ── Connection ───────────────────────────────────────────────────────────────
  const [isConnected, setIsConnected] = useState(false);

  // ── Config ───────────────────────────────────────────────────────────────────
  const [selectedConfig, setSelectedConfig] = useState(null);

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

  // ── 3-Point: Multi-peak chart state ──────────────────────────────────────────
  const [peakSeries, setPeakSeries]           = useState([]); // Sealed completed peaks
  const [currentPeakData, setCurrentPeakData] = useState([]); // Live cycle line
  const [barData, setBarData]                 = useState([]); // Horizontal bar accumulation

  // Refs for peak tracking (updated in-place; don't need re-render)
  const currentPeakRef          = useRef([]);
  const currentCycleMaxForceRef = useRef(0);
  const currentCycleHorizPosRef = useRef(null);
  const currentCycleStepIdxRef  = useRef(0);  // How many peaks have been sealed
  const isTestRunningRef        = useRef(false); // True while a 3-pt test is active

  // ── CSV logging ───────────────────────────────────────────────────────────────
  const [isLogging, setIsLogging] = useState(false);
  const lastLogRef = useRef({ distance: null, force: null });

  // ── UI ────────────────────────────────────────────────────────────────────────
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const prevStatusRef = useRef("IDLE");
  const [isPaused, setIsPaused] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isPlotting, setIsPlotting] = useState(false);
  const isPausedUI = (isPaused || isPausing) && !isResuming;
  const [isTestCompleted, setIsTestCompleted] = useState(false);
  const [completedTimer, setCompletedTimer] = useState(null);

  // ── Screen size ───────────────────────────────────────────────────────────────
  const [screenW, setScreenW] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setScreenW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isXl = screenW >= 1280;
  const isLg = screenW >= 1024 && screenW < 1280;

  // ── Load config from localStorage and activate 3-point mode ──────────────────
  useEffect(() => {
    const loadConfigAndActivateMode = async () => {
      try {
        const raw = localStorage.getItem("selectedConfig");
        if (raw) {
          const config = JSON.parse(raw);
          setSelectedConfig(config);

          // Always activate 3-point mode on PLC
          await window.api.threePointActivate();
          console.log("✅ 3-POINT mode activated on PLC");
        }
      } catch (e) {
        console.error("Error loading config from localStorage:", e);
      }
    };

    loadConfigAndActivateMode();

    // Cleanup: Deactivate modes when component unmounts
    return () => {
      const deactivateModes = async () => {
        try {
          await window.api.deactivateManual();
          console.log("✅ 3-Point modes deactivated on unmount");
        } catch (e) {
          console.error("Error deactivating modes:", e);
        }
      };
      deactivateModes();
      if (completedTimer) clearTimeout(completedTimer);
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
        const probeDistance = data.test_Dist !== undefined && data.test_Dist !== null
          ? parseFloat(data.test_Dist)
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

        const prev = prevStatusRef.current;
        prevStatusRef.current = status;

        // ── Clear pending states on PLC status transitions ───────────────────
        if (isStarting && status !== "READY" && status !== "IDLE") {
          setIsStarting(false);
        }
        if (isResuming && (status === "RUNNING" || status === "SEARCHING CONTACT")) {
          setIsResuming(false);
        }
        if (isResetting && (status === "HOMING" || status === "READY" || status === "IDLE")) {
          setIsResetting(false);
        }

        // ── Handle status transitions ────────────────────────────────────────

        // Check if test completed (status changes to HOMING)
        if (status === "HOMING") {
          setIsPlotting(false);
          setChartData([]);
          lastLogRef.current = { distance: null, force: null };

          if (isLogging) {
            stopCsvLogging();
          }

          if (prev === "RUNNING" || prev === "SEARCHING CONTACT") {
            setIsTestCompleted(true);
          }
        }

        // ── 3-Point: Seal current peak into series on each HOMING transition ──
        if (status === "HOMING" && (prev === "RUNNING" || prev === "SEARCHING CONTACT")) {
          const sealedPeak = [...currentPeakRef.current];
          if (sealedPeak.length > 0) {
            const stepIdx  = currentCycleStepIdxRef.current;
            const peakColor = PEAK_COLORS[stepIdx % PEAK_COLORS.length];
            setPeakSeries(ps => [
              ...ps,
              { label: `Step ${stepIdx + 1}`, color: peakColor, data: sealedPeak },
            ]);
            setBarData(bd => [
              ...bd,
              {
                label:    currentCycleHorizPosRef.current !== null
                  ? `${parseFloat(currentCycleHorizPosRef.current.toFixed(1))}`
                  : `S${stepIdx + 1}`,
                maxForce: parseFloat(currentCycleMaxForceRef.current.toFixed(2)),
                color:    peakColor,
              },
            ]);
            currentCycleStepIdxRef.current += 1;
          }
          // Reset live-peak tracking for the next cycle
          currentPeakRef.current          = [];
          setCurrentPeakData([]);
          currentCycleMaxForceRef.current = 0;
          currentCycleHorizPosRef.current = null;
        }

        // When status becomes READY after HOMING, set COMPLETED briefly then READY
        if (prev === "HOMING" && status === "READY" && isTestCompleted) {
          console.log("✅ Homing complete - showing COMPLETED status");
          setLiveData(prevData => ({
            ...prevData,
            machineStatus: "COMPLETED"
          }));

          if (completedTimer) clearTimeout(completedTimer);
          const timer = setTimeout(() => {
            setLiveData(prevData => ({
              ...prevData,
              machineStatus: "READY"
            }));
            setIsTestCompleted(false);
            setCompletedTimer(null);
          }, 1000);
          setCompletedTimer(timer);
        }

        // ── Chart & log while plotting is active ────────────────────────────
        if (isPlotting && !isPausedUI && probeDistance !== null && force !== null) {
          setChartData((prev) => {
            const lastPoint = prev[prev.length - 1];
            if (!lastPoint || lastPoint.x !== probeDistance || lastPoint.y !== force) {
              return [...prev, { x: probeDistance, y: force }];
            }
            return prev;
          });

          // CSV row append
          if (
            isLogging &&
            (lastLogRef.current.distance !== probeDistance ||
              lastLogRef.current.force !== force)
          ) {
            try {
              window.api.appendCSV({
                data: { distance: probeDistance, force_mN: force, temperature: 0 },
                config: selectedConfig,
              });
              lastLogRef.current = { distance: probeDistance, force };
            } catch (e) {
              console.error("CSV append error:", e);
            }
          }
        }

        // ── Auto CSV: start when plotting starts ──────────────────────
        if (isPlotting && !isLogging && !isPausedUI) {
          startCsvLogging();
        }

        // ── 3-Point: Collect live peak data during contact phase ───────────────
        if (
          isTestRunningRef.current &&
          !isPausedUI &&
          probeDistance !== null &&
          force !== null &&
          (status === "SEARCHING CONTACT" || status === "RUNNING")
        ) {
          const newPoint = { x: probeDistance, y: force };
          const lastPt   = currentPeakRef.current[currentPeakRef.current.length - 1];
          if (!lastPt || lastPt.x !== probeDistance || lastPt.y !== force) {
            currentPeakRef.current = [...currentPeakRef.current, newPoint];
            setCurrentPeakData([...currentPeakRef.current]);
            if (force > currentCycleMaxForceRef.current) {
              currentCycleMaxForceRef.current = force;
            }
            if (catheterDistance !== null) {
              currentCycleHorizPosRef.current = catheterDistance;
            }
          }
        }

      } catch (e) {
        console.error("Poll error:", e);
      }
    };

    const intervalId = setInterval(poll, 100);
    poll();
    return () => clearInterval(intervalId);
  }, [
    isConnected,
    isLogging,
    selectedConfig,
    startCsvLogging,
    stopCsvLogging,
    isPaused,
    isStarting,
    isResuming,
    isPausing,
    isResetting,
    isPlotting,
    isTestCompleted,
    completedTimer
  ]);

  // ── Button handlers ───────────────────────────────────────────────────────────
  const handleStart = async () => {
    setIsStarting(true);
    isTestRunningRef.current = true; // Mark 3-pt test as running
    setIsPlotting(true);
    try {
      const res = await window.api.start3Point();
      if (res?.success) {
        setIsPaused(false);
        console.log("✅ START command sent to PLC");
      } else {
        console.error("Start failed:", res?.message);
        setIsStarting(false);
        setIsPlotting(false);
      }
    } catch (e) {
      console.error("Start error:", e);
      setIsStarting(false);
      setIsPlotting(false);
    }
  };

  const handlePause = async () => {
    setIsPausing(true);
    setIsPaused(true);
    try {
      const res = await window.api.stop3Point();
      if (res?.success) {
        setIsPausing(false);
        console.log("⏸️ PAUSE command sent to PLC");
      } else {
        console.error("Pause failed:", res?.message);
        setIsPausing(false);
        setIsPaused(false);
      }
    } catch (e) {
      console.error("Pause error:", e);
      setIsPausing(false);
      setIsPaused(false);
    }
  };

  const handleResume = async () => {
    setIsResuming(true);
    setIsPaused(false);
    setIsPausing(false);
    try {
      const res = await window.api.start3Point();
      if (res?.success) {
        console.log("▶️ RESUME command sent to PLC");
      } else {
        console.error("Resume failed:", res?.message);
        setIsResuming(false);
        setIsPaused(true);
      }
    } catch (e) {
      console.error("Resume error:", e);
      setIsResuming(false);
      setIsPaused(true);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const res = await window.api.reset3Point();
      if (res?.success) {
        setChartData([]);
        lastLogRef.current = { distance: null, force: null };
        setIsPaused(false);
        setIsPlotting(false);
        setIsTestCompleted(false);
        if (completedTimer) {
          clearTimeout(completedTimer);
          setCompletedTimer(null);
        }
        await stopCsvLogging();
        // ── 3-Point: Clear multi-peak chart data ─────────────────────────────
        setPeakSeries([]);
        setCurrentPeakData([]);
        setBarData([]);
        currentPeakRef.current          = [];
        currentCycleMaxForceRef.current = 0;
        currentCycleHorizPosRef.current = null;
        currentCycleStepIdxRef.current  = 0;
        isTestRunningRef.current        = false;
        console.log("🔄 RESET command sent to PLC");
      } else {
        console.error("Reset failed:", res?.message);
        setIsResetting(false);
      }
    } catch (e) {
      console.error("Reset error:", e);
      setIsResetting(false);
    }
  };

  // Button enable rules
  const status = liveData.machineStatus;
  const currentStatus = status;

  const canStart = isConnected &&
                   !isStarting &&
                   !isResetting &&
                   !isResuming &&
                   !isPausedUI &&
                   currentStatus === "READY";

  const canPause = isConnected &&
                   isPlotting &&
                   !isPausedUI &&
                   !isPausing &&
                   !isResetting;

  const canResume = isConnected &&
                    !isResetting &&
                    !isResuming &&
                    isPausedUI;

  const playPauseMode = isPausedUI
    ? 'resume'
    : (isPlotting || TEST_IN_PROGRESS.has(currentStatus))
      ? 'pause'
      : 'start';

  const canPlayPause =
    playPauseMode === 'start' ? canStart :
    playPauseMode === 'pause' ? canPause :
    canResume;

  const handlePlayPause = () => {
    if (playPauseMode === 'start') handleStart();
    else if (playPauseMode === 'pause') handlePause();
    else handleResume();
  };

  const canReset = isConnected &&
                   !isResetting &&
                   currentStatus !== "HOMING" &&
                   (currentStatus === "READY" || RESET_ALLOWED.has(currentStatus));

  // ── 3-Point: Multi-peak line chart (Force vs Vertical Distance) ───────────────
  const multiPeakChartConfig = {
    datasets: [
      // Sealed peaks from previous cycles
      ...peakSeries.map((peak) => ({
        label:            peak.label,
        data:             peak.data,
        borderColor:      peak.color,
        backgroundColor:  peak.color + "18",
        fill:             false,
        tension:          0,
        pointRadius:      0,
        pointHoverRadius: 4,
        borderWidth:      2,
      })),
      // Live peak for the current ongoing cycle
      ...(currentPeakData.length > 0
        ? [{
            label:            `Step ${peakSeries.length + 1} (Live)`,
            data:             currentPeakData,
            borderColor:      PEAK_COLORS[peakSeries.length % PEAK_COLORS.length],
            backgroundColor:  "transparent",
            fill:             false,
            tension:          0,
            pointRadius:      0,
            pointHoverRadius: 4,
            borderWidth:      2,
            borderDash:       [5, 4],
          }]
        : []),
    ],
  };

  const multiPeakChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        display: peakSeries.length > 0 || currentPeakData.length > 0,
        position: "top",
        labels: {
          usePointStyle: true,
          pointStyle: "line",
          color: "#374151",
          font: { size: 10 },
          boxWidth: 24,
          padding: 8,
        },
      },
      tooltip: {
        backgroundColor: "rgba(15,23,42,0.85)",
        titleColor: "#f1f5f9",
        bodyColor: "#cbd5e1",
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        callbacks: {
          title: (ctx) => `Vert. Dist: ${ctx[0].parsed.x.toFixed(2)} mm`,
          label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} mN`,
        },
      },
    },
    scales: {
      x: {
        type: "linear",
        title: {
          display: true,
          text: "Test Distance (mm)",
          color: "#6b7280",
          font: { size: 11, weight: "bold" },
        },
        grid: { color: "rgba(229,231,235,0.5)" },
        ticks: {
          color: "#6b7280",
          font: { size: 10 },
          maxTicksLimit: 10,
          callback: (v) => `${v}mm`,
        },
      },
      y: {
        type: "linear",
        title: {
          display: true,
          text: "Force (mN)",
          color: "#6b7280",
          font: { size: 11, weight: "bold" },
        },
        grid: { color: "rgba(229,231,235,0.5)" },
        ticks: {
          color: "#6b7280",
          font: { size: 10 },
          maxTicksLimit: 8,
          callback: (v) => `${v}mN`,
        },
      },
    },
  };

  // ── 3-Point: Bar chart (Peak Force vs Horizontal Distance) ────────────────────
  const barChartConfig = {
    labels: barData.map((b) => `${b.label}mm`),
    datasets: [
      {
        label:           "Peak Force (mN)",
        data:            barData.map((b) => b.maxForce),
        backgroundColor: barData.map((b) => b.color + "cc"),
        borderColor:     barData.map((b) => b.color),
        borderWidth:     1.5,
        borderRadius:    5,
        borderSkipped:   false,
      },
    ],
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(15,23,42,0.85)",
        titleColor: "#f1f5f9",
        bodyColor: "#cbd5e1",
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        callbacks: {
          title: (ctx) => `Horiz. Dist: ${ctx[0].label}`,
          label: (ctx) => `Peak Force: ${ctx.parsed.y.toFixed(2)} mN`,
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: "Horizontal Distance (mm)",
          color: "#6b7280",
          font: { size: 11, weight: "bold" },
        },
        grid: { display: false },
        ticks: { color: "#6b7280", font: { size: 10 } },
      },
      y: {
        title: {
          display: true,
          text: "Peak Force (mN)",
          color: "#6b7280",
          font: { size: 11, weight: "bold" },
        },
        grid: { color: "rgba(229,231,235,0.5)" },
        ticks: {
          color: "#6b7280",
          font: { size: 10 },
          callback: (v) => `${v}mN`,
        },
        beginAtZero: true,
      },
    },
  };

  // ── Status badge ──────────────────────────────────────────────────────────────
  const meta = getStatusMeta(currentStatus);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="h-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 text-gray-900 overflow-hidden flex flex-col">

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
                ["PAUSE (Stop)", "Use PAUSE button if any issues are observed."],
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
            <ConfigDetails config={selectedConfig} liveData={liveData} />
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-white/80 backdrop-blur-xl border-b border-gray-200/80 shadow-sm">
        <div className={`${isXl ? "px-4 py-2" : isLg ? "px-4 py-2" : "px-3 py-2"} flex items-center justify-between`}>
          <div className="flex items-center space-x-3 min-w-0">
            <div className="min-w-0">
              <h1 className={`${isXl ? "text-2xl" : "text-xl"} font-bold bg-gradient-to-r from-gray-900 to-blue-700 bg-clip-text text-transparent truncate`}>
                3-Point Test
              </h1>
              {selectedConfig && (
                <p className="text-blue-600 text-xs mt-0.5 font-medium truncate hidden sm:block">
                  {selectedConfig.configName}
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
                <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main layout ───────────────────────────────────────────────────────── */}
      <main className={`relative flex ${isXl ? "flex-row" : "flex-col"} flex-1 gap-3 p-3 min-h-0 overflow-hidden`}>

        {/* ── Left / main column ─────────────────────────────────────────────── */}
        <section className={`flex-1 flex flex-col gap-3 min-w-0 min-h-0 ${!isXl ? "pb-16" : ""}`}>

          {/* Status Bar */}
          <div className={`shrink-0 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200/80 shadow-lg ${isXl ? "px-5 py-3" : "px-4 py-2.5"} flex items-center justify-between`}>
            <div className="flex items-center space-x-3">
              <div className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Machine Status</span>
              <span className={`text-sm font-bold ${meta.color}`}>
                {isPausedUI ? "PAUSED" : currentStatus}
              </span>
            </div>
            <div className="flex items-center space-x-3">
              {isLogging && (
                <span className="flex items-center space-x-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span>LOGGING</span>
                </span>
              )}
              {isPausedUI && (
                <span className="flex items-center space-x-1.5 text-xs font-semibold text-yellow-600 bg-yellow-50 border border-yellow-200 px-2.5 py-1 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                  <span>PAUSED</span>
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
            <div className="shrink-0 grid gap-2 grid-cols-4">
              <TeleTile label="Horizontal Distance" value={liveData.catheterDistance} unit="mm" colorClass="from-violet-500 to-indigo-500" bgClass="from-violet-50 to-indigo-50 border-violet-200/60" textClass="text-violet-700" />
              <TeleTile label="Test Distance"   value={liveData.probeDistance}    unit="mm" colorClass="from-green-500 to-emerald-500" bgClass="from-green-50 to-emerald-50 border-green-200/60"   textClass="text-green-700"  />
              <TeleTile label="Force"               value={liveData.force}            unit="mN" colorClass="from-cyan-500 to-blue-500"     bgClass="from-cyan-50 to-blue-50 border-cyan-200/60"       textClass="text-blue-700"   />
              <TeleTile label="Steps (R72)"         value={liveData.stepsToMove}      unit=""   colorClass="from-orange-500 to-amber-500"   bgClass="from-orange-50 to-amber-50 border-orange-200/60"  textClass="text-orange-700" />
            </div>
          )}

          {/* ── Graph 1: Force vs Vertical Distance (multi-peak line chart) ── */}
          <div className="flex-1 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200/80 shadow-xl flex flex-col p-3 sm:p-4 min-h-0">
            <div className="flex items-center justify-between mb-1 shrink-0">
              <div>
                <span className={`${isXl ? "text-sm" : "text-xs"} font-bold text-gray-900`}>
                  Force vs Test Distance
                </span>
                <span className="text-xs text-gray-400 ml-2">Multi-step peaks</span>
              </div>
              {peakSeries.length > 0 && (
                <span className="text-xs text-gray-400">
                  {peakSeries.length} step{peakSeries.length !== 1 ? "s" : ""} done
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0" style={{ minHeight: "140px" }}>
              <Line data={multiPeakChartConfig} options={multiPeakChartOptions} redraw={false} />
            </div>
          </div>

          {/* ── Graph 2: Force vs Horizontal Distance (bar chart) ── */}
          <div
            className="shrink-0 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200/80 shadow-xl flex flex-col p-3 sm:p-4"
            style={{ height: "215px" }}
          >
            <div className="flex items-center justify-between mb-1 shrink-0">
              <div>
                <span className={`${isXl ? "text-sm" : "text-xs"} font-bold text-gray-900`}>
                  Force vs Horizontal Distance
                </span>
                <span className="text-xs text-gray-400 ml-2">Peak per step</span>
              </div>
              {barData.length > 0 && (
                <span className="text-xs text-gray-400">
                  {barData.length} bar{barData.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0">
              {barData.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-gray-400 text-xs text-center">
                    No steps completed yet<br />Start the test to see peak forces
                  </p>
                </div>
              ) : (
                <Bar data={barChartConfig} options={barChartOptions} />
              )}
            </div>
          </div>
        </section>

        {/* ── Right sidebar (xl screens) ─────────────────────────────────────── */}
        {isXl && (
          <section className="w-80 flex flex-col gap-3 min-h-0 overflow-y-auto">

            {/* Config card */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 shadow-xl shrink-0">
              <h3 className="text-sm font-bold text-gray-900 mb-2">Active Configuration</h3>
              <ConfigDetails config={selectedConfig} liveData={liveData} />
            </div>

            {/* Live sensors card */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-3 shadow-xl shrink-0">
              <h3 className="text-sm font-bold text-gray-900 mb-0.5">Real-time Sensors</h3>
              <p className="text-xs text-gray-400 mb-2">Live monitoring data</p>
              <div className="grid gap-2 grid-cols-2">
                <SensorCard label="Horizontal Distance"  value={liveData.catheterDistance} unit="mm" gradient="from-violet-500 to-indigo-500" bg="from-violet-50 to-indigo-50" border="border-violet-200/60" textColor="text-violet-700" icon={<Ruler className="w-4 h-4 text-white" />} />
                <SensorCard label="Test Distance"    value={liveData.probeDistance}    unit="mm" gradient="from-green-500 to-emerald-500" bg="from-green-50 to-emerald-50"   border="border-green-200/60"  textColor="text-green-700"  icon={<Ruler className="w-4 h-4 text-white" />} />
                <SensorCard label="Force"                value={liveData.force}            unit="mN" gradient="from-cyan-500 to-blue-500"    bg="from-cyan-50 to-blue-50"       border="border-cyan-200/60"   textColor="text-blue-700"   icon={<Gauge className="w-4 h-4 text-white" />} />
                <SensorCard label="Steps to Move (R72)"  value={liveData.stepsToMove}      unit=""   gradient="from-orange-500 to-amber-500"  bg="from-orange-50 to-amber-50"    border="border-orange-200/60" textColor="text-orange-700" icon={<Activity className="w-4 h-4 text-white" />} />
              </div>
            </div>

            {/* ── Process Controls (inside sidebar on xl screens) ────────── */}
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-3 shadow-xl shrink-0">
              <h3 className="text-sm font-bold text-gray-900 mb-2">Controls</h3>
              <ControlButtons
                onPlayPause={handlePlayPause}
                playPauseMode={playPauseMode}
                canPlayPause={canPlayPause}
                onReset={handleReset}
                canReset={canReset}
              />
            </div>

          </section>
        )}

        {/* ── Process Controls — Fixed bottom bar on non-xl screens only ──── */}
        {!isXl && (
          <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-gray-200/80 shadow-2xl p-3 z-20">
            <ControlButtons
              onPlayPause={handlePlayPause}
              playPauseMode={playPauseMode}
              canPlayPause={canPlayPause}
              onReset={handleReset}
              canReset={canReset}
            />
          </div>
        )}
      </main>
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

/** Active 3-point config details block */
const ConfigDetails = ({ config, liveData }) => {
  if (!config) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded-r-xl">
        <p className="text-yellow-800 text-sm font-medium">⚠️ No configuration loaded</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <InfoRow label="Config Name"          value={config.configName} highlight />
      <InfoRow label="Test Type"            value="3-Point" />
      <InfoRow label="Test Length"          value={config.testLength ? `${config.testLength} mm` : "--"} />
      <InfoRow label="Measurement Interval" value={config.measurementInterval ? `${config.measurementInterval} s` : "--"} />
      <InfoRow label="Catheter to Load Cell Distance" value={config.catheterDist ? `${config.catheterDist} mm` : "--"} />
      <InfoRow label="Probe Travel Limit"   value={config.probeTravelLimit ? `${config.probeTravelLimit} mm` : "--"} />
      <InfoRow label="Force Limit"          value={config.forceLimit ? `${config.forceLimit} mN` : "--"} />
      <InfoRow label="Test Speed"           value={config.testSpeed ? `${config.testSpeed} mm/s` : "--"} />
      <InfoRow label="Horizontal Speed"     value={config.horizontalSpeed ? `${config.horizontalSpeed} mm/s` : "--"} />
    </div>
  );
};

const InfoRow = ({ label, value, highlight, accent }) => (
  <div className={`rounded-lg px-3 py-2 border ${highlight ? "bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200/50" : accent ? "bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200/50" : "bg-gray-50/80 border-gray-200/60"}`}>
    <p className="text-gray-400 text-xs mb-0.5">{label}</p>
    <p className={`text-sm font-bold ${highlight ? "text-blue-700" : accent ? "text-orange-700" : "text-gray-700"}`}>{value}</p>
  </div>
);

/** Play/Pause toggle + Reset controls */
const ControlButtons = ({ onPlayPause, playPauseMode, canPlayPause, onReset, canReset }) => {
  const isPauseMode = playPauseMode === 'pause';
  const label = playPauseMode === 'start' ? 'START' : playPauseMode === 'pause' ? 'PAUSE' : 'RESUME';
  const buttonId =
    playPauseMode === 'start' ? 'btn-start' :
    playPauseMode === 'pause' ? 'btn-pause' :
    'btn-resume';

  return (
    <div className="flex space-x-2 sm:space-x-3 max-w-2xl mx-auto">
      <button
        id={buttonId}
        onClick={onPlayPause}
        disabled={!canPlayPause}
        className={`flex-1 flex items-center justify-center space-x-2 px-3 py-3 rounded-xl font-bold text-sm sm:text-base transition-all transform ${
          canPlayPause
            ? isPauseMode
              ? "bg-gradient-to-br from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white shadow-xl shadow-yellow-500/25 border border-yellow-400/30 hover:scale-[1.02]"
              : "bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-xl shadow-green-500/25 border border-green-400/30 hover:scale-[1.02]"
            : "bg-gray-100 cursor-not-allowed text-gray-400 border border-gray-200"
        }`}
      >
        {isPauseMode ? (
          <Pause className="w-4 h-4 sm:w-5 sm:h-5" />
        ) : (
          <Play className="w-4 h-4 sm:w-5 sm:h-5" />
        )}
        <span>{label}</span>
      </button>

      <button
        id="btn-reset"
        onClick={onReset}
        disabled={!canReset}
        className={`flex-1 flex items-center justify-center space-x-2 px-3 py-3 rounded-xl font-bold text-sm sm:text-base transition-all transform ${
          canReset
            ? "bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-xl shadow-red-500/25 border border-red-400/30 hover:scale-[1.02]"
            : "bg-gray-100 cursor-not-allowed text-gray-400 border border-gray-200"
        }`}
      >
        <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
        <span>RESET</span>
      </button>
    </div>
  );
};

export default ProcessModeThreePoint;
