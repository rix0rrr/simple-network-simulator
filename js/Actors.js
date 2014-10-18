'use strict';
/**
 * Actors for the simulation
 */

//----------------------------------------------------------------------

/**
 * Network (transport layer)
 */
function Network(sim, opts) {
    this.sim = sim;
    this.opts = options(opts, {
        latency: normal(10, 2),
        P_drop: 0.0
    });
}

_.assign(Network.prototype, {
    /**
     * Transport a packet.
     *
     * Or, after the network latency (or maybe not at all),
     * invoke the given function.
     */
    send: function(fn, obj, args) {
        if (chance(this.opts.P_drop)) return; // Buh-bye
        this.sim.schedule(this.opts.latency(), fn, obj, args);
    }
});

//----------------------------------------------------------------------

/**
 * Server
 *
 * Handles requests on a first-come, first-serve basis, taking some specified
 * processing time (on the order of 10s-100s of milliseconds).
 *
 *  Some fraction of requests will be failed to be handled. (Note: this may be a
 *  function of the fill degree in the future)
 *
 * The queue has a maximum length.
 */
function Server(sim, network, opts) {
    this.sim = sim;
    this.network = network;
    this.opts = options(opts, {
        proc_time: normal(50, 10),
        queue_bound: 1000,
        P_fail: 0.01,
        quick_reject: true
    });

    this.working = false;
    this.queue = [];
}

_.assign(Server.prototype, {
    receiveRequest: function(client, seq) {
        if (this.queue.length < this.opts.queue_bound) {
            this.queue.push([client, seq]);
            this._maybeStartWorker();
        }
        else if (this.opts.quick_reject) {
            this.sim.record('queue_full', 1);
            this.network.send(client.requestFailed, client, [seq]);
        }
        this.sim.record('queue_size', this.queue.length);
    },

    _maybeStartWorker: function() {
        if (this.working) return;

        if (this.queue.length) {
            this.working = true;
            this.sim.schedule(this.opts.proc_time(), this._handleFirstRequest, this, []);
        }
    },

    _handleFirstRequest: function() {
        var first = this.queue.shift();
        var client = first[0];
        var seq = first[1];

        if (chance(this.opts.P_fail))
            this.network.send(client.requestFailed, client, [seq]);
        else
            this.network.send(client.requestSucceeded, client, [seq]);

        this.working = false;
        this._maybeStartWorker();
    },
});

//----------------------------------------------------------------------

/**
 * Single request
 *
 * A request will be retried until handled by a server, or until a maximum
 * number of retries is reached. 
 *
 * Every time, the request goes to a random server.
 */
function Request(sim, network, servers, opts) {
    this.sim = sim;
    this.network = network;
    this.servers = servers;

    this.opts = options(opts, {
        backoff: constantBO(1000),
        timeout: 120000,
        retries: 10
    });

    this.seq = 0;
    this.sim.record('start_request', 1);
    this._retry();
}

_.assign(Request.prototype, {
    _expectedResponse: function(seq) {
        if (this.seq != seq) return false;
        this.seq++;
        return true;
    },

    _retry: function() {
        this.start = this.sim.now;

        var server = pick(this.servers);

        this.sim.record('request_sent', 1);
        this.network.send(server.receiveRequest, server, [this, this.seq]);
        this.sim.schedule(this.opts.timeout, this._requestTimedOut, this, [this.seq]);
    },

    requestSucceeded: function(seq) {
        if (!this._expectedResponse(seq)) return;

        this.sim.record('request_succeeded', 1);
        this.sim.record('latency', this.sim.now - this.start);
        this.sim.record('success_latency', this.sim.now - this.start);

        if (this.opts.done)
            this.opts.done(true);
    },

    requestFailed: function(seq) {
        if (!this._expectedResponse(seq)) return;

        this.sim.record('request_failed', 1);
        this.sim.record('latency', this.sim.now - this.start);
        this.sim.record('failure_latency', this.sim.now - this.start);

        this._afterFailure(seq);
    },

    _requestTimedOut: function(seq) {
        if (!this._expectedResponse(seq)) return;

        this.sim.record('request_timedout', 1);
        this.sim.record('latency', this.sim.now - this.start);

        this._afterFailure(seq);
    },

    _afterFailure: function(seq) {
        if (seq < this.opts.retries) {
            var wait = this.opts.backoff();
            this.sim.record('wait', wait);
            this.sim.schedule(wait, this._retry, this);
        }
        else if (this.opts.done)
            this.opts.done(false);
    }
});

//----------------------------------------------------------------------

/**
 * Client
 *
 * Clients periodically generate requests (using a request factory
 * to do the hard work ;)
 */
function Client(sim, network, servers, opts) {
    this.sim = sim;
    this.network = network;
    this.servers = servers;
    this.opts = options(opts, {
        interval: normal(1000, 100), 
        done: this._go.bind(this)
    });

    this._go();
}

_.assign(Client.prototype, {
    _go: function() {
        this.sim.schedule(this.opts.interval(), this._spawn, this);
    },
    _spawn: function() {
        new Request(this.sim, this.network, this.servers, this.opts);
    }
});

//----------------------------------------------------------------------

/**
 * Constant backoff function
 */
function constantBO(n) {
    return function() { return n || 1000; }
}

/**
 * Linear backoff function
 */
function linearBO(n) {
    n = n || 100;
    var x = 0;
    return function() {
        x += n;
        return x;
    }
}

/**
 * Exponential backoff function
 */
function expoBO(n) {
    n = n || 50;
    return function() {
        n *= 2;
        return n;
    }
}

/**
 * A randomized version of the given backoff strategy
 */
function randomized(backoff) {
    return function() { return Math.random() * backoff(); }
}
