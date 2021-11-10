const arconfig = {
    host: 'arweave.net',// Hostname or IP address for a Arweave host
    port: 443,          // Port
    protocol: 'https',  // Network protocol http or https
};
const arweave = Arweave.init(arconfig);
const markdownconverter = new showdown.Converter();

// https://docs.linkpool.io/docs/public_rpc
const web3 = new Web3(Web3.givenProvider || 'https://main-light.eth.linkpool.io/');

const hexCharsregex = /[0-9A-Fa-f]{6}/g;
const base64urlregex = /^[A-Za-z0-9_\-]+$/;

const htmlVerified = '<span style="color: green;"><i class="far fa-check-circle"></i> PASS</span>';
const htmlNotVerified = '<span style="color: red;"><i class="fas fa-exclamation-circle"></i> FAIL</span>';

const htmlSpinnerVerified = '<span style="color: green;"><i class="fas fa-user-check"></i></span>';
const htmlSpinnerNotVerified = '<span style="color: red;"><i class="fas fa-exclamation-triangle"></i></span>';


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

function isBase64url(str) {
    if (isEmpty(str)) return false;
    let r = base64urlregex.test(str);
    base64urlregex.lastIndex = 0;
    return r;
}

function hexBase64urlEncode(hex) {
    const hexDecoded = CryptoJS.enc.Hex.parse(hex);
    const base64 = CryptoJS.enc.Base64.stringify(hexDecoded);
    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+/g,'');
    return base64url;
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

    if (!identity.endsWith('@')) {
        identity = identity + '@';
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
                onProfileJsonError("Verus ID "+identity+" does not provide a compatible data storage source in identity.contentmap." + render_identity_details(), "Missing Profile");
            }
            
        } else {
            onProfileJsonError("Verus ID "+identity+" does not exist.", "Not Found");
        }

    }).fail(function(){
        onProfileJsonError("API call failed unexpectedly.");
    });
}

function render_identity_details() {
    return "<pre>"+JSON.stringify(vrsc_id,null,2)+"</pre>";
}

