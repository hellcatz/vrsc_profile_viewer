const dot = require('dot');
const express = require('express');
const cookieParser = require('cookie-parser')
const helmet = require('helmet');
const compress = require('compression');
const fs = require('fs');
const bodyParser = require('body-parser');
const he = require('he');
const outputcache = require('outputcache');
const axios = require('axios');

const CoinDaemon = require('./common/daemon.js');

function readJsonObject(file) {
    let obj;
    try {
        obj = JSON.parse(fs.readFileSync(file, {encoding: 'utf8'}));
    } catch(e) {
        obj = {};
    }
    return obj;
}

// --------------------------
// CONFIG
// --------------------------

let cfg = readJsonObject("config.json");
if (!cfg || !cfg.daemons) {
    console.log ("Missing configuration options.");
    return;
}

let api_config = {
    "listenPort": (cfg.listenPort||8080),
    "daemons": (cfg.daemons || [
        {
            "host": "localhost",
            "port": 7771,
            "user": "rpc_user",
            "password": "rpc_pass"
        }
    ])
};

// --------------------------
// API
// --------------------------
let apiGetVdxfid = function(req, res, next){
    let identity = req.params.id || null;
    if (identity != null) {
        res.header('Cache-Control', 'public, max-age=0, no-cache');
        res.header('Content-Type', 'application/json');
        res.header('Connection', 'close');
        daemon.cmd('getvdxfid', [identity], function(result) {
            res.end(JSON.stringify(result));
        }, true);
    } else
        next();
};

let apiGetIdentity = function(req, res, next){
    let identity = req.params.id || null;
    if (identity != null) {
        res.header('Cache-Control', 'public, max-age=0, no-cache');
        res.header('Content-Type', 'application/json');
        res.header('Connection', 'close');
        daemon.cmd('getidentity', [identity], function(result) {
            // *Note, x-real-ip can be spoofed if not behind your own proxy
            let ip = (req.headers['x-real-ip']||req.socket.remoteAddress);
            console.log("identity lookup", identity, !result.error, ip);
            res.end(JSON.stringify(result));
        }, true);
    }
    else
        next();
};

let apiVerifyMessage = function(req, res, next){
    let address = req.body.address;
    let signature = req.body.signature;
    let message = req.body.message;
    res.header('Cache-Control', 'public, max-age=0, no-cache');
    res.header('Content-Type', 'application/json');
    res.header('Connection', 'close');
    daemon.cmd('verifymessage', [address, signature, message], function(result) {
        res.end(JSON.stringify(result));
    }, true);
};
function trimChar(string, charToRemove) {
    while(string.charAt(0)==charToRemove) {
        string = string.substring(1);
    }
    while(string.charAt(string.length-1)==charToRemove) {
        string = string.substring(0,string.length-1);
    }
    return string;
}
function trimProofMsg(msg) {
    return trimChar(trimChar(trimChar(trimChar(trimChar(trimChar(msg.replace(/\\"/g, '"').replace(/\\'/g, '\''), ' '),'\''),'"'),'<'),'>'),'\n');
}

