const arconfig = {
    host: 'arweave.net',// Hostname or IP address for a Arweave host
    port: 443,          // Port
    protocol: 'https',  // Network protocol http or https
};
const arweave = Arweave.init(arconfig);
const markdownconverter = new showdown.Converter();
const hexCharsregex = /[0-9A-Fa-f]{6}/g;
const base64urlregex = /^[A-Za-z0-9_\-]+$/;
const verusProofMsgregex = /"i9TbCypmPKRpKPZDjk3YcCEZXK6wmPTXjw.1:.controller of VerusID .* controls .*:.*['"]/g;

let relativePath="";

let vdxfids = {};
let vrsc_id = {};
let vrsc_content = {};
let vrsc_profile = {};

function isEmpty(str) {
    return (!str || str.length === 0 );
}

function isHex(hex) {
    if (isEmpty(hex)) return false;
    let r = hexCharsregex.test(hex);
    hexCharsregex.lastIndex = 0;
    return r;
}

function reverseHex(hex) {
    return hex.match(/../g).reverse().join('');
}

// note: implementation from crypto-js
// Convert a hex string to a byte array
function hexToBytes(hex) {
    for (var bytes = [], c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
    return bytes.join("");
}

// Convert a byte array to a hex string
function bytesToHex(bytes) {
    for (var hex = [], i = 0; i < bytes.length; i++) {
        var current = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
        hex.push((current >>> 4).toString(16));
        hex.push((current & 0xF).toString(16));
    }
    return hex.join("");
}

function isBase64url(str) {
    if (isEmpty(str)) return false;
    let r = base64urlregex.test(str);
    base64urlregex.lastIndex = 0;
    return r;
}

function hexBase64urlEncode(hex) {
    return btoa(hex.match(/\w{2}/g).map(function(a) {
        return String.fromCharCode(parseInt(a, 16));
    }).join("")).replace('+', '-').replace('/', '_').replace(/=+$/, '');
}
String.prototype.padRight = function(n, pad){
    t = this;
    if(n > this.length)
        for(i = 0; i < n-this.length; i++)
            t += pad;
    return t;
}
function hexBase64urlDecode(hex) {
    let data = hex.match(/\w{2}/g).map(function(a) {
        return String.fromCharCode(parseInt(a, 16));
    }).join("").replace(/-/g, '+').replace(/_/g, '/');
    return atob(data.padRight(data.length + (4 - data.length % 4) % 4, '='));
}

function parseVerusProofMsg(proofmsg) {
    let s = proofmsg.split(':');
    return {
        message: (s[0] + ':' + s[1]),
        signature1: s[2],
        signature2: s[3]
    }
}

function getIdentityProfile(identity) {
    // special dev testing case, remove when done...
    if (identity == "vidptest@") {
        $.getJSON(relativePath+"examples/getidentity.json", function(data){
            vrsc_id = data;
            vrsc_id.identity.name = identity.replace('@','');
            if (vrsc_id && vrsc_id.identity && vrsc_id.identity.contentmap){                
                $(".vrsc-system-identity-profile-title").html("Loading VerusID Profile for " + vrsc_id.identity.name + "@");
                vrsc_content = vrsc_id.identity.contentmap;
                getCollectionsProfileFromWeb(relativePath+"examples/vidptest.json");
                
            } else {
                onProfileJsonError("Verus ID "+identity+" does not provide a content map.");
            }
        }).fail(function(){
            console.log("Failed to get identity json response.");
        });
        return;
    }

    $(".vrsc-system-identity-profile-title").html("Looking up VerusID " + identity);
    
    $.getJSON(relativePath+"api/getidentity/"+identity, function(data){
        vrsc_id = data.response;
        if (vrsc_id && vrsc_id.identity && vrsc_id.identity.contentmap){
            $(".vrsc-system-identity-profile-title").html("Loading VerusID Profile for " + vrsc_id.identity.name + "@");
            vrsc_content = vrsc_id.identity.contentmap;
            
            // supported data sources
            // bug work-around ? big endian / little endian reversal
            let arweave = vrsc_content[vdxfids["vrsc::system.collections.arweave"].hash160result];
            if(isEmpty(arweave)) { arweave = vrsc_content[reverseHex(vdxfids["vrsc::system.collections.arweave"].hash160result)]; }
            let web = vrsc_content[vdxfids["vrsc::system.collections.web"].hash160result];
            if(isEmpty(web)) { web = vrsc_content[reverseHex(vdxfids["vrsc::system.collections.web"].hash160result)]; }
            if (!isEmpty(web)) {
                getCollectionsProfileFromWeb(web);
            }
            else if (!isEmpty(arweave)) {
                getCollectionsProfileFromArweave(arweave);
            }
            else {
                onProfileJsonError("Verus ID "+identity+" does not provide a compatible data collection source in contentmap.");
            }
            
        } else {
            onProfileJsonError("Verus ID "+identity+" does not provide a content map.");
        }

    }).fail(function(){
        console.log("Failed to get identity json response.");
    });
}

function onProfileJsonError(errorStr) {
    console.log(errorStr);
    $(".vrsc-system-identity-profile-title").html("Error Loading ...");
    $(".vrsc-system-identity-profile-about").html("<p>"+errorStr+"</p>");
}

function getCollectionsProfileFromArweave(addressHex) {
    if (isHex(addressHex)) {
        let address = hexBase64urlEncode(addressHex);
        if (isBase64url(address)) {
            // find latest transaction with tag "vdxfid": "ver"
            // find latest transaction with tag "iEXZ3nd4K9fmGDSiQ8J6XLATzUUSKp1eAz": "1"
            // ver0: tags: { name: \"vdxfid\", values: [\"iEXZ3nd4K9fmGDSiQ8J6XLATzUUSKp1eAz\"] }
            // ver1: tags: { name: \"iEXZ3nd4K9fmGDSiQ8J6XLATzUUSKp1eAz\", values: [\"1\"] }
            let queryStr = "query {\
                              transactions(\
                                first: 1\
                                sort: HEIGHT_DESC\
                                owners: [\""+address+"\"]\
                                tags: { name: \"iEXZ3nd4K9fmGDSiQ8J6XLATzUUSKp1eAz\", values: [\"1\"] }\
                              ) {\
                                edges {\
                                  node {\
                                    id\
                                    tags {\
                                      name\
                                      value\
                                    }\
                                  }\
                                }\
                              }\
                            }";
            // run graphql query at arweave graphql
            $.ajax({
                url: 'https://arweave.net/graphql',
                type: 'post',
                data: JSON.stringify({"query":queryStr}),
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                dataType: 'json',
                success: function (rsp) {
                    // basic sanity check
                    if (rsp.data && rsp.data.transactions && rsp.data.transactions.edges && rsp.data.transactions.edges[0] && rsp.data.transactions.edges[0].node && rsp.data.transactions.edges[0].node.id ) {
                        // latest profile json transaction id
                        let txid=rsp.data.transactions.edges[0].node.id;
                        if (!isEmpty(txid)) {
                            // get data from arweave transaction
                            arweave.transactions.getData(txid, {decode: true, string: true}).then(data => { 
                                 try {
                                    vrsc_profile = JSON.parse(data);
                                } catch(e) {
                                    vrsc_profile = undefined;
                                }
                                if (vrsc_profile !== undefined) {
                                    vrsc_profile = vrsc_profile[vdxfids["vrsc::system.identity.profile.public"].vdxfid];
                                    if (vrsc_profile !== undefined) {
                                        updateUiOnProfileReceived();
                                    } else {
                                        onProfileJsonError(vdxfids["vrsc::system.identity.profile.public"].vdxfid+" not found in profile json object from arweave txid "+txid);
                                    }
                                } else {
                                    onProfileJsonError("Syntax error in profile json object fetched from arweave txid "+txid);
                                }
                            });
                        } else {
                            onProfileJsonError("Arweave profile transaction id not found.");
                        }
                    } else {
                        onProfileJsonError("Arweave profile transaction id not found.");
                    }
                },
                error: function (request, http, error) {
                    onProfileJsonError("Failed to fetch profile json object from arweave.");
                }
            });
        } else {
            onProfileJsonError("Arweave address provided is not valid base64url.");
        }
    } else {
        onProfileJsonError("Arweave address provided is not valid hex string.");
    }
}

function getCollectionsProfileFromWeb(url) {
    // load profile.json from web url
    $.getJSON(url, function(data){
        vrsc_profile = data[vdxfids["vrsc::system.identity.profile.public"].vdxfid];
        if (vrsc_profile !== undefined) {
            updateUiOnProfileReceived();
        } else {
            onProfileJsonError(vdxfids["vrsc::system.identity.profile.public"].vdxfid+" not found in profile json object.");
        }

    }).fail(function(){
        onProfileJsonError("Failed to fetch profile json object from web.");
    });
}

// ------------------------------------------
// UI "rendering" just an ugly example for testing purposes
// ------------------------------------------

function updateUiOnProfileReceived()
{
    $(".vrsc-system-identity-profile-title").html("<h3>"+vrsc_id.identity.name + "@</h3>");
        
    if (vrsc_profile[vdxfids["vrsc::system.identity.profile.settings"].vdxfid] !== undefined) {
        $(".vrsc-system-identity-profile-settings").css(
            {
                "color": vrsc_profile[vdxfids["vrsc::system.identity.profile.settings"].vdxfid].fontcolor,
                "background-color": vrsc_profile[vdxfids["vrsc::system.identity.profile.settings"].vdxfid].backgroundcolor
            }
        );
    }
    if (vrsc_profile[vdxfids["vrsc::system.identity.profile.background"].vdxfid] !== undefined) {
        $(".vrsc-system-identity-profile-background").css(
            {
                "background-image": "url('"+vrsc_profile[vdxfids["vrsc::system.identity.profile.background"].vdxfid].image+"')"
            }
        );
    }
 
    if (vrsc_profile[vdxfids["vrsc::system.identity.profile.avatar"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.identity.profile.avatar"].vdxfid];
        $(".vrsc-system-identity-profile-avatar").html('<img src="'+o.image+'" alt="'+o.image+'" />');
    }
    if (vrsc_profile[vdxfids["vrsc::system.identity.profile.header"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.identity.profile.header"].vdxfid];
        $(".vrsc-system-identity-profile-header").html('<img src="'+o.image+'" alt="'+o.image+'" />');
    }
    if (vrsc_profile[vdxfids["vrsc::system.identity.profile.image"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.identity.profile.image"].vdxfid];
        $(".vrsc-system-identity-profile-image").html('<img src="'+o.image+'" alt="'+o.image+'" />');
    }
    if (vrsc_profile[vdxfids["vrsc::system.identity.profile.about"].vdxfid] !== undefined) {
        $(".vrsc-system-identity-profile-about").html(markdownconverter.makeHtml(vrsc_profile[vdxfids["vrsc::system.identity.profile.about"].vdxfid].text));
    }
    if (vrsc_profile[vdxfids["vrsc::system.services.website"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.services.website"].vdxfid];
        $(".vrsc-system-services-website").html(render_profile_website(o));
    }
    if (vrsc_profile[vdxfids["vrsc::system.services.accounts.discord"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.services.accounts.discord"].vdxfid];
        $(".vrsc-system-services-accounts-discord").html(render_profile_discord(o));
    }
    if (vrsc_profile[vdxfids["vrsc::system.services.accounts.twitter"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.services.accounts.twitter"].vdxfid];
        $(".vrsc-system-services-accounts-twitter").html(render_profile_twitter(o));
    }
    if (vrsc_profile[vdxfids["vrsc::system.services.accounts.reddit"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.services.accounts.reddit"].vdxfid];
        $(".vrsc-system-services-accounts-reddit").html(render_profile_reddit(o));
    }
    
    if (vrsc_profile[vdxfids["vrsc::system.keys.vrsc.address"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.keys.vrsc.address"].vdxfid];
        $(".vrsc-system-keys-vrsc-address").html(render_keys_vrsc_address($(".vrsc-system-keys-vrsc-address"), o));
    }
    if (vrsc_profile[vdxfids["vrsc::system.keys.eth.address"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.keys.eth.address"].vdxfid];
        $(".vrsc-system-keys-eth-address").html(render_keys_eth_address($(".vrsc-system-keys-eth-address"), o));
    }
    if (vrsc_profile[vdxfids["vrsc::system.keys.btc.address"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.keys.btc.address"].vdxfid];
        $(".vrsc-system-keys-btc-address").html(render_keys_btc_address($(".vrsc-system-keys-btc-address"), o));
    }
    
    if (vrsc_profile[vdxfids["vrsc::system.collections.content"].vdxfid] !== undefined) {
        let html = "";
        if (Array.isArray(vrsc_profile[vdxfids["vrsc::system.collections.content"].vdxfid].content)) {
            html += "<div class=\"vrsc-system-collections-content-wrapper\">";
            if (!isEmpty(vrsc_profile[vdxfids["vrsc::system.collections.content"].vdxfid].displayname)) {
                html += ("<div class=\"vrsc-system-collections-content-displayname\"><h2>"+vrsc_profile[vdxfids["vrsc::system.collections.content"].vdxfid].displayname+"</h2></div>");
            }
            let a = vrsc_profile[vdxfids["vrsc::system.collections.content"].vdxfid].content;            
            for (let i=0; i<a.length; i++) {
                html += renderCollectionContent(a[i]);
            }
            html += "</div>";
        }
        $(".vrsc-system-collections-content").html(html);
    }
}

function renderCollectionContent(a) {
    switch (a.vdxfkey) {
        case vdxfids["vrsc::system.collections.content.reference.arweave"].qualifiedname.name:
        case vdxfids["vrsc::system.collections.content.reference.arweave"].hash160result:
        case vdxfids["vrsc::system.collections.content.reference.arweave"].vdxfid: 
        return render_reference_arweave(a, a.txid, a.displayname);
        
        case vdxfids["vrsc::system.collections.content.reference.web"].qualifiedname.name:
        case vdxfids["vrsc::system.collections.content.reference.web"].hash160result:
        case vdxfids["vrsc::system.collections.content.reference.web"].vdxfid: 
        return render_reference_web(a, a.url, a.displayname);
        
        case vdxfids["vrsc::system.collections.content.arweave.post"].qualifiedname.name:
        case vdxfids["vrsc::system.collections.content.arweave.post"].hash160result:
        case vdxfids["vrsc::system.collections.content.arweave.post"].vdxfid: 
        return render_arweave_post(a, a.txid, a.title, a.date);
        
        case vdxfids["vrsc::system.collections.content.arweave.image"].qualifiedname.name:
        case vdxfids["vrsc::system.collections.content.arweave.image"].hash160result:
        case vdxfids["vrsc::system.collections.content.arweave.image"].vdxfid: 
        return render_arweave_image(a, a.txid, a.alt);
        
        case vdxfids["vrsc::system.collections.content.web.post"].qualifiedname.name:
        case vdxfids["vrsc::system.collections.content.web.post"].hash160result:
        case vdxfids["vrsc::system.collections.content.web.post"].vdxfid: 
        return render_web_post(a, a.url, a.title, a.date);
        
        case vdxfids["vrsc::system.collections.content.web.image"].qualifiedname.name:
        case vdxfids["vrsc::system.collections.content.web.image"].hash160result:
        case vdxfids["vrsc::system.collections.content.web.image"].vdxfid: 
        return render_web_image(a, a.url, a.alt);
        
        case vdxfids["vrsc::system.collections.content.web.text"].qualifiedname.name:
        case vdxfids["vrsc::system.collections.content.web.text"].hash160result:
        case vdxfids["vrsc::system.collections.content.web.text"].vdxfid: 
        return render_web_text(a, a.text);
        
        case vdxfids["vrsc::system.collections.content.web.pre"].qualifiedname.name:
        case vdxfids["vrsc::system.collections.content.web.pre"].hash160result:
        case vdxfids["vrsc::system.collections.content.web.pre"].vdxfid: 
        return render_web_pre(a, a.text);
        
        case vdxfids["vrsc::system.collections.content.web.url"].qualifiedname.name:
        case vdxfids["vrsc::system.collections.content.web.url"].hash160result:
        case vdxfids["vrsc::system.collections.content.web.url"].vdxfid: 
        return render_web_url(a, a.url, a.name);
        
        case vdxfids["vrsc::system.collections.content.web.rss"].qualifiedname.name:
        case vdxfids["vrsc::system.collections.content.web.rss"].hash160result:
        case vdxfids["vrsc::system.collections.content.web.rss"].vdxfid: 
        return render_web_rss(a, a.url, a.name);
    }
    console.log("Content renderer not found for " + a.vdxfkey);
    return "";
}

function buildCollapsableProofBadge(uid, btnHtml, hiddenHtml) {
    let html = '\
    <button id="'+uid+'button" class="btn btn-light p-1 m-1" type="button" data-bs-toggle="collapse" data-bs-target="#'+uid+'" aria-expanded="false" aria-controls="'+uid+'">\
        '+btnHtml+' <span id='+uid+'spinner><i class="fas fa-cog fa-spin"></i></span>\
    </button>\
    <div class="card collapse multi-collapse p-1 m-0 text-left" id="'+uid+'">'+hiddenHtml+'</div>';
    return html;
}

const htmlVerified = '<span style="color: green;"><i class="far fa-check-circle"></i> PASS</span>';
const htmlNotVerified = '<span style="color: red;"><i class="fas fa-exclamation-circle"></i> FAIL</span>';

const htmlSpinnerVerified = '<span style="color: green;"><i class="fas fa-user-check"></i></span>';
const htmlSpinnerNotVerified = '<span style="color: red;"><i class="fas fa-exclamation-triangle"></i></span>';

function render_profile_discord(o) {
    let id = o.accountid;
    if (!isEmpty(id)) {
        let name = id;
        if (!isEmpty(o.accountname)) { name = o.accountname; }
        return '<span class="badge bg-secondary"><i class="fab fa-discord"></i> '+name+'</span>';
    }
    return "";
}

function render_profile_twitter(o) {
    let id = o.accountid;
    if (!isEmpty(id)) {
        let uid = 'u'+CryptoJS.MD5("render_system_services_accounts_twitter"+id);
        let name = id;
        if (!isEmpty(o.accountname)) { name = o.accountname; }
        let proofurl = o[vdxfids["vrsc::system.proofs.controller"].vdxfid];
        if (proofurl) {            
            /* TODO, twitter api is not-public, requires twitter-proxy ..
                     can not scan html url from twitter, data is fetched from api
            // request node.js to download html from url, and scan it for the proof message, verifyit, and respond back with true or false
            verifywebsite(vrsc_id.identity.name+'@', proofurl, function(verified) {
                if (verified === true) {
                    $(".vrsc-system-services-accounts-twitter").html('<a href="https://twitter.com/'+id.replace("@","")+'" target="_blank"><span class="badge bg-secondary"><i class="fab fa-twitter-square"></i> '+name+'</span></a> <i class="fas fa-user-check" style="color: green;"></i>');
                } else {
                    $(".vrsc-system-services-accounts-twitter").html('<a href="https://twitter.com/'+id.replace("@","")+'" target="_blank"><span class="badge bg-secondary"><i class="fab fa-twitter-square"></i> '+name+'</span></a> <i class="fas fa-user-times" style="color: red;"></i>');
                }
            });
            */
            
            setTimeout(() => {
                let verified = false;
                let appendHtml = '<p>';
                appendHtml += 'Signature 1: '+htmlNotVerified+' (unable to check, todo)<br />';
                appendHtml += "</p>";
                
                // udpate spinner
                if (verified) {
                    $("#"+uid+"spinner").html(htmlSpinnerVerified);
                } else {
                    $("#"+uid+"spinner").html(htmlSpinnerNotVerified);
                }
                
                $("#"+uid).prepend(appendHtml);
                
            }, 1000);
            
            return buildCollapsableProofBadge(
                uid,
                '<i class="fab fa-twitter-square"></i> '+name,
                '<a href="https://twitter.com/'+id.replace("@","")+'" target="_blank">Goto Twitter for '+name+'</a>'
            );
        }
    }
    return "";
}

function render_profile_reddit(o) {
    let url = o[vdxfids["vrsc::system.proofs.controller"].vdxfid];
    if (!isEmpty(url)) {
        let uid = 'u'+CryptoJS.MD5("render_system_services_reddit"+url);
        let title = url;
        if (!isEmpty(o.accountid)) { title = o.accountid; }
        // request node.js to download html from url, and scan it for the proof message, verify-it, and respond back with true or false
        verifyreddit(vrsc_id.identity.name+'@', url, function(verified) {
            let appendHtml = '<p>';
            if (verified) {
                appendHtml += 'Signature 1: '+htmlVerified+'<br />';
            } else {
                appendHtml += 'Signature 1: '+htmlNotVerified+'<br />';
            }
            appendHtml += '</p>'
            
            // udpate spinner
            if (verified) {
                $("#"+uid+"spinner").html(htmlSpinnerVerified);
            } else {
                $("#"+uid+"spinner").html(htmlSpinnerNotVerified);
            }
            
            $("#"+uid).prepend(appendHtml);
        });
        return buildCollapsableProofBadge(
            uid,
            '<i class="fab fa-reddit-square"></i> '+title,
            '<a href="'+url+'" target="_blank">Goto Reddit Comment</a>'
        );
    }
    return '';
}

function render_profile_website(o) {
    let url = o[vdxfids["vrsc::system.proofs.controller"].vdxfid];
    if (!isEmpty(url)) {
        let uid = 'u'+CryptoJS.MD5("render_system_services_website"+url);
        let title = url;
        if (!isEmpty(o.name)) { title = o.name; }
        // request node.js to download html from url, and scan it for the proof message, verify-it, and respond back with true or false
        verifywebsite(vrsc_id.identity.name+'@', url, function(verified) {
            let appendHtml = '<p>';
            if (verified) {
                appendHtml += 'Signature 1: '+htmlVerified+'<br />';
            } else {
                appendHtml += 'Signature 1: '+htmlNotVerified+'<br />';
            }
            appendHtml += '</p>'
            
            // udpate spinner
            if (verified) {
                $("#"+uid+"spinner").html(htmlSpinnerVerified);
            } else {
                $("#"+uid+"spinner").html(htmlSpinnerNotVerified);
            }
            
            $("#"+uid).prepend(appendHtml);
        });
        return buildCollapsableProofBadge(
            uid,
            '<i class="fas fa-globe"></i> '+title,
            '<a href="'+url+'" target="_blank">Goto Website</a>'
        );
    }
    return '';
}

function render_keys_vrsc_address(obj, a) {
    if (a.address) {
        let proofmsg = a[vdxfids["vrsc::system.proofs.controller"].vdxfid];
        if (proofmsg) {
            let uid = 'u'+CryptoJS.MD5("render_keys_eth_address"+a.address);
            let proof = parseVerusProofMsg(proofmsg);
            // ask verus daemon to verify the messages and signatures
            verifymessage(vrsc_id.identity.name+'@', proof.signature1, proof.message, function(verified) {
                let appendHtml = '<p>';
                if (verified) {
                    appendHtml += 'Signature 1: '+htmlVerified+'<br />';
                } else {
                    appendHtml += 'Signature 1: '+htmlNotVerified+'<br />';
                }
                verifymessage(a.address, proof.signature2, proof.message, function(verified2) {
                    if (verified2) {
                        appendHtml += 'Signature 2: '+htmlVerified+'<br />';
                    } else {
                        appendHtml += 'Signature 2: '+htmlNotVerified+'<br />';
                    }
                    // udpate spinner
                    if (verified && verified2) {
                        $("#"+uid+"spinner").html(htmlSpinnerVerified);
                    } else {
                        $("#"+uid+"spinner").html(htmlSpinnerNotVerified);
                    }
                    appendHtml += '</p>';
                    $("#"+uid).prepend(appendHtml);
                });
            });
            return buildCollapsableProofBadge(
                uid,
                '<img src="'+relativePath+'vrsc.ico" alt="vrsc"/> '+a.address,
                '<a href="https://explorer.verus.io/address/'+a.address+'" target="_blank">View Address on Verus Explorer</a>'
            );
        }
        return '<span class="badge bg-secondary large"><img src="vrsc.ico" alt="vrsc"/> '+a.address+'</span>';
    }
    return "";
}

function render_keys_eth_address(obj, a) {
    if (a.address) {
        let proofmsg = a[vdxfids["vrsc::system.proofs.controller"].vdxfid];
        if (proofmsg) {
            let uid = 'u'+CryptoJS.MD5("render_keys_eth_address"+a.address);
            let proof = parseVerusProofMsg(proofmsg);
            // ask verus daemon to verify a message
            verifymessage(vrsc_id.identity.name+'@', proof.signature1, proof.message, function(verified) {
                let appendHtml = '<p>';
                if (verified) {
                    appendHtml += 'Signature 1: '+htmlVerified+'<br />';
                } else {
                    appendHtml += 'Signature 1: '+htmlNotVerified+'<br />';
                }
                // partially verified
                if (verified) {
                    // TODO, verify second signature
                    verified = false;
                    appendHtml += 'Signature 2: '+htmlNotVerified+' (unable to check, todo)<br />';
                }                
                appendHtml += '</p>'
                
                // udpate spinner
                if (verified) {
                    $("#"+uid+"spinner").html(htmlSpinnerVerified);
                } else {
                    $("#"+uid+"spinner").html(htmlSpinnerNotVerified);
                }
                
                $("#"+uid).prepend(appendHtml);
            });
            return buildCollapsableProofBadge(
                uid,
                '<i class="fab fa-ethereum fa-lg"></i> '+a.address,
                '<a href="https://etherscan.io/address/'+a.address+'" target="_blank">View Address on Ethereum Explorer</a>'
            );
        }
    }
    return "";
}

function render_keys_btc_address(obj, a) {
    if (a.address) {
        let proofmsg = a[vdxfids["vrsc::system.proofs.controller"].vdxfid];
        if (proofmsg) {
            let uid = 'u'+CryptoJS.MD5("render_keys_btc_address"+a.address);
            let proof = parseVerusProofMsg(proofmsg);
            // ask verus daemon to verify a message
            verifymessage(vrsc_id.identity.name+'@', proof.signature1, proof.message, function(verified) {
                let appendHtml = '<p>';
                if (verified) {
                    appendHtml += 'Signature 1: '+htmlVerified+'<br />';
                } else {
                    appendHtml += 'Signature 1: '+htmlNotVerified+'<br />';
                }
                // partially verified
                if (verified) {
                    // TODO, verify second signature
                    verified = false;
                    appendHtml += 'Signature 2: '+htmlNotVerified+' (unable to check, todo)<br />';
                }                
                appendHtml += '</p>'
                
                // udpate spinner
                if (verified) {
                    $("#"+uid+"spinner").html(htmlSpinnerVerified);
                } else {
                    $("#"+uid+"spinner").html(htmlSpinnerNotVerified);
                }
                
                $("#"+uid).prepend(appendHtml);
            });
            return buildCollapsableProofBadge(
                uid,
                '<i class="fab fa-bitcoin fa-lg"></i> '+a.address,
                '<a href="https://blockstream.info/address/'+a.address+'" target="_blank">View Address on Bitcoin Explorer</a>'
            );
        }
    }
    return "";
}

function render_reference_arweave(o, txid, title) {
    return "";
    //return "<p>"+JSON.stringify(o)+"</p>";
}

function render_reference_web(o, url, title) {
    return "";
    //return "<p>"+JSON.stringify(o)+"</p>";
}

function render_arweave_post(o, txid, title, date) {
    arweave.transactions.getData(txid, {decode: true, string: true}).then(data => {
        $("#postarweave"+date).html(markdownconverter.makeHtml(data));
    });
    return '<div id="postarweave'+date+'" class="mt-2 card card-body">Loading post from arweave ...</div>';
}

function render_arweave_image(o, txid, alt) {
    return '<img class="mt-2 card card-body" src="https://'+arconfig.host+'/'+txid+'" alt="'+alt+'" />';
}

function render_web_post(o, url, title, date) {
    $.ajax({
        url : url,
        dataType: "text",
        success : function (data) {
            let html = markdownconverter.makeHtml(data);
            $('#postweb'+date).html(html);
        },
        error: function (request, http, error) {
            console.log("Failed to load data from " + url);
        }
    });
    return '<div id="postweb'+date+'" class="mt-2 card card-body">Loading post from web...</div>';
}

function render_web_image(o, url, alt) {
    return '<img class="mt-2 card card-body" src="'+url+'" alt="'+alt+'" />';
}

function render_web_text(o, txt) {
    return '<p class="mt-2">'+txt+'</p>';
}

function render_web_pre(o, txt) {
    return '<pre class="mt-2">'+txt+'</pre>';
}

function render_web_url(o, url, title) {
    return '<a class="mt-2" href="'+url+'" target="_blank">'+title+'</a><br />';
}
function render_web_rss(o, url, title) {
    return '<a class="mt-2" href="'+url+'" target="_blank">'+title+'</a><br />';
}

function verifymessage(address, signature, message, answer) {
    let data = {
        "address": address,
        "signature": signature,
        "message": message
    }
    $.ajax({
        url: relativePath+'api/verifymessage',
        type: 'post',
        data: JSON.stringify(data),
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        dataType: 'json',
        success: function (rsp) {
            answer(rsp.response === true);
        },
        error: function (request, http, error) {
            answer(false);
        }
    });
}
function verifyreddit(address, url, answer) {
    let data = {
        "address": address,
        "website": url,
    }
    $.ajax({
        url: relativePath+'api/verifyreddit',
        type: 'post',
        data: JSON.stringify(data),
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        dataType: 'json',
        success: function (rsp) {
            answer(rsp.response === true);
        },
        error: function (request, http, error) {
            answer(false);
        }
    });
}
function verifywebsite(address, url, answer) {
    let data = {
        "address": address,
        "website": url,
    }
    $.ajax({
        url: relativePath+'api/verifywebsite',
        type: 'post',
        data: JSON.stringify(data),
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        dataType: 'json',
        success: function (rsp) {
            answer(rsp.response === true);
        },
        error: function (request, http, error) {
            answer(false);
        }
    });
}


// ------------------------------------------
// The browser begins execution here
// ------------------------------------------
$( document ).ready(function() {
    let idlookup="vidptest@";
    let path = "";
    let current_url = $(location).attr("href");
    if (!isEmpty(current_url)) {
        // https://luckpool.net/profile/identity/testid@
        // match the last /testid@  for id lookup        
        if (current_url.indexOf("identity/") > 0) {
            relativePath="../";
            idlookup = current_url.substr(current_url.indexOf("identity/")+9);
        }
    }
    // load known vdxfids then load profile for identity
    $.getJSON(relativePath+"vdxfids.json", function(data){
        vdxfids = data;
        getIdentityProfile(idlookup);

    }).fail(function(){
        onProfileJsonError("Internal server error ...");
        console.log("Unable to load known vdxfids.json");
    });
});
