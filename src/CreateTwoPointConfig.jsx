import React, { useState } from 'react';
import { ArrowLeft, Info, AlertCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CreateTwoPointConfig = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    configName: '',
    // testLength: '',
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

    const numericFields = ['probeTravelLimit', 'forceLimit', 'testSpeed'];
    numericFields.forEach(field => {
      if (!formData[field].toString().trim()) {
        newErrors[field] = 'This field is required';
      } else if (isNaN(formData[field]) || parseFloat(formData[field]) <= 0) {
        newErrors[field] = 'Please enter a valid positive number';
      }
    });

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

    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }

    if (successMessage) {
      setSuccessMessage('');
    }
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
          // testLength: '',
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
    navigate('/test-action/2-point');
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100 p-4 md:p-6">
      <div className="w-full mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-white hover:shadow-md rounded-lg transition-all duration-200"
            >
              <ArrowLeft className="w-6 h-6 text-slate-600" />
            </button>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Create 2-Point Configuration</h1>
          </div>
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
                {/* <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Test Length (mm)</label>
                  <input
                    type="text"
                    name="testLength"
                    value={formData.testLength}
                    onChange={handleInputChange}
                    placeholder="Enter Test Length"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.testLength ? 'border-red-300' : 'border-slate-200'}`}
                  />
                  {errors.testLength && <p className="text-red-500 text-sm flex items-center space-x-1"><AlertCircle className="w-4 h-4" /><span>{errors.testLength}</span></p>}
                </div> */}

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Probe Travel Limit (mm)</label>
                  <input
                    type="text"
                    name="probeTravelLimit"
                    value={formData.probeTravelLimit}
                    onChange={handleInputChange}
                    placeholder="Enter Probe Travel Limit"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.probeTravelLimit ? 'border-red-300' : 'border-slate-200'}`}
                  />
                  {errors.probeTravelLimit && <p className="text-red-500 text-sm flex items-center space-x-1"><AlertCircle className="w-4 h-4" /><span>{errors.probeTravelLimit}</span></p>}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Force Limit (mN)</label>
                  <input
                    type="text"
                    name="forceLimit"
                    value={formData.forceLimit}
                    onChange={handleInputChange}
                    placeholder="Enter Force Limit"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.forceLimit ? 'border-red-300' : 'border-slate-200'}`}
                  />
                  {errors.forceLimit && <p className="text-red-500 text-sm flex items-center space-x-1"><AlertCircle className="w-4 h-4" /><span>{errors.forceLimit}</span></p>}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Test Speed (mm/min)</label>
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
