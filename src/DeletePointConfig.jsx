import React, { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Loader2, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

const configMap = {
  '2-point': {
    title: 'Delete 2-Point Configuration',
    read: 'read2PointConfigs',
    write: 'write2PointConfigs',
    backPath: '/test-action/2-point',
    fields: [
      { key: 'probeTravelLimit', label: 'Probe Travel Limit' },
      { key: 'forceLimit', label: 'Force Limit' },
      { key: 'testSpeed', label: 'Test Speed' },
    ],
  },
  '3-point': {
    title: 'Delete 3-Point Configuration',
    read: 'read3PointConfigs',
    write: 'write3PointConfigs',
    backPath: '/test-action/3-point',
    fields: [
      { key: 'testLength', label: 'Test Length' },
      { key: 'catheterDist', label: 'Catheter to LC Dist.' },
      { key: 'forceLimit', label: 'Force Limit' },
      { key: 'horizontalSpeed', label: 'Horizontal Speed' },
    ],
  },
};

const DeletePointConfig = () => {
  const navigate = useNavigate();
  const { testType } = useParams();
  const configInfo = configMap[testType] || configMap['2-point'];
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingName, setDeletingName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadConfigs = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await window.api[configInfo.read]();
      setConfigs(Array.isArray(data) ? [...data].reverse() : []);
    } catch (loadError) {
      console.error('Error loading configurations:', loadError);
      setError('Unable to load configurations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, [testType]);

  const handleDelete = async (config) => {
    if (!window.confirm(`Delete "${config.configName}"?`)) return;

    setDeletingName(config.configName);
    setMessage('');
    setError('');

    try {
      const latestConfigs = await window.api[configInfo.read]();
      const updatedConfigs = latestConfigs.filter(
        (item) => item.configName !== config.configName,
      );
      const success = await window.api[configInfo.write](updatedConfigs);

      if (!success) {
        setError('Configuration could not be deleted. Please try again.');
        return;
      }

      const loadedConfig = localStorage.getItem('selectedConfig');
      if (loadedConfig) {
        const parsedLoadedConfig = JSON.parse(loadedConfig);
        if (parsedLoadedConfig?.configName === config.configName) {
          localStorage.removeItem('selectedConfig');
        }
      }

      setMessage(`${config.configName} deleted successfully.`);
      await loadConfigs();
    } catch (deleteError) {
      console.error('Error deleting configuration:', deleteError);
      setError('Configuration could not be deleted. Please try again.');
    } finally {
      setDeletingName('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-6">
      <div className="w-full mx-auto">
        <div className="flex items-center justify-start mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">{configInfo.title}</h1>
        </div>

        {message && (
          <div className="mb-6 rounded-r-lg border-l-4 border-green-500 bg-green-50 p-4 text-green-800 font-semibold shadow-sm">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-r-lg border-l-4 border-red-500 bg-red-50 p-4 text-red-800 font-semibold shadow-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-12 text-slate-600">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span className="font-semibold">Loading configurations...</span>
            </div>
          ) : configs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No configurations found</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    {configInfo.fields.map((field) => (
                      <th key={field.key} className="px-4 py-3 font-semibold">{field.label}</th>
                    ))}
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {configs.map((config, index) => (
                    <tr key={`${config.configName || 'config'}-${index}`}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{config.configName || 'Untitled'}</td>
                      {configInfo.fields.map((field) => (
                        <td key={field.key} className="px-4 py-3 text-slate-600">
                          {config[field.key] || '-'}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(config)}
                          disabled={deletingName === config.configName}
                          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="w-4 h-4" />
                          {deletingName === config.configName ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeletePointConfig;
