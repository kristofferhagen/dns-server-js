var lib = exports;

// slices a single byte into bits
// assuming only single bytes
lib.sliceBits = function(b, off, len) {
    var s = 7 - (off + len - 1);

    b = b >>> s;
    return b & ~(0xff << len);
};

lib.domainToQname = function(domain) {
    var tokens = domain.split(".");
    len = domain.length + 2;
    var qname = new Buffer(len);
    var offset = 0;
    for(var i=0; i<tokens.length;i++) {
        qname[offset]=tokens[i].length;
        offset++;
        for(var j=0;j<tokens[i].length;j++) {
            qname[offset] = tokens[i].charCodeAt(j);
            offset++;
        }
    }
    qname[offset] = 0;

    return qname;
};

lib.getZeroBuf = function(len) {
    buf = new Buffer(len);
    for(var i=0;i<buf.length;i++) { buf[i]=0;}
    return buf;
};

lib.buildResponseBuffer = function(response) {
    //calculate len in octets
    //NB not calculating rr this is done later
    //headers(12) + qname(qname + 2 + 2)
    //e.g. 16 + 2 * qname;
    //qnames are Buffers so length is already in octs
    var qnameLen = response.question.qname.length;
    var len = 16 + qnameLen;
    var buf = lib.getZeroBuf(len);

    response.header.id.copy(buf, 0, 0, 2);

    buf[2] = 0x00 | response.header.qr << 7 | response.header.opcode << 3 | response.header.aa << 2 | response.header.tc << 1 | response.header.rd;


    buf[3] = 0x00 | response.header.ra << 7 | response.header.z << 4 | response.header.rcode;

    lib.numToBuffer(buf, 4, response.header.qdcount, 2);

    lib.numToBuffer(buf, 6, response.header.ancount, 2);
    lib.numToBuffer(buf, 8, response.header.nscount, 2);
    lib.numToBuffer(buf, 10, response.header.arcount, 2);

    //end header

    response.question.qname.copy(buf, 12, 0, qnameLen);
    response.question.qtype.copy(buf, 12+qnameLen, 0, 2);
    response.question.qclass.copy(buf, 12+qnameLen+2, 0, 2);

    var rrStart = 12+qnameLen+4;

    for (var i=0;i<response.rr.length;i++) {
        //TODO figure out if this is actually cheaper than just iterating
        //over the rr section up front and counting before creating buf
        //
        //create a new buffer to hold the request plus the rr
        //len of each response is 14 bytes of stuff + qname len
        var tmpBuf = lib.getZeroBuf(buf.length + response.rr[i].qname.length + 14);

        buf.copy(tmpBuf, 0, 0, buf.length);

        response.rr[i].qname.copy(tmpBuf, rrStart, 0, response.rr[i].qname.length);
        lib.numToBuffer(tmpBuf, rrStart+response.rr[i].qname.length, response.rr[i].qtype, 2);
        lib.numToBuffer(tmpBuf, rrStart+response.rr[i].qname.length+2, response.rr[i].qclass, 2);

        lib.numToBuffer(tmpBuf, rrStart+response.rr[i].qname.length+4, response.rr[i].ttl, 4);
        lib.numToBuffer(tmpBuf, rrStart+response.rr[i].qname.length+8, response.rr[i].rdlength, 2);
        lib.numToBuffer(tmpBuf, rrStart+response.rr[i].qname.length+10, response.rr[i].rdata, response.rr[i].rdlength); // rdlength indicates rdata length

        rrStart = rrStart + response.rr[i].qname.length + 14;

        buf = tmpBuf;
    }

    //TODO compression

    return buf;
};

//take a number and make sure it's written to the buffer as
//the correct length of bytes with leading 0 padding where necessary
// takes buffer, offset, number, length in bytes to insert
lib.numToBuffer = function(buf, offset, num, len, debug) {
    if (typeof num != 'number') {
        throw new Error('Num must be a number');
    }

    for (var i=offset;i<offset+len;i++) {

            var shift = 8*((len - 1) - (i - offset));

            var insert = (num >> shift) & 255;

            buf[i] = insert;
    }

    return buf;
};

lib.qnameToDomain = function(qname) {
    var domain= '';
    for(var i=0;i<qname.length;i++) {
        if (qname[i] == 0) {
            //last char chop trailing .
            domain = domain.substring(0, domain.length - 1);
            break;
        }

        var tmpBuf = qname.slice(i+1, i+qname[i]+1);
        domain += tmpBuf.toString('binary', 0, tmpBuf.length);
        domain += '.';

        i = i + qname[i];
    }

    return domain;
};
