import React, { useState } from 'react';
import { ArrowLeft, Info, AlertCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Helper to get integer factors of the test length that are <= 100
const getMeasurementIntervalFactors = (num) => {
  if (isNaN(num) || num <= 0) return [];
  const factors = [];
  const intNum = Math.floor(num);
  for (let i = 1; i <= Math.sqrt(intNum); i++) {
    if (intNum % i === 0) {
      if (i <= 50) factors.push(i);
      const pair = intNum / i;
      if (pair !== i && pair <= 50) {
        factors.push(pair);
      }
    }
  }
  return factors.sort((a, b) => a - b);
};

const CreateThreePointConfig = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    configName: '',
    testLength: '',
    measurementInterval: '',
    catheterDist: '',
    probeTravelLimit: '',
    forceLimit: '',
    testSpeed: '',
    horizontalSpeed: ''
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

    const numericFields = [
      'testLength', 'measurementInterval', 'catheterDist', 'probeTravelLimit',
      'forceLimit', 'testSpeed', 'horizontalSpeed'
    ];

    numericFields.forEach(field => {
      if (!formData[field].toString().trim()) {
        newErrors[field] = 'This field is required';
      } else if (isNaN(formData[field]) || parseFloat(formData[field]) <= 0) {
        newErrors[field] = 'Please enter a valid positive number';
      }
    });

    // Test Length and Measurement Interval validation
    const tl = parseFloat(formData.testLength);
    const mi = parseFloat(formData.measurementInterval);

    if (!isNaN(tl) && tl > 5000) {
      newErrors.testLength = 'Value cannot exceed 5000 mm';
    }

    if (!isNaN(tl) && tl > 0) {
      if (!isNaN(mi) && mi > 0) {
        if (mi > 50) {
          newErrors.measurementInterval = 'Value must be in the range (0 - 50) mm';
        } else {
          const ratio = tl / mi;
          const isPerfectDivisor = Math.abs(ratio - Math.round(ratio)) < 1e-9;
          if (!isPerfectDivisor) {
            const factors = getMeasurementIntervalFactors(tl);
            const factorMsg = factors.length > 0 ? `. Valid intervals: ${factors.join(', ')}` : '';
            newErrors.measurementInterval = `Measurement interval must perfectly divide the Test Length. Range: (0 - 50)${factorMsg}`;
          }
        }
      }
    } else if (!isNaN(mi) && mi > 0) {
      newErrors.measurementInterval = 'Please enter a valid Test Length first';
    }

    // Distance sum validation
    const dist = parseFloat(formData.catheterDist);
    const probe = parseFloat(formData.probeTravelLimit);
    if (!isNaN(dist) && dist > 55) {
      newErrors.catheterDist = 'Value cannot exceed 55 mm';
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
      // Allow only alphanumeric + spaces, max 30 chars
      if (!/^[a-zA-Z0-9 ]*$/.test(value) || value.length > 30) {
        return;
      }
    } else {
      // Numeric fields: only positive integers allowed (no decimals, no negatives, no special chars)
      if (!/^\d*$/.test(value)) {
        return;
      }
      // Block leading zeros (e.g. "05")
      if (value.length > 1 && value.startsWith('0')) {
        return;
      }
    }

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (successMessage) setSuccessMessage('');

    // Live cross-field distance values
    const newDist = name === 'catheterDist' ? value : formData.catheterDist;
    const newProbe = name === 'probeTravelLimit' ? value : formData.probeTravelLimit;
    const d = parseFloat(newDist);
    const p = parseFloat(newProbe);

    // Live test length and measurement interval values
    const newTestLength = name === 'testLength' ? value : formData.testLength;
    const newInterval = name === 'measurementInterval' ? value : formData.measurementInterval;
    const tl = parseFloat(newTestLength);
    const mi = parseFloat(newInterval);

    setErrors(prev => {
      const next = { ...prev };

      // ── Catheter Dist: 1–55 mm ────────────────────────────────────────────
      if (name === 'catheterDist') {
        if (value !== '' && !isNaN(d)) {
          if (d > 55) {
            next.catheterDist = 'Value cannot exceed 55 mm';
          } else {
            delete next.catheterDist;
          }
        } else {
          delete next.catheterDist;
        }
      }

      // ── Test Length: 1–5000 mm ────────────────────────────────────────────
      if (name === 'testLength') {
        if (value !== '' && !isNaN(tl)) {
          if (tl > 5000) {
            next.testLength = 'Value cannot exceed 5000 mm';
          } else {
            delete next.testLength;
          }
        } else {
          delete next.testLength;
        }
      }

      // ── Force Limit: 10–25000 mN ──────────────────────────────────────────
      if (name === 'forceLimit') {
        const v = parseFloat(value);
        if (value !== '' && !isNaN(v)) {
          if (v < 10) {
            next.forceLimit = 'Value must be at least 10 mN';
          } else if (v > 25000) {
            next.forceLimit = 'Value cannot exceed 25000 mN';
          } else {
            delete next.forceLimit;
          }
        } else {
          delete next.forceLimit;
        }
      }

      // ── Test Speed: 1–10 mm/s ─────────────────────────────────────────────
      if (name === 'testSpeed') {
        const v = parseFloat(value);
        if (value !== '' && !isNaN(v)) {
          if (v < 1) {
            next.testSpeed = 'Value must be at least 1 mm/s';
          } else if (v > 10) {
            next.testSpeed = 'Value cannot exceed 10 mm/s';
          } else {
            delete next.testSpeed;
          }
        } else {
          delete next.testSpeed;
        }
      }

      // ── Horizontal Speed: 1–10 mm/s ───────────────────────────────────────
      if (name === 'horizontalSpeed') {
        const v = parseFloat(value);
        if (value !== '' && !isNaN(v)) {
          if (v < 1) {
            next.horizontalSpeed = 'Value must be at least 1 mm/s';
          } else if (v > 10) {
            next.horizontalSpeed = 'Value cannot exceed 10 mm/s';
          } else {
            delete next.horizontalSpeed;
          }
        } else {
          delete next.horizontalSpeed;
        }
      }

      // ── Probe Travel Limit: dynamic max = 55 − catheterDist ───────────────
      if (!isNaN(d) && d > 0) {
        const maxProbe = Math.max(0, 55 - d);
        if (!isNaN(p) && p > 0) {
          if (p > maxProbe) {
            next.probeTravelLimit = `Value cannot exceed ${maxProbe} mm (55 − ${d})`;
          } else {
            if (next.probeTravelLimit?.includes('cannot exceed')) delete next.probeTravelLimit;
          }
        } else if (name === 'probeTravelLimit' && value === '') {
          delete next.probeTravelLimit;
        }
      } else if (name === 'catheterDist' && (isNaN(d) || d <= 0)) {
        if (next.probeTravelLimit?.includes('cannot exceed')) delete next.probeTravelLimit;
      }

      // ── Measurement Interval: 1–100 mm, must perfectly divide testLength ──
      if (!isNaN(tl) && tl > 0) {
        if (!isNaN(mi) && mi > 0) {
          if (mi > 100) {
            next.measurementInterval = 'Value must be in the range (0 - 100) mm';
          } else {
            const ratio = tl / mi;
            const isPerfectDivisor = Math.abs(ratio - Math.round(ratio)) < 1e-9;
            if (!isPerfectDivisor) {
              const factors = getMeasurementIntervalFactors(tl);
              const factorMsg = factors.length > 0 ? `. Valid intervals: ${factors.join(', ')}` : '';
              next.measurementInterval = `Measurement interval must perfectly divide the Test Length. Range: (0 - 100)${factorMsg}`;
            } else {
              if (next.measurementInterval?.includes('perfectly divide') || next.measurementInterval?.includes('Range: (0 -') || next.measurementInterval?.includes('valid Test Length')) {
                delete next.measurementInterval;
              }
            }
          }
        } else if (name === 'measurementInterval' && value === '') {
          delete next.measurementInterval;
        } else {
          if (next.measurementInterval?.includes('perfectly divide') || next.measurementInterval?.includes('Range: (0 -') || next.measurementInterval?.includes('valid Test Length')) {
            delete next.measurementInterval;
          }
        }
      } else if (!isNaN(mi) && mi > 0) {
        next.measurementInterval = 'Please enter a valid Test Length first';
      } else {
        if (next.measurementInterval?.includes('perfectly divide') || next.measurementInterval?.includes('Range: (0 -') || next.measurementInterval?.includes('valid Test Length')) {
          delete next.measurementInterval;
        }
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
      if (!window.api?.read3PointConfigs || !window.api?.write3PointConfigs) {
        throw new Error('3-point config API is not available. Restart the app so the updated preload is loaded.');
      }

      // Check for duplicate configuration names
      const existingConfigs = await window.api.read3PointConfigs();

      if (existingConfigs.some(config => config.configName === formData.configName)) {
        setErrors({ configName: 'Configuration Name already exists' });
        setIsLoading(false);
        return;
      }

      // Add new config and save
      const updatedConfigs = [...existingConfigs, formData];
      const success = await window.api.write3PointConfigs(updatedConfigs);

      if (success) {
        setSuccessMessage('Configuration has been saved successfully');
        setErrors({});
        setFormData({
          configName: '',
          testLength: '',
          measurementInterval: '',
          catheterDist: '',
          probeTravelLimit: '',
          forceLimit: '',
          testSpeed: '',
          horizontalSpeed: ''
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
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Create 3-Point Configuration</h1>
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Test Length (mm)</label>
                  <input
                    type="text"
                    name="testLength"
                    value={formData.testLength}
                    onChange={handleInputChange}
                    placeholder="Enter Test Length (0-5000)"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.testLength ? 'border-red-300' : 'border-slate-200'}`}
                  />
                  {errors.testLength && <p className="text-red-500 text-sm flex items-center space-x-1"><AlertCircle className="w-4 h-4" /><span>{errors.testLength}</span></p>}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Measurement Intervals (mm)</label>
                  <input
                    type="text"
                    name="measurementInterval"
                    value={formData.measurementInterval}
                    onChange={handleInputChange}
                    placeholder="Enter Measurement Intervals (0-50)"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.measurementInterval ? 'border-red-300' : 'border-slate-200'}`}
                  />
                  {errors.measurementInterval && <p className="text-red-500 text-sm flex items-center space-x-1"><AlertCircle className="w-4 h-4" /><span>{errors.measurementInterval}</span></p>}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Catheter to Load Cell Distance (mm)</label>
                  <input
                    type="text"
                    name="catheterDist"
                    value={formData.catheterDist}
                    onChange={handleInputChange}
                    placeholder="Enter Catheter to Load Cell Distance (0-55)"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.catheterDist ? 'border-red-300' : 'border-slate-200'}`}
                  />
                  {errors.catheterDist && <p className="text-red-500 text-sm flex items-center space-x-1"><AlertCircle className="w-4 h-4" /><span>{errors.catheterDist}</span></p>}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Probe Travel Limit (mm)</label>
                  <input
                    type="text"
                    name="probeTravelLimit"
                    value={formData.probeTravelLimit}
                    onChange={handleInputChange}
                    placeholder={(() => { const d = parseFloat(formData.catheterDist); return (!isNaN(d) && d > 0 && d <= 55) ? `Max: ${Math.max(0, 55 - d)} mm` : 'Enter Probe Travel Limit'; })()}
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.probeTravelLimit ? 'border-red-300' : 'border-slate-200'}`}
                  />
                  {!errors.probeTravelLimit && (() => { const d = parseFloat(formData.catheterDist); return (!isNaN(d) && d > 0 && d <= 55) ? <p className="text-xs text-slate-400 mt-1">Allowed range: 0 – {Math.max(0, 55 - d)} mm</p> : null; })()}
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
                  <label className="block text-sm font-semibold text-slate-700">Test Speed (mm/s)</label>
                  <input
                    type="text"
                    name="testSpeed"
                    value={formData.testSpeed}
                    onChange={handleInputChange}
                    placeholder="Enter Test Speed (1-10)"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.testSpeed ? 'border-red-300' : 'border-slate-200'}`}
                  />
                  {errors.testSpeed && <p className="text-red-500 text-sm flex items-center space-x-1"><AlertCircle className="w-4 h-4" /><span>{errors.testSpeed}</span></p>}
                </div>


                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Horizontal Speed (mm/s)</label>
                  <input
                    type="text"
                    name="horizontalSpeed"
                    value={formData.horizontalSpeed}
                    onChange={handleInputChange}
                    placeholder="Enter Horizontal Speed (1-10)"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.horizontalSpeed ? 'border-red-300' : 'border-slate-200'}`}
                  />
                  {errors.horizontalSpeed && <p className="text-red-500 text-sm flex items-center space-x-1"><AlertCircle className="w-4 h-4" /><span>{errors.horizontalSpeed}</span></p>}
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

export default CreateThreePointConfig;
