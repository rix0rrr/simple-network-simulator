'use strict';

function Distribution(mean, vari) {
    this.mean = ko.observable(mean);
    this.variance = ko.observable(vari);

    this.distr = function() {
        return normal(this.mean(), this.variance());
    };
}

function NetworkSettings() {
    this.latency = new Distribution(10, 2);
    this.P_drop = ko.observable(0.001);

    this.options = function() {
        return {
            latency: this.latency.distr(),
            P_drop: this.P_drop()
        }
    }
}

function Servers() {
    this.count = ko.observable(5);
    this.proc_time = new Distribution(50, 10);
    this.queue_bound = ko.observable(100);
    this.P_fail = ko.observable(0.01);
    this.quick_reject = ko.observable(true);

    this.options = function() {
        return {
            proc_time: this.proc_time.distr(),
            queue_bound: this.queue_bound(),
            P_fail: this.P_fail(),
            quick_reject: this.quick_reject()
        }
    }
}

var BACKOFFS = {
    'constant': constantBO,
    'constant-random': function() { return randomized(constantBO()) },
    'linear': linearBO,
    'linear-random': function() { return randomized(linearBO()) },
    'exponential': expoBO,
    'exponential-random': function() { return randomized(expoBO()) }
};

function Clients() {
    this.count = ko.observable(1000);
    this.backoff = ko.observable('constant');
    this.backoffOptions = ko.observable(_.keys(BACKOFFS));
    this.timeout = ko.observable(30000);
    this.retries = ko.observable(10);
    this.interval = new Distribution(1000, 100);

    this.options = function() {
        return {
            interval: this.interval.distr(),
            backoff: BACKOFFS[this.backoff()](),
            timeout: this.timeout(),
            retries: this.retries()
        }
    }
}

function timeseries(label, fn, args) {
    var key = args[args.length-1];
    return function(slices) {
        return {
            label: label,
            lines: { lineWidth: 1 },
            shadowSize: 0,
            data: _(slices).filter(function(slice) {
                return slice.has(key);
            }).map(function(slice) {
                return [slice.t0, slice[fn].apply(slice, args)];
            }).value()
        }
    }
}

function cumu(series_generator) {
    return function(slices) {
        var series = series_generator(slices);

        for (var i = 1; i < series.data.length; i++) {
            series.data[i][1] += series.data[i-1][1];
        }

        return series;
    }
}

function Results() {
    var self = this;

    var SERIES = {
        latencies:         timeseries('Latency (p99)', 'p', [99, 'latency']),
        success_latencies: timeseries('Success latency (p99)', 'p', [99, 'success_latency']),
        failure_latencies: timeseries('Failure (p99)', 'p', [99, 'failure_latency']),
        queue_size:        timeseries('Queue size (p50)', 'p', [50, 'queue_size']),
        tps:               timeseries('TPS', 'ratesum', ['request_sent']),
        successrate:       timeseries('Success/s', 'ratesum', ['request_succeeded']),
        failrate:          timeseries('Failures/s', 'ratesum', ['request_failed']),
        droprate:          timeseries('Dropped/s', 'ratesum', ['queue_full']),
        requestrate:       timeseries('Unique Requests/s', 'ratesum', ['start_request']),
        waitp50:           timeseries('Backoff (p50)', 'p', [50, 'wait']),
        waitp99:           timeseries('Backoff (p99)', 'p', [99, 'wait']),
        uniques:           cumu(timeseries('Unique requests', 'sum', ['start_request'])),
        served:            cumu(timeseries('Served requests', 'sum', ['request_succeeded']))
    };

    var allSeries = {};
    for (var key in SERIES) allSeries[key] = {};

    this.charts = ko.observable([
        { caption: 'Latencies vs. queue size',
          series: [['latencies', 'success_latencies', 'failure_latencies'], ['queue_size']] },
        { caption: 'Transactions per second',
          series: [['tps', 'successrate', 'failrate'], []] },
        { caption: 'Backoff times', 
          series: [['waitp50', 'waitp99'], []] },
        { caption: 'Request count', 
          series: [['uniques', 'served'], []] },
    ]);
    this.selectedChart = ko.observable(this.charts()[0]);

    var updateChart = function() {
        var seriesToPick = self.selectedChart().series;

        var chartSeries = [];
        _.each(seriesToPick[0], function(s) {
            if (!(s in allSeries)) return;
            allSeries[s].yaxis = 1;
            chartSeries.push(allSeries[s]);
        });
        _.each(seriesToPick[1], function(s) {
            if (!(s in allSeries)) return;
            allSeries[s].yaxis = 2;
            chartSeries.push(allSeries[s]);
        });
        showChart(chartSeries);
    }

    this.selectedChart.subscribe(function(x) {
        updateChart();
    });

    this.absorb = function(slices) {
        for (var key in SERIES) {
            allSeries[key] = SERIES[key](slices);
        }

        updateChart();
    }

    this.postUnpickle = function() {
        // Restore selected chart object
        var x = _.find(this.charts(), { caption: this.selectedChart().caption });
        if (x) this.selectedChart(x);
        else this.selectedChart(this.charts()[0]);
    }
}

function Simu() {
    this.network = new NetworkSettings();
    this.servers = new Servers();
    this.clients = new Clients();
    this.results = new Results();

    this.duration = ko.observable(10);

    this.buildSimulation = function(sim) {
        var network = new Network(sim, this.network.options());
        var servers = _.map(_.range(this.servers.count()), function() {
            return new Server(sim, network, this.servers.options());
        }.bind(this));
        var clients = _.map(_.range(this.clients.count()), function() {
            return new Client(sim, network, servers, this.clients.options());
        }.bind(this));
    }

    this.go = function() {
        var start = Date.now();

        var sim = new Simulation();
        this.buildSimulation(sim);
        sim.run(this.duration() * 60 * 1000);

        var delta = Date.now() - start;
        if (window.console) console.log('Simulation complete in', delta, 'ms');

        var slices = sim.analyzer().slice(2000);
        this.results.absorb(slices);
    }
}

function showChart(series) {
    $.plot($('#chart-area'), series, {
        yaxis: { min: 0 },
        y2axis: { position: 'right', min: 0 }
    });
}

var simu = new Simu();

if (window.location.hash.substr(1)) {
    loadState(simu, window.location.hash.substr(1));
}

ko.applyBindings(simu);
showChart([]);

subscribeAll(simu, function() { pushState(simu); });


var scrollGraph = function() {
    var t = $('#main-row').offset().top;
    $('#chartholder').css('padding-top', Math.max(0, $(window).scrollTop() - t - 10) + 30);
}
$(window).scroll(scrollGraph);
scrollGraph();
