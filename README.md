Simple Network Simulator
========================

This is a project to help me understand how the choice of backoff algorithm
(either none, or exponential, or otherwise) in a network client influences the
results for the entire population in latency, dropped requests, etc.

And you know what they say, if you're not smart enough to analyze it...
simulate it! 

[Live Demo](http://rix0r.nl/projects/simple-network-simulator/)

Model
-----

My model is as follows, based on a number of clients connecting to a server
over a TCP connection and sending requests/receiving responses synchronously.
I.e., a client will not send a new request before it has had a response from
the server, (or experienced a timeout).

Some number of `Clients` connect to some number of `Servers` to periodically
perform `Queries`.

* For every `Query`, a client makes a `Request`. A `Request` can be
  successfully handled or not.
* If they're not, they're retried, up to `retries` number of times. The time
  between retries is determined by the `backoff` strategy, which is
  `constant`, `linear`, `quadratic` or `exponential`.
* If a `Request` is not answered within a given `timeout`, it is considered as
  failed, and retried as a normal failure.
* Each server has a `queue` with a fixed capacity, and it will serve requests
  from the queue, each taking some amount of `processing time`.
* Requests are sent to a random server, determined at sending time.
* If a request arrives at a server whose queue is full, the request is dropped.
  If `Quick reject` is enabled, the client is notified of the failure.
  Otherwise, the request is silently dropped, forcing the client to wait for
  the `timeout` to trigger.
* Communication between client and server takes some amount of `network`
  transport time, which has some small probability of chance of dropping some
  packets.
* The number of clients increases over time to show the effect of overloading.

Installation
------------

If you want to hack on it (for example, build more complex simulation scenarios
than provided by the current web interface), you can clone and run it yourself.

Simply run:

    bower install

And you're good to go. Everything runs in the client.
