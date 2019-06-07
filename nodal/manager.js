function Manager(port){

    const Path          = require('path');
    const Net           = require('net');
    const Fork          = require('child_process').fork;
    const SocketJson    = require(__dirname+'/socketjson.js');

    var __this          = this;
    var __port          = null;
    var __server        = null;
    var __ready         = false;
    var __workers       = {};
    var __socketBuffer  = {};

    function            __construct(port){
        __port = port;
        __start(function(){
        });
    }
    function            __start(callback){

        __server = SocketJson.server(__port);
        __server.on('ready', function(){
            console.log('<Manager> is now listening port '+__port);
            __ready = true;
            callback();
        });
        __server.on('data', function(socket, data){
            if(typeof __workers[data.name]=='undefined'){
                console.log('<Manager> entering undeclare worker "'+data.name+'" (rejected)');
                process.kill(data.data.pid);
            }
            switch(data.action){
                case 'handshake':
                    __workers[data.name].status = 'handshake';
                    __workers[data.name].socket = socket;
                    __workers[data.name].pid    = data.data.pid;
                    __workers[data.name].handshake({script: __workers[data.name].script, options: __workers[data.name].options});
                break;
                case 'monitor':
                    __workers[data.name].monitor = data.data;
                break;
                case 'ready':
                    __workers[data.name].status = 'ready';
                    console.log('<Manager> Worker "'+data.name+'" ('+Path.basename(__workers[data.name].script)+') is ready');
                break;
                case 'data':
                    __workers[data.name].handlers.forEach(function(f){
                        f(data.data);
                    });                    
                break;
            }
        });
        __server.on('error', function(e){
            if(e.code=='EADDRINUSE'){
                console.error('<Manager> error: Port '+__port+' already in use');
            } else {
                console.error('<Manager> error: '+e.message);
            }
            let name = 0;
            for(name in __workers){
                __workers.kill(e.message);
            }
            __server.close();
        });
        __server.on('close', function(){
            console.error('<Manager> server close');
            let name = 0;
            for(name in __workers){
                __workers.kill('Manager server closed');
            }
            __server.close();
        });
    }

    function            __onReady(callback){
        if(__ready){
            callback();
        } else {
            process.nextTick(function(){
                __onReady(callback);
            });
        }
    }
    
    this.createWorker   = function(name, script, options){
        if(typeof __workers[name]!='undefined'){
            console.log('<Manager> Worker "'+name+'" already exists');
            return this;
        }
        if(typeof Manager[script]!='function'){
            __createWorker(name, script, options);
        } else {
            __createSpecialWorker(name, script, options);
        }

        return this;
    }
    function            __createWorker(name, script, options){
        console.log('<Manager> create worker "'+name+'" ('+Path.basename(script)+')');
        __workers[name] = new (function Worker(name, script, options){

            var __this      = this;
            var __status    = 'init';
            var __handlers  = [];
            var __queue     = [];
        
            function __construct(name, script, options){
                Object.defineProperties(__this, {
                    'name'      : { value: name, writable: false },
                    'socket'    : { value: null, writable: true },
                    'pid'       : { value: null, writable: true },
                    'monitor'   : { value: null, writable: true },
                    'script'    : { value: script, writable: false },
                    'options'   : { value: options, writable: false },
                    'handlers'  : { value: __handlers, writable: false },
                    'status'    : {
                        get: function(){ return __status },
                        set: function(status){
                            __status = status;
                            if(__status=='ready'){
                                // Unqueue send buffer
                                if(__queue.length>0){
                                    console.log('<Worker> Worker "'+__this.name+'" ready : unqueue pending send');
                                    __queue.forEach(function(v){
                                        __send(v[0], v[1]);
                                    });
                                    __queue = [];
                                }
                            }
                            return __this;
                        }
                    }
                });
            }
        
            function __send(action, data){
                switch(__this.status){
                    case 'init':
                        __queue.push([action, data]);
                        console.error('<Worker> Worker "'+__this.name+'" send queued : is still initizing');
                    break;
                    case 'handshake':
                        if(action=='handshake'){
                            __server.send(
                                __this.socket, 
                                {
                                    name        : __this.name,
                                    action      : action,
                                    data        : data
                                }
                            );
                        } else {
                            __queue.push([action, data]);
                            console.error('<Worker> Worker "'+__this.name+'" send queued : is still handshaking');
                        }
                    break;
                    case 'ready':
                        if(__this.socket!=null){
                            let pack = {
                                name        : __this.name,
                                action      : action,
                            };
                            if(data){ pack.data = data; }
                            __server.send(__this.socket, pack);
                        } else {
                            console.error('<Worker> Worker "'+__this.name+'" send abort : socket lost');
                        }
                    break;
                    case 'dead':
                        __queue = [];
                        console.error('<Worker> Worker "'+__this.name+'" send abort : worker is dead');
                    break;
                }
            }
        
            this.listen     = function(callback){
                if(typeof callback=='function'){
                    __handlers.push(callback);
                }
                return this;
            }
        
            this.handshake  = function(data){ __send('handshake', data); return this;  }
            this.send       = function(data){ __send('data'     , data); return this; }
            this.update     = function(data){ __send('update'   , data); return this; }            
        
            this.kill = function(reason){
                if(typeof reason!='undefined'){
                    console.error('<Worker> Worker error: ', reason);
                }
                if(__this.socket!=null){
                    __this.socket.destroy();
                    __this.socket = null;
                }
                if(__this.pid!=null){
                    process.kill(this.pid);
                    __this.pid = null;   
                }
                __this.status = 'dead';
            }
        
            __construct(name, script, options);
        
        })(name, script, options);

        // Start worker
        __onReady(function(){ 
            Fork(__dirname + '/worker.js', [name, __port]); 
        });
    }
    function            __createSpecialWorker(name, script, options){
        console.log('<Manager> create worker "'+name+'" (<'+script+'>)');
        __workers[name] = new Manager[script](__this, name, script, options);
    }

    this.listWorkers    = function(){ return __workers; }

    this.exists         = function(name){
        return typeof __workers[name]!='undefined';
    }

    this.send           = function(name, data){
        if(typeof __workers[name]=='undefined'){
            console.log('<Manager> error: Worker "'+name+'" not found');
        } else {
            __workers[name].send(data);
        }
        return this;
    }

    this.update         = function(name, data){
        if(typeof __workers[name]=='undefined'){
            console.log('<Manager> error: Worker "'+name+'" not found');
        } else {
            __workers[name].update(data);
        }
    }

    this.listen         = function(name, callback){
        if(typeof __workers[name]=='undefined'){
            console.log('<Manager> error: Worker "'+name+'" not found');
        } else {
            __workers[name].listen(callback);
        }
        return this;
    }

    __construct(port);

}
Manager.WorkerLoader    = require(__dirname+'/manager/workerloader.js');
Manager.WorkerMonitor   = require(__dirname+'/manager/workermonitor.js');

module.exports = Manager;