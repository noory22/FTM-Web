import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  Power,
  RefreshCw,
  Usb,
  X,
  ArrowLeft,
} from 'lucide-react';
import { getVisibleNavigationGroups, pageTitles } from './navigation.js';

const AppShell = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [userRole, setUserRole] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showPowerDropdown, setShowPowerDropdown] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [powerActive, setPowerActive] = useState(false);
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [openMenus, setOpenMenus] = useState({});
  const dropdownRef = useRef(null);

  const [plcData, setPlcData] = useState({
    machineStatus: 'IDLE',
    distance: '--',
    catheterDistance: '--',
    force: '--',
    manual: false,
    twoPoint: false,
    threePoint: false
  });

  useEffect(() => {
    let intervalId;
    const poll = async () => {
      if (connectionStatus !== 'connected') {
        setPlcData({
          machineStatus: 'UNKNOWN',
          distance: '--',
          catheterDistance: '--',
          force: '--',
          manual: false,
          twoPoint: false,
          threePoint: false
        });
        return;
      }
      try {
        const data = await window.api.readData();
        if (data.success) {
          setPlcData({
            machineStatus: data.machineStatusDisplay || 'IDLE',
            distance: data.distance !== undefined ? `${data.distance} mm` : '--',
            catheterDistance: data.catheterDistance !== undefined ? `${data.catheterDistance} mm` : '--',
            force: data.force_mN !== undefined ? `${data.force_mN.toFixed(2)} mN` : '--',
            manual: Boolean(data.manual),
            twoPoint: Boolean(data.twoPoint),
            threePoint: Boolean(data.threePoint)
          });
        }
      } catch (err) {
        console.error("Error polling PLC data in AppShell:", err);
      }
    };

    poll();
    intervalId = setInterval(poll, 500);
    return () => clearInterval(intervalId);
  }, [connectionStatus]);

  useEffect(() => {
    const updateModeFromPath = async () => {
      if (connectionStatus !== 'connected' || emergencyActive) return;
      try {
        if (location.pathname.includes('2-point')) {
          await window.api?.twoPointActivate?.();
        } else if (location.pathname.includes('3-point')) {
          await window.api?.threePointActivate?.();
        } else if (location.pathname.includes('manual-mode')) {
          await window.api?.manualModeActivate?.();
        } else {
          await window.api?.deactivateManual?.();
        }
      } catch (err) {
        console.error('Error auto-activating mode based on route:', err);
      }
    };
    updateModeFromPath();
  }, [location.pathname, connectionStatus, emergencyActive]);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      navigate('/');
      return;
    }

    try {
      setUserRole(JSON.parse(user).role);
    } catch (error) {
      localStorage.removeItem('user');
      navigate('/');
    }
  }, [navigate]);

  useEffect(() => {
    let mounted = true;

    const checkInitialStatus = async () => {
      try {
        const [connection, power, emergency] = await Promise.all([
          window.api?.checkConnection?.(),
          window.api?.checkPowerStatus?.(),
          window.api?.checkEmergencyStatus?.(),
        ]);

        if (!mounted) return;
        setConnectionStatus(connection?.connected ? 'connected' : 'disconnected');
        setPowerActive(Boolean(power?.active));
        setEmergencyActive(Boolean(emergency?.active));
        setConnectionChecked(true);
      } catch (error) {
        if (mounted) {
          setConnectionStatus('disconnected');
          setConnectionChecked(true);
        }
      }
    };

    const handleModbusStatus = (event) => {
      setConnectionStatus(event.detail === 'connected' ? 'connected' : 'disconnected');
      setConnectionChecked(true);
    };
    const handlePowerStatus = (event) => setPowerActive(event.detail === true);
    const handleEmergencyStatus = (event) => setEmergencyActive(event.detail === true);

    checkInitialStatus();
    window.addEventListener('modbus-status-change', handleModbusStatus);
    window.addEventListener('power-status-change', handlePowerStatus);
    window.addEventListener('emergency-status-change', handleEmergencyStatus);

    return () => {
      mounted = false;
      window.removeEventListener('modbus-status-change', handleModbusStatus);
      window.removeEventListener('power-status-change', handlePowerStatus);
      window.removeEventListener('emergency-status-change', handleEmergencyStatus);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowPowerDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const visibleGroups = useMemo(() => {
    if (!userRole) return [];

    return getVisibleNavigationGroups(userRole);
  }, [userRole]);

  const currentPath = `${location.pathname}${location.search}`;
  const pageTitle = pageTitles[currentPath] || pageTitles[location.pathname] || 'Flexural Testing Machine';

  const itemKey = (item) => item.path || item.label;

  const itemHasActivePath = (item) => {
    if (item.path === currentPath || item.path === location.pathname) return true;
    return item.children?.some(itemHasActivePath) || false;
  };

  const handleGlobalBack = async () => {
    const path = location.pathname;
    
    if (path.includes('manual-mode')) {
      try {
        console.log('Deactivating manual mode before leaving...');
        await window.api.deactivateManual?.();
      } catch (error) {
        console.error('Failed to deactivate manual mode:', error);
      }
      navigate('/main-menu');
    } else if (path.includes('test-action/')) {
      navigate('/test-selection');
    } else if (path.includes('create-config/') || path.includes('load-config/') || path.includes('delete-config/')) {
      const is2Point = path.includes('2-point');
      navigate(`/test-action/${is2Point ? '2-point' : '3-point'}`);
    } else if (path.includes('process-mode')) {
      // Don't allow backing out if process is actively running and not finished/ready
      if (plcData.machineStatus !== 'READY' && plcData.machineStatus !== 'IDLE' && plcData.machineStatus !== 'UNKNOWN' && plcData.machineStatus !== 'COMPLETED') {
        alert("Please STOP and RESET the process before navigating away.");
        return;
      }
      navigate('/main-menu');
    } else {
      navigate('/main-menu');
    }
  };

  const handleReconnect = async () => {
    try {
      const result = await window.api.reconnect();
      if (result?.success && result?.connected) {
        setConnectionStatus('connected');
      }
    } catch (error) {
      console.error('Reconnect error:', error);
    }
  };

  const handleNavClick = (item) => {
    if (item.children?.length) {
      setOpenMenus((prev) => ({
        ...prev,
        [itemKey(item)]: !prev[itemKey(item)],
      }));
      // Activate coils on expand/click of parent menu items in sidebar
      if (item.label === '2-Point') {
        window.api?.twoPointActivate?.().catch((error) => {
          console.error('2-Point mode activation error:', error);
        });
      } else if (item.label === '3-Point') {
        window.api?.threePointActivate?.().catch((error) => {
          console.error('3-Point mode activation error:', error);
        });
      }
      return;
    }

    if (emergencyActive && item.blockedByEmergency) {
      return;
    }

    if (item.action === 'manual') {
      window.api?.manual?.().catch((error) => {
        console.error('Manual mode command error:', error);
      });
    }

    navigate(item.path);
  };

  const renderNavItem = (item, depth = 0) => {
    const Icon = item.icon;
    const key = itemKey(item);
    const hasChildren = Boolean(item.children?.length);
    const isOpen = openMenus[key] || itemHasActivePath(item);
    const isActive = item.path === currentPath || item.path === location.pathname;
    const disabled = emergencyActive && item.blockedByEmergency;

    return (
      <div key={key} className="space-y-1">
        <button
          type="button"
          onClick={() => handleNavClick(item)}
          disabled={disabled}
          className={`flex min-h-11 w-full items-center gap-3 rounded-lg py-2.5 pr-3 text-left text-sm font-medium transition-colors ${
            disabled
              ? 'cursor-not-allowed text-slate-500'
              : isActive
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/30'
                : itemHasActivePath(item)
                  ? 'bg-white/10 text-white'
                  : 'text-slate-200 hover:bg-white/10 hover:text-white'
          }`}
          style={{ paddingLeft: `${12 + depth * 18}px` }}
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {hasChildren && (
            isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
          )}
        </button>

        {hasChildren && isOpen && (
          <div className="space-y-1">
            {item.children.map((child) => renderNavItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const handleUpdateCheck = async () => {
    try {
      window.dispatchEvent(new CustomEvent('manual-check-triggered'));
      await window.api.checkForUpdates();
    } catch (error) {
      console.error('Update check error:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/');
    setShowPowerDropdown(false);
  };

  const handleExit = () => {
    if (window.confirm('Are you sure you want to exit?')) {
      window.close();
    }
    setShowPowerDropdown(false);
  };

  if (!userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-slate-950 text-white transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0`}>
          <div className="flex h-full flex-col">
            <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">FTM</p>
                <h1 className="text-lg font-bold leading-tight">Flexural Testing Machine</h1>
              </div>
              <button
                className="rounded-lg p-2 text-slate-300 hover:bg-white/10 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-5">
              {visibleGroups.map((group) => (
                <div key={group.title} className="mb-6">
                  <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {group.title}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => renderNavItem(item))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="border-t border-white/10 p-3">
              {userRole === 'admin' && (
                <button
                  onClick={handleUpdateCheck}
                  className="mb-3 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white"
                >
                  <RefreshCw className="h-5 w-5" />
                  <span>Check for Updates</span>
                </button>
              )}
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-xs text-slate-400">Signed in as</p>
                <p className="mt-1 text-sm font-semibold capitalize text-white">{userRole}</p>
              </div>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <button
            className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-5 shadow-sm backdrop-blur lg:px-8">
            <div className="flex items-center gap-4">
              <button
                className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>

              {location.pathname !== '/' && location.pathname !== '/main-menu' && (
                <button
                  onClick={handleGlobalBack}
                  className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 flex items-center justify-center transition-all duration-200"
                  title="Go Back"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}

              {/* Emergency Alert - only shown when active */}
              {emergencyActive && (
                <div className="flex items-center gap-1.5 rounded-lg bg-red-100 border border-red-300 px-3 py-1.5 animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-red-600" />
                  <span className="text-sm font-bold text-red-700">EMERGENCY</span>
                </div>
              )}

              {/* Mode Indicators & Telemetry Display */}
              <div className="hidden flex-1 items-center justify-center gap-6 xl:flex">
                {/* Mode Badges */}
                <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1.5 border border-slate-200">
                  <div className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all select-none ${plcData.manual ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-slate-500'}`}>
                    <span className={`h-2.5 w-2.5 rounded-full border-2 ${plcData.manual ? 'bg-white border-white' : 'border-slate-400 bg-transparent'}`} />
                    Manual
                  </div>
                  <div className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all select-none ${plcData.twoPoint ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-slate-500'}`}>
                    <span className={`h-2.5 w-2.5 rounded-full border-2 ${plcData.twoPoint ? 'bg-white border-white' : 'border-slate-400 bg-transparent'}`} />
                    2-Point
                  </div>
                  <div className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all select-none ${plcData.threePoint ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20' : 'text-slate-500'}`}>
                    <span className={`h-2.5 w-2.5 rounded-full border-2 ${plcData.threePoint ? 'bg-white border-white' : 'border-slate-400 bg-transparent'}`} />
                    3-Point
                  </div>
                </div>

                {/* Telemetry values */}
                <div className="flex items-center gap-4 border-l border-slate-200 pl-6">
                  {/* Status Badge */}
                  <div className="flex flex-col min-w-[70px]">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</span>
                    <span className={`inline-flex items-center gap-1.5 text-sm font-bold capitalize ${
                      plcData.machineStatus === 'READY' ? 'text-green-600' :
                      plcData.machineStatus === 'HOMING' ? 'text-amber-500 animate-pulse' : 'text-slate-600'
                    }`}>
                      <span className={`h-2 w-2 rounded-full ${
                        plcData.machineStatus === 'READY' ? 'bg-green-600' :
                        plcData.machineStatus === 'HOMING' ? 'bg-amber-500 animate-pulse' : 'bg-slate-500'
                      }`} />
                      {plcData.machineStatus}
                    </span>
                  </div>

                  {/* Horizontal Distance (R71) */}
                  <div className="flex flex-col bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 min-w-[90px]">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Horiz. Dist</span>
                    <span className="text-sm font-bold text-slate-800">{plcData.catheterDistance}</span>
                  </div>

                  {/* Vertical Distance (R70) */}
                  <div className="flex flex-col bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 min-w-[90px]">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Vert. Dist</span>
                    <span className="text-sm font-bold text-slate-800">{plcData.distance}</span>
                  </div>

                  {/* Force (R54) */}
                  <div className="flex flex-col bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 min-w-[100px]">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Force</span>
                    <span className="text-sm font-bold text-slate-800">{plcData.force}</span>
                  </div>
                </div>
              </div>

              <div className="hidden items-center gap-2 xl:flex">
                <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${connectionStatus === 'connected' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                  <Usb className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {connectionStatus === 'connected' ? 'USB Connected' : 'USB Disconnected'}
                  </span>
                </div>
                {connectionStatus === 'disconnected' && connectionChecked && (
                  <button
                    onClick={handleReconnect}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Reconnect
                  </button>
                )}
              </div>

              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowPowerDropdown((value) => !value)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm hover:bg-red-700"
                >
                  <Power className="h-5 w-5" />
                </button>

                {showPowerDropdown && (
                  <div className="absolute right-0 mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                    <button
                      onClick={handleExit}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      <Power className="h-4 w-4" />
                      Exit Application
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default AppShell;
