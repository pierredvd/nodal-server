module.exports = new (function SocketJson(){

    this.server     = function(port){

        return new (function(port){

            const Net       = require('net');

            var __handlers      = {};
            var __server        = null;
            var __socketIndex   = null;
            var __sockets       = [];

            function            __construct(port){
                __server = Net.createServer(function(socket){
                    __socketIndex = (__socketIndex + 1)%65536;
                    __sockets[__socketIndex] = socket;
                    socket.index = __socketIndex;
                    socket.on('data', function(chunk){
                        __socketRead(socket, chunk, function(data){
                            __fire('data', socket.index, data);
                        });
                    });
                    socket.on('error'   , function(){ socket.end(); });
                    socket.on('timeout' , function(){ socket.end(); });
                    socket.on('end'     , function(){ socket.destroy(); delete  __sockets[socket.index] });
                }).on('error', function(e){
                    __server.close();
                    __server = null;
                    __fire('error', e);
                    __fire('close');
                }).listen(port, function(){
                    __fire('ready');
                });                
            }

            function            __fire(){
                var args = [];
                let i = 0;
                let l = arguments.length;
                for(i=0; i<l; i++){ args.push(arguments[i]); }
                if(args.length>0){
                    let eventName = args.shift();
                    if(typeof __handlers[eventName]!='undefined'){
                        __handlers[eventName].forEach(function(f){
                            f.apply(null, args);
                        });
                    }
                }
            }

            this.on             = function(eventName, callback){
                if(typeof __handlers[eventName]=='undefined'){ __handlers[eventName] = []; }
                if(typeof callback=='function'){
                    __handlers[eventName].push(callback);
                }
                return this;
            }

            this.send           = function(socketIndex, data){
                if(typeof __sockets[socketIndex]!='undefined'){
                    __socketWrite(__sockets[socketIndex], data);
                }
                return this;
            }

            __construct(port);

        })(port);

    }

    this.client     = function(port){

        return new (function(port){

            const Net       = require('net');

            var __client        = null;
            var __handlers      = {};

            function __construct(port){
                __client    = new Net.Socket();
                __client.connect(port, '127.0.0.1', function(){
                    __fire('ready');
                });
                __client.on('data', function(data){
                    __socketRead(__client, data, function(data){
                        __fire('data', data);
                    });
                });
                __client.on('close'  , function(){ 
                    __client.destroy(); 
                    __client=null; 
                    __fire('close');
                });
                __client.on('error'  , function(e){ 
                    __fire('error', e);
                    __client.close(); 
                });
                __client.on('timeout', function(){ __client.close(); __client = null; });
            }

            function            __fire(){
                var args = [];
                let i = 0;
                let l = arguments.length;
                for(i=0; i<l; i++){ args.push(arguments[i]); }
                if(args.length>0){
                    let eventName = args.shift();
                    if(typeof __handlers[eventName]!='undefined'){
                        __handlers[eventName].forEach(function(f){
                            f.apply(null, args);
                        });
                    }
                }
            }

            this.send           = function(data){
                if(__client!=null){
                    __socketWrite(__client, data);
                }
                return this;
            }

            this.on             = function(eventName, callback){
                if(typeof __handlers[eventName]=='undefined'){ __handlers[eventName] = []; }
                if(typeof callback=='function'){
                    __handlers[eventName].push(callback);
                }
                return this;
            }            

            __construct(port);

        })(port);

    }

    function __socketRead(socket, data, callback){
        if(typeof socket.buffer=='undefined'){ socket.buffer = Buffer.alloc(0); }
        socket.buffer = Buffer.concat([socket.buffer, data]);
        let hold = true;
        while(hold && socket.buffer.byteLength>=3){
            let head = 
                (socket.buffer[0]<<16) +
                (socket.buffer[1]<<8) +
                (socket.buffer[2]);
                
            if(head<=socket.buffer.byteLength){
                try{
                    callback(JSON.parse(socket.buffer.slice(3, head).toString()));
                } catch(e){
                    console.error('<SocketJson> error: ', e);
                    socket.end();
                }
                socket.buffer = socket.buffer.slice(head, socket.buffer.byteLength);
            } else {
                hold = false;
            }
        }
    }

    function __socketWrite(socket, data){
        let buffer      = Buffer.from(JSON.stringify(data));
        let length      = buffer.byteLength+3;
        let head        = Buffer.from([(length&16711680)>>16,(length&65280)>>8,length&255]);
        socket.write(Buffer.concat([head, buffer]));
    }

})();