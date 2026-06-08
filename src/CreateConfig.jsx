import React, { useState, useEffect } from 'react'; // ADDED: Import useEffect
import { ArrowLeft, Info, Power, AlertCircle, Download, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CreateConfig = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    configName: '',
    pathlength: '',
    thresholdForce: '',
    insertionLength: '',
    retractionLength: '',
    numberOfCurves: ''
  });

  // ADDED: State to store curve distances
  const [curveDistances, setCurveDistances] = useState({});

  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showSerialError, setShowSerialError] = useState(true);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // ADDED: Effect to initialize curve distances when numberOfCurves changes
  useEffect(() => {
    const numCurves = parseInt(formData.numberOfCurves);

    if (!isNaN(numCurves) && numCurves > 0 && numCurves <= 20) {
      const curveLetters = 'ABCDEFGHIJKLMNOPQRST';

      setCurveDistances(prev => {
        const updated = {};

        for (let i = 0; i < numCurves; i++) {
          const curveName = curveLetters[i];
          updated[curveName] = prev[curveName] ?? '';
        }

        return updated;
      });
    } else {
      setCurveDistances({});
    }
  }, [formData.numberOfCurves]);

  // ADDED: Handler for curve distance input changes
  const handleCurveDistanceChange = (curveName, value) => {
    // Validate: only allow digits (no decimal point)
    if (!/^\d*$/.test(value) || value.startsWith('-') || value.startsWith('0') || /[eE]/.test(value)) {
      return;
    }

    // Prevent values greater than path length
    const pathLength = parseInt(formData.pathlength);
    if (!isNaN(pathLength) && value && parseInt(value) > pathLength) {
      return; // Don't update if value exceeds path length
    }

    // Check for duplicates with other curve distances
    if (value) {
      const newValue = parseInt(value);
      const otherCurveDistances = { ...curveDistances };
      delete otherCurveDistances[curveName]; // Remove current curve for comparison

      const hasDuplicate = Object.values(otherCurveDistances).some(
        distance => distance && parseInt(distance) === newValue
      );

      if (hasDuplicate) {
        // You can optionally prevent setting duplicate values
        // return; // Uncomment to prevent duplicates in real-time
      }
    }

    setCurveDistances(prev => ({
      ...prev,
      [curveName]: value
    }));

    // Clear any existing curve distance errors for this field
    if (errors[`curveDistance_${curveName}`]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`curveDistance_${curveName}`];
        return newErrors;
      });
    }

    // Clear curve order error if it exists
    if (errors.curveOrder) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.curveOrder;
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};
    const pathLength = parseFloat(formData.pathlength);

    // Validate Configuration Name (alphabets only)
    if (!formData.configName.trim()) {
      newErrors.configName = 'Configuration name is required';
    } else if (!/^[A-Za-z0-9 ]+$/.test(formData.configName)) {
      newErrors.configName = 'Configuration name must contain only alphabets, numbers, and spaces';
    } else if (formData.configName.length > 30) {
      newErrors.configName = 'Configuration name cannot exceed 20 characters';
    }

    // Validate Path Length (numeric and range)
    if (!formData.pathlength.trim()) {
      newErrors.pathlength = 'Path Length is required';
    } else if (isNaN(formData.pathlength) || parseFloat(formData.pathlength) <= 0) {
      newErrors.pathlength = 'Please enter a valid positive number';
    } else if (parseFloat(formData.pathlength) < 30 || parseFloat(formData.pathlength) > 2000) {
      newErrors.pathlength = 'Path Length must be between 30mm and 2000mm';
    }

    // Validate Threshold Force (numeric and range)
    if (!formData.thresholdForce.trim()) {
      newErrors.thresholdForce = 'Threshold Force is required';
    } else if (isNaN(formData.thresholdForce) || parseFloat(formData.thresholdForce) <= 0) {
      newErrors.thresholdForce = 'Please enter a valid positive number';
    } else if (parseFloat(formData.thresholdForce) < 100 || parseFloat(formData.thresholdForce) > 10000) {
      newErrors.thresholdForce = 'Threshold Force must be between 100mN and 10000mN';
    }

    if (!formData.insertionLength.trim()) {
      newErrors.insertionLength = 'Insertion Stroke Length is required';
    } else if (isNaN(formData.insertionLength) || parseFloat(formData.insertionLength) <= 0) {
      newErrors.insertionLength = 'Please enter a valid positive number';
    } else if (parseFloat(formData.insertionLength) < 10 || parseFloat(formData.insertionLength) > 60) {
      newErrors.insertionLength = 'Insertion Stroke Length must be between 10mm and 60mm';
    }

    // Validate Retraction Stroke Length (numeric and range)
    if (!formData.retractionLength.trim()) {
      newErrors.retractionLength = 'Retraction Stroke Length is required';
    } else if (isNaN(formData.retractionLength) || parseFloat(formData.retractionLength) <= 0) {
      newErrors.retractionLength = 'Please enter a valid positive number';
    } else if (parseFloat(formData.retractionLength) < 10 || parseFloat(formData.retractionLength) > 60) {
      newErrors.retractionLength = 'Retraction Stroke Length must be between 10mm and 60mm';
    }

    // Validate Number of Curves (integer and range)
    if (!formData.numberOfCurves.trim()) {
      newErrors.numberOfCurves = 'Number of Curves is required';
    } else if (isNaN(formData.numberOfCurves) || parseInt(formData.numberOfCurves) <= 0) {
      newErrors.numberOfCurves = 'Please enter a valid positive integer';
    } else if (!Number.isInteger(parseFloat(formData.numberOfCurves))) {
      newErrors.numberOfCurves = 'Number of Curves must be a whole number';
    } else if (parseInt(formData.numberOfCurves) < 1 || parseInt(formData.numberOfCurves) > 20) {
      newErrors.numberOfCurves = 'Number of Curves must be between 1 and 20';
    }

    // ADDED: Validate curve distances for each curve
    const numCurves = parseInt(formData.numberOfCurves);
    if (!isNaN(numCurves) && numCurves > 0 && numCurves <= 20) {
      const curveLetters = 'ABCDEFGHIJKLMNOPQRST';
      const curveDistanceValues = [];

      for (let i = 0; i < numCurves; i++) {
        const curveName = curveLetters[i];
        const distance = curveDistances[curveName];

        if (!distance || distance.trim() === '') {
          newErrors[`curveDistance_${curveName}`] = `Distance for Curve ${curveName} is required`;
        } else if (isNaN(distance) || parseFloat(distance) <= 0) {
          newErrors[`curveDistance_${curveName}`] = `Please enter a valid positive number for Curve ${curveName}`;
        } else if (parseFloat(distance) < 0 || parseFloat(distance) > pathLength) {
          // Dynamic range based on path length
          newErrors[`curveDistance_${curveName}`] = `Curve ${curveName} distance must be between 0mm and ${pathLength}mm`;
        } else {
          //Check for duplicates
          const distanceValue = parseInt(distance);
          if (curveDistanceValues.includes(distanceValue)) {
            newErrors[`curveDistance_${curveName}`] = `Curve ${curveName} distance (${distanceValue}mm) is already used for another curve`;
          } else {
            curveDistanceValues.push(distanceValue);
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Validation based on field type
    if (name === 'configName') {
      // Allow alphabets, numbers, and spaces for config name
      if (!/^[a-zA-Z0-9 ]*$/.test(value) || value.length > 30) {
        return;
      }
    }

    if (name === 'pathlength' || name === 'thresholdForce' || name === 'insertionLength' || name === 'retractionLength' || name === 'numberOfCurves') {
      // Prevent negative numbers, leading zeros, and scientific notation (e, E)
      if (value.startsWith('-') || value.startsWith('0') || /[eE]/.test(value)) {
        return;
      }

      // Allow only numbers and single decimal point (for numberOfCurves, we'll handle integer-only separately)
      if (!/^\d*$/.test(value)) {
        return;
      }

      // Prevent multiple decimal points
      if ((value.match(/\./g) || []).length > 1) {
        return;
      }

      // For numberOfCurves field, ensure it's an integer (no decimal point)
      if (name === 'numberOfCurves' && value.includes('.')) {
        return;
      }
    }

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    let newError = '';
    if (value.trim() !== '') {
      const numVal = parseFloat(value);
      if (name === 'pathlength') {
        if (numVal < 30 || numVal > 2000) {
          newError = 'Path Length must be between 30mm and 2000mm';
        }
      } else if (name === 'thresholdForce') {
        if (numVal < 100 || numVal > 10000) {
          newError = 'Threshold Force must be between 100mN and 10000mN';
        }
      } else if (name === 'insertionLength') {
        if (numVal < 10 || numVal > 60) {
          newError = 'Insertion Stroke Length must be between 10mm and 60mm';
        }
      } else if (name === 'retractionLength') {
        if (numVal < 10 || numVal > 60) {
          newError = 'Retraction Stroke Length must be between 10mm and 60mm';
        }
      } else if (name === 'numberOfCurves') {
        const intVal = parseInt(value);
        if (intVal < 1 || intVal > 20) {
          newError = 'Number of Curves must be between 1 and 20';
        }
      }
    }

    setErrors(prev => {
      const updatedErrors = { ...prev };
      if (newError) {
        updatedErrors[name] = newError;
      } else {
        delete updatedErrors[name];
      }
      return updatedErrors;
    });

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
      // Prepare complete config data including curve distances
      const configData = {
        ...formData,
        curveDistances: { ...curveDistances }
      };

      // Check for duplicate configuration names
      const existingConfigs = await window.api.readConfigFile();

      if (existingConfigs.some(config => config.configName === formData.configName)) {
        setErrors({ configName: 'Configuration Name already exists' });
        setIsLoading(false);
        return;
      }

      // Add new config and save
      const updatedConfigs = [...existingConfigs, configData];
      const success = await window.api.writeConfigFile(updatedConfigs);

      if (success) {
        setSuccessMessage('Configuration has been saved successfully');
        setErrors({});

        // Reset form
        setFormData({
          configName: '',
          pathlength: '',
          thresholdForce: '',
          insertionLength: '',
          retractionLength: '',
          numberOfCurves: ''
        });

        // Clear curve distances
        setCurveDistances({});
      } else {
        setErrors({ submit: 'Error saving configuration. Please try again.' });
      }

    } catch (error) {
      console.error('Error saving configuration:', error);
      setErrors({ submit: 'Error saving configuration. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };
  const handleBack = () => {
    navigate('/main-menu');
  };

  // ADDED: Generate curve letters based on number of curves
  const generateCurveLetters = () => {
    const numCurves = parseInt(formData.numberOfCurves);
    if (isNaN(numCurves) || numCurves < 1 || numCurves > 20) {
      return [];
    }

    const curveLetters = 'ABCDEFGHIJKLMNOPQRST';
    return curveLetters.slice(0, numCurves).split('');
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100 p-4 md:p-6">
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
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800">Create Configuration</h1>
          </div>
          <div className="flex items-center space-x-2 lg:space-x-3">
            {/* Help Button */}
            <button
              onClick={() => setShowHelpModal(true)}
              className="group bg-linear-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl lg:rounded-2xl w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 flex items-center justify-center transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-xl border border-blue-400/30"
            >
              <Info className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 group-hover:scale-110 transition-transform duration-300" />
            </button>
            <button
              onClick={() => {
                const confirmed = window.confirm("Are you sure you want to exit?");
                if (confirmed) {
                  window.close();
                }
              }}
              className="group bg-linear-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl w-12 h-12 lg:w-14 lg:h-14 flex items-center justify-center transition-all duration-300 hover:-translate-y-1 shadow-xl hover:shadow-2xl border border-red-400/30"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="lg:w-7 lg:h-7 group-hover:scale-110 transition-transform duration-300">
                <path d="M12 2V12M18.36 6.64C19.78 8.05 20.55 9.92 20.55 12C20.55 16.14 17.19 19.5 13.05 19.5C8.91 19.5 5.55 16.14 5.55 12C5.55 9.92 6.32 8.05 7.74 6.64"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg shadow-sm">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-green-500 shrink-0" />
              <p className="text-green-800 font-semibold">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Submit Error */}
        {errors.submit && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-red-800 font-semibold">{errors.submit}</p>
            </div>
          </div>
        )}

        {/* Main Form Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Configuration Name */}
              <div className="space-y-2">
                <label htmlFor="configName" className="block text-sm font-semibold text-slate-700">
                  Configuration Name
                </label>
                <input
                  type="text"
                  id="configName"
                  name="configName"
                  value={formData.configName}
                  onChange={handleInputChange}
                  placeholder="Enter configuration name"
                  className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.configName
                    ? 'border-red-300 focus:border-red-500'
                    : 'border-slate-200 focus:border-blue-500'
                    }`}
                />
                {errors.configName && (
                  <p className="text-red-500 text-sm flex items-center space-x-1">
                    <AlertCircle className="w-4 h-4" />
                    <span>{errors.configName}</span>
                  </p>
                )}
              </div>

              {/* Path Length and Temperature Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Path Length */}
                <div className="space-y-2">
                  <label htmlFor="pathlength" className="block text-sm font-semibold text-slate-700">
                    Rig Path Length (mm)
                  </label>
                  <input
                    type="text"
                    id="pathlength"
                    name="pathlength"
                    value={formData.pathlength}
                    onChange={handleInputChange}
                    placeholder="Enter path length in range 30mm - 2000mm"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.pathlength
                      ? 'border-red-300 focus:border-red-500'
                      : 'border-slate-200 focus:border-blue-500'
                      }`}
                  />
                  {errors.pathlength && (
                    <p className="text-red-500 text-sm flex items-center space-x-1">
                      <AlertCircle className="w-4 h-4" />
                      <span>{errors.pathlength}</span>
                    </p>
                  )}
                </div>


                {/* Threshold Force */}
                <div className="space-y-2">
                  <label htmlFor="thresholdForce" className="block text-sm font-semibold text-slate-700">
                    Threshold Force (mN)
                  </label>
                  <input
                    type="text"
                    id="thresholdForce"
                    name="thresholdForce"
                    value={formData.thresholdForce}
                    onChange={handleInputChange}
                    placeholder="Enter Threshold Force in range 100mN - 10000mN"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.thresholdForce
                      ? 'border-red-300 focus:border-red-500'
                      : 'border-slate-200 focus:border-blue-500'
                      }`}
                  />
                  {errors.thresholdForce && (
                    <p className="text-red-500 text-sm flex items-center space-x-1">
                      <AlertCircle className="w-4 h-4" />
                      <span>{errors.thresholdForce}</span>
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label htmlFor="InsertionLength" className="block text-sm font-semibold text-slate-700">
                    Insertion Stroke Length (mm)
                  </label>
                  <input
                    type="text"
                    id="insertionLength"
                    name="insertionLength"
                    value={formData.insertionLength}
                    onChange={handleInputChange}
                    placeholder="Enter Insertion length in range 10mm - 60mm"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.insertionLength
                      ? 'border-red-300 focus:border-red-500'
                      : 'border-slate-200 focus:border-blue-500'
                      }`}
                  />
                  {errors.insertionLength && (
                    <p className="text-red-500 text-sm flex items-center space-x-1">
                      <AlertCircle className="w-4 h-4" />
                      <span>{errors.insertionLength}</span>
                    </p>
                  )}
                </div>

                {/* Retraction Stroke Length Field */}
                <div className="space-y-2">
                  <label htmlFor="retractionLength" className="block text-sm font-semibold text-slate-700">
                    Retraction Stroke Length (mm)
                  </label>
                  <input
                    type="text"
                    id="retractionLength"
                    name="retractionLength"
                    value={formData.retractionLength}
                    onChange={handleInputChange}
                    placeholder="Enter retraction length in range 10mm - 60mm"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.retractionLength
                      ? 'border-red-300 focus:border-red-500'
                      : 'border-slate-200 focus:border-blue-500'
                      }`}
                  />
                  {errors.retractionLength && (
                    <p className="text-red-500 text-sm flex items-center space-x-1">
                      <AlertCircle className="w-4 h-4" />
                      <span>{errors.retractionLength}</span>
                    </p>
                  )}
                </div>

                {/* Number of Curves Field */}
                <div className="space-y-2">
                  <label htmlFor="numberOfCurves" className="block text-sm font-semibold text-slate-700">
                    Number of Curves (Total)
                  </label>
                  <input
                    type="text"
                    id="numberOfCurves"
                    name="numberOfCurves"
                    value={formData.numberOfCurves}
                    onChange={handleInputChange}
                    placeholder="Enter number of curves (1-20)"
                    className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400 ${errors.numberOfCurves
                      ? 'border-red-300 focus:border-red-500'
                      : 'border-slate-200 focus:border-blue-500'
                      }`}
                  />
                  {errors.numberOfCurves && (
                    <p className="text-red-500 text-sm flex items-center space-x-1">
                      <AlertCircle className="w-4 h-4" />
                      <span>{errors.numberOfCurves}</span>
                    </p>
                  )}
                  {/* <p className="text-slate-500 text-xs mt-1">
                    Example: 3 curves means measurements at Curve A, B, C and D positions
                  </p> */}
                </div>
              </div>

              {/* ADDED: Dynamic Curve Distance Inputs Section */}
              {formData.numberOfCurves && parseInt(formData.numberOfCurves) > 0 && (
                <div className="space-y-4 pt-4 border-t border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-800">Curve Distances (mm)</h3>
                  <p className="text-slate-600 text-sm">
                    Enter distance in mm for each curve position:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {generateCurveLetters().map(curveName => (
                      <div key={curveName} className="space-y-2">
                        <label htmlFor={`curveDistance_${curveName}`} className="block text-sm font-semibold text-slate-700">
                          Curve {curveName} Distance (mm)
                        </label>
                        <input
                          type="text"
                          id={`curveDistance_${curveName}`}
                          name={`curveDistance_${curveName}`}
                          value={curveDistances[curveName] || ''}
                          onChange={(e) => handleCurveDistanceChange(curveName, e.target.value)}
                          placeholder={`Enter distance (1-${formData.pathlength || 'path length'})`}
                          className={`w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-100 placeholder:text-slate-400  ${errors[`curveDistance_${curveName}`]
                            ? 'border-red-300 focus:border-red-500'
                            : 'border-slate-200 focus:border-blue-500'
                            }`}
                        />
                        {errors[`curveDistance_${curveName}`] && (
                          <p className="text-red-500 text-sm flex items-center space-x-1">
                            <AlertCircle className="w-4 h-4" />
                            <span>{errors[`curveDistance_${curveName}`]}</span>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-6 flex space-x-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-blue-400 disabled:to-blue-500 text-white font-semibold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl disabled:shadow-md transition-all duration-200 transform hover:-translate-y-0.5 disabled:transform-none flex items-center justify-center min-w-35"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      {/* <Download className="w-5 h-5" /> */}
                      <span>Create</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleBack}
                  className="min-w-35 py-4 px-8 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 flex items-center justify-center"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>

        {showHelpModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl lg:rounded-3xl shadow-2xl max-w-md lg:max-w-lg w-full max-h-[80vh] overflow-hidden">
              <div className="bg-linear-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-blue-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Info className="w-5 h-5 lg:w-6 lg:h-6 text-blue-600" />
                    </div>
                    <h3 className="text-lg lg:text-xl font-bold text-blue-900">Configuration Guidelines</h3>
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
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                      <p className="text-blue-800 text-sm lg:text-base">
                        <span className="font-semibold">Configuration Name</span> must contain only alphabets, numbers, and spaces (no special characters)
                      </p>
                    </div>

                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                      <p className="text-blue-800 text-sm lg:text-base">
                        The values of Path Length, Threshold Force,Insertion Stroke Length, Retraction Stroke Length, and Number of Curves required and must be positive numbers
                      </p>
                    </div>

                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                      <p className="text-blue-800 text-sm lg:text-base">
                        <span className="font-semibold">Rig Path Length</span> should be in range <span className="font-semibold">30 - 2000 mm</span>
                      </p>
                    </div>

                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                      <p className="text-blue-800 text-sm lg:text-base">
                        <span className="font-semibold">Threshold Force </span> should be in range  <span className="font-semibold"> 100mN - 10000mN </span>
                      </p>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                      <p className="text-blue-800 text-sm lg:text-base">
                        <span className="font-semibold">Insertion Stroke Length</span> should be in range <span className="font-semibold">10mm - 60mm</span>
                      </p>
                    </div>

                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                      <p className="text-blue-800 text-sm lg:text-base">
                        <span className="font-semibold">Retraction Stroke Length</span> should be in range <span className="font-semibold">10mm - 60mm</span>
                      </p>
                    </div>

                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                      <p className="text-blue-800 text-sm lg:text-base">
                        <span className="font-semibold">Number of Curves</span> should be in range <span className="font-semibold">1 - 20</span> (natural numbers only)
                      </p>
                    </div>

                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                      <p className="text-blue-800 text-sm lg:text-base">
                        <span className="font-semibold">Curve Distances</span> must be between <span className="font-semibold">1mm and the Rig Path Length</span> (e.g., if Path Length is 500mm, curves must be 1-500mm)
                      </p>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                      <p className="text-blue-800 text-sm lg:text-base">
                        <span className="font-semibold">Curve Distances</span> must be unique values between <span className="font-semibold">1mm and the Rig Path Length</span> (no duplicate values allowed)
                      </p>
                    </div>

                    <div className="flex items-start space-x-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 shrink-0"></div>
                      <p className="text-blue-800 text-sm lg:text-base">
                        Configuration will be saved to CTTM.json
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateConfig;