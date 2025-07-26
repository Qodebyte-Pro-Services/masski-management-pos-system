var options = {
	series: [
		{
			name: "Sales",
			data: [100, 200],
		},
		{
			name: "Income",
			data: [200, 300],
		},
	],
	chart: {
		type: "bar",
		height: 145,
		toolbar: {
			show: false,
		},
	},
	plotOptions: {
		bar: {
			horizontal: false,
			columnWidth: "60%",
		},
	},
	legend: {
		show: false,
	},
	stroke: {
		width: 1,
		colors: ["rgba(255, 255, 255, 0)"],
	},
	xaxis: {
		categories: ["2022", "2023"],
		labels: {
			show: false,
		},
	},
	yaxis: {
		labels: {
			show: false,
		},
	},
	grid: {
		borderColor: "rgba(255, 255, 255, 0.7)",
		strokeDashArray: 5,
		xaxis: {
			lines: {
				show: true,
			},
		},
		yaxis: {
			lines: {
				show: false,
			},
		},
		padding: {
			top: 0,
			right: 10,
			left: 20,
			bottom: -20,
		},
	},
	tooltip: {
		y: {
			formatter: function (val) {
				return val + "k";
			},
		},
	},
	colors: [
		"rgba(255, 255, 255, 0.8)",
		"rgba(255, 255, 255, 0.6)",
		"rgba(255, 255, 255, 0.3)",
	],
	fill: {
		opacity: 1,
	},
};

var chart = new ApexCharts(document.querySelector("#sales"), options);
chart.render();
