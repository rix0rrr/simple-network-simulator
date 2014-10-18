'use strict';

//----------------------------------------------------------------------
//  EVENT
//
function Event(t, fn, obj, args) {
    this.t = t;
    this.fn = fn;
    this.obj = obj;
    this.args = args;
}

Event.compare = function(a, b) {
    if (a.t < b.t)
        return -1;
    if (b.t < a.t)
        return 1;
    return 0;
}

/**
 * Normally distributed random number
 */
function normalRandom(mu, sig) {
    var u, v, x, y, q;
    do {
        u = Math.random();
        v = 1.7156 * (Math.random()-0.5);
        x = u - 0.449871;
        y = Math.abs(v) + 0.386595;
        q = x*x+y*(0.19600*y-0.25472*x);
    } while(q>0.27597 && (q>0.27846 || v*v>-4*Math.log(u)*u*u));

    return mu+sig*v/u;
}

/**
 * Return true if a fraction chance is hit
 */
function chance(frac) {
    return Math.random() < frac;
}

function pick(opts) {
    return opts[_.random(0, opts.length-1)];
}

/**
 * Normal distribution
 */
function normal(mu, sig) {
    return function() { return normalRandom(mu, sig); };
}

/**
 * A custom version of _.assign so Chrome can optimize it better
 */
function options(given, defaults) {
    for (var key in given)
        if (given.hasOwnProperty(key))
            defaults[key] = given[key];
    return defaults;
}

function logsample(msg) {
    if (chance(0.01) && window.console) console.log(msg);
}

//----------------------------------------------------------------------
//  SIMULATION
//
function Simulation() {
    this.events = new Heap(Event.compare);
    this.stats = [];
    this.now = 0;
    this.end_time = null;
}

_.assign(Simulation.prototype, {
    schedule: function(d, fn, obj, args) {
        args = args || [];
        if (d < 1) d = 1; // Must advance time to prevent infinite loop
        var t = this.now + d;
        if (!this.end_time || t < this.end_time) {
            this.events.push(new Event(t, fn, obj, args));
        }
    },

    run: function(max_time) {
        var end_time = max_time ? this.now + max_time : null;
        this.end_time = end_time;

        var events = this.events;
        while (!events.empty()) {
            var first = events.pop();

            if (end_time && first.t >= end_time) {
                if (window.console) console.log('Stop due to time with', this.events.size(), 'events left');
                break;
            }

            this.now = first.t;

            first.fn.apply(first.obj, first.args);
        }
    },

    record: function(key, value) {
        this.stats.push([this.now, key, value]);
    },

    analyzer: function() {
        return new Analyzer(this.stats);
    }
});

//----------------------------------------------------------------------
//  STATISTICS
//
function Analyzer(stats) {
    this.stats = stats;
}

_.assign(Analyzer.prototype, {
    /**
     * Slice by time
     */
    slice: function(ms) {
        var ret = [];

        var N = this.stats.length;
        var i = 0;
        var t0 = 0;
        while (i  < N) {
            var j = i + 1;

            while (j < N && this.stats[j][0] < t0 + ms) j++;

            ret.push(new Timeslice(this.stats.slice(i, j), t0, ms));
            i = j;
            t0 += ms;
        }

        return ret;
    },

    /**
     * Slice by # of buckets
     */
    chunk: function(n) {
        var t_max = this.stats[this.stats.length - 1][0];
        return this.slice(Math.ceil((t_max + 1) / n));
    }
});

function Timeslice(stats, t0, ms) {
    this.stats = stats;
    this.t0 = t0;
    this.ms = ms;

    this.buckets = {};
    for (var i = 0; i < stats.length; i++) {
        var stat = stats[i];
        if (!(stat[1] in this.buckets)) this.buckets[stat[1]] = [];
        this.buckets[stat[1]].push(stat[2]);
    }
}

_.assign(Timeslice.prototype, {
    has: function(key) {
        return key in this.buckets;
    },

    /**
     * Return the sum of a given key
     */
    sum: function(key) {
        if (!(key in this.buckets)) return 0;

        var r = 0, lst = this.buckets[key];
        for (var i = 0; i < lst.length; i++) {
            r += lst[i];
        }
        return r;
    },

    /**
     * Return a percentile [0..100] for the values of a given key
     */
    p: function(p, key) {
        if (!(key in this.buckets)) return 0;

        this.buckets[key].sort();
        var N = this.buckets[key].length;
        var ix = Math.min(Math.ceil((p / 100.0) * N), N-1);
        return this.buckets[key][ix];
    },

    /**
     * Turn a number into a rate (X/s)
     */
    rate: function(num) {
        return num / (this.ms / 1000.0);
    },

    /**
     * Combine rate and sum because that's convenient
     */
    ratesum: function(key) {
        return this.rate(this.sum(key));
    }
});
