import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, CheckCircle, Download, X, Loader2 } from 'lucide-react';

const UpdateChecker = () => {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isManual, setIsManual] = useState(false);

  useEffect(() => {
    // Listen for manual check trigger from MainMenu
    const handleManualTrigger = () => {
      console.log('Manual update check detected');
      setIsManual(true);
      // isVisible will be set to true by the 'Checking for updates...' status
    };
    window.addEventListener('manual-check-triggered', handleManualTrigger);

    if (window.api) {
      if (window.api.onUpdateStatus) {
        window.api.onUpdateStatus((updateStatus) => {
          console.log('Update Status Received:', updateStatus);
          setStatus(updateStatus);
          
          if (updateStatus === 'Checking for updates...') {
            setChecking(true);
            // Only show centered modal if it's manual. 
            // If auto, we stay invisible during "Checking"
            if (isManual) setIsVisible(true); 
          } else if (updateStatus === 'Update available' || updateStatus === 'downloaded' || updateStatus.startsWith('Error')) {
            setChecking(false);
            setIsVisible(true);
          } else if (updateStatus === 'latest') {
            setChecking(false);
            // If manual check says latest, show the "You're up to date" modal
            if (isManual) {
                setIsVisible(true);
            } else {
                setIsVisible(false); // Silent on auto-check startup
            }
          }
        });
      }
      
      if (window.api.onUpdateAvailable) {
        window.api.onUpdateAvailable((info) => {
          setUpdateInfo(info);
        });
      }

      if (window.api.onUpdateProgress) {
        window.api.onUpdateProgress((updateProgress) => {
          setProgress(updateProgress);
          setIsVisible(true);
        });
      }
    }

    return () => {
        window.removeEventListener('manual-check-triggered', handleManualTrigger);
    };
  }, [isManual]);

  const handleDownload = async () => {
    try {
      await window.api.downloadUpdate();
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  };

  const handleRestart = () => {
    window.api.quitAndInstall();
  };

  const closeUpdate = () => {
    setIsVisible(false);
    setIsManual(false); // Reset to auto mode for next time
    if (status === 'latest' || status.startsWith('Error')) {
        setStatus('');
    }
  };

  if (!isVisible) return null;

  // ==========================================
  // LAYOUT 1: MANUAL CHECK (Centered Modal)
  // ==========================================
  if (isManual) {
    return (
      <div className="fixed inset-0 z-10000 flex items-center justify-center p-4 sm:p-6">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={!checking && !progress ? closeUpdate : undefined} />
        
        <div className="relative bg-white rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 fade-in duration-300">
          {!checking && !progress && (
            <button onClick={closeUpdate} className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all z-10"><X size={20} /></button>
          )}

          <div className="p-8">
            <div className="flex flex-col items-center text-center mb-8">
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-5 transition-all duration-500 ${
                status === 'latest' ? 'bg-green-50 text-green-500' : status.startsWith('Error') ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-600'
              }`}>
                {status === 'Checking for updates...' ? <Loader2 size={40} className="animate-spin" /> : 
                 status === 'latest' ? <CheckCircle size={40} strokeWidth={2.5} /> : 
                 status.startsWith('Error') ? <AlertCircle size={40} strokeWidth={2.5} /> : <Download size={40} strokeWidth={2.5} />}
              </div>
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
                {status === 'Checking for updates...' ? 'Checking for Updates' : status === 'latest' ? "You're All Set!" : status === 'downloaded' ? 'Update Ready' : status.startsWith('Error') ? 'Update Failed' : 'New Update Available'}
              </h2>
              <p className="text-slate-500 text-sm font-medium">
                 {status === 'Checking for updates...' ? 'Searching for the latest version on GitHub...' : status === 'latest' ? 'The application is running the most recent version.' : status === 'downloaded' ? 'The new version is ready to be applied.' : status.startsWith('Error') ? 'There was an issue reaching the update server.' : `Version ${updateInfo?.version || ''} is now available.`}
              </p>
            </div>

            <div className="space-y-6">
              {status === 'Update available' && !progress && (
                <button onClick={handleDownload} className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-base font-bold transition-all shadow-xl shadow-blue-500/25 flex items-center justify-center space-x-3 active:scale-[0.98]"><Download size={20} strokeWidth={2.5} /><span>Download & Install Now</span></button>
              )}
              {status === 'downloaded' && (
                <button onClick={handleRestart} className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-base font-bold transition-all shadow-xl shadow-indigo-500/25 flex items-center justify-center space-x-3 active:scale-[0.98]"><RefreshCw size={20} strokeWidth={2.5} /><span>Restart to Apply Update</span></button>
              )}
              {progress && (
                <div className="space-y-4">
                  <div className="flex justify-between items-end"><span className="text-xs font-black text-slate-400 uppercase tracking-widest">Downloading Assets</span><span className="text-xl font-bold text-blue-600 leading-none">{Math.round(progress.percent)}%</span></div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all duration-300 rounded-full" style={{ width: `${progress.percent}%` }} /></div>
                </div>
              )}
              {status === 'latest' && (
                <button onClick={closeUpdate} className="w-full py-4 px-6 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl text-base font-bold transition-all shadow-xl shadow-slate-900/20 flex items-center justify-center active:scale-[0.98]"><span>Perfect, Thanks!</span></button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // LAYOUT 2: AUTO CHECK (Top Bar + Bottom Left Progress)
  // ==========================================
  return (
    <>
      {/* Top Slide-in Notification for Auto-Detect */}
      {(status === 'Update available' || status === 'downloaded') && !progress && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-10000 w-[90%] max-w-xl animate-in slide-in-from-top-12 duration-700 ease-out">
          <div className="bg-white/90 backdrop-blur-xl border border-blue-100 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-4 flex items-center justify-between gap-6">
            <div className="flex items-center gap-4 pl-2">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                {status === 'downloaded' ? <CheckCircle size={24} /> : <RefreshCw size={24} className="animate-spin-slow" />}
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">
                  {status === 'downloaded' ? 'Update Ready' : 'Software Update Available'}
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">
                  {status === 'downloaded' ? 'Application restart required to finish.' : `New version ${updateInfo?.version || ''} is ready to download.`}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={closeUpdate} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">Later</button>
              <button 
                onClick={status === 'downloaded' ? handleRestart : handleDownload}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-2xl shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center gap-2"
              >
                {status === 'downloaded' ? <RefreshCw size={14} /> : <Download size={14} />}
                <span>{status === 'downloaded' ? 'Restart' : 'Update Now'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Left Progress for Auto-Download */}
      {progress && (
        <div className="fixed bottom-6 right-6 z-10000 w-80 animate-in slide-in-from-right-12 duration-500">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex justify-between items-center">
               <div className="flex items-center gap-3">
                 <Loader2 size={18} className="animate-spin text-blue-600" />
                 <span className="text-xs font-bold text-slate-700">Updating CTTM...</span>
               </div>
               <span className="text-sm font-black text-blue-600">{Math.round(progress.percent)}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
               <div className="h-full bg-blue-600 transition-all duration-300 rounded-full" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UpdateChecker;
