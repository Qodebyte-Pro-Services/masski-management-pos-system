const ctx = document.getElementById("salesChart").getContext("2d");

    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: [],
        datasets: [
          {
            label: "Store",
            data: [],
            backgroundColor: "rgba(75, 192, 192, 0.6)",
          },
          {
            label: "Gas",
            data: [],
            backgroundColor: "rgba(255, 99, 132, 0.6)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (value) {
                return value >= 1000 ? value.toLocaleString() : value;
              }
            }
          },
          x: {
            ticks: {
              autoSkip: false,
            },
          },
        },
        plugins: {
          legend: {
            position: "top",
          },
          title: {
            display: false,
            text: "Gas and Store Sales",
          },
        },
      },
    });

    function updateChart(filter) {
      let labels = [];
      let storeData = [];
      let gasData = [];

      if (filter === "Today") {
        labels = ["09:00", "10:00", "11:00", "12:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00"];
        storeData = [1000, 3000, 7000, 4000, 8000, 9000, 9000, 6000, 7000, 5000];
        gasData = [4000, 2000, 3000, 7000, 8500, 7000, 7000, 5000, 8000, 6500];
      } else if (filter === "7days") {
        labels = ["Sun","Mon", "Tue", "Wed", "Thu","Fri", "Sat"];
        storeData = [15000, 40000, 67000, 32000,2000,5000,54000];
        gasData = [20000, 28000, 26000, 31000,10000,35000,23000];
        
      } else if (filter === "Month") {
        labels = ["Week 1", "Week 2", "Week 3", "Week 4"];
        storeData = [25000, 30000, 27000, 32000];
        gasData = [20000, 28000, 26000, 31000];
        
      } 
      
      else if (filter === "Year") {
        labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        storeData = [120000, 135000, 110000, 145000, 130000, 150000, 125000, 140000, 138000, 145000, 142000, 148000];
        gasData = [100000, 128000, 115000, 140000, 120000, 155000, 118000, 138000, 136000, 144000, 143000, 149000];
      }

      chart.data.labels = labels;
      chart.data.datasets[0].data = storeData;
      chart.data.datasets[1].data = gasData;
      chart.update();
    }

    // Initial render
    updateChart("Today");

