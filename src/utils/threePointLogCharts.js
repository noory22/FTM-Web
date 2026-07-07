export const PEAK_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

export function computeThreePointBarSlots(config) {
  if (!config) return [];
  const testLength = parseFloat(config.testLength);
  const interval = parseFloat(config.measurementInterval);
  if (!Number.isFinite(testLength) || !Number.isFinite(interval) || interval <= 0) {
    return [];
  }
  const numSteps = Math.round(testLength / interval);
  if (numSteps <= 0) return [];

  return Array.from({ length: numSteps }, (_, i) => ({
    stepIndex: i,
    horizontalMm: (i + 1) * interval,
    maxForce: null,
    color: PEAK_COLORS[i % PEAK_COLORS.length],
  }));
}

function resolveStepIndex(catheterDistance, barSlots, interval) {
  if (!Number.isFinite(catheterDistance)) return -1;

  const tolerance = Math.max(interval * 0.3, 1);
  let idx = barSlots.findIndex(
    (slot) => Math.abs(slot.horizontalMm - catheterDistance) <= tolerance
  );
  if (idx >= 0) return idx;

  if (interval > 0) {
    idx = Math.round(catheterDistance / interval) - 1;
    return Math.max(0, Math.min(idx, barSlots.length - 1));
  }

  return -1;
}

export function buildThreePointChartsFromRows(rows, config) {
  const barSlots = computeThreePointBarSlots(config).map((slot) => ({ ...slot }));
  const peakSeries = [];

  if (!rows || rows.length === 0) {
    return { peakSeries, barSlots };
  }

  const interval = parseFloat(config?.measurementInterval) || 0;
  let currentStepIdx = -1;
  let currentPeak = [];
  let currentMaxForce = 0;
  let lastSteps = null;

  const sealCurrent = () => {
    if (currentStepIdx < 0) return;
    if (currentPeak.length === 0 && currentMaxForce <= 0) return;

    const color = PEAK_COLORS[currentStepIdx % PEAK_COLORS.length];
    if (currentPeak.length > 0) {
      peakSeries.push({
        label: `Step ${currentStepIdx + 1}`,
        color,
        data: [...currentPeak],
      });
    }

    if (barSlots[currentStepIdx]) {
      barSlots[currentStepIdx] = {
        ...barSlots[currentStepIdx],
        maxForce: parseFloat(currentMaxForce.toFixed(2)),
        color,
      };
    }
  };

  for (const row of rows) {
    const testDistance = parseFloat(row.testDistance);
    const force = parseFloat(row.force);
    const catheterDistance = parseFloat(row.catheterDistance);
    const steps = row.steps;

    const stepIdx = resolveStepIndex(catheterDistance, barSlots, interval);
    const stepsChanged = lastSteps !== null && steps !== null && steps !== lastSteps;
    const stepBoundary =
      stepIdx >= 0 &&
      currentStepIdx >= 0 &&
      stepIdx !== currentStepIdx;

    if (stepBoundary || (stepsChanged && currentStepIdx >= 0)) {
      sealCurrent();
      currentPeak = [];
      currentMaxForce = 0;
    }

    if (stepIdx >= 0) {
      currentStepIdx = stepIdx;
    }

    if (Number.isFinite(testDistance) && Number.isFinite(force)) {
      const point = { x: testDistance, y: force };
      const lastPoint = currentPeak[currentPeak.length - 1];
      if (!lastPoint || lastPoint.x !== point.x || lastPoint.y !== point.y) {
        currentPeak.push(point);
      }
      if (force > currentMaxForce) {
        currentMaxForce = force;
      }
    }

    lastSteps = steps;
  }

  sealCurrent();

  return { peakSeries, barSlots };
}

export function buildMultiPeakChartConfig(peakSeries) {
  return {
    datasets: peakSeries.map((peak) => ({
      label: peak.label,
      data: peak.data,
      borderColor: peak.color,
      backgroundColor: peak.color + "18",
      fill: false,
      tension: 0,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2,
    })),
  };
}

export function buildMultiPeakChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        display: true,
        position: "top",
        labels: {
          usePointStyle: true,
          pointStyle: "line",
          color: "#374151",
          font: { size: 10 },
          boxWidth: 24,
          padding: 8,
        },
      },
      tooltip: {
        backgroundColor: "rgba(15,23,42,0.85)",
        titleColor: "#f1f5f9",
        bodyColor: "#cbd5e1",
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        callbacks: {
          title: (ctx) => `Test Dist: ${ctx[0].parsed.x.toFixed(2)} mm`,
          label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} mN`,
        },
      },
    },
    scales: {
      x: {
        type: "linear",
        title: {
          display: true,
          text: "Test Distance (mm)",
          color: "#6b7280",
          font: { size: 11, weight: "bold" },
        },
        grid: { color: "rgba(229,231,235,0.5)" },
        ticks: {
          color: "#6b7280",
          font: { size: 10 },
          maxTicksLimit: 10,
          callback: (v) => `${v}mm`,
        },
      },
      y: {
        type: "linear",
        title: {
          display: true,
          text: "Force (mN)",
          color: "#6b7280",
          font: { size: 11, weight: "bold" },
        },
        grid: { color: "rgba(229,231,235,0.5)" },
        ticks: {
          color: "#6b7280",
          font: { size: 10 },
          maxTicksLimit: 8,
          callback: (v) => `${v}mN`,
        },
      },
    },
  };
}

export function buildBarChartConfig(barSlots) {
  const completedBars = barSlots.filter((slot) => slot.maxForce !== null);

  return {
    datasets: [
      {
        label: "Peak Force (mN)",
        data: completedBars.map((slot) => ({
          x: slot.horizontalMm,
          y: slot.maxForce,
        })),
        backgroundColor: completedBars.map((slot) => slot.color + "cc"),
        borderColor: completedBars.map((slot) => slot.color),
        borderWidth: 1.5,
        borderRadius: 5,
        borderSkipped: false,
        barPercentage: 0.85,
        categoryPercentage: 0.9,
      },
    ],
  };
}

export function buildBarChartOptions(testLengthMax) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    parsing: {
      xAxisKey: "x",
      yAxisKey: "y",
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(15,23,42,0.85)",
        titleColor: "#f1f5f9",
        bodyColor: "#cbd5e1",
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        callbacks: {
          title: (ctx) => `Horiz. Dist: ${ctx[0].parsed.x.toFixed(1)} mm`,
          label: (ctx) => `Peak Force: ${ctx.parsed.y.toFixed(2)} mN`,
        },
      },
    },
    scales: {
      x: {
        type: "linear",
        min: 0,
        max: testLengthMax,
        title: {
          display: true,
          text: "Horizontal Distance (mm)",
          color: "#6b7280",
          font: { size: 11, weight: "bold" },
        },
        grid: { color: "rgba(229,231,235,0.4)" },
        ticks: {
          color: "#6b7280",
          font: { size: 10 },
          maxTicksLimit: 12,
          callback: (v) => `${v}mm`,
        },
      },
      y: {
        title: {
          display: true,
          text: "Peak Force (mN)",
          color: "#6b7280",
          font: { size: 11, weight: "bold" },
        },
        grid: { color: "rgba(229,231,235,0.5)" },
        ticks: {
          color: "#6b7280",
          font: { size: 10 },
          callback: (v) => `${v}mN`,
        },
        beginAtZero: true,
      },
    },
  };
}
