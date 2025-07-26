const totalExpenseData = {
  today: {
    labels: ["09:00", "10:00", "11:00", "12:00", "1:00", "2:00", "3:00", "4:00", "5:00", "6:00"],
    data: [5000, 3000, 4500, 4000, 3800, 4200, 3900, 4100, 4300, 3700]
  },
  weekly: {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    data: [37000, 42000, 39000, 45000, 41000, 38000, 40000]
  },
  monthly: {
    labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
    data: [150000, 160000, 158000, 165000]
  },
  yearly: {
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    data: [610000, 590000, 620000, 640000, 630000, 650000, 660000, 670000, 680000, 690000, 700000, 710000]
  }
};

const expenseCtx = document.getElementById("expenseChart").getContext("2d");

const expenseChart = new Chart(expenseCtx, {
  type: "bar",
  data: {
    labels: totalExpenseData.today.labels,
    datasets: [{
      label: "Total Expenses (Today)",
      data: totalExpenseData.today.data,
      backgroundColor: "crimson"
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: "₦ Amount"
        },
        ticks: {
          callback: function (value) {
            return '₦' + value.toLocaleString();
          }
        }
      }
    },
    plugins: {
      legend: {
        position: "top"
      }
    }
  }
});

function updateExpenseChart() {
  const time = document.getElementById("expenseTimeFilter").value;
  const selected = totalExpenseData[time];

  expenseChart.data.labels = selected.labels;
  expenseChart.data.datasets[0].data = selected.data;
  expenseChart.data.datasets[0].label = `Total Expenses (${capitalize(time)})`;
  expenseChart.update();
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

document.getElementById("expenseTimeFilter").addEventListener("change", updateExpenseChart);

// Initial render
updateExpenseChart();
