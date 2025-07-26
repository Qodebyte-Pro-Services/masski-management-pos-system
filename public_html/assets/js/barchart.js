async function populateProductSelect() {
    const select = document.getElementById('itemSelect');
    select.innerHTML = '<option>Loading...</option>';
    try {
        const res = await fetch('http://localhost:3000/product');
        const products = await res.json();
        select.innerHTML = '';
        products.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.product_id;
            opt.textContent = p.product_name;
            select.appendChild(opt);
        });
      
        if (products.length) {
            updateChart();
        }
    } catch {
        select.innerHTML = '<option>Error loading products</option>';
    }
}

const stockData = {
    gas: {
      today: {
        labels: ["09:00", "10:00", "11:00", "12:00", "1:00", "2:00", "3:00", "4:00", "5:00", "6:00"],
        data: [5, 7, 8, 6, 10, 12, 9, 8, 7, 6]
      },
      weekly: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        data: [50, 60, 40, 70, 80, 30, 20]
      },
      monthly: {
        labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
        data: [200, 180, 220, 210]
      },
      yearly: {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        data: [1000, 1100, 950, 1200, 1050, 980, 1000, 1100, 1020, 1080, 1150, 1200]
      }
    },
    accessory: {
      today: {
        labels: ["09:00", "10:00", "11:00", "12:00", "1:00", "2:00", "3:00", "4:00", "5:00", "6:00"],
        data: [2, 4, 5, 3, 6, 5, 4, 3, 2, 1]
      },
      weekly: {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        data: [20, 25, 15, 30, 28, 18, 10]
      },
      monthly: {
        labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
        data: [80, 70, 90, 85]
      },
      yearly: {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        data: [400, 420, 390, 450, 430, 410, 420, 440, 400, 420, 460, 480]
      }
    }
  };
  
const ctx = document.getElementById("stockChart").getContext("2d");
const chartConfig = {
    type: "bar",
    data: {
        labels: [],
        datasets: [{
            label: "Stock Level",
            data: [],
            backgroundColor: "green"
        }]
    },
    options: {
        responsive: true,
        scales: {
            y: {
                beginAtZero: true,
                title: { display: true, text: 'Stock' },
                 suggestedMin: -500, 
            }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: function(context) {
                       
                        const dataset = context.dataset;
                        const idx = context.dataIndex;
                     
                        const movementArr = dataset.movementArr || [];
                        const movement = movementArr[idx];
                        const stock = context.parsed.y;
                        if (movement !== undefined && movement !== null && movement !== 0) {
                            return `Stock: ${stock} (${movement > 0 ? '+' : ''}${movement})`;
                        }
                        return `Stock: ${stock}`;
                    }
                }
            }
        }
    }
};
const stockChart = new Chart(ctx, chartConfig);
  
