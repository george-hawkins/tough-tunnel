'use strict';

var localtunnel = require('localtunnel');

var MAX_RETRIES = 10;
var RETRY_TIMEOUT = 2000;

var currentTunnel;
var retryCount = 0;

function createTunnel() {
    var tunnelArgs = arguments;

    // On creation localtunnel tries to contact the tunnel server and it'll retry until it gets a response.
    // But on getting a response it'll give up if its status isn't 200 (and call your callback with an error).
    // Unlike the ECONNREFUSED handling below the logic here doesn't try to recover from this.
    // It wouldn't be hard to add - but this situation is much rarer than ECONNREFUSED.
    var tunnel = localtunnel.apply(this, tunnelArgs);

    // Why bother with a local tunnel variable at all? Because of how closures capture these things.
    // See https://gist.github.com/george-hawkins/01aa8274de05c95afd28
    currentTunnel = tunnel;

    tunnel.once('url', function () {
        // You only get 'url' when the first cluster tunnel emits 'open' - proving that it's
        // possible to establish a connection and so retry-on-error should be enabled.
        retryCount = MAX_RETRIES;
    });

    // Use `on` rather than `once` otherwise further 'error' events will kill the app.
    tunnel.on('error', function (err) {
        // Don't respond to further 'error' events on an already expired tunnel.
        if (tunnel.expired) {
            return;
        }

        tunnel.expired = true;

        // Every so often the nth (rather than the first) underlying tunnel gets an
        // ECONNREFUSED, so clean up and make sure everything is closed.
        tunnel.close();

        if (retryCount > 0) {
            var delay = RETRY_TIMEOUT * Math.pow(2, (MAX_RETRIES - retryCount--));

            console.log('connection lost - attempting to recreate tunnel in ' + (delay / 1000) + ' seconds');
            setTimeout(function () {
                createTunnel.apply(this, tunnelArgs);
            }, delay);
        } else {
            console.log(err);
            process.exit(1);
        }
    });
}

// Nothing is done with currentTunnel at the moment but you need it if you want to add close logic (this
// logic would also have to clean up any possible outstanding timers etc.).

exports.create = createTunnel;
