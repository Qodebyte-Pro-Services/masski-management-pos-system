const profitCtx = document.getElementById("profitChart").getContext("2d");

const profitChart = new Chart(profitCtx, {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "Gross Profit",
        data: [],
        borderColor: "rgba(75, 192, 192, 1)",
        backgroundColor: "rgba(75, 192, 192, 0.2)",
        fill: true,
        tension: 0.4
      },
      {
        label: "Net Profit",
        data: [],
        borderColor: "rgba(255, 99, 132, 1)",
        backgroundColor: "rgba(255, 99, 132, 0.2)",
        fill: true,
        tension: 0.4
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function (value) {
            return value >= 1000 ? '₦' + value.toLocaleString() : value;
          }
        }
      },
      x: {
        ticks: {
          autoSkip: false
        }
      }
    },
    plugins: {
      legend: {
        position: "top"
      },
      title: {
        display: false,
        text: "Gross vs Net Profit"
      }
    }
  }
});

function updateProfitChart(filter) {
  let labels = [];
  let grossData = [];
  let netData = [];

  if (filter === "Today") {
    labels = ["09:00", "10:00", "11:00", "12:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00"];
    grossData = [10000, 15000, 12000, 18000, 16000, 19000, 17000, 20000, 22000, 21000];
    netData = [4000, 6000, 5000, 8000, 7000, 7500, 7200, 8000, 8200, 8500];
  } else if (filter === "7days") {
    labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    grossData = [120000, 135000, 98000, 130000, 145000, 138000, 159000];
    netData = [30000, 45000, 25000, 50000, 46000, 42000, 39000];
  } else if (filter === "Month") {
    labels = ["Week 1", "Week 2", "Week 3", "Week 4"];
    grossData = [350000, 390000, 420000, 400000];
    netData = [80000, 90000, 85000, 87000];
  } else if (filter === "Year") {
    labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    grossData = [950000, 980000, 890000, 1020000, 970000, 1100000, 1050000, 1080000, 1075000, 1110000, 1120000, 1130000];
    netData = [200000, 210000, 180000, 250000, 230000, 270000, 260000, 265000, 268000, 275000, 278000, 280000];
  }

  profitChart.data.labels = labels;
  profitChart.data.datasets[0].data = grossData;
  profitChart.data.datasets[1].data = netData;
  profitChart.update();
}

// Initial render
updateProfitChart("Today");

// 👇 Add this after the chart + update function
document.getElementById("filterSelectProfits").addEventListener("change", function () {
  const selected = this.value;
  updateProfitChart(selected);
});