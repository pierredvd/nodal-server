## Le principe nodal

Nodal part du principe que, dans un serveur ou un applicatif, le seul élement indivible est la function.
En partant de ce principe, ou peut definir un serveur ou une application comme un groupe de fonction liés les unes aux autres, et une execution comme le parcours du graphe de ces fonctions.

Le code dans ce repository n'est qu'une possibilité de l'approche, l'on a ici un serveur HTTP, HTTPS, WebSocket, WebSockets rudimentaire a titre d'exemple. L’intérêt n'est pas dans le résultat, mais dans l'approche, formalisée pour être réutilisable.

Cet exemple s'articule de la manière suivante :

![alt text](https://raw.githubusercontent.com/pierredvd/nodal-server/master/apps/localhost/www/nodal.jpg)

Chaque fonctionalité atomique deviens un worker, qui accepte un payload d'entrée, le traite, puis acquitte le payload vers le noeud suivant.
Les worker communique par une plateforme commune, servant de hub, et collectant les informations de monitoring.

Si une node vient à planter, cette dernière sera rechargée, mais n'interropra pas les executions n'etant pas en train de l'utiliser.
Avec cette approche, on peut facilement envisager d'incorporation de nouvelle fonctionnalités par ajout de nodes, puis "recablage" du graphe d'execution.
On peut egalement envisager plus facilement une scalarisation locale des points d'engorgement sans attributer de ressources la ou cela n'est pas necessaire, aussi bien d'un point de vue infrastructure, qu'applicatif.

Enfin, une node peut très facilement reservir dans un autre chainage, voire plusieurs chainages peut partager une meme node centralisée, comme par exemple, plusieurs serveurs HTTP, une seule node de session load balancée, plutot que de devoir synchroniser a posteriori 2 chainages distincts.

## Pour un test rapide

```bash
node bootstrap.js
```
Un objectif possible serai de pouvoir reviser le chainage à chaud via une interface graphique, faire le monitoring a la fois architecture et applicatif en un seul point, et permettre à la manière de docker, d'exporter un chainage sous forme de manifeste fichier pour permettre l'import export.

## Comment se structure le bootloader

On crée la plateforme du graph sur un port dedié (ici 3145)

```javascript
const Path                  = require('path');
const FileSystem            = require('fs');
const DS                    = Path.sep;
const PWD                   = __dirname+DS;

const Manager = require(PWD+'nodal/manager.js');

var PGMS = new Manager(3145);
```

On crée nos worker pour chaque node. Par defaut une node est dans un contexte isolé, mais pour certaines fonctionnalités ou plusieurs nodes partage des données, la node dispose d'un contexte directement dans la plateforme, comme ici pour le controller applicatif, ou le moniteur.
On passe la configuration de la node à sa création.

```javascript
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
```
Ici par exemple, la node WorkerLoader est un cas particulier, elle sert de hub, et routera vers un script applicatif selon le parametre transmit dans ```payload.route```


Le contenu de la node est standardisé selon la syntaxe suivante :

```javascript
module.exports = function MyNode(options, ready, listen, send, update){

	// (object) 	options Configuration de la node
	// (function) 	ready 	Fonction acquitté lorque la node à terminer son hanshake avec la plateforme et correctement amorcé son script applicatif.
	// (function) 	listen 	Fonction d'ecoute d'un payload entrant, doit être acquité avec "send"
	// (function) 	update  Fonction d'écoute d'un payload entrant pour mise à jour locale de la node. N'attend pas d'acquittement

}
```

Une fois les nodes déclarées, on peut enfin les chainer.

```javascript
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
```