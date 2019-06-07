module.exports = function SocketListener(options, ready, listen, send, update){

    const FileSystem= require('fs');
    const Net       = require('net');
    const Tls       = require('tls');

    var __options   = options;
    var __ready     = ready;
    var __listen    = listen;
    var __send      = send;
    var __update    = update;
    var __socketId  = 0;
    var __sockets   = [];
    var __server    = null;
    var __ssl       = {
        key         : null,
        cert        : null
    }

    function __construct(){

        if(__options.ssl){
            __ssl.key  = FileSystem.readFileSync(__options.ssl.key);
            __ssl.cert = FileSystem.readFileSync(__options.ssl.cert);
            __startSSLServer(function(){
                __ready();
            });
        } else {
            __startServer(function(){
                __ready();
            });
        }
        __listen(function(payload){
            if(__sockets[payload.net.socketId]!='undefined'){
                if(typeof __sockets[payload.net.socketId]=='object'){
                    __sockets[payload.net.socketId].write(payload.data, 'binary');
                    return false;
                } else {
                    console.error('<SocketListener> error: Socket #'+payload.net.socketId+' lost');
                }
            }
        });
    }

    function __startServer(callback){
        __server = Net.createServer(function(socket){
            __onSockerReceive(socket, false, true);
        }).on('error', function(err){
            if(e.code=='EADDRINUSE'){
                console.error('<SocketListener> error: Port '+__options.port+' already in use');
            } else {
                console.error('<SocketListener> error: '+e.message);
            }
            __server.close();
        }).listen(__options.port, function(){
            console.log('<SocketListener> is now listening port '+__options.port);
            callback();
        });
    }

    function __startSSLServer(callback){
        let options = {
            key                 : __ssl.key,
            cert                : __ssl.cert,
            requestCert         : false,
            rejectUnauthorized  : false
        }
        __server = Tls.createServer(options, function(socket){
            __onSockerReceive(socket, true, socket.authorized);
        }).on('error', function(err){
            if(e.code=='EADDRINUSE'){
                console.error('<SocketListener> error: Port '+__options.port+' already in use');
            } else {
                console.error('<SocketListener> error: '+e.message);
            }
            __server.close();
        }).listen(__options.port, function(){
            console.log('<SocketListener> is now listening port '+__options.port);
            callback();
        });

    }

    function __onSockerReceive(socket, ssl, authorized){
        __socketId = ((__socketId+1) % 65536);
        (function(socketId){
            socket.sockerId = socketId;
            socket.on('data'   , function(data){ 
                __send({
                    net                 : {
                        socketId        : socketId,
                        serverAddress   : socket.localAddress,
                        serverPort      : socket.localPort,
                        remoteAddress   : socket.remoteAddress,
                        remoteFamily    : socket.remoteFamily,
                        remotePort      : socket.remotePort,
                        ssl             : ssl,
                        authorized      : authorized,
                        online          : true,
                    },
                    data                : data.toString('binary')
                });
            });
            socket.on('error'   , function(e){ 
                console.error('<SocketListener> Socket #'+socket.sockerId+' error: ', e);
                socket.end(); 
            });
            socket.on('timeout' , function(){ 
                console.error('<SocketListener> Socket #'+socket.sockerId+' timeout');
                socket.end(); 
            });
            socket.on('end'     , function(){ 
                __send({
                    net                 : {
                        socketId        : socketId,
                        serverAddress   : socket.localAddress,
                        serverPort      : socket.localPort,
                        remoteAddress   : socket.remoteAddress,
                        remoteFamily    : socket.remoteFamily,
                        remotePort      : socket.remotePort,
                        ssl             : ssl,
                        online          : false,
                    },
                    data                : ''
                });                    
                socket.destroy(); 
                delete __sockets[socketId]; 
            });
            __sockets[socketId] = socket;
        })(0+__socketId);        
    }

    __construct();
}