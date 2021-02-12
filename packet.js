var zeroBuffer = new Buffer('00', 'hex');

module.exports = packet = {
    //params: an array of javascript objects to be turned into buffers
    build: function(params){

        var packetParts = [];
        var packetSize = 0;
        var safe = true;

        params.forEach(function(param){
          var buffer;

          if (typeof param === 'string'){
              buffer = new Buffer(param, 'utf8');
              buffer = Buffer.concat([buffer, zeroBuffer], buffer.length + 1);

          }
          else if (typeof param === 'number'){
              buffer = new Buffer(2);
              buffer.writeUInt16LE(param, 0);
          }
          else{
              console.log("Unknown data type!");
              safe = false;
          }
          if (safe === true) {
              packetSize += buffer.length;
              packetParts.push(buffer);
          }
        })
        if (safe === true) {
            var dataBuffer = Buffer.concat(packetParts, packetSize);
            var size = new Buffer(1);
            if (dataBuffer.length < 255) {
                size.writeUInt8 = size.writeUInt8(dataBuffer.length + 1, 0);
                return Buffer.concat([size, dataBuffer], size.length + dataBuffer.length);
            }
            else{
                return Buffer.concat([size, dataBuffer], size.length + (dataBuffer.length + 1));
            }
            //SIZE -> DATA
        }
    }

}