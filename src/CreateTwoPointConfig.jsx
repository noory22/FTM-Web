import React, { useState } from 'react';
import { ArrowLeft, Info, AlertCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CreateTwoPointConfig = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    configName: '',
    catheterToLoadCellDistance: '',
    probeTravelLimit: '',
    forceLimit: '',
    testSpeed: ''
  });

  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.configName.trim()) {
      newErrors.configName = 'Configuration name is required';
    } else if (!/^[A-Za-z0-9 ]+$/.test(formData.configName)) {
      newErrors.configName = 'Configuration name must contain only alphabets, numbers, and spaces';
    } else if (formData.configName.length > 30) {
      newErrors.configName = 'Configuration name cannot exceed 30 characters';
    }

    const numericFields = ['catheterToLoadCellDistance', 'probeTravelLimit', 'forceLimit', 'testSpeed'];
    numericFields.forEach(field => {
      if (!formData[field].toString().trim()) {
        newErrors[field] = 'This field is required';
      } else if (isNaN(formData[field]) || parseFloat(formData[field]) <= 0) {
        newErrors[field] = 'Please enter a valid positive number';
      }
    });

    // Distance sum validation
    const dist = parseFloat(formData.catheterToLoadCellDistance);
    const probe = parseFloat(formData.probeTravelLimit);
    if (!isNaN(dist) && dist > 55) {
      newErrors.catheterToLoadCellDistance = 'Value cannot exceed 55 mm';
    }
    if (!isNaN(dist) && dist > 0 && !isNaN(probe) && probe > 0) {
      const maxProbe = Math.max(0, 55 - dist);
      if (probe > maxProbe) {
        newErrors.probeTravelLimit = `Value cannot exceed ${maxProbe} mm (55 − ${dist})`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === 'configName') {
      if (!/^[a-zA-Z0-9 ]*$/.test(value) || value.length > 30) {
        return;
      }
    } else {
      if (value.startsWith('-') || value.startsWith('0') && !value.includes('.') || /[eE]/.test(value)) {
        if (value !== '0.') return;
      }
      if (!/^\d*\.?\d*$/.test(value)) {
        return;
      }
    }

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (successMessage) setSuccessMessage('');

    // Live cross-field distance validation
    const newDist = name === 'catheterToLoadCellDistance' ? value : formData.catheterToLoadCellDistance;
    const newProbe = name === 'probeTravelLimit' ? value : formData.probeTravelLimit;
    const d = parseFloat(newDist);
    const p = parseFloat(newProbe);

    setErrors(prev => {
      const next = { ...prev };

      // Validate load cell distance upper bound
      if (name === 'catheterToLoadCellDistance') {
        if (!isNaN(d) && d > 55) {
          next.catheterToLoadCellDistance = 'Value cannot exceed 55 mm';
        } else {
          delete next.catheterToLoadCellDistance;
        }
      } else if (name !== 'configName') {
        // Clear single-field error for other numeric fields as user corrects them
        if (next[name] && !next[name].includes('cannot exceed')) delete next[name];
      }

      // Validate probe travel limit against dynamic max
      if (!isNaN(d) && d > 0) {
        const maxProbe = Math.max(0, 55 - d);
        if (!isNaN(p) && p > 0) {
          if (p > maxProbe) {
            next.probeTravelLimit = `Value cannot exceed ${maxProbe} mm (55 − ${d})`;
          } else {
            // Only clear if the current error is the dynamic-range one
            if (next.probeTravelLimit?.includes('cannot exceed')) delete next.probeTravelLimit;
          }
        } else if (name === 'probeTravelLimit' && value === '') {
          delete next.probeTravelLimit;
        }
      } else if (name === 'catheterToLoadCellDistance' && (isNaN(d) || d <= 0)) {
        // Load cell cleared — clear any dynamic probe error
        if (next.probeTravelLimit?.includes('cannot exceed')) delete next.probeTravelLimit;
      }

      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      if (!window.api?.read2PointConfigs || !window.api?.write2PointConfigs) {
        throw new Error('2-point config API is not available. Restart the app so the updated preload is loaded.');
      }

      // Check for duplicate configuration names
      const existingConfigs = await window.api.read2PointConfigs();

      if (existingConfigs.some(config => config.configName === formData.configName)) {
        setErrors({ configName: 'Configuration Name already exists' });
        setIsLoading(false);
        return;
      }

      // Add new config and save
      const updatedConfigs = [...existingConfigs, formData];
      const success = await window.api.write2PointConfigs(updatedConfigs);

      if (success) {
        setSuccessMessage('Configuration has been saved successfully');
        setErrors({});
        setFormData({
          configName: '',
          catheterToLoadCellDistance: '',
          probeTravelLimit: '',
          forceLimit: '',
          testSpeed: ''
        });
      } else {
        setErrors({ submit: 'Error saving configuration. The CSV write returned false.' });
      }

    } catch (error) {
      console.error('Error saving configuration:', error);
      setErrors({ submit: error.message || 'Error saving configuration. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100 p-4 md:p-6">
      <div className="w-full mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Create 2-Point Configuration</h1>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowHelpModal(true)}
              className="group bg-linear-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl w-10 h-10 flex items-center justify-center transition-all duration-300 shadow-lg"
            >
              <Info className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
            </button>
          </div>
        </div>

        {successMessage && (
          <div className="mb-6 bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg shadow-sm">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-green-500 shrink-0" />
              <p className="text-green-800 font-semibold">{successMessage}</p>
            </div>
          </div>
        )}

        {errors.submit && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-red-800 font-semibold">{errors.submit}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Configuration Name</label>
                <input
                  type="text"
                  name="configName"
                  value={formData.configName}
                  onChange={handleInputChange}
                  placeholder="Enter configuration name"
                  className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.configName ? 'border-red-300' : 'border-slate-200'}`}
                />
                {errors.configName && <p className="text-red-500 text-sm flex items-center space-x-1"><AlertCircle className="w-4 h-4" /><span>{errors.configName}</span></p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Catheter To LoadCell Distance (mm)</label>
                  <input
                    type="text"
                    name="catheterToLoadCellDistance"
                    value={formData.catheterToLoadCellDistance}
                    onChange={handleInputChange}
                    placeholder="Enter Catheter To Load Cell Distance (0-55)"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.catheterToLoadCellDistance ? 'border-red-300' : 'border-slate-200'}`}
                  />
                  {errors.catheterToLoadCellDistance && <p className="text-red-500 text-sm flex items-center space-x-1"><AlertCircle className="w-4 h-4" /><span>{errors.catheterToLoadCellDistance}</span></p>}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Probe Travel Limit (mm)</label>
                  <input
                    type="text"
                    name="probeTravelLimit"
                    value={formData.probeTravelLimit}
                    onChange={handleInputChange}
                    placeholder={(() => { const d = parseFloat(formData.catheterToLoadCellDistance); return (!isNaN(d) && d > 0 && d <= 55) ? `Max: ${Math.max(0, 55 - d)} mm` : 'Enter Probe Travel Limit'; })()}
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.probeTravelLimit ? 'border-red-300' : 'border-slate-200'}`}
                  />
                  {!errors.probeTravelLimit && (() => { const d = parseFloat(formData.catheterToLoadCellDistance); return (!isNaN(d) && d > 0 && d <= 55) ? <p className="text-xs text-slate-400 mt-1">Allowed range: 0 – {Math.max(0, 55 - d)} mm</p> : null; })()}
                  {errors.probeTravelLimit && <p className="text-red-500 text-sm flex items-center space-x-1"><AlertCircle className="w-4 h-4" /><span>{errors.probeTravelLimit}</span></p>}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Force Limit (mN)</label>
                  <input
                    type="text"
                    name="forceLimit"
                    value={formData.forceLimit}
                    onChange={handleInputChange}
                    placeholder="Enter Force Limit (10-25000)"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.forceLimit ? 'border-red-300' : 'border-slate-200'}`}
                  />
                  {errors.forceLimit && <p className="text-red-500 text-sm flex items-center space-x-1"><AlertCircle className="w-4 h-4" /><span>{errors.forceLimit}</span></p>}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Test Speed (mm/s)</label>
                  <input
                    type="text"
                    name="testSpeed"
                    value={formData.testSpeed}
                    onChange={handleInputChange}
                    placeholder="Enter Test Speed"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.testSpeed ? 'border-red-300' : 'border-slate-200'}`}
                  />
                  {errors.testSpeed && <p className="text-red-500 text-sm flex items-center space-x-1"><AlertCircle className="w-4 h-4" /><span>{errors.testSpeed}</span></p>}
                </div>
              </div>

              <div className="pt-6 flex space-x-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="bg-linear-to-r from-blue-600 to-blue-700 text-white font-semibold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center min-w-35"
                >
                  {isLoading ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={handleBack}
                  className="min-w-35 py-4 px-8 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-all duration-200 flex items-center justify-center"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateTwoPointConfig;
