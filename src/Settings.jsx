import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Sliders, 
  Activity, 
  CheckCircle, 
  AlertCircle, 
  Cpu, 
  Weight, 
  Binary, 
  Settings as SettingsIcon 
} from 'lucide-react';

const Settings = () => {
  const navigate = useNavigate();

  // Form parameters (R32 and R33)
  const [weightRange, setWeightRange] = useState('');
  const [inputsMode, setInputsMode] = useState('0'); // '0', '1', or '2'

  // Telemetry state (R30, R31, R36)
  const [telemetry, setTelemetry] = useState({
    force: '--',
    rawForce: '--',
    realtimePlcValue: '--'
  });

  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedInitials, setHasLoadedInitials] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('connected');

  // Poll real-time values from Modbus loop
  useEffect(() => {
    let intervalId;
    const pollData = async () => {
      try {
        const data = await window.api.readData();
        if (data.success) {
          setConnectionStatus('connected');
          
          // Format R30 (Settings Force in grams)
          const forceVal = Number(data.settingsForce);
          const formattedForce = isFinite(forceVal) ? `${forceVal} g` : '--';

          // Format R31 (Raw Force)
          const rawForceVal = Number(data.rawForce);
          const formattedRawForce = isFinite(rawForceVal) ? `${rawForceVal} mN` : '--';

          // Format R36 (PLC real-time changing value)
          const plcVal = Number(data.realtimePlcValue);
          const formattedPlcVal = isFinite(plcVal) ? plcVal : '--';

          setTelemetry({
            force: formattedForce,
            rawForce: formattedRawForce,
            realtimePlcValue: formattedPlcVal
          });

          // Pre-populate input fields with current register values on first load
          if (!hasLoadedInitials) {
            if (data.weightRange !== undefined) {
              setWeightRange(data.weightRange.toString());
            }
            if (data.inputsMode !== undefined) {
              setInputsMode(data.inputsMode.toString());
            }
            setHasLoadedInitials(true);
          }
        } else {
          setConnectionStatus('disconnected');
        }
      } catch (err) {
        console.error("Error polling PLC calibration data:", err);
        setConnectionStatus('disconnected');
      }
    };

    pollData();
    intervalId = setInterval(pollData, 500);

    return () => clearInterval(intervalId);
  }, [hasLoadedInitials]);

  const handleWeightChange = (e) => {
    const val = e.target.value;
    // Restrict inputs to numbers between 0 and 1000
    if (val === '' || (/^\d+$/.test(val) && Number(val) >= 0 && Number(val) <= 1000)) {
      setWeightRange(val);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    if (weightRange === '') {
      setErrorMessage('Weight range is required');
      return;
    }

    const weightNum = Number(weightRange);
    if (isNaN(weightNum) || weightNum < 0 || weightNum > 1000) {
      setErrorMessage('Weight range must be between 0 and 1000');
      return;
    }

    setIsLoading(true);

    try {
      const result = await window.api.writeCalibrationSettings({
        weightRange: weightNum,
        inputsMode: Number(inputsMode)
      });

      if (result && result.success) {
        setSuccessMessage('Calibration parameters written to PLC successfully.');
      } else {
        setErrorMessage(result?.error || 'Failed to write calibration settings. Check Modbus connection.');
      }
    } catch (err) {
      console.error('Error saving calibration settings:', err);
      setErrorMessage(err.message || 'Error occurred while saving calibration settings.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        
        {/* Title Block */}
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-blue-600">
                <Sliders className="h-4 w-4" />
                Calibration Utility
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900 font-sans">Load Cell Calibration</h1>
              <p className="mt-2 max-w-3xl text-slate-600">
                Configure load cell calibration inputs and monitor real-time force register telemetry.
              </p>
            </div>
            
            <div className={`w-fit rounded-lg border px-4 py-2 flex items-center gap-2 text-sm font-semibold shadow-sm ${
              connectionStatus === 'connected' 
                ? 'border-green-200 bg-green-50 text-green-700' 
                : 'border-red-200 bg-red-50 text-red-700'
            }`}>
              <span className={`h-2.5 w-2.5 rounded-full ${connectionStatus === 'connected' ? 'bg-green-600 animate-pulse' : 'bg-red-600'}`} />
              {connectionStatus === 'connected' ? 'Modbus Connected' : 'Modbus Disconnected'}
            </div>
          </div>
        </section>

        {/* Message Banners */}
        {successMessage && (
          <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg shadow-sm flex items-center gap-3 animate-fadeIn">
            <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
            <p className="text-green-800 font-semibold">{successMessage}</p>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm flex items-center gap-3 animate-fadeIn">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-red-800 font-semibold">{errorMessage}</p>
          </div>
        )}

        {/* Two-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Form Side - Writing values */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col justify-between">
            <div className="p-6 md:p-8 space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Calibration Parameters</h3>
                  <p className="text-xs text-slate-500">Inputs will write to registers R32 & R33 on PLC</p>
                </div>
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                
                {/* Weight Range Input (R32) */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    <Weight className="w-4 h-4 text-slate-400" />
                    Weight Range (0-1000)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      value={weightRange}
                      onChange={handleWeightChange}
                      placeholder="Enter weight range parameter"
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 placeholder:text-slate-400 font-medium"
                    />
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                      <span className="text-sm font-semibold text-slate-400">units</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">Register Address: R32</p>
                </div>

                {/* Input Selector (R33) */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                    <Binary className="w-4 h-4 text-slate-400" />
                    Input Selection (0, 1, 2)
                  </label>
                  
                  <div className="flex gap-2">
                    {['0', '1', '2'].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setInputsMode(option)}
                        className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold text-sm transition-all duration-200 ${
                          inputsMode === option
                            ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        Input {option}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">Register Address: R33</p>
                </div>

                {/* Buttons */}
                <div className="pt-4 flex gap-4">
                  <button
                    type="submit"
                    disabled={isLoading || connectionStatus !== 'connected'}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3.5 px-6 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Writing Parameters...' : 'Write to PLC'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="py-3.5 px-6 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all duration-200"
                  >
                    Cancel
                  </button>
                </div>

              </form>
            </div>
          </div>

          {/* Telemetry Side - Reading values */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-6 md:p-8 space-y-6 flex-1 flex flex-col justify-between">
              
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                  <Activity className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Live Calibration Reads</h3>
                  <p className="text-xs text-slate-500">Real-time status registers from the PLC</p>
                </div>
              </div>

              {/* Read Telemetry Display */}
              <div className="space-y-4 my-auto py-4">
                
                {/* Real-time Force (R30) */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Real-time Force</span>
                    <p className="text-[11px] text-slate-400 font-mono">Register: R30 (16-bit integer)</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-green-600 font-mono tracking-tight">
                      {telemetry.force}
                    </span>
                  </div>
                </div>

                {/* Raw Force Value (R31) */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Raw Force Value</span>
                    <p className="text-[11px] text-slate-400 font-mono">Register: R31 (16-bit integer)</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-blue-600 font-mono tracking-tight">
                      {telemetry.rawForce}
                    </span>
                  </div>
                </div>

                {/* Real-time Value (R36) */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PLC Real-time Value</span>
                    <p className="text-[11px] text-slate-400 font-mono">Register: R36 (16-bit integer)</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-amber-500 font-mono tracking-tight">
                      {telemetry.realtimePlcValue}
                    </span>
                  </div>
                </div>

              </div>

              <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center gap-3">
                <Cpu className="w-5 h-5 text-slate-400 shrink-0" />
                <p className="text-xs text-slate-500 leading-normal">
                  R30 and R31 are scaled values from the load cell transducer. R36 acts as the internal system calibration counter changing dynamically.
                </p>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default Settings;