let apiVerifyRedditProof = function(req, res, next){
    let address = req.body.address;
    let website = req.body.website;
    let data = {
        "response": false
    }
    
    res.header('Cache-Control', 'public, max-age=0, no-cache');
    res.header('Content-Type', 'application/json');
    res.header('Connection', 'close');
    
    axios.get(website)
      .then(response => {
            const htmlStripregex = /<[^>]+>/g;
            const verusProofMsgregex = /['">\n]i[A-Za-z0-9]+ [0-9]+: controller of VerusID .* controls .*:[A-Za-z0-9/+=:]+['"<\n]/g;
            let body = he.decode(response.data.replace(htmlStripregex, ''));
            const matches = body.match(verusProofMsgregex);
            if (matches) {
                for (let m of matches) {
                    // parse the above matched string for message and signature
                    let proof = trimProofMsg(m);
                    let s = proof.split(':');
                    let message = he.decode(s[0] + ':' + s[1]);
                    let signature = s[2];
                    daemon.cmd('verifymessage', [address, signature, message], function(result) {
                        res.end(JSON.stringify(result));
                    }, true);
                    return;
                }
            }
            res.end(JSON.stringify(data));
      })
      .catch(error => {
        res.end(JSON.stringify(data));
      });
};

let apiVerifyWebsiteProof = function(req, res, next){
    let address = req.body.address;
    let website = req.body.website;
    let data = {
        "response": false
    }
    
    res.header('Cache-Control', 'public, max-age=0, no-cache');
    res.header('Content-Type', 'application/json');
    res.header('Connection', 'close');
        
    axios.get(website)
      .then(response => {
        const htmlStripregex = /<[^>]+>/g;
        const verusProofMsgregex = /['">\n]i[A-Za-z0-9]+ [0-9]+: controller of VerusID .* controls .*:[A-Za-z0-9/+=:]+['"<\n]/g;
        const matches = response.data.match(verusProofMsgregex);
        if (matches) {
            for (let m of matches) {
                // parse the above matched string for message and signature
                let proof = he.decode(trimProofMsg(m));
                let s = proof.split(':');
                let message = he.decode(s[0] + ':' + s[1]);
                let signature = s[2];
                daemon.cmd('verifymessage', [address, signature, message], function(result) {
                    res.end(JSON.stringify(result));
                }, true);
                return;
            }
        }
        res.end(JSON.stringify(data));
      })
      .catch(error => {
        res.end(JSON.stringify(data));
      });
};

// --------------------------
// RENDERING TEMPLATES
// --------------------------

let renderDotTemplate = function(file, output){
    output(dot.template(fs.readFileSync(file, {encoding: 'utf8'})));
};

let indexTemplate;
let renderPageTemplate = function(file, done) {
    let dorender = function() {
        let f = './www/'+file;
        renderDotTemplate(f, function(data) {
            // render page templates
            pageTemplates[file] = data({
                "nodata": "none"
            });
            // render index templates for pages
            indexTemplates[file] = indexTemplate({
                page: pageTemplates[file],
                selected: file
            });
            done();
        });
    };
    if (!indexTemplate) {
        renderDotTemplate("./www/index.html", function(data) {
            indexTemplate = data;
            dorender();
        });
    } else {
        dorender();
    }
};

let getIndexHtml = function(req, res, next){
    res.header('Content-Type', 'text/html');
    res.header('Connection', 'close');
    let template = "index.html";
    if (!indexTemplates[template]) {
        renderPageTemplate(template, function() {
            res.end(indexTemplates[template]);
        });
    } else {
        res.end(indexTemplates[template]);
    }
};

let getProfileHtml = function(req, res, next){
    let identity = req.params.id || null;
    if (identity != null) {
        res.header('Content-Type', 'text/html');
        res.header('Connection', 'close');
        let file = "./www/profile.html";
        res.end(fs.readFileSync(file, {encoding: 'utf8'}));
    } else 
        next();
};


let pageTemplates = {};
let indexTemplates = {};
function watchTemplate(file) {
    let clear = function(file) {
        delete pageTemplates[file];
        delete indexTemplates[file];
        indexTemplate = undefined;
    };
    let _timer;
    let timer = function(file) {
        let doClear = function() {
            clear(file);
            timer(file);
        };
        
        if (_timer)
            clearTimeout(_timer);
        
        _timer = setTimeout(doClear, 60000);
    };
    fs.watchFile("./www/"+file, (curr, prev) => {
        clear(file);
        timer(file);
        // reset admin password attempt
        invalidAttempts = 0;
    });
    timer(file);
};

let app = express();
const xoc = new outputcache({
    ttl: 180, // 180 sec ( 3min )
    noHeaders: true,
    useCacheHeader: false,
    maxItems: 100
});

// ---------------------------
// Main Application
// ---------------------------

let daemon;
function setupDaemonInterface(options, done){
    if (!Array.isArray(options.daemons) || options.daemons.length < 1) {
        return;
    }
    daemon = new CoinDaemon.interface(options.daemons, function (severity, message) {
        console.log("daemon", severity, message);
    });
    daemon.once('online', function () {
        done();
    }).on('loading', function (error) {
        console.log("daemon loading", error);
        setTimeout(daemon.init, 15000);
    }).on('connectionFailed', function (error) {
        console.log("daemon connection failed", error);
    }).on('error', function (error) {
        console.log("daemon error", error);
    });
    daemon.init();
}

setupDaemonInterface(api_config, function() {

    // express protection
    app.use(helmet.dnsPrefetchControl());
    app.use(helmet.expectCt());
    app.use(helmet.hidePoweredBy());
    app.use(helmet.hsts());
    app.use(helmet.ieNoOpen());
    app.use(helmet.referrerPolicy());
    app.use(helmet.xssFilter());

    // parse cookies
    app.use(cookieParser());

    // express compress output
    app.use(compress());

    // API urls
    app.use(bodyParser.json());
    app.post('/api/verifyreddit', apiVerifyRedditProof);
    app.post('/api/verifywebsite', apiVerifyWebsiteProof);
    app.post('/api/verifymessage', apiVerifyMessage);
    
    app.get('/api/getvdxfid/:id', xoc.middleware, apiGetVdxfid);
    app.get('/api/getidentity/:id', xoc.middleware, apiGetIdentity);
    
    app.get('/identity/:id', getProfileHtml); watchTemplate('profile.html');
    app.get('/identity/', function(req, res) { res.redirect('../'); });
    
    app.get('/index.html', getIndexHtml); watchTemplate('index.html');
    app.get('/', getIndexHtml); // index alias

    // STATIC FILES
    app.use('/static', express.static('./www'));
    app.use(express.static('./www'));

    // HANDLE ERRORS
    app.use(function(err, req, res, next){
        res.header('Content-Type', 'application/json');
        res.header('Connection', 'close');
        if (err instanceof URIError) {
            res.status(400);
            res.end('{"error":"Bad Request"}');
        } else {
            console.error(err.stack);
            res.status(500);
            res.end('{"error":"Internal Server Error"}');
        }
    });

    // start api server
    let port = (api_config.listenPort||8888);
    app.listen(port, (api_config.listenHost||"0.0.0.0"), function () {
        console.log("API Server listening on "+port);
    });
});

