'use strict';

var util = require('util');
var localtunnel = require('localtunnel');

var MAX_RETRIES = 10;
var RETRY_TIMEOUT = 2000;

var currentTunnel;
var tunnelId = 0;
var retryCount = 0;
var liveness = { };

function IdWrapper(id) {
    this.getId = function () { return id; };
}

function logCause(args) {
    if (args.length > 0 && args[0] instanceof IdWrapper) {
        var idWrapper = Array.prototype.shift.apply(args);
        console.log('XXX', 'create triggered by', idWrapper.getId());
    }
}

function foo(stage, id, args) {
    var result = '[';

    for (var i = 0; i < args.length; i++) {
        if (i > 0) {
            result += ', ';
        }

        if (args[i] instanceof IdWrapper) {
            result += 'id=' + args[i].getId();
        } else {
            result += util.inspect(args[i]);
        }
    }

    result += ']';

    console.log('XXX', id, stage, result);
}

function createTunnel() {
    foo('after', -1, arguments);
    logCause(arguments);

    var tunnelArgs = arguments;

// TODO: see non-200 logic in Tunnel.js - this directly calls the tunnelArgs callback (not the emit based logic below).
// For true toughness the `on` logic should be factored out and called on this error too, with the underlying end user
// callback being called in the success case and if the retryCount is 0.
    var tunnel = localtunnel.apply(this, tunnelArgs);
    liveness[tunnelId] = true;
    tunnel.tunnelId = tunnelId++;

    var alive = [];
    for (var i = 0; i < tunnelId; i++) {
        if (liveness[i]) {
            alive.push(i);
        }
    }
    console.log('XXX', 'alive count', alive.length);
    console.log('XXX', 'alive', alive);

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
        console.log('XXX', 'marking', tunnel.tunnelId, ' as expired');
        liveness[tunnel.tunnelId] = false;
        console.log('XXX', liveness);

        // Every so often the nth (rather than the first) underlying tunnel gets an
        // ECONNREFUSED, so clean up and make sure everything is closed.
        tunnel.close();

        if (retryCount > 0) {
            var delay = RETRY_TIMEOUT * Math.pow(2, (MAX_RETRIES - retryCount--));

            console.log('XXX', tunnel.tunnelId, 'connection lost - attempting to recreate tunnel in ' + (delay / 1000) + ' seconds');
            Array.prototype.unshift.call(tunnelArgs, new IdWrapper(tunnel.tunnelId));
            foo('before', tunnel.tunnelId, tunnelArgs);
            setTimeout(function () {
                foo('between', tunnel.tunnelId, tunnelArgs);
                createTunnel.apply(this, tunnelArgs);
            }, delay);
        } else {
            console.log(err);
            process.exit(1);
        }
    });

    currentTunnel = tunnel;
}

exports.create = createTunnel;