function onProfileJsonError(errorStr, title) {
    console.log(errorStr);
    $(".vrsc-system-identity-profile-title").html((!title?"<h3>Error</h3>":"<h3>"+title+"</h3>"));
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
                                tags: { name: \""+vdxfids["vrsc::system.identity.profile.public"].vdxfid+"\", values: [\"1\"] }\
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
                                        onProfileJsonError(vdxfids["vrsc::system.identity.profile.public"].vdxfid+" not found in profile object from ArWeave txid "+txid);
                                    }
                                } else {
                                    onProfileJsonError("Syntax error in object fetched from ArWeave transaction "+txid);
                                }
                            });
                        } else {
                            onProfileJsonError("ArWeave transaction not found for "+address);
                        }
                    } else {
                        onProfileJsonError("ArWeave transaction not found for "+address);
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
        if (vrsc_profile[vdxfids["vrsc::system.identity.profile.settings"].vdxfid].bootstrap_template != undefined) {
            $("#bootstrap_template").attr("href", vrsc_profile[vdxfids["vrsc::system.identity.profile.settings"].vdxfid].bootstrap_template);
        }
        /*
        $(".vrsc-system-identity-profile-settings").css(
            {
                "color": vrsc_profile[vdxfids["vrsc::system.identity.profile.settings"].vdxfid].fontcolor,
                "background-color": vrsc_profile[vdxfids["vrsc::system.identity.profile.settings"].vdxfid].backgroundcolor
            }
        );
        */
    }
    if (vrsc_profile[vdxfids["vrsc::system.identity.profile.background"].vdxfid] !== undefined) {
        $(".vrsc-system-identity-profile-background").css(
            {
                "background-image": "url('"+vrsc_profile[vdxfids["vrsc::system.identity.profile.background"].vdxfid].image+"')"
            }
        );
    }
 
 
    if (vrsc_profile[vdxfids["vrsc::system.identity.profile.header"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.identity.profile.header"].vdxfid];
        $(".vrsc-system-identity-profile-header").html('<img src="'+o.image+'" alt="'+o.image+'" />');
    }
    if (vrsc_profile[vdxfids["vrsc::system.identity.profile.image"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.identity.profile.image"].vdxfid];
        $(".vrsc-system-identity-profile-image").html('<img src="'+o.image+'" alt="'+o.image+'" />');
    }
    if (vrsc_profile[vdxfids["vrsc::system.identity.profile.avatar"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.identity.profile.avatar"].vdxfid];
        $(".vrsc-system-identity-profile-avatar").html('<img src="'+o.image+'" alt="'+o.image+'" />');
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
    if (vrsc_profile[vdxfids["vrsc::system.services.accounts.linkedin"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.services.accounts.linkedin"].vdxfid];
        $(".vrsc-system-services-accounts-linkedin").html(render_profile_linkedin(o));
    }
    if (vrsc_profile[vdxfids["vrsc::system.services.accounts.facebook"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.services.accounts.facebook"].vdxfid];
        $(".vrsc-system-services-accounts-facebook").html(render_profile_facebook(o));
    }
    if (vrsc_profile[vdxfids["vrsc::system.services.accounts.github"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.services.accounts.github"].vdxfid];
        $(".vrsc-system-services-accounts-github").html(render_profile_github(o));
    }
    if (vrsc_profile[vdxfids["vrsc::system.services.accounts.twitter"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.services.accounts.twitter"].vdxfid];
        $(".vrsc-system-services-accounts-twitter").html(render_profile_twitter(o));
    }
    if (vrsc_profile[vdxfids["vrsc::system.services.accounts.reddit"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.services.accounts.reddit"].vdxfid];
        $(".vrsc-system-services-accounts-reddit").html(render_profile_reddit(o));
    }
    
    
    if (vrsc_profile[vdxfids["vrsc::system.keys.vrsc.identity"].vdxfid] !== undefined) {
        let o = vrsc_profile[vdxfids["vrsc::system.keys.vrsc.identity"].vdxfid];
        $(".vrsc-system-keys-vrsc-identity").html(render_keys_vrsc_identity($(".vrsc-system-keys-vrsc-identity"), o));
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
    <button id="'+uid+'button" class="btn btn-light m-1" type="button" data-bs-toggle="collapse" data-bs-target="#'+uid+'" aria-expanded="false" aria-controls="'+uid+'">\
        '+btnHtml+' <span id="'+uid+'spinner" style="color:darkkhaki;"><i class="fas fa-unlock-alt"></i> <i class="fas fa-cog fa-spin"></i></span>\
    </button>\
    <div class="card collapse multi-collapse text-left m-1 p-2" style="max-width: 30rem;" id="'+uid+'">'+hiddenHtml+'</div>';
    return html;
}

function domain_from_url(url) {
    let result;
    let match;
    if (match = url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n\?\=]+)/im)) {
        result = match[1];
        if (match = result.match(/^[^\.]+\.(.+\..+)$/)) {
            result = match[1];
        }
    }
    return result.toLowerCase();
}

function check_domain(valid, domain) {
    if (domain != valid) {
        return 'Untrusted domain in proof. Expected '+valid+' got '+domain+' ';
    }
    return true;
}

function render_profile_discord(o) {
    // TODO, discord api proxy ??? ...
    return '';
}

function render_profile_twitter(o) {
    // TODO, twitter api proxy ??? ...
    return '';
}

function render_profile_facebook(o) {
    // TODO, facebook api proxy ??? ...
    return '';
}

function render_profile_github(o) {
    let url = o[vdxfids["vrsc::system.proofs.controller"].vdxfid];
    let domain = domain_from_url(url);
    if (!isEmpty(url)) {
        let uid = 'u'+CryptoJS.MD5("render_system_services_github"+url);
        let title = url;
        if (!isEmpty(o.accountid)) { title = o.accountid; }
        if (!isEmpty(o.accountname)) { title = o.accountname; }
        let domainCheck = check_domain('github.com', domain);
        // request node.js to download html from url, and scan it for the proof message, verify-it, and respond back with true or false
        verifywebsite(vrsc_id.identity.name+'@', (domainCheck===true?url:undefined), function(verified) {
            let appendHtml = '<p><i class="fas fa-key"></i> Signature:';  
            if (domainCheck !== true) {
                verified = false;
                appendHtml += domainCheck;
            }
            if (verified) {
                appendHtml += htmlVerified+'<br />';
            } else {
                appendHtml += htmlNotVerified+'<br />';
            }
            appendHtml += '</p>';
            
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
            '<i class="fab fa-github-square"></i> '+title+' ('+domain+')',
            '<a href="'+url+'" target="_blank"><i class="fas fa-link"></i> View Proof on GitHub</a>'
        );
    }
    return '';
}

function render_profile_linkedin(o) {
    let url = o[vdxfids["vrsc::system.proofs.controller"].vdxfid];
    let domain = domain_from_url(url);
    if (!isEmpty(url)) {
        let uid = 'u'+CryptoJS.MD5("render_system_services_linkedin"+url);
        let title = url;
        if (!isEmpty(o.accountid)) { title = o.accountid; }
        if (!isEmpty(o.accountname)) { title = o.accountname; }
        let domainCheck = check_domain('linkedin.com', domain);
        // request node.js to download html from url, and scan it for the proof message, verify-it, and respond back with true or false
        verifywebsite(vrsc_id.identity.name+'@', (domainCheck===true?url:undefined), function(verified) {
            let appendHtml = '<p><i class="fas fa-key"></i> Signature:';
            if (domainCheck !== true) {
                verified = false;
                appendHtml += domainCheck;
            }
            if (verified) {
                appendHtml += htmlVerified+'<br />';
            } else {
                appendHtml += htmlNotVerified+'<br />';
            }
            appendHtml += '</p>';
            
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
            '<i class="fab fa-linkedin"></i> '+title+' ('+domain+')',
            '<a href="'+url+'" target="_blank"><i class="fas fa-link"></i> View Proof on LinkedIn</a>'
        );
    }
    return '';
}

function render_profile_reddit(o) {
    let url = o[vdxfids["vrsc::system.proofs.controller"].vdxfid];
    let domain = domain_from_url(url);
    if (!isEmpty(url)) {
        let uid = 'u'+CryptoJS.MD5("render_system_services_reddit"+url);
        let title = url;
        if (!isEmpty(o.accountid)) { title = o.accountid; }
        if (!isEmpty(o.accountname)) { title = o.accountname; }
        let domainCheck = check_domain('reddit.com', domain);
        // request node.js to download html from url, and scan it for the proof message, verify-it, and respond back with true or false
        verifywebsite(vrsc_id.identity.name+'@', (domainCheck===true?url:undefined), function(verified) {
            let appendHtml = '<p><i class="fas fa-key"></i> Signature:';
            if (domainCheck !== true) {
                verified = false;
                appendHtml += domainCheck;
            }
            if (verified) {
                appendHtml += htmlVerified+'<br />';
            } else {
                appendHtml += htmlNotVerified+'<br />';
            }
            appendHtml += '</p>';
            
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
            '<i class="fab fa-reddit-square"></i> '+title+' ('+domain+')',
            '<a href="'+url+'" target="_blank"><i class="fas fa-link"></i> View Proof on Reddit</a>'
        );
    }
    return '';
}

function render_profile_website(o) {
    let url = o[vdxfids["vrsc::system.proofs.controller"].vdxfid];
    let domain = domain_from_url(url);
    if (!isEmpty(url)) {
        let uid = 'u'+CryptoJS.MD5("render_system_services_website"+url);
        let title = url;
        if (!isEmpty(o.name)) { title = o.name; }
        // request node.js to download html from url, and scan it for the proof message, verify-it, and respond back with true or false
        verifywebsite(vrsc_id.identity.name+'@', url, function(verified) {
            let appendHtml = '<p><i class="fas fa-key"></i> Signature:';
            if (verified) {
                appendHtml += htmlVerified+'<br />';
            } else {
                appendHtml += htmlNotVerified+'<br />';
            }
            appendHtml += '</p>';
            
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
            '<i class="fas fa-globe"></i> '+title+' ('+domain+')',
            '<a href="'+url+'" target="_blank"><i class="fas fa-link"></i> Goto Website</a>'
        );
    }
    return '';
}

function render_keys_vrsc_address(obj, a) {
    if (a.address) {
        let proofmsg = a[vdxfids["vrsc::system.proofs.controller"].vdxfid];
        if (proofmsg) {
            let uid = 'u'+CryptoJS.MD5("render_keys_vrsc_address"+a.address);
            let proof = parseVerusProofMsg(proofmsg);
            // ask verus daemon to verify the messages and signatures
            verifymessage(vrsc_id.identity.name+'@', proof.signature1, proof.message, function(verified) {
                let appendHtml = '<p><i class="fas fa-key"></i> Signature 1:';
                if (verified) {
                    appendHtml += htmlVerified+'<br />';
                } else {
                    appendHtml += htmlNotVerified+'<br />';
                }
                verifymessage(a.address, proof.signature2, proof.message+':'+proof.signature1, function(verified2) {
                    appendHtml += '<i class="fas fa-key"></i> Signature 2:';
                    if (verified2) {
                        appendHtml += htmlVerified+'<br />';
                    } else {
                        appendHtml += htmlNotVerified+'<br />';
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
                '<a href="https://explorer.verus.io/address/'+a.address+'" target="_blank"><i class="fas fa-link"></i> View Address on Verus Explorer</a>'
            );
        }
        return '<span class="badge bg-secondary large"><img src="vrsc.ico" alt="vrsc"/> '+a.address+'</span>';
    }
    return "";
}

function render_keys_vrsc_identity(obj, a) {
    if (a.address) {
        let proofmsg = a[vdxfids["vrsc::system.proofs.controller"].vdxfid];
        if (proofmsg) {
            let uid = 'u'+CryptoJS.MD5("render_keys_vrsc_identity"+a.address);
            let proof = parseVerusProofMsg(proofmsg);
            // ask verus daemon to verify the messages and signatures
            verifymessage(vrsc_id.identity.name+'@', proof.signature1, proof.message, function(verified) {
                let appendHtml = '<p><i class="fas fa-key"></i> Signature 1:';
                if (verified) {
                    appendHtml += htmlVerified+'<br />';
                } else {
                    appendHtml += htmlNotVerified+'<br />';
                }
                verifymessage(a.address, proof.signature2, (proof.message+':'+proof.signature1), function(verified2) {
                    appendHtml += '<i class="fas fa-key"></i> Signature 2:';
                    if (verified2) {
                        appendHtml += htmlVerified+'<br />';
                    } else {
                        appendHtml += htmlNotVerified+'<br />';
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
                '<a href="'+a.address+'" target="_blank"><i class="fas fa-link"></i> View VerusID</a>'
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
                let appendHtml = '<p><i class="fas fa-key"></i> Signature 1:';
                if (verified) {
                    appendHtml += htmlVerified+'<br />';
                } else {
                    appendHtml += htmlNotVerified+'<br />';
                }
                let signer = undefined;
                if (web3) {
                    try {
                        signer = web3.eth.accounts.recover((proof.message+':'+proof.signature1), proof.signature2);
                    } catch {
                        signer = undefined;
                    }
                }
                let verified2 = (signer == a.address);
                appendHtml += '<i class="fas fa-key"></i> Signature 2:';
                if (verified2) {
                    appendHtml += htmlVerified+'<br />';
                } else {
                    appendHtml += htmlNotVerified+'<br />';
                }
                appendHtml += '</p>'
                
                // udpate spinner
                if (verified && verified2) {
                    $("#"+uid+"spinner").html(htmlSpinnerVerified);
                } else {
                    $("#"+uid+"spinner").html(htmlSpinnerNotVerified);
                }
                $("#"+uid).prepend(appendHtml);
            });
            return buildCollapsableProofBadge(
                uid,
                '<i class="fab fa-ethereum fa-lg"></i> '+a.address,
                '<a href="https://etherscan.io/address/'+a.address+'" target="_blank"><i class="fas fa-link"></i> View Address on Ethereum Explorer</a>'
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
                let appendHtml = '<p><i class="fas fa-key"></i> Signature 1:';
                if (verified) {
                    appendHtml += htmlVerified+'<br />';
                } else {
                    appendHtml += htmlNotVerified+'<br />';
                }
                let verified2 = false;
                if (bitcoinjs) {
                    try {
                        verified2 = bitcoinjs.message.verify((proof.message+':'+proof.signature1), a.address, proof.signature2, null, true);
                    } catch {
                        verified2 = false;
                    }
                    appendHtml += '<i class="fas fa-key"></i> Signature 2:';
                    if (verified2) {
                        appendHtml += htmlVerified+'<br />';
                    } else {
                        appendHtml += htmlNotVerified+'<br />';
                    }
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
            return buildCollapsableProofBadge(
                uid,
                '<i class="fab fa-bitcoin fa-lg"></i> '+a.address,
                '<a href="https://blockstream.info/address/'+a.address+'" target="_blank"><i class="fas fa-link"></i> View Address on Bitcoin Explorer</a>'
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

function verifywebsite(address, url, answer) {
    if (url && url.length > 0) {
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
    } else {
        setTimeout(()=>{ answer(false); }, 500);
    }
}


// ------------------------------------------
// The browser begins execution here
// ------------------------------------------
$( document ).ready(function() {
    let idlookup="mike@";
    let path = "";
    let current_url = $(location).attr("href");
    if (!isEmpty(current_url)) {
        if (current_url.indexOf("identity/") > 0) {
            relativePath="../";
            idlookup = decodeURIComponent(current_url.substr(current_url.indexOf("identity/")+9));
        }
    }
    // load known vdxfids then load profile for identity
    $.getJSON(relativePath+"vdxfids.json", function(data){
        vdxfids = data;
        getIdentityProfile(idlookup);

    }).fail(function(){
        onProfileJsonError("Failed to load vdxfids.json ...");
    });
});
