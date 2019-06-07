
const Path                  = require('path');
const FileSystem            = require('fs');
const DS                    = Path.sep;
const PWD                   = __dirname+DS;

const Manager = require(PWD+'nodal/manager.js');

var PGMS = new Manager(3145);

PGMS.createWorker('httpserver'   , PWD+'nodal/worker/socketlistener.js', { port: 80 })
    .createWorker('httpsserver'  , PWD+'nodal/worker/socketlistener.js', { port: 443, ssl: {key: PWD+'ssl/selfsigned-key.pem' , cert: PWD+'ssl/selfsigned-cert.pem'} })
    .createWorker('httpparser'   , PWD+'nodal/worker/httpparser.js'    , { tmpDirectory : PWD+'tmp', sessionCookie: 'jssessid', tmpTimeLife: 1200 })
    .createWorker('vhost'        , PWD+'nodal/worker/httpvhost.js'     , [{hosts: ['localhost', 'localhost.com'], directory: PWD+'apps/localhost'}])
    .createWorker('httpasset'    , PWD+'nodal/worker/httpasset.js'     , {directory: 'www', directoryIndex: 'index.htm'})
    .createWorker('session'      , PWD+'nodal/worker/session.js'       , {payloadSessionId: 'cookies.jssessid.value', sessionTimeLife: 1200 })
    .createWorker('config'       , PWD+'nodal/worker/config.js'        , {payloadDirRoot: 'vhost.directory', file: 'config.json'})
    .createWorker('approuter'    , PWD+'nodal/worker/approuter.js'     , {payloadRoutes: 'config.routes', controllerDir: 'controller'})
    .createWorker('httppacker'   , PWD+'nodal/worker/httppacker.js'    , { bandWidth: 737280 /* 720 kbps */})
    /* A worker can create a worker with special attribute WorkerLoader, ll be run in Manager, and not in isolate scope */
    /* In there, applicative node ll be dynamicly created from payload.route values if not exists, else WorkerLoader ll be only a brige to forward payload to target node */
    .createWorker('appcontroller', 'WorkerLoader'                      , {workerScript: PWD+'nodal/worker/appcontroller.js', payloadWorkerOptions: 'route'})
    .createWorker('monitor'      , 'WorkerMonitor'                     , {});

PGMS.listen('httpserver', function(payload){
        if(payload.net.online){
            PGMS.send('httpparser', payload);
        } else {
            // Alert socket offline to httppacker (interrupt download and media partial content send)
            PGMS.update('httppacker', payload);
        }
    })
    .listen('httpsserver', function(payload){
        if(payload.net.online){
            PGMS.send('httpparser', payload);
        } else {
            // Alert socket offline to httppacker (interrupt download and media partial content send)
            PGMS.update('httppacker', payload);
        }
    })    
    .listen('httpparser', function(payload){
        if(payload.response.code==200){
            PGMS.send('vhost', payload);
        } else {
            PGMS.send('httppacker', payload);
        }
    })
    .listen('vhost', function(payload){
        if(payload.response.code==200){
            PGMS.send('session', payload);
        } else {
            PGMS.send('httppacker', payload);
        }
    })
    .listen('session', function(payload){
        if( payload.request.protocol.scheme=='http' || 
            payload.request.protocol.scheme=='https'){
            PGMS.send('httpasset', payload);
        } else {
            // No asset for websocket
            PGMS.send('config', payload);
        }
    })
    .listen('httpasset', function(payload){
        if(payload.response.file!=null){
            // Return asset
            PGMS.send('httppacker', payload);
        } else {
            PGMS.send('config', payload);
        }
    })
    .listen('config', function(payload){
        PGMS.send('approuter', payload);
    })
    .listen('monitor', function(payload){
        PGMS.send('appcontroller', payload);
    })
    .listen('approuter', function(payload){
        if(payload.response.code==200){
            if( payload.route.worker=='appcontroller_localhost_index' &&
                payload.route.method=='monitor'){
                PGMS.send('monitor', payload);
            } else {
                PGMS.send('appcontroller', payload);
            }
        } else {
            PGMS.send('httppacker', payload);
        }
    })
    .listen('appcontroller', function(payload){
        PGMS.update('session', payload); // update session
        PGMS.send('httppacker', payload);
    })
    .listen('httppacker', function(payload){
        if(!payload.net.ssl){
            PGMS.send('httpserver', payload);
        } else {
            PGMS.send('httpsserver', payload);
        }
    });



