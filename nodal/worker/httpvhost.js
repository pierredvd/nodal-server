module.exports = function HttpParser(options, ready, listen, send, update){

    var __options   = options;
    var __ready     = ready;
    var __listen    = listen;
    var __send      = send;
    var __update    = update;

    function __construct(){
        __listen(function(payload){
            let i       = 0;
            let l       = __options.length;
            let found   = null;
            while(i<l && !found){
                if(__options[i].hosts.indexOf(payload.request.headers.Host)>=0 || 
                   __options[i].hosts.indexOf('*')){
                    found = __options[i];                    
                }
                i++;
            }
            if(found){
                payload.vhost=found;
            } else {
                payload.response.code = '404';
            }
            __send(payload);
        });
        __ready();
    }

    __construct();

}