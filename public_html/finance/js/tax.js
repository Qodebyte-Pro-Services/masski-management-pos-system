// Tax Chart Data
const taxData = {
  today: {
    distribution: [800, 1200, 900, 1000],
    collected: [900, 1100, 1300, 1200],
    labels: ["09:00", "10:00", "11:00", "12:00"]
  },
  yesterday: {
    distribution: [1000, 1000, 1100, 1300],
    collected: [1100, 1150, 1200, 1250],
    labels: ["09:00", "10:00", "11:00", "12:00"]
  },
  weekly: {
    distribution: [3200, 3500, 2800, 4000],
    collected: [3000, 3400, 3600, 4200, 4500, 4300, 4700],
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  },
  monthly: {
    distribution: [15000, 13000, 14000, 16000],
    collected: [12000, 18000, 32000, 45000],
    labels: ["Week 1", "Week 2", "Week 3", "Week 4"]
  },
  yearly: {
    distribution: [200000, 180000, 190000, 210000],
    collected: [300000, 450000, 500000, 600000, 800000, 950000, 1100000, 1200000, 1300000, 1400000, 1500000, 1600000],
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  }
};

// === Donut Chart for Tax Distribution ===
const donutCtx = document.getElementById("taxDonutChart").getContext("2d");
const taxDonutChart = new Chart(donutCtx, {
  type: "doughnut",
  data: {
    labels: ["Cooking Gas", "Accessories", "Oil", "Other Items"],
    datasets: [{
      data: taxData.monthly.distribution,
      backgroundColor: ["#f16565", "#3ed9a4", "#f6c23e", "#36b9cc"]
    }]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { position: "right" }
    }
  }
});

// === Line Chart for Tax Trend ===
const trendCtx = document.getElementById("taxTrendChart").getContext("2d");
const taxTrendChart = new Chart(trendCtx, {
  type: "line",
  data: {
    labels: taxData.monthly.labels,
    datasets: [
      {
        label: "Tax Collected",
        data: taxData.monthly.collected,
        borderColor: "rgba(75, 192, 192, 1)",
        backgroundColor: "rgba(75, 192, 192, 0.2)",
        fill: true,
        tension: 0.4
      }
    ]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { position: "top" }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => "₦" + value.toLocaleString()
        }
      }
    }
  }
});

// === Filter Logic to Switch Data ===
document.getElementById("expenseTimeFilter").addEventListener("change", function () {
  const period = this.value;
  const data = taxData[period];

  // Update donut chart
  taxDonutChart.data.datasets[0].data = data.distribution;
  taxDonutChart.update();

  // Update trend chart
  taxTrendChart.data.labels = data.labels;
  taxTrendChart.data.datasets[0].data = data.collected;
  taxTrendChart.update();
});
