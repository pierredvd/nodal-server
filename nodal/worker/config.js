module.exports = function AppConfig(options, ready, listen, send, update){

    const FileSystem= require('fs');

    var __options   = options;
    var __ready     = ready;
    var __listen    = listen;
    var __send      = send;
    var __update    = update;
    var __config    = {};

    function __construct(){
        var segments = [];
        if(typeof __options.payloadDirRoot=='undefined'){
            console.error('<Config> Parameter "payloadDirRoot" missing');
        } else {
            segments = __options.payloadDirRoot.split('.');
        }
        __listen(function(payload){
            let dirRoot = __payloadDirRoot(segments, payload);
            let path    = dirRoot.replace(/[//\/]+$/, '')+'/'+__options.file;
            __load(path, function(data){
                payload.config = data;
                __send(payload);
            });
        });
        __ready();
    }
    function __load(path, callback){
        if(typeof __config[path]=='undefined'){
            FileSystem.lstat(path, function(err, lstat){
                if(err || !lstat.isFile()){
                    console.error('<AppConfig> error: file not found');
                    callback({});
                    return false;
                }
                FileSystem.readFile(path, function read(err, data) {
                    if (err){
                        console.error('<AppConfig> error: file not readable');
                        callback({});
                        return false;
                    }
                    try{
                        let json = JSON.parse(data);
                        __config[path] = json;
                        callback(__config[path]);
                        FileSystem.watchFile(path, function(){
                            delete __config[path];
                            __load(path, function(){
                                console.error('<AppConfig> config updated');
                            });
                        });
                    } catch(e){
                        console.error('<AppConfig> error: malformed config file:', e);
                        callback({});
                        return false;
                    }
                });
            });
        } else {
            callback(__config[path]);
        }
    }
    function __payloadDirRoot(segments, payload){
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