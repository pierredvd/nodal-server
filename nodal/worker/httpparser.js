module.exports = function HttpParser(options, ready, listen, send, update){

    const Crypto    = require('crypto');
    const FileSystem= require('fs');

    var __options   = options;
    var __ready     = ready;
    var __listen    = listen;
    var __send      = send;
    var __update    = update;
    var __sockets   = {};
    var __buffer    = {};
    
    const __protocols           = {
        'http'                  : new RegExp('^[A-Z]+\\s[^\\s]+\\sHTTP\\/[0-9]+\\.[0-9]+[\\r\\n]+', 'i'),
        'websocket'             : new RegExp('^[\\x81\\x88]', '')
    }
    const __http                = {
        versions                : ['1.0', '1.1', '2.0'],
        methods                 : ['head', 'get', 'post', 'put', 'trace', 'options', 'trace', 'connect'],
        codes                   : {
            100 : 'Continue',
            101 : 'Switching Protocols',
            102 : 'Processing',
            200 : 'OK',
            201 : 'Created',
            202 : 'Accepted',
            203 : 'Non-Authoritative',
            204 : 'No Content',
            205 : 'Reset Content',
            206 : 'Partial Content',
            207 : 'Multi-Status',
            210 : 'Content Different',
            226 : 'IM Used',
            300 : 'Multiple Choices',
            301 : 'Moved Permanently',
            302 : 'Moved Temporarily',
            303 : 'See Other',
            304 : 'Not Modified',
            305 : 'Use Proxy',
            307 : 'Temporary Redirect',
            308 : 'Permanent Redirect',
            310 : 'Too many Redirects',
            400 : 'Bad Request',
            401 : 'Unauthorized',
            402 : 'Payment Required',
            403 : 'Forbidden',
            404 : 'Not Found',
            405 : 'Method Not Allowed',
            406 : 'Not Acceptable',
            407 : 'Proxy Authentication Required',
            408 : 'Request Time-out',
            409 : 'Conflict',
            410 : 'Gone',
            411 : 'Length Required',
            412 : 'Precondition Failed',
            413 : 'Request Entity Too Large',
            414 : 'Request-URI Too Long',
            415 : 'Unsupported Media Type',
            416 : 'Requested range unsatisfiable',
            417 : 'Expectation failed',
            418 : 'I’m a teapot',
            421 : 'Bad mapping',
            422 : 'Unprocessable entity',
            423 : 'Locked',
            424 : 'Method failure',
            425 : 'Unordered Collection',
            426 : 'Upgrade Required',
            428 : 'Precondition Required',
            429 : 'Too Many Requests',
            431 : 'Request Header Fields Too Large',
            449 : 'Retry With',
            450 : 'Blocked by Windows Parental Controls',
            451 : 'Unavailable For Legal Reasons',
            456 : 'Unrecoverable Error',
            499 : 'Client has closed connection',
            500 : 'Internal Server Error',
            501 : 'Not Implemented',
            502 : 'Bad Gateway',
            503 : 'Service Unavailable',
            504 : 'Gateway Time-out',
            505 : 'HTTP Version not supported',
            506 : 'Variant also negociate',
            507 : 'Insufficient storage',
            508 : 'Loop detected',
            509 : 'Bandwidth Limit Exceeded',
            510 : 'Not extended',
            511 : 'Network authentication required',
            520 : 'Web server is returning an unknown error'            
        },
        config                  : {
            sessionCookie                 : options.sessionCookie || "jssessid",
            maxRequestSize                : 1048576,
            maxUploadSize                 : 1048576,
            headerSizeLimit               : 2048,
            uploadDir                     : (options.tmp || "./tmp/")+'httppacker/'
        }
    }

    function                    __construct(){
        if(typeof __options.tmpDirectory=='undefined'){
            console.log('<HttpParser> Missing parameter "tmpDirectory"');
            return false;
        }
        __options.tmpDirectory = __options.tmpDirectory.replace(/[\\\/]+$/, '')+'/';

        __listen(function(payload){
            // Check protocol
            let protocol    = __identifyProtocol(payload.data);
            let info        = null;
            switch(protocol){
                case 'http':
                    let size = __httpRequestSize(payload);
                    if(size==null || size==payload.data.length){
                        payload = __httpParser(payload);
                        delete payload.data;
                        __send(payload);
                    } else {
                        // Request chunked start
                        __buffer[payload.net.socketId] = {
                            size    : size,
                            payload : payload
                        }
                    }
                break;
                case 'websocket':
                    payload = __websocketParse(payload);
                    delete payload.data;
                    __send(payload);
                break;
                default:
                    if(typeof __buffer[payload.net.socketId]!='undefined'){
                        // Chunked http request
                        __buffer[payload.net.socketId].payload.data += payload.data;
                        if(__buffer[payload.net.socketId].size==__buffer[payload.net.socketId].payload.data.length){
                            // Request complete
                            let socketId = payload.net.socketId;
                            let buffer   = __buffer[socketId].payload;
                            payload = __httpParser(buffer);
                            delete payload.data;
                            __send(payload);
                            delete __buffer[socketId];
                        }
                    } else {
                        // Not allowed protocol
                        body =  __httpErrorBody(405);
                        payload.response = {
                                code                : 405,
                                headers             : {
                                    'Date'          : (new Date()).toGMTString(),
                                    'Server'        : 'Nodal 1.0',
                                    'Content-Type'  : 'text/html; charset: utf-8',
                                    'Content-Length': body.length,
                                    'Cache-Control' : 'no-cache, no-store, max-age=0, must-revalidate',
                                    'Connection'    : 'close',
                                },
                                body                : body,
                                file                : null
                        };
                        delete payload.data;
                        __send(payload);
                    }
                break;
            }
        });
        __selfTmpFilesCleanUp();
        __ready();
    }

    /*** PROTOCOLS ***/
    function                    __identifyProtocol(data){
        var protocol = null;
        var regex = null;
        for(protocol in __protocols){
            regex = __protocols[protocol];
            if(regex.test(data)){
                return protocol;
            };
        }
        return null;
    }

    /*** HTTP ****/
    function                    __httpRequestSize(payload){
        // Try to extract content-length
        let pos = payload.data.indexOf('Content-Length:');
        let size = null;
        if(pos>0){
            pos += 15;
            let to = payload.data.indexOf("\r\n", pos);
            size = parseInt(payload.data.substring(pos, to));
            size += payload.data.indexOf("\r\n\r\n")+4;
        }
        return size;
    }
    function                    __httpParser(payload){
        let ssl = (payload.net && payload.net.ssl);
        payload.request = {
                protocol: {
                    scheme  : 'http'+(ssl?'s':''),
                    ssl     : ssl,
                    version : '1.1'
                },
                method              : null,
                queryString         : null,
                headers             : {},
                post                : {},
                files               : {},
                get                 : {},
                body                : '',
        };
        payload.response = {
                code                : 200,
                headers             : {
                    'Date'          : (new Date()).toGMTString(),
                    'Server'        : 'Nodal 1.0',
                    'Content-Type'  : 'text/html; charset: utf-8',
                    'Cache-Control' : 'public',
                    'Connection'    : 'keep-alive',
                },
                body                : '',
                file                : null
        };
        payload.cookies = {};
        
        // Check http structure
        let matches = payload.data.match(/^([a-zA-Z]+)\s([ -~]+)\sHTTP\/([0-9]+\.[0-9]+)\r\n/i);
        let body    = '';
        if(matches==null || matches.length!=4){ 
            body =  __httpErrorBody(400);
            payload.response.code = 400; 
            payload.response.headers['Cache-Control']      = 'no-cache, no-store, max-age=0, must-revalidate';
            payload.response.headers['Content-Type']       = 'text/html; chatset: utf-8';
            payload.response.headers['Content-Length']     = body.length;
            payload.response.headers['Connection']         = 'close';
            payload.response.body  = body;
            return payload;
        }
        payload.request.method             = matches[1].toLowerCase();
        payload.request.queryString        = matches[2];
        payload.request.protocol.version   = matches[3].toLowerCase();
        payload.request.path               = payload.request.queryString;
        if(payload.request.path.indexOf('?')>=0){
            payload.request.path = payload.request.path.substring(0, payload.request.path);
        }
        if(payload.request.path==''){ payload.request.path = '/'; }

        // Chech http protocol version
        if(__http.versions.indexOf(payload.request.protocol.version)<0){
            body =  __httpErrorBody(505);
            payload.response.code = 505; 
            payload.response.headers['Cache-Control']      = 'no-cache, no-store, max-age=0, must-revalidate';
            payload.response.headers['Content-Length']     = body.length;
            payload.response.headers['Connection']         = 'close';
            payload.response.body  = body;
            return payload;
        }

        // Uri length
        if(payload.request.queryString.length>__http.config.headerSizeLimit){
            body =  __httpErrorBody(414);
            payload.response.code = 414; 
            payload.response.headers['Cache-Control']      = 'no-cache, no-store, max-age=0, must-revalidate';
            payload.response.headers['Content-Length']     = body.length;
            payload.response.headers['Connection']         = 'close';
            payload.response.body  = body;
            return payload;
        }    

        // Chech http method
        if(__http.methods.indexOf(payload.request.method)<0){
            body =  __httpErrorBody(405);
            payload.response.code = 405; 
            payload.response.headers['Cache-Control']      = 'no-cache, no-store, max-age=0, must-revalidate';
            payload.response.headers['Content-Length']     = body.length;
            payload.response.headers['Connection']         = 'close';
            payload.response.body  = body;
            return payload;
        }

        // Parse headers / body
        pos     = payload.data.indexOf("\r\n\r\n");
        headers = null;
        if(pos>0){
            headers = payload.data.substring(0, pos);
            if(pos<payload.data.length-4){
                payload.request.body = payload.data.substring(pos+4, payload.data.length);
                if(payload.request.body==null){ payload.request.body=''; }
            }
        } else {
            payload.request.body = '';
            headers = payload.data;
        }
        headers = headers.split("\r\n");
        headers.shift();
        headers.forEach(function(header){
            if(header.length>__http.headerSizeLimit){
                payload.response.code = 431;
                payload.response.body = __httpFormatResponse(payload.protocol.version, payload.response.code);
                return payload;
            }
            matches = header.match(/^([a-zA-Z\-]+):\s{0,1}([ -~]+)$/);
            if(matches==null){
                payload.response.code = 417;
                payload.response.body = __httpErrorBody(417);
                return payload;
            }
            payload.request.headers[matches[1]] = matches[2];
        });

        // Cookie
        if(typeof payload.request.headers.Cookie!='undefined'){
            let buffer =  payload.request.headers.Cookie.split(';');
            buffer.forEach(function(cookie){
                let pos = cookie.indexOf('=');
                let name = null;
                let value = null;
                if(pos>0){
                    name = cookie.substring(0, pos).replace(/^\s+/, '');
                    value= cookie.substring(pos+1, cookie.length);
                    if(value==null){ value=''; }
                } else {
                    name = cookie;
                    value = '';
                }
                payload.cookies[name] = {
                    value: value
                }
            });
        }

        // Session cookie
        if(typeof payload.cookies[__http.config.sessionCookie]=='undefined'){
            payload.cookies[__http.config.sessionCookie] = {
                value       : Crypto.createHash('SHA1').update(payload.net.remoteAddress+payload.net.remotePort+process.hrtime().join('.')).digest('hex'), 
                expires     : false, 
                domain      : payload.request.headers.Host, 
                path        : '/', 
                secure      : false, 
                httpOnly    : false
            }
        }

        // Clean header
        if(typeof payload.request.headers.Host!='undefined'){
            pos = payload.request.headers.Host.indexOf(':');
            if(pos>0){
                payload.request.headers.Host = payload.request.headers.Host.substring(0, pos);
            }
            payload.request.headers.Host = payload.request.headers.Host.replace(/\/+^/, '');
        }
        
        // Acces control origin
        payload.request.headers['Access-Control-Allow-Origin'] = payload.request.headers.Host;
        payload.request.headers['Access-Control-Allow-Method'] = 'OPTIONS';

        // Upgrade websocket
        if(typeof payload.request.headers['Sec-WebSocket-Version']!='undefined'){
            // Upgrade http to websocket
            if(payload.request.headers['Sec-WebSocket-Version']!='13'){
                // Websocket version not implemented
                body =  __httpErrorBody(501);
                payload.response.code = 501; 
                payload.response.headers['Cache-Control']      = 'no-cache, no-store, max-age=0, must-revalidate';
                payload.response.headers['Content-Type']       = 'text/html; chatset: utf-8';
                payload.response.headers['Content-Length']     = body.length;
                payload.response.headers['Connection']         = 'close';
                payload.response.body  = body;
                return payload;
            }
            let handshake = Crypto
               .createHash('SHA1')
               .update(payload.request.headers['Sec-WebSocket-Key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
               .digest('base64');

            payload.response.code = 101;
            payload.response.headers['Upgrade']                = 'websocket';
            payload.response.headers['Sec-WebSocket-Accept']   = handshake;
            payload.response.headers['Sec-WebSocket-Origin']   = (typeof payload.request.headers['Origin']!='undefined'?payload.request.headers['Origin']:null);
            payload.response.headers['Sec-WebSocket-Location'] = 'ws'+(ssl?'s':'')+'://'+payload.request.headers['Host']+':'+payload.net.serverPort+(payload.request.queryString?payload.request.queryString:'')
            payload.response.headers['Content-Length']         = 0;
            payload.response.headers['Connection']             = 'Upgrade';
            payload.response.body  = '';
            __sockets[payload.net.socketId] = {
                queryString: ''+payload.request.queryString,
                path       : ''+payload.request.path,
                headers    : {
                    Host                    : ''+payload.request.headers['Host'],
                    'Sec-WebSocket-Accept'  : ''+payload.response.headers['Sec-WebSocket-Accept'],
                    'Sec-WebSocket-Origin'  : ''+payload.response.headers['Sec-WebSocket-Origin'],
                    'Sec-WebSocket-Location': ''+payload.response.headers['Sec-WebSocket-Location']
                },
                cookies    : {}
            };
            __sockets[payload.net.socketId].cookies[__http.config.sessionCookie] = payload.cookies[__http.config.sessionCookie];
            return payload;
        }

        // Extract get/post parameters
        switch(payload.request.method){
            case 'get':
                // Request size
                if(payload.data.length>__http.config.maxRequestSize){
                    body =  __httpErrorBody(413);
                    payload.response.code = 413; 
                    payload.response.headers['Cache-Control']      = 'no-cache, no-store, max-age=0, must-revalidate';
                    payload.response.headers['Content-Length']     = body.length;
                    payload.response.headers['Connection']         = 'close';
                    payload.response.body  = body;
                    return payload;
                }                
                // Parse GET
                pos = payload.request.queryString.indexOf('?');
                if(pos>=0 && pos<payload.request.queryString.length-1){
                    buffer = payload.request.queryString.substring(pos+1, payload.request.queryString.length);
                    buffer = buffer.split('&');
                    buffer.forEach(function(value){
                        pos = value.indexOf('=');
                        payload.request.get[value.substring(0, pos)] = value.substring(pos+1, value.length);
                    });
                }
            break;
            case 'post':

                if( typeof payload.request.headers['Content-Type']!='undefined' &&
                    payload.request.headers['Content-Type'].indexOf('multipart/form-data; boundary=')>=0
                ){
                    /*** Upload ***/
                    matches = payload.request.headers['Content-Type'].match(/\sboundary=([^=\s]+)$/);
                    if(matches==null){
                        body =  __httpErrorBody(400);
                        payload.response.code = 400; 
                        payload.response.headers['Cache-Control']      = 'no-cache, no-store, max-age=0, must-revalidate';
                        payload.response.headers['Content-Length']     = body.length;
                        payload.response.headers['Connection']         = 'close';
                        payload.response.body  = body;
                        return payload;
                    }
                    if(typeof payload.request.headers['Content-Length']=='undefined'){
                        body =  __httpErrorBody(411);
                        payload.response.code = 411; 
                        payload.response.headers['Cache-Control']      = 'no-cache, no-store, max-age=0, must-revalidate';
                        payload.response.headers['Content-Length']     = body.length;
                        payload.response.headers['Connection']         = 'close';
                        payload.response.body  = body;
                        return payload;
                    }
                    boundary = matches[1];
                    let bodyStart   = payload.request.body.indexOf('--'+boundary);
                    let delimiter   = 0;
                    let bodyFinish  = payload.request.body.indexOf('--'+boundary+'--');
                    let fragment    = null;
                    let bodyBuffer  = null;
                    let bodyHead    = {};
                    let files       = [];
                    while(bodyStart<bodyFinish){
                        bodyStart  += boundary.length+4;
                        delimiter   = Math.min(payload.request.body.indexOf('--'+boundary, bodyStart), bodyFinish);
                        fragment    = payload.request.body.substring(bodyStart, delimiter-2);
                        bodyStart   = delimiter;
                        delimiter   = fragment.indexOf("\r\n\r\n");
                        bodyHead = {};
                        fragment.substring(0, delimiter).split("\r\n").map(function(v){
                            let matches = null;
                            matches = v.match(/\sname="([^\"]*)"/);
                            if(matches!=null){ bodyHead.name = matches[1]; }
                            matches = v.match(/\sfilename="([^\"]*)"/);
                            if(matches!=null){ bodyHead.filename = matches[1]; }
                            matches = v.match(/Content\-Type: ([^\s]*)/);
                            if(matches!=null){ bodyHead.mime = matches[1]; }
                        });
                        fragment = {
                            head: bodyHead,
                            body: fragment.substring(delimiter+4, fragment.length)
                        }
                        if(typeof fragment.head.filename=='undefined'){
                            // Post parameter
                            payload.request.post[fragment.head.name] = fragment.body;
                        } else {
                            // File
                            if(fragment.head.filename!=''){
                                let hash = Crypto.createHash('SHA1').update(fragment.body).digest('hex');
                                files.push({
                                    filename: fragment.head.filename,
                                    name    : fragment.head.name,
                                    tmp     : __options.tmpDirectory+hash+'.httpparser',
                                    mime    : fragment.head.mime,
                                    length  : fragment.body.length,
                                    body    : fragment.body
                                });
                            }
                        }
                    }
                    payload.request.body = '';
                    let maxUploadSize = null;
                    if(typeof payload.request.post['MAX_FILE_SIZE'] != 'undefined'){
                        maxUploadSize = parseInt(payload.request.post['MAX_FILE_SIZE']);
                        if(isNaN(maxUploadSize)){ maxUploadSize = null; }
                    }

                    // Error manager
                    files = files.map(function(file){
                        if(file.length>=__http.config.maxUploadSize){
                            delete file.body;
                            delete file.tmp;
                            file.error = 'Exceed server limit size';
                            return file;
                        }
                        if(file.length>=maxUploadSize){
                            delete file.body;
                            delete file.tmp;
                            file.error = 'Exceed form limit size';
                            return file;
                        }
                        if(file.length==0){
                            delete file.body;
                            delete file.tmp;
                            file.error = 'Empty file';
                            return file;
                        }

                        console.log('<<', __options.tmpDirectory);

                        try{
                            let lstat = FileSystem.lstatSync(__options.tmpDirectory);
                            if(!lstat || !lstat.isDirectory()){
                                delete file.body;
                                delete file.tmp;
                                file.error = 'No temporary directory';
                                return file;
                            }
                            try{
                                // Write tmp file
                                FileSystem.writeFileSync(file.tmp, Buffer.from(file.body, 'binary'));
                            } catch(e){
                                file.error = 'Fail to write tmp file';
                                delete file.tmp;
                            }
                            delete file.body;
                        } catch(e){
                            delete file.body;
                            delete file.tmp;
                            file.error = 'No temporary directory';
                            return file;
                        }                        
                        return file;
                    });
                    payload.request.files = files;
                } else {
                    /*** Post ***/
                    // Request size
                    if(payload.request.body.length>__http.config.maxRequestSize){
                        body =  __httpErrorBody(413);
                        payload.response.code = 413; 
                        payload.response.headers['Cache-Control']      = 'no-cache, no-store, max-age=0, must-revalidate';
                        payload.response.headers['Content-Length']     = body.length;
                        payload.response.headers['Connection']         = 'close';
                        payload.response.body  = body;
                        return payload;
                    }                
                    buffer = payload.request.body.split('&');
                    buffer.forEach(function(value){
                        pos = value.indexOf('=');
                        payload.request.post[value.substring(0, pos)] = value.substring(pos+1, value.length);
                    });
                }
            break;
            default:
                // Request size
                if(data.length>__http.config.maxRequestSize){
                    body =  __httpErrorBody(413);
                    payload.response.code = 413; 
                    payload.response.headers['Cache-Control']      = 'no-cache, no-store, max-age=0, must-revalidate';
                    payload.response.headers['Content-Length']     = body.length;
                    payload.response.headers['Connection']         = 'close';
                    payload.response.body  = body;
                    return payload;
                }                
            break;
        }
        return payload;
    }
    function                    __httpErrorBody(code){
        return '<!doctype html><html><meta charset="utf-8" /><body><h1>'+code+' '+__http.codes[code+'']+'</h1><hr></body></html>';
    }

    /*** WEBSOCKET ***/
    function                    __websocketParse(payload){
        let ssl     = (payload.net && payload.net.ssl);  
        let data    = payload.data; 
        payload.request = {
            protocol: {
                scheme  : 'ws'+(ssl?'s':''),
                ssl     : ssl,
                version : '13'
            },
            headers             : {},
            queryString         : '/',
            path                : '/',
            body                : '',
        };
        payload.response = {
            code                : 200,
            headers             : {
                'Date'          : (new Date()).toGMTString(),
                'Server'        : 'Nodal 1.0',
                'Connection'    : 'keep-alive'
            },
            body                : '',
        };
        payload.cookies         = {};
        let head = null;
        let buffer = __sockets[payload.net.socketId] || {};
        if(buffer.queryString){ payload.request.queryString = buffer.queryString; }
        if(buffer.path       ){ payload.request.path        = buffer.path; }
        if(buffer.headers){
            for(head in buffer.headers){
                payload.request.headers[head] = buffer.headers[head];
            }
        }
        if(buffer.cookies){
            for(head in buffer.cookies){
                payload.cookies[head] = buffer.cookies[head];
            }
        }
        
        let i = 0;
        buffer = [];
        for(i=0; i<data.length; i++){
            buffer[i] = data.charCodeAt(i);
        }
        data = buffer;
        
        try{
            if(data[0]==136){
                payload.request.headers['Upgrade']    = "HTTP/1.1";
                payload.request.headers['Connection'] = "Upgrade";
                payload.response.code = 101;
                return payload;
            }
            if(data[0]!=129){
                payload.response.code = 400;
                return payload;
            }
            // Frame size
            var frameLength = data[1] & 127;
            var frameMaskIndex = 2;
            if (frameLength == 126) {
                frameMaskIndex = 4;
            } else {
                if (frameLength == 127) {
                    frameMaskIndex = 10;
                }
            }

            // Load mask
            var dataLength = data.length;
            var offset = frameMaskIndex + 4;
            var masks = data.slice(frameMaskIndex, offset);
            var index = 0;

            // Unmask message
            while (offset < dataLength) {
                payload.request.body += String.fromCharCode(data[offset++] ^ masks[index++ % 4]);
            }
            
            return payload;
            
        } catch(e){
            payload.response.code = 503;
            return payload;
        }
    } 

    /*** TMP ***/
    function                    __selfTmpFilesCleanUp(){

        FileSystem.readdir(__options.tmpDirectory, function(err, files){
            if(!err){
                let list = [];
                let now = (new Date()).getTime();
                let delayLimit = __options.tmpTimeLife || 1200;
                files.forEach(function(file){
                    if(/[a-z0-9]+\.httpparser/.test(file)){
                        list.push(file);
                    }
                });
                function crawl(list, onFile, onComplete, index){
                    index = index || 0;
                    if(index>=list.length){
                        onComplete();
                    } else {
                        let item = list.shift();
                        onFile(item, index, function(){
                            process.nextTick(function(){
                                crawl(list, onFile, onComplete, index+1);
                            })
                        });
                    }
                }
                crawl(
                    list, 
                    function(file, index, ack){
                        FileSystem.lstat(__options.tmpDirectory+file, function(err, lstat){
                            if(!err){
                                if((now-lstat.mtime.getTime())/1000>delayLimit){
                                    FileSystem.unlink(__options.tmpDirectory+file, function(){
                                        ack();
                                    });
                                    return false;
                                }
                            }
                            ack();
                        });
                    },
                    function(){
                        setTimeout(function(){
                            __selfTmpFilesCleanUp();
                        }, 5000);
                    }
                );
            } else {
                console.error('<HttpParser> error: Routine tmp self clean-up fail');
            }
        });

    }    

    __construct();

}