async function updateChart() {
    const productId = document.getElementById("itemSelect").value;
    const timeFilter = document.getElementById("timeFilter").value;
    if (!productId) return;

    try {
        const res = await fetch(`http://localhost:3000/product_graph/${productId}`);
        const data = await res.json();

        if (data.variations && data.variations.length > 0) {
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);

            let labelSet = new Set();

            // Generate label set from both trajectory and movement times
            data.variations.forEach(variation => {
                const allPoints = [...(variation.trajectory || []), ...(variation.stock_movements || [])];

                allPoints.forEach(pt => {
                    const d = new Date(pt.time);
                    let label;

                    if (timeFilter === 'today' || timeFilter === 'yesterday') {
                        label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                    } else if (timeFilter === 'weekly') {
                        label = d.toLocaleDateString(undefined, { weekday: 'long' });
                    } else if (timeFilter === 'monthly') {
                        const day = d.getDate();
                        if (day <= 7) label = 'Week 1';
                        else if (day <= 14) label = 'Week 2';
                        else if (day <= 21) label = 'Week 3';
                        else label = 'Week 4';
                    } else if (timeFilter === 'yearly') {
                        label = d.toLocaleString(undefined, { month: 'short' });
                    } else {
                        label = d.toLocaleString();
                    }

                    labelSet.add(label);
                });
            });

            let labels = Array.from(labelSet);

            if (timeFilter === 'weekly') {
                const order = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                labels.sort((a, b) => order.indexOf(a) - order.indexOf(b));
            } else if (timeFilter === 'monthly') {
                const order = ["Week 1", "Week 2", "Week 3", "Week 4"];
                labels.sort((a, b) => order.indexOf(a) - order.indexOf(b));
            } else if (timeFilter === 'yearly') {
                const order = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                labels.sort((a, b) => order.indexOf(a) - order.indexOf(b));
            }

            let datasets = data.variations.map(variation => {
                let filteredTrajectory = variation.trajectory || [];
                let filteredMovements = variation.stock_movements || [];

                // Apply filter based on time
                const filterFn = pt => {
                    const d = new Date(pt.time);
                    if (timeFilter === 'today') return d.toDateString() === now.toDateString();
                    if (timeFilter === 'yesterday') return d.toDateString() === yesterday.toDateString();
                    if (timeFilter === 'weekly') return (now - d) / (1000 * 60 * 60 * 24) <= 7;
                    if (timeFilter === 'monthly') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                    if (timeFilter === 'yearly') return d.getFullYear() === now.getFullYear();
                    return true;
                };

                filteredTrajectory = filteredTrajectory.filter(filterFn);
                filteredMovements = filteredMovements.filter(filterFn);

                const timeToStock = {};
                filteredTrajectory.forEach(mv => {
                    const d = new Date(mv.time);
                    let key;
                    if (timeFilter === 'today' || timeFilter === 'yesterday') {
                        key = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                    } else if (timeFilter === 'weekly') {
                        key = d.toLocaleDateString(undefined, { weekday: 'long' });
                    } else if (timeFilter === 'monthly') {
                        const day = d.getDate();
                        if (day <= 7) key = 'Week 1';
                        else if (day <= 14) key = 'Week 2';
                        else if (day <= 21) key = 'Week 3';
                        else key = 'Week 4';
                    } else if (timeFilter === 'yearly') {
                        key = d.toLocaleString(undefined, { month: 'short' });
                    } else {
                        key = d.toLocaleString();
                    }

                    if (!timeToStock[key]) {
                        timeToStock[key] = { total: mv.stock, count: 1 };
                    } else {
                        timeToStock[key].total += mv.stock;
                        timeToStock[key].count++;
                    }
                });

                const timeToMovement = {};
                filteredMovements.forEach(mv => {
                    const d = new Date(mv.time);
                    let key;
                    if (timeFilter === 'today' || timeFilter === 'yesterday') {
                        key = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                    } else if (timeFilter === 'weekly') {
                        key = d.toLocaleDateString(undefined, { weekday: 'long' });
                    } else if (timeFilter === 'monthly') {
                        const day = d.getDate();
                        if (day <= 7) key = 'Week 1';
                        else if (day <= 14) key = 'Week 2';
                        else if (day <= 21) key = 'Week 3';
                        else key = 'Week 4';
                    } else if (timeFilter === 'yearly') {
                        key = d.toLocaleString(undefined, { month: 'short' });
                    } else {
                        key = d.toLocaleString();
                    }

                    if (!timeToMovement[key]) {
                        timeToMovement[key] = { total: mv.size, count: 1 };
                    } else {
                        timeToMovement[key].total += mv.size;
                        timeToMovement[key].count++;
                    }
                });

                const dataArr = labels.map(lab => {
                    const entry = timeToStock[lab];
                    return entry ? Math.round(entry.total / entry.count) : null;
                });

                const movementArr = labels.map(lab => {
                    const entry = timeToMovement[lab];
                    return entry ? Math.round(entry.total / entry.count) : null;
                });

                const customLabels = labels.map((lab, i) => {
                    const stock = dataArr[i];
                    const movement = movementArr[i];
                    if (movement !== null && movement !== 0) {
                        return `${stock} (${movement > 0 ? '+' : ''}${movement})`;
                    }
                    return `${stock}`;
                });

                return {
                    label: (variation.variation_label || variation.product_name || variation.variations_id) + ' (stock)',
                    data: dataArr,
                    movementArr: movementArr,
                    backgroundColor: getColorForVariation(variation.variations_id),
                    borderColor: movementArr.map(mv => mv < 0 ? '#e53935' : getColorForVariation(variation.variations_id)),
                    borderWidth: movementArr.map(mv => mv < 0 ? 3 : 1),
                    barPercentage: 0.8,
                    categoryPercentage: 0.8,
                    datalabels: {
                        anchor: 'end',
                        align: 'end',
                        formatter: function (value, context) {
                            return customLabels[context.dataIndex];
                        }
                    }
                };
            });

            if (labels.length === 0) {
                labels = ['No Data'];
                datasets = [{ label: 'No Data', data: [0], backgroundColor: 'gray' }];
            }

            stockChart.data.labels = labels;
            stockChart.data.datasets = datasets;
            stockChart.update();
            return;
        }

        stockChart.data.labels = ['No Data'];
        stockChart.data.datasets = [{ label: 'No Data', data: [0], backgroundColor: 'gray' }];
        stockChart.update();
    } catch (err) {
        stockChart.data.labels = ['Error'];
        stockChart.data.datasets = [{ label: 'Error', data: [0], backgroundColor: 'red' }];
        stockChart.update();
    }
}


function getColorForVariation(id) {
    const colors = ['#4caf50', '#2196f3', '#ff9800', '#e91e63', '#9c27b0', '#607d8b'];
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}
document.addEventListener('DOMContentLoaded', function() {
    populateProductSelect();
    document.getElementById('itemSelect').onchange = updateChart;
    document.getElementById('timeFilter').onchange = updateChart;
});
  