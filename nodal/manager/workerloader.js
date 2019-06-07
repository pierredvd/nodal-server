function WorkerLoader(manager, name, script, options){

    const Os = require('os');
    const NUMBER_OF_CPUS = Os.cpus().length;

    var __this          = this;
    var __manager       = null;
    var __status        = 'init';
    var __handlers      = [];
    var __segments      = [];
    var __monitorData   = {}

    function __construct(manager, name, script, options){
        __manager = manager;
        Object.defineProperties(__this, {
            'name'      : { value: name, writable: false },
            'socket'    : { value: null, writable: false },
            'pid'       : { value: process.pid, writable: false },
            'monitor'   : { value: null, writable: true },
            'script'    : { value: script, writable: false },
            'options'   : { value: options, writable: false },
            'handlers'  : { value: __handlers, writable: false },
            'status'    : {
                get: function(){ return 'ready'; },
                set: function(status){ return __this; }
            }
        });
        if(typeof options.payloadWorkerOptions=='undefined'){
            console.error('<Worker> Parameter "payloadWorker" missing');
        } else {
            __segments = options.payloadWorkerOptions.split('.');
        }
        if(typeof options.workerScript=='undefined'){
            console.error('<Worker> Parameter "workerScript" missing');
        }

        if(typeof options.workerScript=='undefined'){
            console.error('<Worker> Parameter "'+options.payloadWorkerOptions+' missing');
        }
        console.log('<Manager> Worker "'+name+'" (<'+script+'>) is ready');
        __monitor(function(data){
            __this.monitor = data;
        });
    }

    function __monitor(callback){
        __monitorData   = {
            uptime          : __monitorData.uptime || process.hrtime(),
            hrtime          : process.hrtime(),
            cpuUsage        : process.cpuUsage()
        }        
        setTimeout(function(){
            let uptime      = process.hrtime(__monitorData.uptime);
            let hrtime      = process.hrtime(__monitorData.hrtime);
            let usage       = process.cpuUsage(__monitorData.cpuUsage);
            let hrtime_ms   = hrtime[0] * 1000 + hrtime[1]/ 1000000;
            callback({
                uptime      : uptime[0],
                cpuUsage    : Math.round((usage.user+usage.system)/hrtime_ms/NUMBER_OF_CPUS)/10,
                memoryUsage : process.memoryUsage()
            });
            __monitor(callback)
        }, 1000);
    }

    function __send(action, data){
        let workerOptions = __payloadWorkerOptions(__segments, data);
        if(workerOptions==null || typeof workerOptions.worker=='undefined' || typeof workerOptions.script=='undefined'){
            console.log('<Worker> Invalid payload worker data');
            __handlers.forEach(function(v){
                v(data);
            });
            return false;
        }
        if(!__manager.exists(workerOptions.worker)){
            if(typeof __this.options.workerScript=='undefined'){
                console.log('<Worker> Invalid worker options');
                __handlers.forEach(function(v){
                    v(data);
                });
                return false;
            }
            __manager.createWorker(workerOptions.worker, __this.options.workerScript, {script: workerOptions.script});
            __manager.listen(workerOptions.worker, function(payload){
                __handlers.forEach(function(v){
                    v(payload);
                });
            });
        }
        __manager.send(workerOptions.worker, data);
    }

    function __payloadWorkerOptions(segments, payload){

        if(segments==null){ return null; }
        let buffer = payload;
        let l = segments.length;
        let i = 0;
        let found = true;
        let limit = 256;
        while(i<l && found && limit>=0){
            if(typeof buffer[segments[i]] != 'undefined'){
                buffer = buffer[segments[i]];
            } else {
                found = false;
            }
            limit--;
            i++;
        }
        if(i>0 && found){
            return buffer;
        }
        return null;

    }

    this.listen     = function(callback){
        if(typeof callback=='function'){
            __handlers.push(callback);
        }
        return this;
    }

    this.handshake  = function(data){ console.warn('<Worker> Worker '+__this.name+' no require handshake'); return this; }
    this.send       = function(data){ __send('data', data); return this; }
    this.update     = function(data){ console.warn('<Worker> Worker '+__this.name+' cannot be update');     return this; }     
    this.kill       = function(reason){console.warn('<Worker> Worker '+__this.name+' cannot be killed');    return this; }

    __construct(manager, name, script, options);

}
module.exports = WorkerLoader;