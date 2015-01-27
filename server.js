/**
 * A basic DNS server
 *
 * NOTE: Just to be clear: DO NOT RUN THIS ON AN INTERNET-FACING PORT! This
 *       code is shit and may not even run at all. You have been warned.
 *
 * @author Kristoffer Rødsdalen Hagen <kristoffer.r.hagen@gmail.com>
 */

var sys = require('sys');
var Buffer = require('buffer').Buffer;
var dgram = require('dgram');

var lib = require('./lib');

host = 'localhost';
port = 53;

var server = dgram.createSocket('udp4');

server.on('message', function (msg, rinfo) {
    // Split up the message into the dns request header info and the query
    var q = processRequest(msg);

    buf = createResponse(q);
    server.send(buf, 0, buf.length, rinfo.port, rinfo.address, function (err, sent) {});
});

// Takes a buffer as a request
var processRequest = function(req) {
    var test = {};
    var msg = req;

    test.header = {};
    test.question = {};

    test.header.id      = msg.slice( 0, 15);
    test.header.qr      = msg.slice(16, 16);
    test.header.opcode  = msg.slice(17, 16);
    test.header.aa      = msg.slice(21, 16);
    test.header.tc      = msg.slice(22, 16);
    test.header.rd      = msg.slice(23, 16);
    test.header.ra      = msg.slice(24, 16);
    test.header.z       = msg.slice(25, 16);
    test.header.rcode   = msg.slice(28, 16);
    test.header.qdcount = msg.slice(32, 16);
    test.header.ancount = msg.slice(48, 16);
    test.header.nscount = msg.slice(64, 16);
    test.header.arcount = msg.slice(80, 16);
    test.header.qname   = msg.slice(96, 16);
    test.header.qtype   = msg.slice(msg.len * 8 - 32, msg.len * 8 - 17);
    test.header.qclass  = msg.slice(msg.len * 8 - 16, msg.len * 8);

    console.log(test);

    // See rfc1035 for more details
    // http://tools.ietf.org/html/rfc1035#section-4.1.1

    var query = {};
    query.header = {};
    // TODO: Write code to break questions up into an array
    query.question = {};

    var tmpSlice;
    var tmpByte;

    //transaction id
    // 2 bytes
    query.header.id = req.slice(0,2);

    //slice out a byte for the next section to dice into binary.
    tmpSlice = req.slice(2,3);
    //convert the binary buf into a string and then pull the char code
    //for the byte
    tmpByte = tmpSlice.toString('binary', 0, 1).charCodeAt(0);

    //qr
    // 1 bit
    query.header.qr = lib.sliceBits(tmpByte, 0,1);
    //opcode
    // 0 = standard, 1 = inverse, 2 = server status, 3-15 reserved
    // 4 bits
    query.header.opcode = lib.sliceBits(tmpByte, 1,4);
    //authorative answer
    // 1 bit
    query.header.aa = lib.sliceBits(tmpByte, 5,1);
    //truncated
    // 1 bit
    query.header.tc = lib.sliceBits(tmpByte, 6,1);
    //recursion desired
    // 1 bit
    query.header.rd = lib.sliceBits(tmpByte, 7,1);

    //slice out a byte to dice into binary
    tmpSlice = req.slice(3,4);
    //convert the binary buf into a string and then pull the char code
    //for the byte
    tmpByte = tmpSlice.toString('binary', 0, 1).charCodeAt(0);

    //recursion available
    // 1 bit
    query.header.ra = lib.sliceBits(tmpByte, 0,1);

    //reserved 3 bits
    // rfc says always 0
    query.header.z = lib.sliceBits(tmpByte, 1,3);

    //response code
    // 0 = no error, 1 = format error, 2 = server failure
    // 3 = name error, 4 = not implemented, 5 = refused
    // 6-15 reserved
    // 4 bits
    query.header.rcode = lib.sliceBits(tmpByte, 4,4);

    //question count
    // 2 bytes
    query.header.qdcount = req.slice(4,6);
    //answer count
    // 2 bytes
    query.header.ancount = req.slice(6,8);
    //ns count
    // 2 bytes
    query.header.nscount = req.slice(8,10);
    //addition resources count
    // 2 bytes
    query.header.arcount = req.slice(10, 12);

    //assuming one question
    //qname is the sequence of domain labels
    //qname length is not fixed however it is 4
    //octets from the end of the buffer
    query.question.qname = req.slice(12, req.length - 4);
    //qtype
    query.question.qtype = req.slice(req.length - 4, req.length - 2);
    //qclass
    query.question.qclass = req.slice(req.length - 2, req.length);

    return query;
};

