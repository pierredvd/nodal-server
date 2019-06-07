module.exports = function IndexController(){

    this.form = function(payload, callback){
        payload.response.headers['Content-Type'] = 'application/json';
        payload.response.body = JSON.stringify({
            'action': 'testform', 
            'scheme': payload.request.protocol.scheme, 
            'args': payload.route.args,
            'files': payload.request.files
        });
        callback(payload);
    }

    this.monitor = function(payload, callback){
        payload.response.headers['Content-Type'] = 'application/json';
        payload.response.body = JSON.stringify({
            'monitor': payload.monitor 
        });
        callback(payload);
    }

    this.toto = function(payload, callback){
        payload.response.headers['Content-Type'] = 'application/json';
        payload.response.body = JSON.stringify({
            'action': 'toto', 
            'scheme': payload.request.protocol.scheme, 
            'args': payload.route.args,
        });
        callback(payload);
    }

    this.ws = function(payload, callback){
        payload.response.body = JSON.stringify({
            'action': 'ws', 
            'scheme': payload.request.protocol.scheme, 
            'args': payload.route.args
        });
        callback(payload);
    }

    this.ws404 = function(payload, callback){
        payload.response.body = JSON.stringify({
            'action': 'ws404', 
            'scheme': payload.request.protocol.scheme, 
            'args': payload.route.args
        });
        callback(payload);
    }

}