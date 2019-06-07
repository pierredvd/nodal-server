module.exports = function HttpParser(options, ready, listen, send, update){

    var __options   = options;
    var __ready     = ready;
    var __listen    = listen;
    var __send      = send;
    var __update    = update;
    var __sessions  = {};
    var __sockets   = {};

    function __construct(){

        var segments = null;
        if(typeof __options.payloadSessionId!='undefined'){
            segments = __options.payloadSessionId.split('.');
        }
        __update(function(payload){
            let sessionToken = __sessionIdentifier(segments, payload);
            if(sessionToken!=null){
                __sessions[sessionToken].data = payload.session;
                __sessions[sessionToken].lastHitAt = __now();
            }
        });
        __listen(function(payload){
            let sessionToken = null;
            sessionToken = __sessionIdentifier(segments, payload); 
            if(sessionToken!=null){
                // Create missing or expired session
                if(typeof __sessions[sessionToken]=='undefined' || (__now()-__sessions[sessionToken].lastHitAt)/1000>__options.sessionTimeLife){
                    __sessions[sessionToken] = {
                        lastHitAt : __now(),
                        data      : {}
                    };
                } else {
                    __sessions[sessionToken].lastHitAt = __now();
                }

                // load session to payload
                payload.session = __sessions[sessionToken].data;

            } else {
                console.error('<Session> Fail to restore session');
                payload.session = {};
            }
            __send(payload);

        });
        __selfCleaner();
        __ready();
    }

    function __selfCleaner(){

        let token   = null;
        let delay   = __options.sessionTimeLife || 1200;
        let now     = __now();

        // Drop expired tokens
        for(token in __sessions){
            if((now-__sessions[token].lastHitAt)/1000>delay){
                delete __sessions[token];
            }
        }
        for(token in __sockets){
            if(typeof __sessions[token]=='undefined'){
                delete __sockets[token];
            }
        }

        setTimeout(__selfCleaner, 5000);
    }

    function __sessionIdentifier(segments, payload){
        if(segments==null){
            if(typeof __sockets[payload.net.socketId]!='undefined'){
                return __sockets[payload.net.socketId];
            }
        } else {
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
                __sockets[payload.net.socketId] = buffer;
                return buffer;
            }
            return null;
        }
    }

    function __now(){
        return (new Date()).getTime();
    }

    __construct();

}