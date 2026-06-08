import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ChevronLeft, Power, Thermometer, Zap, RotateCw, Camera, Flame, Usb, Move, TrendingUp, Hand, ChevronRight } from 'lucide-react';
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
// Register ChartJS components
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
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [showConnectionError, setShowConnectionError] = useState(false);
  const [temperature, setTemperature] = useState('--');
  const [force, setForce] = useState('--');
  const [cameraError, setCameraError] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(true);
  const [controls, setControls] = useState({
    heater: false,
    homing: false,
    clamp: false,
    insertion: false,
    retraction: false
  });

  const [manualDistance, setManualDistance] = useState('--');
  const [graphData, setGraphData] = useState([]);
  const forwardData = graphData.filter(p => p.direction === "forward");
  const backwardData = graphData.filter(p => p.direction === "backward");

  const [catheterPosition, setCatheterPosition] = useState(0);

  // Connection status state
  const [connectionStatus, setConnectionStatus] = useState({
    connected: false,
    port: '--',
    lastCheck: null,
    dataSource: 'real'
  });

  // State to track COIL_LLS status
  const [coilLLSStatus, setCoilLLSStatus] = useState(false);
  const [powerActive, setPowerActive] = useState(false);

  // Chart configuration
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 0
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#3b82f6',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        displayColors: false,
        callbacks: {
          label: function (context) {
            return `Force: ${context.parsed.y.toFixed(2)} mN`;
          },
          title: function (context) {
            return `Distance: ${context[0].parsed.x.toFixed(2)} mm`;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'linear',
        title: {
          display: true,
          text: 'Distance (mm)',
          color: '#6b7280',
          font: {
            size: 12,
            weight: 'bold'
          }
        },
        grid: {
          color: 'rgba(229, 231, 235, 0.5)',
          drawBorder: true,
          borderColor: 'rgba(229, 231, 235, 1)'
        },
        ticks: {
          color: '#6b7280',
          font: {
            size: 11
          },
          maxTicksLimit: 10
        }
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: 'Force (mN)',
          color: '#6b7280',
          font: {
            size: 12,
            weight: 'bold'
          }
        },
        grid: {
          color: 'rgba(229, 231, 235, 0.5)',
          drawBorder: true,
          borderColor: 'rgba(229, 231, 235, 1)'
        },
        ticks: {
          color: '#6b7280',
          font: {
            size: 11
          },
          maxTicksLimit: 8
        }
      }
    },
    elements: {
      line: {
        tension: 0,
        borderWidth: 2.5,
        fill: false
      },
      point: {
        radius: 0,
        hoverRadius: 5
      }
    }
  };

  // Prepare chart data
  const chartConfig = {
    datasets: [
      {
        label: 'Forward Movement',
        data: forwardData.map(point => ({ x: point.manualDistance, y: point.force })),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: false,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#3b82f6'
      },
      {
        label: 'Backward Movement',
        data: backwardData.map(point => ({ x: point.manualDistance, y: point.force })),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        fill: false,
        pointBackgroundColor: '#ef4444',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#ef4444'
      }
    ]
  };

  // Check connection status on load and setup listener
  useEffect(() => {
    const checkConnection = () => {
      window.api.checkConnection()
        .then(status => {
          setConnectionStatus({
            connected: status.connected,
            port: status.port || '--',
            lastCheck: status.timestamp,
            dataSource: status.connected ? 'real' : 'real'
          });

          if (!status.connected) {
            setShowConnectionError(true);
            setTemperature('--');
            setForce('--');
            setManualDistance('--');
            setCoilLLSStatus(false);
          }
        })
        .catch(error => {
          console.error('Error checking connection:', error);
          setConnectionStatus({
            connected: false,
            port: '--',
            lastCheck: new Date().toISOString(),
            dataSource: 'real'
          });
          setShowConnectionError(true);
          setTemperature('--');
          setForce('--');
          setManualDistance('--');
          setCoilLLSStatus(false);
        });
    };

    // Check connection initially
    checkConnection();

    // Set up interval to check connection periodically (every 5 seconds)
    const intervalId = setInterval(checkConnection, 5000);

    // Listen for connection status updates from main process
    const handleModbusStatusChange = (event) => {
      const status = event.detail;
      const newConnected = status === 'connected';
      setConnectionStatus(prev => ({
        ...prev,
        connected: newConnected,
        dataSource: 'real'
      }));

      if (status === 'disconnected') {
        setShowConnectionError(true);
        setTemperature('--');
        setForce('--');
        setManualDistance('--');
        setCoilLLSStatus(false);

        // Reset all control states when disconnected
        setControls({
          heater: false,
          homing: false,
          clamp: false,
          insertion: false,
          retraction: false
        });
      } else {
        setShowConnectionError(false);
      }
    };

    window.addEventListener('modbus-status-change', handleModbusStatusChange);

    // Listen for power status updates
    const handlePowerStatusChange = (event) => {
      setPowerActive(event.detail === true);
    };
    window.addEventListener('power-status-change', handlePowerStatusChange);

    // Initial power status check
    window.api.checkPowerStatus().then(status => {
      setPowerActive(status.active);
    }).catch(err => console.error('Error checking initial power status:', err));

    // Cleanup function
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('modbus-status-change', handleModbusStatusChange);
      window.removeEventListener('power-status-change', handlePowerStatusChange);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
      }
    };
  }, []);

  // COIL_LLS monitoring via events from main process
  useEffect(() => {
    console.log("🔍 Setting up COIL_LLS monitoring...");

    // Event listener for real-time COIL_LLS updates from main process
    const handleLLSStatusChange = (status) => {
      const isLLSTrue = status === 'true' || status === true;

      console.log(`🔄 COIL_LLS Event Received: ${isLLSTrue ? 'TRUE' : 'FALSE'}`);

      setCoilLLSStatus(isLLSTrue);

      if (isLLSTrue) {
        setControls(prev => ({
          ...prev,
          homing: false,
          retraction: false
        }));
        setGraphData([]);
        console.log("✅ Home position reached - Retraction stopped (via event)");
      }

      if (!isLLSTrue) {
        console.log("🔄 Motor moved away from home - COIL_LLS is FALSE");
      }
    };

    const handleCustomEvent = (event, status) => {
      console.log("📡 Received LLS status:", status);
      handleLLSStatusChange(status);
    };

    window.electron?.receive?.('lls-status', handleCustomEvent) ||
      window.api?.onLlsStatus?.(handleCustomEvent);

    const handleWindowEvent = (e) => {
      if (e.detail !== undefined) {
        handleLLSStatusChange(e.detail);
      }
    };

    window.addEventListener('lls-status-change', handleWindowEvent);

    console.log("✅ COIL_LLS monitoring setup complete");

    return () => {
      console.log("🧹 Cleaning up COIL_LLS monitoring");
      window.removeEventListener('lls-status-change', handleWindowEvent);
    };
  }, []);

  // Handle heater toggle
  const handleHeaterToggle = () => {
    window.api.checkConnection()
      .then(status => {
        if (!status.connected) {
          alert('PLC is not connected. Please connect to PLC first.');
          setShowConnectionError(true);
          return;
        }

        window.api.heating()
          .then(result => {
            if (result && result.success) {
              setControls(prev => ({ ...prev, heater: result.heating }));
              console.log('Heater toggled to:', result.heating, 'Result:', result);
            } else {
              throw new Error(result?.message || 'Heater operation failed');
            }
          })
          .catch(error => {
            console.error('Heater control error:', error.message);
            setShowConnectionError(true);
          });
      })
      .catch(error => {
        console.error('Connection check error:', error);
      });
  };

  // Handle Clamp toggle
  const handleClampToggle = () => {
    window.api.checkConnection()
      .then(status => {
        if (!status.connected) {
          alert('PLC is not connected. Please connect to PLC first.');
          setShowConnectionError(true);
          return;
        }

        window.api.clamp()
          .then(result => {
            if (result && result.success) {
              setControls(prev => ({ ...prev, clamp: !prev.clamp }));
              console.log('Clamp toggled:', result);
            } else {
              throw new Error(result?.message || 'Clamp operation failed');
            }
          })
          .catch(error => {
            console.error('Clamp control error:', error.message);
            setShowConnectionError(true);
          });
      })
      .catch(error => {
        console.error('Connection check error:', error);
      });
  };

  // Handle Insertion (Forward) - Toggle behavior based on PLC state
  const handleInsertion = () => {
    window.api.checkConnection()
      .then(status => {
        if (!status.connected) {
          alert('PLC is not connected. Please connect to PLC first.');
          setShowConnectionError(true);
          return;
        }

        // If insertion is currently active in UI, we want to turn it OFF
        if (controls.insertion) {
          console.log('Attempting to STOP insertion...');

          // Call insertion API again - according to main.js, this will toggle it OFF
          window.api.insertion()
            .then(result => {
              console.log('Insertion stop result:', result);
              if (result && result.success) {
                // Update UI state based on the result from PLC
                setControls(prev => ({
                  ...prev,
                  insertion: false,  // The API toggles to OFF
                  retraction: false   // Ensure retraction is off
                }));
                console.log('Insertion stopped by user');
              }
            })
            .catch(error => {
              console.error('Insertion stop error:', error);
              setShowConnectionError(true);
            });
        }
        // If insertion is not active AND retraction is not active, turn it ON
        else if (!controls.retraction) {
          console.log('Attempting to START insertion...');
          window.api.insertion()
            .then(result => {
              console.log('Insertion start result:', result);
              if (result && result.success) {
                // According to main.js, when insertion turns ON, it sets retraction to false
                setControls(prev => ({
                  ...prev,
                  insertion: true,   // The API toggles to ON
                  retraction: false   // PLC ensures retraction is off
                }));
                console.log('Insertion started by user');
              }
            })
            .catch(error => {
              console.error('Insertion start error:', error);
              setShowConnectionError(true);
            });
        }
        // If retraction is active, show a message (button should be disabled, but just in case)
        else {
          console.log('Cannot start insertion while retraction is active');
          alert('Please stop retraction first by pressing the Retraction button again');
        }
      })
      .catch(error => {
        console.error('Connection check error:', error);
      });
  };

  // Handle Retraction (Backward) - Toggle behavior based on PLC state
  const handleRetraction = () => {
    window.api.checkConnection()
      .then(status => {
        if (!status.connected) {
          alert('PLC is not connected. Please connect to PLC first.');
          setShowConnectionError(true);
          return;
        }

        // If retraction is currently active in UI, we want to turn it OFF
        if (controls.retraction) {
          console.log('Attempting to STOP retraction...');

          // Call retraction API again - according to main.js, this will toggle it OFF
          window.api.ret()
            .then(result => {
              console.log('Retraction stop result:', result);
              if (result && result.success) {
                // Update UI state based on the result from PLC
                setControls(prev => ({
                  ...prev,
                  retraction: false,  // The API toggles to OFF
                  insertion: false     // Ensure insertion is off
                }));
                console.log('Retraction stopped by user');
              }
            })
            .catch(error => {
              console.error('Retraction stop error:', error);
              setShowConnectionError(true);
            });
        }
        // If retraction is not active AND insertion is not active, turn it ON
        else if (!controls.insertion) {
          console.log('Attempting to START retraction...');
          window.api.ret()
            .then(result => {
              console.log('Retraction start result:', result);
              if (result && result.success) {
                // According to main.js, when retraction turns ON, it sets insertion to false
                setControls(prev => ({
                  ...prev,
                  retraction: true,   // The API toggles to ON
                  insertion: false     // PLC ensures insertion is off
                }));
                console.log('Retraction started by user');
              }
            })
            .catch(error => {
              console.error('Retraction start error:', error);
              setShowConnectionError(true);
            });
        }
        // If insertion is active, show a message (button should be disabled, but just in case)
        else {
          console.log('Cannot start retraction while insertion is active');
          alert('Please stop insertion first by pressing the Insertion button again');
        }
      })
      .catch(error => {
        console.error('Connection check error:', error);
      });
  };

  // Emergency stop - reset both states
  const emergencyStop = () => {
    console.log('EMERGENCY STOP triggered');

    // First, if insertion is active, turn it off
    if (controls.insertion) {
      window.api.insertion()
        .then(() => {
          setControls(prev => ({ ...prev, insertion: false }));
        })
        .catch(e => console.log('Insertion stop error:', e));
    }

    // If retraction is active, turn it off
    if (controls.retraction) {
      window.api.ret()
        .then(() => {
          setControls(prev => ({ ...prev, retraction: false }));
        })
        .catch(e => console.log('Retraction stop error:', e));
    }
  };

  // Stop all movement
  const stopAllMovement = () => {
    window.api.checkConnection()
      .then(status => {
        if (!status.connected) return;

        // Turn off both insertion and retraction if they're active
        if (controls.insertion) {
          window.api.insertion().catch(error => console.error('Error turning off insertion:', error));
        }
        if (controls.retraction) {
          window.api.ret().catch(error => console.error('Error turning off retraction:', error));
        }

        setControls(prev => ({
          ...prev,
          insertion: false,
          retraction: false
        }));
      })
      .catch(error => console.error('Connection check error:', error));
  };

  const resetCatheter = () => {
    window.api.checkConnection()
      .then(status => {
        if (!status.connected) {
          alert('PLC is not connected. Please connect to PLC first.');
          setShowConnectionError(true);
          return;
        }

        // Stop all movement before homing
        stopAllMovement();

        setGraphData([]);
        setControls(prev => ({ ...prev, homing: true }));
        setCatheterPosition(0);

        window.api.home()
          .then(result => {
            if (result.success) {
              console.log('Homing initiated:', result);
            } else {
              setControls(prev => ({ ...prev, homing: false }));
              throw new Error(result.message || 'Homing failed');
            }
          })
          .catch(error => {
            console.error('Homing error:', error.message);
            setShowConnectionError(true);
            setControls(prev => ({ ...prev, homing: false }));
          });
      })
      .catch(error => {
        console.error('Connection check error:', error);
      });
  };

  const handleReconnect = async () => {
    try {
      console.log('Attempting to reconnect...');
      const result = await window.api.reconnect();
      if (result.success && result.connected) {
        setShowConnectionError(false);
        setConnectionStatus(prev => ({ ...prev, connected: true, dataSource: 'real' }));
        console.log('Reconnect successful');
      } else {
        console.log('Reconnect failed');
      }
    } catch (error) {
      console.error('Reconnect error:', error);
    }
  };

  // Read PLC data periodically
  useEffect(() => {
    const readData = () => {
      window.api.readData()
        .then(data => {
          if (data.success) {
            setForce(data.force_mN);
            setTemperature(data.temperature);

            const maxDistance = 1000;
            const positionPercent = Math.min(100, (data.distance / maxDistance) * 100);
            setCatheterPosition(positionPercent);
            setManualDistance(data.manualDistance || 0);
 
            // Hardware-backed state synchronization for control labels/colors
            setControls(prev => ({
              ...prev,
              clamp: data.clamp !== undefined ? Boolean(data.clamp) : prev.clamp,
              heater: data.heater !== undefined ? Boolean(data.heater) : prev.heater,
              insertion: data.insertion !== undefined ? Boolean(data.insertion) : prev.insertion,
              retraction: data.retraction !== undefined ? Boolean(data.retraction) : prev.retraction
            }));

            if (data.coilLLS !== undefined) {
              const newCoilLLSStatus = Boolean(data.coilLLS);
              setCoilLLSStatus(newCoilLLSStatus);

              if (newCoilLLSStatus) {
                setControls(prev => ({
                  ...prev,
                  homing: false,
                  retraction: false
                }));
              }
            }

            setGraphData(prev => {
              const x = Number(data.manualDistance);
              const y = Number(data.force_mN);

              if (isNaN(x) || isNaN(y)) return prev;

              let direction = "forward";

              if (prev.length > 0) {
                const lastX = prev[prev.length - 1].manualDistance;
                direction = x < lastX ? "backward" : "forward";
              }

              const newPoint = {
                manualDistance: x,
                force: y,
                direction,
              };

              const updated = [...prev, newPoint];

              return updated.length > 200
                ? updated.slice(updated.length - 200)
                : updated;
            });
          } else {
            setForce('--');
            setTemperature('--');
            setManualDistance('--');
            setCoilLLSStatus(false);
          }
        })
        .catch(error => {
          console.error('Error reading PLC data:', error);
          setForce('--');
          setTemperature('--');
          setManualDistance('--');
          setCoilLLSStatus(false);
        });
    };

    let intervalId;
    if (connectionStatus.connected) {
      readData();
      intervalId = setInterval(readData, 500);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [connectionStatus.connected]);

  const disableManualMode = () => {
    window.api.checkConnection()
      .then(status => {
        if (status.connected) {
          stopAllMovement();
          window.api.disableManualMode()
            .then(result => {
              if (result.success) {
                console.log('Manual mode disabled successfully');
              }
            })
            .catch(error => console.error('Disable error:', error));
        }
      })
      .catch(error => console.error('Connection check error:', error));
  };

  const isHomingButtonDisabled = !connectionStatus.connected || controls.homing || coilLLSStatus;

  // Movement disabled conditions:
  // - No connection OR homing in progress
  const isMovementDisabled = !connectionStatus.connected || controls.homing;

  // Individual button disabled conditions:
  // Insertion button disabled when: 
  // 1. Movement is globally disabled
  // 2. Retraction is currently active
  const isInsertionDisabled = isMovementDisabled || controls.retraction;

  // Retraction button disabled when:
  // 1. Movement is globally disabled
  // 2. Insertion is currently active
  const isRetractionDisabled = isMovementDisabled || controls.insertion;

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100 p-4 md:p-6">
      <div className="w-full mx-auto">
        {/* Header */}
        {/* <div className="flex items-center justify-between mb-8"> */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 md:mb-8">
          {/* <div className="flex items-center space-x-4"> */}
          <div className="flex items-center space-x-2 md:space-x-4">
            <button
              onClick={() => {
                window.api.checkConnection()
                  .then(status => {
                    if (status.connected) {
                      stopAllMovement();
                      window.api.disableManualMode()
                        .catch(error => console.error('Disable error:', error));
                    }
                  })
                  .catch(error => console.error('Connection check error:', error));

                window.history.back();
              }}
              className="p-2 hover:bg-white hover:shadow-md rounded-lg transition-all duration-200"
            >
              <ArrowLeft className="w-6 h-6 text-slate-600" />
            </button>

            <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Manual Mode</h1>
          </div>

          {/* <div className="flex items-center space-x-3"> */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Power Status Badge */}
            {/* <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${powerActive ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}> */}
            <div className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg ${powerActive ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
              <Power className="w-4 h-4" />
              <span className="text-sm font-medium">
                POWERED {powerActive ? 'ON' : 'OFF'}
              </span>
            </div>

            {/* USB Connection Status Badge */}
            {/* <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${connectionStatus.connected ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
              <Usb className="w-4 h-4" />
              <span className="text-sm font-medium"> */}
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
                title="Attempt to reconnect USB"
              >
                Reconnect
              </button>
            )}

            <button
              onClick={() => {
                const confirmed = window.confirm("Are you sure you want to exit?");
                if (confirmed) {
                  disableManualMode();
                  window.close();
                }
              }}
              className="group bg-linear-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white 
            rounded-xl lg:rounded-2xl w-8 h-8 sm:w-12 sm:h-12 lg:w-14 lg:h-14 flex items-center justify-center transition-all 
            duration-300 hover:-translate-y-1 shadow-lg hover:shadow-xl border border-red-400/30 shrink-0"
            >
              <Power className="w-3 h-3 sm:w-5 sm:h-5 lg:w-6 lg:h-6 group-hover:scale-110 transition-transform duration-300" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        {/* <div className="grid grid-cols-1 xl:grid-cols-3 gap-6"> */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Left Column - Graph and Sensors */}
          {/* <div className="lg:col-span-2"> */}
          {/* <div className="lg:col-span-2 flex flex-col w-full"> */}
          <div className="lg:col-span-2 flex flex-col w-full space-y-6">
            {/* Live Video Feed */}
            <div className="xl:col-span-2">
              {/* <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"> */}
              {/* <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden h-full flex flex-col"> */}
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden h-full flex flex-col">
                {/* Manual Distance Graph */}
                {/* <div className="bg-white border-t border-slate-200 p-6"> */}
                {/* <div className="bg-white border-t border-slate-200 p-4 md:p-6"> */}
                {/* <div className="bg-white border-t border-slate-200 p-4 md:p-6 flex-1"> */}
                {/* <div className="bg-white p-4 md:p-6 flex-1 flex flex-col"> */}
                <div className="bg-white p-4 md:p-6 flex-1 flex flex-col w-full max-w-full overflow-x-auto">
                  {/* <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-3"> */}
                  {/* <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 md:mb-6"> */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 md:mb-6 shrink-0">
                    <div className="flex items-center space-x-2 md:space-x-3">
                      <div className="p-2 bg-linear-to-br from-blue-500 to-cyan-500 rounded-lg shadow-sm">
                        <TrendingUp className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-slate-800">
                          Distance vs Force
                        </h3>
                        <p className="text-slate-500 text-xs font-medium">Real-time analysis</p>
                      </div>
                    </div>
                    {/* <div className="flex items-center space-x-6 bg-slate-50/50 px-4 py-2 rounded-xl border border-slate-100 shadow-sm"> */}
                    <div className="flex items-center space-x-3 sm:space-x-6 bg-slate-50/50 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border border-slate-100 shadow-sm">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-1 bg-blue-500 rounded-full shadow-sm shadow-blue-500/50" />
                        <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Insertion</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-1 bg-red-500 rounded-full shadow-sm shadow-red-500/50" />
                        <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Retraction</span>
                      </div>
                    </div>
                  </div>

                  {/* <div className="w-full h-100 relative"> */}
                  <div className="w-full h-[calc(100%-120px)] min-h-137.5 relative">
                    <Line
                      data={chartConfig}
                      options={chartOptions}
                      redraw={false}
                    />
                  </div>
                </div>

              </div>
            </div>

            {/* Right Column - Control Panel */}
            <div className="space-y-4 md:space-y-6">

              {/* Sensor Readings */}
              {/* <div className="p-6 bg-slate-50 border-t border-slate-200"> */}
              <div className="bg-white rounded-xl md:rounded-2xl shadow-xl border border-slate-200 p-4 md:p-6">
                {/* <div className="grid grid-cols-2 gap-6"> */}
                {/* <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6"> */}
                {/* <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6"> */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
                  {/* Temperature */}
                  {/* <div className="flex items-center space-x-4"> */}
                  {/* <div className="flex items-center space-x-3 md:space-x-4"> */}
                  {/* <div className="flex items-center space-x-3 md:space-x-4 bg-white"> */}
                  <div className="flex items-center space-x-4 md:space-x-6 bg-white p-4 md:p-5 rounded-xl">
                    <div className="p-3 bg-orange-100 rounded-xl">
                      <Thermometer className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-slate-600 text-sm font-medium">Temperature</p>
                      <div className="flex items-center space-x-2">
                        <div>
                          <div
                            className="h-full bg-orange-500 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, (temperature / 40) * 100)}%` }}
                          ></div>
                        </div>
                        {/* <span className="text-slate-800 font-bold text-lg"> */}
                        <span className="text-slate-800 font-bold text-base md:text-lg">
                          {temperature === '--' ? '-- °C' : (parseFloat(temperature) > 100 ? 'ERROR 01' : `${parseFloat(temperature).toFixed(1)}°C`)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Force in mN */}
                  {/* <div className="flex items-center space-x-4"> */}
                  {/* <div className="flex items-center space-x-3 md:space-x-4"> */}
                  <div className="flex items-center space-x-3 md:space-x-4 bg-white">
                    <div className="p-3 bg-blue-100 rounded-xl">
                      <Zap className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-slate-600 text-sm font-medium">Force</p>
                      <div className="flex items-center space-x-2">
                        <div>
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, (force / 2000) * 100)}%` }}
                          ></div>
                        </div>

                        {/* <span className="text-slate-800 font-bold text-lg"> */}
                        <span className="text-slate-800 font-bold text-base md:text-lg">
                          {force === '--' ? '-- mN' : `${parseFloat(force).toFixed(2)} mN`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Manual Movement Distance */}
                  {/* <div className="flex items-center space-x-4 mt-3"> */}
                  {/* <div className="flex items-center space-x-3 md:space-x-4 mt-2 md:mt-3"> */}
                  <div className="flex items-center space-x-4 md:space-x-6 mt-2 md:mt-3 bg-white p-4 md:p-5 rounded-xl col-span-1">
                    {/* <div className="flex items-center space-x-3 md:space-x-4 bg-white"></div> */}
                    <div className="flex items-center space-x-4 md:space-x-6 bg-white p-4 md:p-5 rounded-xl">
                      <div className="p-3 bg-emerald-100 rounded-xl">
                        <Move className="w-6 h-6 text-emerald-600" />
                      </div>

                      <div>
                        <p className="text-slate-600 text-sm font-medium">Distance</p>

                        {/* <span className="text-slate-800 font-bold text-lg"> */}
                        <span className="text-slate-800 font-bold text-base md:text-lg">
                          {manualDistance === '--' ? '-- mm' : `${manualDistance} mm`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Control Panel */}
          {/* <div className="space-y-6"> */}
          {/* <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 md:gap-6"> */}
          {/* Control Panel */}
          <div className="grid grid-cols-2 gap-4 md:gap-6">
            {/* Row 1: Clamp Control and Heater Control side by side */}
            {/* Clamp Control */}
            <div className="bg-white rounded-xl md:rounded-2xl shadow-xl border border-slate-200 p-4 md:p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Clamp Control</h3>
              <p className="text-sm text-slate-500 mb-4">Press to toggle clamp ON/OFF</p>
              <div className="flex justify-center">
                <button
                  onClick={handleClampToggle}
                  disabled={!connectionStatus.connected || controls.homing}
                  className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 transition-all duration-300 shadow-lg hover:shadow-xl ${!connectionStatus.connected || controls.homing
                      ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                      : controls.clamp
                        ? 'bg-purple-500 border-purple-600 text-white hover:bg-purple-600'
                        : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                    }`}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    {/* <Zap className="w-6 h-6 sm:w-8 sm:h-8" /> */}
                    <img
                      src={clampIcon}
                      alt="Clamp"
                      className="w-6 h-6 sm:w-8 sm:h-8 object-contain"
                    />
                  </div>
                  {controls.clamp && connectionStatus.connected && (
                    <div className="absolute -inset-1 bg-purple-500 rounded-full animate-ping opacity-30"></div>
                  )}
                </button>
              </div>
              <div className="mt-4 text-center">
                <span className={`text-sm font-semibold ${controls.clamp ? 'text-purple-600' : 'text-slate-600'}`}>
                  {controls.clamp ? 'CLAMPED' : 'UNCLAMPED'}
                </span>
              </div>
            </div>

            {/* Heater Control */}
            <div className="bg-white rounded-xl md:rounded-2xl shadow-xl border border-slate-200 p-4 md:p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Heater Control</h3>
              <p className="text-sm text-slate-500 mb-4">Press to toggle ON/OFF</p>
              <div className="flex justify-center">
                <button
                  onClick={handleHeaterToggle}
                  disabled={!connectionStatus.connected || controls.homing}
                  className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 transition-all duration-300 shadow-lg hover:shadow-xl ${!connectionStatus.connected || controls.homing
                      ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                      : controls.heater
                        ? 'bg-orange-500 border-orange-600 text-white hover:bg-orange-600'
                        : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                    }`}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Flame className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  {controls.heater && connectionStatus.connected && (
                    <div className="absolute -inset-1 bg-orange-500 rounded-full animate-ping opacity-30"></div>
                  )}
                </button>
              </div>
              <div className="mt-4 text-center">
                <span className={`text-sm font-semibold ${controls.heater ? 'text-orange-600' : 'text-slate-600'}`}>
                  {controls.heater ? 'HEATING' : 'OFF'}
                </span>
              </div>
            </div>

            {/* Row 2: Movement Control full width */}
            <div className="col-span-2 bg-white rounded-xl md:rounded-2xl shadow-xl border border-slate-200 p-4 md:p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Movement Control</h3>
              <p className="text-sm text-slate-500 mb-4">Control catheter movement</p>

              <div className="flex justify-center space-x-6 md:space-x-8">
                {/* Retraction (Backward) Button - Left Arrow */}
                <button
                  onClick={handleRetraction}
                  disabled={isRetractionDisabled}
                  className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 transition-all duration-300 shadow-lg hover:shadow-xl ${isRetractionDisabled
                      ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                      : controls.retraction
                        ? 'bg-blue-500 border-blue-600 text-white hover:bg-blue-600'
                        : 'bg-white border-slate-300 text-slate-600 hover:border-blue-400 hover:bg-blue-50'
                    }`}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ChevronLeft className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  {controls.retraction && connectionStatus.connected && (
                    <div className="absolute -inset-1 bg-blue-500 rounded-full animate-ping opacity-30"></div>
                  )}
                </button>

                {/* Insertion (Forward) Button - Right Arrow */}
                <button
                  onClick={handleInsertion}
                  disabled={isInsertionDisabled}
                  className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 transition-all duration-300 shadow-lg hover:shadow-xl ${isInsertionDisabled
                      ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                      : controls.insertion
                        ? 'bg-blue-500 border-blue-600 text-white hover:bg-blue-600'
                        : 'bg-white border-slate-300 text-slate-600 hover:border-blue-400 hover:bg-blue-50'
                    }`}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ChevronRight className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  {controls.insertion && connectionStatus.connected && (
                    <div className="absolute -inset-1 bg-red-500 rounded-full animate-ping opacity-30"></div>
                  )}
                </button>
              </div>

              <div className="mt-6 text-center">
                <div className="text-sm font-semibold">
                  {controls.insertion && (
                    <span className="text-blue-600">INSERTING FORWARD (Press again to stop)</span>
                  )}
                  {controls.retraction && (
                    <span className="text-blue-600">RETRACTING BACKWARD (Press again to stop)</span>
                  )}
                  {!controls.insertion && !controls.retraction && (
                    <span className="text-slate-600">STATIONARY</span>
                  )}
                </div>
                {controls.insertion && (
                  <p className="text-xs text-gray-500 mt-2">
                    Retraction disabled while inserting
                  </p>
                )}
                {controls.retraction && (
                  <p className="text-xs text-gray-500 mt-2">
                    Insertion disabled while retracting
                  </p>
                )}
                {isMovementDisabled && connectionStatus.connected && !controls.homing && (
                  <p className="text-xs text-amber-600 mt-2">
                    Complete homing first to enable movement
                  </p>
                )}
                {controls.homing && (
                  <p className="text-xs text-blue-600 mt-2">
                    Homing in progress - movement disabled
                  </p>
                )}
              </div>
            </div>

            {/* Row 3: Homing Control full width */}
            <div className="col-span-2 bg-white rounded-xl md:rounded-2xl shadow-xl border border-slate-200 p-4 md:p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Homing Control</h3>
              <p className="text-sm text-slate-500 mb-4">Press to reset catheter position</p>
              <div className="flex justify-center">
                <button
                  onClick={resetCatheter}
                  disabled={isHomingButtonDisabled}
                  className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 transition-all duration-300 shadow-lg hover:shadow-xl ${isHomingButtonDisabled
                      ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                      : controls.homing
                        ? 'bg-blue-500 border-blue-600 text-white'
                        : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                    }`}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <RotateCw className={`w-6 h-6 sm:w-8 sm:h-8 ${controls.homing ? 'animate-spin' : ''}`} />
                  </div>
                  {controls.homing && connectionStatus.connected && (
                    <div className="absolute -inset-1 bg-blue-500 rounded-full animate-ping opacity-30"></div>
                  )}
                </button>
              </div>
              <div className="mt-4 text-center">
                <span className={`text-sm font-semibold ${controls.homing ? 'text-blue-600' : 'text-slate-600'}`}>
                  {controls.homing ? 'HOMING ACTIVE' : coilLLSStatus ? 'AT HOME' : 'READY'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Manual;