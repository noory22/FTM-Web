import React, { useState, useEffect } from 'react';
import { ArrowLeft, Play, FileText, ChevronDown } from 'lucide-react';
import { useNavigate } from "react-router-dom";

const LoadThreePointConfig = () => {
  const navigate = useNavigate();
  const [availableConfigs, setAvailableConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadingConfigs, setLoadingConfigs] = useState(true);

  useEffect(() => {
    loadAvailableConfigs();
  }, []);

  const loadAvailableConfigs = async () => {
    try {
      setLoadingConfigs(true);
      const configs = await window.api.read3PointConfigs();
      setAvailableConfigs([...configs].reverse());
    } catch (error) {
      console.error('Error loading configurations:', error);
    } finally {
      setLoadingConfigs(false);
    }
  };

  const handleConfigSelection = (config) => {
    setSelectedConfig(config);
    setShowDropdown(false);
  };

  const handleProcessMode = async () => {
    if (!selectedConfig) {
      alert('Please select a configuration first.');
      return;
    }

    try {
      // Call the 3-point config API with all required parameters
      const success = await window.api.send3PointConfig({
        testLength: selectedConfig.testLength,              // Maps to R4
        measurementInterval: selectedConfig.measurementInterval, // Maps to R5
        probeTravelLimit: selectedConfig.probeTravelLimit,  // Maps to R6
        forceLimit: selectedConfig.forceLimit,              // Maps to R7
        testSpeed: selectedConfig.testSpeed,                // Maps to R8
        supportSpan: selectedConfig.supportSpan,            // Maps to R9
        horizontalSpeed: selectedConfig.horizontalSpeed     // Maps to R10
      });

      if (!success) {
        alert("PLC configuration failed. Please try again.");
        return;
      }

      localStorage.setItem('selectedConfig', JSON.stringify({ ...selectedConfig, testType: '3-point' }));
      navigate('/process-mode');

    } catch (error) {
      console.error("PLC transfer failed:", error);
      alert("Failed to send configuration to PLC.");
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-6">
      <div className="w-full mx-auto">
        <div className="flex items-center justify-start mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Load 3-Point Configuration</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
              <div className="relative">
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="w-full bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-200 rounded-xl p-4 text-left flex items-center justify-between hover:from-blue-100 hover:to-blue-150 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  <div className="flex items-center space-x-3">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-blue-800">Select Configuration</span>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-blue-600 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto">
                    {loadingConfigs ? (
                      <div className="p-4 text-center text-slate-500">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent mx-auto mb-2"></div>
                        <p>Loading configurations...</p>
                      </div>
                    ) : availableConfigs.length === 0 ? (
                      <div className="p-4 text-center text-slate-500">
                        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>No configurations found</p>
                      </div>
                    ) : (
                      availableConfigs.map((config, index) => (
                        <button
                          key={index}
                          onClick={() => handleConfigSelection(config)}
                          className="w-full p-4 text-left hover:bg-slate-50 border-b border-slate-100 last:border-b-0 transition-colors duration-150 focus:outline-none focus:bg-blue-50"
                        >
                          <div>
                            <p className="font-medium text-slate-800">{config.configName}</p>
                            <p className="text-sm text-slate-500 mt-1">
                              {config.testLength}mm, {config.forceLimit}mN
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {selectedConfig && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center space-x-2 mb-2">
                    <FileText className="w-4 h-4 text-green-600" />
                    <span className="text-green-800 font-medium">Selected:</span>
                  </div>
                  <p className="text-green-700 text-sm font-medium">{selectedConfig.configName}</p>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Configuration Name</label>
                  <input
                    type="text"
                    value={selectedConfig ? selectedConfig.configName : ''}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Test Length (mm)</label>
                  <input
                    type="text"
                    value={selectedConfig ? selectedConfig.testLength : ''}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Measurement Interval (s)</label>
                  <input
                    type="text"
                    value={selectedConfig ? selectedConfig.measurementInterval : ''}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Probe Travel Limit (mm)</label>
                  <input
                    type="text"
                    value={selectedConfig ? selectedConfig.probeTravelLimit : ''}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Force Limit (mN)</label>
                  <input
                    type="text"
                    value={selectedConfig ? selectedConfig.forceLimit : ''}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Test Speed (mm/min)</label>
                  <input
                    type="text"
                    value={selectedConfig ? selectedConfig.testSpeed : ''}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Support Span (mm)</label>
                  <input
                    type="text"
                    value={selectedConfig ? selectedConfig.supportSpan : ''}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Horizontal Speed (mm/min)</label>
                  <input
                    type="text"
                    value={selectedConfig ? selectedConfig.horizontalSpeed : ''}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none"
                  />
                </div>

                <div className="pt-6 md:col-span-2">
                  <button
                    onClick={handleProcessMode}
                    disabled={!selectedConfig}
                    className="w-full md:w-auto md:ml-auto md:block bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-slate-400 disabled:to-slate-500 text-white font-semibold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl disabled:shadow-md transition-all duration-200 flex items-center justify-center space-x-2 min-w-[160px]"
                  >
                    <span>Process Mode</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadThreePointConfig;
