module.exports = function AppController(options, ready, listen, send, update){

    const FileSystem= require('fs');
    const Path      = require('path');

    var __options   = options;
    var __ready     = ready;
    var __listen    = listen;
    var __send      = send;
    var __update    = update;
    var __controller = null;

    function __construct(){

        if(typeof __options.script=='undefined'){
            console.error('<AppController> Parameter "script" missing');
            process.exit();
        }
        __loadcontroller(__options.script, function(controller){
            __controller = null;
            __controller = controller;
        });
        __listen(function(payload){
            if(__controller==null){
                payload.response.code = 503;
                __send(payload); 
                return false;               
            }
            if(typeof payload.route=='undefined' || typeof payload.route.method=='undefined'){
                console.error('<AppController> "'+Path.basename(__options.script)+' error: Invalid route paramtrics');
                payload.response.code = 503;
                __send(payload); 
                return false;               
            }
            if(typeof __controller[payload.route.method]!='function'){
                console.error('<AppController> "'+Path.basename(__options.script)+':'+payload.route.method+'" error: Method not found');
                payload.response.code = 404;
                __send(payload); 
                return false;               

            }
            try{
                __controller[payload.route.method](payload, __send);
            } catch(e){
                console.error('<AppController> "'+Path.basename(__options.script)+':'+payload.route.method+'" error: ', e);
                payload.response.code = 503;
                __send(payload);
            }
        });
        __ready();
    }

    function __loadcontroller(path, callback){
        FileSystem.lstat(path, function(err, lstat){
            if(err || !lstat.isFile()){
                console.error('<AppController> Script "'+Path.basename(__options.script)+' not found');
                callback(null);
                return false;
            }
            try{
                callback(new (require(__options.script))());
            } catch(e){
                console.error('<AppController> Script "'+Path.basename(__options.script)+' error: ', e);
                callback(null);
                return false;
            }
            FileSystem.watchFile(path, function(){
                console.log('<AppController> Script "'+Path.basename(__options.script)+' updated');
                try{
                    delete require.cache[require.resolve(__options.script)];
                    callback(new (require(__options.script))());
                } catch(e){
                    console.error('<AppController> Script "'+Path.basename(__options.script)+' error: ', e);
                    callback(null);
                    return false;
                }
            });            
        });
    }

    __construct();

}