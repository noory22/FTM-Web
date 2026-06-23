import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Database, FileCheck, Gauge, Layers, Loader2, Play } from 'lucide-react';

const emptyAnalytics = {
  standard: [],
  twoPoint: [],
  threePoint: [],
  loadedConfig: null,
};

const MainMenu = () => {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(emptyAnalytics);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState('2-point'); // '2-point' or '3-point'

  useEffect(() => {
    let mounted = true;

    const loadAnalytics = async () => {
      setIsLoading(true);
      setLoadError('');

      try {
        const [standard, twoPoint, threePoint] = await Promise.all([
          window.api?.readConfigFile?.() ?? [],
          window.api?.read2PointConfigs?.() ?? [],
          window.api?.read3PointConfigs?.() ?? [],
        ]);

        const storedLoadedConfig = localStorage.getItem('selectedConfig');
        const loadedConfig = storedLoadedConfig ? JSON.parse(storedLoadedConfig) : null;

        if (!mounted) return;
        setAnalytics({
          standard: Array.isArray(standard) ? standard : [],
          twoPoint: Array.isArray(twoPoint) ? twoPoint : [],
          threePoint: Array.isArray(threePoint) ? threePoint : [],
          loadedConfig,
        });
      } catch (error) {
        console.error('Dashboard analytics load error:', error);
        if (mounted) {
          setLoadError('Unable to load dashboard analytics.');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadAnalytics();

    return () => {
      mounted = false;
    };
  }, []);

  const totals = useMemo(() => {
    const totalCreated = analytics.standard.length + analytics.twoPoint.length + analytics.threePoint.length;

    return [
      {
        label: 'Loaded Configs',
        value: analytics.loadedConfig ? 1 : 0,
        detail: analytics.loadedConfig?.configName || 'No active loaded configuration',
        icon: FileCheck,
      },
      {
        label: 'Created Configs',
        value: totalCreated,
        detail: 'All saved standard and point-test configurations',
        icon: Database,
      },
      {
        label: 'Standard Configs',
        value: analytics.standard.length,
        detail: 'Main FTM process configurations',
        icon: Gauge,
      },
      {
        label: 'Point-Test Configs',
        value: analytics.twoPoint.length + analytics.threePoint.length,
        detail: `${analytics.twoPoint.length} two-point, ${analytics.threePoint.length} three-point`,
        icon: Layers,
      },
    ];
  }, [analytics]);

  // Handle 2-point test start
  const handle2PointStart = async (config) => {
    if (!config) {
      alert('Please select a configuration first.');
      return;
    }

    try {
      // Call the 2-point config API with all required parameters
      const success = await window.api.send2PointConfig({
        catheterToLoadCellDistance: config.catheterToLoadCellDistance, // Maps to R82
        probeTravelLimit: config.probeTravelLimit,  // Maps to R1
        forceLimit: config.forceLimit,              // Maps to R2
        testSpeed: config.testSpeed                 // Maps to R3
      });

      if (!success) {
        alert("PLC configuration failed. Please try again.");
        return;
      }

      localStorage.setItem('selectedConfig', JSON.stringify({ ...config, testType: '2-point' }));
      navigate('/process-mode/2-point');

    } catch (error) {
      console.error("PLC transfer failed:", error);
      alert("Failed to send configuration to PLC.");
    }
  };

  // Handle 3-point test start
  const handle3PointStart = async (config) => {
    if (!config) {
      alert('Please select a configuration first.');
      return;
    }

    try {
      // Call the 3-point config API with all required parameters
      const success = await window.api.send3PointConfig({
        testLength: config.testLength,              // Maps to R4
        measurementInterval: config.measurementInterval, // Maps to R5
        probeTravelLimit: config.probeTravelLimit,  // Maps to R6
        forceLimit: config.forceLimit,              // Maps to R7
        testSpeed: config.testSpeed,                // Maps to R8
        supportSpan: config.supportSpan,            // Maps to R9
        horizontalSpeed: config.horizontalSpeed     // Maps to R10
      });

      if (!success) {
        alert("PLC configuration failed. Please try again.");
        return;
      }

      localStorage.setItem('selectedConfig', JSON.stringify({ ...config, testType: '3-point' }));
      navigate('/process-mode/3-point');

    } catch (error) {
      console.error("PLC transfer failed:", error);
      alert("Failed to send configuration to PLC.");
    }
  };

  const renderConfigTable = (configs, type) => {
    if (!configs.length) {
      return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          No {type} configurations saved yet.
        </div>
      );
    }

    // Define columns based on type
    const getColumns = () => {
      if (type === '2-point') {
        return [
          { key: 'probeTravelLimit', label: 'Probe Limit' },
          { key: 'forceLimit', label: 'Force Limit' },
          { key: 'testSpeed', label: 'Test Speed' },
        ];
      } else {
        return [
          { key: 'testLength', label: 'Test Length' },
          { key: 'measurementInterval', label: 'Interval' },
          { key: 'forceLimit', label: 'Force Limit' },
          { key: 'supportSpan', label: 'Support Span' },
        ];
      }
    };

    const columns = getColumns();

    return (
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="max-h-80 overflow-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                {columns.map((field) => (
                  <th key={field.key} className="px-4 py-3 font-semibold">{field.label}</th>
                ))}
                <th className="px-4 py-3 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {configs.map((config, index) => (
                <tr key={`${config.configName || 'config'}-${index}`}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{config.configName || 'Untitled'}</td>
                  {columns.map((field) => (
                    <td key={field.key} className="px-4 py-3 text-slate-600">
                      {config[field.key] || '-'}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => {
                        if (type === '2-point') {
                          handle2PointStart(config);
                        } else {
                          handle3PointStart(config);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Start Test
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm font-semibold text-slate-600">Loading dashboard analytics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-blue-600">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Dashboard</h1>
              <p className="mt-2 w-full text-slate-600">
                Overview of test performed and configurations loaded. Select a configuration to start a new test or review existing analytics.
              </p>
            </div>
          </div>

          {loadError && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {loadError}
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {totals.map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-500">{item.label}</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{item.value}</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{item.detail}</p>
              </div>
            );
          })}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-4 border-b border-slate-200 pb-3">
            <h2 className="text-lg font-bold text-slate-900">Configuration Details</h2>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              <button
                onClick={() => setActiveTab('2-point')}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                  activeTab === '2-point'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                2-Point
              </button>
              <button
                onClick={() => setActiveTab('3-point')}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                  activeTab === '3-point'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                3-Point
              </button>
            </div>
          </div>

          {activeTab === '2-point' && (
            <>
              <div className="mb-3">
                <p className="text-sm text-slate-600">
                  Showing {analytics.twoPoint.length} two-point configuration(s)
                </p>
              </div>
              {renderConfigTable(analytics.twoPoint, '2-point')}
            </>
          )}

          {activeTab === '3-point' && (
            <>
              <div className="mb-3">
                <p className="text-sm text-slate-600">
                  Showing {analytics.threePoint.length} three-point configuration(s)
                </p>
              </div>
              {renderConfigTable(analytics.threePoint, '3-point')}
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default MainMenu;