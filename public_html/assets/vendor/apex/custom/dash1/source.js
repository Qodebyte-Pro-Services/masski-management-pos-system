var options = {
	plotOptions: {
		pie: {
			customScale: 0.8,
			donut: {
				size: "50%",
			},
		},
	},
	chart: {
		width: 300,
		type: "donut",
	},
	labels: ["Direct", "Affiliate", "Email", "Other"],
	series: [40, 30, 20, 10],
	legend: { show: false },
	dataLabels: {
		enabled: false,
	},
	stroke: {
		width: 0,
	},

	colors: ["#1a73e8", "#e4052e", "#f6bc02", "#03835d"],
};
var chart = new ApexCharts(document.querySelector("#sourceMedium"), options);
chart.render();
