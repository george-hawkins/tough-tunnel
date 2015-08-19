'use strict';

var localtunnel = require('localtunnel');

var MAX_RETRIES = 10;
var RETRY_TIMEOUT = 2000;

var tunnel;
var retryCount = 0;

function createTunnel() {
    tunnel = localtunnel.apply(this, arguments);

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
        } else {
            tunnel.expired = true;
        }

        if (retryCount > 0) {
            var delay = RETRY_TIMEOUT * Math.pow(2, (MAX_RETRIES - retryCount--));

            console.log('connection lost - attempting to recreate tunnel in ' + (delay / 1000) + ' seconds');
            setTimeout(function () {
                createTunnel();
            }, delay);
        } else {
            console.log(err);
            process.exit(1);
        }
    });
}

exports.create = createTunnel;
