import React, { useState, useEffect, useRef } from "react";
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
  Power,
  Camera,
  ArrowLeft,
  Usb,
  Info,
  X,
  Activity,
  Thermometer,
  Gauge,
  Ruler,
  Flame,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

const ProcessMode = () => {
  const navigate = useNavigate();
  const [isConnected, setIsConnected] = useState(false);
  const [sensorData, setSensorData] = useState({
    temperature: "--",
    temperatureDisplay: "-- °C",
    force: "--",
    forceDisplay: "-- mN",
    force_mN: "--",
    force_mN_Display: "-- mN",
    distance: "--",
    distanceDisplay: "-- mm",
    status: "READY",
  });
  const [readData, setReadData] = useState({
    temperature: "--",
    temperatureDisplay: "-- °C",
    force: "--",
    forceDisplay: "-- mN",
    force_mN: "--",
    force_mN_Display: "-- mN",
    distance: "--",
    distanceDisplay: "-- mm",
  });
  const [chartData, setChartData] = useState([]);
  const [reachedCurves, setReachedCurves] = useState({});
  const [isProcessRunning, setIsProcessRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isHoming, setIsHoming] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [configButtonPos, setConfigButtonPos] = useState({
    x: window.innerWidth - 70,
    y: 168,
  });
  const [isDraggingConfig, setIsDraggingConfig] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const startTimeRef = useRef(Date.now());
  const pauseTimeRef = useRef(null);
  const [isRetractionEnabled, setIsRetractionEnabled] = useState(false);
  const [isRetractionActive, setIsRetractionActive] = useState(false);
  const [isRetractionPaused, setIsRetractionPaused] = useState(false);
  const [isRetractionCompleted, setIsRetractionCompleted] = useState(false);
  const [showForceLimitAlert, setShowForceLimitAlert] = useState(false);

  // Temperature check state
  const [temperatureStatus, setTemperatureStatus] = useState({
    isHeatingRequired: false,
    isHeatingActive: false,
    showHeatingDialog: false,
    heaterButtonDisabled: false,
    targetTemperature: null,
    lastHeatingState: null,
  });

  const [isLogging, setIsLogging] = useState(false);
  const lastLoggedDataRef = useRef({ time: null, distance: null, force: null });

  const [screenSize, setScreenSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // NEW: COIL_LLS status state
  const [coilLLSStatus, setCoilLLSStatus] = useState(false);
  const [powerActive, setPowerActive] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isXlScreen = screenSize.width >= 1920;
  const isLgScreen = screenSize.width >= 1366 && screenSize.width < 1920;
  const isMdScreen = screenSize.width >= 1024 && screenSize.width < 1366;
  const isSmScreen = screenSize.width < 1024;

  //-------------------------------------------------------------------------//
  // NEW: COIL_LLS Monitoring - Continuously monitor COIL_LLS status
  //-------------------------------------------------------------------------//
  useEffect(() => {
    console.log("🔍 Setting up COIL_LLS monitoring for Process Mode...");

    // Event listener for real-time COIL_LLS updates from main process
    const handleLLSStatusChange = (event) => {
      // The event data comes as string 'true' or 'false' from main.js
      const isLLSTrue = event.detail === "true" || event.detail === true;

      console.log(
        `🔄 Process Mode - COIL_LLS Event Received: ${isLLSTrue ? "TRUE" : "FALSE"}`,
      );

      // Update COIL_LLS status state
      setCoilLLSStatus(isLLSTrue);

      // If COIL_LLS becomes TRUE, update sensor status to READY (if not in other states)
      if (isLLSTrue && sensorData.status === "HOMING") {
        console.log("✅ Homing complete - changing status to READY");
        setSensorData((prev) => ({ ...prev, status: "READY" }));
        setIsHoming(false);
      }

      // If COIL_LLS becomes FALSE, motor has moved away from home position
      if (!isLLSTrue) {
        console.log("🔄 Motor moved away from home - COIL_LLS is FALSE");
      }
    };

    // Setup event listener for COIL_LLS changes
    window.addEventListener("lls-status-change", handleLLSStatusChange);

    // Listen for power status updates
    const handlePowerStatusChange = (event) => {
      setPowerActive(event.detail === true);
    };
    window.addEventListener("power-status-change", handlePowerStatusChange);

    // Initial power status check
    window.api.checkPowerStatus().then(status => {
      setPowerActive(status.active);
    }).catch(err => console.error("Error checking initial power status:", err));

    console.log("✅ Process Mode status monitoring setup complete");

    // Cleanup
    return () => {
      console.log("🧹 Cleaning up Process Mode status monitoring");
      window.removeEventListener("lls-status-change", handleLLSStatusChange);
      window.removeEventListener("power-status-change", handlePowerStatusChange);
    };
  }, [sensorData.status]);

  useEffect(() => {
    let intervalId;

    const pollSensorData = async () => {
      try {
        const data = await window.api.readData();

        if (data && data.success) {
          // Fix: Handle 0 properly (0 is falsy in JS)
          const formatVal = (val, unit) =>
            val !== undefined && val !== null && val !== "--"
              ? `${val} ${unit}`
              : `-- ${unit}`;
          const formatTemp = (val) => {
            if (val === undefined || val === null || val === "--")
              return "-- °C";
            const num = parseFloat(val);
            if (!isNaN(num) && num > 100) return "ERROR 01";
            return `${val} °C`;
          };
          const rawVal = (val) =>
            val !== undefined && val !== null ? val : "--";

          // Helper for number formatting
          const toFixed2 = (val) => {
            const num = parseFloat(val);
            return isNaN(num) ? val : num.toFixed(2);
          };

          setReadData({
            temperature: rawVal(data.temperature),
            temperatureDisplay: formatTemp(data.temperature),
            force: rawVal(data.force_mN),
            forceDisplay: formatVal(toFixed2(data.force_mN), "mN"),
            force_mN: rawVal(data.force_mN),
            force_mN_Display: formatVal(toFixed2(data.force_mN), "mN"),
            distance: rawVal(data.distance),
            distanceDisplay: formatVal(data.distance, "mm"),
          });

          setSensorData((prev) => ({
            ...prev,
            temperature: formatTemp(data.temperature),
            force: formatVal(toFixed2(data.force_mN), "mN"),
            distance: formatVal(data.distance, "mm"),
          }));

          // Updated: Continuously update COIL_LLS status from polling
          if (data.coilLLS !== undefined) {
            setCoilLLSStatus(Boolean(data.coilLLS));
          }

          // ---------------------------------------------------------------------------
          // NEW: Auto-Pause if Force Threshold Exceeded
          // ---------------------------------------------------------------------------
          if (
            selectedConfig &&
            (isProcessRunning || isRetractionActive) &&
            !isPaused &&
            !isRetractionPaused &&
            data.force_mN !== "--"
          ) {
            const currentForce = parseFloat(data.force_mN);
            const thresholdForce = parseFloat(selectedConfig.thresholdForce);

            if (
              !isNaN(currentForce) &&
              !isNaN(thresholdForce) &&
              currentForce >= thresholdForce
            ) {
              console.warn(
                `⚠️ FORCE THRESHOLD EXCEEDED! Current=${currentForce}mN, Limit=${thresholdForce}mN. Auto-pausing...`,
              );

              // Execute Stop Command
              window.api
                .stop()
                .catch((err) => console.error("Failed to auto-stop:", err));

              // Update State to PAUSED
              setIsProcessRunning(false);
              setIsPaused(true);
              pauseTimeRef.current = Date.now();

              if (sensorData.status === "RETRACTION" || isRetractionActive) {
                setIsRetractionPaused(true);
                setSensorData((prev) => ({
                  ...prev,
                  status: "RETRACTION PAUSED",
                }));
              } else {
                setSensorData((prev) => ({ ...prev, status: "PAUSED" }));
              }

              // Show Force Limit Alert
              setShowForceLimitAlert(true);
            }
          }

          if (
            selectedConfig &&
            data.distance !== "--" &&
            data.distance !== undefined &&
            !isRetractionEnabled &&
            isProcessRunning &&
            !isPaused
          ) {
            const currentDistance = parseFloat(data.distance);
            const targetDistance = parseFloat(selectedConfig.pathlength);

            const curves = selectedConfig?.curveDistances || {};
            Object.entries(curves).forEach(([curveLabel, curveVal]) => {
              const threshold = Number(curveVal);

              if (!reachedCurves[curveLabel] && currentDistance >= threshold) {
                console.log(
                  `🔥 Curve ${curveLabel} reached at ${threshold} mm`,
                );
                setReachedCurves((prev) => ({
                  ...prev,
                  [curveLabel]: true,
                }));
              }
            });

            console.log(
              `🔍 Distance Check: Current=${currentDistance}mm, Target=${targetDistance}mm, isValid=${!isNaN(currentDistance) && !isNaN(targetDistance)}`,
            );

            if (!isNaN(currentDistance) && !isNaN(targetDistance)) {
              if (Math.round(currentDistance) === Math.round(targetDistance)) {
                console.log(
                  `✅✅✅ Target distance reached exactly! ${currentDistance}mm = ${targetDistance}mm (rounded)`,
                );
                setIsRetractionEnabled(true);
                setSensorData((prev) => ({
                  ...prev,
                  status: "INSERTION COMPLETED",
                }));
              } else {
                console.log(
                  `📏 Not yet reached: ${currentDistance}mm vs ${targetDistance}mm (rounded: ${Math.round(currentDistance)} vs ${Math.round(targetDistance)})`,
                );
              }
            }
          }

          // Check if retraction is completed (distance = 0)
          if (
            isRetractionActive &&
            !isRetractionPaused &&
            data.distance !== "--" &&
            data.distance !== undefined
          ) {
            const currentDistance = parseFloat(data.distance);
            console.log(
              `🔍 Retraction Check: Current distance=${currentDistance}mm, isRetractionActive=${isRetractionActive}, isRetractionPaused=${isRetractionPaused}`,
            );

            if (!isNaN(currentDistance) && Math.round(currentDistance) === 0) {
              console.log("✅✅✅ RETRACTION COMPLETED! Distance = 0mm");
              setIsRetractionCompleted(true);
              setIsRetractionActive(false);
              setIsRetractionEnabled(false);
              setIsProcessRunning(false);
              setSensorData((prev) => ({ ...prev, status: "READY" }));

              // Clear chart data
              setChartData([]);

              // Clear reached curves
              setReachedCurves({});

              // Stop CSV logging
              stopCsvLogging();

              console.log(
                "🔄 System reset to READY state after retraction completion",
              );
            }
          }

          if (
            isProcessRunning ||
            sensorData.status === "PAUSED" ||
            sensorData.status === "RETRACTION PAUSED"
          ) {
            const currentTime = (Date.now() - startTimeRef.current) / 1000;
            const timeFormatted = parseFloat(currentTime.toFixed(1));

            setChartData((prev) => {
              const newDataPoint = {
                time: timeFormatted,
                distance: parseFloat(data.distance) || 0,
                force: parseFloat(data.force_mN) || 0,
              };

              const newData = [...prev, newDataPoint];
              return newData;
            });
          }

          if (
            (isProcessRunning || isRetractionActive) &&
            !isPaused &&
            !isRetractionPaused &&
            data.distance !== "--" &&
            data.force_mN !== "--"
          ) {
            const currentTime = (Date.now() - startTimeRef.current) / 1000;
            logSensorData(currentTime.toFixed(1), data.distance, data.force_mN);
          }
        } else if (data && !data.success) {
          setReadData((prev) => ({
            ...prev,
            temperatureDisplay: "-- °C",
            forceDisplay: "-- mN",
            distanceDisplay: "-- mm",
          }));
        }
      } catch (error) {
        console.error("Error polling sensor data:", error);
      }
    };

    if (isConnected) {
      // Since readData is now cached in main process, we can poll fast without penalty
      intervalId = setInterval(pollSensorData, 100);
      pollSensorData();
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [
    isConnected,
    isProcessRunning,
    isPaused,
    sensorData.status,
    selectedConfig,
    isRetractionEnabled,
    isRetractionActive,
    isRetractionPaused,
  ]);

  // Check temperature when component mounts or config changes
  useEffect(() => {
    if (readData.temperature !== "--") {
      const realTimeTemp = parseFloat(readData.temperature);
      // const targetTemp = parseFloat(selectedConfig.temperature); // IGNORED per new requirement

      if (!isNaN(realTimeTemp)) {
        // Condition: Process should START if 35 < realTimeTemp < 39
        // So we BLOCK if realTimeTemp <= 35 OR realTimeTemp >= 39

        // Strict range based on user request: "greater than 35 or less than 39" (interpreted as range)
        const isTempTooLow = realTimeTemp <= 35;
        const isTempTooHigh = realTimeTemp >= 39;
        const isTempValid = !isTempTooLow && !isTempTooHigh;

        // Check if process is active (running, paused, or retracting)
        const isProcessActive =
          isProcessRunning ||
          isRetractionActive ||
          isPaused ||
          isRetractionPaused;

        console.log(
          `🌡️ Temperature Check: Real=${realTimeTemp}°C, Range=[35-39], Valid=${isTempValid}`,
        );

        if (
          !isTempValid &&
          !temperatureStatus.isHeatingActive &&
          !isProcessActive
        ) {
          // Show dialog if temperature is invalid AND process is NOT active

          // If too low, we can suggest heating. If too high, we just block.
          if (isTempTooLow) {
            setTemperatureStatus((prev) => ({
              ...prev,
              isHeatingRequired: true,
              showHeatingDialog: true,
              heaterButtonDisabled: false,
              // targetTemperature: 37, // Optional: default target
            }));
          } else if (isTempTooHigh) {
            // High Temp Case: Show dialog to explain blockage
            setTemperatureStatus((prev) => ({
              ...prev,
              isHeatingRequired: true, // Reuse this flag to block start
              showHeatingDialog: true, // Show blocking dialog
              // heaterButtonDisabled: true // Optional: explicit disable
            }));
            // Also ensure heater is OFF if too high
            if (temperatureStatus.isHeatingActive) turnOffHeater();
          }
        } else if (isTempValid) {
          // If in range
          if (temperatureStatus.isHeatingActive && !isTempTooLow) {
            // If we were heating and now we are good (or too high), stop.
            // Note: User logic implies valid is 35-39. Heating takes us UP.
            // If we reach 35.1, we are valid.
            // We can keep heating until we reach some target, but technically valid range starts at 35.
            // Let's rely on the manual heater toggle or auto-off if we defined a target.
            // For now, if we are in valid range, we UNBLOCK.
          }

          // Unblock start
          setTemperatureStatus((prev) => ({
            ...prev,
            isHeatingRequired: false,
            showHeatingDialog: false,
            // isHeatingActive: false, // Keep active if user wants to keep heating within range
            heaterButtonDisabled: false,
          }));

          console.log("✅ Temperature in valid range (35-39) - dialog closed");
        }
      }
    }
  }, [
    readData.temperature,
    isProcessRunning,
    isRetractionActive,
    isPaused,
    isRetractionPaused,
    temperatureStatus.isHeatingActive,
  ]);

  // Monitor temperature to auto-close dialog when target is reached or exceeded
  useEffect(() => {
    if (temperatureStatus.isHeatingActive && readData.temperature !== "--") {
      const realTimeTemp = parseFloat(readData.temperature);
      // const targetTemp = temperatureStatus.targetTemperature || parseFloat(selectedConfig.temperature);
      // User requirement: Valid if > 35.
      // If we are heating, we assume we were below 35.
      // We should probably stop if we are comfortably inside the range (e.g. > 35).

      if (!isNaN(realTimeTemp)) {
        // Check if temperature is valid (e.g. > 35)
        const isTempReached = realTimeTemp > 35.0;

        if (isTempReached) {
          console.log(
            `✅ Valid temperature reached! Real=${realTimeTemp}°C > 35°C`,
          );

          // Turn off heater
          // turnOffHeater(); // User didn't explicitly say to auto-off, but it's good practice.
          // Note: If they want to reach 37, stopping at 35.01 might be annoying.
          // I will leave the Heater ON but close the dialog/unblock.

          // Actually, let's just update validity.
          setTemperatureStatus((prev) => ({
            ...prev,
            isHeatingRequired: false,
            showHeatingDialog: false, // Hide dialog
            // isHeatingActive: false, // Don't force off, let user decide or reach target
            heaterButtonDisabled: false,
          }));
        }
      }
    }
  }, [readData.temperature, temperatureStatus.isHeatingActive]);

  // Check temperature when component mounts
  useEffect(() => {
    if (selectedConfig) {
      // Small delay to ensure data is loaded
      setTimeout(() => {
        if (readData.temperature !== "--") {
          const realTimeTemp = parseFloat(readData.temperature);
          // const targetTemp = parseFloat(selectedConfig.temperature);

          if (!isNaN(realTimeTemp)) {
            // Range check: 35-39
            const isTempTooLow = realTimeTemp <= 35;
            const isTempTooHigh = realTimeTemp >= 39;
            const isInvalid = isTempTooLow || isTempTooHigh;

            if (isInvalid) {
              console.log(
                `🔥 Temperature check on entry: Invalid Range (${realTimeTemp}°C). Blocking start.`,
              );
              setTemperatureStatus((prev) => ({
                ...prev,
                isHeatingRequired: true,
                showHeatingDialog: true, // Show dialog for BOTH low and high temp
                // targetTemperature: 37,
                heaterButtonDisabled: false,
              }));
            }
          }
        }
      }, 1000);
    }
  }, [selectedConfig]);

  const turnOnHeater = async () => {
    try {
      console.log("🔥 Turning heater ON...");
      setTemperatureStatus((prev) => ({
        ...prev,
        heaterButtonDisabled: true,
      }));

      const result = await window.api.heater();

      if (result && result.success) {
        console.log("✅ Heater turned ON successfully");
        setTemperatureStatus((prev) => ({
          ...prev,
          isHeatingActive: true,
        }));
      } else {
        console.error("❌ Failed to turn heater ON");
        setTemperatureStatus((prev) => ({
          ...prev,
          heaterButtonDisabled: false,
        }));
      }
    } catch (error) {
      console.error("❌ Error turning heater ON:", error);
      setTemperatureStatus((prev) => ({
        ...prev,
        heaterButtonDisabled: false,
      }));
    }
  };

  const turnOffHeater = async () => {
    try {
      console.log("🔥 Turning heater OFF...");

      const result = await window.api.heaterOff();

      if (result && result.success) {
        console.log("✅ Heater turned OFF successfully");
        setTemperatureStatus((prev) => ({
          ...prev,
          isHeatingActive: false,
          heaterButtonDisabled: false,
        }));
      }
    } catch (error) {
      console.error("❌ Error turning heater OFF:", error);
    }
  };

  const closeHeatingDialog = async () => {
    // Turn off heater and navigate back
    console.log(
      "🔙 Closing heating dialog: Turning heater OFF and navigating back...",
    );
    await turnOffHeater();
    navigate("/handle-config/load");
  };

  //-------------------------------------------------------------------------//

  useEffect(() => {
    const config = localStorage.getItem("selectedConfig");
    if (config) {
      setSelectedConfig(JSON.parse(config));
    }
  }, []);

  // UPDATED: LLS Status Change Handler - This should handle events from main.js
  useEffect(() => {
    const handleLLSStatusChange = (event) => {
      if (event.detail === "true") {
        console.log("🔄 COIL_LLS detected TRUE");

        // Update COIL_LLS status
        setCoilLLSStatus(true);

        // Only update status to READY if we're coming from HOMING state
        setSensorData((prev) => {
          console.log(
            `📊 Previous status: ${prev.status}, isHoming: ${isHoming}`,
          );

          // If previous status was HOMING, change to READY
          if (prev.status === "HOMING") {
            console.log("✅ Homing complete, changing status to READY");
            setIsHoming(false);
            return { ...prev, status: "READY" };
          }

          // If previous status was INSERTION, RETRACTION, or their paused states,
          // don't change the status
          console.log(
            `⚠️ COIL_LLS triggered but status remains: ${prev.status} (not from HOMING)`,
          );
          return prev; // Keep the same status
        });
      } else if (event.detail === "false") {
        console.log("🔄 COIL_LLS detected FALSE");
        setCoilLLSStatus(false);
      }
    };

    window.addEventListener("lls-status-change", handleLLSStatusChange);

    return () => {
      window.removeEventListener("lls-status-change", handleLLSStatusChange);
    };
  }, []);

  const startCsvLogging = async () => {
    if (!selectedConfig) {
      console.error("No configuration selected for logging");
      return;
    }

    try {
      console.log("🟡 Starting CSV logging with config:", selectedConfig);
      const result = await window.api.startCSV(selectedConfig);
      if (result.success) {
        setIsLogging(true);
        console.log("✅ CSV logging started:", result.fileName);
        lastLoggedDataRef.current = { time: null, distance: null, force: null };
      } else {
        console.error("❌ Failed to start CSV logging:", result.error);
      }
    } catch (error) {
      console.error("❌ Error starting CSV logging:", error);
    }
  };

  const stopCsvLogging = async () => {
    if (isLogging) {
      try {
        const result = await window.api.stopCSV();
        if (result.success) {
          setIsLogging(false);
          console.log("🟡 CSV logging stopped:", result.fileName);
        }
      } catch (error) {
        console.error("Error stopping CSV logging:", error);
      }
    }
  };

  const logSensorData = async (time, distance, force) => {
    const timeNum = parseFloat(time);
    const distNum = parseFloat(distance);
    const forceNum = parseFloat(force);

    if (
      isNaN(timeNum) ||
      isNaN(distNum) ||
      isNaN(forceNum) ||
      distance === "--" ||
      force === "--"
    ) {
      return;
    }

    if (
      lastLoggedDataRef.current.time === timeNum &&
      lastLoggedDataRef.current.distance === distNum &&
      lastLoggedDataRef.current.force === forceNum
    ) {
      return;
    }

    try {
      console.log(
        `📊 ATTEMPTING LOG: Time=${timeNum}s, Distance=${distNum}mm, Force=${forceNum}mN, isLogging=${isLogging}`,
      );

      // Send data with config included
      await window.api.appendCSV({
        data: {
          distance: distNum,
          force_mN: forceNum,
          temperature: parseFloat(readData.temperature) || 0,
        },
        config: selectedConfig, // Make sure config is included
      });

      lastLoggedDataRef.current = {
        time: timeNum,
        distance: distNum,
        force: forceNum,
      };
      console.log(
        `✅ SUCCESSFULLY LOGGED: Time=${timeNum}s, Distance=${distNum}mm, Force=${forceNum}mN`,
      );
    } catch (error) {
      console.error("❌ Error logging sensor data:", error);
    }
  };

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const connection = await window.api.checkConnection();
        setIsConnected(connection.connected);

        if (!connection.connected) {
          setReadData((prev) => ({
            ...prev,
            temperatureDisplay: "-- °C",
            forceDisplay: "-- mN",
            distanceDisplay: "-- mm",
          }));
        }
      } catch (error) {
        console.error("Error checking connection:", error);
        setIsConnected(false);
      }
    };

    checkConnection();

    const handleModbusStatusChange = (event) => {
      setIsConnected(event.detail === "connected");
    };

    window.addEventListener("modbus-status-change", handleModbusStatusChange);

    return () => {
      window.removeEventListener(
        "modbus-status-change",
        handleModbusStatusChange,
      );
    };
  }, []);

  const handleReconnect = async () => {
    try {
      console.log("Attempting to reconnect...");
      const result = await window.api.reconnect();
      if (result.success && result.connected) {
        setIsConnected(true);
        console.log("Reconnect successful");
      } else {
        console.log("Reconnect failed");
      }
    } catch (error) {
      console.error("Reconnect error:", error);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDraggingConfig) {
        setConfigButtonPos({
          x: Math.max(
            0,
            Math.min(window.innerWidth - 56, e.clientX - dragOffset.x),
          ),
          y: Math.max(
            0,
            Math.min(window.innerHeight - 56, e.clientY - dragOffset.y),
          ),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDraggingConfig(false);
    };

    const handleTouchMove = (e) => {
      if (isDraggingConfig && e.touches.length > 0) {
        setConfigButtonPos({
          x: Math.max(
            0,
            Math.min(
              window.innerWidth - 56,
              e.touches[0].clientX - dragOffset.x,
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              window.innerHeight - 56,
              e.touches[0].clientY - dragOffset.y,
            ),
          ),
        });
      }
    };

    const handleTouchEnd = () => {
      setIsDraggingConfig(false);
    };

    if (isDraggingConfig) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handleTouchEnd);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDraggingConfig, dragOffset]);

  const handleStart = async () => {
    if (!selectedConfig) {
      console.error("No configuration selected");
      return;
    }

    // Prevent start if heating is required
    if (temperatureStatus.isHeatingRequired) {
      console.log("❌ Cannot start process - heating required");
      return;
    }

    try {
      console.log("🚀 Starting process...");
      let result;

      // Determine if we are starting fresh or from pause
      const isResuming = isPaused || isRetractionPaused;

      if (isResuming) {
        console.log("⏯️ Resuming process from pause...");
        result = await window.api.start();
      } else {
        result = await window.api.start();
        // Also ensure heater is on when starting fresh
        await window.api.heater();
      }

      console.log("Start Result:", result);

      if (result && result.success) {
        console.log("✅ Start command accepted by main process");
        setIsProcessRunning(true);
        setIsPaused(false);
        setIsRetractionPaused(false);
        setIsRetractionCompleted(false);
        setIsHoming(false);

        if (isRetractionEnabled && isRetractionActive) {
          setSensorData((prev) => ({ ...prev, status: "RETRACTION" }));
        } else {
          setSensorData((prev) => ({ ...prev, status: "INSERTION" }));
        }

        // Handle time adjustment for seamless graph resumption
        if (isResuming && pauseTimeRef.current) {
          const pauseDuration = Date.now() - pauseTimeRef.current;
          startTimeRef.current += pauseDuration;
          console.log(
            `⏱️ Adjusted start time by ${pauseDuration}ms to account for pause`,
          );
          pauseTimeRef.current = null;
        } else if (!isResuming) {
          // Only reset start time if not resuming
          startTimeRef.current = Date.now();
          pauseTimeRef.current = null;
          // Clear chart if new run
          if (!isRetractionActive) {
            setChartData([]);
          }
        }

        console.log("🟡 Process started/resumed, starting CSV logging...");
        if (!isLogging) {
          if (selectedConfig) {
            startCsvLogging();
          } else {
            console.error("❌ Cannot start logging: missing config");
          }
        }
      } else {
        console.error("Failed to start process:", result?.message);
      }
    } catch (error) {
      console.error("Failed to start process:", error);
    }
  };

  const handlePause = async () => {
    try {
      console.log("⏸️ Pausing process...");
      const result = await window.api.stop();

      if (result && result.success) {
        setIsProcessRunning(false);
        setIsPaused(true);

        // Track pause time
        pauseTimeRef.current = Date.now();

        // Handle retraction pause state correctly
        if (sensorData.status === "RETRACTION") {
          setIsRetractionPaused(true);
          setSensorData((prev) => ({ ...prev, status: "RETRACTION PAUSED" }));
        } else {
          setIsRetractionActive(false);
          setIsRetractionPaused(false);

          if (
            sensorData.status === "INSERTION" ||
            sensorData.status === "INSERTION COMPLETED"
          ) {
            setSensorData((prev) => ({ ...prev, status: "PAUSED" }));
          }
        }

        console.log("Process paused");
      }
    } catch (error) {
      console.error("Failed to pause process:", error);
    }
  };

  const handleRetraction = async () => {
    try {
      console.log("🔄 Starting retraction...");

      // If running, stop first
      if (isProcessRunning && !isPaused && !isRetractionPaused) {
        console.log("⚠️ Process running, stopping before retraction...");
        await window.api.stop();
        await new Promise((r) => setTimeout(r, 200));
      }

      const result = await window.api.retraction();

      if (result && result.success) {
        setIsRetractionActive(true);
        setIsRetractionPaused(false);
        setIsRetractionCompleted(false);
        setIsProcessRunning(true);
        setIsPaused(false);
        setSensorData((prev) => ({ ...prev, status: "RETRACTION" }));

        // Ensure logging is active
        if (!isLogging && selectedConfig) {
          console.log("📝 Ensuring CSV logging is active for retraction");
          startCsvLogging();
        }

        console.log("✅ Retraction started");
      } else {
        console.error("Failed to start retraction:", result?.message);
      }
    } catch (error) {
      console.error("Failed to start retraction:", error);
    }
  };

  const handleReset = async () => {
    try {
      console.log("🔄 Resetting process...");
      const result = await window.api.reset();

      if (result && result.success) {
        setIsProcessRunning(false);
        setIsPaused(false);
        setIsHoming(true);
        setIsRetractionEnabled(false);
        setIsRetractionActive(false);
        setIsRetractionPaused(false);
        setIsRetractionCompleted(false);
        setChartData([]);
        setReachedCurves({});
        setSensorData((prev) => ({
          ...prev,
          force: "--",
          distance: "--",
          status: "HOMING",
        }));

        // Reset temperature status
        setTemperatureStatus({
          isHeatingRequired: false,
          isHeatingActive: false,
          showHeatingDialog: false,
          heaterButtonDisabled: false,
          targetTemperature: null,
          lastHeatingState: null,
        });

        stopCsvLogging();
        console.log("Process reset");
      } else {
        console.error("Failed to reset process:", result?.message);
      }
    } catch (error) {
      console.error("Failed to reset process:", error);
    }
  };

  const shouldDisableButtons = () => {
    return isHoming || !selectedConfig;
  };

  // Add this to prevent process start when heating is required
  const shouldDisableStartButton = () => {
    if (shouldDisableButtons()) return true;
    if (temperatureStatus.isHeatingRequired) return true; // Disable if heating is required
    if (isRetractionEnabled && !isRetractionPaused) return true;
    if (isRetractionPaused) return true;
    if (isRetractionCompleted) return false;
    if (isProcessRunning && !isPaused && !isRetractionPaused) return true;
    return false;
  };

  const shouldDisablePauseButton = () => {
    if (shouldDisableButtons()) return true;
    if (isRetractionCompleted) return true;

    if (
      !isProcessRunning &&
      !isPaused &&
      !isRetractionActive &&
      !isRetractionPaused
    ) {
      return true;
    }

    return false;
  };

  // UPDATED: Reset button logic based on COIL_LLS status
  const shouldDisableRetractionButton = () => {
    if (shouldDisableButtons()) return true;
    if (isRetractionCompleted) return true;
    if (!isRetractionEnabled) return true;

    if (isRetractionActive && !isRetractionPaused) return true;

    return false;
  };

  const shouldDisableResetButton = () => {
    // If COIL_LLS is TRUE, disable reset button
    if (coilLLSStatus) {
      console.log("🔄 Reset button disabled because COIL_LLS is TRUE");
      return true;
    }

    // Other conditions from original logic
    if (!selectedConfig || isHoming) return true;
    if (isRetractionCompleted) return true; // Disable when retraction is completed

    return false;
  };

  const handleBack = () => {
    navigate("/handle-config/load");
  };

  const getStartButtonText = () => {
    if (isPaused && sensorData.status === "PAUSED") return "RESUME";
    if (isRetractionCompleted) return "START"; // Show START when retraction is completed
    return "START";
  };

  const getRetractionButtonText = () => {
    if (isRetractionPaused) return "RESUME RETRACTION";
    return "RETRACTION";
  };

  const shouldDisableBackButton = () => {
    if (isRetractionCompleted) return false; // Enable back button when retraction is completed
    return sensorData.status !== "READY";
  };

  const shouldDisablePowerButton = () => {
    if (isRetractionCompleted) return false; // Enable power button when retraction is completed
    return sensorData.status !== "READY";
  };

  // NEW: Helper function to get COIL_LLS status display
  const getCoilLLSDisplay = () => {
    return coilLLSStatus ? "TRUE" : "FALSE";
  };

  // NEW: Helper function to get COIL_LLS color
  const getCoilLLSColor = () => {
    return coilLLSStatus ? "text-green-600" : "text-red-600";
  };

  // Prepare chart data for react-chartjs-2
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 0, // Disable animations to prevent flickering
    },
    interaction: {
      intersect: false,
      mode: "index",
    },
    plugins: {
      // legend: {
      //   display: false,
      // },
      legend: {
        display: true,
        position: 'top',
        labels: {
          filter: function(item) {
            // Show all legends including curves
            return true;
          },
          usePointStyle: true,
          pointStyle: 'line',
          padding: 20,
          font: {
            size: 11
          }
        },
        onClick: (e, legendItem, legend) => {
          // Prevent hiding of curve lines when clicked
          const index = legendItem.datasetIndex;
          const meta = legend.chart.getDatasetMeta(index);
          
          // Allow toggling for force line (index 0), but not for curves
          if (index === 0) {
            meta.hidden = meta.hidden === null ? !legend.chart.data.datasets[index].hidden : null;
            legend.chart.update();
          }
        }
      },
      
      tooltip: {
        mode: "index",
        intersect: false,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        titleColor: "#fff",
        bodyColor: "#fff",
        borderColor: "#3b82f6",
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        // displayColors: false,
        callbacks: {
          label: function (context) {
            const label = context.dataset.label || '';

            // For curve lines, show custom label
            if (label.includes('Curve')) {
              const curveLabel = label.split(' ')[1]; // Get curve number
              return `${label} - Reached: ${reachedCurves[curveLabel] ? 'Yes' : 'No'}`;
            }
            
            // For force line
            return `Force: ${context.parsed.y.toFixed(2)} mN`;
          },
          title: function(context) {
            return `Distance: ${context[0].parsed.x.toFixed(2)} mm`;

            // Skip label for vertical lines (they're dataset index > 0)
          //   if (context.datasetIndex > 0) return null;
          //   return `Force: ${context.parsed.y.toFixed(2)} mN`;
          // },
          // title: function (context) {
          //   return `Distance: ${context[0].parsed.x.toFixed(2)} mm`;
          // },
          // Add this to filter out curve line tooltips
          // filter: function (tooltipItem) {
          //   // Only show tooltip for the main force line (dataset 0)
          //   return tooltipItem.datasetIndex === 0;
          },
        },
      },
    },
    scales: {
      x: {
        type: "linear",
        title: {
          display: true,
          text: "Distance (mm)",
          color: "#6b7280",
          font: {
            size: 12,
            weight: "bold",
          },
        },
        grid: {
          color: "rgba(229, 231, 235, 0.5)",
          drawBorder: true,
          borderColor: "rgba(229, 231, 235, 1)",
        },
        ticks: {
          color: "#6b7280",
          font: {
            size: 11,
          },
          maxTicksLimit: 10,
          // Add these lines
          callback: function(value, index, values) {
            // Add markers for curve distances on x-axis
            const curveAtThisValue = selectedConfig?.curveDistances 
              ? Object.values(selectedConfig.curveDistances).includes(value.toString())
              : false;
            
            if (curveAtThisValue) {
              // return {
              //   value: value,
              //   label: `${value}mm ⚑`
              // };
              return `${value}mm `;
            }
            return `${value}mm`;
          }
        },
      },
      y: {
        type: "linear",
        title: {
          display: true,
          text: "Force (mN)",
          color: "#6b7280",
          font: {
            size: 12,
            weight: "bold",
          },
        },
        grid: {
          color: "rgba(229, 231, 235, 0.5)",
          drawBorder: true,
          borderColor: "rgba(229, 231, 235, 1)",
        },
        ticks: {
          color: "#6b7280",
          font: {
            size: 11,
          },
          maxTicksLimit: 8,
        },
      },
    },
    elements: {
      line: {
        tension: 0, // Disable bezier curves for straight lines
        borderWidth: 2.5,
        fill: false,
      },
      point: {
        radius: 0, // Hide points for cleaner look
        hoverRadius: 5,
      },
    },
  };

  const chartConfig = {
    datasets: [
      {
        label: "Force",
        data: chartData.map((point) => ({ x: point.distance, y: point.force })),
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        fill: false,
        pointBackgroundColor: "#3b82f6",
        pointBorderColor: "#fff",
        pointHoverBackgroundColor: "#fff",
        pointHoverBorderColor: "#3b82f6",

        yAxisID: 'y',
        xAxisID: 'x',
      },
      // ADD CURVE LINES AS SEPARATE DATASETS
      ...(selectedConfig?.curveDistances
        ? Object.entries(selectedConfig.curveDistances)
          // .map(([label, value]) => {
            .map(([label, value], index) => {
            const distance = Number(value);
            if (isNaN(distance)) return null;

            return {
              // label: `Curve ${label}`,
              label: `Curve ${label} at ${distance}mm`,
              data: [
                {
                  x: distance,
                  y:
                    chartData.length > 0
                      ? Math.min(0, ...chartData.map((d) => d.force))
                      : 0,
                },
                {
                  x: distance,
                  y:
                    chartData.length > 0
                      ? (() => {
                          const maxF = Math.max(...chartData.map((d) => d.force));
                          return maxF <= 0 ? 100 : maxF;
                        })()
                      : 100,
                },
              ],
              borderColor: reachedCurves[label] ? "#ef4444" : "#fbbf24",
              borderWidth: 2,
              // borderDash: [4, 4],
              borderDash: [5, 5],
              pointRadius: 0,
              pointHoverRadius: 0,
              fill: false,
              showLine: true,

              tension: 0,
              yAxisID: 'y',
              xAxisID: 'x',
              // Add custom properties for tooltip
              pointStyle: false,
            };
          })
          .filter(Boolean)
        : []),
    ],
  };

  return (
    <div className="min-h-screen h-screen bg-linear-to-br from-gray-50 to-blue-50 text-gray-900 overflow-hidden flex flex-col">
      {/* Force Limit Alert Modal */}
      {showForceLimitAlert && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-red-200 overflow-hidden transform animate-in fade-in zoom-in duration-300">
            <div className="bg-linear-to-r from-red-600 to-rose-700 p-6 flex items-center justify-between text-white">
              <div className="flex items-center space-x-3">
                <div className="bg-white/20 p-2 rounded-xl">
                  <Activity className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold tracking-tight">
                  Safety Alert
                </h2>
              </div>
              <button
                onClick={() => setShowForceLimitAlert(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Gauge className="w-10 h-10 text-red-600" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-2">
                Force Limit Reached
              </h3>
              <p className="text-gray-600 font-medium">
                The real-time force has reached the user-defined threshold. The
                process has been paused for safety.
              </p>

              <div className="mt-8 bg-gray-50 rounded-2xl p-4 border border-gray-100 flex justify-around">
                <div>
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">
                    Current Force
                  </p>
                  <p className="text-xl font-bold text-red-600">
                    {readData.forceDisplay}
                  </p>
                </div>
                <div className="w-px bg-gray-200 h-10 self-center"></div>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">
                    Threshold
                  </p>
                  <p className="text-xl font-bold text-gray-700">
                    {selectedConfig?.thresholdForce} mN
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-6 border-t border-gray-100">
              <button
                onClick={() => setShowForceLimitAlert(false)}
                className="w-full bg-linear-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 shadow-lg shadow-red-200 hover:-translate-y-0.5 active:translate-y-0"
              >
                Close and Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}

      {temperatureStatus.showHeatingDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-gray-200/80">
            <div
              className={`p-6 rounded-t-2xl bg-linear-to-r ${parseFloat(readData.temperature) >= 39 ? "from-red-600 to-rose-700" : "from-orange-500 to-red-500"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Flame className="w-6 h-6 text-white" />
                  <h2 className="text-xl font-bold text-white">
                    {parseFloat(readData.temperature) >= 39
                      ? "Temperature Alert"
                      : temperatureStatus.isHeatingActive
                        ? "Heating In Progress"
                        : "Heating Required"}
                  </h2>
                </div>
                <button
                  onClick={closeHeatingDialog}
                  className="p-2 hover:bg-white/20 rounded-lg transition-all"
                >
                  <X className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">
                      Real-time Temperature
                    </p>
                    <div className="flex items-center justify-center space-x-2">
                      <Thermometer className="w-5 h-5 text-blue-600" />
                      <p
                        className={`text-2xl font-bold ${parseFloat(readData.temperature) >= 39 ? "text-red-700" : "text-blue-700"}`}
                      >
                        {readData.temperatureDisplay}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Valid Range</p>
                    <div className="flex items-center justify-center space-x-2">
                      <Flame className="w-5 h-5 text-orange-600" />
                      <p className="text-2xl font-bold text-orange-700">
                        35 - 39°C
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  {/* Simplified Progress Bar or Range Indicator */}
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Low (35°C)</span>
                    <span>Range</span>
                    <span>High (39°C)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 relative">
                    {/* Marker for current temp */}
                    {(() => {
                      const temp = parseFloat(readData.temperature);
                      let left = 0;
                      let color = "bg-blue-500";
                      if (!isNaN(temp)) {
                        // Map 30-45 range to 0-100%
                        const min = 30;
                        const max = 45;
                        const pct = Math.max(
                          0,
                          Math.min(100, ((temp - min) / (max - min)) * 100),
                        );
                        left = pct;
                        if (temp > 35 && temp < 39) color = "bg-green-500";
                        else if (temp >= 39) color = "bg-red-500";
                        else color = "bg-orange-500";
                      }
                      return (
                        <div
                          className={`absolute top-0 bottom-0 w-3 h-3 rounded-full -mt-0.5 border-2 border-white shadow ${color}`}
                          style={{ left: `calc(${left}% - 6px)` }}
                        />
                      );
                    })()}
                    {/* Green Zone Marker */}
                    <div
                      className="absolute top-0 h-2 bg-green-500/20 left-[33%] width-[26%]"
                      style={{
                        left: `${((35 - 30) / 15) * 100}%`,
                        width: `${((39 - 35) / 15) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3">
                {parseFloat(readData.temperature) < 39 &&
                  (!temperatureStatus.isHeatingActive ? (
                    <button
                      onClick={turnOnHeater}
                      disabled={temperatureStatus.heaterButtonDisabled}
                      className={`flex-1 font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center space-x-2 ${temperatureStatus.heaterButtonDisabled
                          ? "bg-gray-400 cursor-not-allowed text-gray-200"
                          : "bg-linear-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg"
                        }`}
                    >
                      <Flame className="w-5 h-5" />
                      <span>
                        {temperatureStatus.heaterButtonDisabled
                          ? "Turning ON..."
                          : "Turn ON Heater"}
                      </span>
                    </button>
                  ) : (
                    <div className="w-full bg-green-50 border border-green-200 rounded-xl p-4">
                      <div className="flex items-center justify-center space-x-2">
                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                          <Flame className="w-3 h-3 text-white" />
                        </div>
                        <p className="text-green-700 font-bold">Heater is ON</p>
                      </div>
                      <p className="text-green-600 text-center text-sm mt-1">
                        Waiting for temperature to rise above 35°C...
                      </p>
                    </div>
                  ))}
                {parseFloat(readData.temperature) >= 39 && (
                  <div className="w-full bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-center justify-center space-x-2">
                      <Thermometer className="w-6 h-6 text-red-500" />
                      <p className="text-red-700 font-bold">Cooling Required</p>
                    </div>
                    <p className="text-red-600 text-center text-sm mt-1">
                      System is waiting for natural cooling.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4 text-center">
                <p className="text-gray-500 text-sm">
                  Process start is disabled until temperature is between 35°C
                  and 39°C.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* {showInfoModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-linear-to-r from-blue-500 to-cyan-500 p-6 rounded-t-2xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Info className="w-6 h-6 text-white" />
                <h2 className="text-2xl font-bold text-white">
                  Pre-Process Checklist
                </h2>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-all"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
                <h3 className="font-bold text-red-900 mb-2 flex items-center space-x-2">
                  <span className="text-xl">⚠️</span>
                  <span>CRITICAL: Before Starting Process</span>
                </h3>
                <ul className="space-y-2 text-red-800">
                  <li className="flex items-start space-x-2">
                    <span className="font-bold mt-1">•</span>
                    <span>
                      <strong>Serial Connection:</strong> Verify "CONNECTED"
                      status is shown in green.
                    </span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="font-bold mt-1">•</span>
                    <span>
                      <strong>Status READY:</strong> System must be in READY
                      state before starting.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
                <h3 className="font-bold text-blue-900 mb-2 flex items-center space-x-2">
                  <span className="text-xl">🔧</span>
                  <span>Equipment & Safety Checks</span>
                </h3>
                <ul className="space-y-2 text-blue-800">
                  <li className="flex items-start space-x-2">
                    <span className="font-bold mt-1">•</span>
                    <span>
                      <strong>Machine Position:</strong> Ensure machine is at
                      home position (Distance = 0.0 mm)
                    </span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="font-bold mt-1">•</span>
                    <span>
                      <strong>Sample Placement:</strong> Verify sample is
                      properly positioned and secured.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg">
                <h3 className="font-bold text-green-900 mb-2 flex items-center space-x-2">
                  <span className="text-xl">📊</span>
                  <span>Sensor Verification</span>
                </h3>
                <ul className="space-y-2 text-green-800">
                  <li className="flex items-start space-x-2">
                    <span className="font-bold mt-1">•</span>
                    <span>
                      <strong>Temperature Reading:</strong> Check temperature
                      sensor shows valid readings.
                    </span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="font-bold mt-1">•</span>
                    <span>
                      <strong>Force Sensor:</strong> Verify force reading is at
                      baseline (near 0 mN).
                    </span>
                  </li>
                </ul>
              </div>

              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg">
                <h3 className="font-bold text-yellow-900 mb-2 flex items-center space-x-2">
                  <span className="text-xl">🎯</span>
                  <span>Process Parameters</span>
                </h3>
                <ul className="space-y-2 text-yellow-800">
                  <li className="flex items-start space-x-2">
                    <span className="font-bold mt-1">•</span>
                    <span>
                      <strong>Distance:</strong> Verify matches your test
                      requirements.
                    </span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="font-bold mt-1">•</span>
                    <span>
                      <strong>Peak Force:</strong> Confirm safety threshold is
                      set correctly (in mN).
                    </span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="font-bold mt-1">•</span>
                    <span>
                      <strong>Temperature:</strong> Ensure temperature setting
                      is appropriate.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded-r-lg">
                <h3 className="font-bold text-purple-900 mb-2 flex items-center space-x-2">
                  <span className="text-xl">⚡</span>
                  <span>During Process</span>
                </h3>
                <ul className="space-y-2 text-purple-800">
                  <li className="flex items-start space-x-2">
                    <span className="font-bold mt-1">•</span>
                    <span>
                      <strong>Monitor Graph:</strong> Watch real-time
                      force-distance plot for anomalies.
                    </span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="font-bold mt-1">•</span>
                    <span>
                      <strong>STOP Function:</strong> Use STOP button if any
                      issues are observed.
                    </span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="font-bold mt-1">•</span>
                    <span>
                      <strong>Stay Present:</strong> Never leave the machine
                      unattended during operation.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
            <div className="sticky bottom-0 bg-gray-50 p-4 rounded-b-2xl border-t border-gray-200">
              <button
                onClick={() => setShowInfoModal(false)}
                className="w-full bg-linear-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold py-3 px-6 rounded-xl transition-all"
              >
                I Understand - Close
              </button>
            </div>
          </div>
        </div>
      )} */}
      {showInfoModal && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl lg:rounded-3xl shadow-2xl max-w-md lg:max-w-lg w-full max-h-[80vh] overflow-hidden">
          <div className="bg-linear-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-blue-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Info className="w-5 h-5 lg:w-6 lg:h-6 text-blue-600" />
                </div>
                <h3 className="text-lg lg:text-xl font-bold text-blue-900">Operation Guidlines</h3>
              </div>
              <button
                onClick={() => setShowInfoModal(false)}
                className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-blue-600" />
              </button>
            </div>
          </div>

          <div className="p-6 overflow-y-auto max-h-96">
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                  <p className="text-blue-800 text-sm lg:text-base">
                    <span className="font-semibold">Serial Connection:</span> Verify "CONNECTED"
                  status is shown in green.
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                  <p className="text-blue-800 text-sm lg:text-base">
                    <span className="font-semibold">Status READY:</span> System must be in READY
                  state before starting.
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                  <p className="text-blue-800 text-sm lg:text-base">
                    <span className="font-semibold">Machine Position:</span> Ensure machine is at
                  home position (Distance = 0.0 mm)
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                  <p className="text-blue-800 text-sm lg:text-base">
                    <span className="font-semibold">Sample Placement:</span>  Verify sample is
                  properly positioned and secured.
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                  <p className="text-blue-800 text-sm lg:text-base">
                    <span className="font-semibold">Temperature Reading:</span> Check temperature
                  sensor shows valid readings.
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                  <p className="text-blue-800 text-sm lg:text-base">
                    <span className="font-semibold">Force Sensor:</span> Verify force reading is at
                  baseline (near 0 mN).
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                  <p className="text-blue-800 text-sm lg:text-base">
                    <span className="font-semibold">Distance:</span> Verify matches your test
                  requirements.
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                  <p className="text-blue-800 text-sm lg:text-base">
                    <span className="font-semibold">Peak Force:</span> Confirm safety threshold is
                  set correctly (in mN).
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                  <p className="text-blue-800 text-sm lg:text-base">
                    <span className="font-semibold">Temperature:</span> Ensure temperature setting
                  is appropriate.
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                  <p className="text-blue-800 text-sm lg:text-base">
                    <span className="font-semibold">Monitor Graph:</span> Watch real-time
                  force-distance plot for anomalies.
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                  <p className="text-blue-800 text-sm lg:text-base">
                    <span className="font-semibold">STOP Function:</span> Use STOP button if any
                  issues are observed.
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                  <p className="text-blue-800 text-sm lg:text-base">
                    <span className="font-semibold">Stay Present:</span> Never leave the machine
                  unattended during operation.
                  </p>
                </div>
                {/* <div className="sticky bottom-0 bg-gray-50 p-4 rounded-b-2xl border-t border-gray-200">
                <button
                    onClick={() => setShowInfoModal(false)}
                    className="w-full bg-linear-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold py-3 px-6 rounded-xl transition-all"
                >
                    I Understand - Close
                </button>
                </div> */}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      <div
        className={`${isXlScreen ? "hidden" : "fixed"} top-0 right-0 h-auto w-[90vw] max-w-sm bg-white/95 backdrop-blur-xl shadow-2xl z-40 transform transition-transform duration-300 ${showConfigPanel ? "translate-x-0" : "translate-x-full"
          }`}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Configuration</h3>
            <button
              onClick={() => setShowConfigPanel(false)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-all"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {selectedConfig ? (
            <div className="space-y-3">
              <div className="bg-linear-to-r from-blue-50 to-cyan-50 p-3 rounded-xl border border-blue-200/50">
                <p className="text-gray-600 text-xs mb-1">Configuration Name</p>
                <p className="text-sm font-bold text-blue-700">
                  {selectedConfig.configName}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-linear-to-br from-green-50 to-emerald-50 p-3 rounded-xl border border-green-200/50">
                  <p className="text-gray-600 text-xs mb-1">Distance</p>
                  <p className="text-sm font-bold text-green-700">
                    {selectedConfig.pathlength} mm
                  </p>
                </div>

                <div className="bg-linear-to-br from-cyan-50 to-blue-50 p-3 rounded-xl border border-cyan-200/50">
                  <p className="text-gray-600 text-xs mb-1">Threshold Force</p>
                  <p className="text-sm font-bold text-blue-700">
                    {selectedConfig.thresholdForce} mN
                  </p>
                </div>

                <div className="col-span-2 bg-linear-to-br from-orange-50 to-red-50 p-3 rounded-xl border border-orange-200/50">
                  <p className="text-gray-600 text-xs mb-1">
                    Insertion Stroke Length
                  </p>
                  <p className="text-sm font-bold text-orange-700">
                    {selectedConfig.insertionLength} mm
                  </p>
                </div>
                <div className="col-span-2 bg-linear-to-br from-orange-50 to-red-50 p-3 rounded-xl border border-orange-200/50">
                  <p className="text-gray-600 text-xs mb-1">
                    Retraction Stroke Length
                  </p>
                  <p className="text-sm font-bold text-orange-700">
                    {selectedConfig.retractionLength} mm
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 rounded-r-xl">
              <p className="text-yellow-800 text-sm font-medium">
                ⚠️ No configuration selected
              </p>
            </div>
          )}
        </div>
      </div>

      <header className="shrink-0 relative bg-white/80 backdrop-blur-xl border-b border-gray-200/80 shadow-lg">
        <div
          className={`${isXlScreen ? "px-6 py-4" : isLgScreen ? "px-4 py-3" : "px-3 py-2"}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 sm:space-x-6 min-w-0">
              <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
                <button
                  onClick={handleBack}
                  disabled={shouldDisableBackButton()}
                  className={`p-1.5 sm:p-2 rounded-xl transition-all duration-300 group shrink-0 ${shouldDisableBackButton()
                      ? "bg-gray-100 cursor-not-allowed text-gray-400"
                      : "p-2 hover:bg-white hover:shadow-md rounded-lg transition-all duration-200"
                    }`}
                >
                  <ArrowLeft
                    className={`${isXlScreen ? "w-6 h-6" : "w-5 h-5"}`}
                  />
                </button>
                <div className="min-w-0">
                  <h1
                    className={`${isXlScreen ? "text-2xl" : isLgScreen ? "text-xl" : "text-lg"} font-bold bg-linear-to-r from-gray-900 to-blue-700 bg-clip-text text-transparent truncate`}
                  >
                    Process Mode
                  </h1>
                  <p className="text-gray-600 text-xs sm:text-sm mt-0.5 truncate hidden sm:block">
                    Process Mode - Real-time Monitoring
                  </p>
                  {selectedConfig && (
                    <p className="text-blue-600 text-xs sm:text-sm mt-0.5 font-medium truncate hidden lg:block">
                      Using configuration: {selectedConfig.configName}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-1 sm:space-x-3 shrink-0">
              <div
                className={`flex items-center space-x-1 sm:space-x-2 px-2 sm:px-4 py-1 sm:py-2 rounded-xl font-medium transition-all ${isConnected
                    ? "bg-green-50 text-green-700 border border-green-200 shadow-sm shadow-green-500/10"
                    : "bg-red-50 text-red-700 border border-red-200 shadow-sm shadow-red-500/10"
                  }`}
              >
                <Usb className={`${isXlScreen ? "w-5 h-5" : "w-4 h-4"}`} />
                <span className="text-xs sm:text-sm font-semibold hidden sm:inline">
                  {isConnected ? "USB CONNECTED" : "USB DISCONNECTED"}
                </span>
              </div>

              {!isConnected && (
                <button
                  onClick={handleReconnect}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors hidden sm:block"
                  title="Attempt to reconnect USB"
                >
                  Reconnect
                </button>
              )}

              <button
                onClick={() => setShowInfoModal(true)}
                className="group bg-linear-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl w-8 h-8 sm:w-12 sm:h-12 lg:w-14 lg:h-14 flex items-center justify-center transition-all duration-300 hover:-translate-y-1 shadow-xl hover:shadow-2xl border border-blue-400/30"
              >
                <Info
                  className={`${isXlScreen ? "w-7 h-7" : "w-5 h-5"} group-hover:scale-110 transition-transform duration-300`}
                />
              </button>

              <button
                onClick={() => {
                  const confirmed = window.confirm(
                    "Are you sure you want to exit?",
                  );
                  if (confirmed) {
                    window.close();
                  }
                }}
                disabled={shouldDisablePowerButton()}
                className={`group rounded-xl lg:rounded-2xl w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 flex items-center justify-center transition-all duration-300 shadow-lg border ${shouldDisablePowerButton()
                    ? "bg-gray-200 cursor-not-allowed text-gray-400 border-gray-300"
                    : "bg-linear-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white hover:-translate-y-1 hover:shadow-xl border-red-400/30"
                  }`}
              >
                <Power
                  className={`w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 transition-transform duration-300 ${shouldDisablePowerButton() ? "" : "group-hover:scale-110"
                    }`}
                />
              </button>
            </div>
          </div>
        </div>
      </header>

      {!isXlScreen && (
        <div className="fixed z-30">
          <button
            onMouseDown={(e) => {
              setIsDraggingConfig(true);
              setDragOffset({
                x: e.clientX - configButtonPos.x,
                y: e.clientY - configButtonPos.y,
              });
            }}
            onTouchStart={(e) => {
              if (e.touches.length > 0) {
                setIsDraggingConfig(true);
                setDragOffset({
                  x: e.touches[0].clientX - configButtonPos.x,
                  y: e.touches[0].clientY - configButtonPos.y,
                });
              }
            }}
            onClick={(e) => {
              if (!isDraggingConfig) {
                setShowConfigPanel(!showConfigPanel);
              }
              e.stopPropagation();
            }}
            style={{
              position: "fixed",
              left: `${configButtonPos.x}px`,
              top: `${configButtonPos.y}px`,
              cursor: isDraggingConfig ? "grabbing" : "grab",
              touchAction: "none",
            }}
            className="bg-linear-to-br from-purple-500 to-indigo-500 text-white p-3 rounded-xl shadow-xl hover:shadow-2xl transition-all"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      )}

      <main
        className={`relative flex ${isXlScreen ? "flex-row" : "flex-col"} flex-1 ${isXlScreen ? "gap-6 p-6" : isLgScreen ? "gap-4 p-4" : "gap-3 p-3"} min-h-0 overflow-hidden`}
      >
        <section
          className={`flex-1 flex flex-col ${isXlScreen ? "gap-6" : "gap-4"} min-w-0 min-h-0`}
        >
          <div className="flex-1 bg-white/70 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-gray-200/80 p-3 sm:p-4 shadow-xl shadow-gray-200/50 flex flex-col">
            <div className="mb-2 sm:mb-2 shrink-0">
              <div className="flex items-center">
                <span
                  className={`${isXlScreen ? "text-md" : "text-base"} font-bold text-gray-900 mr-2`}
                >
                  Real-time Analytics
                </span>
                <span
                  className={`${isXlScreen ? "text-sm" : "text-xs"} text-gray-500 mr-2`}
                >
                  (Force & Distance vs Time)
                </span>
              </div>
            </div>

            {!isXlScreen && (
              <div className="mb-3 grid grid-cols-2 gap-2 shrink-0">
                {/* Temperature box */}
                <div className="bg-linear-to-br from-orange-50 to-red-50 rounded-lg border border-orange-200/50 p-2">
                  <div className="flex items-center space-x-2 mb-1">
                    <div className="w-6 h-6 bg-linear-to-br from-orange-500 to-red-500 rounded-md flex items-center justify-center">
                      <Thermometer className="w-3 h-3 text-white" />
                    </div>
                    <p className="text-gray-600 text-xs font-medium">
                      Temperature
                    </p>
                  </div>
                  <p className="text-sm font-bold text-orange-600">
                    {readData.temperatureDisplay}
                  </p>
                </div>

                {/* Force box */}
                <div className="bg-linear-to-br from-cyan-50 to-blue-50 rounded-lg border border-cyan-200/50 p-2">
                  <div className="flex items-center space-x-2 mb-1">
                    <div className="w-6 h-6 bg-linear-to-br from-cyan-500 to-blue-500 rounded-md flex items-center justify-center">
                      <Gauge className="w-3 h-3 text-white" />
                    </div>
                    <p className="text-gray-600 text-xs font-medium">Force</p>
                  </div>
                  <p className="text-sm font-bold text-blue-600">
                    {readData.forceDisplay}
                  </p>
                </div>

                {/* Distance box */}
                <div className="bg-linear-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200/50 p-2">
                  <div className="flex items-center space-x-2 mb-1">
                    <div className="w-6 h-6 bg-linear-to-br from-green-500 to-emerald-500 rounded-md flex items-center justify-center">
                      <Ruler className="w-3 h-3 text-white" />
                    </div>
                    <p className="text-gray-600 text-xs font-medium">
                      Distance
                    </p>
                  </div>
                  <p className="text-sm font-bold text-green-600">
                    {readData.distanceDisplay}
                  </p>
                </div>

                {/* Status box */}
                <div className="bg-linear-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200/50 p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <div
                        className={`w-6 h-6 rounded-md flex items-center justify-center ${sensorData.status === "INSERTION" ||
                            sensorData.status === "RETRACTION"
                            ? "bg-linear-to-br from-green-500 to-emerald-500"
                            : sensorData.status === "PAUSED" ||
                              sensorData.status === "RETRACTION PAUSED"
                              ? "bg-linear-to-br from-yellow-500 to-orange-500"
                              : sensorData.status === "HOMING"
                                ? "bg-linear-to-br from-purple-500 to-indigo-500"
                                : sensorData.status === "READY" ||
                                  sensorData.status === "INSERTION COMPLETED"
                                  ? "bg-linear-to-br from-blue-500 to-indigo-500"
                                  : "bg-linear-to-br from-gray-400 to-gray-500"
                          }`}
                      >
                        <Activity className="w-3 h-3 text-white" />
                      </div>
                      <p className="text-gray-600 text-xs font-medium">
                        Status
                      </p>
                    </div>
                    <div
                      className={`w-2 h-2 rounded-full ${sensorData.status === "INSERTION" ||
                          sensorData.status === "RETRACTION"
                          ? "bg-green-500 animate-pulse"
                          : sensorData.status === "PAUSED" ||
                            sensorData.status === "RETRACTION PAUSED"
                            ? "bg-yellow-500"
                            : sensorData.status === "HOMING"
                              ? "bg-purple-500 animate-pulse"
                              : sensorData.status === "READY" ||
                                sensorData.status === "INSERTION COMPLETED"
                                ? "bg-blue-500"
                                : "bg-gray-400"
                        }`}
                    ></div>
                  </div>
                  <p
                    className={`text-sm font-bold ${sensorData.status === "INSERTION" ||
                        sensorData.status === "RETRACTION"
                        ? "text-green-600"
                        : sensorData.status === "PAUSED" ||
                          sensorData.status === "RETRACTION PAUSED"
                          ? "text-yellow-600"
                          : sensorData.status === "HOMING"
                            ? "text-purple-600"
                            : sensorData.status === "READY" ||
                              sensorData.status === "INSERTION COMPLETED"
                              ? "text-blue-600"
                              : "text-gray-600"
                      }`}
                  >
                    {sensorData.status}
                  </p>
                </div>
              </div>
            )}

            {/* Responsive chart container - FIXED HEIGHTS FOR ALL SCREENS */}
            <div
              className="grow"
              // style={{
              //   minHeight: "250px",
              //   height: isSmScreen
              //     ? "250px"
              //     : isMdScreen
              //       ? "300px"
              //       : isLgScreen
              //         ? "350px"
              //         : "400px",
              //   maxHeight: "400px",
              // }}
              style={{
                minHeight: isXlScreen ? "650px" : "250px",
                height: isSmScreen
                  ? "250px"
                  : isMdScreen
                    ? "300px"
                    : isLgScreen
                      ? "400px"
                      : isXlScreen
                        ? "700px"
                        : "400px",
                maxHeight: isXlScreen ? "750px" : "400px",
                width: "100%",
              }}
            >
              <Line data={chartConfig} options={chartOptions} redraw={false} />
            </div>
          </div>
        </section>

        <section
          className={`${isXlScreen ? "w-1/3" : "w-full"} flex flex-col ${isXlScreen ? "gap-6" : "gap-4"} pb-20 xl:pb-0 min-h-0`}
        >
          {isXlScreen && (
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 shadow-xl shadow-gray-200/50 shrink-0">
              <div className="mb-2">
                <h3 className="text-lg font-bold text-gray-900">
                  Active Configuration
                </h3>
                <p className="text-gray-600 text-xs">
                  Current process parameters
                </p>
              </div>

              {selectedConfig ? (
                <div className="space-y-2.5">
                  <div className="bg-linear-to-r from-blue-50 to-cyan-50 p-3 rounded-xl border border-blue-200/50">
                    <p className="text-gray-600 text-xs mb-0.5">
                      Configuration Name
                    </p>
                    <p className="text-base font-bold text-blue-700">
                      {selectedConfig.configName}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-linear-to-br from-green-50 to-emerald-50 p-3 rounded-xl border border-green-200/50">
                      <p className="text-gray-600 text-xs mb-0.5">Distance</p>
                      <p className="text-base font-bold text-green-700">
                        {selectedConfig.pathlength} mm
                      </p>
                    </div>

                    <div className="bg-linear-to-br from-cyan-50 to-blue-50 p-3 rounded-xl border border-cyan-200/50">
                      <p className="text-gray-600 text-xs mb-0.5">
                        Threshold Force
                      </p>
                      <p className="text-base font-bold text-blue-700">
                        {selectedConfig.thresholdForce} mN
                      </p>
                    </div>

                    <div className="col-span-2 bg-linear-to-br from-orange-50 to-red-50 p-3 rounded-xl border border-orange-200/50">
                      <p className="text-gray-600 text-xs mb-0.5">
                        Insertion Stroke Length
                      </p>
                      <p className="text-base font-bold text-orange-700">
                        {selectedConfig.insertionLength} mm
                      </p>
                    </div>
                    <div className="col-span-2 bg-linear-to-br from-orange-50 to-red-50 p-3 rounded-xl border border-orange-200/50">
                      <p className="text-gray-600 text-xs mb-0.5">
                        Retraction Stroke Length
                      </p>
                      <p className="text-base font-bold text-orange-700">
                        {selectedConfig.retractionLength} mm
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 rounded-r-xl">
                  <p className="text-yellow-800 font-medium text-sm">
                    ⚠️ No configuration selected
                  </p>
                  <p className="text-yellow-700 text-xs mt-1">
                    Please load a configuration to proceed
                  </p>
                </div>
              )}
            </div>
          )}

          {isXlScreen && (
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4 shadow-xl shadow-gray-200/50 flex-1 min-h-0">
              <div className="mb-3">
                <h3 className="text-lg font-bold text-gray-900">
                  Real-time Sensors
                </h3>
                <p className="text-gray-600 text-xs">Live monitoring data</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-linear-to-br from-orange-50 to-red-50 rounded-xl border border-orange-200/50 p-3">
                  <div className="flex items-center space-x-2 mb-1.5">
                    <div className="w-8 h-8 bg-linear-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center shadow-sm">
                      <Thermometer className="w-4 h-4 text-white" />
                    </div>
                    <p className="text-gray-600 text-xs font-medium">
                      Temperature
                    </p>
                  </div>
                  <p className="text-xl font-bold text-orange-600">
                    {readData.temperatureDisplay}
                  </p>
                </div>

                <div className="bg-linear-to-br from-cyan-50 to-blue-50 rounded-xl border border-cyan-200/50 p-3">
                  <div className="flex items-center space-x-2 mb-1.5">
                    <div className="w-8 h-8 bg-linear-to-br from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center shadow-sm">
                      <Gauge className="w-4 h-4 text-white" />
                    </div>
                    <p className="text-gray-600 text-xs font-medium">Force</p>
                  </div>
                  <p className="text-xl font-bold text-blue-600">
                    {readData.forceDisplay}
                  </p>
                </div>

                <div className="bg-linear-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200/50 p-3">
                  <div className="flex items-center space-x-2 mb-1.5">
                    <div className="w-8 h-8 bg-linear-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center shadow-sm">
                      <Ruler className="w-4 h-4 text-white" />
                    </div>
                    <p className="text-gray-600 text-xs font-medium">
                      Distance
                    </p>
                  </div>
                  <p className="text-xl font-bold text-green-600">
                    {readData.distanceDisplay}
                  </p>
                </div>

                <div className="bg-linear-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200/50 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${sensorData.status === "INSERTION" ||
                            sensorData.status === "RETRACTION"
                            ? "bg-linear-to-br from-green-500 to-emerald-500"
                            : sensorData.status === "PAUSED" ||
                              sensorData.status === "RETRACTION PAUSED"
                              ? "bg-linear-to-br from-yellow-500 to-orange-500"
                              : sensorData.status === "HOMING"
                                ? "bg-linear-to-br from-purple-500 to-indigo-500"
                                : sensorData.status === "READY" ||
                                  sensorData.status === "INSERTION COMPLETED"
                                  ? "bg-linear-to-br from-blue-500 to-indigo-500"
                                  : "bg-linear-to-br from-gray-400 to-gray-500"
                          }`}
                      >
                        <Activity className="w-4 h-4 text-white" />
                      </div>
                      <p className="text-gray-600 text-xs font-medium">
                        Status
                      </p>
                    </div>
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${sensorData.status === "INSERTION" ||
                          sensorData.status === "RETRACTION"
                          ? "bg-green-500 animate-pulse"
                          : sensorData.status === "PAUSED" ||
                            sensorData.status === "RETRACTION PAUSED"
                            ? "bg-yellow-500"
                            : sensorData.status === "HOMING"
                              ? "bg-purple-500 animate-pulse"
                              : sensorData.status === "READY" ||
                                sensorData.status === "INSERTION COMPLETED"
                                ? "bg-blue-500"
                                : "bg-gray-400"
                        }`}
                    ></div>
                  </div>
                  <p
                    className={`text-xl font-bold ${sensorData.status === "INSERTION" ||
                        sensorData.status === "RETRACTION"
                        ? "text-green-600"
                        : sensorData.status === "PAUSED" ||
                          sensorData.status === "RETRACTION PAUSED"
                          ? "text-yellow-600"
                          : sensorData.status === "HOMING"
                            ? "text-purple-600"
                            : sensorData.status === "READY" ||
                              sensorData.status === "INSERTION COMPLETED"
                              ? "text-blue-600"
                              : "text-gray-600"
                      }`}
                  >
                    {sensorData.status}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div
            className={`${isXlScreen ? "relative" : "fixed bottom-0 left-0 right-0"} bg-white/95 xl:bg-white/70 backdrop-blur-xl rounded-t-2xl xl:rounded-2xl border-t xl:border border-gray-200/80 p-3 sm:p-4 shadow-2xl xl:shadow-xl shadow-gray-200/50 z-20 shrink-0`}
          >
            {isXlScreen && (
              <div className="mb-2">
                <h3 className="text-lg font-bold text-gray-900">
                  Process Controls
                </h3>
                <p className="text-gray-600 text-xs">
                  Manage process execution
                </p>
              </div>
            )}

            <div className="flex space-x-2 sm:space-x-3 justify-center max-w-2xl mx-auto">
              <button
                onClick={handleStart}
                disabled={shouldDisableStartButton()}
                className={`flex-1 flex items-center justify-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-3 sm:py-3 rounded-lg sm:rounded-xl font-bold transition-all transform hover:scale-[1.02] min-w-0 ${shouldDisableStartButton()
                    ? "bg-gray-200 cursor-not-allowed text-gray-500 border border-gray-300"
                    : "bg-linear-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-xl shadow-green-500/25 border border-green-400/30"
                  }`}
              >
                <Play className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm sm:text-base">
                  {getStartButtonText()}
                </span>
              </button>

              <button
                onClick={handlePause}
                disabled={shouldDisablePauseButton()}
                className={`flex-1 flex items-center justify-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-3 rounded-lg sm:rounded-xl font-bold transition-all transform hover:scale-[1.02] min-w-0 ${shouldDisablePauseButton()
                    ? "bg-gray-200 cursor-not-allowed text-gray-500 border border-gray-300"
                    : "bg-linear-to-br from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white shadow-xl shadow-yellow-500/25 border border-yellow-400/30"
                  }`}
              >
                <Pause className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm sm:text-base">PAUSE</span>
              </button>

              <button
                onClick={handleRetraction}
                disabled={shouldDisableRetractionButton()}
                className={`flex-1 flex items-center justify-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-3 rounded-lg sm:rounded-xl font-bold transition-all transform hover:scale-[1.02] min-w-0 ${shouldDisableRetractionButton()
                    ? "bg-gray-200 cursor-not-allowed text-gray-500 border border-gray-300"
                    : "bg-linear-to-br from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white shadow-xl shadow-purple-500/25 border border-purple-400/30"
                  }`}
              >
                <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm sm:text-base">
                  {getRetractionButtonText()}
                </span>
              </button>

              <button
                onClick={handleReset}
                disabled={shouldDisableResetButton()}
                className={`flex-1 flex items-center justify-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-3 rounded-lg sm:rounded-xl font-bold transition-all transform hover:scale-[1.02] min-w-0 ${shouldDisableResetButton()
                    ? "bg-gray-200 cursor-not-allowed text-gray-500 border border-gray-300"
                    : "bg-linear-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-xl shadow-red-500/25 border border-red-400/30"
                  }`}
              >
                <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm sm:text-base">RESET</span>
                {coilLLSStatus && (
                  <span className="text-xs ml-1 text-gray-500"></span>
                )}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default ProcessMode;
