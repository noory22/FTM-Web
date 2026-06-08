
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Power, AlertCircle, ChevronDown, Trash2, Play, FileText, X, Info, Usb } from 'lucide-react';
import { useNavigate } from "react-router-dom";

const HandleConfig = ({ mode = 'load' }) => {
  const navigate = useNavigate();
  const [availableConfigs, setAvailableConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSerialError, setShowSerialError] = useState(mode === 'load');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [powerActive, setPowerActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(false);

  useEffect(() => {
    loadAvailableConfigs();

    // Initial status checks
    window.api.checkPowerStatus().then(status => setPowerActive(status.active));
    window.api.checkConnection().then(status => setConnectionStatus(status.connected));

    // Listen for status updates
    const handlePowerStatusChange = (event) => setPowerActive(event.detail === true);
    const handleModbusStatusChange = (event) => setConnectionStatus(event.detail === 'connected');

    window.addEventListener('power-status-change', handlePowerStatusChange);
    window.addEventListener('modbus-status-change', handleModbusStatusChange);

    return () => {
      window.removeEventListener('power-status-change', handlePowerStatusChange);
      window.removeEventListener('modbus-status-change', handleModbusStatusChange);
    };
  }, []);

  const loadAvailableConfigs = async () => {
    try {
      setLoadingConfigs(true);
      const configs = await window.api.readConfigFile();
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
      const success = await window.api.sendProcessMode({
        pathlength: selectedConfig.pathlength,
        thresholdForce: selectedConfig.thresholdForce,
        insertionLength: selectedConfig.insertionLength,
        retractionLength: selectedConfig.retractionLength
      });

      if (!success) {
        alert("PLC configuration failed. Please try again.");
        return;
      }

      // Store only after success
      localStorage.setItem('selectedConfig', JSON.stringify(selectedConfig));

      // Navigate only after verification
      navigate('/process-mode');

    } catch (error) {
      console.error("PLC transfer failed:", error);
      // alert("PLC communication error.");

    }
  };

  const handleDeleteConfig = async () => {
    if (!selectedConfig) {
      alert('Please select a configuration to delete.');
      return;
    }

    setIsLoading(true);

    try {
      const success = await window.api.deleteConfigFile(selectedConfig.configName);

      if (success) {
        // Close the delete confirmation modal
        setShowDeleteConfirm(false);

        // Show success message
        setShowDeleteSuccess(true);

        // Refresh the config list after a short delay
        setTimeout(async () => {
          await loadAvailableConfigs();

          // Reset selection and hide success message
          setSelectedConfig(null);
          setIsLoading(false);

          // Hide success message after 2 seconds
          setTimeout(() => {
            setShowDeleteSuccess(false);
          }, 2000);
        }, 500);

      } else {
        alert('Error deleting configuration. Please try again.');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error deleting configuration:', error);
      alert('Error deleting configuration. Please try again.');
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  const getPageTitle = () => {
    return mode === 'load' ? 'Load Configuration' : 'Delete Configuration';
  };

  const getButtonText = () => {
    return mode === 'load' ? 'Process Mode' : 'Delete Configuration';
  };

  const getButtonColor = () => {
    return mode === 'load'
      ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'
      : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800';
  };

  const getButtonIcon = () => {
    return mode === 'load' ? <Play className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />;
  };

  const getHelpContent = () => {
    if (mode === 'load') {
      return [
        'Select a configuration from the dropdown to load its settings.',
        'All configuration values will be populated automatically.',
        'Click "Process Mode" to continue with the selected configuration.',
        'Configuration is sent directly to PLC and navigation happens immediately.',

      ];
    } else {
      return [
        'Select a configuration to delete from your saved configurations.',
        'This action cannot be undone - deleted configurations are permanently removed.',
        'Confirmation will be required before deletion.'
      ];
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-6">
      <div className="w-full mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-white hover:shadow-md rounded-lg transition-all duration-200"
            >
              <ArrowLeft className="w-6 h-6 text-slate-600" />
            </button>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800">{getPageTitle()}</h1>
          </div>

          <div className="flex items-center space-x-2 lg:space-x-4">
            {/* Power Status Badge */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${powerActive ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
              <Power className="w-4 h-4" />
              <span className="text-sm font-medium">
                POWERED {powerActive ? 'ON' : 'OFF'}
              </span>
            </div>

            {/* USB Connection Status Badge */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${connectionStatus ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
              <Usb className="w-4 h-4" />
              <span className="text-sm font-medium">
                {connectionStatus ? 'USB Connected' : 'USB Disconnected'}
              </span>
            </div>

            {/* Help Button */}
            <button
              onClick={() => setShowHelpModal(true)}
              className="group bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl lg:rounded-2xl w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 flex items-center justify-center transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-xl border border-blue-400/30"
            >
              <Info className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 group-hover:scale-110 transition-transform duration-300" />
            </button>

            {/* Power Button */}
            <button
              onClick={() => {
                const confirmed = window.confirm("Are you sure you want to exit?");
                if (confirmed) {
                  window.close();
                }
              }}
              className="group bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl lg:rounded-2xl w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 flex items-center justify-center transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-xl border border-red-400/30"
            >
              <Power className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 group-hover:scale-110 transition-transform duration-300" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Configuration Selector */}
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

                {/* Dropdown */}
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
                              {config.pathlength}mm, {config.insertionLength}mm, {config.thresholdForce}mN
                              {config.retractionLength && `, ${config.retractionLength}mm (retraction)`}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Selected Configuration Info */}
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

          {/* Configuration Details */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 md:p-8">
              <div className="space-y-6">
                {/* Configuration Name */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Configuration Name
                  </label>
                  <input
                    type="text"
                    value={selectedConfig ? selectedConfig.configName : ''}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none"
                  />
                </div>

                {/* Path Length */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Path Length (mm)
                  </label>
                  <input
                    type="text"
                    value={selectedConfig ? selectedConfig.pathlength : ''}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none"
                  />
                </div>

                {/* Threshold Force */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Threshold Force (mN)
                  </label>
                  <input
                    type="text"
                    value={selectedConfig ? selectedConfig.thresholdForce : ''}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none"
                  />
                </div>
                {/* Retraction Stroke Length Field */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Insertion Stroke Length (mm)
                  </label>
                  <input
                    type="text"
                    value={selectedConfig ? selectedConfig.insertionLength : ''}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none"
                  />
                </div>

                {/* Retraction Stroke Length Field */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Retraction Stroke Length (mm)
                  </label>
                  <input
                    type="text"
                    value={selectedConfig ? selectedConfig.retractionLength : ''}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl bg-slate-50 text-slate-700 focus:outline-none"
                  />
                </div>

                {/* Action Button */}
                <div className="pt-6">
                  <button
                    onClick={mode === 'load' ? handleProcessMode : () => setShowDeleteConfirm(true)}
                    disabled={!selectedConfig}
                    className={`w-full md:w-auto md:ml-auto md:block ${getButtonColor()} disabled:from-slate-400 disabled:to-slate-500 text-white font-semibold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl disabled:shadow-md transition-all duration-200 transform hover:-translate-y-0.5 disabled:transform-none flex items-center justify-center space-x-2 min-w-[160px]`}
                  >
                    {/* {getButtonIcon()} */}
                    <span>{getButtonText()}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-3 bg-red-100 rounded-full">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800">Confirm Deletion</h3>
            </div>

            <p className="text-slate-600 mb-2">Are you sure you want to delete this configuration?</p>
            <p className="text-slate-800 font-medium mb-6">"{selectedConfig?.configName}"</p>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-3 border-2 border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfig}
                disabled={isLoading}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium rounded-xl transition-colors flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Success Modal */}
      {showDeleteSuccess && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-3 bg-green-100 rounded-full">
                <FileText className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800">Success</h3>
            </div>

            <p className="text-slate-600 mb-2">Configuration deleted successfully!</p>

            <div className="flex justify-center mt-6">
              <button
                onClick={() => setShowDeleteSuccess(false)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl lg:rounded-3xl shadow-2xl max-w-md lg:max-w-lg w-full max-h-[80vh] overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-blue-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Info className="w-5 h-5 lg:w-6 lg:h-6 text-blue-600" />
                  </div>
                  <h3 className="text-lg lg:text-xl font-bold text-blue-900">
                    {mode === 'load' ? 'Load Configuration Info' : 'Delete Configuration Warning'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowHelpModal(false)}
                  className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-blue-600" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-96">
              <div className="space-y-4">
                <div className="space-y-3">
                  {getHelpContent().map((item, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                      <p className="text-blue-800 text-sm lg:text-base">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default HandleConfig;
