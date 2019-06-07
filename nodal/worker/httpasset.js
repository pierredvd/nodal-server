module.exports = function HttpAsset(options, ready, listen, send, update){

    const FileSystem            = require('fs');

    var __options               = options;
    var __ready                 = ready;
    var __listen                = listen;
    var __send                  = send;
    var __update                = update;

    function                    __construct(){
        __listen(function(payload){
            if(payload.request.path){
                let path =  payload.vhost.directory.replace(/[\\\/]+$/, '')+'/'+
                            (__options.directory.replace(/^[\\\/]+/, '').replace(/[\\\/]+$/, '') || '')+'/';
                if(payload.request.path=='/' && __options.directoryIndex){
                    path += __options.directoryIndex.replace(/^[\\\/]+/, '');
                } else {
                    path += payload.request.path.replace(/^[\\\/]+/, '');
                }
                FileSystem.lstat(path, function(err, lstat){
                    if(!err){
                        if(lstat.isFile()){
                            // Asset to serve
                            payload.response.file = path;
                        }
                    }
                    __send(payload);
                });
            } else {
                __send(payload);
            }
        });
        __ready();
    }

    __construct();
}