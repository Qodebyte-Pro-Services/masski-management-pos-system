
	// Donut chart setup

    // Dropdown listener
    // document.getElementById("filterSelect").addEventListener("change", function () {
    //     updateChart(this.value);
    //   });
  
    //   const donutCtx = document.getElementById("donutChart").getContext("2d");
    //   let donutChart;
  
    //   function formatNaira(amount) {
    //     return Number(amount).toLocaleString("en-NG");
    //   }
  
    //   function updateDonutChart(filter) {
    //     let accessoriesTotal = 0;
    //     let gasTotal = 0;
    //     let revenueChange = "↑ 16%";
  
    //     if (filter === "Today") {
    //       accessoriesTotal = 20000000;
    //       gasTotal = 20000000;
    //       revenueChange = "↑ 16%";
    //     } else if (filter === "7days") {
    //       accessoriesTotal = 78000000;
    //       gasTotal = 62000000;
    //       revenueChange = "↑ 12%";
    //     }
    //     else if (filter === "Month") {
    //       accessoriesTotal = 78000000;
    //       gasTotal = 62000000;
    //       revenueChange = "↑ 12%";
    //     }
    //     else if (filter === "Year") {
    //       accessoriesTotal = 800000000;
    //       gasTotal = 950000000;
    //       revenueChange = "↑ 25%";
    //     }
  
    //     if (donutChart) donutChart.destroy();
  
    //     donutChart = new Chart(donutCtx, {
    //       type: "doughnut",
    //       data: {
    //         labels: ["Accessories", "Gas Sales"],
    //         datasets: [{
    //           data: [accessoriesTotal, gasTotal],
    //           backgroundColor: ["#3ed9a4", "#f16565"],
    //           borderWidth: 0
    //         }]
    //       },
    //       options: {
    //         cutout: "70%",
    //         plugins: {
    //           legend: { display: false }
    //         },
    //         responsive: true,
    //         maintainAspectRatio: false
    //       }
    //     });
  
    //     document.getElementById("storeAmount").textContent = formatNaira(accessoriesTotal);
    //     document.getElementById("gasAmount").textContent = formatNaira(gasTotal);
    //     document.getElementById("revenueAmount").textContent = formatNaira(accessoriesTotal + gasTotal);
    //     document.getElementById("revenueChange").textContent = revenueChange;
    //   }
  
    //   document.getElementById("filterSelect").addEventListener("change", function () {
    //     updateDonutChart(this.value);
    //   });
   
    //   // Initial render
    //   updateDonutChart("Today");
    
    
   document.addEventListener('DOMContentLoaded', function () {
    const donutCtx = document.getElementById("donutChart").getContext("2d");
    let donutChart;

    function formatNaira(amount) {
        return "₦" + Number(amount).toLocaleString("en-NG", {minimumFractionDigits: 2});
    }

    function getPeriodAndCustom(filter) {
        switch (filter) {
            case "Today": return { period: "day" };
            case "7days": return { period: "week" };
            case "Month": return { period: "month" };
            case "Year": return { period: "year" };
            default: return { period: "day" };
        }
    }

    async function fetchCategories() {
        const res = await fetch('http://localhost:3000/product_category');
        return await res.json();
    }

    async function fetchCategorySales(filter) {
        const { period } = getPeriodAndCustom(filter);
        let url = `http://localhost:3000/most_ordered_category?period=${encodeURIComponent(period)}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        return await res.json();
    }

    async function updateDonutChart(filter) {
        // Fetch all categories and sales data
        const [categories, salesData] = await Promise.all([
            fetchCategories(),
            fetchCategorySales(filter)
        ]);

        // Map category_id to sales quantity
        const salesMap = {};
        (Array.isArray(salesData) ? salesData : []).forEach(cat => {
            salesMap[cat.category_id] = Number(cat.total_quantity) || 0;
        });

        // Prepare chart data
        const labels = categories.map(cat => cat.category_name);
        const data = categories.map(cat => salesMap[cat.category_id] || 0);

        // Pick colors (expand as needed)
        const colors = [
            "#3ed9a4", "#f16565", "#f7b731", "#4b7bec", "#a55eea", "#fd9644", "#26de81", "#8854d0"
        ];
        const backgroundColors = labels.map((_, i) => colors[i % colors.length]);

        // Calculate total revenue
        const revenueAmount = data.reduce((a, b) => a + b, 0);

        // Update chart
        if (donutChart) donutChart.destroy();

        donutChart = new Chart(donutCtx, {
            type: "doughnut",
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: backgroundColors,
                    borderWidth: 0
                }]
            },
            options: {
                cutout: "70%",
                plugins: {
                    legend: { display: false }
                },
                responsive: true,
                maintainAspectRatio: false
            }
        });

        // Update legend and revenue
        document.getElementById("revenueAmount").textContent = formatNaira(revenueAmount);
        document.getElementById("revenueChange").textContent = revenueAmount > 0 ? "Top: " + (labels[data.indexOf(Math.max(...data))] || "N/A") : "No sales yet";

        // Update legend items
        const legendItems = document.querySelectorAll('.legend-item');
        legendItems.forEach((item, i) => {
            const label = labels[i] || '';
            const amount = data[i] || 0;
            item.querySelector('div.d-flex.align-items-center span').style.background = backgroundColors[i];
            item.querySelector('div.d-flex.align-items-center + div').textContent = formatNaira(amount);
            item.querySelector('div.d-flex.align-items-center').childNodes[1].textContent = label;
        });
    }

    document.getElementById("filterSelect").addEventListener("change", function () {
        updateDonutChart(this.value);
    });

    // Initial render
    updateDonutChart("Today");
});