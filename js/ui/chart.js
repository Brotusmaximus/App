let chartInstance = null;

export function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

export function renderChart(canvasId, historyData) {
  destroyChart();

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (!historyData || historyData.length === 0) {
    const container = canvas.parentElement;
    container.innerHTML = `<div class="chart-no-data">
      <p>Historie wird ab jetzt aufgebaut.</p>
    </div>`;
    return;
  }

  const labels = historyData.map(p => p.t);
  const data   = historyData.map(p => p.preis);
  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const padding = (maxVal - minVal) * 0.1 || 1;

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Preis',
        data,
        borderColor: '#E0A82E',
        backgroundColor: 'rgba(224,168,46,0.08)',
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: '#E0A82E',
        pointBorderColor: '#E0A82E',
        fill: false,
        tension: 0.3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 300 },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#181B21',
          titleColor: '#6B7080',
          bodyColor: '#E8E6E1',
          borderColor: '#23262E',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label(ctx) {
              const val = ctx.parsed.y;
              return ' ' + val.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: '#23262E',
            drawBorder: false,
          },
          ticks: {
            color: '#6B7080',
            font: { size: 11, family: "'Courier New', monospace" },
            maxRotation: 0,
            maxTicksLimit: 8,
          },
          border: { color: '#23262E' },
        },
        y: {
          min: minVal - padding,
          max: maxVal + padding,
          grid: {
            color: '#23262E',
            drawBorder: false,
          },
          ticks: {
            color: '#6B7080',
            font: { size: 11, family: "'Courier New', monospace" },
            callback(val) {
              return val.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
            }
          },
          border: { color: '#23262E' },
        }
      }
    }
  });
}
