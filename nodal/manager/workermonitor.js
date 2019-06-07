function WorkerMonitor(manager, name, script, options){

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
        console.log('<Manager> Worker "'+name+'" (<'+script+'>) is ready');
        __monitor(function(data){
            __this.monitor = data;
        });       
    }

    function __send(action, data){

        let workers     = __manager.listWorkers();
        let name        = null;
        let matches     = '';
        let className   = null;
        let monitoring  = [];
        for(name in workers){
            className = '?';
            matches = (/function (.{1,})\(/).exec((workers[name]).constructor.toString());
            if(matches.length > 1){
                className = matches[1];
            }
            monitoring.push({
                worker  : name,
                type    : className,
                pid     : workers[name].pid,
                monitor : workers[name].monitor
            });
        }
        data.monitor = monitoring;
        __handlers.forEach(function(v){
            v(data);
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
module.exports = WorkerMonitor;