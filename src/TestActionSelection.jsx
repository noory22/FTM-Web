import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

const TestActionSelection = () => {
  const navigate = useNavigate();
  const { testType } = useParams(); // will be '2-point' or '3-point'

  const handleBack = () => {
    navigate('/test-selection');
  };

  const handleCreate = () => {
    if (testType === '2-point') {
      navigate('/create-config/2-point');
    } else {
      navigate('/create-config/3-point');
    }
  };

  const handleLoad = () => {
    if (testType === '2-point') {
      navigate('/load-config/2-point');
    } else {
      navigate('/load-config/3-point');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      <div className="flex-1 flex items-center justify-center pt-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
          <button
            onClick={handleCreate}
            className="relative bg-white/70 backdrop-blur-sm border-2 rounded-3xl p-10 cursor-pointer transition-all duration-500 flex flex-col items-center justify-center text-center shadow-xl hover:shadow-2xl transform hover:-translate-y-2 border-gray-200/50 hover:border-orange-400/80 hover:bg-white/90 overflow-hidden"
          >
            <div className="absolute inset-0 bg-linear-to-r from-orange-500 to-amber-500 opacity-0 hover:opacity-10 transition-opacity duration-500"></div>
            <h2 className="text-4xl font-bold text-gray-800 mb-4 z-10">Create Configuration</h2>
            <p className="text-lg text-gray-600 z-10">Create a new {testType} configuration</p>
          </button>

          <button
            onClick={handleLoad}
            className="relative bg-white/70 backdrop-blur-sm border-2 rounded-3xl p-10 cursor-pointer transition-all duration-500 flex flex-col items-center justify-center text-center shadow-xl hover:shadow-2xl transform hover:-translate-y-2 border-gray-200/50 hover:border-blue-400/80 hover:bg-white/90 overflow-hidden"
          >
            <div className="absolute inset-0 bg-linear-to-r from-blue-500 to-cyan-500 opacity-0 hover:opacity-10 transition-opacity duration-500"></div>
            <h2 className="text-4xl font-bold text-gray-800 mb-4 z-10">Load Configuration</h2>
            <p className="text-lg text-gray-600 z-10">Load an existing {testType} configuration</p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TestActionSelection;
