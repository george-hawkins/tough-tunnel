'use strict';

var moment = require('moment');
var http = require('http');
var toughTunnel = require('./ToughTunnel.js');

var PORT = 8088;

http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Hello World\n');
}).listen(PORT);

toughTunnel.create(PORT, function(err, tunnel) {
    if (err) {
        fatal(err);
    }

    log('server accessable at ' + tunnel.url);

    debugTunnel(tunnel);
});

// ----------------------------------------------------------------------

var debugTunnelId = 0;

function debugTunnel(tunnel) {
    tunnel.debugTunnelId = debugTunnelId++;

    tunnel.on('error', function (err) {
        if (tunnel.debugExpired) {
            log('tunnel[' + tunnel.debugTunnelId + '] - got further error on already expired tunnel');
        } else {
            tunnel.debugExpired = true;
            log('tunnel[' + tunnel.debugTunnelId + '] - error - err.statck:', err.stack);
        }
    });
    tunnel.on('url', function (url) {
        log('tunnel[' + tunnel.debugTunnelId + '] - url - url:', url);
    });
    tunnel.on('close', function () {
        log('tunnel[' + tunnel.debugTunnelId + '] - close');
    });

    // The successful emission of 'url' is the earliest point at which we know tunnel.tunnel_cluster exists.
    tunnel.once('url', function () {
        // Note: the first 'open' event has already been emitted before we get to register
        // this handler so you see one less 'open' than expected on the first open/dead cycle.
        tunnel.tunnel_cluster.on('open', function (remote) {
            log('tunnel[' + tunnel.debugTunnelId + '].tunnel_cluster - open - remote.localPort:', remote.localPort);
        });

        tunnel.tunnel_cluster.on('dead', function () {
            log('tunnel[' + tunnel.debugTunnelId + '].tunnel_cluster - dead');
        });
    });
}

// ----------------------------------------------------------------------

function log() {
    var args = Array.prototype.slice.call(arguments);

    args.unshift('[' + moment().format('HH:mm:ss.SSS') + ']');
    console.log.apply(console, args);
}

function fatal(message) {
    log('Error: ', message);
    process.exit(1);
}