var createResponse = function(query) {

    /*
    * Step 1: find record associated with query
    */
    var results = findRecords(query.question.qname, 1);

    /*
    * Step 2: construct response object
    */

    var response = {};
    response.header = {};

    //1 byte
    response.header.id = query.header.id; //same as query id

    //combined 1 byte
    response.header.qr = 1; //this is a response
    response.header.opcode = 0; //standard for now TODO: add other types 4-bit!
    response.header.aa = 0; //authority... TODO this should be modal
    response.header.tc = 0; //truncation
    response.header.rd = 1; //recursion asked for

    //combined 1 byte
    response.header.ra = 0; //no rescursion here TODO
    response.header.z = 0; // spec says this MUST always be 0. 3bit
    response.header.rcode = 0; //TODO add error codes 4 bit.

    //1 byte
    response.header.qdcount = 1; //1 question
    //1 byte
    response.header.ancount = results.length; //number of rrs returned from query
    //1 byte
    response.header.nscount = 0;
    //1 byte
    response.header.arcount = 0;

    response.question = {};
    response.question.qname = query.question.qname;
    response.question.qtype = query.question.qtype;
    response.question.qclass = query.question.qclass;

    response.rr = results;

    /*
    * Step 3 Render response into output buffer
    */
    var buf = lib.buildResponseBuffer(response);

    /*
    * Step 4 Return buffer
    */
    return buf;
};

var findRecords = function(qname, qtype, qclass) {

    // Assuming we are always going to get internet
    // requests, but adding basic qclass support
    // for completeness
    // TODO: Replace throws with error responses
    if (qclass === undefined || qclass === 1) {
        qclass = 'in';
    } else {
        throw new Error('Only internet class records supported');
    }

    switch(qtype) {
        case 1:
            qtype = 'a'; //a host address
            break;
        case 2:
            qtype = 'ns'; //an authoritative name server
            break;
        case 3:
            qtype = 'md'; //a mail destination (Obsolete - use MX)
            break;
        case 4:
            qtype = 'mf'; //a mail forwarder (Obsolete - use MX)
            break;
        case 5:
            qtype = 'cname'; //the canonical name for an alias
            break;
        case 6:
            qtype = 'soa'; //marks the start of a zone of authority
            break;
        case 7:
            qtype = 'mb'; //a mailbox domain name (EXPERIMENTAL)
            break;
        case 8:
            qtype = 'mg'; //a mail group member (EXPERIMENTAL)
            break;
        case 9:
            qtype = 'mr'; //a mail rename domain name (EXPERIMENTAL)
            break;
        case 10:
            qtype = 'null'; //a null RR (EXPERIMENTAL)
            break;
        case 11:
            qtype = 'wks'; //a well known service description
            break;
        case 12:
            qtype = 'ptr'; //a domain name pointer
            break;
        case 13:
            qtype = 'hinfo'; //host information
            break;
        case 14:
            qtype = 'minfo'; //mailbox or mail list information
            break;
        case 15:
            qtype = 'mx'; //mail exchange
            break;
        case 16:
            qtype = 'txt'; //text strings
            break;
        case 255:
            qtype = '*'; //select all types
            break;
        default:
            throw new Error('No valid type specified');
            break;
    }

    var domain = lib.qnameToDomain(qname);

    // TODO: Add support for wildcard
    if (qtype === '*') {
        throw new Error('Wildcard not supported');
    } else {
        var rr = records[domain][qclass][qtype];
    }

    return rr;
};

server.addListener('error', function (e) {
    throw e;
});


//
// TODO: Create records database

records = {};
records['kristofferhagen.net'] = {};
records['kristofferhagen.net']['in'] = {};
records['kristofferhagen.net']['in']['a'] = [];

var r = {};
r.qname = lib.domainToQname('kristofferhagen.net');
r.qtype = 1;
r.qclass = 1;
r.ttl = 1;
r.rdlength = 4;
r.rdata = 0xBCE2D41C;
records['kristofferhagen.net']['in']['a'].push(r);

server.bind(port, host);
console.log('Started server on ' + host + ':' + port);
