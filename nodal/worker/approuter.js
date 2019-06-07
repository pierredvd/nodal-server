module.exports = function AppRouter(options, ready, listen, send, update){

    const FileSystem= require('fs');

    var __options   = options;
    var __ready     = ready;
    var __listen    = listen;
    var __send      = send;
    var __update    = update;

    function __construct(){

        var segments = null;
        if(typeof __options.payloadRoutes=='undefined'){
            console.error('<AppRouter> Missing argument "payloadRoutes"');
        }
        var segments = __options.payloadRoutes.split('.');
        __listen(function(payload){
            let routes = __payloadRoutes(segments, payload);
            if(routes==null){
                console.error('<AppRouter> No routes founds');
                payload.response.code = 404;
            } else {
                // Find matching route
                let regex       = null;
                let length      = routes.length;
                let i           = 0;
                let matches     = [];
                let args        = [];
                let route       = null;
                let workerName  = null;
                let script      = null;
                while(i<length){
                    if((routes[i].scheme || []).indexOf(payload.request.protocol.scheme)>=0){
                        if(routes[i].regex && routes[i].controller && routes[i].method){
                            regex = new RegExp(routes[i].regex, '');
                            matches = payload.request.path.match(regex);
                            if(matches!=null){
                                args = matches.slice(1);
                                workerName = routes[i].controller;
                                if(workerName.lastIndexOf('.')>=0){ workerName = workerName.substring(0, workerName.lastIndexOf('.')); }
                                workerName = 'appcontroller_'+payload.vhost.hosts[0]+'_'+workerName;
                                script = payload.vhost.directory.replace(/[\\\/]+$/)+'/';
                                if(__options.controllerDir){
                                    script += __options.controllerDir.replace(/[\\\/]+$/)+'/';
                                }
                                script += routes[i].controller;
                                route = {
                                    worker              : workerName,
                                    script              : script,
                                    method              : routes[i].method,
                                    args                : args
                                }
                                i = length;
                            }
                        }
                    }
                    i++;
                }
                if(route==null){
                    payload.response.code = 404;
                } else {
                    payload.route = route;
                }
            }

            __send(payload);
        });
        __ready();
    }

    function __payloadRoutes(segments, payload){

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

    __construct();

}