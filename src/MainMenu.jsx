import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Power, Usb } from 'lucide-react';
import manualIcon from './assets/Manual.png';

const MainMenu = () => {
  const [selectedOption, setSelectedOption] = useState(null);
  const [isHovering, setIsHovering] = useState(null);
  const navigate = useNavigate();
  const [showPowerDropdown, setShowPowerDropdown] = useState(false);
  const dropdownRef = useRef(null);


  // Connection state
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [powerActive, setPowerActive] = useState(false);

  useEffect(() => {
    // Initial checks
    checkInitialConnection();
    checkInitialEmergencyStatus();
    checkInitialPowerStatus();

    // Listen for modbus status updates
    window.addEventListener('modbus-status-change', handleModbusStatus);

    // Listen for emergency status updates
    const handleEmergencyStatus = (event) => {
      setEmergencyActive(event.detail === true);
    };
    window.addEventListener('emergency-status-change', handleEmergencyStatus);

    // Listen for power status updates
    const handlePowerStatus = (event) => {
      setPowerActive(event.detail === true);
    };
    window.addEventListener('power-status-change', handlePowerStatus);

    // Cleanup
    return () => {
      window.removeEventListener('modbus-status-change', handleModbusStatus);
      window.removeEventListener('emergency-status-change', handleEmergencyStatus);
      window.removeEventListener('power-status-change', handlePowerStatus);
    };
  }, []);

  const menuOptions = [
    {
      id: 'load-config',
      title: 'Load Configuration',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      description: 'Load existing configuration files',
      gradient: 'from-blue-500 to-cyan-500'
    },
    {
      id: 'manual-mode',
      title: 'Manual Mode',
      icon: (
        <img
          src={manualIcon}
          alt="Manual Mode"
          className="w-8 h-8 object-contain"
        />
      ),
      description: 'Manually control the testing process',
      gradient: 'from-purple-500 to-pink-500'
    },
    {
      id: 'process-logs',
      title: 'Show Process Logs',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
      description: 'View detailed process logs and history',
      gradient: 'from-green-500 to-emerald-500'
    },
    {
      id: 'create-config',
      title: 'Create Configuration',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      description: 'Create new configuration settings',
      gradient: 'from-orange-500 to-amber-500'
    },
    {
      id: 'delete-config',
      title: 'Delete Configuration',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      ),
      description: 'Remove existing configuration files',
      variant: 'danger',
      gradient: 'from-red-500 to-rose-500'
    },
    {
      id: 'check-updates',
      title: 'Check for Updates',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
      description: 'Check if a newer version is available on GitHub',
      gradient: 'from-indigo-500 to-purple-500'
    }
  ];

  // Handle modbus status updates
  const handleModbusStatus = (event) => {
    const status = event.detail;
    setConnectionStatus(status);
    setConnectionChecked(true);
    console.log('Modbus status updated:', status);
  };

  // Check initial connection
  const checkInitialConnection = async () => {
    try {
      console.log('Checking initial connection...');
      const status = await window.api.checkConnection();
      setConnectionStatus(status.connected ? 'connected' : 'disconnected');
      setConnectionChecked(true);
      console.log('Initial connection status:', status);
    } catch (error) {
      console.error('Failed to check connection:', error);
      setConnectionStatus('disconnected');
      setConnectionChecked(true);
    }
  };
  // Check initial emergency status
  const checkInitialEmergencyStatus = async () => {
    try {
      const status = await window.api.checkEmergencyStatus();
      setEmergencyActive(status.active);
      console.log('Initial emergency status:', status.active);
    } catch (error) {
      console.error('Failed to check emergency status:', error);
    }
  };

  // Check initial power status
  const checkInitialPowerStatus = async () => {
    try {
      const status = await window.api.checkPowerStatus();
      setPowerActive(status.active);
      console.log('Initial power status:', status.active);
    } catch (error) {
      console.error('Failed to check power status:', error);
    }
  };

  // Handle manual connection attempt
  const handleConnect = async () => {
    try {
      console.log('Attempting to connect manually...');
      const connected = await window.api.connectModbus();
      if (connected) {
        setConnectionStatus('connected');
        console.log('Manual connection successful');
      } else {
        console.log('Manual connection failed');
      }
    } catch (error) {
      console.error('Connection error:', error);
    }
  };

  // Handle reconnect
  const handleReconnect = async () => {
    try {
      console.log('Attempting to reconnect...');
      const result = await window.api.reconnect();
      if (result.success && result.connected) {
        setConnectionStatus('connected');
        console.log('Reconnect successful');
      } else {
        console.log('Reconnect failed');
      }
    } catch (error) {
      console.error('Reconnect error:', error);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowPowerDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleOptionClick = async (option) => {
    if (emergencyActive && (option.id === 'load-config' || option.id === 'manual-mode')) {
      return; // Do nothing if emergency is active for these options
    }

    setSelectedOption(option.id);
    console.log(`Selected: ${option.title}`);

    if (option.id === 'create-config') {
      navigate('/create-config');
    }
    else if (option.id === 'load-config') {
      navigate('/handle-config/load');
    }
    else if (option.id === 'delete-config') {
      navigate('/handle-config/delete');
    }
    else if (option.id === 'manual-mode') {
      try {
        console.log('Activating manual mode (non-blocking)...');
        window.api.manual().catch(error => {
          console.error('Manual mode command error (non-blocking):', error);
        });
        navigate('/manual-mode');
      } catch (error) {
        console.error('Navigation error for manual mode:', error);
        navigate('/manual-mode');
      }
    }
    else if (option.id === 'process-logs') {
      navigate('/process-logs');
    }
    else if (option.id === 'check-updates') {
      try {
        console.log('Manually checking for updates...');
        // Dispatch event so UpdateChecker knows it's a manual check
        window.dispatchEvent(new CustomEvent('manual-check-triggered'));
        await window.api.checkForUpdates();
      } catch (error) {
        console.error('Update check error:', error);
      }
    }
  };

  const handleExit = () => {
    const confirmed = window.confirm("Are you sure you want to exit?");
    if (confirmed) {
      window.close();
    }
    setShowPowerDropdown(false);
  };

  const handleLogout = () => {
    navigate('/');
    setShowPowerDropdown(false);
  };

  const togglePowerDropdown = () => {
    setShowPowerDropdown(!showPowerDropdown);
  };

  // Connection status display
  // const getConnectionDisplay = () => {
  //   if (!connectionChecked) {
  //     return {
  //       text: 'Checking connection...',
  //       color: 'text-gray-500',
  //       bgColor: 'bg-gray-100',
  //       borderColor: 'border-gray-200',
  //       icon: <Usb className="w-4 h-4 animate-pulse" />
  //     };
  //   }

  //   if (connectionStatus === 'connected') {
  //     return {
  //       text: 'USB Connected',
  //       color: 'text-green-700',
  //       bgColor: 'bg-green-100',
  //       borderColor: 'border-green-200',
  //       icon: <Usb className="w-4 h-4" />
  //     };
  //   } else {
  //     return {
  //       text: 'USB Disconnected',
  //       color: 'text-red-700',
  //       bgColor: 'bg-red-100',
  //       borderColor: 'border-red-200',
  //       icon: <Usb className="w-4 h-4" />
  //     };
  //   }
  // };

  // const connectionInfo = getConnectionDisplay();

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 shrink-0 ">
      {/* Header */}
      <header className="flex items-center px-6 py-4 bg-white/80 backdrop-blur-lg shadow-xl border-b border-gray-200/50 relative z-10 flex-shrink-o min-h-0">

        <div className="flex-1 flex items-center gap-4">
          <h1 className="text-3xl font-bold bg-linear-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
            Main Menu
          </h1>
          {emergencyActive && (
            <div className="bg-red-600 text-white px-4 py-2 rounded-full animate-pulse border-2 border-red-400 shadow-lg flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="font-bold tracking-wider">EMERGENCY BUTTON ACTIVATED</span>
            </div>
          )}
        </div>

        {/* Connection & Power Status Indicators */}
        <div className="flex items-center gap-3 mr-4">
          {/* Power Status Indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${powerActive ? 'bg-green-100 border-green-200' : 'bg-red-100 border-red-200'} border`}>
            <Power className={`w-4 h-4 ${powerActive ? 'text-green-700' : 'text-red-700'}`} />
            <span className={`text-sm font-medium ${powerActive ? 'text-green-700' : 'text-red-700'}`}>
              POWERED {powerActive ? 'ON' : 'OFF'}
            </span>
          </div>

          {/* <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${connectionInfo.bgColor} border ${connectionInfo.borderColor}`}>
            {connectionInfo.icon}
            <span className={`text-sm font-medium ${connectionInfo.color}`}>
              {connectionInfo.text}
            </span>
          </div> */}
                    {/* USB Status Indicator - Updated to match power button style */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${connectionStatus === 'connected' ? 'bg-green-100 border-green-200' : 'bg-red-100 border-red-200'} border`}>
            <Usb className={`w-4 h-4 ${connectionStatus === 'connected' ? 'text-green-700' : 'text-red-700'}`} />
            <span className={`text-sm font-medium ${connectionStatus === 'connected' ? 'text-green-700' : 'text-red-700'}`}>
              {connectionStatus === 'connected' ? 'USB Connected' : 'USB Disconnected'}
            </span>
          </div>

          {connectionStatus === 'disconnected' && connectionChecked && (
            <button
              onClick={handleReconnect}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Reconnect
            </button>
          )}
        </div>
        {/* Direct Power Button - No Dropdown */}
        <button
          onClick={() => {
            const confirmed = window.confirm("Are you sure you want to exit?");
            if (confirmed) {
              window.close();
            }
          }}
          className="group bg-linear-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl lg:rounded-2xl w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 flex items-center justify-center transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-xl border border-red-400/30"
        >
          <Power className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 group-hover:scale-110 transition-transform duration-300" />
        </button>


      </header>

      {/* Main Content */}
      <main className="flex-1 px-8 py-8 xl:py-16 shrink-0 min-h-0">
        <div className="max-w-450 mx-auto">
          <div className="flex flex-col xl:flex-row gap-8 xl:gap-20 items-start xl:items-center">
            {/* Left Section - Menu Options */}
            <div className="w-full xl:flex-1 xl:max-w-3xl">
              <div className="mb-8">
                <p className="text-xl font-semibold text-gray-500">Select an option to continue</p>
              </div>

              <div className="grid gap-5">
                {menuOptions.map((option, index) => (
                  <button
                    key={option.id}
                    className={`group relative bg-white/70 backdrop-blur-sm border-2 rounded-2xl p-8 cursor-pointer transition-all duration-500 flex items-center gap-6 text-left shadow-xl hover:shadow-2xl transform hover:-translate-y-2 overflow-hidden
                      ${option.variant === 'danger'
                        ? 'border-gray-200/50 bg-linear-to-r from-gray-50/80 to-gray-50/80 hover:border-red-400 hover:from-red-100/90 hover:to-rose-100/90'
                        : 'border-gray-200/50 hover:border-blue-400/80 hover:bg-white/90'
                      }
                      ${selectedOption === option.id
                        ? 'border-blue-400 bg-blue-50/80 shadow-blue-200/50'
                        : ''
                      }
                    `}
                    onClick={() => handleOptionClick(option)}
                    onMouseEnter={() => setIsHovering(option.id)}
                    onMouseLeave={() => setIsHovering(null)}
                    disabled={emergencyActive && (option.id === 'load-config' || option.id === 'manual-mode')}
                    style={{
                      animationDelay: `${index * 100}ms`,
                      opacity: (emergencyActive && (option.id === 'load-config' || option.id === 'manual-mode')) ? 0.5 : 1,
                      cursor: (emergencyActive && (option.id === 'load-config' || option.id === 'manual-mode')) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {/* Animated background gradient */}
                    <div className={`absolute inset-0 bg-linear-to-r ${option.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500`}></div>

                    {/* Left accent line */}
                    <div className={`absolute left-0 top-0 h-full w-1.5 bg-linear-to-b ${option.gradient} transition-all duration-500 transform scale-y-0 group-hover:scale-y-100 origin-top
                      ${selectedOption === option.id ? 'scale-y-100' : ''}`}></div>

                    {/* Icon container */}
                    <div className={`relative w-16 h-16 flex items-center justify-center rounded-xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-3
                      ${option.variant === 'danger'
                        ? 'bg-linear-to-br from-gray-100 to-gray-200 text-gray-700 group-hover:from-red-200 group-hover:to-rose-300'
                        : 'bg-linear-to-br from-gray-100 to-gray-200 text-gray-700 group-hover:from-blue-100 group-hover:to-indigo-200 group-hover:text-blue-600'
                      }
                      ${selectedOption === option.id ? 'scale-110 rotate-3' : ''}`}>
                      {option.icon}

                      {/* Glow effect */}
                      <div className={`absolute inset-0 rounded-xl bg-linear-to-br ${option.gradient} opacity-0 group-hover:opacity-20 transition-opacity duration-500 blur-sm`}></div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`text-2xl font-bold transition-colors duration-300
                          ${option.variant === 'danger'
                            ? 'text-gray-800 group-hover:text-red-800'
                            : 'text-gray-800 group-hover:text-blue-800'
                          }
                          ${selectedOption === option.id ? 'text-blue-800' : ''}`}>
                          {option.title}
                        </h3>
                      </div>
                      <p className="text-gray-600 leading-relaxed text-base group-hover:text-gray-700 transition-colors duration-300">
                        {option.description}
                      </p>
                    </div>

                    {/* Arrow with enhanced animation */}
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-500 transform
                      ${option.variant === 'danger'
                        ? 'bg-blue-100 text-blue-600 group-hover:bg-red-200 group-hover:text-red-600 group-hover:translate-x-2 group-hover:scale-110'
                        : 'bg-blue-100 text-blue-600 group-hover:bg-blue-200 group-hover:translate-x-2 group-hover:scale-110'
                      }
                      ${selectedOption === option.id ? 'translate-x-2 scale-110' : ''}`}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="transition-transform duration-300 group-hover:scale-125">
                        <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>

                    {/* Hover glow effect */}
                    <div className={`absolute inset-0 rounded-2xl bg-linear-to-r ${option.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none`}></div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Section - Product Info */}
            <div className="w-full xl:flex-1 xl:max-w-2xl flex xl:justify-center">
              <div className="bg-white/60 backdrop-blur-lg rounded-3xl p-10 shadow-2xl border border-white/20 w-full">
                {/* Product Header */}
                <div className="mb-8">
                  <h1 className="text-8xl font-bold bg-linear-to-r from-gray-900 via-gray-800 to-gray-700 bg-clip-text text-transparent mb-4 tracking-tight leading-none">
                    CTTM
                  </h1>
                  <h2 className="text-4xl font-bold bg-linear-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-6 leading-tight">
                    Catheter Trackability Testing Machine
                  </h2>
                </div>

                <p className="text-xl leading-relaxed text-gray-700 mb-10 font-medium">
                  A reliable solution for precise catheter navigation and accurate performance
                  evaluation, designed for accuracy in every test.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Enhanced Footer */}
      <footer className="relative z-10 px-4 lg:px-8 py-4 lg:py-6 bg-white/90 backdrop-blur-xl border-t border-gray-200/50 shrink-0 shadow-lg">
        <div className="flex flex-col lg:flex-row justify-between items-center max-w-500 mx-auto gap-3 lg:gap-0 w-full">
          <div className="flex items-center gap-4 lg:gap-6">
            <p className="text-gray-400 text-sm">Copyright 2026 © Revive Medical Technologies Inc.</p>
            <div className="flex items-center gap-2">
            </div>
          </div>
          <div className="flex items-center gap-3 lg:gap-6 text-xs lg:text-sm text-gray-400 font-medium">
            <span>Version 1.0.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MainMenu;