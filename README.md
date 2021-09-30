# vrsc_proofs_viewer
A very experimental VerusID proofs viewer

    git clone https://github.com/hellcatz/vrsc_proofs_viewer
    cd vrsc_proofs_viewer
    npm install

Modify and rename example_config.json to config.json

    node index.js

# Setup your VerusID
ArWeave is being used as a decentralized perma web source for proof profiles.

### Get ArWeave address and update VerusID content map

  Convert ArWeave address to hex (base64urldecode)
    https://cryptii.com/pipes/base64-to-hex
  
    aNg4z2GwlYoIbNSkbh5GI3GAEhLO4faH7mh8cBsJYJo
  
    68d838cf61b0958a086cd4a46e1e462371801212cee1f687ee687c701b09609a
    
### Update VerusID Content Map

    ./verus updateidentity '{"name":"vidptest","contentmap":{"cf19fddae8aa266c8d0d4807196681666cfd4562":"68d838cf61b0958a086cd4a46e1e462371801212cee1f687ee687c701b09609a"}}'

### Upload proofs_profile.json to ArWeave
When uploading to Arweave, you must tag the file with a special vdxfkey tag.

     arkb deploy ./proofs_profile.json --tag-name iEXZ3nd4K9fmGDSiQ8J6XLATzUUSKp1eAz --tag-value 1

