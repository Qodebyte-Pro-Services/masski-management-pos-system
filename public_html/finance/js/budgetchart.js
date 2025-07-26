const budgetData = {
  today: {
    allocation: [20000, 15000, 10000, 5000, 3000],
    actual: [20000],
    planned: [25000],
    labels: ["Now"],
  },
  weekly: {
    allocation: [50000, 30000, 20000, 15000, 10000],
    actual: [10000, 18000, 32000, 45000, 49000, 51000, 53000],
    planned: [12000, 20000, 35000, 46000, 50000, 55000, 56000],
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  },
  monthly: {
    allocation: [200000, 150000, 80000, 40000, 30000],
    actual: [100000, 180000, 320000, 450000],
    planned: [125000, 250000, 375000, 500000],
    labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
  },
  yearly: {
    allocation: [2400000, 1800000, 900000, 600000, 500000],
    actual: [300000, 450000, 500000, 600000, 800000, 950000, 1100000, 1200000, 1300000, 1400000, 1500000, 1600000],
    planned: [350000, 500000, 600000, 700000, 900000, 1050000, 1200000, 1300000, 1400000, 1500000, 1600000, 1700000],
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  }
};

// Donut Chart Setup
const donutCtx = document.getElementById("budgetDonutChart").getContext("2d");
const donutChart = new Chart(donutCtx, {
  type: "doughnut",
  data: {
    labels: ["Salaries", "Fuel Purchase", "Maintenance", "Logistics", "Others"],
    datasets: [{
      data: budgetData.monthly.allocation,
      backgroundColor: ["#4e73df", "#1cc88a", "#36b9cc", "#f6c23e", "#e74a3b"]
    }]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { position: "right" },
      
    }
  }
});

// Line Chart Setup
const trendCtx = document.getElementById("budgetTrendChart").getContext("2d");
const trendChart = new Chart(trendCtx, {
  type: "line",
  data: {
    labels: budgetData.monthly.labels,
    datasets: [
      {
        label: "Actual Spending",
        data: budgetData.monthly.actual,
        borderColor: "rgba(255, 99, 132, 1)",
        backgroundColor: "rgba(255, 99, 132, 0.2)",
        fill: true,
        tension: 0.4
      },
      {
        label: "Planned Budget",
        data: budgetData.monthly.planned,
        borderColor: "rgba(54, 162, 235, 1)",
        backgroundColor: "rgba(54, 162, 235, 0.2)",
        fill: true,
        tension: 0.4
      }
    ]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { position: "top" },
     
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

// Update charts on dropdown change
document.getElementById("expenseTimeFilter").addEventListener("change", function () {
  const period = this.value;
  const data = budgetData[period];

  // Update donut chart
  donutChart.data.datasets[0].data = data.allocation;
  donutChart.update();

  // Update line chart
  trendChart.data.labels = data.labels;
  trendChart.data.datasets[0].data = data.actual;
  trendChart.data.datasets[1].data = data.planned;
  trendChart.update();
});