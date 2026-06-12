import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TestSelection = () => {
  const navigate = useNavigate();
  const [isHovering, setIsHovering] = useState(null);

  const testOptions = [
    {
      id: '2-point',
      title: '2-Point Test',
      description: 'Run tests using the 2-point configuration protocol',
      gradient: 'from-blue-500 to-indigo-500'
    },
    {
      id: '3-point',
      title: '3-Point Test',
      description: 'Run tests using the 3-point configuration protocol',
      gradient: 'from-purple-500 to-pink-500'
    }
  ];

  const handleBack = () => {
    navigate('/main-menu');
  };

  const handleOptionClick = (option) => {
    if (option.id === '2-point') {
      navigate('/test-action/2-point');
    } else if (option.id === '3-point') {
      navigate('/test-action/3-point');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      <div className="flex-1 flex items-center justify-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
          {testOptions.map((option, index) => (
            <button
              key={option.id}
              onClick={() => handleOptionClick(option)}
              onMouseEnter={() => setIsHovering(option.id)}
              onMouseLeave={() => setIsHovering(null)}
              className={`relative bg-white/70 backdrop-blur-sm border-2 rounded-3xl p-10 cursor-pointer transition-all duration-500 flex flex-col items-center justify-center text-center shadow-xl hover:shadow-2xl transform hover:-translate-y-2 border-gray-200/50 hover:border-blue-400/80 hover:bg-white/90 overflow-hidden`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className={`absolute inset-0 bg-linear-to-r ${option.gradient} opacity-0 hover:opacity-10 transition-opacity duration-500`}></div>
              
              <h2 className="text-4xl font-bold text-gray-800 mb-4 z-10">{option.title}</h2>
              <p className="text-lg text-gray-600 z-10">{option.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TestSelection;
