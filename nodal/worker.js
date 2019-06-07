module.exports = new (function Worker(){

    const Net = require('net');
    const SocketJson= require(__dirname+'/socketjson.js');
    const Os = require('os');
    const NUMBER_OF_CPUS = Os.cpus().length;

    var __name      = null;
    var __port      = null;
    var __options   = {};
    var __client    = null;
    var __script    = null;
    var __handlers  = {
        send        : [],
        update      : []   
    };
    var __monitorData   = {}

    function __construct(){
        if(process.argv.length>=4){
            __name      = process.argv[2];
            __port      = parseInt(process.argv[3]);
            __client    = SocketJson.client(__port);
            __client.on('ready', function(data){
                __client.send({
                    name        : __name,
                    action      : 'handshake',
                    data        : {pid : process.pid}
                });
                __monitor(function(data){
                    __client.send({
                        name        : __name,
                        action      : 'monitor',
                        data        : data
                    });
                });
            });            
            __client.on('data', function(data){
                try{
                    switch(data.action){
                        case 'handshake':
                            // Try to build script
                            __script = new (require(data.data.script))(
                                data.data.options,
                                // On ready
                                function(){
                                    __client.send({
                                        name        : __name,
                                        action      : 'ready'
                                    });
                                },
                                // Send
                                function(callback){
                                    if(typeof callback=='function'){
                                        __handlers.send.push(callback);
                                    }
                                },
                                // Listen
                                function(payload){
                                    __client.send({
                                        name        : __name,
                                        action      : 'data',
                                        data        : payload
                                    });
                                },
                                // Update
                                function(callback){
                                    if(typeof callback=='function'){
                                        __handlers.update.push(callback);
                                    }
                                },                                    
                            );
                        break;
                        case 'data':
                            __handlers.send.forEach(function(f){
                                f(data.data);
                            });
                        break;
                        case 'update':
                            __handlers.update.forEach(function(f){
                                f(data.data);
                            });
                        break;
                    }
                } catch(e){
                    console.error('<Worker> error: ', e);
                    process.exit();
                }
            });
            __client.on('error', function(e){
                console.error('<Worker> error: ', e);
                process.exit();
            });
            __client.on('close', function(data){
                console.error('<Worker> Socket close');
                process.exit();
            });
        }
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

    __construct();

})();